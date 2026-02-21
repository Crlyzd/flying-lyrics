// --- GLOBAL STATE ---
let currentTrack = "";
let lyricLines = [{ time: 0, text: "Waiting for music...", romaji: "", translation: "" }];
let scrollPos = 0;
let targetScroll = 0;
let pipWin = null;

// Settings
let showTranslation = true;
let translationLang = 'id';
let syncOffset = 400;
let songOffsets = {}; // Dictionary: "Artist - Title" -> offset

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
            // Fix: hue is 0-1, so shift by 30 degrees is 30/360. Also guarantee high lightness for readability.
            currentPalette.romaji = hslToRgb((hsl.h + (30 / 360)) % 1, Math.max(hsl.s, 0.6), Math.max(hsl.l, 0.8));

            // Set CSS custom properties for UI controls
            if (pipWin && pipWin.document) {
                pipWin.document.body.style.setProperty('--vibrant-color', currentPalette.vibrant);
            }
        }
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

// Load initial settings
chrome.storage.local.get({
    showTranslation: true,
    translationLang: 'id',
    syncOffset: 400,
    songOffsets: {}
}, (items) => {
    showTranslation = items.showTranslation;
    translationLang = items.translationLang;
    syncOffset = items.syncOffset; // Still load global last used as fallback/init
    songOffsets = items.songOffsets || {};
});

// Listen for updates
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'SETTINGS_UPDATE') {
        const p = msg.payload;
        if (p.showTranslation !== undefined) {
            showTranslation = p.showTranslation;
            if (showTranslation) fetchLyrics(); // Re-fetch if turned on
            updateCCButtonState();
        }
        if (p.translationLang !== undefined) {
            translationLang = p.translationLang;
            fetchLyrics(); // Re-fetch with new lang
        }
        if (p.syncOffset !== undefined) {
            syncOffset = p.syncOffset;

            // Save offset for current song (Fetch latest storage first to avoid overwrite)
            const meta = navigator.mediaSession.metadata;
            if (meta && meta.title && meta.artist) {
                const key = `${meta.artist} - ${meta.title}`;
                chrome.storage.local.get({ songOffsets: {} }, (items) => {
                    const latestOffsets = items.songOffsets || {};
                    latestOffsets[key] = syncOffset;
                    songOffsets = latestOffsets; // Update local cache
                    chrome.storage.local.set({ songOffsets: latestOffsets });
                });
            }
        }
    } else if (msg.type === 'GET_SYNC_OFFSET') {
        sendResponse({ syncOffset });
    }
});

// For Spotify Time Interpolation
let lastTimeStr = "";
let lastTimeValue = 0;
let lastUpdateMs = performance.now();

// --- ICONS (SVG STRINGS) ---
// --- ICONS (SVG STRINGS) ---
// --- ICONS (SVG STRINGS) ---
const ICON_PREV = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 20L9 12l10-8v16zM5 19V5"/></svg>`;
const ICON_NEXT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4l10 8-10 8V4zM19 5v14"/></svg>`;
const ICON_PLAY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="0.3" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 3.5 L18.5 11.5 Q19.5 12 18.5 12.5 L5.5 20.5 Q4.5 21 4.5 20 L4.5 4 Q4.5 3 5.5 3.5 Z"></path></svg>`;
const ICON_PAUSE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="2" width="6" height="20" rx="1.5"></rect><rect x="15" y="2" width="6" height="20" rx="1.5"></rect></svg>`;
const ICON_VOL_HIGH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
const ICON_VOL_MUTE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;
const ICON_CC = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" ry="2"></rect><path d="M10 9.5a2 2 0 0 0 -2 2v1a2 2 0 0 0 2 2"></path><path d="M16 9.5a2 2 0 0 0 -2 2v1a2 2 0 0 0 2 2"></path></svg>`;
let canvas, ctx;

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

