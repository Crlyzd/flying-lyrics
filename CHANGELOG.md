# Changelog

All notable changes to the **Flying Lyrics** Chrome extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [5.2.0] - 2026-10-09

### Added
- **Official Branding & Portfolio Navigation**: Added external links to the official Flying Lyrics landing page (`https://flyinglyrics.kaleksananbagus.com/`) on header logo and author portfolio (`https://kaleksananbagus.com/`) on footer credits with hover scaling affordances.
- **Heart Sprout Micro-Interaction**: Added a TikTok-style floating particle heart burst animation on footer `.red-heart` clicks with automatic DOM cleanup on `animationend`.

### Changed
- **Zero-Bloat Modular Architecture & Line Ceiling Compliance**: Decomposed monolithic coordinator files to strictly honor quantitative line ceilings ($\le 500$ LOC for coordinators, $\le 350$ LOC for submodules):
  - Extracted `src/content/content/settingsReceiver.js` from `messageRouter.js`.
  - Extracted `src/content/pip/videoPipDriver.js` from `pipDrivers.js`.
  - Extracted `src/content/services/overrideResolver.js` from `services.js`.
  - Extracted `src/content/ui/paletteExtractor.js` from `utils.js`.
  - Decomposed popup CSS into `layout-base.css`, `layout-header.css`, `layout-footer.css`, `layout-toast.css`, `galaxy-mesh.css`, `galaxy-picker.css`, `galaxy-theme.css`, `lyrics-search.css`, and `lyrics-preview.css`.
  - Decomposed popup scripts into `popup-constants.js`, `popup-lyrics-search.js`, `popup-visuals-colors.js`, `popup-visuals-fonts.js`, and `popup-tour-steps.js`.
- **Bolder 3px Concentric Glowing Border Ring**: Increased popup glowing ring thickness to 3px (`margin: 3px;` on `.popup-slides`) with rounder concentric curvature in Gecko (`18px` outer container, `15px` inner slides and header).

### Fixed
- **Instrumental Mismatch Scoring Protection**: Prevented empty and instrumental candidate tracks from outscoring vocal lyrics:
  - Applied an asymmetric -12,000 point Instrumental Mismatch Penalty when a vocal track search query matches an empty or instrumental candidate.
  - Rewarded matching instrumental candidates (+2,000 points) when the query explicitly requests an instrumental track.
  - Gated the +10,000 synced bonus to strictly require non-empty timestamped lines (`candidate.synced && !candidate.isEmpty`).
  - Mirrored scoring changes in benchmark `matcher.js` for 100% algorithm parity.
- **Gecko Popup White Border & Boundary Clipping**:
  - Set opaque black (`#000000`) on `html` and `body` in Firefox to suppress native Proton white arrowpanel border outlines.
  - Applied `padding: 3px;` and `border-radius: 20px;` to `body` in Firefox to retract the glowing border ring inward from the browser ceiling and window edges, completely eliminating corner clipping.
  - Preserved 100% zero-regression isolation for Chromium (sharp 90-degree square geometry).

---

## [5.1.0] - 2026-10-07

### Added
- **Cross-Namespace Uninstall Survey Registration**: Implemented `registerUninstallSurvey()` utilizing `(globalThis.browser?.runtime || chrome.runtime).setUninstallURL(...)` with Promise catch handlers, registered both at background script startup and inside `chrome.runtime.onInstalled`.
- **Gecko-Aware Developer Environment Detection**: Added environment inspection inspecting `details.temporary` in `chrome.runtime.onInstalled` to reliably differentiate unpacked development (`about:debugging`, `web-ext`) from official Firefox Add-ons (AMO) store installations.

### Changed
- **Popup Dev Tools Ingestion Guard**: Replaced unconditional script tag creation with an asynchronous `HEAD` availability check before injecting `js/popup-dev.js`, ensuring production store bundles (where dev tools are stripped) do not generate 404 console errors.
- **Cross-Browser Privacy Neutrality**: Updated onboarding disclosure copy in `src/pages/welcome.html` to reference "browser user account information" rather than "Chrome user account information".

### Fixed
- **Firefox AMO Start Page & Onboarding Tour Auto-Trigger**: Resolved an issue where 100% of Firefox Store installations were misidentified as developer environments because Mozilla AMO manifests do not contain `update_url`. The Start Page (`welcome.html`) now opens immediately on fresh store installs, and the Interactive Onboarding Tour is properly armed and launched on first popup open.
- **Background Search Routing in Firefox**: Fixed search requests taking developer simulation branches in production Firefox installs due to false-positive `IS_DEV_MODE` flags.

---

## [5.0.0] - 2026-10-01

### Added
- **Mozilla Firefox (Gecko MV3) Support**: Full native support with dedicated `manifest.firefox.json`, background event scripts, and Firefox AMO review integration.
- **Standalone Pop-out Window Mode (`window`)**: Added third PiP mode via `src/pages/pip.html` and `src/pages/pip.js` with kinetic canvas rendering and bidirectional IPC playback controls.
- **Tri-Mode PiP Architecture**: Adaptive capability cascade and mode handoff between Document PiP, Video PiP, and Standalone Window PiP.
- **Dedicated Firefox Settings Restore Flow**: Added `src/pages/import.html` and `src/pages/import.js` full-page restore tab with drag-and-drop to bypass OS dialog popup dismissals in Firefox.
- **Non-Blocking Inline Reset Button**: Implemented in-place confirmation state machine ('Confirm Reset?') with 4s auto-timeout and outside-click dismissal for floating and interface defaults.
- **Cross-Browser Background CORS Bridge**: Routed remote translations and romanizations through `FETCH_TRANSLATION_BATCH` in the background worker to bypass platform CSP and CORS restrictions.
- **Cross-Browser Build & Parity Tooling**:
  - Added zero-dependency packager `tools/build.js` for automated multi-target store bundling (`flying_lyrics_chrome_v5.0.zip` and `flying_lyrics_firefox_v5.0.zip`).
  - Added architectural parity auditor `tools/validate.js` to enforce content script ordering and safety guards.
  - Added manifest target switcher `tools/target.js` for instant unpacked development toggling.
  - Added interactive options in `build.bat` for manifest switching, validating, and multi-target packaging.
