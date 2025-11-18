// Browser Journey - Data Manager
// Centralized data access and manipulation

class DataManager {
  constructor() {
    this.cache = {
      visits: null,
      domains: null,
      transitions: null,
      lastUpdate: 0
    };
    this.cacheTimeout = 5000; // 5 seconds
  }

  /**
   * Get all data from storage with caching
   */
  async getAllData() {
    const now = Date.now();
    if (this.cache.visits && (now - this.cache.lastUpdate) < this.cacheTimeout) {
      return {
        visits: this.cache.visits,
        domains: this.cache.domains,
        transitions: this.cache.transitions
      };
    }

    try {
      const result = await chrome.storage.local.get(['visits', 'domains', 'transitions']);
      this.cache.visits = result.visits || [];
      this.cache.domains = result.domains || {};
      this.cache.transitions = result.transitions || {};
      this.cache.lastUpdate = now;

      return {
        visits: this.cache.visits,
        domains: this.cache.domains,
        transitions: this.cache.transitions
      };
    } catch (error) {
      console.error('Error getting data:', error);
      return { visits: [], domains: {}, transitions: {} };
    }
  }

  /**
   * Get visits with optional filters
   * @param {Object} filters - Filter options
   * @param {Date} filters.startDate - Start date
   * @param {Date} filters.endDate - End date
   * @param {string} filters.domain - Domain to filter by
   * @param {number} filters.minVisits - Minimum visit count
   */
  async getVisits(filters = {}) {
    const data = await this.getAllData();
    let visits = [...data.visits];

    // Apply date range filter
    if (filters.startDate) {
      const startTime = filters.startDate.getTime();
      visits = visits.filter(visit => visit.timestamp >= startTime);
    }

    if (filters.endDate) {
      const endTime = filters.endDate.getTime();
      visits = visits.filter(visit => visit.timestamp <= endTime);
    }

    // Apply domain filter
    if (filters.domain) {
      const searchTerm = filters.domain.toLowerCase();
      visits = visits.filter(visit => 
        visit.domain.toLowerCase().includes(searchTerm)
      );
    }

    return visits;
  }

  /**
   * Get domains with optional filters
   * @param {Object} filters - Filter options
   */
  async getDomains(filters = {}) {
    const data = await this.getAllData();
    let domains = { ...data.domains };

    // Apply minimum visits filter
    if (filters.minVisits) {
      domains = Object.fromEntries(
        Object.entries(domains).filter(([_, stats]) => 
          stats.visitCount >= filters.minVisits
        )
      );
    }

    // Apply date range filter
    if (filters.startDate || filters.endDate) {
      const visits = await this.getVisits(filters);
      const filteredDomainNames = new Set(visits.map(v => v.domain));
      domains = Object.fromEntries(
        Object.entries(domains).filter(([domain, _]) => 
          filteredDomainNames.has(domain)
        )
      );
    }

    // Apply search filter
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      domains = Object.fromEntries(
        Object.entries(domains).filter(([domain, _]) => 
          domain.toLowerCase().includes(searchTerm)
        )
      );
    }

    return domains;
  }

  /**
   * Get transitions with optional filters
   */
  async getTransitions(filters = {}) {
    const data = await this.getAllData();
    let transitions = { ...data.transitions };

    // Apply date range filter by rebuilding from filtered visits
    if (filters.startDate || filters.endDate) {
      const visits = await this.getVisits(filters);
      transitions = {};
      
      visits.forEach(visit => {
        if (visit.fromDomain && visit.fromDomain !== visit.domain) {
          const key = `${visit.fromDomain}->${visit.domain}`;
          if (!transitions[key]) {
            transitions[key] = { count: 0, lastVisit: visit.timestamp };
          }
          transitions[key].count++;
          if (visit.timestamp > transitions[key].lastVisit) {
            transitions[key].lastVisit = visit.timestamp;
          }
        }
      });
    }

    return transitions;
  }

  /**
   * Get visits for a specific domain
   * @param {string} domain - Domain name
   * @param {number} limit - Maximum number of visits to return
   */
  async getVisitsForDomain(domain, limit = 50) {
    const data = await this.getAllData();
    return data.visits
      .filter(visit => visit.domain === domain)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Export all data as JSON
   */
  async exportData() {
    const data = await this.getAllData();
    return {
      visits: data.visits,
      domains: data.domains,
      transitions: data.transitions,
      exportDate: new Date().toISOString(),
      version: '0.1.0'
    };
  }

  /**
   * Clear history data
   * @param {Object} options - Clear options
   * @param {Date} options.startDate - Start date (optional)
   * @param {Date} options.endDate - End date (optional)
   */
  async clearHistory(options = {}) {
    try {
      if (!options.startDate && !options.endDate) {
        // Clear all data
        await chrome.storage.local.set({
          visits: [],
          domains: {},
          transitions: {}
        });
        this.cache.visits = [];
        this.cache.domains = {};
        this.cache.transitions = {};
        return { success: true, message: 'All history cleared' };
      }

      // Clear data in date range
      const data = await this.getAllData();
      const startTime = options.startDate ? options.startDate.getTime() : 0;
      const endTime = options.endDate ? options.endDate.getTime() : Date.now();

      // Filter visits
      const remainingVisits = data.visits.filter(visit => 
        visit.timestamp < startTime || visit.timestamp > endTime
      );

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
            favicon: data.domains[visit.domain]?.favicon || 
                     `https://www.google.com/s2/favicons?domain=${visit.domain}&sz=32`
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

      // Update cache
      this.cache.visits = remainingVisits;
      this.cache.domains = newDomains;
      this.cache.transitions = newTransitions;

      const clearedCount = data.visits.length - remainingVisits.length;
      return { 
        success: true, 
        message: `Cleared ${clearedCount} visits` 
      };
    } catch (error) {
      console.error('Error clearing history:', error);
      return { success: false, message: 'Error clearing history' };
    }
  }

  /**
   * Get statistics
   */
  async getStats() {
    const data = await this.getAllData();
    
    const totalDomains = Object.keys(data.domains).length;
    const totalVisits = data.visits.length;
    const totalTransitions = Object.keys(data.transitions).length;

    // Calculate today's stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();
    const todayVisits = data.visits.filter(v => v.timestamp >= todayTimestamp).length;

    // Find most visited domain
    let mostVisited = null;
    let maxVisits = 0;
    Object.entries(data.domains).forEach(([domain, stats]) => {
      if (stats.visitCount > maxVisits) {
        maxVisits = stats.visitCount;
        mostVisited = domain;
      }
    });

    // Calculate date range
    let firstVisit = null;
    let lastVisit = null;
    if (data.visits.length > 0) {
      const timestamps = data.visits.map(v => v.timestamp);
      firstVisit = new Date(Math.min(...timestamps));
      lastVisit = new Date(Math.max(...timestamps));
    }

    return {
      totalDomains,
      totalVisits,
      totalTransitions,
      todayVisits,
      mostVisited,
      mostVisitedCount: maxVisits,
      firstVisit,
      lastVisit
    };
  }

  /**
   * Invalidate cache
   */
  invalidateCache() {
    this.cache.lastUpdate = 0;
  }
}

// Export singleton instance
const dataManager = new DataManager();