async function fetchLyrics(retryCount = 0) {
    const meta = navigator.mediaSession.metadata;

    if (!meta || !meta.title) {
        if (retryCount < 5) setTimeout(() => fetchLyrics(retryCount + 1), 1000);
        return;
    }

    try {
        const query = `artist_name=${encodeURIComponent(meta.artist)}&track_name=${encodeURIComponent(meta.title)}`;

        // --- APPLY SAVED OFFSET ---
        const key = `${meta.artist} - ${meta.title}`;
        if (songOffsets[key] !== undefined) {
            syncOffset = songOffsets[key];
        } else {
            syncOffset = 400; // Default if no custom offset
        }
        // Broadcast new offset to Popup (so UI updates if open)
        chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATE', payload: { syncOffset } }).catch(() => { });

        const res = await fetch(`https://lrclib.net/api/get?${query}`);
        const data = await res.json();
        const raw = data.syncedLyrics || data.plainLyrics || "";
        // Don't modify basic structure yet, will parse in loop

        if (!raw) {
            lyricLines = [{ time: 0, text: "No lyrics found", romaji: "", translation: "" }];
            return;
        }

        const lines = raw.split('\n');
        const temp = [];
        for (let line of lines) {
            const match = line.match(/\[(\d+):(\d+\.\d+)\](.*)/);
            if (!match) continue;

            const time = parseInt(match[1]) * 60 + parseFloat(match[2]);
            const text = match[3].trim();
            if (!text) continue;

            let romaji = "";
            let translation = "";

            // Parallel requests for Romaji and/or Translation
            const requests = [];

            if (/[぀-ゟ゠-ヿ一-鿿가-힣]/.test(text)) {
                requests.push(
                    fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=rm&q=${encodeURIComponent(text)}`)
                        .then(r => r.json())
                        .then(d => { romaji = d?.[0]?.[0]?.[3] || ""; })
                        .catch(() => { })
                );
            }

            if (showTranslation) {
                requests.push(
                    fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${translationLang}&dt=t&q=${encodeURIComponent(text)}`)
                        .then(r => r.json())
                        .then(d => {
                            // Extract translation from response
                            if (d && d[0]) {
                                translation = d[0].map(x => x[0]).join('');
                            }
                        })
                        .catch(() => { })
                );
            }

            await Promise.all(requests);

            temp.push({ time, text, romaji, translation });
        }
        lyricLines = temp.length ? temp : [{ time: 0, text: "No Lyrics Available", romaji: "", translation: "" }];
    } catch (e) {
        lyricLines = [{ time: 0, text: "Network Error", romaji: "" }];
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
    // 1. MediaSession API (Grab the last item, which is inherently the highest resolution)
    const meta = navigator.mediaSession?.metadata;
    if (meta && meta.artwork && meta.artwork.length > 0) {
        return meta.artwork[meta.artwork.length - 1].src;
    }

    // 2. Spotify DOM Fallback (Directly targets the bottom-left playing widget)
    const spotiImg = document.querySelector('[data-testid="now-playing-widget"] img') ||
        document.querySelector('img[data-testid="cover-art-image"]');
    if (spotiImg) return spotiImg.src;

    // 3. YouTube Music DOM Fallback
    const ytImg = document.querySelector('.ytmusic-player-bar img');
    if (ytImg) return ytImg.src;

    return "";
}