- **Capture-Phase Auto-Launch**: Restored global first-click listener in capture phase (`{ capture: true }`) to preserve user activation for PiP launch.
- **Real-Time Cloud Sync Broadcasting**: Remote `chrome.storage.sync` updates now broadcast to all active music tabs in real-time.
- **Firefox Built-in Data Consent Declarations**: Declared mandatory `browser_specific_settings.gecko.data_collection_permissions` in `manifest.firefox.json` (`"required": ["none"]`, `"optional": ["technicalAndInteraction"]`) to comply with Mozilla AMO requirements.
- **Discrete Multi-Resolution Icons**: Generated dedicated `icon-16.png`, `icon-32.png`, `icon-48.png`, and `icon-128.png` in `assets/icons/` for both Chromium and Gecko manifests, preventing downscaling artifacts on high-DPI toolbars.
- **Automated Icon Parity Audit**: Extended `tools/validate.js` (Check 1b) to enforce disk existence and identical resolution mapping for all icon sizes across Chrome and Firefox manifests.

### Changed
- **Dual Manifest Strategy**: Decoupled Chromium MV3 (`manifest.chrome.json`) and Firefox MV3 (`manifest.firefox.json`), with `tools/target.js` managing the active unpacked root `manifest.json`.
- **Firefox Engine Target**: Bumped `strict_min_version` from `115.0` to `142.0` in `manifest.firefox.json` to satisfy Mozilla AMO requirements for native built-in data collection permissions declarations without engine compatibility warnings.
- **Cloud Sync Whitelist**: Added `ecoMode` and `themeAccent` to `syncKeys`, with graceful automatic fallback to `chrome.storage.local`.
- **Backup Data Sanitization**: Whitelisted and preserved `userStats` (listening streaks and time-of-day analytics) in `.fly` backup archives.
- **Restructured Build CLI**: Reorganized `build.bat` menu into categorized operations with Node.js fallback handling.

### Fixed
- **Chromium Mode Switch Auto-Relaunch**: Fixed broken `typeof browser !== 'undefined'` check in `messageRouter.js` that falsely identified Chromium/Edge as Firefox; restored native, prompt-free auto-reopening via Chromium User Activation v2 (UAv2) with latch clearing (`fl.pipWin = null`, `fl.isLaunchingPip = false`) on a 100ms tick.
- **Gecko-Specific Manual Mode Switch Fallback**: Isolated `fl.pulseLauncherButton` pulsing prompt and `#borderless-pip-hint` exclusively to genuine Firefox (`navigator.userAgent.includes('Firefox')`) where transient user gestures do not cross extension IPC boundaries.
- **Firefox Popup Focus Dismissal**: Eliminated popup auto-dismissal when selecting backup files by utilizing a dedicated restore tab on Firefox.
- **Firefox Reset Modal Lockout**: Eliminated modal `window.confirm()` calls in popup settings that forced popup closure on focus transfer.
- **Video PiP Mode Transition Prep**: Fixed canvas stream preparation guard in `fl.prepareVideoPip` when switching directly from Document PiP to Video PiP.
- **Unchecked Runtime Errors on Orphaned Tabs**: Suppressed unhandled `chrome.runtime.lastError` warnings when querying closed or disconnected player tabs from popup scripts.
- **Legacy PowerShell Build Fallback**: Hardened `build.bat` PowerShell fallback packager to source from `manifest.chrome.json` when present, preventing active Firefox dev manifests from contaminating Chrome release packages.
- **Firefox Backward Compatibility**: Added dynamic DOM `ensureMainWorldHook` injection fallback for Gecko versions lacking native `world: "MAIN"` content script support.
- **Firefox Popup Corner & Viewport Scrollbar Clipping**: Resolved top-corner border clipping in Firefox by applying Gecko-scoped concentric curvature (`border-radius: 8px` on container, `6px` on slides) and locked root `html` to prevent unwanted outer window scrollbars from widening the panel, leaving Chromium's sharp square aesthetics 100% untouched.
- **YouTube Music Player Controls**: Added idempotency guards and expanded media session control selectors for YouTube Music.
- **AMO Security Hardening & XSS Prevention**: Eliminated unsafe raw `innerHTML` writes across search card templates (`popup-lyrics.js`), backup status reporting (`import.js`), and tour descriptions (`popup-tour.js`), migrating to typed W3C DOM methods (`document.createElement`, `textContent`, `append`, `replaceChildren`).
- **PiP Vector Icon Rendering & DOM Adoption**: Added explicit `xmlns="http://www.w3.org/2000/svg"` namespaces to all button icon constants and implemented cross-document node adoption (`ownerDocument.importNode`) in `domBuilder.js`, `pipSync.js`, and `pip.js`, resolving all AMO linter warnings while guaranteeing 100% visual rendering across Document PiP and Standalone Pop-out windows.
- **PiP Controls State Latch Caching**: Added dataset state caching on mute controls in `pipSync.js` (`muteBtn.dataset.state !== targetMuteState`) to prevent redundant DOM tree mutations during playback sync loops.
- **Dead Code Cleanup**: Pruned dead `syncBadge` string calculation block in `popup-lyrics.js`.

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
