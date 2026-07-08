// =========================================================
//  popup-lyrics.js
//  Lyrics search, result rendering, sync offset controls,
//  local file upload, edit/add lyrics, and the runtime
//  message listener for live track/lyric state updates.
//
//  Depends on: popup-state.js, popup-ui.js (for saveAndNotify,
//  notifyTab, refreshActiveTrack, updateOffsetDisplay helpers
//  which are declared here and exposed on the popup namespace).
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
    const popup   = window.FLYING_LYRICS.popup;
    const el      = popup.el;
    const state   = popup.state;
    const storage = window.FLYING_LYRICS.storage;

    // =========================================================
    //  THROTTLED NOTIFY HELPER
    //  Batches rapid setting changes into a single tab message,
    //  sent at most once per 50 ms.
    // =========================================================
    let pendingChanges  = null;
    let throttleTimer   = null;
    let lastNotifyTime  = 0;

    function notifyTab(changes) {
        if (!pendingChanges) {
            pendingChanges = {};
        }
        Object.assign(pendingChanges, changes);

        const now = performance.now();
        const execute = () => {
            const changesToSend = pendingChanges;
            pendingChanges    = null;
            throttleTimer     = null;
            lastNotifyTime    = performance.now();

            chrome.tabs.query({ url: ['*://open.spotify.com/*', '*://music.youtube.com/*'] }, (tabs) => {
                tabs.forEach(tab => {
                    if (tab.id) {
                        chrome.tabs.sendMessage(tab.id, {
                            type: 'SETTINGS_UPDATE',
                            payload: changesToSend
                        }, () => {
                            if (chrome.runtime.lastError) return;
                        });
                    }
                });
            });
        };

        const remaining = 50 - (now - lastNotifyTime);
        if (remaining <= 0) {
            if (throttleTimer) {
                clearTimeout(throttleTimer);
                throttleTimer = null;
            }
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
                    if (checkedCount === targetTabs.length && !trackFound) {
                        if (typeof callback === 'function') callback(null);
                    }
                    return;
                }

                chrome.tabs.sendMessage(tab.id, { type: 'GET_CURRENT_TRACK' }, (response) => {
                    checkedCount++;
                    if (chrome.runtime.lastError) {
                        if (checkedCount === targetTabs.length && !trackFound) {
                            if (typeof callback === 'function') callback(null);
                        }
                        return;
                    }

                    if (response && response.artist && response.title && !trackFound) {
                        state.currentActiveTrack = response;
                        trackFound = true;
                        if (typeof callback === 'function') callback(response);
                    } else if (checkedCount === targetTabs.length && !trackFound) {
                        if (typeof callback === 'function') callback(null);
                    }
                });
            });
        });
    }

    // =========================================================
    //  OFFSET DISPLAY HELPER
    // =========================================================
    function updateOffsetDisplay(val) {
        state.currentEffectiveOffset = val;
        el.offsetDisplay.textContent = (val > 0 ? '+' : '') + val;
    }

    // =========================================================
    //  SEARCH RESULTS RENDERER
    // =========================================================
    function renderSearchResults(results, activeOverride) {
        el.resultsContainer.innerHTML = '';

        // LOCAL FILE CARD — shown when user has loaded a custom .lrc
        if (activeOverride && activeOverride.type === 'local') {
            const localItem = document.createElement('div');
            localItem.id = 'local-file-card';
            localItem.className = 'result-item active-lyric';
            localItem.innerHTML = `
                <div class="result-left">
                    <div class="result-title lyrics-action-title">
                        <span class="icon-mask icon-folder icon-size-14"></span>
                        Local File Loaded
                    </div>
                    <div class="result-artist">Custom .lrc file</div>
                </div>
                <div class="result-right">
                    <div class="dot-container"><div class="active-dot"></div></div>
                    <div class="result-badges"><span class="result-badge">CUSTOM</span></div>
                </div>
            `;
            el.resultsContainer.appendChild(localItem);
        }

        // AUTO-MATCH CARD — always present as the "reset to best match" option
        const autoItem = document.createElement('div');
        autoItem.id = 'auto-match-card';
        autoItem.className = 'result-item';
        autoItem.innerHTML = `
            <div class="result-left">
                <div class="result-title">↳ Auto (Best Match)</div>
                <div class="result-artist">Reset to original search</div>
            </div>
            <div class="result-right">
                <div class="dot-container"></div>
            </div>
        `;
        el.resultsContainer.appendChild(autoItem);

        // ACTIVE SOURCE CARD — shown when no explicit results yet and a lyric is already playing
        if (results.length === 0 && state.activeSource && !(activeOverride && activeOverride.type === 'local')) {
            const sourceLabel = state.activeSource.type === 'netease' ? 'NETEASE' : 'LRCLIB';
            const badgeClass  = state.activeSource.type === 'netease' ? 'badge-netease' : 'badge-lrclib';
            let syncBadge = '';
            if (state.activeSource.type !== 'local') {
                if (state.activeSource.isEmpty) {
                    syncBadge = `<span class="result-badge badge-empty">EMPTY</span>`;
                } else if (state.activeSource.synced) {
                    syncBadge = `<span class="result-badge">SYNCED</span>`;
                } else {
                    syncBadge = `<span class="result-badge badge-unsynced">UNSYNCED</span>`;
                }
            }
            const autoCard = document.createElement('div');
            autoCard.className = 'result-item active-lyric';
            autoCard.innerHTML = `
                <div class="result-left">
                    <div class="result-title">${state.activeSource.name || 'Unknown'}</div>
                    <div class="result-artist">Auto-loaded · Click Search for more versions</div>
                </div>
                <div class="result-right">
                    <div class="dot-container"><div class="active-dot${state.activeSource.isEmpty ? ' active-dot--empty' : ''}"></div></div>
                    <div class="result-badges">
                        <span class="result-badge ${badgeClass}">${sourceLabel}</span>
                        ${syncBadge}
                    </div>
                </div>
            `;
            el.resultsContainer.appendChild(autoCard);
            return;
        }

        // RESULT ITEM CARDS — one per search result
        let foundActiveInList = false;

        results.forEach(item => {
            const duration = item.duration
                ? `${Math.floor(item.duration / 60).toString().padStart(2, '0')}:${Math.floor(item.duration % 60).toString().padStart(2, '0')}`
                : '?:??';

            const div = document.createElement('div');
            div.className = 'result-item';

            // Store data for event delegation on the container
            div.dataset.source = item.source;
            div.dataset.id     = item.id;
            div.dataset.name   = item.name;

            const isActiveOverride = activeOverride && activeOverride.type !== 'local'
                && String(activeOverride.id) === String(item.id) && activeOverride.type === item.source;
            const isActiveLive = !activeOverride && state.activeSource
                && String(state.activeSource.id) === String(item.id) && state.activeSource.type === item.source;

            div.innerHTML = `
                <div class="result-left">
                    <div class="result-title">${item.name}</div>
                    <div class="result-artist">${item.artistName} • ${item.albumName || 'Unknown Album'}</div>
                </div>
                <div class="result-right">
                    <div class="dot-container"></div>
                    <div class="result-badges">${item.badgeHtml}</div>
                    <div class="result-duration">${duration}</div>
                </div>
            `;

            if (isActiveOverride || isActiveLive) {
                const isItemEmpty = item.isEmpty || (state.activeSource && String(state.activeSource.id) === String(item.id) && state.activeSource.type === item.source && state.activeSource.isEmpty);
                div.classList.add('active-lyric');
                const dot = document.createElement('div');
                dot.className = isItemEmpty ? 'active-dot active-dot--empty' : 'active-dot';
                div.querySelector('.dot-container').appendChild(dot);
                foundActiveInList = true;
            }
            el.resultsContainer.appendChild(div);
        });

        // If the user hasn't explicitly chosen a lyric (no override) and the auto-loaded lyric
        // wasn't found in this search result list, highlight the Auto fallback card so the user
        // still sees what is actively playing.
        if (!activeOverride && results.length > 0 && !foundActiveInList) {
            autoItem.classList.add('active-lyric');
            const dot = document.createElement('div');
            dot.className = 'active-dot';
            const dotContainer = autoItem.querySelector('.dot-container');
            if (dotContainer) dotContainer.appendChild(dot);
        }
    }

    // Expose renderer so popup-ui.js (ACTIVE_LYRIC_CHANGED handler below)
    // and other modules can re-render without duplication.
    popup.renderSearchResults = renderSearchResults;

    // =========================================================
    //  RESULT CONTAINER — EVENT DELEGATION
    //  One click listener on the container handles all result clicks
    //  without per-item listener memory overhead.
    // =========================================================
    el.resultsContainer.addEventListener('click', (e) => {
        const item = e.target.closest('.result-item');
        // Ignore clicks that aren't on result items or are on the read-only local card
        if (!item || item.id === 'local-file-card' || item.id === 'deep-search-indicator') return;

        refreshActiveTrack((track) => {
            if (!track) {
                alert('No active track found.');
                return;
            }

            if (item.id === 'auto-match-card') {
                saveAndNotify({ lyricOverride: null });
                const spinner = document.createElement('div');
                spinner.className = 'sync-spinner';
                const dotContainer = item.querySelector('.dot-container');
                if (dotContainer) {
                    const existingDot = dotContainer.querySelector('.active-dot');
                    if (existingDot) existingDot.remove();
                    dotContainer.appendChild(spinner);
                }
                return;
            }

            // Standard result — save the chosen source/id override
            const source = item.dataset.source;
            const id     = item.dataset.id;

            if (source && id) {
                saveAndNotify({ lyricOverride: { type: source, id: id } });
                const spinner = document.createElement('div');
                spinner.className = 'sync-spinner';
                const dotContainer = item.querySelector('.dot-container');
                if (dotContainer) {
                    const existingDot = dotContainer.querySelector('.active-dot');
                    if (existingDot) existingDot.remove();
                    dotContainer.appendChild(spinner);
                }
            }
        });
    });

    // =========================================================
    //  SEARCH HANDLER
    // =========================================================
    el.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') el.searchBtn.click();
    });

    el.searchBtn.addEventListener('click', async () => {
        const query = el.searchInput.value.trim();
        if (!query) return;

        state.activeSearchQuery = query;
        el.searchBtn.textContent = '...';
        el.searchBtn.setAttribute('aria-busy', 'true');
        el.searchBtn.setAttribute('aria-label', 'Searching…');
        el.resultsContainer.innerHTML = '<div class="status-msg">Searching...</div>';

        // Fetch latest active track metadata from open music tabs first
        try {
            const tabs = await new Promise(resolve => {
                chrome.tabs.query({ url: ['*://open.spotify.com/*', '*://music.youtube.com/*'] }, resolve);
            });
            if (tabs && tabs.length > 0) {
                for (const tab of tabs) {
                    if (!tab.id) continue;
                    try {
                        const response = await new Promise((resolveMsg) => {
                            chrome.tabs.sendMessage(tab.id, { type: 'GET_CURRENT_TRACK' }, (res) => {
                                if (chrome.runtime.lastError) {
                                    resolveMsg(null);
                                } else {
                                    resolveMsg(res);
                                }
                            });
                        });
                        if (response && response.artist && response.title) {
                            state.currentActiveTrack = response;
                            break;
                        }
                    } catch (err) {
                        // Ignore and try next tab
                    }
                }
            }
        } catch (err) {
            // Ignore tab query errors
        }

        try {
            // Build scoring hints from the active track's clean metadata
            const cleanArtist  = state.currentActiveTrack?.primaryArtist || state.currentActiveTrack?.artist || '';
            const cleanTitleStr = state.currentActiveTrack?.cleanTitle   || state.currentActiveTrack?.title   || '';
            const duration      = state.currentActiveTrack?.duration || 0;

            const response = await new Promise(resolve =>
                chrome.runtime.sendMessage({
                    type: 'UNIFIED_SEARCH',
                    payload: { query, duration, cleanArtist, cleanTitle: cleanTitleStr, timeoutMs: 5000 }
                }, resolve)
            );

            if (state.activeSearchQuery !== query) return;

            const buildBadgeHtml = (item) => {
                const isItemEmpty = item.isEmpty || (state.activeSource && state.activeSource.type === item.source && String(state.activeSource.id) === String(item.id) && state.activeSource.isEmpty);
                const sourceBadge = item.source === 'api'
                    ? `<span class="result-badge badge-lrclib">LRCLIB</span>`
                    : `<span class="result-badge badge-netease">NETEASE</span>`;
                let statusBadge = '';
                if (isItemEmpty) {
                    statusBadge = `<span class="result-badge badge-empty">EMPTY</span>`;
                } else if (item.source === 'api') {
                    statusBadge = item.synced
                        ? `<span class="result-badge">SYNCED</span>`
                        : `<span class="result-badge badge-unsynced">UNSYNCED</span>`;
                }
                return sourceBadge + statusBadge;
            };

            const results = (response?.results || []).map(item => ({
                ...item,
                badgeHtml: buildBadgeHtml(item)
            }));

            const hasTimeout = !!response?.hasTimeout;

            if (results.length === 0 && !hasTimeout) {
                el.resultsContainer.innerHTML = '<div class="status-msg">No results found.</div>';
                return;
            }

            state.currentResults = results;
            const trackKey = `${state.currentActiveTrack.artist} - ${state.currentActiveTrack.title}`;
            if (results.length > 0) {
                storage.set({ lastSearch: { key: trackKey, query: query, results: results } });
            }

            storage.get({ lyricsOverrides: {} }, (items) => {
                if (state.activeSearchQuery !== query) return;

                const override = (items.lyricsOverrides || {})[trackKey] || null;
                renderSearchResults(results, override);

                if (hasTimeout) {
                    // Show spinning deep-search indicator at the top of results
                    const deepSearchCard = document.createElement('div');
                    deepSearchCard.id = 'deep-search-indicator';
                    deepSearchCard.className = 'result-item';
                    deepSearchCard.innerHTML = `
                        <div class="deep-search-label-row">
                            <div class="sync-spinner"></div>
                            Deep search running...
                        </div>
                    `;
                    el.resultsContainer.insertBefore(deepSearchCard, el.resultsContainer.firstChild);
                    el.resultsContainer.scrollTop = 0;

                    // Background search with 30 s timeout — merges with initial results
                    chrome.runtime.sendMessage({
                        type: 'UNIFIED_SEARCH',
                        payload: { query, duration, cleanArtist, cleanTitle: cleanTitleStr, timeoutMs: 30000 }
                    }, (secondResponse) => {
                        if (state.activeSearchQuery !== query) return;

                        const secondResults = (secondResponse?.results || []).map(item => ({
                            ...item,
                            badgeHtml: buildBadgeHtml(item)
                        }));

                        // Merge: second results first, then unique first results
                        const finalResults = [];
                        const seen = new Set();
                        secondResults.forEach(item => {
                            const key = `${item.source}-${item.id}`;
                            if (!seen.has(key)) { seen.add(key); finalResults.push(item); }
                        });
                        results.forEach(item => {
                            const key = `${item.source}-${item.id}`;
                            if (!seen.has(key)) { seen.add(key); finalResults.push(item); }
                        });

                        if (finalResults.length === 0) {
                            el.resultsContainer.innerHTML = '<div class="status-msg">No results found.</div>';
                            return;
                        }

                        state.currentResults = finalResults;
                        storage.set({ lastSearch: { key: trackKey, query: query, results: finalResults } });
                        renderSearchResults(finalResults, override);
                    });
                }
            });

        } catch (e) {
            el.resultsContainer.innerHTML = '<div class="status-msg--error">Search failed.</div>';
        } finally {
            el.searchBtn.textContent = 'Search';
            el.searchBtn.removeAttribute('aria-busy');
            el.searchBtn.removeAttribute('aria-label');
        }
    });

    // =========================================================
    //  LOCAL FILE UPLOAD
    // =========================================================
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
            saveAndNotify({ lyricOverride: { type: 'local', data: rawText } });
            renderSearchResults(state.currentResults, { type: 'local' });
        };
        reader.readAsText(file);
    });

    // =========================================================
    //  EDIT / ADD LYRICS BUTTON
    // =========================================================
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

                // Query editor tab status to check if it's editing the same track
                chrome.tabs.sendMessage(tab.id, { type: 'GET_EDITOR_STATUS' }, (response) => {
                    if (chrome.runtime.lastError) {
                        // Editor might be loading or unresponsive — trigger reload
                        chrome.tabs.reload(tab.id);
                        return;
                    }
                    if (response && response.artist === state.currentActiveTrack.artist
                               && response.title  === state.currentActiveTrack.title) {
                        // Same track — focusing the window is enough
                        return;
                    }
                    // Different track — reload to load new lyrics
                    chrome.tabs.reload(tab.id);
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

    // =========================================================
    //  SYNC OFFSET CONTROLS
    // =========================================================
    function adjustOffset(delta) {
        const newOffset = state.currentEffectiveOffset + delta;
        updateOffsetDisplay(newOffset);
        saveAndNotify({ syncOffset: newOffset });
    }

    /**
     * Makes a button trigger once on click and continuously while held.
     * First tick fires immediately; rapid ticks begin after 400 ms.
     */
    function setupHoldButton(btnElement, delta) {
        let intervalId = null;
        let timeoutId  = null;

        const start = (e) => {
            // Prevent default touch behaviors (scrolling, double-tap zoom)
            if (e && e.type === 'touchstart') e.preventDefault();

            adjustOffset(delta);  // one instant tick

            // Wait 400 ms to see if user is holding
            timeoutId = setTimeout(() => {
                intervalId = setInterval(() => {
                    adjustOffset(delta);
                }, 50); // fast continuous speed
            }, 400);
        };

        const stop = () => {
            clearTimeout(timeoutId);
            clearInterval(intervalId);
        };

        btnElement.addEventListener('mousedown', start);
        btnElement.addEventListener('touchstart', start, { passive: false });
        btnElement.addEventListener('mouseup',    stop);
        btnElement.addEventListener('mouseleave', stop);
        btnElement.addEventListener('touchend',   stop);
    }

    setupHoldButton(el.offsetMinus, -100);
    setupHoldButton(el.offsetPlus,   100);

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

    el.globalOffsetInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            el.globalOffsetSetBtn.click();
        }
    });

    // =========================================================
    //  REQUEST CURRENT STATE FROM CONTENT SCRIPT (on popup open)
    // =========================================================
    chrome.tabs.query({ url: ['*://open.spotify.com/*', '*://music.youtube.com/*'] }, (tabs) => {
        let trackFound = false;

        tabs.forEach(tab => {
            if (!tab.id) return;

            // Sync offset: just read what the content script is currently using
            chrome.tabs.sendMessage(tab.id, { type: 'GET_SYNC_OFFSET' }, (response) => {
                if (chrome.runtime.lastError) return;
                if (response && response.syncOffset !== undefined && !trackFound) {
                    updateOffsetDisplay(response.syncOffset);
                }
            });

            // Active lyric source (for highlighting the correct result card)
            chrome.tabs.sendMessage(tab.id, { type: 'GET_ACTIVE_LYRIC' }, (response) => {
                if (chrome.runtime.lastError) return;
                if (response && response.source) {
                    state.activeSource = response.source;
                }
            });

            // Current track — populate search box and restore last search
            chrome.tabs.sendMessage(tab.id, { type: 'GET_CURRENT_TRACK' }, (response) => {
                if (chrome.runtime.lastError) return;
                if (trackFound) return;

                if (response && response.artist && response.title) {
                    trackFound = true;
                    state.currentActiveTrack = response;
                    const trackKey = `${response.artist} - ${response.title}`;

                    const displayArtist = response.primaryArtist || response.artist;
                    const displayTitle  = response.cleanTitle    || response.title;
                    const cleanQuery    = `${displayArtist} - ${displayTitle}`;

                    storage.get({ lastSearch: null, lyricsOverrides: {} }, (items) => {
                        const override = (items.lyricsOverrides || {})[trackKey] || null;

                        if (items.lastSearch && items.lastSearch.key === trackKey && items.lastSearch.results?.length) {
                            // Restore the last explicit search query the user typed
                            el.searchInput.value  = items.lastSearch.query || cleanQuery;
                            state.currentResults  = items.lastSearch.results;
                            renderSearchResults(state.currentResults, override);
                        } else if (override && override.type === 'local') {
                            el.searchInput.value = cleanQuery;
                            renderSearchResults([], override);
                        } else {
                            el.searchInput.value = cleanQuery;
                            if (state.activeSource) renderSearchResults([], null);
                        }
                    });
                }
            });
        });
    });

    // =========================================================
    //  RUNTIME MESSAGE LISTENER
    //  Handles live pushes from the content script so the popup
    //  stays in sync while it is open.
    // =========================================================
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.type === 'SETTINGS_UPDATE') {
            if (msg.payload.syncOffset !== undefined) {
                updateOffsetDisplay(msg.payload.syncOffset);
            }
            if (msg.payload.globalSyncOffset !== undefined) {
                state.currentGlobalOffset = msg.payload.globalSyncOffset;
                el.globalOffsetInput.value = state.currentGlobalOffset;
            }
        } else if (msg.type === 'FONT_LOADED_IN_PIP') {
            const { fontName, success } = msg.payload;
            // Delegated to popup-visuals.js via the exposed namespace function
            if (typeof popup.onFontFinishedLoading === 'function') {
                popup.onFontFinishedLoading(fontName, success !== false);
            }
        } else if (msg.type === 'ACTIVE_TRACK_CHANGED') {
            state.currentActiveTrack = msg.payload || { artist: '', title: '' };
            if (msg.payload) {
                const displayArtist = msg.payload.primaryArtist || msg.payload.artist;
                const displayTitle  = msg.payload.cleanTitle    || msg.payload.title;
                el.searchInput.value = `${displayArtist} - ${displayTitle}`;
            } else {
                el.searchInput.value = '';
            }
        } else if (msg.type === 'ACTIVE_LYRIC_CHANGED') {
            state.activeSource = msg.payload;
            el.resultsContainer.querySelectorAll('.sync-spinner').forEach(s => s.remove());
            el.resultsContainer.querySelectorAll('.active-dot').forEach(d => d.remove());
            el.resultsContainer.querySelectorAll('.result-item').forEach(d => d.classList.remove('active-lyric'));

            if (state.activeSource) {
                let activeItem = null;
                if (state.activeSource.type === 'local') {
                    activeItem = el.resultsContainer.querySelector('#local-file-card');
                } else {
                    activeItem = el.resultsContainer.querySelector(
                        `[data-id="${state.activeSource.id}"][data-source="${state.activeSource.type}"]`
                    );
                }

                if (activeItem) {
                    activeItem.classList.add('active-lyric');
                    const dot = document.createElement('div');
                    dot.className = state.activeSource.isEmpty ? 'active-dot active-dot--empty' : 'active-dot';
                    const dotContainer = activeItem.querySelector('.dot-container');
                    if (dotContainer) dotContainer.appendChild(dot);

                    // Dynamically update the provider badge to show EMPTY if the lyric is empty
                    if (state.activeSource.isEmpty) {
                        const badgesContainer = activeItem.querySelector('.result-badges');
                        if (badgesContainer) {
                            if (!badgesContainer.querySelector('.badge-empty')) {
                                badgesContainer.innerHTML = 
                                    (state.activeSource.type === 'netease' 
                                        ? `<span class="result-badge badge-netease">NETEASE</span>` 
                                        : `<span class="result-badge badge-lrclib">LRCLIB</span>`) +
                                    `<span class="result-badge badge-empty">EMPTY</span>`;
                            }
                        }
                    }
                } else if (!state.activeSource.id) {
                    // Fallback to auto match card if no specific ID matched
                    const autoItem = el.resultsContainer.querySelector('#auto-match-card');
                    if (autoItem) {
                        autoItem.classList.add('active-lyric');
                        const dot = document.createElement('div');
                        dot.className = 'active-dot';
                        const dotContainer = autoItem.querySelector('.dot-container');
                        if (dotContainer) dotContainer.appendChild(dot);
                    }
                }
            }
        }

        if (msg.type === 'SETTINGS_UPDATE' ||
            msg.type === 'FONT_LOADED_IN_PIP' ||
            msg.type === 'ACTIVE_TRACK_CHANGED' ||
            msg.type === 'ACTIVE_LYRIC_CHANGED') {
            if (typeof sendResponse === 'function') {
                sendResponse({ success: true });
            }
        }
    });

    // Expose helpers for cross-module use
    popup.notifyTab           = notifyTab;
    popup.saveAndNotify       = saveAndNotify;
    popup.refreshActiveTrack  = refreshActiveTrack;
    popup.updateOffsetDisplay = updateOffsetDisplay;
});
