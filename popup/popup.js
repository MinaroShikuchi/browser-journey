// Browser Journey - Popup Script

/**
 * Load and display statistics
 */
async function loadStats() {
  try {
    const result = await chrome.storage.local.get(['visits', 'domains']);
    const visits = result.visits || [];
    const domains = result.domains || {};

    // Count unique domains
    const domainCount = Object.keys(domains).length;
    
    // Count total visits
    const visitCount = visits.length;
    
    // Count today's visits
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();
    const todayCount = visits.filter(visit => visit.timestamp >= todayTimestamp).length;

    // Update UI
    document.getElementById('domainCount').textContent = domainCount;
    document.getElementById('visitCount').textContent = visitCount;
    document.getElementById('todayCount').textContent = todayCount;
  } catch (error) {
    console.error('Error loading stats:', error);
    document.getElementById('domainCount').textContent = '0';
    document.getElementById('visitCount').textContent = '0';
    document.getElementById('todayCount').textContent = '0';
  }
}

/**
 * Open visualization page
 */
function openVisualization() {
  chrome.tabs.create({
    url: chrome.runtime.getURL('visualization/visualization.html')
  });
}

// Event listeners
document.getElementById('openVisualization').addEventListener('click', openVisualization);

// Load stats when popup opens
loadStats();