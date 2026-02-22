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
    const langSelect = document.getElementById('lang-select');
    const offsetMinus = document.getElementById('offset-minus');
    const offsetPlus = document.getElementById('offset-plus');
    const offsetDisplay = document.getElementById('offset-display');
    const searchBtn = document.getElementById('search-btn');
    const searchInput = document.getElementById('search-query');
    const resultsContainer = document.getElementById('search-results-container');
    const localUpload = document.getElementById('local-lyric-upload');

    // Track the current results array so other handlers (e.g. local upload) can reference it
    let currentResults = [];
    let currentActiveTrack = { artist: "", title: "" };

    // Populate Languages
    LANGUAGES.forEach(lang => {
        const option = document.createElement('option');
        option.value = lang.code;
        option.textContent = lang.name;
        langSelect.appendChild(option);
    });

    // Load Saved Settings
    chrome.storage.local.get({
        showTranslation: true,
        translationLang: 'id',
        syncOffset: 400
    }, (items) => {
        toggleTrans.checked = items.showTranslation;
        langSelect.value = items.translationLang;
        updateOffsetDisplay(items.syncOffset);
    });

    // Listen for changes from Content Script (PiP)
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.showTranslation) {
            toggleTrans.checked = changes.showTranslation.newValue;
        }
    });

    // Request current effective offset and track info, then restore cached search
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_SYNC_OFFSET' }, (response) => {
                if (response && response.syncOffset !== undefined) {
                    updateOffsetDisplay(response.syncOffset);
                }
            });

            chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_CURRENT_TRACK' }, (response) => {
                if (response && response.artist && response.title) {
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
                        }
                    });
                }
            });
        }
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
            localItem.innerHTML = `
                <div class="result-title">📁 Local File Loaded <span class="result-badge">CUSTOM</span></div>
                <div class="result-meta"><span>Custom .lrc file</span></div>
            `;
            resultsContainer.appendChild(localItem);
        }

        // "Auto (Best Match)" reset option
        const autoItem = document.createElement('div');
        autoItem.className = 'result-item';
        // Mark active when no override is set (or override is explicitly null)
        if (!activeOverride) {
            autoItem.classList.add('active-lyric');
        }
        autoItem.innerHTML = `
            <div class="result-title">↳ Auto (Best Match)</div>
            <div class="result-meta">Reset to original search</div>
        `;
        autoItem.onclick = () => {
            saveAndNotify({ lyricOverride: null });
            resultsContainer.querySelectorAll('.result-item').forEach(el => el.classList.remove('active-lyric'));
            autoItem.classList.add('active-lyric');
        };
        resultsContainer.appendChild(autoItem);

        // Individual result items
        results.forEach(item => {
            const duration = item.duration
                ? `${Math.floor(item.duration / 60).toString().padStart(2, '0')}:${(item.duration % 60).toString().padStart(2, '0')}`
                : "?:??";

            const div = document.createElement('div');
            div.className = 'result-item';

            // Highlight if this item is the active override
            if (activeOverride && activeOverride.type !== 'local'
                && activeOverride.id === item.id && activeOverride.type === item.source) {
                div.classList.add('active-lyric');
                // Also un-highlight Auto since a specific override is selected
                autoItem.classList.remove('active-lyric');
            }

            div.innerHTML = `
                <div class="result-title">${item.name} ${item.badgeHtml}</div>
                <div class="result-meta">
                    <span>${item.artistName} • ${item.albumName || 'Unknown Album'}</span>
                    <span>${duration}</span>
                </div>
            `;
            div.onclick = () => {
                saveAndNotify({ lyricOverride: { type: item.source, id: item.id } });
                resultsContainer.querySelectorAll('.result-item').forEach(el => el.classList.remove('active-lyric'));
                div.classList.add('active-lyric');
            };
            resultsContainer.appendChild(div);
        });

        // If no results and no local override, show an empty-state message
        if (results.length === 0 && !(activeOverride && activeOverride.type === 'local')) {
            // Keep the Auto item but don't add an extra "no results" — the Auto item is enough
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
                    badgeHtml: `<span class="result-badge" style="background:#e60026; color:white;">NETEASE</span>` +
                        `<span class="result-badge" style="background:#555;color:#FFF">UNSYNCED</span>`
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
        if (msg.type === 'SETTINGS_UPDATE' && msg.payload.syncOffset !== undefined) {
            updateOffsetDisplay(msg.payload.syncOffset);
        }
    });

    // --- Event Listeners ---

    // 1. Toggle Translation
    toggleTrans.addEventListener('change', () => {
        const val = toggleTrans.checked;
        saveAndNotify({ showTranslation: val });
    });

    // 2. Language Change
    langSelect.addEventListener('change', () => {
        const val = langSelect.value;
        saveAndNotify({ translationLang: val });
    });

    // 3. Offset Controls
    offsetMinus.addEventListener('click', () => adjustOffset(-100));
    offsetPlus.addEventListener('click', () => adjustOffset(100));

    function adjustOffset(delta) {
        chrome.storage.local.get({ syncOffset: 0 }, (items) => {
            let newOffset = items.syncOffset + delta;
            updateOffsetDisplay(newOffset);
            saveAndNotify({ syncOffset: newOffset });
        });
    }

    function updateOffsetDisplay(val) {
        offsetDisplay.textContent = (val > 0 ? '+' : '') + val;
    }

    function saveAndNotify(changes) {
        chrome.storage.local.set(changes, () => {
            // Notify active tab's content script
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]?.id) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        type: 'SETTINGS_UPDATE',
                        payload: changes
                    });
                }
            });
        });
    }
});
