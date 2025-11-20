<script>
  export let startDate = '';
  export let endDate = '';
  export let hideSinglePage = false;
  export const sideMenuCollapsed = false;
  export let onToggleSideMenu;
  export let onApplyFilters;
  export let onResetFilters;
  export let onRefresh;
  export let onExportJSON;
  export let onClearHistory;
  export let onShowInfo;
</script>

<header class="header">
  <div class="header-left">
    <button on:click={onToggleSideMenu} class="btn btn-secondary" title="Toggle Side Menu">
      <span class="material-icons">menu</span>
    </button>
    <h1><span class="material-icons" style="vertical-align: middle;">map</span> Browser Journey</h1>
    
    <div class="header-filters">
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

      <button on:click={onApplyFilters} class="btn btn-primary btn-sm">Apply</button>
      <button on:click={onResetFilters} class="btn btn-secondary btn-sm">Reset</button>
    </div>
  </div>
  
  <div class="header-right">
    <button on:click={onRefresh} class="btn btn-primary" title="Refresh Graph">
      <span class="material-icons">refresh</span>
    </button>
    <button on:click={onExportJSON} class="btn btn-secondary" title="Export as JSON">
      <span class="material-icons">file_download</span>
    </button>
    <button on:click={onClearHistory} class="btn btn-danger" title="Clear History">
      <span class="material-icons">delete</span>
    </button>
    <button on:click={onShowInfo} class="btn btn-secondary" title="Information">
      <span class="material-icons">info</span>
    </button>
  </div>
</header>

<style>
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px var(--space-lg);
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    box-shadow: var(--shadow-sm);
    z-index: 100;
    gap: var(--space-lg);
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
    color: var(--text);
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

  .filter-group input[type="date"] {
    padding: 6px 10px;
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
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

  /* Button styles */
  .btn {
    padding: var(--space-sm) 16px;
    border: none;
    border-radius: var(--radius-md);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-fast);
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .btn:hover {
    transform: translateY(-1px);
    box-shadow: var(--shadow-md);
  }

  .btn-sm {
    padding: 6px var(--space-md);
    font-size: 12px;
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
</style>