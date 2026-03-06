// src/content/config.js

// Default system fonts (Baseline)
let userFontFamily = "'Noto Sans', 'Segoe UI', sans-serif";

// Visual customization defaults — synced from chrome.storage
let userFontSize = 18;   // px — scale factor for vmin calculations
let userBgBlur = 2;   // px — backdrop blur on #bg-cover
let userBgDarkness = 50;   // 0-100 — opacity of dark overlay on #bg-cover
let userCoverMode = 'default'; // 'default' | 'centered' | 'repeated'
let userGlowEnabled = false;    // animated glow on the active lyric
let userGlowStyle = 'theme';    // 'theme' | 'rainbow'
let userShowLyrics = true;      // toggle to display/hide lyrics completely

// Load all user preferences from storage on script init
const loadUserPreferences = () => {
    chrome.storage.local.get({
        customFont: "'Noto Sans', 'Segoe UI', sans-serif",
        fontSize: 18,
        bgBlur: 2,
        bgDarkness: 50,
        coverMode: 'default',
        glowEnabled: false,
        glowStyle: 'theme',
        showLyrics: true,
    }, (result) => {
        userFontFamily = result.customFont;
        userFontSize = result.fontSize;
        userBgBlur = result.bgBlur;
        userBgDarkness = result.bgDarkness;
        userCoverMode = result.coverMode;
        userGlowEnabled = result.glowEnabled;
        userGlowStyle = result.glowStyle;
        userShowLyrics = result.showLyrics;

        // Force layout update if PiP window is already active
        if (typeof needsLayoutUpdate !== 'undefined') {
            needsLayoutUpdate = true;
        }

        // Apply visual settings to PiP if already open
        if (typeof applyVisualSettings === 'function') {
            applyVisualSettings();
        }
    });
};

// Run immediately when script loads
loadUserPreferences();
