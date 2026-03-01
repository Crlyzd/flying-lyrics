const LANGUAGES = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'it', name: 'Italian' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'zh-CN', name: 'Chinese (Simplified)' },
    { code: 'zh-TW', name: 'Chinese (Traditional)' },
    { code: 'ru', name: 'Russian' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'id', name: 'Indonesian' },
    { code: 'vi', name: 'Vietnamese' },
    { code: 'th', name: 'Thai' }
];

document.addEventListener('DOMContentLoaded', () => {
    const toggleTrans = document.getElementById('toggle-translation');
    const toggleAutolaunch = document.getElementById('toggle-autolaunch');
    const langSelect = document.getElementById('lang-select');
    const offsetMinus = document.getElementById('offset-minus');
    const offsetPlus = document.getElementById('offset-plus');
    const offsetDisplay = document.getElementById('offset-display');
    const searchBtn = document.getElementById('search-btn');
    const searchInput = document.getElementById('search-query');
    const resultsContainer = document.getElementById('search-results-container');
    const localUpload = document.getElementById('local-lyric-upload');
    const appVersion = document.getElementById('app-version');
    const globalOffsetInput = document.getElementById('global-offset-input');
    const globalOffsetSetBtn = document.getElementById('global-offset-set-btn');

    // Track the current results array so other handlers (e.g. local upload) can reference it
    let currentResults = [];
    let currentActiveTrack = { artist: "", title: "" };
    let currentEffectiveOffset = 1000;
    let currentGlobalOffset = 1000;
    // The live "receipt" from content.js: { type, id, name } or null
    let activeSource = null;

    // Populate Languages
    LANGUAGES.forEach(lang => {
        const option = document.createElement('option');
        option.value = lang.code;
        option.textContent = lang.name;
        langSelect.appendChild(option);
    });

    // Set Dynamic Version
    if (appVersion) {
        const manifest = chrome.runtime.getManifest();
        appVersion.textContent = `v${manifest.version}`;
    }

    // Load Saved Settings
    chrome.storage.local.get({
        showTranslation: true,
        translationLang: 'id',
        globalSyncOffset: 1000,
        autoLaunch: false
    }, (items) => {
        toggleTrans.checked = items.showTranslation;
        langSelect.value = items.translationLang;
        currentGlobalOffset = items.globalSyncOffset;
        globalOffsetInput.value = currentGlobalOffset;
        toggleAutolaunch.checked = items.autoLaunch;
    });

    // Listen for changes from Content Script (PiP)
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.showTranslation) {
            toggleTrans.checked = changes.showTranslation.newValue;
        }
    });

    // Request current effective offset, track info, and active lyric source
    chrome.tabs.query({ url: ["*://open.spotify.com/*", "*://music.youtube.com/*"] }, (tabs) => {
        let trackFound = false;

        tabs.forEach(tab => {
            if (!tab.id) return;

            chrome.tabs.sendMessage(tab.id, { type: 'GET_SYNC_OFFSET' }, (response) => {
                if (chrome.runtime.lastError) return;
                // Update offset display only if we haven't locked onto a track yet
                if (response && response.syncOffset !== undefined && !trackFound) {
                    updateOffsetDisplay(response.syncOffset);
                }
            });

            // Fetch the active lyric source receipt from content.js
            chrome.tabs.sendMessage(tab.id, { type: 'GET_ACTIVE_LYRIC' }, (response) => {
                if (chrome.runtime.lastError) return;
                if (response && response.source) {
                    activeSource = response.source;
                }
            });

            chrome.tabs.sendMessage(tab.id, { type: 'GET_CURRENT_TRACK' }, (response) => {
                if (chrome.runtime.lastError) return;
                if (trackFound) return;

                if (response && response.artist && response.title) {
                    trackFound = true; // Mark as found to ignore subsequent tabs
                    currentActiveTrack = response;
                    const trackKey = `${response.artist} - ${response.title}`;

                    // Restore cached search results if they match the current track
                    chrome.storage.local.get({ lastSearch: null, lyricsOverrides: {} }, (items) => {
                        const override = (items.lyricsOverrides || {})[trackKey] || null;

                        if (items.lastSearch && items.lastSearch.key === trackKey && items.lastSearch.results?.length) {
                            // Cached search matches current track — restore it
                            searchInput.value = items.lastSearch.query || trackKey;
                            currentResults = items.lastSearch.results;
                            renderSearchResults(currentResults, override);
                        } else if (override && override.type === 'local') {
                            // No cached search, but a local file override is active
                            searchInput.value = trackKey;
                            renderSearchResults([], override);
                        } else {
                            // Nothing to restore, just populate the search box
                            searchInput.value = trackKey;
                            // Inject a minimal "currently playing" card if we have a source
                            if (activeSource) renderSearchResults([], null);
                        }
                    });
                }
            });
        });
    });

    // =====================================================================
    // Shared renderer — builds the result list in the container.
    // `results`        : Array of { source, id, name, artistName, albumName, duration, synced, badgeHtml }
    // `activeOverride`  : The current lyricOverride object for the track (or null)
    // =====================================================================
    function renderSearchResults(results, activeOverride) {
        resultsContainer.innerHTML = '';

        // If a local file override is active, show its indicator at the top
        if (activeOverride && activeOverride.type === 'local') {
            const localItem = document.createElement('div');
            localItem.className = 'result-item active-lyric';
            localItem.style.position = 'relative';
            localItem.innerHTML = `
                <div class="active-dot"></div>
                <div class="result-title">📁 Local File Loaded <span class="result-badge">CUSTOM</span></div>
                <div class="result-meta"><span>Custom .lrc file</span></div>
            `;
            resultsContainer.appendChild(localItem);
        }

        // "Auto (Best Match)" reset option — show active dot if auto is playing and no override
        const autoItem = document.createElement('div');
        autoItem.className = 'result-item';
        autoItem.style.position = 'relative';
        autoItem.innerHTML = `
            <div class="result-title">↳ Auto (Best Match)</div>
            <div class="result-meta">Reset to original search</div>
        `;
        autoItem.onclick = () => {
            saveAndNotify({ lyricOverride: null });
            // Move active dot back to auto
            resultsContainer.querySelectorAll('.active-dot').forEach(d => d.remove());
            resultsContainer.querySelectorAll('.result-item').forEach(el => el.classList.remove('active-lyric'));
            const dot = document.createElement('div');
            dot.className = 'active-dot';
            autoItem.appendChild(dot);
            autoItem.classList.add('active-lyric');
        };
        resultsContainer.appendChild(autoItem);

        // If no search results yet but we have an active auto-loaded source, show it as a minimal card
        if (results.length === 0 && activeSource && !(activeOverride && activeOverride.type === 'local')) {
            const sourceLabel = activeSource.type === 'netease' ? 'NETEASE' : 'LRCLIB';
            const sourceBadgeColor = activeSource.type === 'netease' ? 'background:#e60026;color:white;' : 'background:#1DB954;color:black;';
            // Only show synced badge for non-Netease sources (Netease is always unsynced from our perspective)
            const syncBadge = activeSource.type !== 'local'
                ? (activeSource.synced
                    ? `<span class="result-badge">SYNCED</span>`
                    : `<span class="result-badge" style="background:#555;color:#FFF">UNSYNCED</span>`)
                : '';
            const autoCard = document.createElement('div');
            autoCard.className = 'result-item active-lyric';
            autoCard.style.position = 'relative';
            autoCard.innerHTML = `
                <div class="active-dot"></div>
                <div class="result-title">${activeSource.name || 'Unknown'} <span class="result-badge" style="${sourceBadgeColor}">${sourceLabel}</span>${syncBadge}</div>
                <div class="result-meta"><span>Auto-loaded · Click Search for more versions</span></div>
            `;
            resultsContainer.appendChild(autoCard);
            return;
        }

        // Individual result items
        results.forEach(item => {
            const duration = item.duration
                ? `${Math.floor(item.duration / 60).toString().padStart(2, '0')}:${(item.duration % 60).toString().padStart(2, '0')}`
                : "?:??";

            const div = document.createElement('div');
            div.className = 'result-item';
            div.style.position = 'relative';

            // Highlight if this item matches the stored override OR the live activeSource
            const isActiveOverride = activeOverride && activeOverride.type !== 'local'
                && activeOverride.id === item.id && activeOverride.type === item.source;
            const isActiveLive = !activeOverride && activeSource
                && activeSource.id === item.id && activeSource.type === item.source;

            if (isActiveOverride || isActiveLive) {
                div.classList.add('active-lyric');
                autoItem.classList.remove('active-lyric');
                const dot = document.createElement('div');
                dot.className = 'active-dot';
                div.appendChild(dot);
            }

            div.innerHTML += `
                <div class="result-title">${item.name} ${item.badgeHtml}</div>
                <div class="result-meta">
                    <span>${item.artistName} • ${item.albumName || 'Unknown Album'}</span>
                    <span>${duration}</span>
                </div>
            `;
            div.onclick = () => {
                saveAndNotify({ lyricOverride: { type: item.source, id: item.id } });
                // Optimistically move dot to the clicked item
                activeSource = { type: item.source, id: item.id, name: item.name };
                resultsContainer.querySelectorAll('.active-dot').forEach(d => d.remove());
                resultsContainer.querySelectorAll('.result-item').forEach(el => el.classList.remove('active-lyric'));
                const dot = document.createElement('div');
                dot.className = 'active-dot';
                div.appendChild(dot);
                div.classList.add('active-lyric');
            };
            resultsContainer.appendChild(div);
        });

        // If no override is set at all, put the dot on Auto (Best Match)
        if (!activeOverride && results.length > 0 && !activeSource) {
            autoItem.classList.add('active-lyric');
        }
    }

    // --- SEARCH HANDLER ---
    // Allow Enter key to trigger search
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') searchBtn.click();
    });

    searchBtn.addEventListener('click', async () => {
        const query = searchInput.value.trim();
        if (!query) return;

        searchBtn.textContent = '...';
        resultsContainer.innerHTML = '<div style="padding: 10px; text-align: center; font-size: 12px; color: #888;">Searching...</div>';

        try {
            const [lrcRes, neteaseRes] = await Promise.allSettled([
                fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`).then(r => r.json()),
                new Promise(resolve => chrome.runtime.sendMessage({ type: 'SEARCH_NETEASE', payload: { query } }, resolve))
            ]);

            let results = [];

            if (lrcRes.status === 'fulfilled' && Array.isArray(lrcRes.value)) {
                results = results.concat(lrcRes.value.slice(0, 10).map(item => ({
                    source: 'api',
                    id: item.id,
                    name: item.trackName,
                    artistName: item.artistName,
                    albumName: item.albumName,
                    duration: item.duration,
                    synced: !!item.syncedLyrics,
                    badgeHtml: `<span class="result-badge" style="background:#1DB954; color:black;">LRCLIB</span>` +
                        (item.syncedLyrics ? `<span class="result-badge">SYNCED</span>` : `<span class="result-badge" style="background:#555;color:#FFF">UNSYNCED</span>`)
                })));
            }

            if (neteaseRes.status === 'fulfilled' && neteaseRes.value?.results) {
                results = results.concat(neteaseRes.value.results.map(item => ({
                    source: 'netease',
                    id: item.id,
                    name: item.trackName,
                    artistName: item.artistName,
                    albumName: item.albumName,
                    duration: item.duration,
                    synced: false,
                    badgeHtml: `<span class="result-badge" style="background:#e60026; color:white;">NETEASE</span>`
                })));
            }

            if (results.length === 0) {
                resultsContainer.innerHTML = '<div style="padding: 10px; text-align: center; font-size: 12px; color: #888;">No results found.</div>';
                return;
            }

            // Persist the search results for this track
            currentResults = results;
            const trackKey = `${currentActiveTrack.artist} - ${currentActiveTrack.title}`;
            chrome.storage.local.set({
                lastSearch: {
                    key: trackKey,
                    query: query,
                    results: results
                }
            });

            // Determine current override to highlight the active item
            chrome.storage.local.get({ lyricsOverrides: {} }, (items) => {
                const override = (items.lyricsOverrides || {})[trackKey] || null;
                renderSearchResults(results, override);
            });

        } catch (e) {
            resultsContainer.innerHTML = '<div style="padding: 10px; text-align: center; font-size: 12px; color: #ff5555;">Search failed.</div>';
        } finally {
            searchBtn.textContent = 'Search';
        }
    });

    // --- LOCAL FILE UPLOAD ---
    localUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            const rawText = ev.target.result;
            saveAndNotify({ lyricOverride: { type: 'local', data: rawText } });

            // Re-render with the local override active
            renderSearchResults(currentResults, { type: 'local' });
        };
        reader.readAsText(file);
    });

    // Listen for SETTINGS_UPDATE broadcast from content.js (e.g. song change)
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'SETTINGS_UPDATE') {
            if (msg.payload.syncOffset !== undefined) {
                updateOffsetDisplay(msg.payload.syncOffset);
            }
            if (msg.payload.globalSyncOffset !== undefined) {
                currentGlobalOffset = msg.payload.globalSyncOffset;
                globalOffsetInput.value = currentGlobalOffset;
            }
        }
    });

    // --- Event Listeners ---

    // 1. Toggle Auto-Launch
    toggleAutolaunch.addEventListener('change', () => {
        const val = toggleAutolaunch.checked;
        saveAndNotify({ autoLaunch: val });
    });

    // 2. Toggle Translation
    toggleTrans.addEventListener('change', () => {
        const val = toggleTrans.checked;
        saveAndNotify({ showTranslation: val });
    });

    // 3. Language Change
    langSelect.addEventListener('change', () => {
        const val = langSelect.value;
        saveAndNotify({ translationLang: val });
    });

    // 4. Offset Controls
    offsetMinus.addEventListener('click', () => adjustOffset(-100));
    offsetPlus.addEventListener('click', () => adjustOffset(100));

    globalOffsetSetBtn.addEventListener('click', () => {
        const val = parseInt(globalOffsetInput.value, 10);
        if (!isNaN(val)) {
            currentGlobalOffset = val;
            saveAndNotify({ globalSyncOffset: val });

            // Also update the current effective offset to match the new global if user wants it applied immediately
            // But usually this just sets the background default.

            globalOffsetSetBtn.textContent = 'Saved!';
            globalOffsetSetBtn.style.backgroundColor = '#1ed760';
            setTimeout(() => {
                globalOffsetSetBtn.textContent = 'Set Global';
                globalOffsetSetBtn.style.backgroundColor = '';
            }, 1000);
        }
    });

    function adjustOffset(delta) {
        let newOffset = currentEffectiveOffset + delta;
        updateOffsetDisplay(newOffset);
        saveAndNotify({ syncOffset: newOffset });
    }

    function updateOffsetDisplay(val) {
        currentEffectiveOffset = val;
        offsetDisplay.textContent = (val > 0 ? '+' : '') + val;
    }

    function saveAndNotify(changes) {
        chrome.storage.local.set(changes, () => {
            // Notify all music player tabs' content scripts
            chrome.tabs.query({ url: ["*://open.spotify.com/*", "*://music.youtube.com/*"] }, (tabs) => {
                tabs.forEach(tab => {
                    if (tab.id) {
                        chrome.tabs.sendMessage(tab.id, {
                            type: 'SETTINGS_UPDATE',
                            payload: changes
                        }, () => {
                            if (chrome.runtime.lastError) return;
                        });
                    }
                });
            });
        });
    }
});
