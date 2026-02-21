// --- GLOBAL STATE ---
let currentTrack = "";
let lyricLines = [{ time: 0, text: "Waiting for music...", romaji: "", translation: "" }];
let scrollPos = 0;
let targetScroll = 0;
let cachedSearchTrack = "";
let cachedSearchResults = [];

// --- PiP ENGINE STATE ---
// Uses a Canvas → captureStream() → Video PiP pipeline for a clean, title-bar-less window.
// There is no DOM inside the PiP window; all rendering is done on pipCanvas.
let pipCanvas = null; // Off-screen canvas (never appended to DOM)
let pipCtx = null;    // Its 2D context
let pipVideo = null;  // Hidden <video> that streams the canvas into PiP

// Background art state
let cachedBgImage = null; // Pre-loaded Image object for drawImage()
let lastDrawnArt = "";    // Tracks which URL is currently cached

// Dirty flag — renderLoop only redraws when true, to avoid wasting CPU
let needsRedraw = true;

// Settings
let showTranslation = true;
let translationLang = 'id';
let syncOffset = 400;
let songOffsets = {}; // Dictionary: "Artist - Title" -> offset

// Manual lyrics overrides — keyed by "Artist - Title"
let manualLyrics = {};

// Dynamic Colors State
let currentPalette = {
    vibrant: "#1DB954", // Default Spotify Green
    trans: "#A0C0E0",   // Default Translation Blue
    romaji: "#F5AF19"   // Default Romaji Orange
};
let lastExtractedArt = "";

async function extractPalette(imgUrl) {
    if (!imgUrl || imgUrl === lastExtractedArt) return;
    lastExtractedArt = imgUrl;

    try {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = imgUrl;
        });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 50; // Small for performance
        canvas.height = 50;
        ctx.drawImage(img, 0, 0, 50, 50);

        const data = ctx.getImageData(0, 0, 50, 50).data;
        let r = 0, g = 0, b = 0, count = 0;

        // Simple dominant color sampling (filtering out extremes)
        for (let i = 0; i < data.length; i += 4) {
            const tr = data[i], tg = data[i + 1], tb = data[i + 2];
            const brightness = (tr * 299 + tg * 587 + tb * 114) / 1000;
            // Filter out very dark or very light pixels to find "color"
            if (brightness > 40 && brightness < 220) {
                r += tr; g += tg; b += tb;
                count++;
            }
        }

        if (count > 0) {
            r = Math.floor(r / count);
            g = Math.floor(g / count);
            b = Math.floor(b / count);

            // Boost saturation and brightness for the "vibrant" color
            const hsl = rgbToHsl(r, g, b);
            currentPalette.vibrant = hslToRgb(hsl.h, Math.max(hsl.s, 0.6), Math.max(hsl.l, 0.6));
            currentPalette.trans = hslToRgb(hsl.h, Math.max(hsl.s, 0.4), Math.max(hsl.l, 0.8));
            currentPalette.romaji = hslToRgb((hsl.h + (30 / 360)) % 1, Math.max(hsl.s, 0.6), Math.max(hsl.l, 0.8));
        }

        needsRedraw = true; // Palette changed, redraw
    } catch (e) {
        console.warn("Color extraction failed:", e);
    }
}

function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h, s, l };
}

function hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

// Load initial settings (including the new manualLyrics map)
chrome.storage.local.get({
    showTranslation: true,
    translationLang: 'id',
    syncOffset: 400,
    songOffsets: {},
    manualLyrics: {}
}, (items) => {
    showTranslation = items.showTranslation;
    translationLang = items.translationLang;
    syncOffset = items.syncOffset;
    songOffsets = items.songOffsets || {};
    manualLyrics = items.manualLyrics || {};
});

