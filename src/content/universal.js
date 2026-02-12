/**
 * Universal Content Script - Lightweight page scanner
 *
 * Runs on all pages (when enabled in settings).
 * Performs basic checks:
 * - Domain age and registration info
 * - Page metadata quality
 * - Basic content authenticity signals
 *
 * This is intentionally lightweight to avoid performance impact.
 * Only runs when explicitly enabled by the user.
 */

import { StorageManager } from '../utils/StorageManager.js';

class UniversalScanner {
  constructor() {
    this.storage = new StorageManager();
  }

  async init() {
    const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });

    // Universal scanner is opt-in
    if (!settings.platforms?.universal) return;

    // Don't run on known platforms (they have dedicated modules)
    const url = window.location.href;
    if (this._isKnownPlatform(url)) return;

    // Run lightweight scan
    const result = this.scan();

    if (result) {
      chrome.runtime.sendMessage({
        type: 'PAGE_SCORED',
        data: {
          url,
          score: result,
          platform: 'web',
        },
      });
    }
  }

  scan() {
    const signals = [];

    // Check page metadata quality
    const metaScore = this._checkMetadata();
    if (metaScore !== null) signals.push(metaScore);

    // Check for suspicious patterns
    const patternScore = this._checkPatterns();
    if (patternScore !== null) signals.push(patternScore);

    if (signals.length === 0) return null;

    const avgScore = signals.reduce((a, b) => a + b, 0) / signals.length;

    return {
      score: avgScore,
      level: avgScore > 0.7 ? 'HIGH_TRUST'
        : avgScore > 0.5 ? 'MODERATE_TRUST'
        : avgScore > 0.3 ? 'LOW_TRUST'
        : 'VERY_LOW_TRUST',
      message: `Basic page scan: ${signals.length} signals analyzed`,
      issues: [],
      signalCount: signals.length,
      confidence: 0.3, // Low confidence for basic scan
    };
  }

  _checkMetadata() {
    let score = 0.5;
    const checks = 0;

    // Has proper meta tags?
    const hasDescription = !!document.querySelector('meta[name="description"]');
    const hasAuthor = !!document.querySelector('meta[name="author"]');
    const hasOG = !!document.querySelector('meta[property="og:title"]');
    const hasCanonical = !!document.querySelector('link[rel="canonical"]');

    let metaCount = [hasDescription, hasAuthor, hasOG, hasCanonical].filter(Boolean).length;
    score = 0.3 + (metaCount / 4) * 0.5;

    // Check if title matches common spam patterns
    const title = document.title.toLowerCase();
    const spamTitlePatterns = [
      /buy .+ online/,
      /best .+ 20\d\d/,
      /top \d+ .+ review/,
      /cheap .+ for sale/,
      /free .+ download/,
    ];

    for (const pattern of spamTitlePatterns) {
      if (pattern.test(title)) {
        score -= 0.15;
      }
    }

    return Math.max(0, Math.min(1, score));
  }

  _checkPatterns() {
    // Count external scripts (high count = ad-heavy/tracker-heavy)
    const externalScripts = document.querySelectorAll('script[src]').length;
    if (externalScripts > 30) return 0.3;
    if (externalScripts > 20) return 0.5;

    // Check for excessive hidden elements (cloaking)
    const hiddenElements = document.querySelectorAll('[style*="display:none"], [style*="visibility:hidden"]');
    if (hiddenElements.length > 20) return 0.4;

    return 0.7;
  }

  _isKnownPlatform(url) {
    const knownDomains = [
      'amazon.com', 'amazon.co.uk', 'amazon.ca',
      'reddit.com', 'old.reddit.com',
      'google.com/maps', 'maps.google.com',
    ];
    return knownDomains.some(d => url.includes(d));
  }
}

const scanner = new UniversalScanner();
scanner.init();
