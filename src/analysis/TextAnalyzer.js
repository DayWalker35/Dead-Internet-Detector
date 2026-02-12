/**
 * TextAnalyzer - Local text authenticity analysis
 *
 * Runs entirely in the browser. No API calls needed for basic analysis.
 * Detects patterns common in AI-generated and fake content:
 * - Statistical token distribution anomalies
 * - Repetitive phrasing and template usage
 * - Unnatural sentiment patterns
 * - Vocabulary distribution red flags
 */

export class TextAnalyzer {
  constructor() {
    // Common AI "tell" phrases - overused by LLMs
    // Removed common English words that cause false positives
    this.aiTellPhrases = [
      'it\'s worth noting',
      'it is worth noting',
      'a testament to',
      'game-changer',
      'game changer',
      'delve into',
      'tapestry',
      'multifaceted',
      'in today\'s world',
      'in the realm of',
      'navigating the',
      'stands out as',
      'it should be noted',
      'in this regard',
      'underscores',
      'fostering',
      'holistic',
      'elevate the',
      'elevates the',
      'truly remarkable',
      'new heights',
      'commitment to excellence',
      'user experience',
      'attention to detail is',
      'works flawlessly',
      'couldn\'t be happier',
      'changed my daily routine',
      'both elegant and practical',
    ];

    // Superlative/filler phrases that real people rarely stack together
    this.hypeWords = [
      'amazing', 'incredible', 'fantastic', 'exceptional', 'remarkable',
      'outstanding', 'unbeatable', 'flawlessly', 'truly', 'absolutely',
      'every way', 'everyone', 'definitely', 'certainly',
    ];

    // Template phrases common in fake reviews
    this.fakeReviewTemplates = [
      'i bought this for my',
      'i purchased this for',
      'my husband/wife loves',
      'exactly as described',
      'exactly what i needed',
      'highly recommend this product',
      'five stars all the way',
      'exceeded my expectations',
      'i was skeptical at first but',
      'worth every penny',
      'great quality for the price',
      'you won\'t be disappointed',
      'must have product',
      'i\'ve tried many similar products',
      'this is by far the best',
      'don\'t hesitate to buy',
      'arrived quickly and well packaged',
    ];
  }

  /**
   * Run all text analysis signals
   * @param {string} text - The content to analyze
   * @returns {Object} Signal scores for each analysis type
   */
  analyze(text) {
    if (!text || text.length < 20) {
      return {
        aiDetection: null,
        repetitionPattern: null,
        sentimentConsistency: null,
        vocabularyDistribution: null,
        templateMatching: null,
      };
    }

    const normalized = text.toLowerCase().trim();

    return {
      aiDetection: this._detectAIPatterns(normalized),
      repetitionPattern: this._analyzeRepetition(normalized),
      sentimentConsistency: this._analyzeSentiment(normalized),
      vocabularyDistribution: this._analyzeVocabulary(normalized),
      templateMatching: this._detectTemplates(normalized),
    };
  }

  /**
   * Detect AI-generated text patterns
   * Uses phrase frequency analysis rather than unreliable perplexity scoring
   */
  _detectAIPatterns(text) {
    let aiPhraseCount = 0;
    const foundPhrases = [];

    for (const phrase of this.aiTellPhrases) {
      const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = text.match(regex);
      if (matches) {
        aiPhraseCount += matches.length;
        foundPhrases.push(phrase);
      }
    }

    // Normalize by text length (per 500 chars)
    const density = (aiPhraseCount / (text.length / 500));

    // Check hype word density — stacking superlatives is a red flag
    let hypeCount = 0;
    for (const word of this.hypeWords) {
      const regex = new RegExp('\\b' + word + '\\b', 'gi');
      const matches = text.match(regex);
      if (matches) hypeCount += matches.length;
    }
    const hypeDensity = hypeCount / (text.length / 500);

    // Combine AI phrases and hype density
    let score = 1;
    // AI tell phrases
    if (aiPhraseCount > 0) {
      score -= Math.min(0.5, density * 0.25);
    }
    // Hype stacking — more than 3 per 500 chars is suspicious
    if (hypeDensity > 3) {
      score -= Math.min(0.4, (hypeDensity - 2) * 0.1);
    }

    score = Math.max(0, Math.min(1, score));

    return {
      score,
      detail: foundPhrases.length > 0 || hypeCount > 3
        ? `Found ${aiPhraseCount} AI-associated phrases, ${hypeCount} hype words`
        : null,
    };
  }