// =============================================================================
//  SETTINGS & LYRICS OVERRIDE MESSAGING
// =============================================================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // ---- Existing settings handlers ----
    if (msg.type === 'SETTINGS_UPDATE') {
        const p = msg.payload;
        if (p.showTranslation !== undefined) {
            showTranslation = p.showTranslation;
            if (showTranslation) fetchLyrics();
            needsRedraw = true;
        }
        if (p.translationLang !== undefined) {
            translationLang = p.translationLang;
            fetchLyrics();
        }
        if (p.syncOffset !== undefined) {
            syncOffset = p.syncOffset;
            const meta = navigator.mediaSession.metadata;
            if (meta?.title && meta?.artist) {
                const key = `${meta.artist} - ${meta.title}`;
                chrome.storage.local.get({ songOffsets: {} }, (items) => {
                    const latestOffsets = items.songOffsets || {};
                    latestOffsets[key] = syncOffset;
                    songOffsets = latestOffsets;
                    chrome.storage.local.set({ songOffsets: latestOffsets });
                });
            }
        }

    } else if (msg.type === 'GET_SYNC_OFFSET') {
        sendResponse({ syncOffset });

        // ---- New: popup requests current track info ----
    } else if (msg.type === 'GET_NOW_PLAYING') {
        const meta = navigator.mediaSession.metadata;
        if (meta?.title) {
            const trackKey = `${meta.artist} - ${meta.title}`;
            const isSameTrack = (cachedSearchTrack === currentTrack);
            sendResponse({
                trackKey,
                override: manualLyrics[trackKey] || null,
                cachedResults: isSameTrack ? cachedSearchResults : []
            });
        } else {
            sendResponse({ trackKey: null, override: null, cachedResults: [] });
        }

        // ---- New: popup requests a lyrics search ----
    } else if (msg.type === 'SEARCH_LYRICS') {
        const meta = navigator.mediaSession.metadata;
        if (!meta?.title) {
            sendResponse({ results: [], currentOverride: null });
            return true;
        }
        const trackKey = `${meta.artist} - ${meta.title}`;

        searchAndScoreLyrics(meta.title, meta.artist, getPlayerState().duration)
            .then(combined => {
                // Cache the results for popup re-opens
                cachedSearchTrack = currentTrack;
                cachedSearchResults = combined;

                sendResponse({ results: combined, currentOverride: manualLyrics[trackKey] || null });
            }).catch(() => sendResponse({ results: [], currentOverride: null }));
        return true; // keep channel open for async sendResponse

        // ---- New: user selected a specific network result ----
    } else if (msg.type === 'SELECT_LYRICS') {
        const meta = navigator.mediaSession.metadata;
        if (!meta?.title) { sendResponse({ ok: false }); return; }
        const trackKey = `${meta.artist} - ${meta.title}`;
        const entry = { type: 'network', source: msg.source, id: msg.id };
        manualLyrics[trackKey] = entry;
        chrome.storage.local.get({ manualLyrics: {} }, (items) => {
            items.manualLyrics[trackKey] = entry;
            chrome.storage.local.set({ manualLyrics: items.manualLyrics }, () => {
                fetchLyrics();
                sendResponse({ ok: true });
            });
        });
        return true;

        // ---- New: user uploaded a local .lrc file ----
    } else if (msg.type === 'SAVE_LOCAL_LYRICS') {
        const meta = navigator.mediaSession.metadata;
        if (!meta?.title) { sendResponse({ ok: false }); return; }
        const trackKey = `${meta.artist} - ${meta.title}`;
        const entry = { type: 'local', text: msg.lrcText };
        manualLyrics[trackKey] = entry;
        chrome.storage.local.get({ manualLyrics: {} }, (items) => {
            items.manualLyrics[trackKey] = entry;
            chrome.storage.local.set({ manualLyrics: items.manualLyrics }, () => {
                fetchLyrics();
                sendResponse({ ok: true });
            });
        });
        return true;

        // ---- New: user clears the override for the current track ----
    } else if (msg.type === 'CLEAR_LYRICS_OVERRIDE') {
        const meta = navigator.mediaSession.metadata;
        if (!meta?.title) { sendResponse({ ok: false }); return; }
        const trackKey = `${meta.artist} - ${meta.title}`;
        delete manualLyrics[trackKey];
        chrome.storage.local.get({ manualLyrics: {} }, (items) => {
            delete items.manualLyrics[trackKey];
            chrome.storage.local.set({ manualLyrics: items.manualLyrics }, () => {
                fetchLyrics();
                sendResponse({ ok: true });
            });
        });
        return true;
    }
});

