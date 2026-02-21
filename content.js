// --- GLOBAL STATE & INIT ---
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
let lyricsOverrides = {}; // Dictionary: "Artist - Title" -> { type: 'api', id: 1234 } OR { type: 'local', data: string }

// Dynamic Colors State
let currentPalette = {
    vibrant: "#1DB954", // Default Spotify Green
    trans: "#A0C0E0",   // Default Translation Blue
    romaji: "#F5AF19"   // Default Romaji Orange
};
let lastExtractedArt = "";

let canvas, ctx;

// For Spotify Time Interpolation
let lastTimeStr = "";
let lastTimeValue = 0;
let lastUpdateMs = performance.now();

// Load initial settings
chrome.storage.local.get({
    showTranslation: true,
    translationLang: 'id',
    syncOffset: 400,
    songOffsets: {},
    lyricsOverrides: {}
}, (items) => {
    showTranslation = items.showTranslation;
    translationLang = items.translationLang;
    syncOffset = items.syncOffset; // Still load global last used as fallback/init
    songOffsets = items.songOffsets || {};
    lyricsOverrides = items.lyricsOverrides || {};
});

// Listen for updates
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'SETTINGS_UPDATE') {
        const p = msg.payload;
        if (p.showTranslation !== undefined) {
            showTranslation = p.showTranslation;
            if (showTranslation && typeof fetchLyrics === 'function') fetchLyrics(); // Re-fetch if turned on
            if (typeof updateCCButtonState === 'function') updateCCButtonState();
        }
        if (p.translationLang !== undefined) {
            translationLang = p.translationLang;
            if (typeof fetchLyrics === 'function') fetchLyrics(); // Re-fetch with new lang
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
        if (p.lyricOverride !== undefined) {
            const meta = navigator.mediaSession.metadata;
            if (meta && meta.title && meta.artist) {
                const key = `${meta.artist} - ${meta.title}`;
                chrome.storage.local.get({ lyricsOverrides: {} }, (items) => {
                    const latestOverrides = items.lyricsOverrides || {};
                    latestOverrides[key] = p.lyricOverride;
                    lyricsOverrides = latestOverrides; // Update local cache
                    chrome.storage.local.set({ lyricsOverrides: latestOverrides });
                    if (typeof fetchLyrics === 'function') fetchLyrics(); // Re-fetch immediately
                });
            }
        }
    } else if (msg.type === 'GET_SYNC_OFFSET') {
        sendResponse({ syncOffset });
    } else if (msg.type === 'GET_CURRENT_TRACK') {
        const meta = navigator.mediaSession.metadata;
        if (meta && meta.title && meta.artist) {
            sendResponse({ artist: meta.artist, title: meta.title });
        } else {
            sendResponse({ error: 'No active track' });
        }
    }
});

// Bootstrapper
setInterval(() => {
    if (typeof createLauncher === 'function') createLauncher();
}, 2000);