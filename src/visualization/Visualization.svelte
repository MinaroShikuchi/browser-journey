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
  
  // Filter values
  let searchDomain = '';
  let startDate = '';
  let endDate = '';
  let hideSinglePage = false;
  
  // Detail panel
  let showDetailPanel = false;
  let detailNode = null;
  
  // Dimensions
  let width = window.innerWidth - 250;
  let height = window.innerHeight - 100;

  onMount(async () => {
    setTodayDateFilter();
    loadPinnedPaths();
    await loadClosedTabs();
    await loadActiveTabs();
    await initAI();
    await loadAndRenderGraph();
    updateStats();
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  });

  /**
   * Initialize Chrome Built-in AI
   */
  async function initAI() {
    try {
      // Check if the AI API is available
      if (!window.LanguageModel) {
        console.warn('Chrome Built-in AI not available');
        return;
      }

      // Check availability
      const availability = await LanguageModel.availability();
      if (availability === 'unavailable') {
        console.warn('AI model not available');
        return;
      }

      if (availability === 'after-download') {
        console.log('AI model will be available after download');
      }

      // Get model parameters
      const params = await LanguageModel.params();
      
      // Create AI session with slightly higher temperature for creative titles
      aiSession = await LanguageModel.create({
        temperature: Math.min(params.defaultTemperature * 1.2, params.maxTemperature),
        topK: params.defaultTopK
      });
      
      console.log('Chrome Built-in AI initialized successfully');
    } catch (error) {
      console.warn('Failed to initialize AI:', error);
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
      console.warn('AI title generation failed:', error);
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

  function getPathStatus(path) {
    // Check if ANY page in this path is currently open in a tab
    // We check by URL since tab IDs change when tabs are closed/reopened
    const activeTabsArray = Array.from(activeTabs.values());
    
    for (const node of path.nodes) {
      const matchingTab = activeTabsArray.find(tab => tab.url === node.url);
      if (matchingTab) {
        return {
          isOpen: true,
          isClosed: false,
          tabId: matchingTab.id,
          activeTab: matchingTab
        };
      }
    }
    
    // No matching tabs found - path is closed
    return {
      isOpen: false,
      isClosed: true,
      tabId: null,
      activeTab: null
    };
  }

  async function continueJourney(tabId) {
    try {
      const tab = activeTabs.get(tabId);
      if (tab) {
        // Switch to the tab's window first
        await chrome.windows.update(tab.windowId, { focused: true });
        // Then activate the tab
        await chrome.tabs.update(tabId, { active: true });
      }
    } catch (error) {
      console.error('Error continuing journey:', error);
      alert('Could not switch to tab. It may have been closed.');
      // Reload active tabs to update status
      await loadActiveTabs();
    }
  }

  async function loadAndRenderGraph() {
    loading = true;
    showEmpty = false;
    
    try {
      const visits = await dataManager.getVisits(currentFilters);

      if (visits.length === 0) {
        showEmpty = true;
        loading = false;
        return;
      }

      prepareGraphData(visits);
      loading = false;
    } catch (error) {
      console.error('Error loading graph:', error);
      loading = false;
    }
  }

  function prepareGraphData(visits) {
    const urlToNode = new Map();
    
    visits.forEach(visit => {
      if (!urlToNode.has(visit.url)) {
        urlToNode.set(visit.url, {
          id: visit.url,
          url: visit.url,
          domain: visit.domain,
          title: visit.title,
          firstVisit: visit.timestamp,
          lastVisit: visit.timestamp,
          visitCount: 1,
          radius: 15
        });
      } else {
        const node = urlToNode.get(visit.url);
        node.visitCount++;
        node.lastVisit = Math.max(node.lastVisit, visit.timestamp);
        node.firstVisit = Math.min(node.firstVisit, visit.timestamp);
        node.radius = 15 + Math.log(node.visitCount) * 5;
      }
    });

    nodes = Array.from(urlToNode.values());

    const linkSet = new Set();
    links = [];
    
    visits.forEach(visit => {
      if (visit.fromDomain) {
        const sourceVisits = visits.filter(v => 
          v.domain === visit.fromDomain && 
          v.timestamp < visit.timestamp &&
          v.tabId === visit.tabId
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

  function reopenUrl(url) {
    chrome.tabs.create({ url });
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
        <h3>Browsing Paths</h3>
        
        <button on:click={showAllPaths} class="show-all-btn" class:active={currentPathIndex === -1}>
          <span class="material-icons">view_module</span> Show All Paths
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
                <span class="status-indicator-top" title="Journey active (tab open)"></span>
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
                {#if pathStatus.isOpen}
                  <button class="continue-btn" on:click|stopPropagation={() => continueJourney(pathStatus.tabId)}>
                    <span class="material-icons">open_in_browser</span>
                    <span class="tooltip">Switch to active tab</span>
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
        <Graph {nodes} {links} {width} {height} onNodeClick={handleNodeClick} />
      {/if}
    </div>

    {#if showDetailPanel && detailNode}
      <div class="detail-panel">
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
                <button class="reopen-btn" on:click={() => reopenUrl(detailNode.url)}>Reopen</button>
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
    width: 250px;
    background: var(--surface);
    border-right: 2px solid var(--border);
    overflow-y: auto;
    padding: 15px;
  }

  .path-side-menu h3 {
    margin-top: 0;
    color: var(--text);
    font-size: 16px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 10px;
    margin-bottom: 15px;
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
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #4CAF50;
    box-shadow: 0 0 4px rgba(76, 175, 80, 0.6);
    z-index: 1;
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
  .continue-btn,
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
  .continue-btn .material-icons,
  .delete-btn .material-icons {
    font-size: 14px;
  }

  .pin-btn.pinned {
    background: #FFD700;
  }

  .continue-btn {
    background: #4CAF50;
  }

  .continue-btn:hover {
    background: #66BB6A;
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
  .continue-btn:hover .tooltip,
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
    width: 350px;
    background: var(--surface);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
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
</style>