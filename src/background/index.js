/**
 * Background Service Worker
 *
 * Responsibilities:
 * - Update extension icon badge based on page trust score
 * - Handle messages from content scripts
 * - Manage daily cache cleanup
 * - Handle alarm-based periodic tasks
 * - Coordinate between popup and content scripts
 */

import { StorageManager } from '../utils/StorageManager.js';

const storage = new StorageManager();

// ============================================================
// ICON BADGE COLORS
// ============================================================
const BADGE_COLORS = {
  HIGH_TRUST: '#22c55e',
  MODERATE_TRUST: '#eab308',
  LOW_TRUST: '#f97316',
  VERY_LOW_TRUST: '#ef4444',
  INSUFFICIENT_DATA: '#6b7280',
  INACTIVE: '#333333',
};

// ============================================================
// MESSAGE HANDLING
// ============================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'PAGE_SCORED':
      handlePageScored(message.data, sender.tab);
      break;

    case 'GET_SETTINGS':
      storage.getSettings().then(sendResponse);
      return true; // async response

    case 'UPDATE_SETTINGS':
      storage.updateSettings(message.data).then(sendResponse);
      return true;

    case 'GET_STATS':
      storage.getStats().then(sendResponse);
      return true;

    case 'GET_USAGE':
      storage.getUsageToday().then(sendResponse);
      return true;

    case 'CAN_SCAN':
      storage.canScan().then(sendResponse);
      return true;

    case 'GET_CACHED':
      storage.getCachedResult(message.key).then(sendResponse);
      return true;
  }
});

/**
 * Update extension icon when a page is scored
 */
function handlePageScored(data, tab) {
  if (!tab?.id) return;

  const { score } = data;
  const color = BADGE_COLORS[score.level] || BADGE_COLORS.INACTIVE;
  const text = score.score !== null ? Math.round(score.score * 100).toString() : '?';

  // Update badge
  chrome.action.setBadgeBackgroundColor({ color, tabId: tab.id });
  chrome.action.setBadgeText({ text, tabId: tab.id });

  // Update title
  const levelLabels = {
    HIGH_TRUST: 'Likely Authentic',
    MODERATE_TRUST: 'Mixed Signals',
    LOW_TRUST: 'Questionable',
    VERY_LOW_TRUST: 'Likely Inauthentic',
    INSUFFICIENT_DATA: 'Insufficient Data',
  };
  chrome.action.setTitle({
    title: `Dead Internet Detector: ${levelLabels[score.level] || 'Unknown'}`,
    tabId: tab.id,
  });

  // Record stats
  storage.recordScan(score);
  storage.incrementUsage('scans');
}

// ============================================================
// PERIODIC TASKS
// ============================================================

// Set up daily cache cleanup alarm
chrome.alarms.create('dailyCleanup', {
  periodInMinutes: 60 * 24, // Once per day
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'dailyCleanup') {
    const removed = await storage.cleanupOldCache();
    console.log(`[DID] Cache cleanup: removed ${removed} old entries`);
  }
});

// ============================================================
// INSTALLATION / UPDATE
// ============================================================

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Set default settings on first install
    await storage.updateSettings({
      enabled: true,
      sensitivity: 'balanced',
    });

    console.log('[DID] Dead Internet Detector installed');
  }

  if (details.reason === 'update') {
    console.log(`[DID] Updated to v${chrome.runtime.getManifest().version}`);
  }
});

// Reset badge when navigating to a new page
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    chrome.action.setBadgeText({ text: '', tabId });
  }
});
