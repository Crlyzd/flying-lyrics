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

    // Request current effective offset (in case song-specific offset is active)
    let currentActiveTrack = { artist: "", title: "" };
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_SYNC_OFFSET' }, (response) => {
                if (response && response.syncOffset !== undefined) {
                    updateOffsetDisplay(response.syncOffset);
                }
            });

            chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_CURRENT_TRACK' }, (response) => {
                if (response && response.artist && response.title) {
                    const searchInput = document.getElementById('search-query');
                    currentActiveTrack = response;
                    if (searchInput) {
                        searchInput.value = `${response.artist} - ${response.title}`;
                    }
                }
            });
        }
    });

    // --- SEARCH & OVERRIDE LOGIC ---
    const searchBtn = document.getElementById('search-btn');
    const searchInput = document.getElementById('search-query');
    const resultsContainer = document.getElementById('search-results-container');
    const localUpload = document.getElementById('local-lyric-upload');

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

            resultsContainer.innerHTML = '';

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
                        `<span class="result-badge" style="background:#555;color:#FFF">UNSYNCED</span>` // We assume Netease might be synced or not, but let's just show NETEASE for now, or maybe ?
                })));
            }

            if (results.length === 0) {
                resultsContainer.innerHTML = '<div style="padding: 10px; text-align: center; font-size: 12px; color: #888;">No results found.</div>';
                return;
            }

            // Create "Auto" reset option
            const autoItem = document.createElement('div');
            autoItem.className = 'result-item';
            autoItem.innerHTML = `
                <div class="result-title">↳ Auto (Best Match)</div>
                <div class="result-meta">Reset to original search</div>
            `;
            autoItem.onclick = () => {
                saveAndNotify({ lyricOverride: null }); // Passing null will remove/ignore override on content script
                resultsContainer.querySelectorAll('.result-item').forEach(el => el.classList.remove('active-lyric'));
                autoItem.classList.add('active-lyric');
            };
            resultsContainer.appendChild(autoItem);

            results.forEach(item => {
                const duration = item.duration ? `${Math.floor(item.duration / 60).toString().padStart(2, '0')}:${(item.duration % 60).toString().padStart(2, '0')}` : "?:??";

                const div = document.createElement('div');
                div.className = 'result-item';
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

        } catch (e) {
            resultsContainer.innerHTML = '<div style="padding: 10px; text-align: center; font-size: 12px; color: #ff5555;">Search failed.</div>';
        } finally {
            searchBtn.textContent = 'Search';
        }
    });

    // Local File Read
    localUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            const rawText = ev.target.result;
            saveAndNotify({ lyricOverride: { type: 'local', data: rawText } });

            resultsContainer.innerHTML = `
                <div class="result-item active-lyric">
                    <div class="result-title">📁 Local File Loaded <span class="result-badge">CUSTOM</span></div>
                    <div class="result-meta"><span>${file.name}</span></div>
                </div>
            `;
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