// For Spotify Time Interpolation
let lastTimeStr = "";
let lastTimeValue = 0;
let lastUpdateMs = performance.now();

// --- 1. CORE FUNCTIONS ---

function getWrapLines(ctx, text, maxWidth) {
    if (!text) return [];
    const words = text.split(' ');
    let line = '';
    const lines = [];

    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;

        if (testWidth > maxWidth && n > 0) {
            lines.push(line);
            line = words[n] + ' ';
        } else {
            line = testLine;
        }
    }
    lines.push(line);
    return lines;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, growUpwards = false) {
    const lines = getWrapLines(ctx, text, maxWidth);
    let currentY = growUpwards ? y - ((lines.length - 1) * lineHeight) : y;

    for (let k = 0; k < lines.length; k++) {
        ctx.fillText(lines[k], x, currentY);
        currentY += lineHeight;
    }
}

// =============================================================================
//  MAIN LYRICS FETCH ENGINE  (Using global engine.js)
// =============================================================================

/**
 * Fetches lyrics for the currently playing track using a 3-step priority chain:
 *   1. Manual override stored in chrome.storage.local (local file or specific network ID)
 *   2. Automatic Search & Score fallback pipeline in engine.js
 * The resolved raw LRC string is then parsed via engine.js, romanized, and translated.
 */
async function fetchLyrics(retryCount = 0) {
    const meta = navigator.mediaSession.metadata;

    if (!meta || !meta.title) {
        if (retryCount < 5) setTimeout(() => fetchLyrics(retryCount + 1), 1000);
        return;
    }

    const trackKey = `${meta.artist} - ${meta.title}`;

    // Apply saved per-song offset
    if (songOffsets[trackKey] !== undefined) {
        syncOffset = songOffsets[trackKey];
    } else {
        syncOffset = 400;
    }
    chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATE', payload: { syncOffset } }).catch(() => { });

    try {
        let raw = "";

        // ── PRIORITY 1: Manual override ──────────────────────────────────────
        const override = manualLyrics[trackKey];
        if (override) {
            if (override.type === 'local') {
                raw = override.text;
            } else if (override.type === 'network' && override.source === 'netease') {
                raw = await fetchNeteaseLyricsById(override.id);
            } else if (override.type === 'network' && override.source === 'lrclib') {
                raw = await fetchLrclibById(override.id);
            }
        }

        // ── PRIORITY 2: Search Engine Fallback ──────────────────────────────
        if (!raw) {
            const scoredResults = await searchAndScoreLyrics(meta.title, meta.artist, getPlayerState().duration);
            if (scoredResults.length > 0) {
                const bestMatch = scoredResults[0];
                if (bestMatch.source === 'netease') {
                    raw = await fetchNeteaseLyricsById(bestMatch.id);
                } else {
                    raw = await fetchLrclibById(bestMatch.id);
                }
            }
        }

        // ── Parse phase ──────────────────────────────────────────────────────
        lyricLines = parseLrc(raw, getPlayerState().duration);
        needsRedraw = true; // Trigger instant paint of native lyrics

        // --- Pass 2: Asynchronous Translation (Non-blocking) ---
        if (lyricLines.length > 0 && lyricLines[0].text !== "No Lyrics Available") {
            const currentFetchKey = trackKey;

            lyricLines.forEach((lineObj, index) => {
                const text = lineObj.text;

                // Fire Romaji translation asynchronously if necessary
                if (/[぀-ゟ゠-ヿ一-鿿가-힣]/.test(text)) {
                    fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=rm&q=${encodeURIComponent(text)}`)
                        .then(r => r.json())
                        .then(d => {
                            if (trackKey === currentFetchKey) {
                                lyricLines[index].romaji = d?.[0]?.[0]?.[3] || "";
                                needsRedraw = true;
                            }
                        })
                        .catch(() => { });
                }

                // Fire standard translation asynchronously if toggled ON
                if (showTranslation) {
                    fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${translationLang}&dt=t&q=${encodeURIComponent(text)}`)
                        .then(r => r.json())
                        .then(d => {
                            if (trackKey === currentFetchKey && d && d[0]) {
                                lyricLines[index].translation = d[0].map(x => x[0]).join('');
                                needsRedraw = true;
                            }
                        })
                        .catch(() => { });
                }
            });
        }
    } catch (e) {
        lyricLines = [{ time: 0, text: "Network Error", romaji: "" }];
        needsRedraw = true;
    }
}