  /**
   * Analyze text for repetitive patterns and formulaic structure
   * Fake content often reuses phrases, structures, or sentence patterns
   */
  _analyzeRepetition(text) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);

    if (sentences.length < 2) return { score: 0.5, detail: null };

    // Check for repeated n-grams (3-word sequences)
    const trigrams = this._extractNgrams(text, 3);
    const trigramCounts = {};
    for (const gram of trigrams) {
      trigramCounts[gram] = (trigramCounts[gram] || 0) + 1;
    }

    const repeatedTrigrams = Object.values(trigramCounts)
      .filter(count => count > 2).length;
    const trigramRepetitionRate = repeatedTrigrams / Math.max(1, trigrams.length);

    // Check for similar sentence starts
    const starts = sentences.map(s => s.trim().split(/\s+/).slice(0, 3).join(' '));
    const uniqueStarts = new Set(starts).size;
    const startDiversity = uniqueStarts / starts.length;

    // Check for formulaic sentence structure
    // Fake reviews tend to follow: Statement. Statement. Statement. Call to action.
    // Each sentence is self-contained praise with no narrative flow
    let formulaicScore = 0;
    const avgSentenceLength = sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0) / sentences.length;
    const sentenceLengthVariance = sentences.reduce((sum, s) => {
      const len = s.trim().split(/\s+/).length;
      return sum + Math.pow(len - avgSentenceLength, 2);
    }, 0) / sentences.length;

    // Very uniform sentence lengths = formulaic
    if (sentenceLengthVariance < 8 && sentences.length >= 3) {
      formulaicScore = 0.3;
    }

    // Check if sentences are all self-contained praise (no connective tissue)
    const connectives = ['because', 'since', 'so', 'which', 'where', 'when', 'after', 'before', 'while', 'then'];
    let connectiveCount = 0;
    for (const word of text.split(/\s+/)) {
      if (connectives.includes(word.toLowerCase().replace(/[^a-z]/g, ''))) connectiveCount++;
    }
    // Long text with zero connective words = list of statements, not narrative
    if (connectiveCount === 0 && sentences.length >= 4) {
      formulaicScore += 0.2;
    }

    // Combine signals
    let score = 1;
    score -= (1 - startDiversity) * 0.3;
    score -= Math.min(0.3, trigramRepetitionRate * 50 * 0.3);
    score -= formulaicScore;

    return {
      score: Math.max(0, Math.min(1, score)),
      detail: score < 0.5
        ? `Formulaic structure detected: ${repeatedTrigrams} repeated phrases, low sentence variation`
        : null,
    };
  }

  /**
   * Basic sentiment consistency check
   * Fake reviews tend to be uniformly positive without nuance
   */
  _analyzeSentiment(text) {
    const positiveWords = [
      'great', 'amazing', 'excellent', 'perfect', 'love', 'best', 'wonderful',
      'fantastic', 'awesome', 'incredible', 'superb', 'outstanding', 'brilliant',
      'magnificent', 'terrific', 'fabulous', 'happy', 'recommend',
    ];
    const negativeWords = [
      'bad', 'terrible', 'awful', 'worst', 'hate', 'horrible', 'poor',
      'disappointing', 'broken', 'waste', 'junk', 'useless', 'defective',
      'cheap', 'flimsy', 'garbage',
    ];
    const hedgingWords = [
      'but', 'however', 'although', 'though', 'except', 'unless',
      'somewhat', 'slightly', 'minor', 'small issue', 'only complaint',
      'downside', 'only', 'wish', 'could be', 'not perfect',
    ];
    // Specificity markers — real reviews mention concrete details
    const specificityMarkers = [
      /\d+\s*(inch|mm|cm|lb|kg|oz|gb|mb|watt|hour|day|week|month|minute)/i,
      /\d+\/\d+/,           // fractions or dates
      /\$\d+/,              // prices
      /[A-Z][a-z]+ [A-Z]/,  // proper nouns
      /my (wife|husband|son|daughter|mom|dad|friend|sister|brother|kid)/i,
    ];

    const words = text.split(/\s+/);
    const wordCount = words.length;

    let posCount = 0, negCount = 0, hedgeCount = 0;
    for (const word of words) {
      const clean = word.replace(/[^a-z]/g, '');
      if (positiveWords.includes(clean)) posCount++;
      if (negativeWords.includes(clean)) negCount++;
      if (hedgingWords.includes(clean)) hedgeCount++;
    }

    const posDensity = posCount / wordCount;

    // Check for specificity — real reviews have concrete details
    let specificityScore = 0;
    for (const marker of specificityMarkers) {
      if (marker.test(text)) specificityScore++;
    }

    // Uniformly positive + no hedging + no specifics = likely fake
    if (posDensity > 0.06 && hedgeCount === 0 && negCount === 0 && specificityScore === 0) {
      return {
        score: 0.15,
        detail: 'Uniformly positive with no nuance or specific details',
      };
    }

    // High positive density even with a token hedge but no real specifics
    if (posDensity > 0.08 && specificityScore === 0) {
      return {
        score: 0.30,
        detail: 'Very high praise density without concrete details',
      };
    }

    // Positive but at least has some substance or hedging
    if (posDensity > 0.06 && hedgeCount === 0 && negCount === 0 && specificityScore > 0) {
      return {
        score: 0.45,
        detail: 'Positive without hedging but contains specific details',
      };
    }

    // Some hedging and balanced sentiment = more authentic
    if (hedgeCount > 0 || (posCount > 0 && negCount > 0)) {
      return { score: 0.85, detail: null };
    }

    // Neutral/short reviews
    return { score: 0.6, detail: null };
  }

  /**
   * Vocabulary distribution analysis
   * AI text tends to have unnaturally uniform vocabulary distribution
   * Human text has more variation and personality
   */
  _analyzeVocabulary(text) {
    const words = text.split(/\s+/).map(w => w.replace(/[^a-z]/g, '')).filter(w => w.length > 2);

    if (words.length < 20) return { score: 0.5, detail: null };

    const uniqueWords = new Set(words);
    const typeTokenRatio = uniqueWords.size / words.length;

    // Check for vagueness — fake reviews use generic words, real reviews use specific nouns
    const vagueWords = new Set([
      'product', 'item', 'thing', 'purchase', 'quality', 'price',
      'everything', 'everyone', 'anyone', 'nothing', 'something',
      'ever', 'always', 'never', 'every', 'very', 'really', 'just',
      'amazing', 'great', 'good', 'nice', 'best', 'love', 'happy',
    ]);
    let vagueCount = 0;
    for (const word of words) {
      if (vagueWords.has(word)) vagueCount++;
    }
    const vagueDensity = vagueCount / words.length;

    let score;
    if (typeTokenRatio > 0.85 && words.length > 100) {
      score = 0.5;
    } else if (typeTokenRatio < 0.3) {
      score = 0.35;
    } else {
      score = 0.7 + (typeTokenRatio * 0.2);
    }

    // High vagueness penalty
    if (vagueDensity > 0.20) {
      score -= 0.35;
    } else if (vagueDensity > 0.15) {
      score -= 0.2;
    }

    // Check for unusual word length distribution
    const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
    const wordLengthVariance = words.reduce((sum, w) => sum + Math.pow(w.length - avgWordLength, 2), 0) / words.length;

    if (wordLengthVariance < 3) {
      score *= 0.8;
    }

    return {
      score: Math.max(0, Math.min(1, score)),
      detail: score < 0.4 ? `Vocabulary lacks specificity (${Math.round(vagueDensity * 100)}% generic words)` : null,
    };
  }

  /**
   * Detect known fake review templates
   */
  _detectTemplates(text) {
    let matchCount = 0;
    const matchedTemplates = [];

    for (const template of this.fakeReviewTemplates) {
      if (text.includes(template)) {
        matchCount++;
        matchedTemplates.push(template);
      }
    }

    // More than 2 template matches in one review is very suspicious
    const score = Math.max(0, 1 - (matchCount * 0.3));

    return {
      score,
      detail: matchCount > 0
        ? `Matched ${matchCount} common fake review template phrase${matchCount > 1 ? 's' : ''}`
        : null,
    };
  }

  /**
   * Extract n-grams from text
   */
  _extractNgrams(text, n) {
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const ngrams = [];
    for (let i = 0; i <= words.length - n; i++) {
      ngrams.push(words.slice(i, i + n).join(' '));
    }
    return ngrams;
  }
}

