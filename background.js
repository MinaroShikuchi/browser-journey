// Browser Journey - Background Service Worker
// Tracks tab navigation and stores browsing data

// Store for tracking the last visited domain per tab
const tabHistory = new Map();

/**
 * Extract domain from URL
 * @param {string} url - Full URL
 * @returns {string|null} - Domain name or null
 */
function extractDomain(url) {
  try {
    if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') || 
        url.startsWith('about:') || url.startsWith('edge://')) {
      return null;
    }
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    console.error('Error extracting domain:', error);
    return null;
  }
}

/**
 * Generate unique ID for visit
 * @returns {string} - Unique identifier
 */
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Track navigation event
 * @param {number} tabId - Tab ID
 * @param {string} url - URL visited
 * @param {string} title - Page title
 */
async function trackNavigation(tabId, url, title) {
  const domain = extractDomain(url);
  if (!domain) return;

  const timestamp = Date.now();
  const fromDomain = tabHistory.get(tabId) || null;

  // Create visit record
  const visit = {
    id: generateId(),
    domain: domain,
    url: url,
    title: title || domain,
    timestamp: timestamp,
    fromDomain: fromDomain,
    tabId: tabId
  };

  try {
    // Get existing data
    const result = await chrome.storage.local.get(['visits', 'transitions', 'domains']);
    const visits = result.visits || [];
    const transitions = result.transitions || {};
    const domains = result.domains || {};

    // Add new visit
    visits.push(visit);

    // Update domain stats
    if (!domains[domain]) {
      domains[domain] = {
        visitCount: 0,
        firstVisit: timestamp,
        lastVisit: timestamp,
        favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
      };
    }
    domains[domain].visitCount++;
    domains[domain].lastVisit = timestamp;

    // Update transitions
    if (fromDomain && fromDomain !== domain) {
      const transitionKey = `${fromDomain}->${domain}`;
      if (!transitions[transitionKey]) {
        transitions[transitionKey] = {
          count: 0,
          lastVisit: timestamp
        };
      }
      transitions[transitionKey].count++;
      transitions[transitionKey].lastVisit = timestamp;
    }

    // Store updated data
    await chrome.storage.local.set({
      visits: visits,
      transitions: transitions,
      domains: domains
    });

    // Update tab history
    tabHistory.set(tabId, domain);

    console.log('Tracked navigation:', domain, 'from', fromDomain);
  } catch (error) {
    console.error('Error tracking navigation:', error);
  }
}

/**
 * Clean up old data (keep last 90 days)
 */
async function cleanupOldData() {
  try {
    const result = await chrome.storage.local.get(['visits', 'transitions', 'domains']);
    const visits = result.visits || [];
    const transitions = result.transitions || {};
    const domains = result.domains || {};

    const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);

    // Filter visits
    const recentVisits = visits.filter(visit => visit.timestamp > ninetyDaysAgo);

    // Rebuild domains and transitions from recent visits
    const newDomains = {};
    const newTransitions = {};

    recentVisits.forEach(visit => {
      // Update domain stats
      if (!newDomains[visit.domain]) {
        newDomains[visit.domain] = {
          visitCount: 0,
          firstVisit: visit.timestamp,
          lastVisit: visit.timestamp,
          favicon: domains[visit.domain]?.favicon || `https://www.google.com/s2/favicons?domain=${visit.domain}&sz=32`
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
        const transitionKey = `${visit.fromDomain}->${visit.domain}`;
        if (!newTransitions[transitionKey]) {
          newTransitions[transitionKey] = {
            count: 0,
            lastVisit: visit.timestamp
          };
        }
        newTransitions[transitionKey].count++;
        if (visit.timestamp > newTransitions[transitionKey].lastVisit) {
          newTransitions[transitionKey].lastVisit = visit.timestamp;
        }
      }
    });

    // Store cleaned data
    await chrome.storage.local.set({
      visits: recentVisits,
      transitions: newTransitions,
      domains: newDomains
    });

    console.log('Cleanup complete. Kept', recentVisits.length, 'visits from last 90 days');
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

// Event Listeners

// Listen for tab updates (page loads)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    trackNavigation(tabId, tab.url, tab.title);
  }
});

// Listen for tab activation (switching tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url && tab.status === 'complete') {
      trackNavigation(activeInfo.tabId, tab.url, tab.title);
    }
  } catch (error) {
    console.error('Error handling tab activation:', error);
  }
});

// Listen for tab removal (mark journey as ended)
chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    // Get existing data
    const result = await chrome.storage.local.get(['visits', 'closedTabs']);
    const visits = result.visits || [];
    const closedTabs = result.closedTabs || {};
    
    // Mark all visits from this tab as part of a closed journey
    const tabVisits = visits.filter(v => v.tabId === tabId);
    if (tabVisits.length > 0) {
      const lastVisit = tabVisits[tabVisits.length - 1];
      closedTabs[tabId] = {
        closedAt: Date.now(),
        lastUrl: lastVisit.url,
        lastDomain: lastVisit.domain
      };
      
      await chrome.storage.local.set({ closedTabs });
      console.log('Tab closed, journey ended:', tabId);
    }
    
    // Cleanup tab history
    tabHistory.delete(tabId);
  } catch (error) {
    console.error('Error handling tab removal:', error);
    tabHistory.delete(tabId);
  }
});



console.log('Browser Journey background service worker loaded');