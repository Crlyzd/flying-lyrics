// --- GLOBAL STATE & INIT ---
let currentTrack = "";
let lyricLines = [{ time: 0, text: "Waiting for music...", romaji: "", translation: "" }];
let isCurrentLyricSynced = false;
let scrollPos = 0;
let targetScroll = 0;
let pipWin = null;

// Settings
let showTranslation = true;
let translationLang = 'id';
let globalSyncOffset = 1000;
let syncOffset = 1000;
let autoLaunch = false; // Auto-open lyrics window on first user interaction
let songOffsets = {}; // Dictionary: "Artist - Title" -> offset
let lyricsOverrides = {}; // Dictionary: "Artist - Title" -> { type: 'api', id: 1234 } OR { type: 'local', data: string }

// Cache State
let cachedLyrics = { key: "", lines: [], isSynced: false };

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
    globalSyncOffset: 1000,
    autoLaunch: false,
    songOffsets: {},
    lyricsOverrides: {}
}, (items) => {
    showTranslation = items.showTranslation;
    translationLang = items.translationLang;
    globalSyncOffset = items.globalSyncOffset;
    syncOffset = globalSyncOffset; // Fallback init
    autoLaunch = items.autoLaunch;
    songOffsets = items.songOffsets || {};
    lyricsOverrides = items.lyricsOverrides || {};
});

// Listen for updates
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'SETTINGS_UPDATE') {
        const p = msg.payload;
        if (p.autoLaunch !== undefined) {
            autoLaunch = p.autoLaunch;
        }
        if (p.showTranslation !== undefined) {
            showTranslation = p.showTranslation;
            cachedLyrics.key = ""; // Invalidate cache so translations get fetched/removed
            if (showTranslation && typeof fetchLyrics === 'function') fetchLyrics(); // Re-fetch if turned on
            if (typeof updateCCButtonState === 'function') updateCCButtonState();
        }
        if (p.translationLang !== undefined) {
            translationLang = p.translationLang;
            cachedLyrics.key = ""; // Invalidate cache for new language
            if (typeof fetchLyrics === 'function') fetchLyrics(); // Re-fetch with new lang
        }
        if (p.globalSyncOffset !== undefined) {
            globalSyncOffset = p.globalSyncOffset;
            // Eagerly apply if there's no explicitly set song offset for the current track
            const meta = navigator.mediaSession.metadata;
            if (meta && meta.title && meta.artist) {
                const key = `${meta.artist} - ${meta.title}`;
                if (songOffsets[key] === undefined) {
                    syncOffset = globalSyncOffset;
                }
            }
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
                    cachedLyrics.key = ""; // Invalidate cache for new explicit override
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