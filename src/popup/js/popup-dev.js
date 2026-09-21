// =========================================================
//  popup-dev.js
//  Flying Lyrics Developer Tools Tab Controller
//
//  NOTE: This module is strictly isolated to unpacked
//  development environments. It automatically halts and cleans
//  up if loaded in production store builds.
// =========================================================

(function () {
    'use strict';

    // Strict detection of unpacked developer extension (no update_url in manifest)
    const isDevMode = !('update_url' in chrome.runtime.getManifest());
    if (!isDevMode) {
        // Hard exit for production builds — zero execution, zero DOM footprint
        return;
    }

    function initDevTools() {
        const popup = window.FLYING_LYRICS?.popup || {};
        const storage = window.FLYING_LYRICS?.storage || chrome.storage.local;

        const tabBar = document.querySelector('.tab-bar');
        const tabContent = document.querySelector('.tab-content');
        if (!tabBar || !tabContent) return;

        // ─── 1. Inject Tab Button ────────────────────────────────────────────
        const devTabBtn = document.createElement('button');
        devTabBtn.className = 'tab-btn';
        devTabBtn.dataset.tab = 'dev';
        devTabBtn.id = 'tab-btn-dev';
        devTabBtn.title = 'Developer Tools (Unpacked Build)';
        devTabBtn.innerHTML = `
            <svg class="icon-svg icon-size-16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width: 16px; height: 16px;">
                <polyline points="16 18 22 12 16 6"></polyline>
                <polyline points="8 6 2 12 8 18"></polyline>
            </svg>
            <span class="dev-tab-text">Dev</span>
        `;

        devTabBtn.addEventListener('click', () => {
            if (typeof popup.switchTab === 'function') {
                popup.switchTab('dev');
            } else {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === devTabBtn));
                document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === 'tab-dev'));
            }
            refreshDiagnostics();
        });

        tabBar.appendChild(devTabBtn);

        // ─── 2. Inject Dev Tab Pane ──────────────────────────────────────────
        const devTabPane = document.createElement('div');
        devTabPane.className = 'tab-pane';
        devTabPane.id = 'tab-dev';
        devTabPane.innerHTML = `
            <!-- DEV HEADER BADGE -->
            <div class="dev-header-badge">
                <div class="dev-badge-left">
                    <span class="dev-dot-indicator"></span>
                    <span class="dev-badge-title">DEV TOOLS</span>
                </div>
                <span class="dev-badge-version">v${chrome.runtime.getManifest().version} · Unpacked</span>
            </div>

            <!-- SECTION 1: CACHE & FALLBACK EVASION -->
            <div class="control-group dev-card">
                <label class="dev-card-label">Lyrics Cache &amp; Evading</label>

                <!-- BYPASS CACHE TOGGLE -->
                <div class="row" style="margin-bottom: 8px;">
                    <label for="toggle-dev-bypass-cache" style="display: flex; flex-direction: column; gap: 2px; margin: 0; cursor: pointer;">
                        <span style="font-size: 12px; font-weight: 600;">Bypass Lyrics Cache</span>
                        <span class="dev-subtext">Skip Tier 1 &amp; 2; query live providers</span>
                    </label>
                    <label class="switch">
                        <input type="checkbox" id="toggle-dev-bypass-cache">
                        <span class="slider"></span>
                    </label>
                </div>

                <!-- ACTION BUTTONS ROW -->
                <div class="dev-btn-row">
                    <button class="search-btn dev-action-btn" id="btn-dev-clear-cache">
                        Clear Cache (0)
                    </button>
                    <button class="search-btn dev-action-btn" id="btn-dev-force-refetch" title="Evict active song from cache &amp; refetch">
                        Force Refetch
                    </button>
                </div>
            </div>

            <!-- SECTION 2: ACTIVE TRACK INSPECTOR -->
            <div class="control-group dev-card">
                <label class="dev-card-label">Active Track Diagnostics</label>
                <div class="dev-inspect-grid">
                    <div class="dev-inspect-row">
                        <span class="dev-inspect-key">Track:</span>
                        <span class="dev-inspect-val" id="dev-track-name">Waiting for track...</span>
                    </div>
                    <div class="dev-inspect-row">
                        <span class="dev-inspect-key">Source:</span>
                        <span class="dev-inspect-val" id="dev-track-source">—</span>
                    </div>
                    <div class="dev-inspect-row">
                        <span class="dev-inspect-key">Cache Status:</span>
                        <span class="dev-inspect-val" id="dev-track-cache-tier">—</span>
                    </div>
                    <div class="dev-inspect-row">
                        <span class="dev-inspect-key">Lines:</span>
                        <span class="dev-inspect-val" id="dev-track-lines">—</span>
                    </div>
                    <div class="dev-inspect-row">
                        <span class="dev-inspect-key">Translation:</span>
                        <span class="dev-inspect-val" id="dev-track-trans">—</span>
                    </div>
                </div>
            </div>

            <!-- SECTION 3: LYRICS SEARCH SIMULATOR -->
            <div class="control-group dev-card">
                <label class="dev-card-label" for="select-dev-simulate-search">Lyrics Search Simulator</label>
                <select id="select-dev-simulate-search" style="margin-bottom: 4px;">
                    <option value="none">Normal (Live Providers)</option>
                    <option value="force_lrclib_down">Force LRCLIB Down (Test NetEase Fallback)</option>
                    <option value="force_netease_down">Force NetEase Down (Test LRCLIB Only)</option>
                    <option value="force_all_down">Force All Search Down (Test Red ✕ Badge)</option>
                    <option value="simulate_latency">Simulate Slow Search (5s Latency)</option>
                </select>
                <span class="dev-subtext">Mocks lyrics provider responses &amp; network latency</span>
            </div>

            <!-- SECTION 4: TRANSLATION & ROMAJI CONTROLS -->
            <div class="control-group dev-card">
                <label class="dev-card-label">Translation &amp; Romaji Controls</label>
                
                <!-- DISABLE TRANSLATION TOGGLE -->
                <div class="row" style="margin-bottom: 8px;">
                    <label for="toggle-dev-disable-trans" style="display: flex; flex-direction: column; gap: 2px; margin: 0; cursor: pointer;">
                        <span style="font-size: 12px; font-weight: 600;">Disable Translation Calls</span>
                        <span class="dev-subtext">Skips network translation queries to save quotas</span>
                    </label>
                    <label class="switch">
                        <input type="checkbox" id="toggle-dev-disable-trans">
                        <span class="slider"></span>
                    </label>
                </div>

                <!-- TRANSLATION FALLBACK SIMULATOR -->
                <div style="margin-bottom: 8px;">
                    <label for="select-dev-simulate-trans" style="font-size: 11px; color: rgba(255,255,255,0.8); display: block; margin-bottom: 3px;">Simulation Mode:</label>
                    <select id="select-dev-simulate-trans" style="margin-bottom: 3px;">
                        <option value="none">Normal (Full Waterfall: Google → MyMemory → NetEase)</option>
                        <option value="force_gtrans_down">Force Google Translate Down (Test MyMemory &amp; NetEase)</option>
                        <option value="force_all_trans_down">Force All Translation Down (Test Local Offline Romaji)</option>
                    </select>
                    <span class="dev-subtext">Tests fallback tiers without disconnecting internet</span>
                </div>

                <!-- BATCH CHUNK STAGGER SELECT -->
                <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 6px;">
                    <label for="select-dev-trans-stagger" style="font-size: 11px; color: rgba(255,255,255,0.7);">Stagger Delay:</label>
                    <select id="select-dev-trans-stagger" style="width: 140px; padding: 4px 24px 4px 8px; font-size: 11px;">
                        <option value="150">150ms (Default)</option>
                        <option value="500">500ms (Safe)</option>
                        <option value="1000">1000ms (Strict)</option>
                        <option value="2000">2000ms (Heavy)</option>
                    </select>
                </div>
            </div>

            <!-- SECTION 5: ONBOARDING & REVIEW TESTING -->
            <div class="control-group dev-card">
                <label class="dev-card-label">Onboarding &amp; Tour Controls</label>
                
                <!-- SUPPRESS WELCOME & AUTO-TOUR TOGGLE -->
                <div class="row" style="margin-bottom: 10px;">
                    <label for="toggle-dev-suppress-onboarding" style="display: flex; flex-direction: column; gap: 2px; margin: 0; cursor: pointer;">
                        <span style="font-size: 12px; font-weight: 600;">Suppress Auto Welcome &amp; Tour</span>
                        <span class="dev-subtext">Prevents tab &amp; tour popups on reload</span>
                    </label>
                    <label class="switch">
                        <input type="checkbox" id="toggle-dev-suppress-onboarding" checked>
                        <span class="slider"></span>
                    </label>
                </div>

                <!-- ONBOARDING ACTION BUTTONS -->
                <div class="dev-btn-row--grid">
                    <button class="search-btn dev-action-btn" id="btn-dev-replay-tour">
                        Replay Tour
                    </button>
                    <button class="search-btn dev-action-btn" id="btn-dev-open-welcome">
                        Welcome Tab
                    </button>
                    <button class="search-btn dev-action-btn" id="btn-dev-test-review">
                        Review Toast
                    </button>
                    <button class="search-btn dev-action-btn" id="btn-dev-test-help">
                        Help Banner
                    </button>
                </div>
            </div>

            <!-- SECTION 6: RUNTIME ENVIRONMENT -->
            <div class="control-group dev-card" style="margin-bottom: 0;">
                <label class="dev-card-label">Runtime Environment</label>
                <div class="dev-inspect-grid">
                    <div class="dev-inspect-row">
                        <span class="dev-inspect-key">Host Player:</span>
                        <span class="dev-inspect-val" id="dev-env-player">Scanning...</span>
                    </div>
                    <div class="dev-inspect-row">
                        <span class="dev-inspect-key">PiP Driver:</span>
                        <span class="dev-inspect-val" id="dev-env-pip">—</span>
                    </div>
                    <div class="dev-inspect-row">
                        <span class="dev-inspect-key">Extracted Palette:</span>
                        <span class="dev-inspect-val" id="dev-env-palette" style="display: flex; align-items: center; gap: 6px;">
                            <span id="dev-palette-swatch" style="width: 12px; height: 12px; border-radius: 50%; background: var(--accent); display: inline-block; border: 1px solid rgba(255,255,255,0.4);"></span>
                            <span id="dev-palette-hex">Active Accent</span>
                        </span>
                    </div>
                </div>
            </div>
        `;

        tabContent.appendChild(devTabPane);

        // ─── 3. Bind UI Controls & Persistence ───────────────────────────────
        const toggleBypassCache = document.getElementById('toggle-dev-bypass-cache');
        const btnClearCache = document.getElementById('btn-dev-clear-cache');
        const btnForceRefetch = document.getElementById('btn-dev-force-refetch');
        const selectSimulateSearch = document.getElementById('select-dev-simulate-search');
        const selectSimulateTrans = document.getElementById('select-dev-simulate-trans');
        const toggleSuppressOnboarding = document.getElementById('toggle-dev-suppress-onboarding');
        const btnReplayTour = document.getElementById('btn-dev-replay-tour');
        const btnOpenWelcome = document.getElementById('btn-dev-open-welcome');
        const btnTestReview = document.getElementById('btn-dev-test-review');
        const btnTestHelp = document.getElementById('btn-dev-test-help');

        const toggleDisableTrans = document.getElementById('toggle-dev-disable-trans');
        const selectTransStagger = document.getElementById('select-dev-trans-stagger');

        // Initialize state from storage
        storage.get({
            devBypassCache: false,
            devSimulateSearch: 'none',
            devSimulateTrans: 'none',
            devSuppressOnboarding: true,
            devDisableTranslation: false,
            devTranslateStagger: 150,
            lyricsCache: null
        }, (items) => {
            if (toggleBypassCache) toggleBypassCache.checked = !!items.devBypassCache;
            if (selectSimulateSearch) selectSimulateSearch.value = items.devSimulateSearch || 'none';
            if (selectSimulateTrans) selectSimulateTrans.value = items.devSimulateTrans || 'none';
            if (toggleSuppressOnboarding) toggleSuppressOnboarding.checked = items.devSuppressOnboarding !== false;
            if (toggleDisableTrans) toggleDisableTrans.checked = !!items.devDisableTranslation;
            if (selectTransStagger) selectTransStagger.value = String(items.devTranslateStagger || 150);
            updateCacheButtonLabel(items.lyricsCache);
        });

        // ── Helper: Force Refetch & Diagnostics Pipeline ──
        function triggerForceRefetch(silent = false) {
            if (btnForceRefetch) {
                btnForceRefetch.disabled = true;
                btnForceRefetch.textContent = 'Refetching...';
            }
            const trackSourceEl = document.getElementById('dev-track-source');
            const trackTransEl = document.getElementById('dev-track-trans');
            const trackCacheTierEl = document.getElementById('dev-track-cache-tier');
            if (trackSourceEl) trackSourceEl.textContent = 'Refetching...';
            if (trackTransEl) trackTransEl.textContent = 'Refetching...';
            if (trackCacheTierEl) trackCacheTierEl.textContent = 'Refetching...';

            notifyTabsMessage({ type: 'FORCE_REFETCH_CURRENT' }, () => {
                setTimeout(() => {
                    if (btnForceRefetch) {
                        btnForceRefetch.disabled = false;
                        btnForceRefetch.textContent = 'Force Refetch';
                    }
                    refreshDiagnostics();
                    if (!silent) showToast('Refetched active track');
                }, 500);

                // Polling follow-up in case network translation batch takes >500ms
                setTimeout(() => {
                    refreshDiagnostics();
                }, 1800);
            });
        }

        // ── Toggle Bypass Cache ──
        if (toggleBypassCache) {
            toggleBypassCache.addEventListener('change', () => {
                const val = toggleBypassCache.checked;
                storage.set({ devBypassCache: val }, () => {
                    notifyTabs({ devBypassCache: val });
                    showToast(val ? 'Lyrics cache bypassed' : 'Lyrics cache active');
                    triggerForceRefetch(true);
                });
            });
        }

        // ── Toggle Suppress Onboarding ──
        if (toggleSuppressOnboarding) {
            toggleSuppressOnboarding.addEventListener('change', () => {
                const val = toggleSuppressOnboarding.checked;
                storage.set({ devSuppressOnboarding: val }, () => {
                    showToast(val ? 'Auto welcome/tour suppressed' : 'Auto welcome/tour enabled');
                });
            });
        }

        // ── Lyrics Search Simulator Dropdown ──
        if (selectSimulateSearch) {
            selectSimulateSearch.addEventListener('change', () => {
                const val = selectSimulateSearch.value;
                storage.set({ devSimulateSearch: val }, () => {
                    notifyTabs({ devSimulateSearch: val });
                    showToast(`Search mode: ${selectSimulateSearch.options[selectSimulateSearch.selectedIndex].text}`);
                    triggerForceRefetch(true);
                });
            });
        }

        // ── Translation & Romaji Simulator Dropdown ──
        if (selectSimulateTrans) {
            selectSimulateTrans.addEventListener('change', () => {
                const val = selectSimulateTrans.value;
                storage.set({ devSimulateTrans: val }, () => {
                    notifyTabs({ devSimulateTrans: val });
                    showToast(`Translation mode: ${selectSimulateTrans.options[selectSimulateTrans.selectedIndex].text}`);
                    triggerForceRefetch(true);
                });
            });
        }

        // ── Clear Lyrics Cache ──
        if (btnClearCache) {
            btnClearCache.addEventListener('click', () => {
                storage.remove('lyricsCache', () => {
                    notifyTabsMessage({ type: 'PURGE_LYRICS_CACHE' });
                    updateCacheButtonLabel(null);
                    showToast('Lyrics cache purged');
                    refreshDiagnostics();
                });
            });
        }

        // ── Force Refetch Active Track ──
        if (btnForceRefetch) {
            btnForceRefetch.addEventListener('click', () => {
                triggerForceRefetch(false);
            });
        }

        // ── Replay Onboarding Tour ──
        if (btnReplayTour) {
            btnReplayTour.addEventListener('click', () => {
                if (typeof popup.startTour === 'function') {
                    popup.startTour(0);
                } else {
                    storage.set({ needsOnboardingTour: true, onboardingTourStep: 0 }, () => {
                        location.reload();
                    });
                }
            });
        }

        // ── Toggle Disable Translation (Dev) ──
        if (toggleDisableTrans) {
            toggleDisableTrans.addEventListener('change', () => {
                const val = toggleDisableTrans.checked;
                storage.set({ devDisableTranslation: val }, () => {
                    notifyTabs({ devDisableTranslation: val });
                    showToast(val ? 'Translations disabled (Dev)' : 'Translations active');
                    triggerForceRefetch(true);
                });
            });
        }

        // ── Translation Chunk Stagger Delay ──
        if (selectTransStagger) {
            selectTransStagger.addEventListener('change', () => {
                const val = Number(selectTransStagger.value) || 150;
                storage.set({ devTranslateStagger: val }, () => {
                    notifyTabs({ devTranslateStagger: val });
                    showToast(`Translation stagger: ${val}ms`);
                });
            });
        }

        // ── Open Welcome Tab ──
        if (btnOpenWelcome) {
            btnOpenWelcome.addEventListener('click', () => {
                chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/welcome.html') });
            });
        }

        // ── Trigger Review Toast ──
        if (btnTestReview) {
            btnTestReview.addEventListener('click', () => {
                const toast = document.getElementById('review-toast');
                if (toast) {
                    toast.classList.remove('review-toast--visible');
                    // Reflow to retrigger animation
                    void toast.offsetWidth;
                    toast.classList.add('review-toast--visible');
                    showToast('Review toast revealed');
                }
            });
        }

        // ── Trigger Yellow Help Banner ──
        if (btnTestHelp) {
            btnTestHelp.addEventListener('click', () => {
                const helpBtn = document.getElementById('btn-open-help');
                if (helpBtn) {
                    const isHidden = helpBtn.classList.contains('hidden');
                    if (isHidden) {
                        helpBtn.classList.remove('hidden');
                        if (typeof popup.switchTab === 'function') {
                            popup.switchTab('lyrics');
                        }
                        showToast('Help banner revealed on Lyrics tab');
                    } else {
                        helpBtn.classList.add('hidden');
                        showToast('Help banner hidden');
                    }
                }
            });
        }

        // ── Helpers ──
        function updateCacheButtonLabel(cache) {
            if (!btnClearCache) return;
            const count = (cache && Array.isArray(cache.order)) ? cache.order.length : 0;
            btnClearCache.textContent = `Clear Cache (${count})`;
        }

        function showToast(msg) {
            // Re-use popup feedback toast or console log
            const starLabel = document.getElementById('star-label');
            if (starLabel) {
                const prev = starLabel.textContent;
                starLabel.textContent = msg;
                starLabel.style.color = '#ffaa00';
                setTimeout(() => {
                    starLabel.textContent = prev;
                    starLabel.style.color = '';
                }, 2000);
            }
        }

        function notifyTabs(payload) {
            chrome.tabs.query({ url: ['*://open.spotify.com/*', '*://music.youtube.com/*'] }, (tabs) => {
                tabs?.forEach(tab => {
                    if (tab.id) {
                        try {
                            chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATE', payload }, () => {
                                void chrome.runtime.lastError;
                            });
                        } catch (e) {}
                    }
                });
            });
        }

        function notifyTabsMessage(msg, cb) {
            chrome.tabs.query({ url: ['*://open.spotify.com/*', '*://music.youtube.com/*'] }, (tabs) => {
                let responded = false;
                const count = tabs?.length || 0;
                if (count === 0) {
                    if (cb) cb();
                    return;
                }
                tabs.forEach(tab => {
                    if (tab.id) {
                        try {
                            chrome.tabs.sendMessage(tab.id, msg, () => {
                                void chrome.runtime.lastError;
                                if (!responded && cb) {
                                    responded = true;
                                    cb();
                                }
                            });
                        } catch (e) {
                            if (!responded && cb) {
                                responded = true;
                                cb();
                            }
                        }
                    }
                });
            });
        }

        function refreshDiagnostics() {
            // Update cache count
            storage.get('lyricsCache', (items) => updateCacheButtonLabel(items.lyricsCache));

            // Poll active music tabs
            chrome.tabs.query({ url: ['*://open.spotify.com/*', '*://music.youtube.com/*'] }, (tabs) => {
                const playerEl = document.getElementById('dev-env-player');
                const trackNameEl = document.getElementById('dev-track-name');
                const trackSourceEl = document.getElementById('dev-track-source');
                const trackCacheTierEl = document.getElementById('dev-track-cache-tier');
                const trackLinesEl = document.getElementById('dev-track-lines');
                const trackTransEl = document.getElementById('dev-track-trans');
                const pipEl = document.getElementById('dev-env-pip');

                if (!tabs || tabs.length === 0) {
                    if (playerEl) playerEl.textContent = 'None detected';
                    if (trackNameEl) trackNameEl.textContent = 'No active music player tab';
                    if (trackSourceEl) trackSourceEl.textContent = '—';
                    if (trackCacheTierEl) trackCacheTierEl.textContent = '—';
                    if (trackLinesEl) trackLinesEl.textContent = '—';
                    if (trackTransEl) trackTransEl.textContent = '—';
                    if (pipEl) pipEl.textContent = 'Inactive';
                    return;
                }

                const activeTab = tabs.find(t => t.audible) || tabs.find(t => t.active) || tabs[0];
                const hostName = activeTab.url.includes('spotify') ? 'Spotify Web Player' : 'YouTube Music';
                if (playerEl) playerEl.textContent = `${hostName} (Tab ${activeTab.id}${activeTab.audible ? ' · Playing' : ''})`;

                chrome.tabs.sendMessage(activeTab.id, { type: 'GET_CURRENT_TRACK' }, (res) => {
                    if (chrome.runtime.lastError || !res || res.error) {
                        if (trackNameEl) trackNameEl.textContent = 'No track playing';
                        if (trackSourceEl) trackSourceEl.textContent = '—';
                        if (trackCacheTierEl) trackCacheTierEl.textContent = '—';
                        if (trackLinesEl) trackLinesEl.textContent = '—';
                        if (trackTransEl) trackTransEl.textContent = '—';
                        return;
                    }

                    try {
                        const trackKey = `${res.artist} - ${res.title}`;
                        if (trackNameEl) trackNameEl.textContent = trackKey;

                        let sourceStr = 'NONE';
                        const rawSource = res.lyricSource;
                        if (typeof rawSource === 'string') {
                            sourceStr = rawSource;
                        } else if (rawSource && typeof rawSource === 'object') {
                            sourceStr = rawSource.provider || rawSource.type || rawSource.name || 'UNKNOWN';
                        }
                        sourceStr = String(sourceStr || 'NONE').toUpperCase();

                        if (trackSourceEl) {
                            trackSourceEl.textContent = sourceStr;
                            if (sourceStr.includes('NETEASE')) {
                                trackSourceEl.style.color = '#ffaa00';
                            } else if (sourceStr.includes('LRCLIB')) {
                                trackSourceEl.style.color = '#38bdf8';
                            } else if (sourceStr.includes('LOCAL')) {
                                trackSourceEl.style.color = '#a855f7';
                            } else {
                                trackSourceEl.style.color = '#888';
                            }
                        }

                        if (trackLinesEl) {
                            trackLinesEl.textContent = res.lineCount ? `${res.lineCount} lines (${res.isSynced ? 'Synced' : 'Plain'})` : 'None';
                        }

                        if (trackTransEl) {
                            trackTransEl.textContent = res.translationTier || '—';
                            if (res.translationTier === 'Translating...' || res.translationTier === 'Refetching...') {
                                trackTransEl.style.color = '#e2e8f0';
                            } else if (res.translationTier?.includes('Tier 1') || res.translationTier?.includes('Google')) {
                                trackTransEl.style.color = '#38bdf8';
                            } else if (res.translationTier?.includes('MyMemory') || res.translationTier?.includes('NetEase')) {
                                trackTransEl.style.color = '#ffaa00';
                            } else if (res.translationTier?.includes('Romaji') || res.translationTier?.includes('Offline')) {
                                trackTransEl.style.color = '#a855f7';
                            } else if (res.translationTier?.includes('Disabled')) {
                                trackTransEl.style.color = '#ef4444';
                            } else {
                                trackTransEl.style.color = '#888';
                            }
                        }

                        storage.get('lyricsCache', ({ lyricsCache }) => {
                            const inStorage = !!(lyricsCache?.entries?.[trackKey]);
                            if (trackCacheTierEl) {
                                if (inStorage) {
                                    trackCacheTierEl.textContent = 'HIT: Tier 2 (Persistent)';
                                    trackCacheTierEl.style.color = '#38bdf8';
                                } else if (res.isCached) {
                                    trackCacheTierEl.textContent = 'HIT: Tier 1 (Memory)';
                                    trackCacheTierEl.style.color = '#fbbf24';
                                } else {
                                    trackCacheTierEl.textContent = 'Live / Not Cached';
                                    trackCacheTierEl.style.color = '#4ade80';
                                }
                            }
                        });
                    } catch (err) {
                        console.warn('[Flying Lyrics:Dev] Diagnostic render error:', err);
                    }
                });

                chrome.tabs.sendMessage(activeTab.id, { type: 'IS_PIP_OPEN' }, (res) => {
                    if (pipEl) {
                        pipEl.textContent = res?.isOpen ? 'Active (Open)' : 'Inactive (Closed)';
                        pipEl.style.color = res?.isOpen ? '#4ade80' : '#888';
                    }
                });
            });

            // Update palette preview
            storage.get('currentVibrantColor', (items) => {
                const hexEl = document.getElementById('dev-palette-hex');
                const swatchEl = document.getElementById('dev-palette-swatch');
                if (items.currentVibrantColor && hexEl && swatchEl) {
                    hexEl.textContent = items.currentVibrantColor;
                    swatchEl.style.backgroundColor = items.currentVibrantColor;
                }
            });
        }

        // ── Active Tab Poller Lifecycle ──
        let devPollInterval = null;
        function startDevPolling() {
            if (devPollInterval) clearInterval(devPollInterval);
            refreshDiagnostics();
            devPollInterval = setInterval(refreshDiagnostics, 2500);
        }
        function stopDevPolling() {
            if (devPollInterval) {
                clearInterval(devPollInterval);
                devPollInterval = null;
            }
        }

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.tab === 'dev') {
                    startDevPolling();
                } else {
                    stopDevPolling();
                }
            });
        });

        // Initial setup & start polling if dev tab is currently visible
        if (devTabBtn.classList.contains('active') || document.getElementById('tab-dev')?.classList.contains('active')) {
            startDevPolling();
        } else {
            refreshDiagnostics();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDevTools);
    } else {
        initDevTools();
    }
})();
