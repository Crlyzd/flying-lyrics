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
    // --- Existing settings elements ---
    const toggleTrans = document.getElementById('toggle-translation');
    const langSelect = document.getElementById('lang-select');
    const offsetMinus = document.getElementById('offset-minus');
    const offsetPlus = document.getElementById('offset-plus');
    const offsetDisplay = document.getElementById('offset-display');

    // --- New override elements ---
    const nowPlayingLabel = document.getElementById('now-playing-label');
    const btnSearch = document.getElementById('btn-search');
    const btnLoadLrc = document.getElementById('btn-load-lrc');
    const localLrcUpload = document.getElementById('localLrcUpload');
    const searchStatus = document.getElementById('search-status');
    const searchResults = document.getElementById('searchResults');
    const btnClearOverride = document.getElementById('btn-clear-override');

    // Track the current active tab id for sending messages
    let activeTabId = null;

    // Populate Languages
    LANGUAGES.forEach(lang => {
        const option = document.createElement('option');
        option.value = lang.code;
        option.textContent = lang.name;
        langSelect.appendChild(option);
    });

    // Load Saved Settings + derive active track key for override display
    chrome.storage.local.get({
        showTranslation: true,
        translationLang: 'id',
        syncOffset: 400,
        manualLyrics: {}
    }, (items) => {
        toggleTrans.checked = items.showTranslation;
        langSelect.value = items.translationLang;
        updateOffsetDisplay(items.syncOffset);
    });

    // Resolve the active tab once and reuse
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]?.id) return;
        activeTabId = tabs[0].id;

        // Request current effective sync offset from content.js
        chrome.tabs.sendMessage(activeTabId, { type: 'GET_SYNC_OFFSET' }, (response) => {
            if (response?.syncOffset !== undefined) {
                updateOffsetDisplay(response.syncOffset);
            }
        });

        // Request current now-playing info from content.js
        chrome.tabs.sendMessage(activeTabId, { type: 'GET_NOW_PLAYING' }, (response) => {
            if (response?.trackKey) {
                nowPlayingLabel.innerHTML = `Playing: <strong>${response.trackKey}</strong>`;

                // If there are cached search results, auto-render them
                if (response.cachedResults && response.cachedResults.length > 0) {
                    renderResults(response.cachedResults, response.override);
                }

                // Check if there's an existing override for this track
                chrome.storage.local.get({ manualLyrics: {} }, (items) => {
                    if (items.manualLyrics[response.trackKey]) {
                        showClearOverrideButton(items.manualLyrics[response.trackKey]);
                    }
                });
            }
        });
    });

    // Listen for SETTINGS_UPDATE broadcast (e.g. song change updating the offset display)
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'SETTINGS_UPDATE' && msg.payload.syncOffset !== undefined) {
            updateOffsetDisplay(msg.payload.syncOffset);
        }
    });

    // Listen for storage changes to sync toggle state
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.showTranslation) {
            toggleTrans.checked = changes.showTranslation.newValue;
        }
    });

    // ----------------------------
    // Existing Settings Listeners
    // ----------------------------

    toggleTrans.addEventListener('change', () => {
        saveAndNotify({ showTranslation: toggleTrans.checked });
    });

    langSelect.addEventListener('change', () => {
        saveAndNotify({ translationLang: langSelect.value });
    });

    offsetMinus.addEventListener('click', () => adjustOffset(-100));
    offsetPlus.addEventListener('click', () => adjustOffset(100));

    function adjustOffset(delta) {
        chrome.storage.local.get({ syncOffset: 0 }, (items) => {
            const newOffset = items.syncOffset + delta;
            updateOffsetDisplay(newOffset);
            saveAndNotify({ syncOffset: newOffset });
        });
    }

    function updateOffsetDisplay(val) {
        offsetDisplay.textContent = (val > 0 ? '+' : '') + val;
    }

    function saveAndNotify(changes) {
        chrome.storage.local.set(changes, () => {
            if (activeTabId) {
                chrome.tabs.sendMessage(activeTabId, {
                    type: 'SETTINGS_UPDATE',
                    payload: changes
                });
            }
        });
    }

    // ----------------------------
    // Lyrics Override Logic
    // ----------------------------

    /** Show/hide the "Clear Override" button with a status hint. */
    function showClearOverrideButton(override) {
        let hint = '';
        if (override.type === 'local') hint = '📁 Local file override active';
        else if (override.source === 'netease') hint = '🎵 Netease override active';
        else if (override.source === 'lrclib') hint = '🎵 LRCLIB override active';
        setStatus(hint);
        btnClearOverride.style.display = 'flex';
    }

    /** Update the status paragraph below the buttons. */
    function setStatus(msg) {
        searchStatus.textContent = msg;
        searchStatus.style.display = msg ? 'block' : 'none';
    }

    // 1. "Search Alternatives" button
    btnSearch.addEventListener('click', () => {
        if (!activeTabId) return;
        setStatus('Searching...');
        searchResults.style.display = 'none';
        searchResults.innerHTML = '';

        chrome.tabs.sendMessage(activeTabId, { type: 'SEARCH_LYRICS' }, (response) => {
            const results = response?.results;
            if (!results || results.length === 0) {
                setStatus('No results found. Is a track playing?');
                return;
            }
            setStatus('');
            renderResults(results, response.currentOverride);
        });
    });

    /** Render an array of result objects into the results container. */
    function renderResults(results, currentOverride) {
        searchResults.innerHTML = '';
        searchResults.style.display = 'flex';

        results.forEach(result => {
            const item = document.createElement('div');
            item.className = 'search-result';
            // Highlight the currently-active override
            if (currentOverride &&
                currentOverride.type === 'network' &&
                currentOverride.source === result.source &&
                String(currentOverride.id) === String(result.id)) {
                item.classList.add('active-override');
            }

            const badgeClass = result.source === 'netease' ? 'source-netease' : 'source-lrclib';
            const unsyncedBadge = (result.isSynced === false) ? `<span class="source-badge badge-unsynced">Unsynced</span>` : '';

            item.innerHTML = `
                <div class="result-title">${result.name}</div>
                <div class="result-meta">
                    <span>${result.artist || '—'}</span>
                    <div>
                        ${unsyncedBadge}
                        <span class="source-badge ${badgeClass}">${result.source === 'netease' ? 'Netease' : 'LRCLIB'}</span>
                    </div>
                </div>`;
            item.addEventListener('click', () => {
                if (!activeTabId) return;
                chrome.tabs.sendMessage(activeTabId, {
                    type: 'SELECT_LYRICS',
                    source: result.source,
                    id: result.id
                }, (res) => {
                    if (res?.ok) {
                        // Mark selected item
                        document.querySelectorAll('.search-result').forEach(el => el.classList.remove('active-override'));
                        item.classList.add('active-override');
                        showClearOverrideButton({ type: 'network', source: result.source });
                    }
                });
            });

            searchResults.appendChild(item);
        });
    }

    // 2. "Load Local .lrc File" button -> open hidden file picker
    btnLoadLrc.addEventListener('click', () => localLrcUpload.click());

    localLrcUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file || !activeTabId) return;

        setStatus('Reading file...');
        const reader = new FileReader();
        reader.onload = (ev) => {
            const lrcText = ev.target.result;
            chrome.tabs.sendMessage(activeTabId, {
                type: 'SAVE_LOCAL_LYRICS',
                lrcText
            }, (res) => {
                if (res?.ok) {
                    setStatus(`📁 "${file.name}" loaded!`);
                    showClearOverrideButton({ type: 'local' });
                } else {
                    setStatus('Failed to apply local lyrics. Is a track playing?');
                }
            });
        };
        reader.onerror = () => setStatus('Could not read file.');
        reader.readAsText(file);

        // Reset so the same file can be re-selected again if needed
        localLrcUpload.value = '';
    });

    // 3. "Clear Override" button
    btnClearOverride.addEventListener('click', () => {
        if (!activeTabId) return;
        chrome.tabs.sendMessage(activeTabId, { type: 'CLEAR_LYRICS_OVERRIDE' }, () => {
            btnClearOverride.style.display = 'none';
            searchResults.style.display = 'none';
            searchResults.innerHTML = '';
            // Remove active-override class from all results
            document.querySelectorAll('.search-result').forEach(el => el.classList.remove('active-override'));
            setStatus('Override cleared. Auto-fetch will resume.');
        });
    });
});
