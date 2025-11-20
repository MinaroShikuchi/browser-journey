<script>
  import { onMount } from 'svelte';
  import Graph from './Graph.svelte';
  import Header from './components/Header.svelte';
  import JourneyList from './components/JourneyList.svelte';
  import DetailPanel from './components/DetailPanel.svelte';
  import InfoModal from './components/InfoModal.svelte';
  import { dataManager } from '../lib/dataManager.js';
  import { getPrimaryDomain } from '../lib/utils.js';

  let nodes = [];
  let links = [];
  let allNodes = [];
  let allLinks = [];
  let paths = [];
  let currentPathIndex = 0;
  let currentFilters = {};
  let selectedNode = null;
  let loading = true;
  let showEmpty = false;
  let statsInfo = 'Loading...';
  let sideMenuCollapsed = false;
  let pinnedPaths = new Set();
  let aiSession = null;
  let pathTitles = new Map();
  let pathTitlesAnimating = new Map();
  let closedTabs = {};
  let activeTabs = new Map();
  let showInfoModal = false;
  let infoData = null;
  
  // Filter values
  let journeySearchQuery = '';
  let startDate = '';
  let endDate = '';
  let hideSinglePage = false;
  let filterPreferencesLoaded = false;
  
  // Detail panel
  let showDetailPanel = false;
  let detailNode = null;
  let detailPanelWidth = 350;
  let isResizingDetailPanel = false;
  
  // Dimensions
  let width = window.innerWidth - 250;
  let height = window.innerHeight - 100;

  onMount(async () => {
    setTodayDateFilter();
    await loadFilterPreferences();
    loadPinnedPaths();
    await loadClosedTabs();
    await loadActiveTabs();
    await loadPathTitles();
    await initAI();
    await loadAndRenderGraph();
    updateStats();
    
    const storageListener = (changes, areaName) => {
      if (areaName === 'local' && (changes.visits || changes.domains || changes.transitions)) {
        handleStorageChange();
      }
    };
    chrome.storage.onChanged.addListener(storageListener);
    
    const tabRemovedListener = async (tabId) => {
      await loadActiveTabs();
      updateNodeTabStatus();
      activeTabs = activeTabs;
      paths = paths;
      nodes = nodes;
    };
    chrome.tabs.onRemoved.addListener(tabRemovedListener);
    
    const tabUpdatedListener = async (tabId, changeInfo, tab) => {
      if (changeInfo.url) {
        await loadActiveTabs();
        updateNodeTabStatus();
        activeTabs = activeTabs;
        paths = paths;
        nodes = nodes;
      }
    };
    chrome.tabs.onUpdated.addListener(tabUpdatedListener);
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', resizeDetailPanel);
    window.addEventListener('mouseup', stopResizingDetailPanel);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', resizeDetailPanel);
      window.removeEventListener('mouseup', stopResizingDetailPanel);
      chrome.storage.onChanged.removeListener(storageListener);
      chrome.tabs.onRemoved.removeListener(tabRemovedListener);
      chrome.tabs.onUpdated.removeListener(tabUpdatedListener);
    };
  });

  async function handleStorageChange() {
    dataManager.invalidateCache();
    await loadActiveTabs();
    await loadAndRenderGraph(true);
    updateStats();
  }

  async function initAI() {
    try {
      if (!window.LanguageModel) return;
      const availability = await LanguageModel.availability();
      if (availability === 'unavailable') return;
      const params = await LanguageModel.params();
      aiSession = await LanguageModel.create({
        temperature: Math.min(params.defaultTemperature * 1.2, params.maxTemperature),
        topK: params.defaultTopK
      });
    } catch (error) {}
  }

  async function loadPathTitles() {
    try {
      const result = await chrome.storage.local.get(['pathTitles']);
      if (result.pathTitles) {
        pathTitles = new Map(Object.entries(result.pathTitles));
      }
    } catch (error) {
      console.error('Error loading path titles:', error);
    }
  }

  async function savePathTitles() {
    try {
      const titlesObject = Object.fromEntries(pathTitles);
      await chrome.storage.local.set({ pathTitles: titlesObject });
    } catch (error) {
      console.error('Error saving path titles:', error);
    }
  }

  async function animateTitle(pathKey, fullTitle) {
    const chars = fullTitle.split('');
    let currentText = '';
    pathTitlesAnimating.set(pathKey, true);
    pathTitles.set(pathKey, '');
    paths = paths;
    
    for (let i = 0; i < chars.length; i++) {
      currentText += chars[i];
      pathTitles.set(pathKey, currentText);
      paths = paths;
      const delay = chars[i] === ' ' ? 30 : 50;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    pathTitlesAnimating.delete(pathKey);
    paths = paths;
  }

  async function generatePathTitle(path) {
    const pathKey = path.nodes.map(n => n.url).join('|');
    if (pathTitles.has(pathKey)) {
      return pathTitles.get(pathKey);
    }

    if (!aiSession) {
      return getPrimaryDomain(path);
    }

    try {
      const pageTitles = path.nodes
        .map(n => n.title || n.domain)
        .filter(t => t && t.trim())
        .slice(0, 5);
      
      const domains = [...new Set(path.nodes.map(n => n.domain))];
      
      const prompt = `Create a short, descriptive title (max 4 words) for this browsing session:
Pages visited: ${pageTitles.join(', ')}
Domains: ${domains.join(', ')}

Reply with ONLY the title, no explanation.`;

      const result = await aiSession.prompt(prompt);
      const title = result.trim().replace(/^["']|["']$/g, '');
      
      await animateTitle(pathKey, title);
      await savePathTitles();
      
      return title;
    } catch (error) {
      return getPrimaryDomain(path);
    }
  }

  function setTodayDateFilter() {
    const today = new Date().toISOString().split('T')[0];
    startDate = today;
    endDate = today;
  }

  function loadPinnedPaths() {
    try {
      const saved = localStorage.getItem('pinnedPaths');
      if (saved) {
        pinnedPaths = new Set(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Error loading pinned paths:', error);
    }
  }

  async function loadClosedTabs() {
    try {
      const result = await chrome.storage.local.get(['closedTabs']);
      closedTabs = result.closedTabs || {};
    } catch (error) {
      console.error('Error loading closed tabs:', error);
    }
  }

  async function loadActiveTabs() {
    try {
      const tabs = await chrome.tabs.query({});
      activeTabs = new Map();
      tabs.forEach(tab => {
        activeTabs.set(tab.id, {
          id: tab.id,
          url: tab.url,
          title: tab.title,
          windowId: tab.windowId
        });
      });
    } catch (error) {
      console.error('Error loading active tabs:', error);
    }
  }

  function updateNodeTabStatus() {
    const activeTabsArray = Array.from(activeTabs.values());
    
    nodes.forEach(node => {
      const matchingTab = activeTabsArray.find(tab => tab.url === node.url);
      node.isOpen = !!matchingTab;
      node.tabId = matchingTab?.id;
    });
    
    paths.forEach(path => {
      path.nodes.forEach(node => {
        const matchingTab = activeTabsArray.find(tab => tab.url === node.url);
        node.isOpen = !!matchingTab;
        node.tabId = matchingTab?.id;
      });
    });
    
    allNodes.forEach(node => {
      const matchingTab = activeTabsArray.find(tab => tab.url === node.url);
      node.isOpen = !!matchingTab;
      node.tabId = matchingTab?.id;
    });
  }

  function getPathStatus(path) {
    const activeTabsArray = Array.from(activeTabs.values());
    let activeCount = 0;
    let firstActiveTab = null;
    
    for (const node of path.nodes) {
      const matchingTab = activeTabsArray.find(tab => tab.url === node.url);
      if (matchingTab) {
        activeCount++;
        if (!firstActiveTab) {
          firstActiveTab = matchingTab;
        }
      }
    }
    
    if (activeCount > 0) {
      return {
        isOpen: true,
        isClosed: false,
        activeCount: activeCount,
        tabId: firstActiveTab.id,
        activeTab: firstActiveTab
      };
    }
    
    return {
      isOpen: false,
      isClosed: true,
      activeCount: 0,
      tabId: null,
      activeTab: null
    };
  }

  async function closeJourneyTabs(path) {
    try {
      const activeTabsArray = Array.from(activeTabs.values());
      const tabsToClose = [];
      
      for (const node of path.nodes) {
        const matchingTab = activeTabsArray.find(tab => tab.url === node.url);
        if (matchingTab) {
          tabsToClose.push(matchingTab.id);
        }
      }
      
      if (tabsToClose.length === 0) {
        alert('No active tabs found for this journey.');
        return;
      }
      
      const confirmMessage = `Close ${tabsToClose.length} tab${tabsToClose.length > 1 ? 's' : ''} from this journey?`;
      if (!confirm(confirmMessage)) {
        return;
      }
      
      await chrome.tabs.remove(tabsToClose);
      await loadActiveTabs();
      paths = paths;
    } catch (error) {
      console.error('Error closing journey tabs:', error);
      alert('Failed to close some tabs. They may have already been closed.');
      await loadActiveTabs();
    }
  }

  async function loadFilterPreferences() {
    try {
      const result = await chrome.storage.local.get(['filterPreferences']);
      if (result.filterPreferences) {
        if (result.filterPreferences.hideSinglePage !== undefined) {
          hideSinglePage = result.filterPreferences.hideSinglePage;
        }
      }
      filterPreferencesLoaded = true;
    } catch (error) {
      console.error('Error loading filter preferences:', error);
      filterPreferencesLoaded = true;
    }
  }

  async function saveFilterPreferences() {
    if (!filterPreferencesLoaded) return;
    
    try {
      await chrome.storage.local.set({
        filterPreferences: {
          hideSinglePage
        }
      });
    } catch (error) {
      console.error('Error saving filter preferences:', error);
    }
  }

  $: if (filterPreferencesLoaded && hideSinglePage !== undefined) {
    saveFilterPreferences();
  }

  async function loadAndRenderGraph(preserveCurrentPath = false) {
    loading = true;
    showEmpty = false;
    
    const savedPathIndex = currentPathIndex;
    let currentPathFirstUrl = null;
    if (preserveCurrentPath && currentPathIndex >= 0 && paths.length > currentPathIndex) {
      const currentPath = paths[currentPathIndex];
      if (currentPath.nodes.length > 0) {
        currentPathFirstUrl = currentPath.nodes[0].url;
      }
    }
    
    try {
      const visits = await dataManager.getVisits(currentFilters);

      if (visits.length === 0) {
        nodes = [];
        links = [];
        allNodes = [];
        allLinks = [];
        paths = [];
        currentPathIndex = 0;
        showEmpty = true;
        loading = false;
        return;
      }

      prepareGraphData(visits, preserveCurrentPath);
      
      if (preserveCurrentPath && currentPathFirstUrl) {
        const matchingPathIndex = paths.findIndex(path =>
          path.nodes.length > 0 && path.nodes[0].url === currentPathFirstUrl
        );
        
        if (matchingPathIndex >= 0) {
          await switchToPath(matchingPathIndex);
        } else if (savedPathIndex === -1) {
          showAllPaths();
        } else if (paths.length > 0) {
          await switchToPath(0);
        }
      }
      
      loading = false;
    } catch (error) {
      console.error('Error loading graph:', error);
      loading = false;
    }
  }

  function prepareGraphData(visits, preserveCurrentPath = false) {
    const urlToNode = new Map();
    const activeTabsArray = Array.from(activeTabs.values());
    
    visits.forEach(visit => {
      if (!urlToNode.has(visit.url)) {
        const matchingTab = activeTabsArray.find(tab => tab.url === visit.url);
        
        urlToNode.set(visit.url, {
          id: visit.url,
          url: visit.url,
          domain: visit.domain,
          title: visit.title,
          firstVisit: visit.timestamp,
          lastVisit: visit.timestamp,
          visitCount: 1,
          radius: 15,
          isOpen: !!matchingTab,
          tabId: matchingTab?.id
        });
      } else {
        const node = urlToNode.get(visit.url);
        node.visitCount++;
        node.lastVisit = Math.max(node.lastVisit, visit.timestamp);
        node.firstVisit = Math.min(node.firstVisit, visit.timestamp);
        node.radius = 15 + Math.log(node.visitCount) * 5;
        
        const matchingTab = activeTabsArray.find(tab => tab.url === visit.url);
        node.isOpen = !!matchingTab;
        node.tabId = matchingTab?.id;
      }
    });

    nodes = Array.from(urlToNode.values());

    const linkSet = new Set();
    links = [];
    
    visits.forEach(visit => {
      if (visit.fromUrl) {
        const sourceUrl = visit.fromUrl;
        const targetUrl = visit.url;
        
        if (sourceUrl !== targetUrl && urlToNode.has(sourceUrl)) {
          const linkKey = `${sourceUrl}→${targetUrl}`;
          if (!linkSet.has(linkKey)) {
            linkSet.add(linkKey);
            links.push({
              source: sourceUrl,
              target: targetUrl,
              width: 2
            });
          }
        }
      } else if (visit.fromDomain) {
        const sourceVisits = visits.filter(v =>
          v.domain === visit.fromDomain &&
          v.timestamp < visit.timestamp
        ).sort((a, b) => b.timestamp - a.timestamp);
        
        if (sourceVisits.length > 0) {
          const sourceUrl = sourceVisits[0].url;
          const targetUrl = visit.url;
          
          if (sourceUrl !== targetUrl) {
            const linkKey = `${sourceUrl}→${targetUrl}`;
            if (!linkSet.has(linkKey)) {
              linkSet.add(linkKey);
              links.push({
                source: sourceUrl,
                target: targetUrl,
                width: 2
              });
            }
          }
        }
      }
    });

    paths = separatePaths();
    allNodes = [...nodes];
    allLinks = [...links];
    
    if (paths.length > 0 && !preserveCurrentPath) {
      const params = new URLSearchParams(window.location.search);
      const journeyParam = params.get('journey');
      
      if (journeyParam !== null) {
        const journeyIndex = parseInt(journeyParam, 10);
        
        if (journeyIndex === -1) {
          showAllPaths();
        } else if (!isNaN(journeyIndex) && journeyIndex >= 0 && journeyIndex < paths.length) {
          switchToPath(journeyIndex, true);
        } else {
          switchToPath(0);
        }
      } else {
        switchToPath(0);
      }
    }
  }

  function separatePaths() {
    const pathList = [];
    const visited = new Set();
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    
    const adjacency = new Map();
    nodes.forEach(node => adjacency.set(node.id, { incoming: [], outgoing: [] }));
    links.forEach(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      adjacency.get(sourceId).outgoing.push(targetId);
      adjacency.get(targetId).incoming.push(sourceId);
    });

    nodes.forEach(node => {
      if (!visited.has(node.id)) {
        const path = { nodes: [], links: [] };
        const stack = [node.id];
        const pathNodes = new Set();
        
        while (stack.length > 0) {
          const currentId = stack.pop();
          if (visited.has(currentId)) continue;
          
          visited.add(currentId);
          pathNodes.add(currentId);
          path.nodes.push(nodeMap.get(currentId));
          
          const connections = adjacency.get(currentId);
          connections.incoming.forEach(id => {
            if (!visited.has(id)) stack.push(id);
          });
          connections.outgoing.forEach(id => {
            if (!visited.has(id)) stack.push(id);
          });
        }
        
        path.links = links.filter(link => {
          const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
          const targetId = typeof link.target === 'object' ? link.target.id : link.target;
          return pathNodes.has(sourceId) && pathNodes.has(targetId);
        });
        
        path.nodes.sort((a, b) => a.firstVisit - b.firstVisit);
        pathList.push(path);
      }
    });
    
    pathList.sort((a, b) => b.nodes[0].firstVisit - a.nodes[0].firstVisit);
    return pathList;
  }

  async function switchToPath(index, skipURLUpdate = false) {
    if (index < 0 || index >= paths.length) return;
    
    currentPathIndex = index;
    const path = paths[index];
    
    nodes = path.nodes;
    links = path.links;
    
    if (!skipURLUpdate) {
      updateURLWithJourney(index);
    }
    
    if (aiSession && path.nodes.length > 0) {
      await generatePathTitle(path);
      paths = paths;
    }
  }

  function showAllPaths() {
    nodes = allNodes;
    links = allLinks;
    currentPathIndex = -1;
    updateURLWithJourney(-1);
  }

  function updateURLWithJourney(index) {
    const url = new URL(window.location.href);
    if (index === -1) {
      url.searchParams.delete('journey');
    } else {
      url.searchParams.set('journey', index.toString());
    }
    window.history.replaceState({}, '', url);
  }

  async function applyFilters() {
    currentFilters = {};

    if (startDate) {
      currentFilters.startDate = new Date(startDate);
    }
    if (endDate) {
      currentFilters.endDate = new Date(endDate);
      currentFilters.endDate.setHours(23, 59, 59, 999);
    }

    await loadAndRenderGraph();
    updateStats();
  }

  async function resetFilters() {
    const today = new Date().toISOString().split('T')[0];
    startDate = today;
    endDate = today;
    hideSinglePage = false;

    currentFilters = {};
    await loadAndRenderGraph();
    updateStats();
  }

  async function refresh() {
    dataManager.invalidateCache();
    closeDetailPanel();
    await loadAndRenderGraph();
    updateStats();
  }

  async function exportJSON() {
    try {
      const data = await dataManager.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `browser-journey-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting JSON:', error);
      alert('Failed to export data');
    }
  }

  async function clearHistory() {
    if (!confirm('Are you sure you want to clear all browsing history? This cannot be undone.')) {
      return;
    }

    try {
      const result = await dataManager.clearHistory();
      if (result.success) {
        alert(result.message);
        closeDetailPanel();
        await loadAndRenderGraph();
        updateStats();
      } else {
        alert('Failed to clear history: ' + result.message);
      }
    } catch (error) {
      console.error('Error clearing history:', error);
      alert('Failed to clear history');
    }
  }

  async function updateStats() {
    try {
      const visits = await dataManager.getVisits(currentFilters);
      const uniqueDomains = new Set(visits.map(v => v.domain)).size;
      statsInfo = `${visits.length} page visits | ${uniqueDomains} unique domains | Showing your browsing journey`;
    } catch (error) {
      console.error('Error updating stats:', error);
    }
  }

  function handleNodeClick(node) {
    selectedNode = node;
    detailNode = node;
    showDetailPanel = true;
  }

  function closeDetailPanel() {
    showDetailPanel = false;
    selectedNode = null;
    detailNode = null;
  }

  function toggleSideMenu() {
    sideMenuCollapsed = !sideMenuCollapsed;
    width = sideMenuCollapsed ? window.innerWidth : window.innerWidth - 250;
  }

  function togglePinPath(index) {
    if (pinnedPaths.has(index)) {
      pinnedPaths.delete(index);
    } else {
      pinnedPaths.add(index);
    }
    pinnedPaths = pinnedPaths;
    localStorage.setItem('pinnedPaths', JSON.stringify([...pinnedPaths]));
  }

  async function deletePath(pathIndex) {
    if (pathIndex < 0 || pathIndex >= paths.length) return;
    
    const path = paths[pathIndex];
    const primaryDomain = getPrimaryDomain(path);
    
    if (!confirm(`Delete this browsing path?\n\nDomain: ${primaryDomain}\nPages: ${path.nodes.length}\n\nThis cannot be undone.`)) {
      return;
    }

    try {
      const data = await dataManager.getAllData();
      const allVisits = data.visits || [];
      
      const urlsToDelete = new Set(path.nodes.map(node => node.url));
      const remainingVisits = allVisits.filter(visit => !urlsToDelete.has(visit.url));
      
      const newDomains = {};
      const newTransitions = {};
      
      remainingVisits.forEach(visit => {
        if (!newDomains[visit.domain]) {
          newDomains[visit.domain] = {
            visitCount: 0,
            firstVisit: visit.timestamp,
            lastVisit: visit.timestamp,
            favicon: `https://www.google.com/s2/favicons?domain=${visit.domain}&sz=32`
          };
        }
        newDomains[visit.domain].visitCount++;
        if (visit.timestamp < newDomains[visit.domain].firstVisit) {
          newDomains[visit.domain].firstVisit = visit.timestamp;
        }
        if (visit.timestamp > newDomains[visit.domain].lastVisit) {
          newDomains[visit.domain].lastVisit = visit.timestamp;
        }

        if (visit.fromDomain && visit.fromDomain !== visit.domain) {
          const key = `${visit.fromDomain}->${visit.domain}`;
          if (!newTransitions[key]) {
            newTransitions[key] = { count: 0, lastVisit: visit.timestamp };
          }
          newTransitions[key].count++;
          if (visit.timestamp > newTransitions[key].lastVisit) {
            newTransitions[key].lastVisit = visit.timestamp;
          }
        }
      });
      
      await chrome.storage.local.set({
        visits: remainingVisits,
        domains: newDomains,
        transitions: newTransitions
      });
      
      const pathKey = path.nodes.map(n => n.url).join('|');
      if (pathTitles.has(pathKey)) {
        pathTitles.delete(pathKey);
        await savePathTitles();
      }
      
      dataManager.invalidateCache();
      closeDetailPanel();
      await loadAndRenderGraph();
      updateStats();
    } catch (error) {
      console.error('Error deleting path:', error);
      alert('Failed to delete path from history');
    }
  }

  function handleResize() {
    width = sideMenuCollapsed ? window.innerWidth : window.innerWidth - 250;
    height = window.innerHeight - 100;
  }

  function startResizingDetailPanel(e) {
    isResizingDetailPanel = true;
    e.preventDefault();
  }

  function stopResizingDetailPanel() {
    isResizingDetailPanel = false;
  }

  function resizeDetailPanel(e) {
    if (!isResizingDetailPanel) return;
    
    const newWidth = window.innerWidth - e.clientX;
    detailPanelWidth = Math.max(300, Math.min(800, newWidth));
  }

  async function openOrNavigateToUrl(url) {
    const activeTabsArray = Array.from(activeTabs.values());
    const matchingTab = activeTabsArray.find(tab => tab.url === url);
    
    if (matchingTab) {
      try {
        await chrome.windows.update(matchingTab.windowId, { focused: true });
        await chrome.tabs.update(matchingTab.id, { active: true });
      } catch (error) {
        console.error('Error navigating to tab:', error);
        chrome.tabs.create({ url });
        await loadActiveTabs();
      }
    } else {
      chrome.tabs.create({ url });
    }
  }

  async function exportJourney(pathIndex) {
    if (pathIndex < 0 || pathIndex >= paths.length) return;
    
    const path = paths[pathIndex];
    const journeyData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      journey: {
        nodes: path.nodes.map(node => ({
          url: node.url,
          domain: node.domain,
          title: node.title,
          firstVisit: node.firstVisit,
          lastVisit: node.lastVisit,
          visitCount: node.visitCount
        })),
        links: path.links.map(link => ({
          source: typeof link.source === 'object' ? link.source.id : link.source,
          target: typeof link.target === 'object' ? link.target.id : link.target
        }))
      }
    };
    
    const blob = new Blob([JSON.stringify(journeyData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const primaryDomain = getPrimaryDomain(path);
    a.download = `journey-${primaryDomain}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importJourney() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const journeyData = JSON.parse(text);
        
        if (!journeyData.version || !journeyData.journey) {
          alert('Invalid journey file format');
          return;
        }
        
        const data = await dataManager.getAllData();
        const allVisits = data.visits || [];
        
        const newVisits = [];
        journeyData.journey.nodes.forEach(node => {
          const existingVisit = allVisits.find(v => v.url === node.url);
          if (!existingVisit) {
            newVisits.push({
              url: node.url,
              domain: node.domain,
              title: node.title,
              timestamp: node.firstVisit,
              fromDomain: null,
              fromUrl: null
            });
          }
        });
        
        journeyData.journey.links.forEach(link => {
          const sourceNode = journeyData.journey.nodes.find(n => n.url === link.source);
          const targetNode = journeyData.journey.nodes.find(n => n.url === link.target);
          
          if (sourceNode && targetNode) {
            newVisits.push({
              url: targetNode.url,
              domain: targetNode.domain,
              title: targetNode.title,
              timestamp: targetNode.firstVisit + 1,
              fromDomain: sourceNode.domain,
              fromUrl: sourceNode.url
            });
          }
        });
        
        if (newVisits.length === 0) {
          alert('All pages from this journey already exist in your history');
          return;
        }
        
        const mergedVisits = [...allVisits, ...newVisits];
        
        const domains = data.domains || {};
        newVisits.forEach(visit => {
          if (!domains[visit.domain]) {
            domains[visit.domain] = {
              visitCount: 0,
              firstVisit: visit.timestamp,
              lastVisit: visit.timestamp,
              favicon: `https://www.google.com/s2/favicons?domain=${visit.domain}&sz=32`
            };
          }
          domains[visit.domain].visitCount++;
          if (visit.timestamp < domains[visit.domain].firstVisit) {
            domains[visit.domain].firstVisit = visit.timestamp;
          }
          if (visit.timestamp > domains[visit.domain].lastVisit) {
            domains[visit.domain].lastVisit = visit.timestamp;
          }
        });
        
        const transitions = data.transitions || {};
        newVisits.forEach(visit => {
          if (visit.fromDomain && visit.fromDomain !== visit.domain) {
            const key = `${visit.fromDomain}->${visit.domain}`;
            if (!transitions[key]) {
              transitions[key] = { count: 0, lastVisit: visit.timestamp };
            }
            transitions[key].count++;
            if (visit.timestamp > transitions[key].lastVisit) {
              transitions[key].lastVisit = visit.timestamp;
            }
          }
        });
        
        await chrome.storage.local.set({
          visits: mergedVisits,
          domains: domains,
          transitions: transitions
        });
        
        dataManager.invalidateCache();
        await loadAndRenderGraph();
        updateStats();
        
        alert(`Successfully imported journey with ${newVisits.length} new page(s)`);
      } catch (error) {
        console.error('Error importing journey:', error);
        alert('Failed to import journey: ' + error.message);
      }
    };
    
    input.click();
  }

  async function showInfo() {
    try {
      const storageData = await chrome.storage.local.get(null);
      const storageSize = new Blob([JSON.stringify(storageData)]).size;
      const stats = await dataManager.getStats();
      const manifest = chrome.runtime.getManifest();
      
      infoData = {
        version: manifest.version,
        storageSizeBytes: storageSize,
        storageSizeKB: (storageSize / 1024).toFixed(2),
        storageSizeMB: (storageSize / (1024 * 1024)).toFixed(2),
        ...stats
      };
      
      showInfoModal = true;
    } catch (error) {
      console.error('Error loading info:', error);
      alert('Failed to load information');
    }
  }

  function closeInfoModal() {
    showInfoModal = false;
  }
