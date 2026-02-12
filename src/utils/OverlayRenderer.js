/**
 * OverlayRenderer - Injects trust score UI elements into web pages
 *
 * Design philosophy:
 * - Minimal and non-intrusive by default (small badge)
 * - Expandable on hover/click for details
 * - Consistent visual language across all platforms
 * - High contrast and accessible
 * - Never interferes with page functionality
 */

export class OverlayRenderer {
  constructor() {
    this.namespace = 'did'; // Dead Internet Detector — prefix all CSS classes
    this.initialized = false;
  }

  /**
   * Render the overall product/page trust badge
   * Fixed position element near the top of the review section
   */
  renderProductBadge(trustResult, productMeta) {
    // Remove existing badge if re-running
    const existing = document.querySelector(`.${this.namespace}-product-badge`);
    if (existing) existing.remove();

    const badge = document.createElement('div');
    badge.className = `${this.namespace}-product-badge`;
    badge.setAttribute('data-trust-level', trustResult.level);

    badge.innerHTML = `
      <div class="${this.namespace}-badge-compact">
        <span class="${this.namespace}-badge-icon" style="color: ${trustResult.color}">
          ${trustResult.icon}
        </span>
        <span class="${this.namespace}-badge-label">
          Review Authenticity: <strong>${this._getLevelLabel(trustResult.level)}</strong>
        </span>
        <span class="${this.namespace}-badge-score">
          ${trustResult.score !== null ? Math.round(trustResult.score * 100) + '%' : '—'}
        </span>
        <button class="${this.namespace}-badge-expand" aria-label="Show details">▾</button>
      </div>
      <div class="${this.namespace}-badge-details" style="display: none;">
        <div class="${this.namespace}-badge-message">${trustResult.message}</div>
        ${this._renderIssuesList(trustResult.issues)}
        <div class="${this.namespace}-badge-meta">
          Based on ${trustResult.signalCount} analysis signals · 
          Confidence: ${Math.round((trustResult.confidence || 0) * 100)}%
        </div>
        <div class="${this.namespace}-badge-disclaimer">
          Dead Internet Detector provides indicators, not definitive judgments. 
          Use your own judgment alongside these signals.
        </div>
      </div>
    `;

    // Toggle details on click
    const expandBtn = badge.querySelector(`.${this.namespace}-badge-expand`);
    const details = badge.querySelector(`.${this.namespace}-badge-details`);
    expandBtn.addEventListener('click', () => {
      const isHidden = details.style.display === 'none';
      details.style.display = isHidden ? 'block' : 'none';
      expandBtn.textContent = isHidden ? '▴' : '▾';
    });

    // Insert before review list
    const reviewSection = document.querySelector('#cm-cr-dp-review-list')
      || document.querySelector('#reviews-medley-footer');

    if (reviewSection) {
      reviewSection.parentNode.insertBefore(badge, reviewSection);
    } else {
      document.body.appendChild(badge);
    }
  }

  /**
   * Render individual review trust badge
   * Small inline indicator on each review
   */
  renderReviewBadge(trustResult, reviewElement) {
    if (!reviewElement) return;

    // Don't double-badge
    if (reviewElement.querySelector(`.${this.namespace}-review-badge`)) return;

    const badge = document.createElement('div');
    badge.className = `${this.namespace}-review-badge`;
    badge.setAttribute('data-trust-level', trustResult.level);

    const scoreDisplay = trustResult.score !== null
      ? Math.round(trustResult.score * 100) + '%'
      : '?';

    badge.innerHTML = `
      <span class="${this.namespace}-review-indicator" 
            style="background-color: ${trustResult.color}"
            title="${trustResult.message}">
        ${trustResult.icon} ${scoreDisplay}
      </span>
    `;

    // Add hover tooltip with details
    const tooltip = document.createElement('div');
    tooltip.className = `${this.namespace}-review-tooltip`;
    tooltip.innerHTML = `
      <div class="${this.namespace}-tooltip-title">
        Authenticity Score: ${scoreDisplay}
      </div>
      <div class="${this.namespace}-tooltip-message">${trustResult.message}</div>
      ${trustResult.issues.length > 0 ? `
        <ul class="${this.namespace}-tooltip-issues">
          ${trustResult.issues.slice(0, 3).map(issue => `
            <li class="${this.namespace}-tooltip-issue ${this.namespace}-severity-${issue.severity}">
              ${issue.detail || this._formatSignalName(issue.signal)}
            </li>
          `).join('')}
        </ul>
      ` : ''}
    `;

    badge.appendChild(tooltip);

    // Show tooltip on hover
    const indicator = badge.querySelector(`.${this.namespace}-review-indicator`);
    indicator.addEventListener('mouseenter', () => {
      tooltip.style.display = 'block';
    });
    indicator.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });

    // Insert at the top of the review
    reviewElement.style.position = 'relative';
    reviewElement.insertBefore(badge, reviewElement.firstChild);
  }

  // ============================================================
  // HELPERS
  // ============================================================

  _getLevelLabel(level) {
    const labels = {
      HIGH_TRUST: 'Likely Authentic',
      MODERATE_TRUST: 'Mixed Signals',
      LOW_TRUST: 'Questionable',
      VERY_LOW_TRUST: 'Likely Inauthentic',
      INSUFFICIENT_DATA: 'Insufficient Data',
    };
    return labels[level] || 'Unknown';
  }

  _renderIssuesList(issues) {
    if (!issues || issues.length === 0) {
      return '<div class="did-no-issues">No specific concerns flagged.</div>';
    }

    return `
      <ul class="${this.namespace}-issues-list">
        ${issues.map(issue => `
          <li class="${this.namespace}-issue ${this.namespace}-severity-${issue.severity}">
            <span class="${this.namespace}-issue-category">${this._formatCategory(issue.category)}</span>
            <span class="${this.namespace}-issue-detail">
              ${issue.detail || this._formatSignalName(issue.signal)}
            </span>
          </li>
        `).join('')}
      </ul>
    `;
  }

  _formatCategory(category) {
    const names = {
      text: 'Content',
      account: 'Reviewer',
      behavioral: 'Pattern',
      media: 'Media',
    };
    return names[category] || category;
  }

  _formatSignalName(signal) {
    return signal
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, s => s.toUpperCase())
      .trim();
  }
}
