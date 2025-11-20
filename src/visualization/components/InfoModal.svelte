<script>
  import { formatDate } from '../../lib/utils.js';
  
  export let infoData = null;
  export let onClose;
  
  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} bytes`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
</script>

{#if infoData}
<div class="modal-overlay" on:click={onClose} on:keydown={(e) => e.key === 'Escape' && onClose()} role="button" tabindex="-1">
  <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div class="modal-header">
      <h2 id="modal-title"><span class="material-icons" style="vertical-align: middle;">info</span> Browser Journey Info</h2>
      <button on:click={onClose} class="modal-close-btn">×</button>
    </div>
    
    <div class="modal-body">
      <div class="info-section info-header-row">
        <div class="info-header-item">
          <h3>Version</h3>
          <p class="info-value">v{infoData.version}</p>
        </div>
        <div class="info-header-item">
          <h3>Storage Usage</h3>
          <p class="info-value">{formatBytes(infoData.storageSizeBytes)}</p>
          <p class="info-detail">{infoData.storageSizeKB} KB / {infoData.storageSizeMB} MB</p>
        </div>
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

<style>
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
    border-radius: var(--radius-xl);
    width: 90%;
    max-width: 600px;
    max-height: 80vh;
    overflow: hidden;
    box-shadow: var(--shadow-lg);
    border: 1px solid var(--border);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-lg) var(--space-xl);
    border-bottom: 1px solid var(--border);
    background: var(--surface-light);
  }

  .modal-header h2 {
    font-size: 20px;
    font-weight: 600;
    margin: 0;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    color: var(--text);
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
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
  }

  .modal-close-btn:hover {
    background: var(--surface);
    color: var(--text);
  }

  .modal-body {
    padding: var(--space-xl);
    overflow-y: auto;
    max-height: calc(80vh - 80px);
  }

  .info-section {
    margin-bottom: var(--space-xl);
  }

  .info-section:last-child {
    margin-bottom: 0;
  }

  .info-header-row {
    display: flex;
    gap: var(--space-xl);
    justify-content: space-between;
  }

  .info-header-item {
    flex: 1;
  }

  .info-section h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: var(--space-md);
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
    margin: var(--space-xs) 0 0;
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
    padding: var(--space-md) 16px;
    font-size: 13px;
    color: var(--text-dim);
    text-align: left;
    font-weight: 500;
  }

  .info-stats-table .stat-value {
    padding: var(--space-md) 16px;
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