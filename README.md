# Dead Internet Detector

> Browser extension that scores web content for authenticity in real-time. Detects fake reviews, AI-generated content, bot accounts, and coordinated inauthentic behavior.

## Architecture Overview

```
dead-internet-detector/
├── public/
│   └── manifest.json              # Chrome Extension Manifest V3
├── src/
│   ├── analysis/                  # Core analysis engine (platform-agnostic)
│   │   ├── TrustScorer.js         # Weighted signal combiner → trust score
│   │   ├── TextAnalyzer.js        # Local text analysis (AI detection, repetition, sentiment)
│   │   ├── AccountAnalyzer.js     # Reviewer/account credibility scoring
│   │   └── DeepAnalyzer.js        # Optional API-powered analysis (Pro tier)
│   │
│   ├── content/                   # Platform-specific content scripts
│   │   ├── amazon.js              # ★ MVP — Amazon review analysis
│   │   ├── reddit.js              # Phase 2 — Reddit bot/astroturf detection
│   │   ├── googlemaps.js          # Phase 2 — Google Maps review analysis
│   │   ├── universal.js           # Lightweight scanner for any webpage
│   │   └── overlay.css            # Injected UI styles (prefixed to avoid conflicts)
│   │
│   ├── background/
│   │   └── index.js               # Service worker: icon badges, messaging, alarms
│   │
│   ├── popup/
│   │   ├── popup.html             # Extension popup UI
│   │   ├── popup.js               # Popup logic
│   │   └── options.html           # Settings page
│   │
│   ├── utils/
│   │   ├── OverlayRenderer.js     # Injects trust score UI into web pages
│   │   └── StorageManager.js      # Cache, settings, usage tracking
│   │
│   └── assets/                    # Icons (generate before publishing)
│
├── tests/                         # Test files
├── package.json
├── webpack.config.js
└── README.md
```

## How It Works

### Signal Architecture

The extension uses a **multi-signal weighted scoring** approach. No single signal can condemn content — multiple weak signals converging create strong detection.

```
Page Content
    │
    ├── Text Signals (30% weight)
    │   ├── AI phrase detection (local)
    │   ├── Repetition pattern analysis
    │   ├── Sentiment consistency check
    │   ├── Vocabulary distribution
    │   └── Template phrase matching
    │
    ├── Account Signals (25% weight)
    │   ├── Account age scoring
    │   ├── Posting frequency patterns
    │   ├── Review diversity (rating spread)
    │   ├── Profile completeness
    │   └── Helpful vote ratio
    │
    ├── Behavioral Signals (30% weight)
    │   ├── Review timing clusters
    │   ├── Coordinated language detection
    │   └── Rating distribution anomalies
    │
    └── Media Signals (15% weight)   [Phase 3]
        ├── Reverse image matching
        ├── EXIF data analysis
        └── AI generation artifacts
            │
            ▼
    ┌─────────────────┐
    │   TrustScorer    │  Weighted combination + confidence
    └────────┬────────┘
             │
             ▼
    Trust Score (0-100%)
    ├── HIGH_TRUST (75%+)       → Green badge
    ├── MODERATE_TRUST (50-74%) → Yellow badge
    ├── LOW_TRUST (30-49%)      → Orange badge
    └── VERY_LOW_TRUST (<30%)   → Red badge
```

### Local-First Design

Most analysis runs **entirely in the browser** with zero network calls:

- Text statistical analysis
- Account pattern detection
- Template matching against known fake patterns
- Timing cluster analysis
- Rating distribution analysis

The optional **Deep Analyzer** (Pro tier) calls the Claude API only when:
1. Local signals are ambiguous (MODERATE_TRUST)
2. User explicitly requests a deep scan
3. User has provided an API key

This keeps costs near-zero for most users while providing deeper analysis when needed.

## Development Setup

```bash
# Install dependencies
npm install

# Build for development (with watch)
npm run dev

# Production build
npm run build

# Run tests
npm test
```

### Loading in Chrome

1. Run `npm run build`
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the `dist/` directory

### Generate Icons

Before publishing, create icon files at these sizes in `src/assets/`:
- `icon-16.png` (16x16)
- `icon-48.png` (48x48)
- `icon-128.png` (128x128)

## Development Roadmap

### Phase 1: Amazon MVP (Weeks 1-2)
- [x] Core scoring engine (TrustScorer)
- [x] Text analysis module
- [x] Account analysis module
- [x] Amazon DOM scraper
- [x] Overlay renderer (product + review badges)
- [x] Popup UI
- [x] Settings page
- [x] Storage/caching
- [ ] Generate extension icons
- [ ] Write unit tests for analyzers
- [ ] Beta test on 20-30 products
- [ ] Tune scoring weights based on test results

### Phase 2: Expand Platforms (Weeks 3-6)
- [ ] Reddit content script (bot detection, astroturfing)
- [ ] Google Maps content script (business review analysis)
- [ ] Cross-platform behavioral analysis
- [ ] Deep Analyzer API integration

### Phase 3: Advanced Detection (Weeks 7-12)
- [ ] Image/media analysis
- [ ] Network pattern analysis (coordinated campaigns)
- [ ] Domain reputation scoring
- [ ] Real-time phishing detection
- [ ] Firefox port

### Phase 4: Monetization (Month 3+)
- [ ] Stripe payment integration
- [ ] Pro tier ($5/month): unlimited scans, deep analysis, all platforms
- [ ] Family tier ($9/month): up to 5 browsers, elder protection mode
- [ ] Landing page and marketing site

## Key Design Decisions

**Conservative flagging**: The extension uses "likely" / "possible" language and requires minimum 3 signals before making a judgment. False positives destroy trust faster than false negatives.

**DOM selector isolation**: All selectors are centralized in config objects per platform. When Amazon/Reddit change their markup, only the selector config needs updating.

**CSS namespace**: All injected styles use `did-` prefix to avoid conflicts with host page CSS.

**No tracking**: The extension collects zero user data. All analysis happens locally. Usage stats are stored locally only for the user's own reference.

## File-by-File Guide

| File | Purpose | Key Classes/Functions |
|---|---|---|
| `TrustScorer.js` | Combines signals into final score | `TrustScorer`, `TrustResult` |
| `TextAnalyzer.js` | AI detection, sentiment, templates | `TextAnalyzer`, `BatchTextAnalyzer` |
| `AccountAnalyzer.js` | Reviewer credibility scoring | `AccountAnalyzer`, `ReviewerProfile` |
| `DeepAnalyzer.js` | Claude API integration (Pro) | `DeepAnalyzer` |
| `amazon.js` | Amazon page scraping + orchestration | `AmazonAnalyzer` |
| `OverlayRenderer.js` | Injects badges into pages | `OverlayRenderer` |
| `StorageManager.js` | Cache, settings, usage | `StorageManager` |
| `background/index.js` | Extension lifecycle, icon, messaging | Service worker |
| `popup/popup.js` | Popup UI rendering | DOM manipulation |

## Contributing

This is an open-source project. Key areas where contributions would help:

1. **Selector maintenance**: Amazon and other sites change their DOM frequently
2. **Detection heuristics**: Better AI tell phrases, template patterns
3. **New platform modules**: eBay, Yelp, TripAdvisor, Trustpilot
4. **Localization**: Support for non-English content analysis
5. **Test coverage**: Unit tests for all analyzer modules

## License

MIT
