/**
 * TrustScorer - Core scoring engine for Dead Internet Detector
 *
 * Combines multiple analysis signals into a weighted trust score.
 * Each signal returns a value between 0 (definitely fake) and 1 (definitely authentic).
 * Signals are weighted by reliability and combined into a final score.
 *
 * SCORING PHILOSOPHY:
 * - No single signal should condemn content (false positive prevention)
 * - Multiple weak signals converging = strong signal
 * - Conservative by default: only flag high-confidence detections
 * - "Likely" / "Possible" language, never "Definitely fake"
 */

export class TrustScorer {
  constructor(config = {}) {
    // Weights for each signal type (must sum to ~1.0 within each category)
    this.weights = {
      text: {
        aiDetection: 0.25,
        repetitionPattern: 0.20,
        sentimentConsistency: 0.15,
        vocabularyDistribution: 0.15,
        templateMatching: 0.25,
      },
      account: {
        accountAge: 0.30,
        postingFrequency: 0.25,
        reviewDiversity: 0.20,
        profileCompleteness: 0.15,
        networkConnections: 0.10,
      },
      behavioral: {
        timingCluster: 0.35,
        coordinatedLanguage: 0.35,
        ratingDistribution: 0.30,
      },
      media: {
        reverseImageMatch: 0.40,
        exifAnalysis: 0.25,
        aiArtifacts: 0.35,
      },
    };

    // Category weights for final score
    this.categoryWeights = {
      text: 0.30,
      account: 0.25,
      behavioral: 0.30,
      media: 0.15,
    };

    // Confidence thresholds
    this.thresholds = {
      HIGH_TRUST: 0.75,      // Green - likely authentic
      MODERATE_TRUST: 0.50,  // Yellow - mixed signals
      LOW_TRUST: 0.30,       // Orange - likely inauthentic
      VERY_LOW_TRUST: 0.15,  // Red - strong inauthenticity markers
    };

    this.config = {
      minSignalsRequired: 3,  // Need at least 3 signals to make a judgment
      confidenceDecay: 0.85,  // Reduce confidence when fewer signals available
      ...config,
    };
  }

  /**
   * Compute overall trust score from all available signals
   * @param {Object} signals - Results from various analyzers
   * @returns {TrustResult}
   */
  computeScore(signals) {
    const categoryScores = {};
    const flaggedIssues = [];
    let totalSignals = 0;

    // Score each category
    for (const [category, signalGroup] of Object.entries(signals)) {
      if (!this.weights[category]) continue;

      const categoryResult = this._scoreCatgory(
        category,
        signalGroup,
        this.weights[category]
      );

      if (categoryResult.signalCount > 0) {
        categoryScores[category] = categoryResult;
        totalSignals += categoryResult.signalCount;
        flaggedIssues.push(...categoryResult.issues);
      }
    }

    // Not enough data to make a judgment
    if (totalSignals < this.config.minSignalsRequired) {
      return new TrustResult({
        score: null,
        level: 'INSUFFICIENT_DATA',
        confidence: 0,
        message: 'Not enough data to assess authenticity',
        details: categoryScores,
        issues: [],
        signalCount: totalSignals,
      });
    }

    // Compute weighted final score
    let finalScore = 0;
    let weightSum = 0;

    for (const [category, result] of Object.entries(categoryScores)) {
      const weight = this.categoryWeights[category] || 0;
      finalScore += result.score * weight;
      weightSum += weight;
    }

    finalScore = weightSum > 0 ? finalScore / weightSum : 0.5;

    // Apply confidence decay for fewer signals
    const signalCoverage = totalSignals / 10; // 10 = theoretical max signals
    const confidence = Math.min(1, signalCoverage) * this.config.confidenceDecay;

    // Determine trust level
    const level = this._getTrustLevel(finalScore);

    // Generate human-readable summary
    const message = this._generateMessage(level, flaggedIssues, confidence);

    return new TrustResult({
      score: finalScore,
      level,
      confidence,
      message,
      details: categoryScores,
      issues: flaggedIssues,
      signalCount: totalSignals,
    });
  }

