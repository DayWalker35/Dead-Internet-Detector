/**
 * StorageManager - Handles extension storage for caching and settings
 *
 * Uses chrome.storage.local for:
 * - Cached analysis results (keyed by URL/ASIN)
 * - User settings and preferences
 * - Usage tracking for free tier limits
 *
 * Cache strategy:
 * - Results cached for 24 hours per product
 * - Auto-cleanup of entries older than 7 days
 */

export class StorageManager {
  constructor() {
    this.CACHE_TTL = 24 * 60 * 60 * 1000;    // 24 hours
    this.CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
    this.DAILY_FREE_LIMIT = 50;
  }

  // ============================================================
  // RESULT CACHING
  // ============================================================

  async cacheResult(key, result) {
    const cacheKey = `cache_${key}`;
    await chrome.storage.local.set({
      [cacheKey]: {
        ...result,
        cachedAt: Date.now(),
      },
    });
  }

  async getCachedResult(key) {
    const cacheKey = `cache_${key}`;
    const data = await chrome.storage.local.get(cacheKey);
    const cached = data[cacheKey];

    if (!cached) return null;

    // Check if cache is still fresh
    if (Date.now() - cached.cachedAt > this.CACHE_TTL) {
      await chrome.storage.local.remove(cacheKey);
      return null;
    }

    return cached;
  }

  // ============================================================
  // USER SETTINGS
  // ============================================================

  async getSettings() {
    const defaults = {
      enabled: true,
      platforms: {
        amazon: true,
        reddit: true,
        googlemaps: true,
        universal: false, // Universal scanner off by default
      },
      sensitivity: 'balanced', // 'conservative', 'balanced', 'aggressive'
      showBadges: true,
      showTooltips: true,
      deepScanEnabled: false,
      apiKey: null,
      tier: 'free', // 'free', 'pro', 'family'
    };

    const data = await chrome.storage.local.get('settings');
    return { ...defaults, ...(data.settings || {}) };
  }

  async updateSettings(updates) {
    const current = await this.getSettings();
    const merged = { ...current, ...updates };
    await chrome.storage.local.set({ settings: merged });
    return merged;
  }

  // ============================================================
  // USAGE TRACKING (Free Tier)
  // ============================================================

  async getUsageToday() {
    const today = new Date().toISOString().split('T')[0];
    const data = await chrome.storage.local.get('usage');
    const usage = data.usage || {};

    if (usage.date !== today) {
      // New day, reset counter
      return { date: today, scans: 0, deepScans: 0 };
    }

    return usage;
  }

  async incrementUsage(type = 'scans') {
    const usage = await this.getUsageToday();
    usage[type] = (usage[type] || 0) + 1;
    await chrome.storage.local.set({ usage });
    return usage;
  }

  async canScan() {
    const settings = await this.getSettings();
    if (settings.tier !== 'free') return true;

    const usage = await this.getUsageToday();
    return usage.scans < this.DAILY_FREE_LIMIT;
  }

  // ============================================================
  // STATISTICS
  // ============================================================

  async recordScan(result) {
    const data = await chrome.storage.local.get('stats');
    const stats = data.stats || {
      totalScans: 0,
      flaggedContent: 0,
      platformBreakdown: {},
      firstScan: Date.now(),
    };

    stats.totalScans++;
    if (result.level === 'LOW_TRUST' || result.level === 'VERY_LOW_TRUST') {
      stats.flaggedContent++;
    }

    const platform = result.platform || 'unknown';
    stats.platformBreakdown[platform] = (stats.platformBreakdown[platform] || 0) + 1;
    stats.lastScan = Date.now();

    await chrome.storage.local.set({ stats });
    return stats;
  }

  async getStats() {
    const data = await chrome.storage.local.get('stats');
    return data.stats || {
      totalScans: 0,
      flaggedContent: 0,
      platformBreakdown: {},
    };
  }

  // ============================================================
  // CACHE CLEANUP
  // ============================================================

  async cleanupOldCache() {
    const allData = await chrome.storage.local.get(null);
    const keysToRemove = [];

    for (const [key, value] of Object.entries(allData)) {
      if (key.startsWith('cache_') && value.cachedAt) {
        if (Date.now() - value.cachedAt > this.CACHE_MAX_AGE) {
          keysToRemove.push(key);
        }
      }
    }

    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }

    return keysToRemove.length;
  }
}
