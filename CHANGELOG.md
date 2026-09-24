# Changelog

All notable changes to the **Flying Lyrics** Chrome extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [4.9.0] - 2026-09-25

### Added
- **KuGou Lyrics Integration**: Added KuGou (`lyrics.kugou.com`) as a third-tier synchronized lyrics provider with two-tier candidate discovery, Base64 UTF-8 decoding, and multi-artist fuzzy scoring tolerance.
- **Client-Side Timeout Safeguard**: Added `sendMessageWithTimeout` in `src/content/content/messageUtils.js` to prevent requests from hanging indefinitely if Chrome's MV3 service worker terminates or drops the message port.
- **Loading State Watchdog**: Added a 15-second render loop watchdog in `src/content/renderer.js` to detect and break frozen `"Wait for it..."` placeholder loops.
- **Interactive Simulation Dev Tools**: Added interactive pill toggles to simulate provider network outages (LRCLIB, NetEase, KuGou, All Down) and translation failures in the Dev Tools tab.
- **Eco Mode Aura Styling**: Added flat, non-pulsing ambient glow keyframes (`.glow-preview.active.eco-mode`) in Popup Settings matching canvas Eco Mode behavior.
- **Benchmark KuGou Parity**: Added KuGou provider adapter and metrics tracking to `tools/benchmark` with 100% search algorithm parity.

### Changed
- **Modular Architecture Refactor**: Decomposed monolithic coordinator files to enforce line ceiling rules (coordinator $\le 500$ LOC, submodule $\le 350$ LOC):
  - `src/background/searchEngine.js` decomposed into `sanitizer.js`, `scoring.js`, `network.js`, and dedicated `providers/`.
  - `src/content/content.js` decomposed into `statsTracker.js`, `messageRouter.js`, and `messageUtils.js`.
  - `src/content/renderer.js` decomposed into `effects.js`, `layout.js`, `emptyStateQuotes.js`, `pipBadge.js`, `pipSync.js`, and `textDrawer.js`.
  - `src/content/services.js` decomposed into `lrcParser.js`, `lyricsCache.js`, `translator.js`, and `metadataHelper.js`.
  - `src/content/ui.js` decomposed into `colorPalette.js`, `domBuilder.js`, and `launcher.js`.
  - `src/popup/css/controls.css` split into 6 modular stylesheets (`controls-buttons.css`, `controls-dev.css`, `controls-inputs.css`, `controls-misc.css`, `controls-sliders.css`, `controls-toggles.css`).
- **Default Visual Mode**: Standardized `coverMode` default from `'centered'` to `'fill'` across content scripts and popup UI.
- **Centered Cover Art Filters**: Inverted filter sequence in Document PiP so blur precedes drop-shadow, eliminating dark pixel edge smearing.

### Fixed
- **Placeholder Deadlocks**: Guaranteed metadata retry exhaustion (`retryCount >= 5`) transitions cleanly to `handleMissingLyrics()` instead of returning silently.
- **Track Switch Race Condition**: Fixed unhandled `TypeError` in `translator.js` when skipping tracks rapidly during active translation requests using `_translationSessionId` invalidation.
- **Lyric Shadow Outlines**: Removed unwanted vector stroke outline when lyric drop shadow is disabled.
- **Centered Cover Jump**: Unified drop shadow to centered ambient elevation in PiP to eliminate position jumping when toggling blur.
- **Cache Poisoning**: Prevented internal system state strings (`"Wait for it..."`, `"Network Error"`) from being stored in `chrome.storage.local`.
- **GA4 Active Sessions**: Added `engagement_time_msec: 100` to GA4 Measurement Protocol requests to support active session attribution.

---

## [4.8.0] - 2026-09-24

### Added
- Multi-artist alias matching and duration tolerance calibration.
- NetEase timestamped community translation waterfall.
- Document Picture-in-Picture window support.

### Changed
- Refactored K-Means dynamic color extraction algorithm.
- Enhanced fluid scrolling physics with teleport-and-glide thresholding.

### Fixed
- Resolved Spotify canvas background video capture conflict.
- Fixed volume bar slider and mute toggle circular desynchronization.
