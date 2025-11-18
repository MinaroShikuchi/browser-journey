// Browser Journey - Visualization Script
// D3.js Network Graph Implementation

class BrowserJourneyViz {
  constructor() {
    this.svg = null;
    this.simulation = null;
    this.nodes = [];
    this.links = [];
    this.currentFilters = {};
    this.selectedNode = null;
    this.sideMenuCollapsed = false;
    this.pinnedPaths = new Set(); // Store pinned path indices
    this.tooltip = null;
    
    this.width = window.innerWidth - 250; // Account for side menu
    this.height = window.innerHeight - 100; // Account for header and footer (reduced from 150)
    
    this.init();
  }

  /**
   * Initialize the visualization
   */
  async init() {
    this.setupEventListeners();
    this.setTodayDateFilter();
    this.createTooltip();
    this.loadPinnedPaths();
    await this.loadAndRenderGraph();
    this.updateStats();
  }

  /**
   * Create tooltip element
   */
  createTooltip() {
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'node-tooltip';
    document.body.appendChild(this.tooltip);
  }

  /**
   * Set today's date as default filter
   */
  setTodayDateFilter() {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    document.getElementById('startDate').value = todayStr;
    document.getElementById('endDate').value = todayStr;
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Filter controls
    document.getElementById('applyFilters').addEventListener('click', () => this.applyFilters());
    document.getElementById('resetFilters').addEventListener('click', () => this.resetFilters());
    document.getElementById('searchDomain').addEventListener('input', (e) => this.debounce(() => this.searchDomains(e.target.value), 300));
    document.getElementById('hideSinglePage').addEventListener('change', (e) => this.filterSinglePagePaths(e.target.checked));

    // Action buttons
    document.getElementById('refreshGraph').addEventListener('click', () => this.refresh());
    document.getElementById('exportJSON').addEventListener('click', () => this.exportJSON());
    document.getElementById('clearHistory').addEventListener('click', () => this.clearHistory());
    document.getElementById('toggleSideMenu').addEventListener('click', () => this.toggleSideMenu());

    // Detail panel
    document.getElementById('closePanel').addEventListener('click', () => this.closeDetailPanel());

    // Window resize
    window.addEventListener('resize', () => this.debounce(() => this.handleResize(), 250));
  }

  /**
   * Load data and render graph
   */
  async loadAndRenderGraph() {
    this.showLoading(true);
    
    try {
      const visits = await dataManager.getVisits(this.currentFilters);

      if (visits.length === 0) {
        this.showEmptyState(true);
        this.showLoading(false);
        return;
      }

      this.showEmptyState(false);
      this.prepareGraphData(visits);
      this.renderGraph();
      this.showLoading(false);
    } catch (error) {
      console.error('Error loading graph:', error);
      this.showLoading(false);
    }
  }

  /**
   * Prepare graph data from individual visits
   */
  prepareGraphData(visits) {
    // Merge visits by URL into single nodes
    const urlToNode = new Map();
    const urlVisits = new Map();
    
    visits.forEach(visit => {
      if (!urlToNode.has(visit.url)) {
        // Create new node for this URL
        urlToNode.set(visit.url, {
          id: visit.url, // Use URL as ID for consistency
          url: visit.url,
          domain: visit.domain,
          title: visit.title,
          firstVisit: visit.timestamp,
          lastVisit: visit.timestamp,
          visitCount: 1,
          radius: 15
        });
        urlVisits.set(visit.url, [visit]);
      } else {
        // Update existing node
        const node = urlToNode.get(visit.url);
        node.visitCount++;
        node.lastVisit = Math.max(node.lastVisit, visit.timestamp);
        node.firstVisit = Math.min(node.firstVisit, visit.timestamp);
        // Increase radius based on visit count (logarithmic scale)
        node.radius = 15 + Math.log(node.visitCount) * 5;
        urlVisits.get(visit.url).push(visit);
      }
    });

    this.nodes = Array.from(urlToNode.values());

    // Create links based on navigation flow
    this.links = [];
    const linkSet = new Set(); // To avoid duplicate links
    
    visits.forEach(visit => {
      if (visit.fromDomain) {
        // Find the source URL from the fromDomain
        const sourceVisits = visits.filter(v => 
          v.domain === visit.fromDomain && 
          v.timestamp < visit.timestamp &&
          v.tabId === visit.tabId
        ).sort((a, b) => b.timestamp - a.timestamp);
        
        if (sourceVisits.length > 0) {
          const sourceVisit = sourceVisits[0];
          const sourceUrl = sourceVisit.url;
          const targetUrl = visit.url;
          
          // Only create link if source and target are different
          if (sourceUrl !== targetUrl) {
            const linkKey = `${sourceUrl}→${targetUrl}`;
            if (!linkSet.has(linkKey)) {
              linkSet.add(linkKey);
              this.links.push({
                source: sourceUrl,
                target: targetUrl,
                width: 2
              });
            }
          }
        }
      }
    });

    // Separate paths (connected components)
    this.paths = this.separatePaths();
    this.currentPathIndex = 0;
    
    // Store all nodes and links for path switching
    this.allNodes = [...this.nodes];
    this.allLinks = [...this.links];
    
    // Start with first path
    this.switchToPath(0);
  }