function renderLoop() {
    if (!pipWin || pipWin.closed) return;

    const meta = navigator.mediaSession.metadata;
    const nowTitle = meta?.title || "";
    if (nowTitle !== currentTrack) {
        currentTrack = nowTitle;
        fetchLyrics();
    }

    // --- CONTINUOUS BACKGROUND IMAGE SYNC ---
    const art = getCoverArt();
    const bg = pipWin.document.getElementById('bg-cover');

    if (bg && art) {
        const newBg = `url("${art}")`;
        // Only trigger a DOM repaint if the image actually changed
        if (bg.style.backgroundImage !== newBg) {
            bg.style.backgroundImage = newBg;
            extractPalette(art); // Trigger color extraction
        }
    }

    if (!canvas || !pipWin.document.body.contains(canvas)) {
        canvas = pipWin.document.getElementById('lyricCanvas');
        ctx = null;
    }
    if (!canvas) return pipWin.requestAnimationFrame(renderLoop);
    if (!ctx) ctx = canvas.getContext('2d');

    const w = pipWin.innerWidth;
    const h = pipWin.innerHeight;
    canvas.width = w;
    canvas.height = h;

    const vmin = Math.min(w, h) / 100;
    const maxWidth = w * 0.94;

    const state = getPlayerState();
    // Apply Sync Offset
    if (!state.paused) {
        state.currentTime += (syncOffset / 1000);
    }

    const seeker = pipWin.document.getElementById('seeker-bar');
    if (seeker) seeker.style.width = `${(state.currentTime / state.duration) * 100}%`;

    const ppBtn = pipWin.document.getElementById('playpause');
    if (ppBtn) {
        const targetIcon = (state.paused) ? ICON_PLAY : ICON_PAUSE;
        if (ppBtn.innerHTML !== targetIcon) ppBtn.innerHTML = targetIcon;
    }

    // Update mute button icon if changed externally
    const muteBtn = pipWin.document.getElementById('mute-btn');
    if (muteBtn) {
        const media = document.querySelector('video, audio');
        const isMuted = media ? media.muted : false;
        const targetMuteIcon = isMuted ? ICON_VOL_MUTE : ICON_VOL_HIGH;
        if (muteBtn.innerHTML !== targetMuteIcon) muteBtn.innerHTML = targetMuteIcon;
    }

    ctx.clearRect(0, 0, w, h);

    let activeIdx = lyricLines.findIndex((l, i) =>
        state.currentTime >= l.time && (!lyricLines[i + 1] || state.currentTime < lyricLines[i + 1].time)
    );
    if (activeIdx === -1) activeIdx = 0;

    const defaultSpacing = vmin * 3; // Literal 3vmin gap between blocks

    let currentYOffset = 0;
    const lineOffsets = [];

    for (let i = 0; i < lyricLines.length; i++) {
        const line = lyricLines[i];

        const mainSize = (i === activeIdx) ? vmin * 7.2 : vmin * 4.2;
        const romajiSize = (i === activeIdx) ? vmin * 6.2 : vmin * 3.6;
        const transSize = (i === activeIdx) ? vmin * 6.2 : vmin * 3.6;

        let romajiHeight = 0;
        if (line.romaji) {
            ctx.font = `italic 600 ${romajiSize}px 'Segoe UI', sans-serif`;
            romajiHeight = getWrapLines(ctx, line.romaji, maxWidth).length * (romajiSize * 1.2);
        }

        ctx.font = (i === activeIdx) ? `700 ${mainSize}px 'Segoe UI', sans-serif` : `600 ${mainSize}px 'Segoe UI', sans-serif`;
        let mainHeight = getWrapLines(ctx, line.text, maxWidth).length * (mainSize * 1.2);

        let transHeight = 0;
        if (showTranslation && line.translation) {
            ctx.font = `600 ${transSize}px 'Segoe UI', sans-serif`;
            transHeight = getWrapLines(ctx, `(${line.translation})`, maxWidth).length * (transSize * 1.2);
        }

        // --- ABSOLUTE BOUNDING BOX MEASUREMENT ---
        // Instead of stacking heights (which creates invisible phantom spacing),
        // we measure the exact top and bottom pixels the text will occupy on the canvas.

        // Top Boundary: the romaji anchors 7.5vmin above the main text's Y + its own text height
        const topBoundary = line.romaji
            ? (vmin * 9.2) + romajiHeight
            : mainHeight / 2;

        // Bottom Boundary: below the full rendered height of main lyric + tight gap
        let bottomBoundary = mainHeight / 2;
        if (showTranslation && line.translation) {
            // Calculate downward baseline shift for wrapped main lyrics
            const mainLineCount = getWrapLines(ctx, line.text, maxWidth).length;
            const mainWrapShift = (mainLineCount > 1 ? mainLineCount - 1 : 0) * (mainSize * 1.2);
            // 6.8vmin creates perfect visual symmetry with the 7.5vmin top gap
            bottomBoundary = mainWrapShift + (vmin * 8.2) + transHeight;
        }

        // This is the canvas Y where the main lyric will be drawn (centered between top/bottom)
        const baseY = currentYOffset + topBoundary;
        lineOffsets.push(baseY);

        // Total height = exact pixels from tip of romaji to base of translation
        const totalBlockHeight = topBoundary + bottomBoundary;

        // Add padding between blocks
        currentYOffset += totalBlockHeight + defaultSpacing;
    }

    targetScroll = lineOffsets[activeIdx] || 0;
    scrollPos += (targetScroll - scrollPos) * 0.1;

    ctx.save();
    ctx.translate(w / 2, (h / 2) - scrollPos);

    lyricLines.forEach((line, i) => {
        const dist = Math.abs(i - activeIdx);
        // Increase alpha floor from 0.1 to 0.3 for better visibility of distant lines
        ctx.globalAlpha = Math.max(0.3, 1 - dist * 0.3);
        ctx.textAlign = "center";

        const y = lineOffsets[i];
        const isCurrent = (i === activeIdx);

        // Universal Dark Shadow for all text
        ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
        ctx.shadowBlur = 8;

        const mainSize = isCurrent ? vmin * 7.2 : vmin * 4.2;
        const romajiSize = isCurrent ? vmin * 6.2 : vmin * 3.6;
        const transSize = isCurrent ? vmin * 6.2 : vmin * 3.6;

        // 1. Romaji (Top)
        if (line.romaji) {
            ctx.font = `italic 600 ${romajiSize}px 'Segoe UI', sans-serif`;
            // Revert inactive romaji to light gray for readability
            ctx.fillStyle = isCurrent ? currentPalette.romaji : "#DDDDDD";
            // Shift up to make room
            wrapText(ctx, line.romaji, 0, y - (vmin * 9.2), maxWidth, romajiSize * 1.2, true);
        }

        // 2. Original Text (Middle)
        ctx.font = isCurrent ? `700 ${mainSize}px 'Segoe UI', sans-serif` : `600 ${mainSize}px 'Segoe UI', sans-serif`;
        // Inactive main text stays white
        ctx.fillStyle = isCurrent ? currentPalette.vibrant : "#FFFFFF";

        // Draw main text
        wrapText(ctx, line.text, 0, y, maxWidth, mainSize * 1.2, false);

        // If current, draw a second pass with the vibrant glow to ensure both contrast and vibrancy
        if (isCurrent) {
            ctx.shadowColor = currentPalette.vibrant;
            ctx.shadowBlur = 15;
            wrapText(ctx, line.text, 0, y, maxWidth, mainSize * 1.2, false);
        }

        // 3. Translation (Bottom)
        if (showTranslation && line.translation) {
            // Calculate downward baseline shift for wrapped lyrics
            ctx.font = isCurrent ? `700 ${mainSize}px 'Segoe UI', sans-serif` : `600 ${mainSize}px 'Segoe UI', sans-serif`;
            const mainLineCount = getWrapLines(ctx, line.text, maxWidth).length;
            const mainWrapShift = (mainLineCount > 1 ? mainLineCount - 1 : 0) * (mainSize * 1.2);

            ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
            ctx.shadowBlur = 8;

            ctx.font = `600 ${transSize}px 'Segoe UI', sans-serif`;
            ctx.fillStyle = isCurrent ? currentPalette.trans : "#CCCCCC";

            // Perfect 6.8vmin baseline offset guarantees exactly 2.0vmin of physical blank space
            wrapText(ctx, `(${line.translation})`, 0, y + mainWrapShift + (vmin * 8.2), maxWidth, transSize * 1.2, false);
        }
    });

    ctx.restore();

    pipWin.requestAnimationFrame(renderLoop);
}

