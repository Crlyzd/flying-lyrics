// --- GLOBAL STATE ---
let currentTrack = "";
let lyricLines = [{ time: 0, text: "Waiting for music...", romaji: "" }];
let scrollPos = 0;
let targetScroll = 0;
let pipWin = null;

// For Spotify Time Interpolation
let lastTimeStr = "";
let lastTimeValue = 0;
let lastUpdateMs = performance.now();

// --- ICONS (SVG STRINGS) ---
const ICON_PREV = `<svg viewBox="0 0 24 24"><path d="M19 20L9 12l10-8v16zM5 19V5"/></svg>`;
const ICON_NEXT = `<svg viewBox="0 0 24 24"><path d="M5 4l10 8-10 8V4zM19 5v14"/></svg>`;
const ICON_PLAY = `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
const ICON_PAUSE = `<svg viewBox="0 0 24 24"><line x1="10" y1="4" x2="10" y2="20"></line><line x1="14" y1="4" x2="14" y2="20"></line></svg>`;
let canvas, ctx;

// --- 1. CORE FUNCTIONS ---

function wrapText(ctx, text, x, y, maxWidth, lineHeight, growUpwards = false) {
    const words = text.split(' ');
    let line = '';
    const lines = [];

// --- Settings helper ---

const SETTING_DEFAULTS = { translationEnabled: true, targetLanguage: "id", offset: 0 };

/** Read user settings from chrome.storage.sync (with fallback) */
async function getSettings() {
  try {
    return await new Promise((resolve, reject) => {
      chrome.storage.sync.get(SETTING_DEFAULTS, (s) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(s);
        }
      });
    });
  } catch (e) {
    console.warn('[FlyingLyrics] Failed to load settings, using defaults:', e);
    return { ...SETTING_DEFAULTS };
  }
}

// --- Translation helpers ---

const CJK_REGEX = /[぀-ゟ゠-ヿ一-鿿가-힣]/;

/**
 * Get romanization (transliteration) for CJK text via Google Translate.
 * Uses dt=rm to request romanized form.
 */
async function getRomanization(text) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=rm&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    const data = await res.json();
    return data?.[0]?.[0]?.[3] || "";
  } catch (e) {
    console.warn('[FlyingLyrics] Romanization failed:', e);
    return "";
  }
}

/**
 * Translate text to targetLang via Google Translate.
 */
async function translateText(text, targetLang) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    const data = await res.json();
    const segments = data?.[0];
    if (!Array.isArray(segments)) return "";
    return segments.filter(s => Array.isArray(s) && s[0]).map(s => s[0]).join('');
  } catch (e) {
    console.warn('[FlyingLyrics] Translation failed:', e);
    return "";
  }
}

// --- Color Utils (Adaptive Theming) ---

const ColorUtils = {
  /**
   * Extract dominant colors from an image URL.
   * Returns generic fallback if failed.
   */
  async getDominantColors(imageUrl) {
    const FALLBACK = {
      romaji: '#ffd700',      // Gold
      original: '#ffffff',    // White
      translation: '#90EE90'  // Light Green
    };

    if (!imageUrl) return FALLBACK;

    try {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.src = imageUrl;

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      // Low res for performance & dominant color finding
      canvas.width = 50;
      canvas.height = 50;
      ctx.drawImage(img, 0, 0, 50, 50);

      const imageData = ctx.getImageData(0, 0, 50, 50).data;
      const colorMap = {};

      // Quantize and count
      for (let i = 0; i < imageData.length; i += 4) {
        const r = imageData[i];
        const g = imageData[i + 1];
        const b = imageData[i + 2];
        const a = imageData[i + 3];

        if (a < 128) continue; // Skip transparent

        // Ignore very dark or very white pixels to avoid boring colors
        const rgb = [r, g, b];
        const hsl = this.rgbToHsl(r, g, b);
        if (hsl[2] < 0.15 || hsl[2] > 0.90) continue;
        if (hsl[1] < 0.10) continue; // Ignore dull grays

        // Quantize: round to nearest 32 to group similar colors
        const qR = Math.round(r / 32) * 32;
        const qG = Math.round(g / 32) * 32;
        const qB = Math.round(b / 32) * 32;
        const key = `${qR},${qG},${qB}`;

        if (!colorMap[key]) colorMap[key] = { count: 0, r: qR, g: qG, b: qB, hsl };
        colorMap[key].count++;
      }

      // Sort by frequency
      const sorted = Object.values(colorMap).sort((a, b) => b.count - a.count);

      // Select 3 distinct colors
      const selected = [];

      for (const c of sorted) {
        if (selected.length >= 3) break;
        // Check if distinct enough from already selected (Hue difference > 30 degrees)
        const isDistinct = selected.every(s => Math.abs(s.hsl[0] - c.hsl[0]) > 0.1);
        if (isDistinct || selected.length === 0) {
          selected.push(c);
        }
      }

      // If we don't have enough, fill with variations
      while (selected.length < 3) {
        if (selected.length === 0) selected.push({ r: 255, g: 255, b: 255, hsl: [0, 0, 1] }); // Fail safe
        else {
          // Create a variation (shift hue or lightness)
          const base = selected[0];
          selected.push({ ...base, hsl: [(base.hsl[0] + 0.5) % 1, base.hsl[1], base.hsl[2]] });
        }
      }

      // Assign to roles logic:
      // 1. Vibrant/Dominant -> Romaji
      // 2. Lightest -> Original (Readability)
      // 3. Third -> Translation
      // Ensure all are readable on dark bg

      const readableColors = selected.map(c => this.ensureReadable(c.hsl));

      return {
        romaji: readableColors[0],
        original: readableColors[1],
        translation: readableColors[2]
      };

    } catch (e) {
      console.warn('[FlyingLyrics] Color extraction failed:', e);
      return FALLBACK;
    }
  },

  rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0; // achromatic
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return [h, s, l];
  },

  hslToHex(h, s, l) {
    let r, g, b;
    if (s === 0) {
      r = g = b = l; // achromatic
    } else {
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
    const toHex = x => {
      const hex = Math.round(x * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  },

  ensureReadable(hsl) {
    // Force lightness to be high enough for dark background
    // Min lightness 60% standard, maybe 70% for translation
    let [h, s, l] = hsl;
    if (l < 0.6) l = 0.6 + (l * 0.2); // Boost lightness
    if (s < 0.2) s = 0.2; // Boost saturation slightly if too gray
    return this.hslToHex(h, s, l);
  }
};

// --- Queue System for Enhancement (Concurrency Control) ---

const ENHANCEMENT_QUEUE = [];
let ACTIVE_REQUESTS = 0;
const MAX_CONCURRENT_REQUESTS = 3; // Limit parallel requests to avoid rate limits

function queueEnhancement(lineDiv, text, settings) {
  ENHANCEMENT_QUEUE.push({ lineDiv, text, settings });
  processQueue();
}

function processQueue() {
  if (ACTIVE_REQUESTS >= MAX_CONCURRENT_REQUESTS || ENHANCEMENT_QUEUE.length === 0) return;

  const task = ENHANCEMENT_QUEUE.shift();
  ACTIVE_REQUESTS++;

  enhanceLyricLine(task.lineDiv, task.text, task.settings)
    .finally(() => {
      ACTIVE_REQUESTS--;
      processQueue();
    });
}

/**
 * Validate that the lyric element is still in the DOM before updating it.
 * This prevents updating lyrics for a song that has already changed.
 */
function isElementValid(el) {
  return document.contains(el) || (el.ownerDocument && el.ownerDocument.contains(el));
}

async function enhanceLyricLine(lineDiv, text, settings) {
  if (!isElementValid(lineDiv)) return; // Stop if element removed

  const isCJK = CJK_REGEX.test(text);

  // Create containers for new content if they don't exist, but don't overwrite yet
  // We'll append them to ensure smooth visual update

  const updates = [];

  // Parallel fetch if both needed
  const promises = [];

  if (isCJK) {
    promises.push(getRomanization(text).then(romaji => ({ type: 'romaji', content: romaji })));
  }

  if (settings.translationEnabled) {
    promises.push(translateText(text, settings.targetLanguage).then(trans => ({ type: 'translation', content: trans })));
  }

  const results = await Promise.all(promises);

  if (!isElementValid(lineDiv)) return;

  // Apply updates
  // Structure: .romaji (top) -> .original (middle) -> .translation (bottom)
  // Current structure has .original. We need to prepend romaji and append translation.

  const originalSpan = lineDiv.querySelector('.original');
  if (!originalSpan) return;

  results.forEach(res => {
    if (res.type === 'romaji' && res.content) {
      const span = document.createElement('span');
      span.className = 'romaji';
      span.textContent = res.content;
      // Romaji goes BEFORE original
      lineDiv.insertBefore(span, originalSpan);

      // Add animation class for pop-in effect
      span.animate([
        { opacity: 0, transform: 'translateY(-5px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ], { duration: 300, fill: 'forwards' });
    }

    if (res.type === 'translation' && res.content) {
      const span = document.createElement('span');
      span.className = 'translation';
      span.textContent = res.content;
      // Translation goes AFTER original
      lineDiv.appendChild(span);

      // Add animation class for pop-in effect
      span.animate([
        { opacity: 0, transform: 'translateY(5px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ], { duration: 300, fill: 'forwards' });
    }
  });
}


// --- Autoscroll helpers ---

function parseLRC(syncedLyrics) {
  const lines = syncedLyrics.split('\n');
  const result = [];
  const re = /\[(\d{2}):(\d{2}(?:\.\d{1,3})?)\]\s*(.*)/;
  for (const line of lines) {
    const m = line.match(re);
    if (!m) continue;
    const time = parseInt(m[1]) * 60 + parseFloat(m[2]);
    const text = m[3].trim();
    if (!text) continue;
    result.push({ time, text });
  }
  result.sort((a, b) => a.time - b.time);
  return result;
}

/**
 * Robustly find media element - searches normal DOM, shadow DOMs, and iframes
 */
function getMediaElement() {
  let el = document.querySelector('video, audio');
  if (el) return el;

  const allElements = document.querySelectorAll('*');
  for (const node of allElements) {
    if (node.shadowRoot) {
      el = node.shadowRoot.querySelector('video, audio');
      if (el) return el;
    }
  }

  return null;
}

/**
 * Fallback: parse playback time from Spotify/YTM progress bar UI text
 */
function getTimeFromProgressBar() {
  const spotifyEl = document.querySelector('[data-testid="playback-position"]');
  if (spotifyEl) return parseTimeString(spotifyEl.textContent);

  const ytmEl = document.querySelector('.time-info.style-scope.ytmusic-player-bar');
  if (ytmEl) return parseTimeString(ytmEl.textContent);

  const ytEl = document.querySelector('.ytp-time-current');
  if (ytEl) return parseTimeString(ytEl.textContent);

  return null;
}

function parseTimeString(str) {
  if (!str) return null;
  const cleaned = str.trim();
  const parts = cleaned.split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

/**
 * Get current playback time in seconds using all available methods
 */
function getCurrentPlaybackTime() {
  const mediaEl = getMediaElement();
  if (mediaEl && mediaEl.currentTime > 0) return mediaEl.currentTime;

  const uiTime = getTimeFromProgressBar();
  if (uiTime !== null) return uiTime;

  return null;
}

// --- Main logic ---

async function startLyricWindow() {
  const pipWin = await window.documentPictureInPicture.requestWindow({ width: 400, height: 600 });
  const doc = pipWin.document;

  const style = doc.createElement('style');
  style.textContent = `
    html, body {
      height: 100%;
      margin: 0;
      padding: 0;
      overflow-y: auto !important;
      background-color: #000;
    }
    body {
      color: #fff;
      font-family: sans-serif;
      text-align: center;
      background-attachment: local;
      background-repeat: repeat;
      background-size: contain;
    }
    #overlay {
      background: rgba(0, 0, 0, 0.6);
      min-height: 100%;
      width: 100%;
      padding: 20px 0;
    }
    #lyric-container { padding: 0 20px; }
    h3 { color: #1DB954; font-size: 24px; text-shadow: 2px 2px 4px #000; }
    .artist-name { color: #ccc; font-size: 16px; margin-bottom: 20px; text-shadow: 1px 1px 2px #000; }

    /* --- Synced lyric styles with dramatic visual effects --- */
    :root {
      --color-romaji: #ffd700;
      --color-original: #ffffff;
      --color-translation: #90EE90;
    }

    .lyric-item {
      margin-bottom: 35px;
      transition: transform 0.3s ease-out, opacity 0.3s ease-out, filter 0.3s ease-out; /* Faster transition */
      opacity: 0.3;
      filter: blur(1.5px);
      transform: scale(0.95);
      contain: content; /* Rendering optimization */
    }
    /* Lines near the active line get slightly more visible */
    .lyric-item.near {
      opacity: 0.55;
      filter: blur(0.5px);
      transform: scale(0.97);
    }
    /* The ACTIVE line: full glow, bright, scaled up */
    .lyric-item.active {
      opacity: 1;
      filter: blur(0px);
      transform: scale(1.08);
    }
    .lyric-item.active .original {
      color: var(--color-original, #fff);
      text-shadow: 0 0 15px rgba(255,255,255,0.6), 0 0 30px var(--color-original), 2px 2px 4px #000;
      transition: color 1s ease, text-shadow 1s ease;
    }
    .lyric-item.active .romaji {
      color: var(--color-romaji, #ffd700);
      text-shadow: 0 0 12px var(--color-romaji), 2px 2px 4px #000;
      transition: color 1s ease, text-shadow 1s ease;
    }
    .lyric-item.active .translation {
      color: var(--color-translation, #90EE90);
      text-shadow: 0 0 10px var(--color-translation), 1px 1px 2px #000;
      transition: color 1s ease, text-shadow 1s ease;
    }
    /* Passed lines: slightly visible, no blur */
    .lyric-item.passed {
      opacity: 0.4;
      filter: blur(0px);
      transform: scale(0.95);
    }
    /* Plain lyrics fallback: no effects, always visible */
    .lyric-item.no-sync {
      opacity: 1;
      filter: none;
      transform: none;
    }

    .romaji { display: block; font-size: 20px; color: #aaa; font-weight: bold; font-style: italic; margin-bottom: 10px; text-shadow: 2px 2px 4px #000; transition: color 0.5s; }
    .original { display: block; font-size: 18px; color: #ccc; text-shadow: 2px 2px 4px #000; transition: color 0.5s; }
    .translation { display: block; font-size: 14px; color: #888; font-style: italic; margin-top: 5px; text-shadow: 1px 1px 2px #000; transition: color 0.5s; }

    /* Sync status indicator */
    #sync-status {
      position: fixed;
      bottom: 10px;
      right: 10px;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 11px;
      z-index: 999;
      opacity: 0.7;
    }
    #sync-status.connected { background: #1DB954; color: #fff; }
    #sync-status.disconnected { background: #ff4444; color: #fff; }
  `;
  doc.head.append(style);

  const overlay = doc.createElement('div');
  overlay.id = "overlay";
  const container = doc.createElement('div');
  container.id = "lyric-container";
  overlay.append(container);
  doc.body.append(overlay);

  // Sync status badge
  const badge = doc.createElement('div');
  badge.id = "sync-status";
  badge.className = "disconnected";
  badge.textContent = "⏳ Syncing...";
  doc.body.append(badge);

  // Initial Update
  updateLyrics(container, doc, badge);

  // --- Faster Autoscroll interval (100ms) for smoother response ---
  let lastActiveIdx = -1;

  // Local settings cache for realtime updates
  let currentSettings = { ...SETTING_DEFAULTS, offset: 0 };

  // Initial load
  getSettings().then(s => currentSettings = s);

  // Listen for realtime changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
      if (changes.offset) currentSettings.offset = changes.offset.newValue;
      if (changes.translationEnabled) currentSettings.translationEnabled = changes.translationEnabled.newValue;
      if (changes.targetLanguage) currentSettings.targetLanguage = changes.targetLanguage.newValue;
    }
  });

  const scrollInterval = setInterval(() => {
    if (pipWin.closed) { clearInterval(scrollInterval); return; }

    let currentTime = getCurrentPlaybackTime();

    // We cache selector query if possible, but here we need live list
    // Optimization: querySelectorAll is fast enough if DOM isn't huge (usually <100 nodes)
    const allLines = container.querySelectorAll('.lyric-item[data-time]');

    if (!allLines.length) return;

    if (currentTime === null) {
      if (badge.textContent !== "❌ No sync") { // Prevent redundant DOM writes
        badge.className = "disconnected";
        badge.textContent = "❌ No sync";
      }
      return;
    }

    // APPLY OFFSET HERE
    // offset is in ms, currentTime is in seconds
    currentTime += (currentSettings.offset || 0) / 1000;

    if (badge.textContent !== "🎵 Synced") {
      badge.className = "connected";
      badge.textContent = "🎵 Synced";
    }

    // Find active line index (last line whose timestamp <= currentTime)
    // Optimization: Binary search could be used, but linear scan is fine for <100 items
    // and often robust for unsorted data (though parsed is sorted).
    let activeIdx = -1;
    for (let i = 0; i < allLines.length; i++) {
      // use Number conversion just once
      const time = parseFloat(allLines[i].dataset.time);
      if (time <= currentTime) {
        activeIdx = i;
      } else {
        break; // Sorted list optimization: stop as soon as we overshoot
      }
    }

    if (activeIdx === lastActiveIdx) return; // STRICTLY NO UPDATE if index hasn't changed

    // --- Targeted DOM Update for Seeking/Playback ---

    // If we jumped far (seeking), we must refresh all classes relative to new activeIdx.
    // However, if we just moved to next line (activeIdx = lastActiveIdx + 1), we can be smarter?
    // Actually, "passed" status changes for everything before, so iterating is necessary.
    // THE KEY OPTIMIZATION: Only touch classList if it NEEDS changing.

    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i];
      const list = line.classList;

      // Determine desired state
      let isActive = (i === activeIdx);
      let isPassed = (i < activeIdx);
      let isNear = (i === activeIdx + 1 || i === activeIdx + 2);

      // Apply updates ONLY if needed (Accessing DOM classList is cheaper than writing layout)
      if (isActive && !list.contains('active')) {
        list.add('active');
        list.remove('passed', 'near');
      } else if (!isActive && list.contains('active')) {
        list.remove('active');
      }

      if (isPassed && !list.contains('passed')) {
        list.add('passed');
        list.remove('near');
      } else if (!isPassed && list.contains('passed')) {
        list.remove('passed');
      }

      if (isNear && !list.contains('near')) {
        list.add('near');
      } else if (!isNear && list.contains('near')) {
        list.remove('near');
      }
    }

    lastActiveIdx = activeIdx;

    // Smooth scroll active line to center
    if (activeIdx >= 0) {
      allLines[activeIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 100); // 100ms interval for hi-res sync

  // --- Track change observer ---
  const observer = setInterval(() => {
    const activeTrack = navigator.mediaSession.metadata?.title || "";
    if (activeTrack !== currentTrack) {
      currentTrack = activeTrack;
      // Clear queue on track change
      ENHANCEMENT_QUEUE.length = 0;
      lastActiveIdx = -1;
      updateLyrics(container, doc, badge);
    }
    if (pipWin.closed) clearInterval(observer);
  }, 2000);
}

// Global updateLyrics function
async function updateLyrics(container, doc, badge) {
  const metadata = navigator.mediaSession.metadata;
  const title = metadata?.title || "Unknown Track";
  const artist = metadata?.artist || "";
  const artworkUrl = metadata?.artwork?.[0]?.src || "";

  // Async Color Extraction
  // We don't await this to prevent blocking UI (render lyrics first)
  ColorUtils.getDominantColors(artworkUrl).then(palette => {
    if (doc && doc.documentElement) {
      doc.documentElement.style.setProperty('--color-romaji', palette.romaji);
      doc.documentElement.style.setProperty('--color-original', palette.original);
      doc.documentElement.style.setProperty('--color-translation', palette.translation);
    }
  });

  // Reset UI immediately
  if (artworkUrl) {
    doc.body.style.backgroundImage = `url(${artworkUrl})`;
  }
  container.innerHTML = `<h3>${title}</h3><p>Loading lyrics...</p>`;

  // Clear any pending queue
  ENHANCEMENT_QUEUE.length = 0;

  // Load user settings asynchronously
  const settings = await getSettings();
  console.log('[FlyingLyrics] Settings loaded:', settings);

    if (activeMedia && activeMedia.duration > 0 && activeMedia.currentTime > 0) {
        return { currentTime: activeMedia.currentTime, duration: activeMedia.duration, paused: activeMedia.paused };
    }

    if (!data || (!data.plainLyrics && !data.syncedLyrics)) {
      container.innerHTML = `<h3>${title}</h3><p style="color:#ff4444; font-weight:bold; margin-top:50px;">NO LYRIC AVAILABLE</p>`;
      if (badge) { badge.className = "disconnected"; badge.textContent = "❌ No lyrics"; }
      return;
    }

    container.innerHTML = `<h3>${title}</h3><div class="artist-name">${artist}</div><hr style="border:0; border-top:1px solid rgba(255,255,255,0.4); margin:20px 0;">`;

    // --- Synced lyrics path (autoscroll) ---
    if (data.syncedLyrics) {
      const parsed = parseLRC(data.syncedLyrics);
      if (badge) { badge.className = "connected"; badge.textContent = "🎵 Synced"; }

      const fragment = doc.createDocumentFragment();

      for (const entry of parsed) {
        const lineDiv = doc.createElement('div');
        lineDiv.className = "lyric-item";
        lineDiv.dataset.time = entry.time;

        // INSTANT RENDER: Only original text
        lineDiv.innerHTML = `<span class="original">${entry.text}</span>`;
        fragment.appendChild(lineDiv);

        // QUEUE ASYNC ENHANCEMENT (Translation/Romanization)
        queueEnhancement(lineDiv, entry.text, settings);
      }
      container.appendChild(fragment);
    }
    // --- Plain lyrics fallback (no autoscroll) ---
    else {
      if (badge) { badge.className = "disconnected"; badge.textContent = "📝 Plain (no sync)"; }

      const lines = data.plainLyrics.split('\n');
      const fragment = doc.createDocumentFragment();

      for (const line of lines) {
        if (!line.trim()) continue;
        const lineDiv = doc.createElement('div');
        lineDiv.className = "lyric-item no-sync";

        // INSTANT RENDER
        lineDiv.innerHTML = `<span class="original">${line}</span>`;
        fragment.appendChild(lineDiv);

        // QUEUE ASYNC ENHANCEMENT
        queueEnhancement(lineDiv, line, settings);
      }
      container.appendChild(fragment);
    }
  } catch (e) {
    console.error('[FlyingLyrics] Error fetching lyrics:', e);
    container.innerHTML = "<h3>Error fetching lyrics</h3>";
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