</script>

<div class="app-container">
  <Header
    bind:startDate
    bind:endDate
    bind:hideSinglePage
    {sideMenuCollapsed}
    onToggleSideMenu={toggleSideMenu}
    onApplyFilters={applyFilters}
    onResetFilters={resetFilters}
    onRefresh={refresh}
    onExportJSON={exportJSON}
    onClearHistory={clearHistory}
    onShowInfo={showInfo}
  />

  <div class="main-content">
    {#if !sideMenuCollapsed}
      <JourneyList
        {paths}
        {currentPathIndex}
        {pinnedPaths}
        {pathTitles}
        {pathTitlesAnimating}
        {hideSinglePage}
        bind:journeySearchQuery
        onSwitchToPath={switchToPath}
        onShowAllPaths={showAllPaths}
        onTogglePinPath={togglePinPath}
        onExportJourney={exportJourney}
        onCloseJourneyTabs={closeJourneyTabs}
        onDeletePath={deletePath}
        onImportJourney={importJourney}
        {getPathStatus}
      />
    {/if}

    <div class="graph-container" class:menu-collapsed={sideMenuCollapsed}>
      {#if loading}
        <div class="loading-indicator">
          <div class="spinner"></div>
          <p>Loading your journey...</p>
        </div>
      {:else if showEmpty}
        <div class="empty-state">
          <span class="material-icons empty-icon">language</span>
          <h2>No Data Yet</h2>
          <p>Start browsing to see your journey!</p>
        </div>
      {:else}
        <Graph {nodes} {links} {width} {height} {activeTabs} onNodeClick={handleNodeClick} />
      {/if}
    </div>

    {#if showDetailPanel}
      <DetailPanel
        {detailNode}
        {detailPanelWidth}
        onClose={closeDetailPanel}
        onOpenUrl={openOrNavigateToUrl}
        onStartResize={startResizingDetailPanel}
      />
    {/if}
  </div>

  <footer class="footer">
    <div class="stats-bar">
      <span>{statsInfo}</span>
    </div>
  </footer>

  {#if showInfoModal}
    <InfoModal {infoData} onClose={closeInfoModal} />
  {/if}
</div>

<svelte:head>
  <link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons">
</svelte:head>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    overflow: hidden;
  }

  .app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  .main-content {
    display: flex;
    flex: 1;
    overflow: hidden;
    position: relative;
  }

  .graph-container {
    flex: 1;
    position: relative;
    overflow: hidden;
    background: var(--background);
  }

  .graph-container.menu-collapsed {
    margin-left: 0;
  }

  .loading-indicator {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
  }

  .spinner {
    width: 50px;
    height: 50px;
    border: 4px solid var(--surface-light);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 20px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty-state {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
  }

  .empty-icon {
    font-size: 80px;
    margin-bottom: 20px;
    opacity: 0.5;
    display: block;
  }

  .footer {
    background: var(--surface);
    border-top: 1px solid var(--border);
    padding: 10px 20px;
  }

  .stats-bar {
    font-size: 12px;
    color: var(--text-dim);
  }

</style>