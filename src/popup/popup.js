/**
 * Popup Script
 * Communicates with background and content scripts to display
 * current page analysis in the extension popup.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const contentEl = document.getElementById('content');
  const toggleBtn = document.getElementById('toggleBtn');
  const usageDisplay = document.getElementById('usageDisplay');

  // Load settings
  const settings = await sendMessage({ type: 'GET_SETTINGS' });
  updateToggle(settings.enabled);

  // Load usage
  const usage = await sendMessage({ type: 'GET_USAGE' });
  const limit = settings.tier === 'free' ? 50 : '∞';
  usageDisplay.textContent = `${usage.scans || 0}/${limit} scans today`;

  // Toggle button
  toggleBtn.addEventListener('click', async () => {
    const current = await sendMessage({ type: 'GET_SETTINGS' });
    const updated = await sendMessage({
      type: 'UPDATE_SETTINGS',
      data: { enabled: !current.enabled },
    });
    updateToggle(updated.enabled);
  });

  // Get current tab and check for cached score
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;

  // Try to get current page score from content script
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_SCORE' });
    if (response?.score) {
      renderScore(contentEl, response.score, response.platform);
      return;
    }
  } catch (e) {
    // Content script not loaded on this page
  }

  // Check if this is a supported platform
  const platform = detectPlatform(tab.url);
  if (!platform) {
    contentEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🌐</div>
        <div class="empty-text">
          This page isn't currently supported.<br>
          Supported: Amazon, Reddit, Google Maps
        </div>
      </div>
    `;
  }
});

function renderScore(container, score, platform) {
  const scorePercent = score.score !== null ? Math.round(score.score * 100) : '?';
  const color = getColor(score.level);
  const label = getLabel(score.level);

  let issuesHtml = '';
  if (score.issues && score.issues.length > 0) {
    issuesHtml = `
      <div class="issues">
        <div class="issues-title">Flagged Concerns</div>
        ${score.issues.slice(0, 5).map(issue => `
          <div class="issue-item">
            <div class="issue-dot ${issue.severity}"></div>
            <div>${issue.detail || formatSignal(issue.signal)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  container.innerHTML = `
    <div class="score-section">
      ${platform ? `<div class="platform-badge">${platform}</div>` : ''}
      <div class="score-ring" style="color: ${color}; border-color: ${color}30">
        ${scorePercent}${score.score !== null ? '' : ''}
      </div>
      <div class="score-label" style="color: ${color}">${label}</div>
      <div class="score-message">${score.message || ''}</div>
    </div>
    <div class="stats">
      <div class="stat">
        <div class="stat-value">${score.signalCount || 0}</div>
        <div class="stat-label">Signals Analyzed</div>
      </div>
      <div class="stat">
        <div class="stat-value">${Math.round((score.confidence || 0) * 100)}%</div>
        <div class="stat-label">Confidence</div>
      </div>
    </div>
    ${issuesHtml}
  `;
}

function updateToggle(enabled) {
  const btn = document.getElementById('toggleBtn');
  btn.textContent = enabled ? 'ON' : 'OFF';
  btn.className = `toggle ${enabled ? 'on' : 'off'}`;
}

function detectPlatform(url) {
  if (url.includes('amazon.com')) return 'amazon';
  if (url.includes('reddit.com')) return 'reddit';
  if (url.includes('google.com/maps') || url.includes('maps.google.com')) return 'google maps';
  return null;
}

function getColor(level) {
  const colors = {
    HIGH_TRUST: '#22c55e',
    MODERATE_TRUST: '#eab308',
    LOW_TRUST: '#f97316',
    VERY_LOW_TRUST: '#ef4444',
    INSUFFICIENT_DATA: '#6b7280',
  };
  return colors[level] || '#6b7280';
}

function getLabel(level) {
  const labels = {
    HIGH_TRUST: 'Likely Authentic',
    MODERATE_TRUST: 'Mixed Signals',
    LOW_TRUST: 'Questionable',
    VERY_LOW_TRUST: 'Likely Inauthentic',
    INSUFFICIENT_DATA: 'Insufficient Data',
  };
  return labels[level] || 'Unknown';
}

function formatSignal(signal) {
  return signal.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, resolve);
  });
}
