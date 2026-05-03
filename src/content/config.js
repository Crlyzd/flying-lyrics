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
    fontSize: 26,
    bgBlur: 2,
    bgDarkness: 40,
    coverMode: 'default',
    glowEnabled: false,
    glowStyle: 'theme',
    lyricAlignment: 'center',
    lineSpacing: 4,  // vmin multiplier; UI step = actual - 2, so stored 4 = display step 2
    verticalAnchor: 4, // Default scale 1-10, mapped to offset
    albumCoverMode: false // When true, forces centered art + hides lyrics, locks all visual settings
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
