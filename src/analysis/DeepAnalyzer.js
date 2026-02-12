/**
 * DeepAnalyzer - API-powered analysis for Pro tier
 *
 * Uses Claude API for deeper content analysis when local signals are ambiguous.
 * Only called when:
 * 1. User is on Pro plan
 * 2. Local analysis returned MODERATE_TRUST (ambiguous)
 * 3. User explicitly requests deep scan
 *
 * Keeps API costs low by being selective about when to call.
 */

const API_ENDPOINT = 'https://api.anthropic.com/v1/messages';

export class DeepAnalyzer {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.model = 'claude-sonnet-4-20250514'; // Cost-effective for classification
    this.maxTokens = 500;
    this.callCount = 0;
    this.dailyLimit = 50; // Per-user daily API call limit
  }

  /**
   * Deep analysis of a single piece of content
   * @param {string} text - Content to analyze
   * @param {Object} context - Additional context (platform, ratings, etc.)
   * @returns {Object} Enhanced analysis signals
   */
  async analyzeContent(text, context = {}) {
    if (!this.apiKey) {
      return { available: false, reason: 'API key not configured' };
    }

    if (this.callCount >= this.dailyLimit) {
      return { available: false, reason: 'Daily analysis limit reached' };
    }

    try {
      const prompt = this._buildAnalysisPrompt(text, context);
      const response = await this._callAPI(prompt);
      this.callCount++;

      return this._parseResponse(response);
    } catch (error) {
      console.error('DeepAnalyzer error:', error);
      return { available: false, reason: 'Analysis failed' };
    }
  }

  _buildAnalysisPrompt(text, context) {
    return `You are a content authenticity analyst. Analyze the following ${context.type || 'content'} and return a JSON assessment.

CONTENT:
"""
${text.slice(0, 2000)}
"""

${context.platform ? `PLATFORM: ${context.platform}` : ''}
${context.rating ? `RATING: ${context.rating}/5 stars` : ''}
${context.otherReviewCount ? `OTHER REVIEWS ON SAME ITEM: ${context.otherReviewCount}` : ''}

Analyze for:
1. AI generation likelihood (0-1 scale)
2. Fake/incentivized review likelihood (0-1 scale)
3. Emotional authenticity (does this sound like a real experience?)
4. Specific red flags found
5. Specific authenticity markers found

Respond ONLY with valid JSON:
{
  "aiLikelihood": 0.0,
  "fakeLikelihood": 0.0,
  "emotionalAuthenticity": 0.0,
  "redFlags": [],
  "authenticityMarkers": [],
  "summary": "one sentence assessment"
}`;
  }

  async _callAPI(prompt) {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  }

  _parseResponse(apiResponse) {
    try {
      const text = apiResponse.content[0].text;
      const cleaned = text.replace(/```json\n?|```/g, '').trim();
      const result = JSON.parse(cleaned);

      return {
        available: true,
        aiDetection: { score: 1 - result.aiLikelihood, detail: null },
        fakeDetection: { score: 1 - result.fakeLikelihood, detail: null },
        emotionalAuth: { score: result.emotionalAuthenticity, detail: null },
        redFlags: result.redFlags || [],
        authenticityMarkers: result.authenticityMarkers || [],
        summary: result.summary,
      };
    } catch (e) {
      return { available: false, reason: 'Failed to parse analysis' };
    }
  }

  /**
   * Reset daily counter (called by alarm in background script)
   */
  resetDailyCount() {
    this.callCount = 0;
  }
}