  _scoreCatgory(category, signals, weights) {
    let score = 0;
    let weightSum = 0;
    let signalCount = 0;
    const issues = [];

    for (const [signalName, signalValue] of Object.entries(signals)) {
      if (signalValue === null || signalValue === undefined) continue;

      const weight = weights[signalName] || 0;
      const normalizedValue = typeof signalValue === 'object'
        ? signalValue.score
        : signalValue;

      if (normalizedValue === null || normalizedValue === undefined) continue;

      score += normalizedValue * weight;
      weightSum += weight;
      signalCount++;

      // Track issues (signals below threshold)
      if (normalizedValue < 0.4) {
        issues.push({
          category,
          signal: signalName,
          score: normalizedValue,
          detail: typeof signalValue === 'object' ? signalValue.detail : null,
          severity: normalizedValue < 0.2 ? 'high' : 'medium',
        });
      }
    }

    return {
      score: weightSum > 0 ? score / weightSum : 0.5,
      signalCount,
      issues,
    };
  }

  _getTrustLevel(score) {
    if (score >= this.thresholds.HIGH_TRUST) return 'HIGH_TRUST';
    if (score >= this.thresholds.MODERATE_TRUST) return 'MODERATE_TRUST';
    if (score >= this.thresholds.LOW_TRUST) return 'LOW_TRUST';
    return 'VERY_LOW_TRUST';
  }

  _generateMessage(level, issues, confidence) {
    const confidenceQualifier = confidence < 0.5 ? 'Limited data suggests' : '';

    const messages = {
      HIGH_TRUST: 'This content appears authentic based on available signals.',
      MODERATE_TRUST: `Mixed signals detected. ${issues.length} potential concern${issues.length !== 1 ? 's' : ''} found.`,
      LOW_TRUST: `Multiple markers suggest this content may not be authentic. ${issues.length} concern${issues.length !== 1 ? 's' : ''} flagged.`,
      VERY_LOW_TRUST: `Strong indicators of inauthentic content detected. ${issues.length} significant concern${issues.length !== 1 ? 's' : ''} found.`,
    };

    const base = messages[level] || 'Unable to assess.';
    return confidenceQualifier ? `${confidenceQualifier}: ${base}` : base;
  }
}

/**
 * Immutable result object from trust scoring
 */
export class TrustResult {
  constructor({ score, level, confidence, message, details, issues, signalCount }) {
    this.score = score;
    this.level = level;
    this.confidence = confidence;
    this.message = message;
    this.details = details;
    this.issues = issues;
    this.signalCount = signalCount;
    this.timestamp = Date.now();

    Object.freeze(this);
  }

  /**
   * Get color code for UI display
   */
  get color() {
    const colors = {
      HIGH_TRUST: '#22c55e',       // Green
      MODERATE_TRUST: '#eab308',   // Yellow
      LOW_TRUST: '#f97316',        // Orange
      VERY_LOW_TRUST: '#ef4444',   // Red
      INSUFFICIENT_DATA: '#6b7280', // Gray
    };
    return colors[this.level] || '#6b7280';
  }

  /**
   * Get icon indicator for UI
   */
  get icon() {
    const icons = {
      HIGH_TRUST: '✓',
      MODERATE_TRUST: '⚠',
      LOW_TRUST: '⚠',
      VERY_LOW_TRUST: '✕',
      INSUFFICIENT_DATA: '?',
    };
    return icons[this.level] || '?';
  }

  /**
   * Serialize for storage/messaging
   */
  toJSON() {
    return {
      score: this.score,
      level: this.level,
      confidence: this.confidence,
      message: this.message,
      issues: this.issues,
      signalCount: this.signalCount,
      timestamp: this.timestamp,
    };
  }
}
