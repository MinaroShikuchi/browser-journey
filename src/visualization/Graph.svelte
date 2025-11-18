<script>
  import { onMount, onDestroy } from 'svelte';
  import * as d3 from 'd3';
  import { formatDate, formatRelativeTime } from '../lib/utils.js';

  export let nodes = [];
  export let links = [];
  export let width = 800;
  export let height = 600;
  export let onNodeClick = () => {};

  let svgElement;
  let simulation;
  let tooltip;
  let selectedNode = null;

  $: if (svgElement && nodes.length > 0) {
    renderGraph();
  }

  onMount(() => {
    createTooltip();
  });

  onDestroy(() => {
    if (simulation) {
      simulation.stop();
    }
    if (tooltip) {
      tooltip.remove();
    }
  });

  function createTooltip() {
    tooltip = d3.select('body')
      .append('div')
      .attr('class', 'node-tooltip')
      .style('position', 'fixed')
      .style('display', 'none')
      .style('background', '#2D2D2D')
      .style('border', '1px solid #404040')
      .style('border-radius', '6px')
      .style('padding', '8px 12px')
      .style('font-size', '12px')
      .style('color', '#E0E0E0')
      .style('pointer-events', 'none')
      .style('z-index', '1000')
      .style('box-shadow', '0 4px 12px rgba(0, 0, 0, 0.5)');
  }

  function calculateTreeLayout() {
    if (nodes.length === 0) return;

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const children = new Map();
    const parents = new Map();
    
    nodes.forEach(node => {
      children.set(node.id, []);
      parents.set(node.id, null);
    });
    
    links.forEach(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;
      children.get(sourceId).push(targetId);
      parents.set(targetId, sourceId);
    });
    
    const roots = nodes.filter(node => parents.get(node.id) === null);
    
    if (roots.length === 0 && nodes.length > 0) {
      roots.push(nodes[0]);
    }
    
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
    
    nodes.forEach(node => {
      if (!depths.has(node.id)) {
        depths.set(node.id, 0);
        if (!nodesAtDepth.has(0)) {
          nodesAtDepth.set(0, []);
        }
        nodesAtDepth.get(0).push(node.id);
      }
    });
    
    const maxDepth = Math.max(...Array.from(depths.values()));
    const verticalSpacing = Math.min(150, height / (maxDepth + 2));
    
    Array.from(nodesAtDepth.keys()).sort((a, b) => a - b).forEach(depth => {
      const nodesAtThisDepth = nodesAtDepth.get(depth);
      const count = nodesAtThisDepth.length;
      const horizontalSpacing = Math.min(200, width / (count + 1));
      
      nodesAtThisDepth.sort((a, b) => {
        const nodeA = nodeMap.get(a);
        const nodeB = nodeMap.get(b);
        return nodeA.firstVisit - nodeB.firstVisit;
      });
      
      nodesAtThisDepth.forEach((nodeId, index) => {
        const node = nodeMap.get(nodeId);
        
        if (count === 1) {
          node.treeX = width / 2;
        } else {
          const totalWidth = (count - 1) * horizontalSpacing;
          const startX = (width - totalWidth) / 2;
          node.treeX = startX + (index * horizontalSpacing);
        }
        
        node.treeY = 80 + (depth * verticalSpacing);
        node.depth = depth;
      });
    });
  }

  function renderGraph() {
    const svg = d3.select(svgElement);
    svg.selectAll('*').remove();

    const g = svg.append('g');
    
    const zoom = d3.zoom()
      .scaleExtent([0.1, 10])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    calculateTreeLayout();

    simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links)
        .id(d => d.id)
        .distance(100)
        .strength(0.5))
      .force('collision', d3.forceCollide()
        .radius(d => d.radius + 30))
      .force('x', d3.forceX(d => d.treeX).strength(0.8))
      .force('y', d3.forceY(d => d.treeY).strength(0.8))
      .alphaDecay(0.02);

    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('class', 'link')
      .attr('stroke', '#A0A0A0')
      .attr('stroke-opacity', 0.4)
      .attr('stroke-width', d => d.width);

    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .call(d3.drag()
        .on('start', dragStarted)
        .on('drag', dragged)
        .on('end', dragEnded));

    node.append('circle')
      .attr('r', d => d.radius)
      .attr('fill', '#4A90E2')
      .attr('stroke', '#7B68EE')
      .attr('stroke-width', 2)
      .on('click', (event, d) => handleNodeClick(event, d))
      .on('mouseenter', (event, d) => handleNodeHover(event, d))
      .on('mouseleave', () => handleNodeLeave());

    node.append('text')
      .text(d => d.title || d.url)
      .attr('dy', d => -d.radius - 5)
      .style('font-size', '10px')
      .style('text-anchor', 'middle')
      .style('pointer-events', 'none')
      .style('fill', '#E0E0E0');

    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });
  }

  function handleNodeClick(event, d) {
    event.stopPropagation();
    selectedNode = d;
    onNodeClick(d);
  }

  function handleNodeHover(event, d) {
    let tooltipContent = `<strong>${d.title || d.url}</strong><br/>`;
    tooltipContent += `<span style="font-size: 11px;">First visit: ${formatDate(d.firstVisit)}</span><br/>`;
    if (d.visitCount > 1) {
      tooltipContent += `<span style="font-size: 11px;">Last visit: ${formatDate(d.lastVisit)}</span><br/>`;
    }
    tooltipContent += `<span style="font-size: 11px;">Total visits: ${d.visitCount}</span>`;
    
    tooltip
      .html(tooltipContent)
      .style('display', 'block')
      .style('left', `${event.pageX + 10}px`)
      .style('top', `${event.pageY + 10}px`);
  }

  function handleNodeLeave() {
    tooltip.style('display', 'none');
  }

  function dragStarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragEnded(event, d) {
    if (!event.active) simulation.alphaTarget(0);
  }
</script>

<svg bind:this={svgElement} {width} {height} style="cursor: grab;">
</svg>

<style>
  svg {
    width: 100%;
    height: 100%;
  }

  svg:active {
    cursor: grabbing;
  }
</style>