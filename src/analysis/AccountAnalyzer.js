/**
 * AccountAnalyzer - Evaluate source/account credibility
 *
 * Analyzes reviewer and account metadata to assess legitimacy.
 * Works with data scraped from the page DOM — no external API calls.
 *
 * Key signals:
 * - Account age relative to review activity
 * - Posting frequency patterns (burst vs organic)
 * - Review diversity (all 5-star? all same category?)
 * - Profile completeness
 * - Verified purchase indicators
 */

export class AccountAnalyzer {
  constructor() {
    // Suspicious patterns
    this.suspiciousPatterns = {
      burstThreshold: 5,          // Reviews posted in same day
      minAccountAgeDays: 30,      // Accounts younger than this are flagged
      allSameRatingThreshold: 0.9, // If 90%+ reviews are same rating
      reviewsPerDayMax: 3,        // More than this per day is unusual
    };
  }

  /**
   * Analyze a single reviewer's credibility
   * @param {ReviewerProfile} profile - Extracted reviewer data
   * @returns {Object} Account signal scores
   */
  analyze(profile) {
    return {
      accountAge: this._scoreAccountAge(profile),
      postingFrequency: this._scorePostingFrequency(profile),
      reviewDiversity: this._scoreReviewDiversity(profile),
      profileCompleteness: this._scoreProfileCompleteness(profile),
      networkConnections: this._scoreNetworkSignals(profile),
    };
  }

  /**
   * Analyze a batch of reviewers for coordinated behavior
   * @param {ReviewerProfile[]} profiles
   * @returns {Object}
   */
  analyzeBatch(profiles) {
    const individual = profiles.map(p => this.analyze(p));

    const batchSignals = {
      timingCluster: this._detectTimingClusters(profiles),
      accountAgeCluster: this._detectAccountAgeCluster(profiles),
    };

    return { individual, batch: batchSignals };
  }

  _scoreAccountAge(profile) {
    if (!profile.accountCreated && !profile.firstReviewDate) {
      return null; // Can't determine
    }

    const referenceDate = profile.accountCreated || profile.firstReviewDate;
    const ageDays = (Date.now() - new Date(referenceDate).getTime()) / (1000 * 60 * 60 * 24);

    if (ageDays < 7) {
      return { score: 0.1, detail: 'Account created within the last week' };
    }
    if (ageDays < 30) {
      return { score: 0.3, detail: 'Account less than 30 days old' };
    }
    if (ageDays < 90) {
      return { score: 0.6, detail: null };
    }

    return { score: 0.9, detail: null };
  }

  _scorePostingFrequency(profile) {
    if (!profile.reviewDates || profile.reviewDates.length < 2) {
      return null;
    }

    const dates = profile.reviewDates
      .map(d => new Date(d))
      .sort((a, b) => a - b);

    // Check for burst posting (many reviews same day)
    const dateCounts = {};
    for (const date of dates) {
      const key = date.toISOString().split('T')[0];
      dateCounts[key] = (dateCounts[key] || 0) + 1;
    }

    const maxInOneDay = Math.max(...Object.values(dateCounts));
    const avgPerDay = dates.length / Object.keys(dateCounts).length;

    if (maxInOneDay > this.suspiciousPatterns.burstThreshold) {
      return {
        score: 0.15,
        detail: `${maxInOneDay} reviews posted on a single day`,
      };
    }

    if (avgPerDay > this.suspiciousPatterns.reviewsPerDayMax) {
      return {
        score: 0.3,
        detail: 'Unusually high review frequency',
      };
    }

    // Organic posting pattern
    return { score: 0.8, detail: null };
  }

  _scoreReviewDiversity(profile) {
    if (!profile.ratings || profile.ratings.length < 3) {
      return null;
    }

    const ratings = profile.ratings;
    const ratingCounts = {};
    for (const r of ratings) {
      ratingCounts[r] = (ratingCounts[r] || 0) + 1;
    }

    // Check if overwhelmingly one rating
    const maxRatingPct = Math.max(...Object.values(ratingCounts)) / ratings.length;

    if (maxRatingPct >= this.suspiciousPatterns.allSameRatingThreshold) {
      const dominantRating = Object.entries(ratingCounts)
        .sort(([, a], [, b]) => b - a)[0][0];
      return {
        score: 0.2,
        detail: `${Math.round(maxRatingPct * 100)}% of reviews are ${dominantRating}-star`,
      };
    }

    // Check category diversity
    if (profile.reviewCategories) {
      const uniqueCategories = new Set(profile.reviewCategories).size;
      const categoryDiversity = uniqueCategories / profile.reviewCategories.length;

      if (categoryDiversity < 0.1 && profile.reviewCategories.length > 10) {
        return {
          score: 0.35,
          detail: 'Reviews concentrated in a single product category',
        };
      }
    }

    // Good diversity
    const ratingSpread = Object.keys(ratingCounts).length;
    const diversityScore = Math.min(1, (ratingSpread / 5) * 0.5 + (1 - maxRatingPct) * 0.5);

    return { score: Math.max(0.4, diversityScore), detail: null };
  }

