// =========================================================
//  popup-backup.js
//  Backup export and import handlers, XOR encryption, and
//  validation logic.
//
//  Depends on: popup-state.js, popup-ui.js
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
    const popup   = window.FLYING_LYRICS.popup;
    const el      = popup.el;
    const storage = window.FLYING_LYRICS.storage;

    const SCRAMBLE_KEY = "flying_lyrics_backup_cipher_key";

    // Convert string (with potential Unicode characters) to XOR scrambled Base64 string
    function scramble(text) {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(text);
        const xorBytes = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) {
            const keyChar = SCRAMBLE_KEY.charCodeAt(i % SCRAMBLE_KEY.length);
            xorBytes[i] = bytes[i] ^ keyChar;
        }
        let binary = "";
        for (let i = 0; i < xorBytes.length; i++) {
            binary += String.fromCharCode(xorBytes[i]);
        }
        return btoa(binary);
    }

    // Convert XOR scrambled Base64 string back to standard Unicode string
    function unscramble(base64Text) {
        const binary = atob(base64Text);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            const keyChar = SCRAMBLE_KEY.charCodeAt(i % SCRAMBLE_KEY.length);
            bytes[i] = binary.charCodeAt(i) ^ keyChar;
        }
        const decoder = new TextDecoder();
        return decoder.decode(bytes);
    }

    // Whitelist of allowed storage keys and their expected javascript types
    const ALLOWED_KEYS = {
        showTranslation:     'boolean',
        translationLang:     'string',
        globalSyncOffset:    'number',
        autoLaunch:          'boolean',
        customFont:          'string',
        fontSize:            'number',
        bgBlur:              'number',
        bgDarkness:          'number',
        coverMode:           'string',
        glowEnabled:         'boolean',
        glowStyle:           'string',
        spotlightEnabled:    'boolean',
        lyricShadowEnabled:  'boolean',
        lyricAlignment:      'string',
        lineSpacing:         'number',
        verticalAnchor:      'number',
        albumCoverMode:      'boolean',
        telemetryConsent:    'boolean',
        pipMode:             'string',
        cloudSyncEnabled:    'boolean',
        ecoMode:             'boolean',
        fluidScrolling:      'boolean',
        lastPipWidth:        'number',
        lastPipHeight:       'number',
        themeAccent:         'string',
        popupBgAnimation:    'boolean',
        galaxyMode:          'boolean',
        popupColor1:         'string',
        popupColor2:         'string',
        popupColor3:         'string',
        recentFonts:         'object',
        lyricsOverrides:     'object',
        songOffsets:         'object'
    };

    // Filter out unknown keys and enforce strict type validation
    function validateAndSanitize(importedSettings) {
        const cleanSettings = {};
        for (const [key, expectedType] of Object.entries(ALLOWED_KEYS)) {
            if (key in importedSettings) {
                const val = importedSettings[key];
                if (typeof val === expectedType) {
                    if (expectedType === 'object') {
                        if (val === null) continue;

                        // Validate recentFonts array
                        if (key === 'recentFonts') {
                            if (Array.isArray(val) && val.every(item => typeof item === 'string')) {
                                cleanSettings[key] = val;
                            } else {
                                console.warn("Invalid format for recentFonts. Skipping.");
                            }
                            continue;
                        }

                        // Validate songOffsets (string key -> number value)
                        if (key === 'songOffsets') {
                            const cleanOffsets = {};
                            let valid = true;
                            for (const [k, v] of Object.entries(val)) {
                                if (typeof v === 'number') {
                                    cleanOffsets[k] = v;
                                } else {
                                    valid = false;
                                    break;
                                }
                            }
                            if (valid) {
                                cleanSettings[key] = cleanOffsets;
                            } else {
                                console.warn("Invalid key/value types in songOffsets. Skipping.");
                            }
                            continue;
                        }

                        // Validate lyricsOverrides (string key -> string/object value)
                        if (key === 'lyricsOverrides') {
                            const cleanOverrides = {};
                            let valid = true;
                            for (const [k, v] of Object.entries(val)) {
                                if (typeof v === 'string' || (typeof v === 'object' && v !== null)) {
                                    cleanOverrides[k] = v;
                                } else {
                                    valid = false;
                                    break;
                                }
                            }
                            if (valid) {
                                cleanSettings[key] = cleanOverrides;
                            } else {
                                console.warn("Invalid key/value types in lyricsOverrides. Skipping.");
                            }
                            continue;
                        }
                    }
                    cleanSettings[key] = val;
                } else {
                    console.warn(`Type mismatch for setting '${key}': expected '${expectedType}', got '${typeof val}'. Skipping.`);
                }
            }
        }
        return cleanSettings;
    }

    // =========================================================
    //  BACKUP EXPORT
    // =========================================================
    if (el.btnExportSettings) {
        el.btnExportSettings.addEventListener('click', () => {
            storage.get(null, async (items) => {
                // Delete heavy transient cache data to keep backup size minimal
                if (items.lyricsCache) {
                    delete items.lyricsCache;
                }
                if (items.welcomeTabId) {
                    delete items.welcomeTabId;
                }
                if (items.anonymousClientId) {
                    delete items.anonymousClientId;
                }

                const envelope = {
                    __app: "flying-lyrics",
                    __version: 1,
                    __timestamp: Date.now(),
                    settings: items
                };

                try {
                    const jsonStr = JSON.stringify(envelope, null, 2);
                    const scrambledData = scramble(jsonStr);
                    
                    const version = (chrome.runtime && chrome.runtime.getManifest) 
                        ? chrome.runtime.getManifest().version 
                        : "unknown";
                    const filename = `flying-lyrics-v${version}.fly`;

                    // Check if native Save File Picker is supported by the browser context
                    if (typeof window.showSaveFilePicker === 'function') {
                        const options = {
                            suggestedName: filename,
                            types: [{
                                description: 'Flying Lyrics Backup File (*.fly)',
                                accept: {
                                    'text/plain': ['.fly']
                                }
                            }]
                        };
                        const handle = await window.showSaveFilePicker(options);
                        const writable = await handle.createWritable();
                        await writable.write(scrambledData);
                        await writable.close();
                    } else {
                        // Fallback: Use standard anchor-based silent download
                        const dataStr = "data:text/plain;charset=utf-8," + encodeURIComponent(scrambledData);
                        const dlAnchorElem = document.createElement('a');
                        dlAnchorElem.setAttribute("href", dataStr);
                        dlAnchorElem.setAttribute("download", filename);
                        dlAnchorElem.click();
                    }
                } catch (e) {
                    // Ignore user aborting/canceling the save dialog
                    if (e.name !== 'AbortError') {
                        console.error("Backup export failed:", e);
                        alert("Failed to export backup.");
                    }
                }
            });
        });
    }

    // =========================================================
    //  BACKUP IMPORT
    // =========================================================
    if (el.btnImportSettings && el.importFile) {
        el.btnImportSettings.addEventListener('click', () => {
            el.importFile.click();
        });

        el.importFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const scrambledText = event.target.result.trim();
                    const unscrambledText = unscramble(scrambledText);
                    const importedEnvelope = JSON.parse(unscrambledText);

                    if (typeof importedEnvelope !== 'object' || importedEnvelope === null) {
                        throw new Error("Invalid format");
                    }

                    if (importedEnvelope.__app !== "flying-lyrics") {
                        throw new Error("Invalid application signature");
                    }

                    const rawSettings = importedEnvelope.settings;
                    if (typeof rawSettings !== 'object' || rawSettings === null) {
                        throw new Error("Missing settings object");
                    }

                    if (!confirm("Are you sure you want to overwrite all your current settings with this backup?")) {
                        el.importFile.value = ''; // Reset input
                        return;
                    }

                    const cleanSettings = validateAndSanitize(rawSettings);

                    storage.set(cleanSettings, () => {
                        // Send global refresh ping to any active media tabs
                        chrome.tabs.query({ url: ["*://open.spotify.com/*", "*://music.youtube.com/*"] }, (tabs) => {
                            tabs.forEach(tab => {
                                if (tab.id) {
                                    chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATE', payload: cleanSettings });
                                }
                            });
                        });

                        alert("Import successful! Please reopen the extension preferences.");
                        window.close(); // Close window to trigger a fresh UI build next time
                    });

                } catch (err) {
                    console.error("Backup import failed:", err);
                    alert("Failed to parse backup file. Make sure it is a valid Flying Lyrics (.fly) backup.");
                    el.importFile.value = ''; // Reset input
                }
            };
            reader.readAsText(file);
        });
    }
});