function parseTime(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return 0;
}

function getPlayerState() {
    let currentTime = 0;
    let duration = 1;
    let paused = false;

    const mediaElements = Array.from(document.querySelectorAll('video, audio'));
    const activeMedia = mediaElements.find(m => m.readyState >= 2 && !m.paused)
        || mediaElements.find(m => m.readyState >= 2);

    if (activeMedia && activeMedia.duration > 0 && activeMedia.currentTime > 0) {
        return { currentTime: activeMedia.currentTime, duration: activeMedia.duration, paused: activeMedia.paused };
    }

    if (window.location.hostname.includes('spotify')) {
        const timeEl = document.querySelector('[data-testid="playback-position"]');
        const durationEl = document.querySelector('[data-testid="playback-duration"]');
        const playBtn = document.querySelector('[data-testid="control-button-playpause"]');

        if (timeEl && durationEl) {
            const currentStr = timeEl.textContent;
            duration = parseTime(durationEl.textContent) || 1;

            if (playBtn) {
                paused = playBtn.getAttribute('aria-label') === 'Play';
            }

            if (currentStr !== lastTimeStr) {
                lastTimeStr = currentStr;
                lastTimeValue = parseTime(currentStr);
                lastUpdateMs = performance.now();
            }

            currentTime = lastTimeValue;
            if (!paused) {
                currentTime += (performance.now() - lastUpdateMs) / 1000;
            }
        }
    }

    return { currentTime, duration, paused };
}

function getCoverArt() {
    // 1. MediaSession API (last item = highest resolution)
    const meta = navigator.mediaSession?.metadata;
    if (meta && meta.artwork && meta.artwork.length > 0) {
        return meta.artwork[meta.artwork.length - 1].src;
    }

    // 2. Spotify DOM Fallback
    const spotiImg = document.querySelector('[data-testid="now-playing-widget"] img') ||
        document.querySelector('img[data-testid="cover-art-image"]');
    if (spotiImg) return spotiImg.src;

    // 3. YouTube Music DOM Fallback
    const ytImg = document.querySelector('.ytmusic-player-bar img');
    if (ytImg) return ytImg.src;

    return "";
}

// --- 2. CANVAS DRAWING HELPERS ---

/**
 * Draws the blurred cover art background onto the canvas.
 * Loads the image asynchronously and caches it in cachedBgImage.
 * Falls back to a solid dark color while the image is loading.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w Canvas width
 * @param {number} h Canvas height
 */
