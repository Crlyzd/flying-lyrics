// =========================================================
//  import.js
//  Dedicated settings restoration page for Firefox / desktop.
//  Resolves popup closure on file dialogs by operating in a tab.
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
    const storage = window.FLYING_LYRICS?.storage;
    const SCRAMBLE_KEY = "flying_lyrics_backup_cipher_key";

    const dropZone = document.getElementById('drop-zone');
    const btnBrowse = document.getElementById('btn-browse');
    const fileInput = document.getElementById('file-input');
    const statusBox = document.getElementById('status-box');
    const btnClose = document.getElementById('btn-close');

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
        backupIncludeCache:  'boolean',
        recentFonts:         'object',
        lyricsOverrides:     'object',
        songOffsets:         'object',
        lyricsCache:         'object',
        userStats:           'object'
    };

    function validateAndSanitize(importedSettings) {
        const cleanSettings = {};
        for (const [key, expectedType] of Object.entries(ALLOWED_KEYS)) {
            if (key in importedSettings) {
                const val = importedSettings[key];
                if (typeof val === expectedType) {
                    if (expectedType === 'object') {
                        if (val === null) continue;

                        if (key === 'recentFonts') {
                            if (Array.isArray(val) && val.every(item => typeof item === 'string')) {
                                cleanSettings[key] = val;
                            }
                            continue;
                        }

                        if (key === 'songOffsets') {
                            const cleanOffsets = {};
                            let valid = true;
                            for (const [k, v] of Object.entries(val)) {
                                if (typeof v === 'number') cleanOffsets[k] = v;
                                else { valid = false; break; }
                            }
                            if (valid) cleanSettings[key] = cleanOffsets;
                            continue;
                        }

                        if (key === 'lyricsOverrides') {
                            const cleanOverrides = {};
                            let valid = true;
                            for (const [k, v] of Object.entries(val)) {
                                if (typeof v === 'string' || (typeof v === 'object' && v !== null)) {
                                    cleanOverrides[k] = v;
                                } else { valid = false; break; }
                            }
                            if (valid) cleanSettings[key] = cleanOverrides;
                            continue;
                        }

                        if (key === 'lyricsCache') {
                            const cleanCache = { order: [], entries: {} };
                            if (Array.isArray(val.order) && typeof val.entries === 'object' && val.entries !== null) {
                                for (const trackKey of val.order) {
                                    if (typeof trackKey === 'string') {
                                        const entry = val.entries[trackKey];
                                        if (entry && typeof entry === 'object' && Array.isArray(entry.lines)) {
                                            cleanCache.order.push(trackKey);
                                            cleanCache.entries[trackKey] = entry;
                                        }
                                    }
                                }
                                cleanSettings[key] = cleanCache;
                            }
                            continue;
                        }

                        if (key === 'userStats') {
                            cleanSettings[key] = {
                                totalSynced: typeof val.totalSynced === 'number' ? val.totalSynced : 0,
                                dailyStreak: typeof val.dailyStreak === 'number' ? val.dailyStreak : 0,
                                hoursListening: typeof val.hoursListening === 'number' ? val.hoursListening : 0,
                                lastSyncedDate: typeof val.lastSyncedDate === 'string' ? val.lastSyncedDate : "",
                                timeOfDayCounts: (typeof val.timeOfDayCounts === 'object' && val.timeOfDayCounts !== null) ? {
                                    morning: typeof val.timeOfDayCounts.morning === 'number' ? val.timeOfDayCounts.morning : 0,
                                    afternoon: typeof val.timeOfDayCounts.afternoon === 'number' ? val.timeOfDayCounts.afternoon : 0,
                                    evening: typeof val.timeOfDayCounts.evening === 'number' ? val.timeOfDayCounts.evening : 0,
                                    night: typeof val.timeOfDayCounts.night === 'number' ? val.timeOfDayCounts.night : 0
                                } : { morning: 0, afternoon: 0, evening: 0, night: 0 }
                            };
                            continue;
                        }
                    }
                    cleanSettings[key] = val;
                }
            }
        }
        return cleanSettings;
    }

    function showStatus(message, isSuccess = true, details = '') {
        if (!statusBox) return;
        statusBox.className = `status-box ${isSuccess ? 'status-success' : 'status-error'}`;
        statusBox.style.display = 'block';
        statusBox.textContent = '';
        const strong = document.createElement('strong');
        strong.textContent = message;
        statusBox.appendChild(strong);
        if (details) {
            const detailsDiv = document.createElement('div');
            detailsDiv.className = 'status-details';
            detailsDiv.textContent = details;
            statusBox.appendChild(detailsDiv);
        }
    }

    function handleFile(file) {
        if (!file) return;
        if (!file.name.endsWith('.fly') && !file.name.endsWith('.txt')) {
            showStatus("Invalid file type", false, "Please choose a valid Flying Lyrics (.fly) backup file.");
            return;
        }

        showStatus("Processing backup file...", true, file.name);

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const scrambledText = event.target.result.trim();
                const unscrambledText = unscramble(scrambledText);
                const importedEnvelope = JSON.parse(unscrambledText);

                if (typeof importedEnvelope !== 'object' || importedEnvelope === null) {
                    throw new Error("Invalid envelope format");
                }
                if (importedEnvelope.__app !== "flying-lyrics") {
                    throw new Error("Invalid application signature");
                }

                const rawSettings = importedEnvelope.settings;
                if (typeof rawSettings !== 'object' || rawSettings === null) {
                    throw new Error("Missing settings object");
                }

                const cleanSettings = validateAndSanitize(rawSettings);
                const settingsCount = Object.keys(cleanSettings).length;
                const cachedTracks = cleanSettings.lyricsCache?.order?.length || 0;

                storage.set(cleanSettings, () => {
                    // Notify active media tabs
                    chrome.tabs.query({ url: ["*://open.spotify.com/*", "*://music.youtube.com/*"] }, (tabs) => {
                        tabs?.forEach(tab => {
                            if (tab.id) {
                                chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATE', payload: cleanSettings }, () => {
                                    void chrome.runtime.lastError;
                                });
                            }
                        });
                    });

                    showStatus(
                        "✔ Backup Restored Successfully!",
                        true,
                        `Loaded ${settingsCount} settings${cachedTracks > 0 ? ` and ${cachedTracks} offline cached songs` : ''}. Active music players updated.`
                    );
                });

            } catch (err) {
                console.error("Backup restore failed:", err);
                showStatus("Failed to parse backup", false, "The file could not be decoded. Ensure it is a valid Flying Lyrics (.fly) backup.");
            }
        };

        reader.readAsText(file);
    }

    // Browse click handlers
    if (btnBrowse && fileInput) {
        btnBrowse.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
        });
    }

    // Drag and Drop handlers
    if (dropZone) {
        ['dragenter', 'dragover'].forEach(name => {
            dropZone.addEventListener(name, (e) => {
                e.preventDefault();
                dropZone.classList.add('drag-active');
            });
        });

        ['dragleave', 'drop'].forEach(name => {
            dropZone.addEventListener(name, (e) => {
                e.preventDefault();
                dropZone.classList.remove('drag-active');
            });
        });

        dropZone.addEventListener('drop', (e) => {
            const file = e.dataTransfer?.files?.[0];
            if (file) handleFile(file);
        });
    }

    if (btnClose) {
        btnClose.addEventListener('click', () => window.close());
    }
});
