// src/content/config.js

// Default system fonts (Baseline)
let userFontFamily = "'Noto Sans', 'Segoe UI', sans-serif";

// Future feature: function to update this from chrome.storage
const loadUserPreferences = () => {
    chrome.storage.local.get(['customFont'], (result) => {
        if (result.customFont) {
            userFontFamily = result.customFont;
            // Force layout update if PiP window is already active
            if (typeof needsLayoutUpdate !== 'undefined') {
                needsLayoutUpdate = true;
            }
        }
    });
};

// Run immediately when script loads
loadUserPreferences();