function drawBackground(ctx, w, h) {
    const art = getCoverArt();

    // Trigger async load if the art URL has changed
    if (art && art !== lastDrawnArt) {
        lastDrawnArt = art;
        const img = new Image();
        img.crossOrigin = 'anonymous'; // Required to avoid canvas taint that would break captureStream()
        img.onload = () => {
            cachedBgImage = img;
            extractPalette(art); // Also update the color palette
            needsRedraw = true;
        };
        img.onerror = () => {
            cachedBgImage = null;
        };
        img.src = art;
    }

    if (cachedBgImage && cachedBgImage.complete && cachedBgImage.naturalWidth > 0) {
        // Draw blurred, darkened cover art as background
        // Expand slightly to hide blur edge artifacts
        ctx.save();
        ctx.filter = 'blur(12px) brightness(0.45)';
        ctx.drawImage(cachedBgImage, -15, -15, w + 30, h + 30);
        ctx.restore();
    } else {
        // Solid fallback while image loads
        ctx.fillStyle = '#121212';
        ctx.fillRect(0, 0, w, h);
    }
}



// --- 3. RENDER LOOP ---

function renderLoop() {
    // Guard: stop loop if PiP canvas was cleaned up
    if (!pipCanvas || !pipCtx) return;

    const w = pipCanvas.width;  // 300
    const h = pipCanvas.height; // 300

    // Track change detection
    const meta = navigator.mediaSession.metadata;
    const nowTitle = meta?.title || "";
    if (nowTitle !== currentTrack) {
        currentTrack = nowTitle;
        fetchLyrics();
    }

    // --- DRAW FRAME ---
    // 1. Background (cover art or fallback)
    drawBackground(pipCtx, w, h);

    const vmin = Math.min(w, h) / 100;
    const maxWidth = w * 0.90;

    const state = getPlayerState();
    if (!state.paused) {
        state.currentTime += (syncOffset / 1000);
    }

    // 2. Lyrics
    let activeIdx = lyricLines.findIndex((l, i) =>
        state.currentTime >= l.time && (!lyricLines[i + 1] || state.currentTime < lyricLines[i + 1].time)
    );
    if (activeIdx === -1) activeIdx = 0;

    const defaultSpacing = vmin * 3;
    let currentYOffset = 0;
    const lineOffsets = [];

    // Measure all line block heights first (to calculate scroll target)
    for (let i = 0; i < lyricLines.length; i++) {
        const line = lyricLines[i];

        const mainSize = (i === activeIdx) ? vmin * 7.2 : vmin * 4.2;
        const romajiSize = (i === activeIdx) ? vmin * 6.2 : vmin * 3.6;
        const transSize = (i === activeIdx) ? vmin * 6.2 : vmin * 3.6;

        let romajiHeight = 0;
        if (line.romaji) {
            pipCtx.font = `italic 600 ${romajiSize}px 'Segoe UI', sans-serif`;
            romajiHeight = getWrapLines(pipCtx, line.romaji, maxWidth).length * (romajiSize * 1.2);
        }

        pipCtx.font = (i === activeIdx)
            ? `700 ${mainSize}px 'Segoe UI', sans-serif`
            : `600 ${mainSize}px 'Segoe UI', sans-serif`;
        let mainHeight = getWrapLines(pipCtx, line.text, maxWidth).length * (mainSize * 1.2);

        let transHeight = 0;
        if (showTranslation && line.translation) {
            pipCtx.font = `600 ${transSize}px 'Segoe UI', sans-serif`;
            transHeight = getWrapLines(pipCtx, `(${line.translation})`, maxWidth).length * (transSize * 1.2);
        }

        const topBoundary = line.romaji
            ? (vmin * 9.2) + romajiHeight
            : mainHeight / 2;

        let bottomBoundary = mainHeight / 2;
        if (showTranslation && line.translation) {
            const mainLineCount = getWrapLines(pipCtx, line.text, maxWidth).length;
            const mainWrapShift = (mainLineCount > 1 ? mainLineCount - 1 : 0) * (mainSize * 1.2);
            bottomBoundary = mainWrapShift + (vmin * 8.2) + transHeight;
        }

        const baseY = currentYOffset + topBoundary;
        lineOffsets.push(baseY);

        const totalBlockHeight = topBoundary + bottomBoundary;
        currentYOffset += totalBlockHeight + defaultSpacing;
    }

    targetScroll = lineOffsets[activeIdx] || 0;
    scrollPos += (targetScroll - scrollPos) * 0.1;

    pipCtx.save();
    pipCtx.translate(w / 2, (h / 2) - scrollPos);

    lyricLines.forEach((line, i) => {
        const dist = Math.abs(i - activeIdx);
        pipCtx.globalAlpha = Math.max(0.3, 1 - dist * 0.3);
        pipCtx.textAlign = "center";

        const y = lineOffsets[i];
        const isCurrent = (i === activeIdx);

        pipCtx.shadowColor = "rgba(0, 0, 0, 0.8)";
        pipCtx.shadowBlur = 8;

        const mainSize = isCurrent ? vmin * 7.2 : vmin * 4.2;
        const romajiSize = isCurrent ? vmin * 6.2 : vmin * 3.6;
        const transSize = isCurrent ? vmin * 6.2 : vmin * 3.6;

        // Romaji (Top)
        if (line.romaji) {
            pipCtx.font = `italic 600 ${romajiSize}px 'Segoe UI', sans-serif`;
            pipCtx.fillStyle = isCurrent ? currentPalette.romaji : "#DDDDDD";
            wrapText(pipCtx, line.romaji, 0, y - (vmin * 9.2), maxWidth, romajiSize * 1.2, true);
        }

        // Original Text (Middle)
        pipCtx.font = isCurrent
            ? `700 ${mainSize}px 'Segoe UI', sans-serif`
            : `600 ${mainSize}px 'Segoe UI', sans-serif`;
        pipCtx.fillStyle = isCurrent ? currentPalette.vibrant : "#FFFFFF";
        wrapText(pipCtx, line.text, 0, y, maxWidth, mainSize * 1.2, false);

        // Double-pass vibrant glow on active line
        if (isCurrent) {
            pipCtx.shadowColor = currentPalette.vibrant;
            pipCtx.shadowBlur = 15;
            wrapText(pipCtx, line.text, 0, y, maxWidth, mainSize * 1.2, false);
        }

        // Translation (Bottom)
        if (showTranslation && line.translation) {
            pipCtx.font = isCurrent
                ? `700 ${mainSize}px 'Segoe UI', sans-serif`
                : `600 ${mainSize}px 'Segoe UI', sans-serif`;
            const mainLineCount = getWrapLines(pipCtx, line.text, maxWidth).length;
            const mainWrapShift = (mainLineCount > 1 ? mainLineCount - 1 : 0) * (mainSize * 1.2);

            pipCtx.shadowColor = "rgba(0, 0, 0, 0.8)";
            pipCtx.shadowBlur = 8;

            pipCtx.font = `600 ${transSize}px 'Segoe UI', sans-serif`;
            pipCtx.fillStyle = isCurrent ? currentPalette.trans : "#CCCCCC";
            wrapText(pipCtx, `(${line.translation})`, 0, y + mainWrapShift + (vmin * 8.2), maxWidth, transSize * 1.2, false);
        }
    });

    pipCtx.restore();

    // Force pipVideo play state to match the real player state
    // so the native PiP Play/Pause button icon is always correct.
    if (pipVideo) {
        if (state.paused && !pipVideo.paused) {
            pipVideo.pause();
        } else if (!state.paused && pipVideo.paused) {
            pipVideo.play().catch(() => { });
        }
    }

    // Schedule next frame
    requestAnimationFrame(renderLoop);
}

