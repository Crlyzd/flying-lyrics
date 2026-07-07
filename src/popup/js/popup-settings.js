// =========================================================
//  popup-settings.js
//  General configuration checkboxes, backup export/import handlers,
//  and platform launch triggers.
//
//  Depends on: popup-state.js, popup-ui.js (for saveAndNotify,
//  notifyTab), popup-ui.js (for getBrowserDefaultLanguage if needed,
//  though it's in state).
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
    const popup   = window.FLYING_LYRICS.popup;
    const el      = popup.el;
    const storage = window.FLYING_LYRICS.storage;

    // Use helpers exposed by popup namespace
    const notifyTab = popup.notifyTab;
    const saveAndNotify = popup.saveAndNotify;

    // =========================================================
    //  MAIN SETTING LISTENERS
    // =========================================================

    if (el.toggleAutolaunch) {
        el.toggleAutolaunch.addEventListener('change', () => {
            saveAndNotify({ autoLaunch: el.toggleAutolaunch.checked });
        });
    }

    if (el.toggleBorderlessPip) {
        el.toggleBorderlessPip.addEventListener('change', () => {
            // Cooldown mechanism to prevent rapid clicking
            el.toggleBorderlessPip.disabled = true;
            saveAndNotify({ pipMode: el.toggleBorderlessPip.checked ? 'video' : 'document' });

            let secondsLeft = 3;
            const originalText = el.labelBorderlessPip ? el.labelBorderlessPip.textContent : "Borderless Mode";
            if (el.labelBorderlessPip) {
                el.labelBorderlessPip.textContent = `${originalText} (${secondsLeft}s)`;
            }

            const intervalId = setInterval(() => {
                secondsLeft--;
                if (secondsLeft <= 0) {
                    clearInterval(intervalId);
                    el.toggleBorderlessPip.disabled = false;
                    if (el.labelBorderlessPip) {
                        el.labelBorderlessPip.textContent = originalText;
                    }
                } else {
                    if (el.labelBorderlessPip) {
                        el.labelBorderlessPip.textContent = `${originalText} (${secondsLeft}s)`;
                    }
                }
            }, 1000);
        });
    }

    if (el.toggleEcoMode) {
        el.toggleEcoMode.addEventListener('change', () => {
            saveAndNotify({ ecoMode: el.toggleEcoMode.checked });
        });
    }

    if (el.toggleTrans) {
        el.toggleTrans.addEventListener('change', () => {
            saveAndNotify({ showTranslation: el.toggleTrans.checked });
        });
    }

    if (el.toggleCloudSync) {
        el.toggleCloudSync.addEventListener('change', () => {
            const enabled = el.toggleCloudSync.checked;
            const syncKeysList = Array.from(storage.syncKeys);

            if (enabled) {
                // Migrating Local -> Sync
                chrome.storage.local.get(syncKeysList, (localData) => {
                    chrome.storage.sync.set(localData, () => {
                        chrome.storage.local.set({ cloudSyncEnabled: true }, () => {
                            notifyTab(localData);
                        });
                    });
                });
            } else {
                // Migrating Sync -> Local
                chrome.storage.sync.get(syncKeysList, (syncData) => {
                    chrome.storage.local.set({ ...syncData, cloudSyncEnabled: false }, () => {
                        notifyTab(syncData);
                    });
                });
            }
        });
    }

    function updateTelemetryUI(consentEnabled) {
        if (!el.telemetryToggle) return;
        if (consentEnabled) {
            el.telemetryToggle.textContent = "I'm in!";
            el.telemetryToggle.title = "Anonymous Analytics: Opt-out";
        } else {
            el.telemetryToggle.textContent = "I'm out!";
            el.telemetryToggle.title = "Anonymous Analytics: Opt-in";
        }
    }
    popup.updateTelemetryUI = updateTelemetryUI; // expose for init

    if (el.telemetryToggle) {
        el.telemetryToggle.addEventListener('click', (e) => {
            e.preventDefault();
            storage.get({ telemetryConsent: true }, (items) => {
                const newConsent = !items.telemetryConsent;
                storage.set({ telemetryConsent: newConsent }, () => {
                    updateTelemetryUI(newConsent);
                });
            });
        });
    }

    if (el.langSelect) {
        el.langSelect.addEventListener('change', () => {
            if (el.langSelect.value === 'request_language') {
                // Open the Google Form and reset to the previously selected language
                chrome.tabs.create({ url: 'https://forms.gle/qdyBFtmeomtGBroXA' });
                // Revert to the first real language option so the select doesn't stay on the meta-option
                storage.get({ translationLang: popup.getBrowserDefaultLanguage() }, (items) => {
                    el.langSelect.value = items.translationLang;
                });
                return;
            }
            saveAndNotify({ translationLang: el.langSelect.value });
        });
    }

    // =========================================================
    //  BACKUP & RESTORE
    // =========================================================
    if (el.btnExportSettings) {
        el.btnExportSettings.addEventListener('click', () => {
            storage.get(null, (items) => {
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(items, null, 2));
                const dlAnchorElem = document.createElement('a');
                dlAnchorElem.setAttribute("href", dataStr);
                dlAnchorElem.setAttribute("download", "flying-lyrics-backup.json");
                dlAnchorElem.click();
            });
        });
    }

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
                    const importedData = JSON.parse(event.target.result);
                    if (typeof importedData !== 'object' || importedData === null) {
                        throw new Error("Invalid format");
                    }

                    if (!confirm("Are you sure you want to overwrite all your current settings with this backup?")) {
                        el.importFile.value = ''; // Reset input
                        return;
                    }

                    storage.set(importedData, () => {
                        // Send global refresh ping
                        chrome.tabs.query({ url: ["*://open.spotify.com/*", "*://music.youtube.com/*"] }, (tabs) => {
                            tabs.forEach(tab => {
                                if (tab.id) {
                                    chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATE', payload: importedData });
                                }
                            });
                        });
                        
                        alert("Import successful! Please reopen the extension preferences.");
                        window.close(); // Refresh UI by closing the popup
                    });

                } catch (err) {
                    alert("Failed to parse backup file. Make sure it is a valid Flying Lyrics JSON backup.");
                }
            };
            reader.readAsText(file);
        });
    }

    // =========================================================
    //  MUSIC PLAYER SHORTCUTS
    // =========================================================
    function switchToOrOpenTab(urlPatterns, defaultUrl) {
        if (typeof chrome === 'undefined' || !chrome.tabs) {
            window.open(defaultUrl, '_blank');
            return;
        }

        chrome.tabs.query({}, (tabs) => {
            if (!tabs) {
                chrome.tabs.create({ url: defaultUrl });
                return;
            }

            // Find tabs matching any of our urlPatterns
            const matchedTabs = tabs.filter(tab => {
                if (!tab.url) return false;
                const urlLower = tab.url.toLowerCase();
                return urlPatterns.some(pattern => urlLower.includes(pattern.toLowerCase()));
            });

            if (matchedTabs.length > 0) {
                // Priority: 1) Audible tab, 2) Active tab, 3) First matched tab
                const targetTab = matchedTabs.find(tab => tab.audible) ||
                                  matchedTabs.find(tab => tab.active) ||
                                  matchedTabs[0];

                // Activate the tab
                chrome.tabs.update(targetTab.id, { active: true }, () => {
                    // Focus the window containing the tab
                    if (targetTab.windowId) {
                        chrome.windows.update(targetTab.windowId, { focused: true });
                    }
                });
            } else {
                // No open tab, create a new one
                chrome.tabs.create({ url: defaultUrl });
            }
        });
    }

    if (el.btnLaunchSpotify) {
        el.btnLaunchSpotify.addEventListener('click', () => {
            switchToOrOpenTab(['open.spotify.com'], 'https://open.spotify.com/');
        });
    }

    if (el.btnLaunchYtm) {
        el.btnLaunchYtm.addEventListener('click', () => {
            switchToOrOpenTab(['music.youtube.com'], 'https://music.youtube.com/');
        });
    }
});
