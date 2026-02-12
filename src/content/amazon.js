/**
 * Amazon Content Script - MVP Module
 *
 * Scrapes review data from Amazon product pages and runs
 * authenticity analysis. Injects trust score overlays on
 * individual reviews and shows an overall product trust badge.
 *
 * DOM SCRAPING STRATEGY:
 * Amazon's DOM changes frequently. Selectors are organized in
 * a config object for easy maintenance. When Amazon changes their
 * markup, only the selectors need updating.
 */

import { TextAnalyzer, BatchTextAnalyzer } from '../analysis/TextAnalyzer.js';
import { AccountAnalyzer, ReviewerProfile } from '../analysis/AccountAnalyzer.js';
import { TrustScorer } from '../analysis/TrustScorer.js';
import { OverlayRenderer } from '../utils/OverlayRenderer.js';
import { StorageManager } from '../utils/StorageManager.js';

// ============================================================
// AMAZON DOM SELECTORS (centralized for maintainability)
// ============================================================
const SELECTORS = {
  // Review containers — multiple selectors for different page types
  reviewList: '#cm-cr-dp-review-list, #cm_cr-review_list, .review-views .cr-widget-Reviews',
  reviewCard: '[data-hook="review"]',
  reviewBody: '[data-hook="review-body"] span',
  reviewTitle: '[data-hook="review-title"] span, [data-hook="review-title"]',
  reviewRating: '[data-hook="review-star-rating"] span, [data-hook="cmps-review-star-rating"] span, [data-hook="review-star-rating"]',
  reviewDate: '[data-hook="review-date"]',
  reviewerName: '.a-profile-name',
  reviewerProfileLink: '.a-profile',
  verifiedPurchase: '[data-hook="avp-badge"]',
  helpfulCount: '[data-hook="helpful-vote-statement"]',

  // Product-level review summary
  overallRating: '#acrPopover [data-hook="rating-out-of-text"]',
  totalReviews: '#acrCustomerReviewText',
  ratingHistogram: '#histogramTable tr',

  // Product info
  productTitle: '#productTitle',
  productASIN: '[data-asin]',
};

// ============================================================
// MAIN CONTROLLER
// ============================================================
class AmazonAnalyzer {
  constructor() {
    this.textAnalyzer = new TextAnalyzer();
    this.batchAnalyzer = new BatchTextAnalyzer();
    this.accountAnalyzer = new AccountAnalyzer();
    this.trustScorer = new TrustScorer();
    this.renderer = new OverlayRenderer();
    this.storage = new StorageManager();
    this.isRunning = false;
  }

  async init() {
    // Check if we're on a page with reviews (product page OR all-reviews page)
    const hasReviewList = document.querySelector(SELECTORS.reviewList);
    const hasReviewCards = document.querySelectorAll(SELECTORS.reviewCard).length > 0;

    if (!hasReviewList && !hasReviewCards) {
      // Maybe reviews haven't loaded yet — watch for them
      this._observeForReviews();
      return;
    }

    await this.run();
    // Start watching for dynamically loaded reviews
    this._observeForNewReviews();
  }

  async run() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      // 1. Extract all review data from the page
      const reviews = this._extractReviews();
      if (reviews.length === 0) {
        this.isRunning = false;
        return;
      }

      // 2. Extract product-level metadata
      const productMeta = this._extractProductMeta();

      // 3. Run individual text analysis on each review
      const textResults = reviews.map(r => this.textAnalyzer.analyze(r.text));

      // 4. Run batch text analysis (cross-review patterns)
      const batchTextResults = this.batchAnalyzer.analyzeBatch(
        reviews.map(r => r.text)
      );

      // 5. Run account analysis on reviewer profiles
      const accountResults = this.accountAnalyzer.analyzeBatch(
        reviews.map(r => r.profile)
      );

      // 6. Analyze rating distribution
      const ratingDistribution = this._analyzeRatingDistribution(productMeta);

      // 7. Score each review individually
      const reviewScores = reviews.map((review, i) => {
        const signals = {
          text: textResults[i],
          account: accountResults.individual[i],
          behavioral: {
            timingCluster: accountResults.batch.timingCluster,
            ratingDistribution: ratingDistribution,
          },
        };

        return {
          review,
          result: this.trustScorer.computeScore(signals),
          element: review.element,
        };
      });