function injectStructure() {
    const doc = pipWin.document;
    doc.body.innerHTML = `
        <div id="bg-cover"></div>
        <canvas id="lyricCanvas"></canvas>
        <button id="back-btn">⤺ Back to tab</button>
        <div id="ui-container">
            <div id="seeker-container"><div id="seeker-bar"></div></div>
            <div id="controls">
                <button class="btn" id="mute-btn">${ICON_VOL_HIGH}</button>
                <div style="width: 0px;"></div>
                <button class="btn" id="prev">${ICON_PREV}</button>
                <button class="btn" id="playpause">${ICON_PAUSE}</button>
                <button class="btn" id="next">${ICON_NEXT}</button>
                <div style="width: 0px;"></div>
                <button class="btn" id="cc-btn" title="Translate Lyrics">${ICON_CC}</button>
            </div>
        </div>
        <style>
            #back-btn {
                position: absolute; top: 15px; left: 15px;
                background: rgba(255,255,255,0.2); border: none;
                color: white; padding: 8px 15px; border-radius: 20px;
                font-weight: bold; cursor: pointer; backdrop-filter: blur(5px);
                font-family: 'Segoe UI', sans-serif; opacity: 0; transition: opacity 0.2s;
                z-index: 20;
            }
            body:hover #back-btn { opacity: 1; }
            #back-btn:hover { background: rgba(255,255,255,0.4); }
        </style>
    `;

    const click = (sel) => document.querySelector(sel)?.click();
    doc.getElementById('prev').onclick = () => click('[data-testid="control-button-skip-back"], .previous-button');
    doc.getElementById('next').onclick = () => click('[data-testid="control-button-skip-forward"], .next-button');
    doc.getElementById('playpause').onclick = () => click('[data-testid="control-button-playpause"], .play-pause-button');

    doc.getElementById('back-btn').onclick = () => {
        chrome.runtime.sendMessage({ type: 'FOCUS_TAB' });
        pipWin.close();
    };

    // Mute Logic
    doc.getElementById('mute-btn').onclick = () => {
        const media = document.querySelector('video, audio');
        if (media) media.muted = !media.muted;
    };

    // CC Logic
    doc.getElementById('cc-btn').onclick = () => {
        showTranslation = !showTranslation;
        chrome.storage.local.set({ showTranslation });
        updateCCButtonState();
        if (showTranslation) fetchLyrics(); // Fetch if enabled
    };

    updateCCButtonState(); // Init state

    doc.getElementById('seeker-container').onclick = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;

        const p = document.querySelector('video, audio');
        if (p && p.duration > 0) {
            p.currentTime = percent * p.duration;
        }

        // --- THE POINTER EVENT FIX ---
        const spotifyProgressBar = document.querySelector('[data-testid="progress-bar"]');
        if (spotifyProgressBar) {
            const spRect = spotifyProgressBar.getBoundingClientRect();
            const targetX = spRect.left + (percent * spRect.width);
            const targetY = spRect.top + (spRect.height / 2);

            const pointerDown = new PointerEvent('pointerdown', {
                bubbles: true, cancelable: true,
                clientX: targetX, clientY: targetY, pointerId: 1, pointerType: 'mouse'
            });
            spotifyProgressBar.dispatchEvent(pointerDown);

            const pointerUp = new PointerEvent('pointerup', {
                bubbles: true, cancelable: true,
                clientX: targetX, clientY: targetY, pointerId: 1, pointerType: 'mouse'
            });
            spotifyProgressBar.dispatchEvent(pointerUp);
        }
    };
}



function updateCCButtonState() {
    if (!pipWin) return;
    const btn = pipWin.document.getElementById('cc-btn');
    if (btn) {
        if (showTranslation) {
            btn.classList.add('cc-active');
        } else {
            btn.classList.remove('cc-active');
        }
    }
}

// --- 2. LAUNCHER ---

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
        try {
            pipWin = await window.documentPictureInPicture.requestWindow({ width: 300, height: 300 });

            const link = pipWin.document.createElement('link');
            link.rel = 'stylesheet';
            link.href = chrome.runtime.getURL('styles.css');
            pipWin.document.head.appendChild(link);

            injectStructure();
            fetchLyrics();

            pipWin.requestAnimationFrame(renderLoop);
        } catch (e) {
            console.error("Launch Failed:", e);
        }
    };

    document.body.appendChild(btn);
};

setInterval(createLauncher, 2000);