  /**
   * Separate the graph into distinct browsing paths
   */
  separatePaths() {
    const paths = [];
    const visited = new Set();
    const nodeMap = new Map(this.nodes.map(n => [n.id, n]));
    
    // Build adjacency list
    const adjacency = new Map();
    this.nodes.forEach(node => adjacency.set(node.id, { incoming: [], outgoing: [] }));
    this.links.forEach(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      adjacency.get(sourceId).outgoing.push(targetId);
      adjacency.get(targetId).incoming.push(sourceId);
    });

    // Find all connected components (paths)
    this.nodes.forEach(node => {
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
        
        // Get links for this path
        path.links = this.links.filter(link => {
          const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
          const targetId = typeof link.target === 'object' ? link.target.id : link.target;
          return pathNodes.has(sourceId) && pathNodes.has(targetId);
        });
        
        // Sort nodes in path by timestamp
        path.nodes.sort((a, b) => a.firstVisit - b.firstVisit);
        
        paths.push(path);
      }
    });
    
    // Sort paths by earliest visit
    paths.sort((a, b) => a.nodes[0].firstVisit - b.nodes[0].firstVisit);
    
    return paths;
  }

  /**
   * Switch to a specific path
   */
  switchToPath(index) {
    if (index < 0 || index >= this.paths.length) return;
    
    this.currentPathIndex = index;
    const path = this.paths[index];
    
    this.nodes = path.nodes;
    this.links = path.links;
    
    // Update path navigation UI
    this.updatePathNavigation();
  }

  /**
   * Update path navigation UI
   */
  updatePathNavigation() {
    // Create or update side menu
    let sideMenu = document.getElementById('pathSideMenu');
    
    if (!sideMenu) {
      sideMenu = document.createElement('div');
      sideMenu.id = 'pathSideMenu';
      sideMenu.style.cssText = `
        position: fixed;
        left: 0;
        top: 70px;
        width: 250px;
        height: calc(100vh - 120px);
        background: #2D2D2D;
        border-right: 2px solid #404040;
        overflow-y: auto;
        padding: 15px;
        z-index: 100;
      `;
      document.body.appendChild(sideMenu);
      
      // Adjust graph container to make room for menu
      const graphContainer = document.getElementById('graph');
      graphContainer.style.marginLeft = '250px';
      graphContainer.style.width = 'calc(100vw - 250px)';
    }
    
    // Build menu content
    let menuHTML = '<h3 style="margin-top: 0; color: #E0E0E0; font-size: 16px; border-bottom: 1px solid #404040; padding-bottom: 10px;">Browsing Paths</h3>';
    
    menuHTML += `
      <div style="margin-bottom: 15px;">
        <button id="showAllPaths" style="width: 100%; padding: 8px; background: ${this.currentPathIndex === -1 ? '#007ACC' : '#404040'}; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; display: flex; align-items: center; justify-content: center; gap: 5px;">
          <span class="material-icons" style="font-size: 18px;">view_module</span> Show All Paths
        </button>
      </div>
      <div style="border-bottom: 1px solid #404040; margin-bottom: 10px;"></div>
      <div id="pathItemsContainer" style="display: flex; flex-direction: column;">
    `;
    
    this.paths.forEach((path, index) => {
      const isActive = index === this.currentPathIndex;
      const isPinned = this.pinnedPaths.has(index);
      const firstNode = path.nodes[0];
      const lastNode = path.nodes[path.nodes.length - 1];
      const nodeCount = path.nodes.length;
      const timeAgo = this.formatRelativeTime(firstNode.firstVisit);
      
      // Get primary domain for this path (most visited)
      const domainCounts = new Map();
      path.nodes.forEach(node => {
        const count = domainCounts.get(node.domain) || 0;
        domainCounts.set(node.domain, count + 1);
      });
      const primaryDomain = Array.from(domainCounts.entries())
        .sort((a, b) => b[1] - a[1])[0][0];
      
      menuHTML += `
        <div class="path-item-wrapper" data-path-index="${index}" style="position: relative; margin-bottom: 8px; ${isPinned ? 'order: -1;' : ''}">
          <div class="path-item" style="
            padding: 10px;
            padding-right: 70px;
            background: ${isActive ? '#007ACC' : (isPinned ? '#505050' : '#404040')};
            border-radius: 4px;
            cursor: pointer;
            transition: background 0.2s;
            border: ${isActive ? '2px solid #00A3FF' : (isPinned ? '2px solid #FFD700' : '2px solid transparent')};
          ">
            <div style="font-weight: bold; color: #E0E0E0; font-size: 13px; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 5px;" title="${this.escapeHtml(primaryDomain)}">
              ${isPinned ? '<span class="material-icons" style="font-size: 14px; color: #FFD700;">push_pin</span>' : ''}
              ${this.escapeHtml(primaryDomain)}
            </div>
            <div style="font-size: 11px; color: #B0B0B0; margin-bottom: 3px; display: flex; align-items: center; gap: 3px;">
              <span class="material-icons" style="font-size: 14px;">description</span> ${nodeCount} page${nodeCount > 1 ? 's' : ''}
            </div>
            <div style="font-size: 11px; color: #B0B0B0; display: flex; align-items: center; gap: 3px;">
              <span class="material-icons" style="font-size: 14px;">schedule</span> ${timeAgo}
            </div>
          </div>
          <button class="pin-path-btn" data-path-index="${index}" style="
            position: absolute;
            top: 8px;
            right: 38px;
            background: ${isPinned ? '#FFD700' : '#606060'};
            color: white;
            border: none;
            border-radius: 3px;
            width: 24px;
            height: 24px;
            cursor: pointer;
            font-size: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
          " title="${isPinned ? 'Unpin' : 'Pin'} this path"><span class="material-icons" style="font-size: 16px;">push_pin</span></button>
          <button class="delete-path-btn" data-path-index="${index}" style="
            position: absolute;
            top: 8px;
            right: 8px;
            background: #CC3333;
            color: white;
            border: none;
            border-radius: 3px;
            width: 24px;
            height: 24px;
            cursor: pointer;
            font-size: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
          " title="Delete this path from history"><span class="material-icons" style="font-size: 16px;">delete</span></button>
        </div>
      `;
    });
    
    menuHTML += '</div>'; // Close pathItemsContainer
    
    sideMenu.innerHTML = menuHTML;
    
    // Add event listeners for path items
    document.querySelectorAll('.path-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const pathIndex = parseInt(e.currentTarget.parentElement.getAttribute('data-path-index'));
        this.switchToPath(pathIndex);
        this.renderGraph();
      });
      
      // Hover effect
      item.addEventListener('mouseenter', (e) => {
        const pathIndex = parseInt(e.currentTarget.parentElement.getAttribute('data-path-index'));
        const isPinned = this.pinnedPaths.has(pathIndex);
        if (pathIndex !== this.currentPathIndex) {
          e.currentTarget.style.background = isPinned ? '#606060' : '#505050';
        }
      });
      item.addEventListener('mouseleave', (e) => {
        const pathIndex = parseInt(e.currentTarget.parentElement.getAttribute('data-path-index'));
        const isPinned = this.pinnedPaths.has(pathIndex);
        if (pathIndex !== this.currentPathIndex) {
          e.currentTarget.style.background = isPinned ? '#505050' : '#404040';
        }
      });
    });
    
    // Add event listeners for pin buttons
    document.querySelectorAll('.pin-path-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pathIndex = parseInt(e.currentTarget.getAttribute('data-path-index'));
        this.togglePinPath(pathIndex);
      });
      btn.addEventListener('mouseenter', (e) => {
        const pathIndex = parseInt(e.currentTarget.getAttribute('data-path-index'));
        const isPinned = this.pinnedPaths.has(pathIndex);
        e.currentTarget.style.background = isPinned ? '#FFB700' : '#707070';
      });
      btn.addEventListener('mouseleave', (e) => {
        const pathIndex = parseInt(e.currentTarget.getAttribute('data-path-index'));
        const isPinned = this.pinnedPaths.has(pathIndex);
        e.currentTarget.style.background = isPinned ? '#FFD700' : '#606060';
      });
    });
    
    // Add event listeners for delete buttons
    document.querySelectorAll('.delete-path-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const pathIndex = parseInt(e.currentTarget.getAttribute('data-path-index'));
        await this.deletePath(pathIndex);
      });
      
      // Hover effect for delete button
      btn.addEventListener('mouseenter', (e) => {
        e.currentTarget.style.background = '#FF4444';
      });
      btn.addEventListener('mouseleave', (e) => {
        e.currentTarget.style.background = '#CC3333';
      });
    });
    
    document.getElementById('showAllPaths')?.addEventListener('click', () => {
      this.nodes = this.allNodes;
      this.links = this.allLinks;
      this.currentPathIndex = -1;
      this.updatePathNavigation();
      this.renderGraph();
    });
  }

  /**
   * Delete a specific path from history
   */
  async deletePath(pathIndex) {
    if (pathIndex < 0 || pathIndex >= this.paths.length) return;
    
    const path = this.paths[pathIndex];
    const nodeCount = path.nodes.length;
    const domainCounts = new Map();
    path.nodes.forEach(node => {
      const count = domainCounts.get(node.domain) || 0;
      domainCounts.set(node.domain, count + 1);
    });
    const primaryDomain = Array.from(domainCounts.entries())
      .sort((a, b) => b[1] - a[1])[0][0];
    
    if (!confirm(`Delete this browsing path?\n\nDomain: ${primaryDomain}\nPages: ${nodeCount}\n\nThis cannot be undone.`)) {
      return;
    }

    try {
      // Get all visits from storage
      const data = await dataManager.getAllData();
      const allVisits = data.visits || [];
      
      // Get URLs to delete from this path
      const urlsToDelete = new Set(path.nodes.map(node => node.url));
      
      // Filter out visits from this path
      const remainingVisits = allVisits.filter(visit => !urlsToDelete.has(visit.url));
      
      // Rebuild domains and transitions from remaining visits
      const newDomains = {};
      const newTransitions = {};
      
      remainingVisits.forEach(visit => {
        // Update domains
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

        // Update transitions
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
      
      // Save updated data
      await chrome.storage.local.set({
        visits: remainingVisits,
        domains: newDomains,
        transitions: newTransitions
      });
      
      // Invalidate cache and reload
      dataManager.invalidateCache();
      this.closeDetailPanel();
      await this.loadAndRenderGraph();
      this.updateStats();
      
      // Show success message
      const deletedCount = allVisits.length - remainingVisits.length;
      console.log(`Deleted ${deletedCount} visits from path: ${primaryDomain}`);
      
    } catch (error) {
      console.error('Error deleting path:', error);
      alert('Failed to delete path from history');
    }
  }

  /**
   * Render the D3.js force-directed graph
   */
  renderGraph() {
    // Clear existing graph
    d3.select('#graph').selectAll('*').remove();

    // Create SVG
    this.svg = d3.select('#graph')
      .append('svg')
      .attr('width', this.width)
      .attr('height', this.height);

    // Add zoom behavior
    const g = this.svg.append('g');
    
    const zoom = d3.zoom()
      .scaleExtent([0.1, 10])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    this.svg.call(zoom);

    // Calculate tree layout positions
    this.calculateTreeLayout();

    // Create force simulation with tree-based positions
    this.simulation = d3.forceSimulation(this.nodes)
      .force('link', d3.forceLink(this.links)
        .id(d => d.id)
        .distance(100)
        .strength(0.5))
      .force('collision', d3.forceCollide()
        .radius(d => d.radius + 30))
      .force('x', d3.forceX(d => d.treeX).strength(0.8))
      .force('y', d3.forceY(d => d.treeY).strength(0.8))
      .alphaDecay(0.02);

    // Create links
    const link = g.append('g')
      .selectAll('line')
      .data(this.links)
      .enter()
      .append('line')
      .attr('class', 'link')
      .attr('stroke-width', d => d.width);

    // Create nodes
    const node = g.append('g')
      .selectAll('g')
      .data(this.nodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .call(d3.drag()
        .on('start', (event, d) => this.dragStarted(event, d))
        .on('drag', (event, d) => this.dragged(event, d))
        .on('end', (event, d) => this.dragEnded(event, d)));

    // Add circles to nodes
    node.append('circle')
      .attr('r', d => d.radius)
      .on('click', (event, d) => this.handleNodeClick(event, d))
      .on('mouseenter', (event, d) => this.handleNodeHover(event, d))
      .on('mouseleave', (event, d) => this.handleNodeLeave(event, d));

    // Add labels to nodes (positioned above the circles)
    node.append('text')
      .text(d => d.title || d.url)
      .attr('dy', d => -d.radius - 5)
      .style('font-size', '10px')
      .style('text-anchor', 'middle')
      .style('pointer-events', 'none')
      .style('max-width', '150px');

    // Update positions on simulation tick
    this.simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      node
        .attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Store references for later use
    this.linkElements = link;
    this.nodeElements = node;
  }

  /**
   * Calculate tree layout positions for nodes
   */
  calculateTreeLayout() {
    if (this.nodes.length === 0) return;

    // Build adjacency list for tree structure
    const nodeMap = new Map(this.nodes.map(n => [n.id, n]));
    const children = new Map();
    const parents = new Map();
    
    this.nodes.forEach(node => {
      children.set(node.id, []);
      parents.set(node.id, null);
    });
    
    this.links.forEach(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      children.get(sourceId).push(targetId);
      parents.set(targetId, sourceId);
    });
    
    // Find root nodes (nodes with no parents)
    const roots = this.nodes.filter(node => parents.get(node.id) === null);
    
    if (roots.length === 0 && this.nodes.length > 0) {
      // If no clear root, use the earliest node
      roots.push(this.nodes[0]);
    }
    
    // Calculate depth for each node
    const depths = new Map();
    const nodesAtDepth = new Map();
    
    const calculateDepth = (nodeId, depth = 0) => {
      if (depths.has(nodeId)) return;
      
      depths.set(nodeId, depth);
      if (!nodesAtDepth.has(depth)) {
        nodesAtDepth.set(depth, []);
      }
      nodesAtDepth.get(depth).push(nodeId);
      
      children.get(nodeId).forEach(childId => {
        calculateDepth(childId, depth + 1);
      });
    };
    
    roots.forEach(root => calculateDepth(root.id));
    
    // Assign nodes without depth to depth 0
    this.nodes.forEach(node => {
      if (!depths.has(node.id)) {
        depths.set(node.id, 0);
        if (!nodesAtDepth.has(0)) {
          nodesAtDepth.set(0, []);
        }
        nodesAtDepth.get(0).push(node.id);
      }
    });
    
    // Calculate positions
    const maxDepth = Math.max(...Array.from(depths.values()));
    const verticalSpacing = Math.min(150, this.height / (maxDepth + 2));
    
    // Position nodes at each depth
    Array.from(nodesAtDepth.keys()).sort((a, b) => a - b).forEach(depth => {
      const nodesAtThisDepth = nodesAtDepth.get(depth);
      const count = nodesAtThisDepth.length;
      const horizontalSpacing = Math.min(200, this.width / (count + 1));
      
      // Sort nodes at this depth by timestamp for consistency
      nodesAtThisDepth.sort((a, b) => {
        const nodeA = nodeMap.get(a);
        const nodeB = nodeMap.get(b);
        return nodeA.firstVisit - nodeB.firstVisit;
      });
      
      nodesAtThisDepth.forEach((nodeId, index) => {
        const node = nodeMap.get(nodeId);
        
        if (count === 1) {
          // Center single nodes
          node.treeX = this.width / 2;
        } else {
          // Distribute multiple nodes
          const totalWidth = (count - 1) * horizontalSpacing;
          const startX = (this.width - totalWidth) / 2;
          node.treeX = startX + (index * horizontalSpacing);
        }
        
        node.treeY = 80 + (depth * verticalSpacing);
        node.depth = depth;
      });
    });
  }

  /**
   * Handle node click
   */
  handleNodeClick(event, d) {
    event.stopPropagation();
    this.selectedNode = d;
    
    // Update visual selection
    this.nodeElements.classed('selected', node => node.id === d.id);
    
    // Highlight connected links
    this.linkElements.classed('highlighted', link => 
      link.source.id === d.id || link.target.id === d.id
    );
    
    this.showDetailPanel(d);
  }

  /**
   * Handle node hover
   */
  handleNodeHover(event, d) {
    // Show tooltip with date and time
    const firstVisit = new Date(d.firstVisit);
    const lastVisit = new Date(d.lastVisit);
    
    let tooltipContent = `<strong>${this.escapeHtml(d.title || d.url)}</strong><br/>`;
    tooltipContent += `<span style="font-size: 11px;">First visit: ${this.formatDate(d.firstVisit)}</span><br/>`;
    if (d.visitCount > 1) {
      tooltipContent += `<span style="font-size: 11px;">Last visit: ${this.formatDate(d.lastVisit)}</span><br/>`;
    }
    tooltipContent += `<span style="font-size: 11px;">Total visits: ${d.visitCount}</span>`;
    
    this.tooltip.innerHTML = tooltipContent;
    this.tooltip.style.display = 'block';
    this.tooltip.style.left = `${event.pageX + 10}px`;
    this.tooltip.style.top = `${event.pageY + 10}px`;
    
    // Highlight connected links
    this.linkElements.style('opacity', link => 
      link.source.id === d.id || link.target.id === d.id ? 1 : 0.2
    );
  }

  /**
   * Handle node leave
   */
  handleNodeLeave(event, d) {
    // Hide tooltip
    this.tooltip.style.display = 'none';
    
    if (!this.selectedNode || this.selectedNode.id !== d.id) {
      this.linkElements.style('opacity', null);
    }
  }

  /**
   * Show detail panel for a visit
   */
  async showDetailPanel(node) {
    console.log('Showing detail panel for node:', node);
    const panel = document.getElementById('detailPanel');
    panel.classList.remove('hidden');

    // Update header
    const favicon = `https://www.google.com/s2/favicons?domain=${node.domain}&sz=32`;
    document.getElementById('domainFavicon').src = favicon;
    document.getElementById('domainName').textContent = node.title || node.url;

    // Update stats - show visit details
    document.getElementById('panelVisitCount').textContent = `${node.visitCount} visit${node.visitCount > 1 ? 's' : ''}`;
    document.getElementById('panelFirstVisit').textContent = this.formatDate(node.firstVisit);
    document.getElementById('panelLastVisit').textContent = this.formatDate(node.lastVisit);

    // Show URL details
    const visitsList = document.getElementById('visitsList');
    visitsList.innerHTML = `
      <div class="visit-item">
        <div class="visit-title">${this.escapeHtml(node.title)}</div>
        <div class="visit-url">${this.escapeHtml(node.url)}</div>
        <div class="visit-meta">
          <span class="visit-time">First: ${this.formatRelativeTime(node.firstVisit)} | Last: ${this.formatRelativeTime(node.lastVisit)}</span>
          <button class="reopen-btn" data-url="${this.escapeHtml(node.url)}">Reopen</button>
        </div>
      </div>
    `;
    
    // Add reopen button listener
    visitsList.querySelector('.reopen-btn').addEventListener('click', (e) => {
      chrome.tabs.create({ url: e.target.dataset.url });
    });
  }

  /**
   * Close detail panel
   */
  closeDetailPanel() {
    document.getElementById('detailPanel').classList.add('hidden');
    this.selectedNode = null;
    this.nodeElements.classed('selected', false);
    this.linkElements.classed('highlighted', false);
    this.linkElements.style('opacity', null);
  }

  /**
   * Apply filters
   */
  async applyFilters() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const search = document.getElementById('searchDomain').value;

    this.currentFilters = {};

    if (startDate) {
      this.currentFilters.startDate = new Date(startDate);
    }
    if (endDate) {
      this.currentFilters.endDate = new Date(endDate);
      this.currentFilters.endDate.setHours(23, 59, 59, 999);
    }
    if (search) {
      this.currentFilters.search = search;
    }

    await this.loadAndRenderGraph();
    this.updateStats();
  }

  /**
   * Reset filters
   */
  async resetFilters() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('startDate').value = today;
    document.getElementById('endDate').value = today;
    document.getElementById('searchDomain').value = '';

    this.currentFilters = {};
    await this.loadAndRenderGraph();
    this.updateStats();
  }

  /**
   * Search paths by domain, URL or title
   */
  searchDomains(query) {
    if (!query) {
      // Show all paths when search is empty
      this.updatePathNavigation();
      return;
    }

    const searchTerm = query.toLowerCase();
    
    // Filter paths based on search term
    document.querySelectorAll('.path-item-wrapper').forEach(wrapper => {
      const pathIndex = parseInt(wrapper.getAttribute('data-path-index'));
      const path = this.paths[pathIndex];
      
      // Check if any node in the path matches the search term
      const matches = path.nodes.some(node =>
        node.url.toLowerCase().includes(searchTerm) ||
        node.title.toLowerCase().includes(searchTerm) ||
        node.domain.toLowerCase().includes(searchTerm)
      );
      
      // Show or hide the path item
      wrapper.style.display = matches ? 'block' : 'none';
    });
  }

  /**
   * Filter single-page paths
   */
  filterSinglePagePaths(hide) {
    document.querySelectorAll('.path-item-wrapper').forEach(wrapper => {
      const pathIndex = parseInt(wrapper.getAttribute('data-path-index'));
      const path = this.paths[pathIndex];
      
      if (hide && path.nodes.length === 1) {
        wrapper.style.display = 'none';
      } else {
        // Check if currently filtered by search
        const searchValue = document.getElementById('searchDomain').value;
        if (!searchValue) {
          wrapper.style.display = 'block';
        }
      }
    });
  }

  /**
   * Toggle side menu visibility
   */
  toggleSideMenu() {
    this.sideMenuCollapsed = !this.sideMenuCollapsed;
    const sideMenu = document.getElementById('pathSideMenu');
    const graphContainer = document.getElementById('graph').parentElement;
    const toggleBtn = document.getElementById('toggleSideMenu');
    
    if (this.sideMenuCollapsed) {
      sideMenu.style.transform = 'translateX(-100%)';
      graphContainer.classList.add('menu-collapsed');
      toggleBtn.querySelector('.material-icons').textContent = 'menu_open';
      this.width = window.innerWidth;
    } else {
      sideMenu.style.transform = 'translateX(0)';
      graphContainer.classList.remove('menu-collapsed');
      toggleBtn.querySelector('.material-icons').textContent = 'menu';
      this.width = window.innerWidth - 250;
    }
    
    this.handleResize();
  }

  /**
   * Refresh graph
   */
  async refresh() {
    dataManager.invalidateCache();
    this.closeDetailPanel();
    await this.loadAndRenderGraph();
    this.updateStats();
  }

  /**
   * Export data as JSON
   */
  async exportJSON() {
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

  /**
   * Export graph as image
   */
  async exportImage() {
    try {
      const svgElement = document.querySelector('#graph svg');
      const svgData = new XMLSerializer().serializeToString(svgElement);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        canvas.width = this.width;
        canvas.height = this.height;
        ctx.fillStyle = '#1E1E1E';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        
        canvas.toBlob((blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `browser-journey-${new Date().toISOString().split('T')[0]}.png`;
          a.click();
          URL.revokeObjectURL(url);
        });
      };

      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    } catch (error) {
      console.error('Error exporting image:', error);
      alert('Failed to export image');
    }
  }

  /**
   * Clear history
   */
  async clearHistory() {
    if (!confirm('Are you sure you want to clear all browsing history? This cannot be undone.')) {
      return;
    }

    try {
      const result = await dataManager.clearHistory();
      if (result.success) {
        alert(result.message);
        this.closeDetailPanel();
        await this.loadAndRenderGraph();
        this.updateStats();
      } else {
        alert('Failed to clear history: ' + result.message);
      }
    } catch (error) {
      console.error('Error clearing history:', error);
      alert('Failed to clear history');
    }
  }

  /**
   * Update stats footer
   */
  async updateStats() {
    try {
      const visits = await dataManager.getVisits(this.currentFilters);
      const uniqueDomains = new Set(visits.map(v => v.domain)).size;
      const statsInfo = document.getElementById('statsInfo');
      statsInfo.textContent = `${visits.length} page visits | ${uniqueDomains} unique domains | Showing your browsing journey`;
    } catch (error) {
      console.error('Error updating stats:', error);
    }
  }

  /**
   * Drag handlers - allow free movement in tree layout
   */
  dragStarted(event, d) {
    if (!event.active) this.simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  dragEnded(event, d) {
    if (!event.active) this.simulation.alphaTarget(0);
    // Allow nodes to stay where dragged
    // Uncomment below to snap back to tree position
    // d.fx = null;
    // d.fy = null;
  }

  /**
   * Handle window resize
   */
  handleResize() {
    this.width = window.innerWidth - 250; // Account for side menu
    this.height = window.innerHeight - 100; // Account for header and footer
    
    if (this.svg) {
      this.svg.attr('width', this.width).attr('height', this.height);
      
      // Recalculate tree layout
      this.calculateTreeLayout();
      
      // Reset fixed positions
      this.nodes.forEach(node => {
        node.fx = null;
        node.fy = null;
      });
      
      this.simulation.alpha(0.5).restart();
    }
  }

  /**
   * Toggle pin state for a path
   */
  togglePinPath(pathIndex) {
    if (this.pinnedPaths.has(pathIndex)) {
      this.pinnedPaths.delete(pathIndex);
    } else {
      this.pinnedPaths.add(pathIndex);
    }
    
    // Save to localStorage
    localStorage.setItem('pinnedPaths', JSON.stringify([...this.pinnedPaths]));
    
    // Re-render the menu to update pin state and reorder
    this.updatePathNavigation();
  }

  /**
   * Load pinned paths from localStorage
   */
  loadPinnedPaths() {
    try {
      const saved = localStorage.getItem('pinnedPaths');
      if (saved) {
        const pinned = JSON.parse(saved);
        this.pinnedPaths = new Set(pinned);
      }
    } catch (error) {
      console.error('Error loading pinned paths:', error);
      this.pinnedPaths = new Set();
    }
  }

  /**
   * Show/hide loading indicator
   */
  showLoading(show) {
    document.getElementById('loadingIndicator').classList.toggle('hidden', !show);
  }

  /**
   * Show/hide empty state
   */
  showEmptyState(show) {
    document.getElementById('emptyState').classList.toggle('hidden', !show);
  }

  /**
   * Utility: Debounce function
   */
  debounce(func, wait) {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(func, wait);
  }

  /**
   * Utility: Format date
   */
  formatDate(timestamp) {
    console.log('Formatting date for timestamp:', timestamp);
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Utility: Format relative time
   */
  formatRelativeTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
  }

  /**
   * Utility: Escape HTML
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize visualization when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new BrowserJourneyViz();
});