/**
 * Batch text analyzer for processing multiple reviews at once
 * Detects coordinated patterns across a SET of reviews
 */
export class BatchTextAnalyzer {
  constructor() {
    this.singleAnalyzer = new TextAnalyzer();
  }

  /**
   * Analyze a batch of texts (e.g., all reviews on a product page)
   * Looks for coordination patterns across the batch
   */
  analyzeBatch(texts) {
    // Individual analysis
    const individual = texts.map(t => this.singleAnalyzer.analyze(t));

    // Cross-review analysis
    const crossSignals = this._analyzeCrossPatterns(texts);

    return {
      individual,
      batch: crossSignals,
    };
  }

  /**
   * Detect patterns across multiple texts that suggest coordination
   */
  _analyzeCrossPatterns(texts) {
    if (texts.length < 3) {
      return { coordinatedLanguage: null, ratingDistribution: null, timingCluster: null };
    }

    // Check for similar phrasing across reviews
    const sharedPhrases = this._findSharedPhrases(texts);
    const coordinationScore = Math.max(0, 1 - (sharedPhrases.length * 0.15));

    return {
      coordinatedLanguage: {
        score: coordinationScore,
        detail: sharedPhrases.length > 3
          ? `Found ${sharedPhrases.length} phrases repeated across multiple reviews`
          : null,
        sharedPhrases,
      },
    };
  }

  _findSharedPhrases(texts) {
    // Extract 4-grams from each text and find overlap
    const textGrams = texts.map(t => {
      const words = t.toLowerCase().split(/\s+/);
      const grams = new Set();
      for (let i = 0; i <= words.length - 4; i++) {
        grams.add(words.slice(i, i + 4).join(' '));
      }
      return grams;
    });

    const phraseCounts = {};
    for (const grams of textGrams) {
      for (const gram of grams) {
        phraseCounts[gram] = (phraseCounts[gram] || 0) + 1;
      }
    }

    // Phrases appearing in 3+ different reviews
    return Object.entries(phraseCounts)
      .filter(([_, count]) => count >= 3)
      .map(([phrase, count]) => ({ phrase, count }))
      .sort((a, b) => b.count - a.count);
  }
}