// --- 4. MEDIA SESSION CONTROLS ---

/**
 * Registers Media Session action handlers so the PiP window's native
 * prev/play/pause/next overlay buttons trigger actions on the host player.
 * These are cleared in cleanupPip() when the window closes.
 */
function registerMediaSessionControls() {
    const clickSelector = (selectors) => {
        document.querySelector(selectors)?.click();
    };

    navigator.mediaSession.setActionHandler('previoustrack', () =>
        clickSelector('[data-testid="control-button-skip-back"], .previous-button')
    );
    navigator.mediaSession.setActionHandler('nexttrack', () =>
        clickSelector('[data-testid="control-button-skip-forward"], .next-button')
    );
    navigator.mediaSession.setActionHandler('play', () =>
        clickSelector('[data-testid="control-button-playpause"], .play-pause-button')
    );
    navigator.mediaSession.setActionHandler('pause', () =>
        clickSelector('[data-testid="control-button-playpause"], .play-pause-button')
    );
}

/**
 * Cleans up all PiP engine state and releases Media Session handlers.
 * Called automatically when the user closes the PiP window (leavepictureinpicture event).
 */
function cleanupPip() {
    // Nullify canvas references — this causes renderLoop() to exit on its next tick
    pipCanvas = null;
    pipCtx = null;
    pipVideo = null;
    cachedBgImage = null;
    lastDrawnArt = "";
    needsRedraw = false;
    scrollPos = 0;
    targetScroll = 0;

    // Clear Media Session handlers
    navigator.mediaSession.setActionHandler('previoustrack', null);
    navigator.mediaSession.setActionHandler('nexttrack', null);
    navigator.mediaSession.setActionHandler('play', null);
    navigator.mediaSession.setActionHandler('pause', null);
}

