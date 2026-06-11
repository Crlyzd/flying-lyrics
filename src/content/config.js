// src/content/config.js

window.FLYING_LYRICS = window.FLYING_LYRICS || {};

function getBrowserDefaultLanguage() {
    const supportedCodes = [
        'en', 'zh-CN', 'zh-TW', 'es', 'fr', 'ar', 'ru', 'pt', 
        'id', 'de', 'ja', 'tr', 'vi', 'ko', 'fa', 'it', 'th', 'ku'
    ];
    
    const preferences = [];
    if (typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.getUILanguage === 'function') {
        preferences.push(chrome.i18n.getUILanguage());
    }
    if (typeof navigator !== 'undefined') {
        if (Array.isArray(navigator.languages)) {
            preferences.push(...navigator.languages);
        }
        if (navigator.language) {
            preferences.push(navigator.language);
        }
    }
    
    for (const lang of preferences) {
        if (!lang) continue;
        const normalized = lang.toLowerCase();
        
        // Exact matches for Chinese dialects
        if (normalized === 'zh-cn' || normalized === 'zh-hans' || normalized === 'zh-sg' || normalized === 'zh-my') return 'zh-CN';
        if (normalized === 'zh-tw' || normalized === 'zh-hk' || normalized === 'zh-mo' || normalized === 'zh-hant') return 'zh-TW';
        
        // Exact match check
        const exactMatch = supportedCodes.find(code => code.toLowerCase() === normalized);
        if (exactMatch) return exactMatch;
        
        // Base match (e.g. "en-US" -> "en")
        const base = normalized.split('-')[0];
        if (base === 'zh') {
            return 'zh-CN';
        }
        const baseMatch = supportedCodes.find(code => code.toLowerCase() === base);
        if (baseMatch) return baseMatch;
    }
    
    return 'en';
}

// Unified User Preferences Defaults
window.FLYING_LYRICS.defaults = {
    // Functional Settings
    showTranslation: true,
    translationLang: getBrowserDefaultLanguage(),
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
    albumCoverMode: false, // When true, forces centered art + hides lyrics, locks all visual settings
    pipMode: 'document'
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
