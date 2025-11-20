<script>
  import { formatRelativeTime, getPrimaryDomain } from '../../lib/utils.js';
  
  export let paths = [];
  export let currentPathIndex = 0;
  export let pinnedPaths = new Set();
  export let pathTitles = new Map();
  export const pathTitlesAnimating = new Map();
  export let hideSinglePage = false;
  export let journeySearchQuery = '';
  export let onSwitchToPath;
  export let onShowAllPaths;
  export let onTogglePinPath;
  export let onExportJourney;
  export let onCloseJourneyTabs;
  export let onDeletePath;
  export let onImportJourney;
  export let getPathStatus;
</script>

<div class="path-side-menu">
  <button on:click={onImportJourney} class="import-journey-btn" title="Import a journey from JSON file">
    <span class="material-icons">file_upload</span> Import Journey
  </button>
  
  <button on:click={onShowAllPaths} class="show-all-btn" class:active={currentPathIndex === -1}>
    <span class="material-icons">view_module</span> Show All Journeys
  </button>

  <div class="journey-search-container">
    <span class="material-icons search-icon">search</span>
    <input
      type="text"
      class="journey-search-input"
      bind:value={journeySearchQuery}
      placeholder="Search journeys..."
    />
  </div>

  <div class="path-items">
    {#each paths as path, index}
      {@const isActive = index === currentPathIndex}
      {@const isPinned = pinnedPaths.has(index)}
      {@const pathStatus = getPathStatus(path)}
      {@const pathKey = path.nodes.map(n => n.url).join('|')}
      {@const aiTitle = pathTitles.get(pathKey)}
      {@const displayTitle = aiTitle || getPrimaryDomain(path)}
      {@const isSinglePage = path.nodes.length === 1}
      {@const matchesSearch = !journeySearchQuery ||
        displayTitle.toLowerCase().includes(journeySearchQuery.toLowerCase()) ||
        path.nodes.some(node =>
          node.url.toLowerCase().includes(journeySearchQuery.toLowerCase()) ||
          (node.title && node.title.toLowerCase().includes(journeySearchQuery.toLowerCase()))
        )}
      {#if (!hideSinglePage || !isSinglePage) && matchesSearch}
      <div class="path-item-wrapper" class:pinned={isPinned}>
        {#if pathStatus.isOpen}
          <span class="status-indicator-top" title="Journey active ({pathStatus.activeCount} tab{pathStatus.activeCount > 1 ? 's' : ''} open)">
            {pathStatus.activeCount}
          </span>
        {/if}
        <div class="path-item-container">
          <div
            class="path-item"
            class:active={isActive}
            on:click={() => onSwitchToPath(index)}
            on:keydown={(e) => e.key === 'Enter' && onSwitchToPath(index)}
            role="button"
            tabindex="0"
          >
            <div class="path-title">
              {#if isPinned}<span class="material-icons pin-icon">push_pin</span>{/if}
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
            <button class="pin-btn" class:pinned={isPinned} on:click|stopPropagation={() => onTogglePinPath(index)}>
              <span class="material-icons">push_pin</span>
              <span class="tooltip">{isPinned ? 'Unpin path' : 'Pin path to top'}</span>
            </button>
            <button class="share-btn" on:click|stopPropagation={() => onExportJourney(index)}>
              <span class="material-icons">share</span>
              <span class="tooltip">Export this journey</span>
            </button>
            {#if pathStatus.isOpen}
              <button class="close-tabs-btn" on:click|stopPropagation={() => onCloseJourneyTabs(path)}>
                <span class="material-icons">close</span>
                <span class="tooltip">Close all tabs in this journey</span>
              </button>
            {/if}
            <button class="delete-btn" on:click|stopPropagation={() => onDeletePath(index)}>
              <span class="material-icons">delete</span>
              <span class="tooltip">Delete this path</span>
            </button>
          </div>
        </div>
      </div>
      {/if}
    {/each}
  </div>
</div>

<style>
  .path-side-menu {
    width: 300px;
    background: var(--surface);
    border-right: 2px solid var(--border);
    overflow-y: auto;
    padding: 15px;
  }

  .journey-search-container {
    position: relative;
    margin-bottom: 10px;
  }

  .journey-search-container .search-icon {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 18px;
    color: var(--text-dim);
    pointer-events: none;
  }

  .journey-search-input {
    width: 100%;
    padding: var(--space-sm) var(--space-md) var(--space-sm) 38px;
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: 13px;
    transition: border-color var(--transition-fast);
  }

  .journey-search-input:focus {
    outline: none;
    border-color: var(--primary);
  }

  .journey-search-input::placeholder {
    color: var(--text-dim);
  }

  .import-journey-btn {
    width: 100%;
    padding: var(--space-sm);
    background: var(--primary);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    margin-bottom: 10px;
    transition: all var(--transition-fast);
  }

  .import-journey-btn:hover {
    background: var(--secondary);
    transform: translateY(-1px);
    box-shadow: var(--shadow-md);
  }

  .show-all-btn {
    width: 100%;
    padding: var(--space-sm);
    background: var(--surface-light);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
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

  .path-item-container {
    position: relative;
    background: var(--surface-light);
    border-radius: var(--radius-sm);
    border: 2px solid transparent;
    padding: 0px 8px;
  }

  .path-item {
    padding: 10px;
    cursor: pointer;
    transition: background var(--transition-fast);
    border-radius: var(--radius-sm);
  }

  .path-item-container:has(.path-item.active) {
    background: #007ACC;
    border-color: #00A3FF;
  }

  .path-item.active {
    background: transparent;
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
    font-size: 16px;
    color: var(--color-gold);
  }

  .status-indicator-top {
    position: absolute;
    top: 8px;
    right: 8px;
    min-width: 18px;
    height: 18px;
    border-radius: 9px;
    background: var(--color-green);
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
    transition: background var(--transition-fast);
  }

  .pin-btn .material-icons,
  .share-btn .material-icons,
  .close-tabs-btn .material-icons,
  .delete-btn .material-icons {
    font-size: 14px;
  }

  .pin-btn.pinned {
    background: var(--color-gold);
  }

  .share-btn {
    background: var(--color-blue);
  }

  .share-btn:hover {
    background: var(--color-blue-light);
  }

  .close-tabs-btn {
    background: var(--color-orange);
  }

  .close-tabs-btn:hover {
    background: var(--color-orange-light);
  }

  .delete-btn {
    background: var(--color-red);
  }

  .delete-btn:hover {
    background: var(--color-red-light);
  }

  .tooltip {
    position: absolute;
    bottom: calc(100% + 5px);
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.9);
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    white-space: nowrap;
    pointer-events: none;
    z-index: 10000;
    opacity: 0;
    transition: opacity var(--transition-fast);
  }

  .tooltip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 4px solid transparent;
    border-top-color: rgba(0, 0, 0, 0.9);
  }

  .pin-btn:hover .tooltip,
  .share-btn:hover .tooltip,
  .close-tabs-btn:hover .tooltip,
  .delete-btn:hover .tooltip {
    opacity: 1;
  }
</style>