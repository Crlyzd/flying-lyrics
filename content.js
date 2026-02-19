let currentTrack = "";

const createBtn = () => {
  if (document.getElementById('pip-lyrics-trigger')) return;
  const btn = document.createElement('button');
  btn.id = 'pip-lyrics-trigger';
  btn.innerHTML = '🎵 LYRICS';
  btn.style.cssText = 'position:fixed; top:60px; right:20px; z-index:2147483647; padding:12px 20px; background:#1DB954; color:white; border-radius:30px; border:2px solid white; cursor:pointer; font-weight:bold; box-shadow: 0 4px 15px rgba(0,0,0,0.5);';
  (document.body || document.documentElement).appendChild(btn);
  btn.onclick = () => startLyricWindow();
};

// --- Settings helper ---

const SETTING_DEFAULTS = { translationEnabled: true, targetLanguage: "id" };

/** Read user settings from chrome.storage.sync */
async function getSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get(SETTING_DEFAULTS, (s) => resolve(s));
  });
}

// --- Translation helpers ---

const CJK_REGEX = /[぀-ゟ゠-ヿ一-鿿가-힣]/;

/**
 * Get romanization (transliteration) for CJK text via Google Translate.
 * Uses dt=rm to request romanized form.
 */
async function getRomanization(text) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=rm&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  const data = await res.json();
  return data?.[0]?.[0]?.[3] || "";
}

/**
 * Translate text to targetLang via Google Translate.
 * Uses dt=t to request translated text.
 */
async function translateText(text, targetLang) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  const data = await res.json();
  // Concat all segments returned by the API
  return data?.[0]?.map(s => s[0]).join('') || "";
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
    .lyric-item {
      margin-bottom: 35px;
      transition: all 0.4s cubic-bezier(0.25, 0.1, 0.25, 1);
      opacity: 0.3;
      filter: blur(1.5px);
      transform: scale(0.95);
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
      color: #fff;
      text-shadow: 0 0 15px rgba(29,185,84,0.8), 0 0 30px rgba(29,185,84,0.4), 2px 2px 4px #000;
    }
    .lyric-item.active .romaji {
      color: #ffd700;
      text-shadow: 0 0 12px rgba(255,215,0,0.6), 2px 2px 4px #000;
    }
    .lyric-item.active .translation {
      color: #90EE90;
      text-shadow: 0 0 10px rgba(144,238,144,0.5), 1px 1px 2px #000;
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

    .romaji { display: block; font-size: 20px; color: #f5af19; font-weight: bold; font-style: italic; margin-bottom: 10px; text-shadow: 2px 2px 4px #000; }
    .original { font-size: 18px; text-shadow: 2px 2px 4px #000; }
    .translation { display: block; font-size: 14px; color: #aaa; font-style: italic; margin-top: 5px; text-shadow: 1px 1px 2px #000; }

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

  updateLyrics(container, doc, badge);

  // --- Autoscroll interval ---
  let lastActiveIdx = -1;
  const scrollInterval = setInterval(() => {
    if (pipWin.closed) { clearInterval(scrollInterval); return; }

    const currentTime = getCurrentPlaybackTime();
    const allLines = container.querySelectorAll('.lyric-item[data-time]');
    if (!allLines.length) return;

    if (currentTime === null) {
      badge.className = "disconnected";
      badge.textContent = "❌ No sync";
      return;
    }

    badge.className = "connected";
    badge.textContent = "🎵 Synced";

    // Find active line index (last line whose timestamp <= currentTime)
    let activeIdx = -1;
    for (let i = 0; i < allLines.length; i++) {
      if (parseFloat(allLines[i].dataset.time) <= currentTime) {
        activeIdx = i;
      } else {
        break;
      }
    }

    if (activeIdx === lastActiveIdx) return; // no change
    lastActiveIdx = activeIdx;

    // Apply classes for visual effect
    for (let i = 0; i < allLines.length; i++) {
      allLines[i].classList.remove('active', 'near', 'passed');

      if (i === activeIdx) {
        allLines[i].classList.add('active');
      } else if (i < activeIdx) {
        allLines[i].classList.add('passed');
      } else if (i === activeIdx + 1 || i === activeIdx + 2) {
        allLines[i].classList.add('near');
      }
    }

    // Smooth scroll active line to center
    if (activeIdx >= 0) {
      allLines[activeIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 400);

  // --- Track change observer ---
  const observer = setInterval(() => {
    const activeTrack = navigator.mediaSession.metadata?.title || "";
    if (activeTrack !== currentTrack) {
      currentTrack = activeTrack;
      lastActiveIdx = -1;
      updateLyrics(container, doc, badge);
    }
    if (pipWin.closed) clearInterval(observer);
  }, 3000);
}

/**
 * Build HTML for a single lyric line.
 * @param {string} text - The original lyric text
 * @param {object} settings - User settings { translationEnabled, targetLanguage }
 * @returns {Promise<string>} HTML content for the line
 */
async function buildLyricLineHTML(text, settings) {
  const isCJK = CJK_REGEX.test(text);
  let html = '';

  // Line 1: Romaji (only for CJK text)
  if (isCJK) {
    const romaji = await getRomanization(text);
    html += `<span class="romaji">${romaji}</span>`;
  }

  // Line 2: Original text (always shown)
  html += `<span class="original">${text}</span>`;

  // Line 3: Translation (if enabled in settings)
  if (settings.translationEnabled) {
    const translation = await translateText(text, settings.targetLanguage);
    html += `<span class="translation">${translation}</span>`;
  }

  return html;
}

async function updateLyrics(container, doc, badge) {
  const metadata = navigator.mediaSession.metadata;
  const title = metadata?.title || "Unknown Track";
  const artist = metadata?.artist || "";
  const artworkUrl = metadata?.artwork?.[0]?.src || "";

  if (artworkUrl) {
    doc.body.style.backgroundImage = `url(${artworkUrl})`;
  }

  container.innerHTML = `<h3>${title}</h3><p>AI Romanizing...</p>`;

  // Load user settings
  const settings = await getSettings();

  try {
    const res = await fetch(`https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`);
    const data = await res.json();

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

      for (const entry of parsed) {
        const lineDiv = doc.createElement('div');
        lineDiv.className = "lyric-item";
        lineDiv.dataset.time = entry.time;
        lineDiv.innerHTML = await buildLyricLineHTML(entry.text, settings);
        container.appendChild(lineDiv);
      }
    }
    // --- Plain lyrics fallback (no autoscroll) ---
    else {
      if (badge) { badge.className = "disconnected"; badge.textContent = "📝 Plain (no sync)"; }

      const lines = data.plainLyrics.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        const lineDiv = doc.createElement('div');
        lineDiv.className = "lyric-item no-sync";
        lineDiv.innerHTML = await buildLyricLineHTML(line, settings);
        container.appendChild(lineDiv);
      }
    }
  } catch (e) {
    container.innerHTML = "<h3>Error fetching lyrics</h3>";
  }
}

setInterval(createBtn, 3000);