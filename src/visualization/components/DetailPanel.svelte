<script>
  import { formatDate, formatRelativeTime } from '../../lib/utils.js';
  
  export let detailNode = null;
  export let detailPanelWidth = 350;
  export let onClose;
  export let onOpenUrl;
  export let onStartResize;
  
  let isResizing = false;
</script>

{#if detailNode}
<div class="detail-panel" style="width: {detailPanelWidth}px;">
  <div
    class="resize-handle"
    on:mousedown={onStartResize}
    on:keydown={(e) => e.key === 'Enter' && onStartResize(e)}
    role="separator"
    aria-label="Resize detail panel"
    tabindex="0"
  ></div>
  <div class="panel-header">
    <div class="panel-title">
      <img src="https://www.google.com/s2/favicons?domain={detailNode.domain}&sz=32" alt="" class="domain-favicon" />
      <h3>{detailNode.title || detailNode.url}</h3>
    </div>
    <button on:click={onClose} class="close-btn">×</button>
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
          <button class="reopen-btn" on:click={() => onOpenUrl(detailNode.url)}>Open</button>
        </div>
      </div>
    </div>
  </div>
</div>
{/if}

<style>
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
    transition: background var(--transition-fast);
  }

  .resize-handle:hover {
    background: var(--primary);
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-lg);
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
    border-radius: var(--radius-sm);
  }

  .panel-header h3 {
    font-size: 18px;
    font-weight: 600;
    word-break: break-all;
    color: var(--text);
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
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
  }

  .close-btn:hover {
    background: var(--surface-light);
    color: var(--text);
  }

  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-lg);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-bottom: var(--space-lg);
  }

  .stat-card {
    background: var(--background);
    padding: var(--space-md);
    border-radius: var(--radius-lg);
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
    padding: var(--space-md);
    border-radius: var(--radius-md);
    border-left: 3px solid var(--primary);
    transition: all var(--transition-fast);
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
    margin-bottom: var(--space-sm);
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
    border-radius: var(--radius-sm);
    font-size: 11px;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .reopen-btn:hover {
    background: var(--secondary);
  }
</style>