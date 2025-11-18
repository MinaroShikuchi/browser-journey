<script>
  import { onMount } from 'svelte';

  let domainCount = '-';
  let visitCount = '-';
  let todayCount = '-';

  /**
   * Load and display statistics
   */
  async function loadStats() {
    try {
      const result = await chrome.storage.local.get(['visits', 'domains']);
      const visits = result.visits || [];
      const domains = result.domains || {};

      // Count unique domains
      domainCount = Object.keys(domains).length;
      
      // Count total visits
      visitCount = visits.length;
      
      // Count today's visits
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayTimestamp = today.getTime();
      todayCount = visits.filter(visit => visit.timestamp >= todayTimestamp).length;
    } catch (error) {
      console.error('Error loading stats:', error);
      domainCount = '0';
      visitCount = '0';
      todayCount = '0';
    }
  }

  /**
   * Open visualization page
   */
  function openVisualization() {
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/visualization/index.html')
    });
  }

  onMount(() => {
    loadStats();
  });
</script>

<div class="container">
  <header>
    <span class="material-icons header-icon">map</span>
    <h1>Browser Journey</h1>
  </header>
  
  <div class="stats">
    <div class="stat-item">
      <span class="material-icons stat-icon">language</span>
      <div class="stat-label">Domains</div>
      <div class="stat-value">{domainCount}</div>
    </div>
    <div class="stat-item">
      <span class="material-icons stat-icon">visibility</span>
      <div class="stat-label">Visits</div>
      <div class="stat-value">{visitCount}</div>
    </div>
    <div class="stat-item">
      <span class="material-icons stat-icon">today</span>
      <div class="stat-label">Today</div>
      <div class="stat-value">{todayCount}</div>
    </div>
  </div>

  <button on:click={openVisualization} class="primary-button">
    <span class="material-icons">analytics</span>
    Open Visualization
  </button>

  <div class="footer">
    <small>Track your browsing journey</small>
  </div>
</div>

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(:root) {
    --primary: #4A90E2;
    --background: #1E1E1E;
    --surface: #2D2D2D;
    --text: #E0E0E0;
    --text-dim: #A0A0A0;
    --border: #404040;
  }

  :global(body) {
    width: 320px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background: var(--background);
    color: var(--text);
  }

  .container {
    padding: 20px;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-bottom: 20px;
    padding-bottom: 15px;
    border-bottom: 1px solid var(--border);
  }

  .header-icon {
    font-size: 24px;
    color: var(--primary);
  }

  h1 {
    font-size: 18px;
    font-weight: 600;
    margin: 0;
    color: var(--text);
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 20px;
  }

  .stat-item {
    background: var(--surface);
    padding: 15px 10px;
    border-radius: 8px;
    text-align: center;
    border: 1px solid var(--border);
    transition: all 0.2s ease;
  }

  .stat-item:hover {
    background: #3D3D3D;
    transform: translateY(-2px);
  }

  .stat-icon {
    font-size: 20px;
    color: var(--primary);
    display: block;
    margin-bottom: 8px;
  }

  .stat-label {
    font-size: 11px;
    color: var(--text-dim);
    margin-bottom: 5px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .stat-value {
    font-size: 22px;
    font-weight: 700;
    color: var(--text);
  }

  .primary-button {
    width: 100%;
    padding: 12px 20px;
    background: var(--primary);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .primary-button .material-icons {
    font-size: 18px;
  }

  .primary-button:hover {
    background: #3a7bc8;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(74, 144, 226, 0.3);
  }

  .primary-button:active {
    transform: translateY(0);
  }

  .footer {
    text-align: center;
    margin-top: 15px;
    color: var(--text-dim);
    font-size: 11px;
  }
</style>