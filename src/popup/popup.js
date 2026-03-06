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

// Maps dropdown values to the font family strings stored in chrome.storage / config.js
const GOOGLE_FONTS_MAP = {
    "'Inter', sans-serif": 'Inter',
    "'Roboto', sans-serif": 'Roboto',
    "'Poppins', sans-serif": 'Poppins',
    "'Montserrat', sans-serif": 'Montserrat',
    "'Outfit', sans-serif": 'Outfit',
};

document.addEventListener('DOMContentLoaded', () => {
    // =========================================================
    //  ELEMENT REFERENCES
    // =========================================================
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

    // Slide navigation
    const popupSlides = document.getElementById('popup-slides');
    const btnOpenCustomize = document.getElementById('btn-open-customize');
    const btnBack = document.getElementById('btn-back');

    // Customization controls
    const fontFamilySelect = document.getElementById('font-family-select');
    const fontSizeSlider = document.getElementById('font-size-slider');
    const fontSizeValue = document.getElementById('font-size-value');
    const blurSlider = document.getElementById('blur-slider');
    const blurValue = document.getElementById('blur-value');
    const darknessSlider = document.getElementById('darkness-slider');
    const darknessValue = document.getElementById('darkness-value');
    const coverModeGroup = document.getElementById('cover-mode-group');
    const toggleGlow = document.getElementById('toggle-glow');
    const glowStyleContainer = document.getElementById('glow-style-container');
    const glowStyleSelect = document.getElementById('glow-style-select');
    const toggleShowLyrics = document.getElementById('toggle-show-lyrics');
    const alignSelect = document.getElementById('align-select');
    const glowPreview = document.getElementById('glow-preview');

    // State
    let currentResults = [];
    let currentActiveTrack = { artist: "", title: "" };
    let currentEffectiveOffset = 1000;
    let currentGlobalOffset = 1000;
    let activeSource = null;

    // =========================================================
    //  LANGUAGE DROPDOWN POPULATION
    // =========================================================
    LANGUAGES.forEach(lang => {
        const option = document.createElement('option');
        option.value = lang.code;
        option.textContent = lang.name;
        langSelect.appendChild(option);
    });

    // =========================================================
    //  DYNAMIC VERSION
    // =========================================================
    if (appVersion) {
        const manifest = chrome.runtime.getManifest();
        appVersion.textContent = `v${manifest.version}`;
    }

    // =========================================================
    //  LOAD SAVED SETTINGS (main + customization)
    // =========================================================
    chrome.storage.local.get({
        showTranslation: true,
        translationLang: 'id',
        globalSyncOffset: 1000,
        autoLaunch: false,
        // Customization defaults
        customFont: "'Noto Sans', 'Segoe UI', sans-serif",
        fontSize: 18,
        bgBlur: 2,
        bgDarkness: 50,
        coverMode: 'default',
        glowEnabled: false,
        glowStyle: 'theme',
        showLyrics: true,
        lyricAlignment: 'center',
    }, (items) => {
        // Main settings
        toggleTrans.checked = items.showTranslation;
        langSelect.value = items.translationLang;
        currentGlobalOffset = items.globalSyncOffset;
        globalOffsetInput.value = currentGlobalOffset;
        toggleAutolaunch.checked = items.autoLaunch;

        // Customization settings — populate controls
        // Map stored raw values back to 1-10 UI scale
        fontFamilySelect.value = items.customFont;

        // Font: 10 to 28px -> mapped to 1 to 10 step
        const fontStep = Math.max(1, Math.min(10, Math.round((items.fontSize - 10) / 2) + 1));
        fontSizeSlider.value = fontStep;
        fontSizeValue.textContent = fontStep;

        // Blur: 0 to 10px -> naturally matches 0-10 slider
        const blurStep = Math.max(0, Math.min(10, items.bgBlur));
        blurSlider.value = blurStep;
        blurValue.textContent = blurStep;

        // Darkness: 0 to 100% -> mapped to 0 to 10 step (x10)
        const darkStep = Math.max(0, Math.min(10, Math.round(items.bgDarkness / 10)));
        darknessSlider.value = darkStep;
        darknessValue.textContent = darkStep;

        toggleShowLyrics.checked = items.showLyrics;
        alignSelect.value = items.lyricAlignment;
        toggleGlow.checked = items.glowEnabled;
        glowStyleSelect.value = items.glowStyle;
        glowStyleContainer.style.display = items.glowEnabled ? 'flex' : 'none';
        glowPreview.classList.toggle('active', items.glowEnabled);
        glowPreview.classList.toggle('rainbow', items.glowStyle === 'rainbow');

        // Restore cover mode selection
        document.querySelectorAll('.cover-mode-option').forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.mode === items.coverMode);
        });

        // Apply font to preview
        glowPreview.style.fontFamily = items.customFont;
        glowPreview.style.fontSize = `${items.fontSize}px`;
    });

    // =========================================================
    //  STORAGE CHANGE LISTENER (e.g. from content script)
    // =========================================================
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.showTranslation) {
            toggleTrans.checked = changes.showTranslation.newValue;
        }
    });

    // =========================================================
    //  REQUEST CURRENT STATE FROM CONTENT SCRIPT
    // =========================================================
    chrome.tabs.query({ url: ["*://open.spotify.com/*", "*://music.youtube.com/*"] }, (tabs) => {
        let trackFound = false;

        tabs.forEach(tab => {
            if (!tab.id) return;

            chrome.tabs.sendMessage(tab.id, { type: 'GET_SYNC_OFFSET' }, (response) => {
                if (chrome.runtime.lastError) return;
                if (response && response.syncOffset !== undefined && !trackFound) {
                    updateOffsetDisplay(response.syncOffset);
                }
            });

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
                    trackFound = true;
                    currentActiveTrack = response;
                    const trackKey = `${response.artist} - ${response.title}`;

                    chrome.storage.local.get({ lastSearch: null, lyricsOverrides: {} }, (items) => {
                        const override = (items.lyricsOverrides || {})[trackKey] || null;

                        if (items.lastSearch && items.lastSearch.key === trackKey && items.lastSearch.results?.length) {
                            searchInput.value = items.lastSearch.query || trackKey;
                            currentResults = items.lastSearch.results;
                            renderSearchResults(currentResults, override);
                        } else if (override && override.type === 'local') {
                            searchInput.value = trackKey;
                            renderSearchResults([], override);
                        } else {
                            searchInput.value = trackKey;
                            if (activeSource) renderSearchResults([], null);
                        }
                    });
                }
            });
        });
    });

    // =========================================================
    //  SEARCH RESULTS RENDERER
    // =========================================================
    function renderSearchResults(results, activeOverride) {
        resultsContainer.innerHTML = '';

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

        const autoItem = document.createElement('div');
        autoItem.className = 'result-item';
        autoItem.style.position = 'relative';
        autoItem.innerHTML = `
            <div class="result-title">↳ Auto (Best Match)</div>
            <div class="result-meta">Reset to original search</div>
        `;
        autoItem.onclick = () => {
            saveAndNotify({ lyricOverride: null });
            resultsContainer.querySelectorAll('.active-dot').forEach(d => d.remove());
            resultsContainer.querySelectorAll('.result-item').forEach(el => el.classList.remove('active-lyric'));
            const dot = document.createElement('div');
            dot.className = 'active-dot';
            autoItem.appendChild(dot);
            autoItem.classList.add('active-lyric');
        };
        resultsContainer.appendChild(autoItem);

        if (results.length === 0 && activeSource && !(activeOverride && activeOverride.type === 'local')) {
            const sourceLabel = activeSource.type === 'netease' ? 'NETEASE' : 'LRCLIB';
            const sourceBadgeColor = activeSource.type === 'netease' ? 'background:#e60026;color:white;' : 'background:#1DB954;color:black;';
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

        results.forEach(item => {
            const duration = item.duration
                ? `${Math.floor(item.duration / 60).toString().padStart(2, '0')}:${(item.duration % 60).toString().padStart(2, '0')}`
                : "?:??";

            const div = document.createElement('div');
            div.className = 'result-item';
            div.style.position = 'relative';

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

        if (!activeOverride && results.length > 0 && !activeSource) {
            autoItem.classList.add('active-lyric');
        }
    }

    // =========================================================
    //  SEARCH HANDLER
    // =========================================================
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

            currentResults = results;
            const trackKey = `${currentActiveTrack.artist} - ${currentActiveTrack.title}`;
            chrome.storage.local.set({
                lastSearch: { key: trackKey, query: query, results: results }
            });

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

    // =========================================================
    //  LOCAL FILE UPLOAD
    // =========================================================
    localUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            const rawText = ev.target.result;
            saveAndNotify({ lyricOverride: { type: 'local', data: rawText } });
            renderSearchResults(currentResults, { type: 'local' });
        };
        reader.readAsText(file);
    });

    // =========================================================
    //  SETTINGS_UPDATE BROADCAST FROM CONTENT SCRIPT
    // =========================================================
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

    // =========================================================
    //  MAIN SETTING LISTENERS
    // =========================================================
    toggleAutolaunch.addEventListener('change', () => {
        saveAndNotify({ autoLaunch: toggleAutolaunch.checked });
    });

    toggleTrans.addEventListener('change', () => {
        saveAndNotify({ showTranslation: toggleTrans.checked });
    });

    langSelect.addEventListener('change', () => {
        saveAndNotify({ translationLang: langSelect.value });
    });

    function setupHoldButton(btnElement, delta) {
        let intervalId = null;
        let timeoutId = null;

        const start = (e) => {
            // Prevent default touch behaviors (like scrolling or double-tap zoom)
            if (e && e.type === 'touchstart') e.preventDefault();

            // Trigger 1 instant tick
            adjustOffset(delta);

            // Wait 400ms to see if user is holding
            timeoutId = setTimeout(() => {
                // Begin rapid ticking
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

        btnElement.addEventListener('mouseup', stop);
        btnElement.addEventListener('mouseleave', stop);
        btnElement.addEventListener('touchend', stop);
    }

    setupHoldButton(offsetMinus, -100);
    setupHoldButton(offsetPlus, 100);

    globalOffsetSetBtn.addEventListener('click', () => {
        const val = parseInt(globalOffsetInput.value, 10);
        if (!isNaN(val)) {
            currentGlobalOffset = val;
            saveAndNotify({ globalSyncOffset: val });

            globalOffsetSetBtn.textContent = 'Saved!';
            globalOffsetSetBtn.style.backgroundColor = '#1ed760';
            setTimeout(() => {
                globalOffsetSetBtn.textContent = 'Set Global';
                globalOffsetSetBtn.style.backgroundColor = '';
            }, 1000);
        }
    });

    // =========================================================
    //  SLIDE NAVIGATION
    // =========================================================
    btnOpenCustomize.addEventListener('click', () => {
        popupSlides.style.transform = 'translateX(-50%)';
    });

    btnBack.addEventListener('click', () => {
        popupSlides.style.transform = 'translateX(0)';
    });

    // =========================================================
    //  CUSTOMIZATION LISTENERS
    // =========================================================

    // Font Family
    fontFamilySelect.addEventListener('change', () => {
        const val = fontFamilySelect.value;
        glowPreview.style.fontFamily = val;
        saveAndNotify({ customFont: val });
    });

    // Font Size (1-10 step maps to 10px-28px)
    fontSizeSlider.addEventListener('input', () => {
        const step = parseInt(fontSizeSlider.value, 10);
        fontSizeValue.textContent = step;
        const realPx = 10 + ((step - 1) * 2); // 1=10px, 5=18px, 10=28px
        glowPreview.style.fontSize = `${realPx}px`;
    });
    fontSizeSlider.addEventListener('change', () => {
        const step = parseInt(fontSizeSlider.value, 10);
        const realPx = 10 + ((step - 1) * 2);
        saveAndNotify({ fontSize: realPx });
    });

    // Background Blur (0-10 naturally matches 0-10px max required)
    blurSlider.addEventListener('input', () => {
        const step = parseInt(blurSlider.value, 10);
        blurValue.textContent = step;
    });
    blurSlider.addEventListener('change', () => {
        const step = parseInt(blurSlider.value, 10);
        saveAndNotify({ bgBlur: step });
    });

    // Background Darkness (0-10 maps to 0-100%)
    darknessSlider.addEventListener('input', () => {
        const step = parseInt(darknessSlider.value, 10);
        darknessValue.textContent = step;
    });
    darknessSlider.addEventListener('change', () => {
        const step = parseInt(darknessSlider.value, 10);
        const realPercent = step * 10; // 0=0%, 5=50%, 10=100%
        saveAndNotify({ bgDarkness: realPercent });
    });

    // Cover Mode
    coverModeGroup.addEventListener('click', (e) => {
        const option = e.target.closest('.cover-mode-option');
        if (!option) return;
        document.querySelectorAll('.cover-mode-option').forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        saveAndNotify({ coverMode: option.dataset.mode });
    });

    // Glow Toggle
    toggleGlow.addEventListener('change', () => {
        glowPreview.classList.toggle('active', toggleGlow.checked);
        glowStyleContainer.style.display = toggleGlow.checked ? 'flex' : 'none';
        saveAndNotify({ glowEnabled: toggleGlow.checked });
    });

    // Glow Style
    glowStyleSelect.addEventListener('change', () => {
        const val = glowStyleSelect.value;
        glowPreview.classList.toggle('rainbow', val === 'rainbow');
        saveAndNotify({ glowStyle: val });
    });

    // Show Lyrics Toggle
    toggleShowLyrics.addEventListener('change', () => {
        saveAndNotify({ showLyrics: toggleShowLyrics.checked });
    });

    // Lyric Alignment
    alignSelect.addEventListener('change', () => {
        saveAndNotify({ lyricAlignment: alignSelect.value });
    });

    // =========================================================
    //  HELPERS
    // =========================================================
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