  _scoreProfileCompleteness(profile) {
    let completeness = 0;
    const fields = [
      'displayName',
      'avatarUrl',
      'bio',
      'location',
      'helpfulVotes',
      'totalReviews',
    ];

    for (const field of fields) {
      if (profile[field]) completeness++;
    }

    const score = completeness / fields.length;

    if (score < 0.3) {
      return {
        score: 0.3,
        detail: 'Minimal profile information',
      };
    }

    return { score: Math.max(0.5, score), detail: null };
  }

  _scoreNetworkSignals(profile) {
    // Helpful vote ratio — real reviewers accumulate helpful votes over time
    if (profile.helpfulVotes !== undefined && profile.totalReviews) {
      const helpfulRatio = profile.helpfulVotes / profile.totalReviews;

      if (helpfulRatio < 0.1 && profile.totalReviews > 20) {
        return {
          score: 0.4,
          detail: 'Very low helpful vote ratio despite many reviews',
        };
      }

      if (helpfulRatio > 1) {
        return { score: 0.9, detail: null };
      }
    }

    return null;
  }

  /**
   * Detect timing clusters — multiple reviewers posting around the same time
   * Strong indicator of coordinated campaigns
   */
  _detectTimingClusters(profiles) {
    const reviewDates = [];
    for (const profile of profiles) {
      if (profile.reviewDate) {
        reviewDates.push(new Date(profile.reviewDate).getTime());
      }
    }

    if (reviewDates.length < 5) return null;

    reviewDates.sort((a, b) => a - b);

    // Find clusters (reviews within 24 hours of each other)
    const clusters = [];
    let currentCluster = [reviewDates[0]];

    for (let i = 1; i < reviewDates.length; i++) {
      if (reviewDates[i] - reviewDates[i - 1] < 86400000) { // 24 hours
        currentCluster.push(reviewDates[i]);
      } else {
        if (currentCluster.length >= 3) {
          clusters.push(currentCluster);
        }
        currentCluster = [reviewDates[i]];
      }
    }
    if (currentCluster.length >= 3) {
      clusters.push(currentCluster);
    }

    if (clusters.length === 0) {
      return { score: 0.8, detail: null };
    }

    const largestCluster = Math.max(...clusters.map(c => c.length));
    const clusterRatio = largestCluster / reviewDates.length;

    if (clusterRatio > 0.5) {
      return {
        score: 0.15,
        detail: `${largestCluster} of ${reviewDates.length} reviews posted within 24 hours of each other`,
      };
    }

    return {
      score: Math.max(0.3, 1 - clusterRatio),
      detail: clusterRatio > 0.3
        ? `Review timing shows clustering patterns`
        : null,
    };
  }

  /**
   * Detect if reviewer accounts were all created around the same time
   */
  _detectAccountAgeCluster(profiles) {
    const creationDates = profiles
      .filter(p => p.accountCreated)
      .map(p => new Date(p.accountCreated).getTime());

    if (creationDates.length < 3) return null;

    creationDates.sort((a, b) => a - b);

    // Check if most accounts created within same week
    const range = creationDates[creationDates.length - 1] - creationDates[0];
    const weekMs = 7 * 86400000;

    if (range < weekMs && creationDates.length >= 5) {
      return {
        score: 0.1,
        detail: `${creationDates.length} reviewer accounts created within the same week`,
      };
    }

    return { score: 0.7, detail: null };
  }
}

/**
 * Data structure for reviewer profile information
 * Extracted from page DOM by platform-specific scrapers
 */
export class ReviewerProfile {
  constructor(data = {}) {
    this.displayName = data.displayName || null;
    this.avatarUrl = data.avatarUrl || null;
    this.bio = data.bio || null;
    this.location = data.location || null;
    this.accountCreated = data.accountCreated || null;
    this.firstReviewDate = data.firstReviewDate || null;
    this.totalReviews = data.totalReviews || null;
    this.helpfulVotes = data.helpfulVotes || null;
    this.ratings = data.ratings || [];             // Array of star ratings
    this.reviewDates = data.reviewDates || [];     // Array of ISO date strings
    this.reviewCategories = data.reviewCategories || [];
    this.reviewDate = data.reviewDate || null;     // Date of the specific review being analyzed
    this.verifiedPurchase = data.verifiedPurchase || false;
  }
}
