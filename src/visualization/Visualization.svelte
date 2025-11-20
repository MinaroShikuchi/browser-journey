<script>
  import { onMount } from 'svelte';
  import Graph from './Graph.svelte';
  import { dataManager } from '../lib/dataManager.js';
  import { formatDate, formatRelativeTime, escapeHtml, getPrimaryDomain } from '../lib/utils.js';

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
  let closedTabs = {};
  let activeTabs = new Map(); // Map of tabId -> tab info
  let showInfoModal = false;
  let infoData = null;
  
  // Filter values
  let searchDomain = '';
  let startDate = '';
  let endDate = '';
  let hideSinglePage = false;
  let filterPreferencesLoaded = false;
  
  // Load saved filter preferences
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
  
  // Save filter preferences
  async function saveFilterPreferences() {
    if (!filterPreferencesLoaded) return; // Don't save during initial load
    
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
  
  // Watch for changes to hideSinglePage and save
  $: if (filterPreferencesLoaded && hideSinglePage !== undefined) {
    saveFilterPreferences();
  }
  
  // Detail panel
  let showDetailPanel = false;
  let detailNode = null;
  let detailPanelWidth = 350; // Default width
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
    await initAI();
    await loadAndRenderGraph();
    updateStats();
    
    // Listen for storage changes to auto-refresh
    const storageListener = (changes, areaName) => {
      if (areaName === 'local' && (changes.visits || changes.domains || changes.transitions)) {
        handleStorageChange();
      }
    };
    chrome.storage.onChanged.addListener(storageListener);
    
    // Listen for tab removal to update active tab indicators
    const tabRemovedListener = async (tabId) => {
      // Reload active tabs to update status indicators
      await loadActiveTabs();
      // Update isOpen property on all nodes
      updateNodeTabStatus();
      // Trigger reactivity to update UI
      activeTabs = activeTabs;
      paths = paths;
      nodes = nodes;
    };
    chrome.tabs.onRemoved.addListener(tabRemovedListener);
    
    // Listen for tab updates to catch when tabs are activated/deactivated
    const tabUpdatedListener = async (tabId, changeInfo, tab) => {
      // Only update if URL changed (actual navigation, not just activation)
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

  /**
   * Handle storage changes - refresh the visualization
   */
  async function handleStorageChange() {
    // Invalidate cache to get fresh data
    dataManager.invalidateCache();
    
    // Reload active tabs to update status indicators
    await loadActiveTabs();
    
    // Reload and render the graph, preserving current path
    await loadAndRenderGraph(true);
    
    // Update stats
    updateStats();
  }

  /**
   * Initialize Chrome Built-in AI
   */
  async function initAI() {
    try {
      // Check if the AI API is available
      if (!window.LanguageModel) {
        return;
      }

      // Check availability
      const availability = await LanguageModel.availability();
      if (availability === 'unavailable') {
        return;
      }

      // Get model parameters
      const params = await LanguageModel.params();
      
      // Create AI session with slightly higher temperature for creative titles
      aiSession = await LanguageModel.create({
        temperature: Math.min(params.defaultTemperature * 1.2, params.maxTemperature),
        topK: params.defaultTopK
      });
    } catch (error) {
      // AI initialization failed, will fall back to domain names
    }
  }

  /**
   * Generate a descriptive title for a path using AI
   */
  async function generatePathTitle(path) {
    // Check if we already have a cached title
    const pathKey = path.nodes.map(n => n.url).join('|');
    if (pathTitles.has(pathKey)) {
      return pathTitles.get(pathKey);
    }

    // Fallback to primary domain if AI is not available
    if (!aiSession) {
      return getPrimaryDomain(path);
    }

    try {
      // Prepare context for AI
      const pageTitles = path.nodes
        .map(n => n.title || n.domain)
        .filter(t => t && t.trim())
        .slice(0, 5); // Limit to first 5 pages
      
      const domains = [...new Set(path.nodes.map(n => n.domain))];
      
      const prompt = `Create a short, descriptive title (max 4 words) for this browsing session:
Pages visited: ${pageTitles.join(', ')}
Domains: ${domains.join(', ')}

Reply with ONLY the title, no explanation.`;

      const result = await aiSession.prompt(prompt);
      const title = result.trim().replace(/^["']|["']$/g, ''); // Remove quotes if present
      
      // Cache the result
      pathTitles.set(pathKey, title);
      
      return title;
    } catch (error) {
      // AI title generation failed, fall back to domain
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
        // Store by both tab ID and URL for flexible lookup
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
    // Update isOpen property on all nodes based on current activeTabs
    const activeTabsArray = Array.from(activeTabs.values());
    
    // Update nodes in the current view
    nodes.forEach(node => {
      const matchingTab = activeTabsArray.find(tab => tab.url === node.url);
      node.isOpen = !!matchingTab;
      node.tabId = matchingTab?.id;
    });
    
    // Update nodes in all paths
    paths.forEach(path => {
      path.nodes.forEach(node => {
        const matchingTab = activeTabsArray.find(tab => tab.url === node.url);
        node.isOpen = !!matchingTab;
        node.tabId = matchingTab?.id;
      });
    });
    
    // Update allNodes
    allNodes.forEach(node => {
      const matchingTab = activeTabsArray.find(tab => tab.url === node.url);
      node.isOpen = !!matchingTab;
      node.tabId = matchingTab?.id;
    });
  }

  function getPathStatus(path) {
    // Check if ANY page in this path is currently open in a tab
    // We check by URL since tab IDs change when tabs are closed/reopened
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
    
    // No matching tabs found - path is closed
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
      // Get all tab IDs that match URLs in this path
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
      
      // Close all tabs
      await chrome.tabs.remove(tabsToClose);
      
      // Reload active tabs to update UI
      await loadActiveTabs();
      
      // Trigger reactivity to update path status indicators
      paths = paths;
    } catch (error) {
      console.error('Error closing journey tabs:', error);
      alert('Failed to close some tabs. They may have already been closed.');
      // Reload active tabs to update status
      await loadActiveTabs();
    }
  }

  async function loadAndRenderGraph(preserveCurrentPath = false) {
    loading = true;
    showEmpty = false;
    
    // Save the current path index and identify the current path by its first node URL
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
        // Clear all data when there are no visits
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

      prepareGraphData(visits);
      
      // Restore the current path if requested
      if (preserveCurrentPath && currentPathFirstUrl) {
        // Find the path with the same first node URL
        const matchingPathIndex = paths.findIndex(path =>
          path.nodes.length > 0 && path.nodes[0].url === currentPathFirstUrl
        );
        
        if (matchingPathIndex >= 0) {
          // Path still exists, switch to it
          await switchToPath(matchingPathIndex);
        } else if (savedPathIndex === -1) {
          // Was showing all paths, keep showing all
          showAllPaths();
        } else if (paths.length > 0) {
          // Path was deleted or changed, show the first path
          await switchToPath(0);
        }
      }
      
      loading = false;
    } catch (error) {
      console.error('Error loading graph:', error);
      loading = false;
    }
  }

  function prepareGraphData(visits) {
    const urlToNode = new Map();
    const activeTabsArray = Array.from(activeTabs.values());
    
    visits.forEach(visit => {
      if (!urlToNode.has(visit.url)) {
        // Check if this URL is currently open in a tab
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
        
        // Update tab status
        const matchingTab = activeTabsArray.find(tab => tab.url === visit.url);
        node.isOpen = !!matchingTab;
        node.tabId = matchingTab?.id;
      }
    });

    nodes = Array.from(urlToNode.values());

    const linkSet = new Set();
    links = [];
    
    visits.forEach(visit => {
      // Use fromUrl if available (new tracking), otherwise fall back to fromDomain (old data)
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
        // Fallback for old data that only has fromDomain
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
    
    if (paths.length > 0) {
      switchToPath(0);
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

  async function switchToPath(index) {
    if (index < 0 || index >= paths.length) return;
    
    currentPathIndex = index;
    const path = paths[index];
    
    nodes = path.nodes;
    links = path.links;
    
    // Generate AI title for this path (will use cache if already generated)
    if (aiSession && path.nodes.length > 0) {
      await generatePathTitle(path);
      // Trigger reactivity to update the UI
      paths = paths;
    }
  }

  function showAllPaths() {
    nodes = allNodes;
    links = allLinks;
    currentPathIndex = -1;
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
    if (searchDomain) {
      currentFilters.search = searchDomain;
    }

    await loadAndRenderGraph();
    updateStats();
  }

  async function resetFilters() {
    const today = new Date().toISOString().split('T')[0];
    startDate = today;
    endDate = today;
    searchDomain = '';
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
    pinnedPaths = pinnedPaths; // Trigger reactivity
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
    // Constrain between 300px and 800px
    detailPanelWidth = Math.max(300, Math.min(800, newWidth));
  }

  async function openOrNavigateToUrl(url) {
    // Check if this URL is already open in a tab
    const activeTabsArray = Array.from(activeTabs.values());
    const matchingTab = activeTabsArray.find(tab => tab.url === url);
    
    if (matchingTab) {
      // Tab exists, navigate to it
      try {
        await chrome.windows.update(matchingTab.windowId, { focused: true });
        await chrome.tabs.update(matchingTab.id, { active: true });
      } catch (error) {
        console.error('Error navigating to tab:', error);
        // Tab might have been closed, create a new one
        chrome.tabs.create({ url });
        await loadActiveTabs();
      }
    } else {
      // Tab doesn't exist, create a new one
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
        
        // Get current data
        const data = await dataManager.getAllData();
        const allVisits = data.visits || [];
        
        // Convert journey nodes to visits
        const newVisits = [];
        journeyData.journey.nodes.forEach(node => {
          // Check if this URL already exists
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
        
        // Add links as additional visits with fromUrl
        journeyData.journey.links.forEach(link => {
          const sourceNode = journeyData.journey.nodes.find(n => n.url === link.source);
          const targetNode = journeyData.journey.nodes.find(n => n.url === link.target);
          
          if (sourceNode && targetNode) {
            newVisits.push({
              url: targetNode.url,
              domain: targetNode.domain,
              title: targetNode.title,
              timestamp: targetNode.firstVisit + 1, // Slightly after first visit
              fromDomain: sourceNode.domain,
              fromUrl: sourceNode.url
            });
          }
        });
        
        if (newVisits.length === 0) {
          alert('All pages from this journey already exist in your history');
          return;
        }
        
        // Merge with existing visits
        const mergedVisits = [...allVisits, ...newVisits];
        
        // Update domains
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
        
        // Update transitions
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
        
        // Save to storage
        await chrome.storage.local.set({
          visits: mergedVisits,
          domains: domains,
          transitions: transitions
        });
        
        // Refresh the visualization
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
      // Get storage usage
      const storageData = await chrome.storage.local.get(null);
      const storageSize = new Blob([JSON.stringify(storageData)]).size;
      
      // Get statistics
      const stats = await dataManager.getStats();
      
      // Get version from manifest
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

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} bytes`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
</script>

<div class="app-container">
  <header class="header">
    <div class="header-left">
      <button on:click={toggleSideMenu} class="btn btn-secondary" title="Toggle Side Menu">
        <span class="material-icons">menu</span>
      </button>
      <h1><span class="material-icons" style="vertical-align: middle;">map</span> Browser Journey</h1>
      
      <div class="header-filters">
        <div class="filter-group">
          <label for="searchDomain"><span class="material-icons">search</span></label>
          <input type="text" id="searchDomain" bind:value={searchDomain} placeholder="Search..." />
        </div>

        <div class="filter-group">
          <label for="startDate"><span class="material-icons">calendar_today</span></label>
          <input type="date" id="startDate" bind:value={startDate} />
        </div>

        <div class="filter-group">
          <label for="endDate">to</label>
          <input type="date" id="endDate" bind:value={endDate} />
        </div>

        <div class="filter-group">
          <input type="checkbox" id="hideSinglePage" bind:checked={hideSinglePage} />
          <label for="hideSinglePage" style="cursor: pointer;">Hide single pages</label>
        </div>

        <button on:click={applyFilters} class="btn btn-primary btn-sm">Apply</button>
        <button on:click={resetFilters} class="btn btn-secondary btn-sm">Reset</button>
      </div>
    </div>
    
    <div class="header-right">
      <button on:click={showInfo} class="btn btn-secondary" title="Information">
        <span class="material-icons">info</span>
      </button>
      <button on:click={exportJSON} class="btn btn-secondary" title="Export as JSON">
        <span class="material-icons">file_download</span>
      </button>
      <button on:click={clearHistory} class="btn btn-danger" title="Clear History">
        <span class="material-icons">delete</span>
      </button>
      <button on:click={refresh} class="btn btn-primary" title="Refresh Graph">
        <span class="material-icons">refresh</span>
      </button>
    </div>
  </header>

  <div class="main-content">
    {#if !sideMenuCollapsed}
      <div class="path-side-menu">
        <button on:click={importJourney} class="import-journey-btn" title="Import a journey from JSON file">
          <span class="material-icons">file_upload</span> Import Journey
        </button>
        
        <button on:click={showAllPaths} class="show-all-btn" class:active={currentPathIndex === -1}>
          <span class="material-icons">view_module</span> Show All Journeys
        </button>
        
        <div class="path-items">
          {#each paths as path, index}
            {@const isActive = index === currentPathIndex}
            {@const isPinned = pinnedPaths.has(index)}
            {@const pathStatus = getPathStatus(path)}
            {@const pathKey = path.nodes.map(n => n.url).join('|')}
            {@const aiTitle = pathTitles.get(pathKey)}
            {@const displayTitle = (isActive && aiTitle) ? aiTitle : getPrimaryDomain(path)}
            {@const isSinglePage = path.nodes.length === 1}
            {#if !hideSinglePage || !isSinglePage}
            <div class="path-item-wrapper" class:pinned={isPinned}>
              {#if pathStatus.isOpen}
                <span class="status-indicator-top" title="Journey active ({pathStatus.activeCount} tab{pathStatus.activeCount > 1 ? 's' : ''} open)">
                  {pathStatus.activeCount}
                </span>
              {/if}
              <div
                class="path-item"
                class:active={isActive}
                on:click={() => switchToPath(index)}
                on:keydown={(e) => e.key === 'Enter' && switchToPath(index)}
                role="button"
                tabindex="0"
              >
                <div class="path-title">
                  {#if isPinned}<span class="pin-icon">📌</span>{/if}
                  {displayTitle}
                </div>
                <div class="path-meta">
                  <span class="material-icons">description</span> {path.nodes.length} page{path.nodes.length > 1 ? 's' : ''}
                </div>
                <div class="path-meta">
                  <span class="material-icons">schedule</span> {formatRelativeTime(path.nodes[0].firstVisit)}
                </div>
              </div>
              <div class="action-buttons">
                <button class="pin-btn" class:pinned={isPinned} on:click|stopPropagation={() => togglePinPath(index)}>
                  <span class="material-icons">push_pin</span>
                  <span class="tooltip">{isPinned ? 'Unpin path' : 'Pin path to top'}</span>
                </button>
                <button class="share-btn" on:click|stopPropagation={() => exportJourney(index)}>
                  <span class="material-icons">share</span>
                  <span class="tooltip">Export this journey</span>
                </button>
                {#if pathStatus.isOpen}
                  <button class="close-tabs-btn" on:click|stopPropagation={() => closeJourneyTabs(path)}>
                    <span class="material-icons">close</span>
                    <span class="tooltip">Close all tabs in this journey</span>
                  </button>
                {/if}
                <button class="delete-btn" on:click|stopPropagation={() => deletePath(index)}>
                  <span class="material-icons">delete</span>
                  <span class="tooltip">Delete this path</span>
                </button>
              </div>
            </div>
            {/if}
          {/each}
        </div>
      </div>
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

    {#if showDetailPanel && detailNode}
      <div class="detail-panel" style="width: {detailPanelWidth}px;">
        <div class="resize-handle" on:mousedown={startResizingDetailPanel} on:keydown={(e) => {}} role="separator" aria-label="Resize detail panel" tabindex="0"></div>
        <div class="panel-header">
          <div class="panel-title">
            <img src="https://www.google.com/s2/favicons?domain={detailNode.domain}&sz=32" alt="" class="domain-favicon" />
            <h3>{detailNode.title || detailNode.url}</h3>
          </div>
          <button on:click={closeDetailPanel} class="close-btn">×</button>
        </div>

        <div class="panel-content">
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">Visits</div>
              <div class="stat-value">{detailNode.visitCount}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">First</div>
              <div class="stat-value">{formatDate(detailNode.firstVisit).split(',')[0]}</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Last</div>
              <div class="stat-value">{formatDate(detailNode.lastVisit).split(',')[0]}</div>
            </div>
          </div>

          <div class="visits-section">
            <h4>Page Details</h4>
            <div class="visit-item">
              <div class="visit-title">{detailNode.title}</div>
              <div class="visit-url">{detailNode.url}</div>
              <div class="visit-meta">
                <span class="visit-time">First: {formatRelativeTime(detailNode.firstVisit)} | Last: {formatRelativeTime(detailNode.lastVisit)}</span>
                <button class="reopen-btn" on:click={() => openOrNavigateToUrl(detailNode.url)}>Open</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <footer class="footer">
    <div class="stats-bar">
      <span>{statsInfo}</span>
    </div>
  </footer>

  {#if showInfoModal && infoData}
    <div class="modal-overlay" on:click={closeInfoModal} on:keydown={(e) => e.key === 'Escape' && closeInfoModal()} role="button" tabindex="-1">
      <div class="modal-content" on:click|stopPropagation on:keydown={(e) => {}} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-header">
          <h2 id="modal-title"><span class="material-icons" style="vertical-align: middle;">info</span> Browser Journey Info</h2>
          <button on:click={closeInfoModal} class="modal-close-btn">×</button>
        </div>
        
        <div class="modal-body">
          <div class="info-section">
            <h3>Version</h3>
            <p class="info-value">v{infoData.version}</p>
          </div>

          <div class="info-section">
            <h3>Storage Usage</h3>
            <p class="info-value">{formatBytes(infoData.storageSizeBytes)}</p>
            <p class="info-detail">{infoData.storageSizeKB} KB / {infoData.storageSizeMB} MB</p>
          </div>

          <div class="info-section">
            <h3>Statistics</h3>
            <table class="info-stats-table">
              <tbody>
                <tr>
                  <td class="stat-label">Total Visits</td>
                  <td class="stat-value">{infoData.totalVisits.toLocaleString()}</td>
                </tr>
                <tr>
                  <td class="stat-label">Unique Domains</td>
                  <td class="stat-value">{infoData.totalDomains.toLocaleString()}</td>
                </tr>
                <tr>
                  <td class="stat-label">Transitions</td>
                  <td class="stat-value">{infoData.totalTransitions.toLocaleString()}</td>
                </tr>
                <tr>
                  <td class="stat-label">Today's Visits</td>
                  <td class="stat-value">{infoData.todayVisits.toLocaleString()}</td>
                </tr>
                {#if infoData.mostVisited}
                  <tr>
                    <td class="stat-label">Most Visited</td>
                    <td class="stat-value">{infoData.mostVisited} <span class="stat-detail">({infoData.mostVisitedCount} visits)</span></td>
                  </tr>
                {/if}
                {#if infoData.firstVisit}
                  <tr>
                    <td class="stat-label">First Visit</td>
                    <td class="stat-value">{formatDate(infoData.firstVisit).split(',')[0]}</td>
                  </tr>
                {/if}
                {#if infoData.lastVisit}
                  <tr>
                    <td class="stat-label">Last Visit</td>
                    <td class="stat-value">{formatDate(infoData.lastVisit).split(',')[0]}</td>
                  </tr>
                {/if}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<svelte:head>
  <link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons">
</svelte:head>

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(:root) {
    --primary: #4A90E2;
    --secondary: #7B68EE;
    --background: #1E1E1E;
    --surface: #2D2D2D;
    --surface-light: #3D3D3D;
    --text: #E0E0E0;
    --text-dim: #A0A0A0;
    --success: #4CAF50;
    --warning: #FF9800;
    --danger: #F44336;
    --border: #404040;
  }

  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background: var(--background);
    color: var(--text);
    overflow: hidden;
  }

  .app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px 20px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    z-index: 100;
    gap: 20px;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 30px;
    flex: 1;
  }

  .header h1 {
    font-size: 20px;
    font-weight: 600;
    white-space: nowrap;
  }

  .header-filters {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .header-right {
    display: flex;
    gap: 10px;
    flex-shrink: 0;
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .filter-group label {
    font-size: 12px;
    color: var(--text-dim);
    white-space: nowrap;
    display: flex;
    align-items: center;
  }

  .filter-group input[type="text"],
  .filter-group input[type="date"] {
    padding: 6px 10px;
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    font-size: 12px;
    min-width: 120px;
  }

  .filter-group input[type="checkbox"] {
    cursor: pointer;
    width: 16px;
    height: 16px;
    accent-color: var(--primary);
  }

  .btn {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .btn-sm {
    padding: 6px 12px;
    font-size: 12px;
  }

  .btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .btn-primary {
    background: var(--primary);
    color: white;
  }

  .btn-secondary {
    background: var(--surface-light);
    color: var(--text);
  }

  .btn-danger {
    background: var(--danger);
    color: white;
  }

  .main-content {
    display: flex;
    flex: 1;
    overflow: hidden;
    position: relative;
  }

  .path-side-menu {
    width: 300px;
    background: var(--surface);
    border-right: 2px solid var(--border);
    overflow-y: auto;
    padding: 15px;
    padding-top: 20px;
  }

  .import-journey-btn {
    width: 100%;
    padding: 8px;
    background: var(--primary);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    margin-bottom: 10px;
    transition: all 0.2s ease;
  }

  .import-journey-btn:hover {
    background: var(--secondary);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .show-all-btn {
    width: 100%;
    padding: 8px;
    background: var(--surface-light);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    margin-bottom: 15px;
  }

  .show-all-btn.active {
    background: #007ACC;
  }

  .path-items {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .path-item-wrapper {
    position: relative;
  }

  .path-item-wrapper.pinned {
    order: -1;
  }

  .path-item {
    padding: 10px;
    padding-bottom: 35px;
    background: var(--surface-light);
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.2s;
    border: 2px solid transparent;
  }

  .path-item.active {
    background: #007ACC;
    border-color: #00A3FF;
  }

  .path-item:hover:not(.active) {
    background: #505050;
  }

  .path-title {
    font-weight: bold;
    color: var(--text);
    font-size: 13px;
    margin-bottom: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .pin-icon {
    font-size: 14px;
    margin-right: 4px;
  }

  .status-indicator-top {
    position: absolute;
    top: 8px;
    right: 8px;
    min-width: 18px;
    height: 18px;
    border-radius: 9px;
    background: #4CAF50;
    box-shadow: 0 0 4px rgba(76, 175, 80, 0.6);
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: bold;
    color: white;
    padding: 0 4px;
  }

  .path-meta {
    font-size: 11px;
    color: var(--text-dim);
    margin-bottom: 3px;
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .path-meta .material-icons {
    font-size: 14px;
  }

  .action-buttons {
    position: absolute;
    bottom: 8px;
    right: 8px;
    display: flex;
    gap: 6px;
  }

  .pin-btn,
  .share-btn,
  .close-tabs-btn,
  .delete-btn {
    position: relative;
    background: #606060;
    color: white;
    border: none;
    border-radius: 3px;
    width: 24px;
    height: 24px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  }

  .pin-btn .material-icons,
  .share-btn .material-icons,
  .close-tabs-btn .material-icons,
  .delete-btn .material-icons {
    font-size: 14px;
  }

  .pin-btn.pinned {
    background: #FFD700;
  }

  .share-btn {
    background: #2196F3;
  }

  .share-btn:hover {
    background: #42A5F5;
  }

  .close-tabs-btn {
    background: #FF9800;
  }

  .close-tabs-btn:hover {
    background: #FFB74D;
  }

  .delete-btn {
    background: #CC3333;
  }

  .delete-btn:hover {
    background: #FF4444;
  }

  .tooltip {
    position: absolute;
    bottom: 100%;
    right: 0;
    margin-bottom: 8px;
    padding: 6px 10px;
    background: rgba(0, 0, 0, 0.9);
    color: white;
    font-size: 11px;
    white-space: nowrap;
    border-radius: 4px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s;
    z-index: 1000;
  }

  .tooltip::after {
    content: '';
    position: absolute;
    top: 100%;
    right: 8px;
    border: 4px solid transparent;
    border-top-color: rgba(0, 0, 0, 0.9);
  }

  .pin-btn:hover .tooltip,
  .share-btn:hover .tooltip,
  .close-tabs-btn:hover .tooltip,
  .delete-btn:hover .tooltip {
    opacity: 1;
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

  .detail-panel {
    position: relative;
    background: var(--surface);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .resize-handle {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    cursor: ew-resize;
    background: transparent;
    z-index: 10;
    transition: background 0.2s;
  }

  .resize-handle:hover {
    background: var(--primary);
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    border-bottom: 1px solid var(--border);
  }

  .panel-title {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .domain-favicon {
    width: 24px;
    height: 24px;
    border-radius: 4px;
  }

  .panel-header h3 {
    font-size: 18px;
    font-weight: 600;
    word-break: break-all;
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 28px;
    cursor: pointer;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s ease;
  }

  .close-btn:hover {
    background: var(--surface-light);
    color: var(--text);
  }

  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-bottom: 20px;
  }

  .stat-card {
    background: var(--background);
    padding: 12px;
    border-radius: 8px;
    text-align: center;
  }

  .stat-label {
    font-size: 11px;
    color: var(--text-dim);
    margin-bottom: 5px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .stat-value {
    font-size: 18px;
    font-weight: 600;
    color: var(--primary);
  }

  .visits-section h4 {
    font-size: 14px;
    margin-bottom: 15px;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .visit-item {
    background: var(--background);
    padding: 12px;
    border-radius: 6px;
    border-left: 3px solid var(--primary);
    transition: all 0.2s ease;
  }

  .visit-item:hover {
    background: var(--surface-light);
    transform: translateX(5px);
  }

  .visit-title {
    font-size: 13px;
    font-weight: 500;
    margin-bottom: 5px;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .visit-url {
    font-size: 11px;
    color: var(--text-dim);
    margin-bottom: 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .visit-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }

  .visit-time {
    font-size: 11px;
    color: var(--text-dim);
  }

  .reopen-btn {
    padding: 4px 10px;
    background: var(--primary);
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .reopen-btn:hover {
    background: var(--secondary);
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

  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  ::-webkit-scrollbar-track {
    background: var(--background);
  }

  ::-webkit-scrollbar-thumb {
    background: var(--surface-light);
    border-radius: 4px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: #4D4D4D;
  }

  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(4px);
  }

  .modal-content {
    background: var(--surface);
    border-radius: 12px;
    width: 90%;
    max-width: 600px;
    max-height: 80vh;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    border: 1px solid var(--border);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1px solid var(--border);
    background: var(--surface-light);
  }

  .modal-header h2 {
    font-size: 20px;
    font-weight: 600;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .modal-close-btn {
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 32px;
    cursor: pointer;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s ease;
  }

  .modal-close-btn:hover {
    background: var(--surface);
    color: var(--text);
  }

  .modal-body {
    padding: 24px;
    overflow-y: auto;
    max-height: calc(80vh - 80px);
  }

  .info-section {
    margin-bottom: 24px;
  }

  .info-section:last-child {
    margin-bottom: 0;
  }

  .info-section h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 12px;
  }

  .info-value {
    font-size: 24px;
    font-weight: 600;
    color: var(--primary);
    margin: 0;
  }

  .info-detail {
    font-size: 12px;
    color: var(--text-dim);
    margin: 4px 0 0 0;
  }

  .info-stats-table {
    width: 100%;
    border-collapse: collapse;
  }

  .info-stats-table tbody tr {
    border-bottom: 1px solid var(--border);
  }

  .info-stats-table tbody tr:last-child {
    border-bottom: none;
  }

  .info-stats-table .stat-label {
    padding: 12px 16px;
    font-size: 13px;
    color: var(--text-dim);
    text-align: left;
    font-weight: 500;
  }

  .info-stats-table .stat-value {
    padding: 12px 16px;
    font-size: 16px;
    font-weight: 600;
    color: var(--primary);
    text-align: right;
  }

  .info-stats-table .stat-detail {
    font-size: 11px;
    color: var(--text-dim);
    font-weight: normal;
  }
</style>