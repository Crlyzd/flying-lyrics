// src/content/config.js

window.FLYING_LYRICS = window.FLYING_LYRICS || {};

// Unified User Preferences Defaults
window.FLYING_LYRICS.defaults = {
    // Functional Settings
    showTranslation: true,
    translationLang: 'id',
    globalSyncOffset: 1000,
    autoLaunch: false,
    songOffsets: {},
    lyricsOverrides: {},

    // Visual Settings
    customFont: "'Noto Sans', 'Segoe UI', sans-serif",
    fontSize: 18,
    bgBlur: 2,
    bgDarkness: 50,
    coverMode: 'default',
    glowEnabled: false,
    glowStyle: 'theme',
    showLyrics: true,
    lyricAlignment: 'center'
};

// O(1) set used by renderer and services to identify non-lyric status messages.
// Kept here so both modules share exactly one instance and one definition.
window.FLYING_LYRICS.SYSTEM_MSG_SET = new Set([
    "Waiting for music...",
    "No lyrics found",
    "Network Error",
    "Wait for it...",
    "No Lyrics Available"
]);
