// =========================================================
//  popup-lyrics-search.js
//  Lyrics manual search, badge generation, results list
//  rendering, and result card selection / override delegation.
//
//  Depends on: popup-state.js, popup-lyrics.js
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
    const popup   = window.FLYING_LYRICS.popup;
    const el      = popup.el;
    const state   = popup.state;
    const storage = window.FLYING_LYRICS.storage;

    const saveAndNotify      = popup.saveAndNotify;
    const refreshActiveTrack = popup.refreshActiveTrack;

    // =========================================================
    //  SEARCH RESULTS RENDERER
    // =========================================================
    function renderSearchResults(results, activeOverride) {
        if (!el.resultsContainer) return;
        el.resultsContainer.innerHTML = '';

        // LOCAL FILE CARD
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

        // AUTO-MATCH CARD
        const autoItem = document.createElement('div');
        autoItem.id = 'auto-match-card';
        autoItem.className = 'result-item';
        autoItem.innerHTML = `
            <div class="result-left">
                <div class="result-title">↳ Auto (Best Match)</div>
                <div class="result-artist">Reset to original search</div>
            </div>
            <div class="result-right"><div class="dot-container"></div></div>
        `;
        el.resultsContainer.appendChild(autoItem);

        // ACTIVE SOURCE CARD (when no search results yet)
        if (results.length === 0 && state.activeSource && !(activeOverride && activeOverride.type === 'local')) {
            const sType = state.activeSource.type;
            const sourceLabel = sType === 'netease' ? 'NETEASE' : (sType === 'kugou' ? 'KUGOU' : 'LRCLIB');
            const badgeClass  = sType === 'netease' ? 'badge-netease' : (sType === 'kugou' ? 'badge-kugou' : 'badge-lrclib');
            const autoCard = document.createElement('div');
            autoCard.className = 'result-item active-lyric';

            const autoLeft = document.createElement('div');
            autoLeft.className = 'result-left';
            const autoTitle = Object.assign(document.createElement('div'), { className: 'result-title', textContent: state.activeSource.name || 'Unknown' });
            const autoArtist = Object.assign(document.createElement('div'), { className: 'result-artist', textContent: 'Auto-loaded · Click Search for more versions' });
            autoLeft.append(autoTitle, autoArtist);

            const autoRight = document.createElement('div');
            autoRight.className = 'result-right';
            const dotContainer = Object.assign(document.createElement('div'), { className: 'dot-container' });
            dotContainer.appendChild(Object.assign(document.createElement('div'), { className: state.activeSource.isEmpty ? 'active-dot active-dot--empty' : 'active-dot' }));

            const badgesCont = Object.assign(document.createElement('div'), { className: 'result-badges' });
            badgesCont.appendChild(Object.assign(document.createElement('span'), { className: `result-badge ${badgeClass}`, textContent: sourceLabel }));

            if (sType !== 'local') {
                const syncCls = state.activeSource.isEmpty ? 'result-badge badge-empty' : (state.activeSource.synced ? 'result-badge' : 'result-badge badge-unsynced');
                const syncTxt = state.activeSource.isEmpty ? 'EMPTY' : (state.activeSource.synced ? 'SYNCED' : 'UNSYNCED');
                badgesCont.appendChild(Object.assign(document.createElement('span'), { className: syncCls, textContent: syncTxt }));
            }
            autoRight.append(dotContainer, badgesCont);
            autoCard.append(autoLeft, autoRight);

            el.resultsContainer.appendChild(autoCard);
            return;
        }

        // RESULT ITEMS
        let foundActiveInList = false;

        results.forEach(item => {
            const duration = item.duration
                ? `${Math.floor(item.duration / 60).toString().padStart(2, '0')}:${Math.floor(item.duration % 60).toString().padStart(2, '0')}`
                : '?:??';

            const div = document.createElement('div');
            div.className = 'result-item';
            div.dataset.source    = item.source;
            div.dataset.id        = item.id;
            div.dataset.accesskey = item.accesskey || '';
            div.dataset.name      = item.name;

            const isActiveOverride = activeOverride && activeOverride.type !== 'local'
                && String(activeOverride.id) === String(item.id) && activeOverride.type === item.source;
            const isActiveLive = !activeOverride && state.activeSource
                && String(state.activeSource.id) === String(item.id) && state.activeSource.type === item.source;

            const resLeft = document.createElement('div');
            resLeft.className = 'result-left';
            const resTitle = Object.assign(document.createElement('div'), { className: 'result-title', textContent: item.name });
            const resArtist = Object.assign(document.createElement('div'), { className: 'result-artist', textContent: `${item.artistName} • ${item.albumName || 'Unknown Album'}` });
            resLeft.append(resTitle, resArtist);

            const resRight = document.createElement('div');
            resRight.className = 'result-right';
            const dotContainer = document.createElement('div');
            dotContainer.className = 'dot-container';

            const resBadges = document.createElement('div');
            resBadges.className = 'result-badges';
            if (item.badgeHtml) {
                const parsedBadges = new DOMParser().parseFromString(`<body>${item.badgeHtml}</body>`, 'text/html');
                resBadges.append(...parsedBadges.body.childNodes);
            }

            const resDuration = document.createElement('div');
            resDuration.className = 'result-duration';
            resDuration.textContent = duration;

            resRight.append(dotContainer, resBadges, resDuration);
            div.append(resLeft, resRight);

            if (isActiveOverride || isActiveLive) {
                const isItemEmpty = item.isEmpty || (state.activeSource && String(state.activeSource.id) === String(item.id) && state.activeSource.type === item.source && state.activeSource.isEmpty);
                div.classList.add('active-lyric');
                const dot = document.createElement('div');
                dot.className = isItemEmpty ? 'active-dot active-dot--empty' : 'active-dot';
                dotContainer.appendChild(dot);
                foundActiveInList = true;
            }
            el.resultsContainer.appendChild(div);
        });

        if (!activeOverride && results.length > 0 && !foundActiveInList) {
            autoItem.classList.add('active-lyric');
            const dot = document.createElement('div');
            dot.className = 'active-dot';
            const dotContainer = autoItem.querySelector('.dot-container');
            if (dotContainer) dotContainer.appendChild(dot);
        }
    }
    popup.renderSearchResults = renderSearchResults;

    // =========================================================
    //  RESULT CONTAINER — EVENT DELEGATION
    // =========================================================
    if (el.resultsContainer) {
        el.resultsContainer.addEventListener('click', (e) => {
            const item = e.target.closest('.result-item');
            if (!item || item.id === 'local-file-card' || item.id === 'deep-search-indicator') return;

            refreshActiveTrack((track) => {
                if (!track) {
                    alert('No active track found.');
                    return;
                }

                const trackKey = state.currentActiveTrack?.artist && state.currentActiveTrack?.title
                    ? `${state.currentActiveTrack.artist} - ${state.currentActiveTrack.title}`
                    : null;

                if (item.id === 'auto-match-card') {
                    saveAndNotify({ trackKey: trackKey, lyricOverride: null });
                    const spinner = document.createElement('div');
                    spinner.className = 'sync-spinner';
                    const dotContainer = item.querySelector('.dot-container');
                    if (dotContainer) {
                        dotContainer.querySelectorAll('.active-dot, .failed-dot, .sync-spinner').forEach(d => d.remove());
                        dotContainer.appendChild(spinner);
                    }
                    return;
                }

                const source    = item.dataset.source;
                const id        = item.dataset.id;
                const accesskey = item.dataset.accesskey;

                if (source && id) {
                    const overridePayload = { type: source, id: id };
                    if (source === 'kugou' && accesskey) overridePayload.accesskey = accesskey;
                    saveAndNotify({ trackKey: trackKey, lyricOverride: overridePayload });

                    const spinner = document.createElement('div');
                    spinner.className = 'sync-spinner';
                    const dotContainer = item.querySelector('.dot-container');
                    if (dotContainer) {
                        dotContainer.querySelectorAll('.active-dot, .failed-dot, .sync-spinner').forEach(d => d.remove());
                        dotContainer.appendChild(spinner);
                    }
                }
            });
        });
    }

    // =========================================================
    //  SEARCH HANDLER & DEEP SEARCH MERGER
    // =========================================================
    function buildBadgeHtml(item) {
        const isItemEmpty = item.isEmpty || (state.activeSource && state.activeSource.type === item.source && String(state.activeSource.id) === String(item.id) && state.activeSource.isEmpty);
        let sourceBadge = '';
        if (item.source === 'api') sourceBadge = '<span class="result-badge badge-lrclib">LRCLIB</span>';
        else if (item.source === 'netease') sourceBadge = '<span class="result-badge badge-netease">NETEASE</span>';
        else if (item.source === 'kugou') sourceBadge = '<span class="result-badge badge-kugou">KUGOU</span>';

        let statusBadge = '';
        if (isItemEmpty) statusBadge = '<span class="result-badge badge-empty">EMPTY</span>';
        else if (item.source === 'api') {
            statusBadge = item.synced ? '<span class="result-badge">SYNCED</span>' : '<span class="result-badge badge-unsynced">UNSYNCED</span>';
        }
        return sourceBadge + statusBadge;
    }

    async function executeSearch() {
        const query = el.searchInput.value.trim();
        if (!query) return;

        state.activeSearchQuery = query;
        el.searchBtn.textContent = '...';
        el.searchBtn.setAttribute('aria-busy', 'true');
        el.searchBtn.setAttribute('aria-label', 'Searching…');
        el.resultsContainer.innerHTML = '<div class="status-msg">Searching...</div>';

        try {
            const tabs = await new Promise(r => chrome.tabs.query({ url: ['*://open.spotify.com/*', '*://music.youtube.com/*'] }, r));
            if (tabs && tabs.length > 0) {
                for (const tab of tabs) {
                    if (!tab.id) continue;
                    try {
                        const res = await new Promise(r => chrome.tabs.sendMessage(tab.id, { type: 'GET_CURRENT_TRACK' }, m => { void chrome.runtime.lastError; r(m); }));
                        if (res && res.artist && res.title) { state.currentActiveTrack = res; break; }
                    } catch (_) {}
                }
            }
        } catch (_) {}

        try {
            const cleanArtist   = state.currentActiveTrack?.primaryArtist || state.currentActiveTrack?.artist || '';
            const cleanTitleStr = state.currentActiveTrack?.cleanTitle   || state.currentActiveTrack?.title   || '';
            const duration      = state.currentActiveTrack?.duration || 0;

            const response = await new Promise(resolve =>
                chrome.runtime.sendMessage({
                    type: 'UNIFIED_SEARCH',
                    payload: { query, duration, cleanArtist, cleanTitle: cleanTitleStr, timeoutMs: 5000 }
                }, res => { void chrome.runtime.lastError; resolve(res); })
            );

            if (state.activeSearchQuery !== query) return;

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
            const trackKey = (state.currentActiveTrack?.artist && state.currentActiveTrack?.title)
                ? `${state.currentActiveTrack.artist} - ${state.currentActiveTrack.title}`
                : query;
            if (results.length > 0) {
                storage.set({ lastSearch: { key: trackKey, query: query, results: results } });
            }

            storage.get({ lyricsOverrides: {} }, (items) => {
                if (state.activeSearchQuery !== query) return;
                const override = (items.lyricsOverrides || {})[trackKey] || null;
                renderSearchResults(results, override);

                if (hasTimeout) {
                    const deepCard = document.createElement('div');
                    deepCard.id = 'deep-search-indicator';
                    deepCard.className = 'result-item';
                    deepCard.innerHTML = '<div class="deep-search-label-row"><div class="sync-spinner"></div>Deep search running...</div>';
                    el.resultsContainer.insertBefore(deepCard, el.resultsContainer.firstChild);

                    chrome.runtime.sendMessage({
                        type: 'UNIFIED_SEARCH',
                        payload: { query, duration, cleanArtist, cleanTitle: cleanTitleStr, timeoutMs: 30000 }
                    }, (secondResponse) => {
                        if (chrome.runtime.lastError || state.activeSearchQuery !== query) return;
                        const secondResults = (secondResponse?.results || []).map(item => ({ ...item, badgeHtml: buildBadgeHtml(item) }));

                        const finalResults = [];
                        const seen = new Set();
                        secondResults.forEach(item => { const k = `${item.source}-${item.id}`; if (!seen.has(k)) { seen.add(k); finalResults.push(item); } });
                        results.forEach(item => { const k = `${item.source}-${item.id}`; if (!seen.has(k)) { seen.add(k); finalResults.push(item); } });

                        if (finalResults.length === 0) {
                            el.resultsContainer.innerHTML = '<div class="status-msg">No results found.</div>';
                            return;
                        }

                        state.currentResults = finalResults;
                        storage.set({ lastSearch: { key: trackKey, query: query, results: finalResults } });
                        storage.get({ lyricsOverrides: {} }, (newItems) => {
                            if (state.activeSearchQuery !== query) return;
                            renderSearchResults(finalResults, (newItems.lyricsOverrides || {})[trackKey] || null);
                        });
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
    }

    if (el.searchInput) {
        el.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') executeSearch();
        });
    }
    if (el.searchBtn) {
        el.searchBtn.addEventListener('click', executeSearch);
    }
});