// --- 5. LAUNCHER ---

const createLauncher = () => {
    const host = window.location.hostname;
    if (!host.includes('spotify') && !host.includes('music.youtube')) return;

    if (document.getElementById('pip-trigger')) return;
    const btn = document.createElement('button');
    btn.id = 'pip-trigger';
    btn.innerText = '🎵 FLYING LYRICS';
    Object.assign(btn.style, {
        position: 'fixed', top: '80px', right: '20px', zIndex: 99999,
        padding: '10px 20px', background: '#1DB954', color: '#fff',
        border: 'none', borderRadius: '50px', cursor: 'pointer',
        fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
    });

    btn.onclick = async () => {
        // Prevent double-launch if PiP is already active
        if (pipVideo && document.pictureInPictureElement) return;

        try {
            // 1. Create off-screen canvas — 300x300, never appended to DOM
            pipCanvas = document.createElement('canvas');
            pipCanvas.width = 300;
            pipCanvas.height = 300;
            pipCtx = pipCanvas.getContext('2d');

            // 2. Paint an initial frame — required to prevent "video not ready" errors
            pipCtx.fillStyle = '#121212';
            pipCtx.fillRect(0, 0, 300, 300);

            // 3. Create hidden muted video and pipe canvas stream into it
            //    Muted = no volume control in PiP; live stream = no timeline in PiP
            pipVideo = document.createElement('video');
            pipVideo.muted = true;
            pipVideo.playsInline = true;
            pipVideo.srcObject = pipCanvas.captureStream(30);

            // 4. Register Media Session handlers before launching PiP
            registerMediaSessionControls();

            // Sync native PiP interactions back to the host player
            pipVideo.addEventListener('play', () => {
                const playBtn = document.querySelector('[data-testid="control-button-playpause"], .play-pause-button');
                if (playBtn && playBtn.getAttribute('aria-label') === 'Play') playBtn.click();
            });

            pipVideo.addEventListener('pause', () => {
                const playBtn = document.querySelector('[data-testid="control-button-playpause"], .play-pause-button');
                if (playBtn && playBtn.getAttribute('aria-label') === 'Pause') playBtn.click();
            });

            // 5. Play video first, then request PiP — both must happen in same click gesture
            await pipVideo.play();
            await pipVideo.requestPictureInPicture();

            // 6. Wire cleanup to PiP exit event
            pipVideo.addEventListener('leavepictureinpicture', cleanupPip, { once: true });

            // 7. Start lyrics fetch and render loop
            fetchLyrics();
            needsRedraw = true;
            requestAnimationFrame(renderLoop);

        } catch (e) {
            console.error("Flying Lyrics: PiP launch failed:", e);
            // Clean up partial state on error
            cleanupPip();
        }
    };

    document.body.appendChild(btn);
};

setInterval(createLauncher, 2000);