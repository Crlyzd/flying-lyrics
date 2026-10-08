// =========================================================
//  popup-lyrics.js - Lyrics Tab Coordinator
//  Throttled tab notification, sync offset adjustment,
//  local LRC file upload, edit/add lyrics, and runtime
//  message listener for live player and lyric state updates.
//
//  Depends on: popup-state.js, popup-lyrics-search.js
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
    const popup   = window.FLYING_LYRICS.popup;
    const el      = popup.el;
    const state   = popup.state;
    const storage = window.FLYING_LYRICS.storage;

    // =========================================================
    //  THROTTLED NOTIFY HELPER
    // =========================================================
    let pendingChanges  = null;
    let throttleTimer   = null;
    let lastNotifyTime  = 0;

    function notifyTab(changes) {
        if (!pendingChanges) pendingChanges = {};
        Object.assign(pendingChanges, changes);

        const now = performance.now();
        const execute = () => {
            const changesToSend = pendingChanges;
            pendingChanges    = null;
            throttleTimer     = null;
            lastNotifyTime    = performance.now();

            chrome.tabs.query({ url: ['*://open.spotify.com/*', '*://music.youtube.com/*'] }, (tabs) => {
                (tabs || []).forEach(tab => {
                    if (tab.id) chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATE', payload: changesToSend }, () => { void chrome.runtime.lastError; });
                });
            });
        };

        const remaining = 50 - (now - lastNotifyTime);
        if (remaining <= 0) {
            if (throttleTimer) { clearTimeout(throttleTimer); throttleTimer = null; }
            execute();
        } else if (!throttleTimer) {
            throttleTimer = setTimeout(execute, remaining);
        }
    }

    function saveAndNotify(changes) {
        storage.set(changes, () => {
            notifyTab(changes);
        });
    }

    /** Refreshes state.currentActiveTrack from open music tabs, then calls back. */
    function refreshActiveTrack(callback) {
        chrome.tabs.query({ url: ['*://open.spotify.com/*', '*://music.youtube.com/*'] }, (tabs) => {
            let trackFound   = false;
            let checkedCount = 0;
            const targetTabs = tabs || [];

            if (targetTabs.length === 0) {
                if (typeof callback === 'function') callback(null);
                return;
            }

            targetTabs.forEach(tab => {
                if (!tab.id) {
                    checkedCount++;
                    if (checkedCount === targetTabs.length && !trackFound && typeof callback === 'function') {
                        callback(null);
                    }
                    return;
                }

                chrome.tabs.sendMessage(tab.id, { type: 'GET_CURRENT_TRACK' }, (response) => {
                    checkedCount++;
                    void chrome.runtime.lastError;

                    if (response && response.artist && response.title && !trackFound) {
                        state.currentActiveTrack = response;
                        trackFound = true;
                        if (typeof callback === 'function') callback(response);
                    } else if (checkedCount === targetTabs.length && !trackFound && typeof callback === 'function') {
                        callback(null);
                    }
                });
            });
        });
    }

    // Expose core tab messaging helpers
    popup.notifyTab          = notifyTab;
    popup.saveAndNotify      = saveAndNotify;
    popup.refreshActiveTrack = refreshActiveTrack;

    // =========================================================
    //  OFFSET DISPLAY HELPER & STEPPERS
    // =========================================================
    function updateOffsetDisplay(val) {
        state.currentEffectiveOffset = val;
        if (el.offsetDisplay) {
            el.offsetDisplay.textContent = (val > 0 ? '+' : '') + val;
        }
    }
    popup.updateOffsetDisplay = updateOffsetDisplay;

    function adjustOffset(delta) {
        const newOffset = state.currentEffectiveOffset + delta;
        updateOffsetDisplay(newOffset);
        const trackKey = state.currentActiveTrack?.artist && state.currentActiveTrack?.title
            ? `${state.currentActiveTrack.artist} - ${state.currentActiveTrack.title}`
            : null;
        saveAndNotify({ trackKey: trackKey, syncOffset: newOffset });
    }

    function setupHoldButton(btnElement, delta) {
        if (!btnElement) return;
        let intervalId = null;
        let timeoutId  = null;

        const start = (e) => {
            if (e && e.type === 'touchstart') e.preventDefault();
            adjustOffset(delta);
            timeoutId = setTimeout(() => {
                intervalId = setInterval(() => { adjustOffset(delta); }, 50);
            }, 400);
        };

        const stop = () => {
            clearTimeout(timeoutId);
            clearInterval(intervalId);
        };

        btnElement.addEventListener('mousedown', start);
        btnElement.addEventListener('touchstart', start, { passive: false });
        ['mouseup', 'mouseleave', 'touchend'].forEach(evt => btnElement.addEventListener(evt, stop));
    }

    setupHoldButton(el.offsetMinus, -100);
    setupHoldButton(el.offsetPlus,   100);

    if (el.globalOffsetSetBtn) {
        el.globalOffsetSetBtn.addEventListener('click', () => {
            const val = parseInt(el.globalOffsetInput.value, 10);
            if (!isNaN(val)) {
                state.currentGlobalOffset = val;
                saveAndNotify({ globalSyncOffset: val });

                el.globalOffsetSetBtn.textContent = 'Saved!';
                el.globalOffsetSetBtn.classList.add('saved');
                setTimeout(() => {
                    el.globalOffsetSetBtn.textContent = 'Set Global';
                    el.globalOffsetSetBtn.classList.remove('saved');
                }, 1000);
            }
        });
    }

    if (el.globalOffsetInput) {
        el.globalOffsetInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                el.globalOffsetSetBtn.click();
            }
        });
    }

    // =========================================================
    //  LOCAL FILE UPLOAD & EDIT MODAL
    // =========================================================
    if (el.localUpload) {
        el.localUpload.addEventListener('click', (e) => {
            if (!state.currentActiveTrack || !state.currentActiveTrack.artist || !state.currentActiveTrack.title) {
                e.preventDefault();
                alert('No active track found.');
            }
        });

        el.localUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (ev) => {
                const rawText = ev.target.result;
                const trackKey = state.currentActiveTrack?.artist && state.currentActiveTrack?.title
                    ? `${state.currentActiveTrack.artist} - ${state.currentActiveTrack.title}`
                    : null;
                saveAndNotify({ trackKey: trackKey, lyricOverride: { type: 'local', data: rawText } });
                if (typeof popup.renderSearchResults === 'function') {
                    popup.renderSearchResults(state.currentResults, { type: 'local' });
                }
            };
            reader.readAsText(file);
        });
    }

    if (el.editLyricBtn) {
        el.editLyricBtn.addEventListener('click', () => {
            if (!state.currentActiveTrack || !state.currentActiveTrack.artist || !state.currentActiveTrack.title) {
                alert('No active track found.');
                return;
            }

            const editorUrl = chrome.runtime.getURL('src/pages/editor.html');
            chrome.tabs.query({ url: editorUrl }, (tabs) => {
                if (tabs && tabs.length > 0) {
                    const tab = tabs[0];
                    chrome.windows.update(tab.windowId, { focused: true });
                    chrome.tabs.sendMessage(tab.id, { type: 'GET_EDITOR_STATUS' }, (response) => {
                        if (chrome.runtime.lastError || !(response && response.artist === state.currentActiveTrack.artist && response.title === state.currentActiveTrack.title)) {
                            chrome.tabs.reload(tab.id);
                        }
                    });
                } else {
                    chrome.windows.create({
                        url: editorUrl,
                        type: 'popup',
                        width: 550,
                        height: 650,
                        focused: true
                    });
                }
            });
        });
    }

    // =========================================================
    //  INIT CURRENT STATE FROM CONTENT SCRIPT
    // =========================================================
    chrome.tabs.query({ url: ['*://open.spotify.com/*', '*://music.youtube.com/*'] }, (tabs) => {
        let trackFound = false;
        (tabs || []).forEach(tab => {
            if (!tab.id) return;

            chrome.tabs.sendMessage(tab.id, { type: 'GET_SYNC_OFFSET' }, (res) => {
                void chrome.runtime.lastError;
                if (res && res.syncOffset !== undefined && !trackFound) {
                    updateOffsetDisplay(res.syncOffset);
                }
            });

            chrome.tabs.sendMessage(tab.id, { type: 'GET_ACTIVE_LYRIC' }, (res) => {
                void chrome.runtime.lastError;
                if (res && res.source) state.activeSource = res.source;
            });

            chrome.tabs.sendMessage(tab.id, { type: 'GET_CURRENT_TRACK' }, (res) => {
                void chrome.runtime.lastError;
                if (trackFound || !res || !res.artist || !res.title) return;

                trackFound = true;
                state.currentActiveTrack = res;
                const trackKey = `${res.artist} - ${res.title}`;
                const cleanQuery = `${res.primaryArtist || res.artist} - ${res.cleanTitle || res.title}`;

                storage.get({ lastSearch: null, lyricsOverrides: {} }, (items) => {
                    const override = (items.lyricsOverrides || {})[trackKey] || null;

                    if (el.searchInput) {
                        el.searchInput.value = (items.lastSearch && items.lastSearch.key === trackKey)
                            ? (items.lastSearch.query || cleanQuery)
                            : cleanQuery;
                    }

                    if (typeof popup.renderSearchResults === 'function') {
                        if (items.lastSearch && items.lastSearch.key === trackKey && items.lastSearch.results?.length) {
                            state.currentResults = items.lastSearch.results;
                            popup.renderSearchResults(state.currentResults, override);
                        } else if (override && override.type === 'local') {
                            popup.renderSearchResults([], override);
                        } else if (state.activeSource) {
                            popup.renderSearchResults([], null);
                        }
                    }
                });
            });
        });
    });

    // =========================================================
    //  RUNTIME MESSAGE LISTENER
    // =========================================================
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.type === 'SETTINGS_UPDATE') {
            if (msg.payload.syncOffset !== undefined) updateOffsetDisplay(msg.payload.syncOffset);
            if (msg.payload.globalSyncOffset !== undefined) {
                state.currentGlobalOffset = msg.payload.globalSyncOffset;
                if (el.globalOffsetInput) el.globalOffsetInput.value = state.currentGlobalOffset;
            }
        } else if (msg.type === 'FONT_LOADED_IN_PIP') {
            if (typeof popup.onFontFinishedLoading === 'function') {
                popup.onFontFinishedLoading(msg.payload.fontName, msg.payload.success !== false);
            }
        } else if (msg.type === 'ACTIVE_TRACK_CHANGED') {
            state.currentActiveTrack = msg.payload || { artist: '', title: '' };
            if (el.searchInput) {
                el.searchInput.value = msg.payload
                    ? `${msg.payload.primaryArtist || msg.payload.artist} - ${msg.payload.cleanTitle || msg.payload.title}`
                    : '';
            }
        } else if (msg.type === 'ACTIVE_LYRIC_CHANGED') {
            state.activeSource = msg.payload;
            if (!el.resultsContainer) return;

            el.resultsContainer.querySelectorAll('.result-item:not(#deep-search-indicator) .sync-spinner').forEach(s => s.remove());
            el.resultsContainer.querySelectorAll('.active-dot').forEach(d => d.remove());
            el.resultsContainer.querySelectorAll('.result-item').forEach(d => d.classList.remove('active-lyric'));

            if (state.activeSource) {
                const activeItem = state.activeSource.type === 'local'
                    ? el.resultsContainer.querySelector('#local-file-card')
                    : (el.resultsContainer.querySelector(`[data-id="${state.activeSource.id}"][data-source="${state.activeSource.type}"]`)
                       || (!state.activeSource.id ? el.resultsContainer.querySelector('#auto-match-card') : null));

                if (activeItem) {
                    activeItem.classList.add('active-lyric');
                    const dot = document.createElement('div');
                    dot.className = state.activeSource.isEmpty ? 'active-dot active-dot--empty' : 'active-dot';
                    activeItem.querySelector('.dot-container')?.appendChild(dot);
                }
            }
        } else if (msg.type === 'LYRIC_FETCH_FAILED') {
            const { override } = msg.payload;
            if (override && override.type !== 'local' && el.resultsContainer) {
                const failedItem = el.resultsContainer.querySelector(`[data-id="${override.id}"][data-source="${override.type}"]`);
                if (failedItem) {
                    failedItem.querySelectorAll('.sync-spinner, .active-dot, .failed-dot').forEach(s => s.remove());
                    const dotContainer = failedItem.querySelector('.dot-container');
                    if (dotContainer) {
                        const failedDot = document.createElement('div');
                        failedDot.className = 'failed-dot';
                        failedDot.textContent = '✕';
                        dotContainer.appendChild(failedDot);
                    }
                }
            }
        }

        if (['SETTINGS_UPDATE', 'FONT_LOADED_IN_PIP', 'ACTIVE_TRACK_CHANGED', 'ACTIVE_LYRIC_CHANGED', 'LYRIC_FETCH_FAILED'].includes(msg.type)) {
            if (typeof sendResponse === 'function') sendResponse({ success: true });
        }
    });
});
