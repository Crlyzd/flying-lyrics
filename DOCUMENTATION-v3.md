# Flying Lyrics v3.0 - Architecture & Implementation Guide

Welcome to the comprehensive documentation for the significant upgrades made in **Flying Lyrics v3.0**. This document explains the core features introduced, the technical challenges faced, and exactly *how* and *why* we implemented the solutions we did.

---

## 1. The "Canvas-Stream" Picture-in-Picture UI
**The Goal:** Provide a clean, title-bar-less PiP window to display lyrics, getting rid of the clunky browser-provided Document PiP borders.

### How it works:
Instead of forcing HTML elements into a PiP window, we render everything manually onto an invisible HTML5 `<canvas>`.
1. **The Render Loop:** `content.js` runs a `requestAnimationFrame` loop (`renderLoop()`) that perfectly measures text, handles scrolling, and draws glowing text and the blurred background image onto `pipCanvas` at 60 FPS.
2. **The Stream Pipeline:** We capture this canvas as a video stream using `pipCanvas.captureStream(30)`.
3. **The Hidden Video:** We feed that stream into a dummy, hidden HTML5 `<video>` element (`pipVideo`).
4. **The PiP Call:** We call `requestPictureInPicture()` on that dummy `<video>`. The browser displays our canvas as if it were a clean, borderless movie.

### Playback Synchronization Fix:
**The Problem:** The user clicked the native "Pause" button in the center of the PiP window, but it only paused the dummy video, leaving Spotify playing in the background.
**The Fix:** We wired bi-directional synchronization.
- **PiP to Spotify:** We attached `pipVideo.addEventListener('pause', ...)` which programmatically finds and clicks the real Spotify `[data-testid="control-button-playpause"]` DOM button.
- **Spotify to PiP:** In our `renderLoop`, we actively poll the Spotify DOM. If the user hits the Spacebar to pause Spotify, our loop detects `state.paused` and executes `pipVideo.pause()`, ensuring the PiP window's icon instantly reflects the correct status.

---

## 2. Advanced Lyrics Engine (`engine.js`)
**The Goal:** Make the app smart enough to find lyrics even when the song title has garbage metadata (like `(feat. XYZ)`).

### Why we extracted it:
`content.js` was becoming a monolith dealing with rendering, translation, and DOM observation. We extracted the entire "brain" to `engine.js` so it could act as an independent, testable module.

### How it works:
1. **`normalizeText(str)`**: Before making network requests, we strip out accents (`normalize("NFD")`), parenthesis arrays (`(feat. )`, completely removing them), and special symbols. `Original Me (feat. San Z)` safely becomes `original me`.
2. **Concurrent Fetching**: The `searchAndScoreLyrics()` function fires parallel searches to both LRCLIB and Netease so the user doesn't wait twice as long.
3. **The `scoreMatch` Algorithm**: We needed a way to rank Netease results, as they often return messy covers or live versions. Our algorithm grades results out of **100 points**:
   - `40 pts` for an exact, normalized Title match.
   - `30 pts` for an exact, normalized Artist match.
   - `20 pts` if the API duration matches the Spotify Track duration (within 2 seconds).
   - Partial string inclusions earn fractional points (`10-15 pts`).
4. **Auto-Sort**: The final returned array is always sorted `b.score - a.score`, ensuring the most mathematically accurate lyric is exactly what the user clicks in the Popup.

---

## 3. The Netease Regional Proxy (`background.js`)
**The Goal:** Allow the extension to fetch Chinese lyrics (Netease) without triggering CORS or Regional Encryption blocks.

### The CORS Problem:
Browsers prevent `content.js` (running inside Spotify.com) from directly fetching data from `music.163.com` (Netease) via strict Cross-Origin Resource Sharing rules.
**The Fix:** We set up a message passing pipe. `content.js` sends a `FETCH_NETEASE_SEARCH` message to `background.js` (the Service Worker). Because Service Workers exist outside the web page and we added `music.163.com` to `manifest.json` `host_permissions`, it fetches the data cleanly and hands it back.

### The Geographic Encryption Bug:
**The Problem:** Users outside mainland China were receiving `{"abroad":true,"result":"35b1748964af..."}` hex-encrypted payloads from Netease's web endpoint `/api/search/get/web`.
**The Fix:** We switched the API endpoint inside `background.js` to `/api/cloudsearch/pc`. This endpoint is designed for native desktop apps rather than web browsers, meaning Netease drops the `abroad` encryption block and returns the raw JSON. We also updated the Javascript parser to read `song.ar` instead of `song.artists`, dynamically supporting multiple Netease format shapes.

---

## 4. UI/UX: Progressive Translation & Unsynced Fallbacks
**The Goal:** Ensure the UI feels perfectly fast, and never leaves the user staring at a blank screen.

### Progressive Translation
**The Problem:** Initially, `fetchLyrics()` fetched the lyrics, and then ran a `for` loop `await`ing Google Translate on every single line before it painted frame 1. This froze the Extension for 3-5 seconds.
**The Fix:** The lyric parser (`parseLrc`) now instantly returns the raw native lines. The PiP window begins rendering immediately. Then, a non-blocking background loop fires off the Google Translate requests, updating `line.translation` and flagging `needsRedraw = true` individually as they arrive over the network.

### The Teleprompter Logic
**The Problem:** If a song had lyrics, but no `[01:23.45]` timestamps (called "plain/unsynced lyrics"), the PiP window would just be completely blank.
**The Fix:** 
1. **The Popup Badge:** We added logic so that if the API flags `syncedLyrics: false`, the Popup UI displays a gray `[Unsynced]` badge, warning the user.
2. **The Teleprompter Divider:** If `engine.js` detects 0 timestamps but detects text, it asks for the song's total duration (e.g., 200 seconds), counts the lines (e.g., 50 lines), and assigns a programmatic timestamp to each line (`4 seconds` per line). This creates a steady scrolling teleprompter effect natively inside the PiP canvas!

---

## 5. Popup Persistence
**The Problem:** If a user searched for lyrics, clicked away (closing the popup), and reopened it, the search results disappeared.
**The Fix:** We implemented an in-memory cache inside `content.js` (`cachedSearchResults` and `cachedSearchTrack`). When `popup.js` mounts, it sends a `GET_NOW_PLAYING` message. If `content.js` recognizes the current playing track matches the cache, it instantly returns the array, rendering the UI seamlessly without wasting another API call.

---
### Summary of Files Affected:
- **`manifest.json`**: Bumped to v3.0, enabled Netease permissions, injected `engine.js`.
- **`popup.html/js`**: Built the entire Lyrics Override manual search interface.
- **`engine.js`**: Created to house scoring, normalization, and API parsers perfectly.
- **`background.js`**: Rebuilt to act as a CORS and Regional Encryption bypass proxy.
- **`content.js`**: Evolved into a pure PiP 60fps view layer, with precise Host DOM synchronization.