      // 8. Compute overall product trust score
      const overallSignals = {
        text: this._aggregateSignals(textResults),
        behavioral: {
          timingCluster: accountResults.batch.timingCluster,
          coordinatedLanguage: batchTextResults.batch.coordinatedLanguage,
          ratingDistribution: ratingDistribution,
        },
        account: this._aggregateSignals(accountResults.individual),
      };
      const overallScore = this.trustScorer.computeScore(overallSignals);

      // 9. Render overlays
      this.renderer.renderProductBadge(overallScore, productMeta);
      for (const scored of reviewScores) {
        this.renderer.renderReviewBadge(scored.result, scored.element);
      }

      // 10. Cache results
      if (productMeta.asin) {
        await this.storage.cacheResult(productMeta.asin, {
          overall: overallScore.toJSON(),
          reviewCount: reviews.length,
          timestamp: Date.now(),
        });
      }

      // 11. Store for popup retrieval and report to background for icon update
      lastPageScore = overallScore;
      chrome.runtime.sendMessage({
        type: 'PAGE_SCORED',
        data: {
          url: window.location.href,
          score: overallScore.toJSON(),
          platform: 'amazon',
        },
      });

    } catch (error) {
      console.error('[DID] Amazon analysis error:', error);
    } finally {
      this.isRunning = false;
    }
  }

  // ============================================================
  // DATA EXTRACTION
  // ============================================================

  _extractReviews() {
    const reviewElements = document.querySelectorAll(SELECTORS.reviewCard);
    const reviews = [];

    for (const el of reviewElements) {
      try {
        const bodyEl = el.querySelector(SELECTORS.reviewBody);
        const titleEl = el.querySelector(SELECTORS.reviewTitle);
        const ratingEl = el.querySelector(SELECTORS.reviewRating);
        const dateEl = el.querySelector(SELECTORS.reviewDate);
        const nameEl = el.querySelector(SELECTORS.reviewerName);
        const profileLink = el.querySelector(SELECTORS.reviewerProfileLink);
        const verifiedEl = el.querySelector(SELECTORS.verifiedPurchase);
        const helpfulEl = el.querySelector(SELECTORS.helpfulCount);

        const text = [
          titleEl?.textContent?.trim() || '',
          bodyEl?.textContent?.trim() || '',
        ].join(' ').trim();

        if (!text) continue;

        // Parse rating from "X.0 out of 5 stars" format
        const ratingText = ratingEl?.textContent || '';
        const ratingMatch = ratingText.match(/([\d.]+)\s*out\s*of\s*5/);
        const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

        // Parse date
        const dateText = dateEl?.textContent || '';
        const dateMatch = dateText.match(/on\s+(.+)$/);
        const reviewDate = dateMatch ? dateMatch[1].trim() : null;

        // Parse helpful count
        const helpfulText = helpfulEl?.textContent || '';
        const helpfulMatch = helpfulText.match(/(\d+)\s+people?\s+found/);
        const helpfulCount = helpfulMatch ? parseInt(helpfulMatch[1]) : 0;

        // Build reviewer profile
        const profile = new ReviewerProfile({
          displayName: nameEl?.textContent?.trim() || null,
          verifiedPurchase: !!verifiedEl,
          helpfulVotes: helpfulCount,
          reviewDate: reviewDate,
          ratings: rating !== null ? [rating] : [],
        });

        reviews.push({
          text,
          title: titleEl?.textContent?.trim() || '',
          rating,
          date: reviewDate,
          helpfulCount,
          verifiedPurchase: !!verifiedEl,
          profile,
          element: el, // Keep reference for overlay injection
        });
      } catch (e) {
        console.warn('[DID] Failed to extract review:', e);
      }
    }

    return reviews;
  }

  _extractProductMeta() {
    const titleEl = document.querySelector(SELECTORS.productTitle);
    const ratingEl = document.querySelector(SELECTORS.overallRating);
    const countEl = document.querySelector(SELECTORS.totalReviews);
    const asinEl = document.querySelector(SELECTORS.productASIN);

    // Extract rating histogram
    const histogramRows = document.querySelectorAll(SELECTORS.ratingHistogram);
    const histogram = {};
    for (const row of histogramRows) {
      const starText = row.querySelector('.a-text-right a')?.textContent;
      const pctText = row.querySelector('.a-text-right + td .a-size-base')?.textContent;
      if (starText && pctText) {
        const stars = parseInt(starText);
        const pct = parseInt(pctText);
        if (!isNaN(stars) && !isNaN(pct)) {
          histogram[stars] = pct;
        }
      }
    }

    return {
      title: titleEl?.textContent?.trim() || 'Unknown Product',
      overallRating: ratingEl?.textContent?.trim() || null,
      totalReviews: countEl?.textContent?.trim() || null,
      asin: asinEl?.getAttribute('data-asin') || this._extractASIN(),
      histogram,
      url: window.location.href,
    };
  }

  _extractASIN() {
    // Fallback ASIN extraction from URL
    const match = window.location.pathname.match(/\/(?:dp|product)\/([A-Z0-9]{10})/);
    return match ? match[1] : null;
  }

  // ============================================================
  // ANALYSIS HELPERS
  // ============================================================

  /**
   * Analyze the rating distribution for J-curve or anomalies
   * Real products tend to have J-shaped distributions (many 5, some 1, fewer middle)
   * Fake review campaigns create unnatural spikes
   */
  _analyzeRatingDistribution(productMeta) {
    const histogram = productMeta.histogram;
    if (!histogram || Object.keys(histogram).length < 3) return null;

    // Check for suspiciously high 5-star concentration
    const fiveStarPct = histogram[5] || 0;
    const oneStarPct = histogram[1] || 0;
    const middlePct = (histogram[2] || 0) + (histogram[3] || 0) + (histogram[4] || 0);

    // Completely lopsided (95%+ five star) is suspicious
    if (fiveStarPct > 90 && middlePct < 5) {
      return {
        score: 0.2,
        detail: `${fiveStarPct}% five-star reviews with almost no middle ratings — unusual distribution`,
      };
    }

    // Very high 5-star with zero 1-star is mildly suspicious
    if (fiveStarPct > 80 && oneStarPct < 2) {
      return {
        score: 0.4,
        detail: 'Unusually concentrated positive ratings',
      };
    }

    // Bimodal distribution (lots of 5 and 1, nothing in middle) might indicate
    // fake positives competing with real negatives
    if (fiveStarPct > 50 && oneStarPct > 25 && middlePct < 15) {
      return {
        score: 0.35,
        detail: 'Polarized ratings with few middle reviews — possible fake positive campaign',
      };
    }

    return { score: 0.8, detail: null };
  }

  /**
   * Aggregate individual signal results into a category average
   */
  _aggregateSignals(signalArrays) {
    const aggregated = {};
    const counts = {};

    for (const signals of signalArrays) {
      for (const [key, value] of Object.entries(signals)) {
        if (value === null || value === undefined) continue;
        const score = typeof value === 'object' ? value.score : value;
        if (score === null || score === undefined) continue;

        if (!aggregated[key]) {
          aggregated[key] = 0;
          counts[key] = 0;
        }
        aggregated[key] += score;
        counts[key]++;
      }
    }

    const result = {};
    for (const key of Object.keys(aggregated)) {
      result[key] = {
        score: aggregated[key] / counts[key],
        detail: null,
      };
    }
    return result;
  }

  // ============================================================
  // DOM OBSERVATION
  // ============================================================

  /**
   * Watch for dynamically loaded reviews (Amazon lazy-loads them)
   */
  _observeForReviews() {
    const observer = new MutationObserver((mutations) => {
      const hasReviews = document.querySelector(SELECTORS.reviewList) || 
                         document.querySelectorAll(SELECTORS.reviewCard).length > 0;
      if (hasReviews) {
        observer.disconnect();
        this.run();
        this._observeForNewReviews();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Safety timeout — stop observing after 15 seconds
    setTimeout(() => observer.disconnect(), 15000);
  }

  /**
   * Persistent observer — watches for new review cards added to the DOM
   * Triggers when user clicks "Show More Reviews" or pages through reviews
   */
  _observeForNewReviews() {
    // Track which reviews we've already analyzed
    this._analyzedReviews = this._analyzedReviews || new Set();

    // Mark currently visible reviews as analyzed
    document.querySelectorAll(SELECTORS.reviewCard).forEach(el => {
      this._analyzedReviews.add(el);
    });

    // Debounce timer to batch rapid DOM changes
    let debounceTimer = null;

    const observer = new MutationObserver((mutations) => {
      // Check if any new review cards appeared
      const allReviews = document.querySelectorAll(SELECTORS.reviewCard);
      let hasNew = false;
      for (const el of allReviews) {
        if (!this._analyzedReviews.has(el)) {
          hasNew = true;
          break;
        }
      }

      if (hasNew) {
        // Debounce — wait 500ms for DOM to settle before analyzing
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this._analyzeNewReviews();
        }, 500);
      }
    });

    // Watch the review list container and its parents for changes
    const reviewList = document.querySelector(SELECTORS.reviewList);
    const watchTarget = reviewList?.parentNode || document.body;

    observer.observe(watchTarget, {
      childList: true,
      subtree: true,
    });

    // Also watch for full page content swaps (Amazon sometimes replaces entire sections)
    document.addEventListener('click', (e) => {
      const target = e.target;
      // Detect clicks on pagination or "Show More" buttons
      if (target.closest('[data-hook="see-all-reviews-link-foot"]') ||
          target.closest('.a-pagination') ||
          target.closest('[data-action="reviews:page-action"]') ||
          target.textContent?.includes('See more reviews') ||
          target.textContent?.includes('Next page')) {
        // Wait for new content to load then analyze
        setTimeout(() => this._analyzeNewReviews(), 1500);
      }
    });
  }

  /**
   * Analyze only newly added reviews without re-processing existing ones
   */
  _analyzeNewReviews() {
    if (this.isRunning) return;

    const allReviews = document.querySelectorAll(SELECTORS.reviewCard);
    const newElements = [];

    for (const el of allReviews) {
      if (!this._analyzedReviews.has(el)) {
        newElements.push(el);
        this._analyzedReviews.add(el);
      }
    }

    if (newElements.length === 0) return;

    this.isRunning = true;

    try {
      // Extract and analyze only new reviews
      const reviews = [];
      for (const el of newElements) {
        const review = this._extractSingleReview(el);
        if (review) reviews.push(review);
      }

      if (reviews.length === 0) {
        this.isRunning = false;
        return;
      }

      const productMeta = this._extractProductMeta();

      for (const review of reviews) {
        const textResult = this.textAnalyzer.analyze(review.text);
        const accountResult = this.accountAnalyzer.analyze(review.profile);

        const signals = {
          text: textResult,
          account: accountResult,
          behavioral: {},
        };

        const result = this.trustScorer.computeScore(signals);
        this.renderer.renderReviewBadge(result, review.element);
      }
    } catch (error) {
      console.error('[DID] New review analysis error:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Extract a single review from a DOM element
   */
  _extractSingleReview(el) {
    try {
      const bodyEl = el.querySelector(SELECTORS.reviewBody);
      const titleEl = el.querySelector(SELECTORS.reviewTitle);
      const ratingEl = el.querySelector(SELECTORS.reviewRating);
      const dateEl = el.querySelector(SELECTORS.reviewDate);
      const nameEl = el.querySelector(SELECTORS.reviewerName);
      const verifiedEl = el.querySelector(SELECTORS.verifiedPurchase);
      const helpfulEl = el.querySelector(SELECTORS.helpfulCount);

      const text = [
        titleEl?.textContent?.trim() || '',
        bodyEl?.textContent?.trim() || '',
      ].join(' ').trim();

      if (!text) return null;

      const ratingText = ratingEl?.textContent || '';
      const ratingMatch = ratingText.match(/([\d.]+)\s*out\s*of\s*5/);
      const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

      const dateText = dateEl?.textContent || '';
      const dateMatch = dateText.match(/on\s+(.+)$/);
      const reviewDate = dateMatch ? dateMatch[1].trim() : null;

      const helpfulText = helpfulEl?.textContent || '';
      const helpfulMatch = helpfulText.match(/(\d+)\s+people?\s+found/);
      const helpfulCount = helpfulMatch ? parseInt(helpfulMatch[1]) : 0;

      const profile = new ReviewerProfile({
        displayName: nameEl?.textContent?.trim() || null,
        verifiedPurchase: !!verifiedEl,
        helpfulVotes: helpfulCount,
        reviewDate: reviewDate,
        ratings: rating !== null ? [rating] : [],
      });

      return { text, rating, date: reviewDate, profile, element: el };
    } catch (e) {
      console.warn('[DID] Failed to extract review:', e);
      return null;
    }
  }
}

// ============================================================
// MESSAGE HANDLING
// ============================================================
let lastPageScore = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_PAGE_SCORE') {
    sendResponse({
      score: lastPageScore?.toJSON() || null,
      platform: 'amazon',
    });
  }
});

// ============================================================
// INITIALIZATION
// ============================================================
const analyzer = new AmazonAnalyzer();

// Patch run() to store last score
const originalRun = analyzer.run.bind(analyzer);
analyzer.run = async function() {
  await originalRun();
  // Capture score after run completes — grab from the badge message we sent
};

analyzer.init();
