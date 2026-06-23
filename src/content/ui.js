(() => {
    const fl = window.FLYING_LYRICS;

    // --- ICONS (SVG STRINGS) ---
    const ICON_PREV = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 20L9 12l10-8v16zM5 19V5"/></svg>`;
    const ICON_NEXT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4l10 8-10 8V4zM19 5v14"/></svg>`;
    const ICON_PLAY = `<svg viewBox="0 0 25 27" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="butt" stroke-linejoin="round"><path d="M20.1,11.2 C21.5,12 21.5,13.9 20.1,14.7 L5.9,22.9 C4.6,23.7 2.9,22.7 2.9,21.2 L2.9,4.7 C2.9,3.2 4.6,2.2 5.9,3 L20.1,11.2 Z"/></svg>`;
    const ICON_PAUSE = `<svg viewBox="0 0 27 29" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="butt" stroke-linejoin="miter"><rect x="2.7" y="2.3" width="6.8" height="23.2" rx="3.4"/><rect x="16.5" y="2.3" width="6.8" height="23.2" rx="3.4"/></svg>`;
    const ICON_VOL_HIGH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
    const ICON_VOL_MUTE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;
    const ICON_CC = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" ry="2"></rect><path d="M10 9.5a2 2 0 0 0 -2 2v1a2 2 0 0 0 2 2"></path><path d="M16 9.5a2 2 0 0 0 -2 2v1a2 2 0 0 0 2 2"></path></svg>`;

    fl.ICON_PLAY = ICON_PLAY;
    fl.ICON_PAUSE = ICON_PAUSE;
    fl.ICON_VOL_HIGH = ICON_VOL_HIGH;
    fl.ICON_VOL_MUTE = ICON_VOL_MUTE;

    fl.injectStructure = function () {
        const startTime = performance.now();
        if (!fl.pipWin) return;
        const doc = fl.pipWin.document;

        // Build structure using document.createElement for XSS security
        const bgCover = doc.createElement('div');
        bgCover.id = 'bg-cover';

        const bgDarkness = doc.createElement('div');
        bgDarkness.id = 'bg-darkness';

        const centerArt = doc.createElement('img');
        centerArt.id = 'center-art';
        centerArt.alt = '';

        const lyricCanvas = doc.createElement('canvas');
        lyricCanvas.id = 'lyricCanvas';

        const backBtn = doc.createElement('button');
        backBtn.id = 'back-btn';
        backBtn.textContent = '⤺ Back to tab';

        // UI Container Area
        const uiContainer = doc.createElement('div');
        uiContainer.id = 'ui-container';

        const seekerContainer = doc.createElement('div');
        seekerContainer.id = 'seeker-container';
        seekerContainer.style.display = 'none';
        const seekerBar = doc.createElement('div');
        seekerBar.id = 'seeker-bar';
        const seekerTooltip = doc.createElement('div');
        seekerTooltip.id = 'seeker-tooltip';
        seekerContainer.append(seekerBar);

        const controls = doc.createElement('div');
        controls.id = 'controls';

        const muteBtn = doc.createElement('button');
        muteBtn.className = 'btn';
        muteBtn.id = 'mute-btn';
        muteBtn.innerHTML = ICON_VOL_HIGH;

        const divSpace1 = doc.createElement('div');
        divSpace1.style.width = '0px';

        const prevBtn = doc.createElement('button');
        prevBtn.className = 'btn';
        prevBtn.id = 'prev';
        prevBtn.innerHTML = ICON_PREV;

        const playBtn = doc.createElement('button');
        playBtn.className = 'btn';
        playBtn.id = 'playpause';
        playBtn.innerHTML = ICON_PAUSE;

        const nextBtn = doc.createElement('button');
        nextBtn.className = 'btn';
        nextBtn.id = 'next';
        nextBtn.innerHTML = ICON_NEXT;

        const divSpace2 = doc.createElement('div');
        divSpace2.style.width = '0px';

        const ccBtn = doc.createElement('button');
        ccBtn.className = 'btn';
        ccBtn.id = 'cc-btn';
        ccBtn.title = 'Translate Lyrics';
        ccBtn.innerHTML = ICON_CC;

        controls.append(muteBtn, divSpace1, prevBtn, playBtn, nextBtn, divSpace2, ccBtn);
        uiContainer.append(seekerContainer, controls);

        // Sync Indicator
        const syncIndicator = doc.createElement('div');
        syncIndicator.id = 'sync-indicator';

        const syncDot = doc.createElement('div');
        syncDot.className = 'sync-dot';

        const syncSpinner = doc.createElement('div');
        syncSpinner.className = 'sync-spinner';

        const syncText = doc.createElement('span');
        syncText.id = 'sync-text';
        syncText.textContent = 'UNSYNCED';

        syncIndicator.append(syncDot, syncSpinner, syncText);

        // Size Warning
        const sizeWarning = doc.createElement('div');
        sizeWarning.id = 'size-warning';

        const warningPill = doc.createElement('div');
        warningPill.className = 'warning-pill';
        const warningSpan = doc.createElement('span');
        warningSpan.textContent = 'Window too small';
        warningPill.appendChild(warningSpan);

        const warningSub = doc.createElement('div');
        warningSub.className = 'warning-subtext';
        warningSub.textContent = 'Please resize the window to view lyrics properly.';

        sizeWarning.append(warningPill, warningSub);

        // Inject Styles
        const styleEl = doc.createElement('style');
        styleEl.textContent = `
        #bg-darkness {
            position: absolute;
            inset: 0;
            background: #000;
            opacity: ${fl.userBgDarkness / 100};
            z-index: 2;
            pointer-events: none;
            transition: opacity 0.4s ease;
        }
        #back-btn {
            position: absolute; top: 15px; left: 15px;
            background: rgba(255,255,255,0.2); border: none;
            color: white; padding: 8px 15px; border-radius: 20px;
            font-weight: bold; cursor: pointer; backdrop-filter: blur(5px);
            font-family: 'Noto Sans', 'Segoe UI', sans-serif; opacity: 0; transition: opacity 0.2s;
            z-index: 20; transform: scale(0.7); transform-origin: top left;
        }
        body:hover #back-btn { opacity: 1; }
        #back-btn:hover { background: rgba(255,255,255,0.4); }

        #sync-indicator {
            position: absolute; top: 15px; right: 15px; z-index: 20;
            display: flex; align-items: center; gap: 6px;
            background: rgba(18, 18, 18, 0.75); backdrop-filter: blur(4px);
            border: 1px solid rgba(255, 255, 255, 0.1); padding: 4px 8px;
            border-radius: 4px; font-size: 10px; font-weight: 700;
            letter-spacing: 0.5px; color: rgba(255, 255, 255, 0.7);
            transition: all 0.3s ease; user-select: none;
            transform: scale(0.6); transform-origin: top right;
        }
        .sync-dot {
            width: 6px; height: 6px; border-radius: 50%;
            background-color: #94A3B8; box-shadow: 0 0 0px transparent;
            transition: all 0.3s ease;
        }
        .sync-spinner {
            width: 6px; height: 6px; border-radius: 50%;
            border: 1.5px solid rgba(148, 163, 184, 0.2);
            border-top-color: #94A3B8;
            animation: spin 0.8s linear infinite;
            display: none;
        }
        #sync-indicator.is-retrying .sync-spinner {
            display: block;
        }
        #sync-indicator.is-retrying .sync-dot {
            display: none;
        }

        /* 1. SYNCED */
        #sync-indicator.is-synced {
            color: #E6F4EA;
            border-color: rgba(16, 185, 129, 0.25);
        }
        #sync-indicator.is-synced .sync-dot {
            background-color: #10B981;
            box-shadow: 0 0 8px rgba(16, 185, 129, 0.5);
        }
        #sync-indicator.is-synced .sync-spinner {
            border-color: rgba(16, 185, 129, 0.2);
            border-top-color: #10B981;
        }

        /* 2. SEARCHING (Cyan theme - applied when missing lyrics AND retrying) */
        #sync-indicator.is-missing.is-retrying {
            color: #E0F7FA;
            border-color: rgba(0, 210, 255, 0.35);
        }
        #sync-indicator.is-missing.is-retrying .sync-spinner {
            border-color: rgba(0, 210, 255, 0.2);
            border-top-color: #00D2FF;
        }

        /* 3. NO LYRICS (Amber theme - applied when missing lyrics and NOT retrying) */
        #sync-indicator.is-missing:not(.is-retrying) {
            color: #FEF3C7;
            border-color: rgba(245, 158, 11, 0.25);
        }
        #sync-indicator.is-missing:not(.is-retrying) .sync-dot {
            background-color: #F59E0B;
            box-shadow: 0 0 6px rgba(245, 158, 11, 0.4);
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        @keyframes lyric-glow {
            0%   { text-shadow: 0 0 8px currentColor, 0 0 16px currentColor; }
            50%  { text-shadow: 0 0 24px currentColor, 0 0 40px currentColor, 0 0 6px #fff; }
            100% { text-shadow: 0 0 8px currentColor, 0 0 16px currentColor; }
        }
    `;

        doc.body.replaceChildren(bgCover, bgDarkness, centerArt, lyricCanvas, backBtn, uiContainer, syncIndicator, sizeWarning, seekerTooltip);
        doc.head.appendChild(styleEl);

        // Get active platform adapter (if any)
        const adapter = fl.getActiveAdapter?.();

        prevBtn.addEventListener('click', () => {
            if (adapter) {
                adapter.clickPrev();
            } else {
                document.querySelector('[data-testid="control-button-skip-back"], .previous-button')?.click();
            }
        });

        nextBtn.addEventListener('click', () => {
            if (adapter) {
                adapter.clickNext();
            } else {
                document.querySelector('[data-testid="control-button-skip-forward"], .next-button')?.click();
            }
        });

        playBtn.addEventListener('click', () => {
            if (adapter) {
                adapter.clickPlayPause();
            } else {
                document.querySelector('[data-testid="control-button-playpause"], .play-pause-button')?.click();
            }
        });

        backBtn.addEventListener('click', () => {
            chrome.runtime.sendMessage({ type: 'FOCUS_TAB' });
            fl.pipWin.close();
        });

        const toggleMute = () => {
            if (adapter) {
                adapter.toggleMute();
            } else {
                const media = fl.queryMedia('video, audio');
                if (media) media.muted = !media.muted;
            }
        };
        muteBtn.addEventListener('click', toggleMute);

        ccBtn.addEventListener('click', () => {
            fl.showTranslation = !fl.showTranslation;
            FLYING_LYRICS.storage.set({ showTranslation: fl.showTranslation });
            fl.updateCCButtonState();
            if (typeof fl.needsLayoutUpdate !== 'undefined') fl.needsLayoutUpdate = true;
            if (fl.showTranslation && typeof fl.translateExistingLyrics === 'function') {
                fl.translateExistingLyrics();
            }
        });

        fl.updateCCButtonState(); // Init state

        seekerContainer.addEventListener('click', (e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;

            if (adapter) {
                adapter.seek(percent);
            } else {
                const p = fl.queryMedia('video, audio');
                if (p && p.duration > 0) {
                    p.currentTime = percent * p.duration;
                }
            }
        });

        seekerContainer.addEventListener('mousemove', (e) => {
            const rect = seekerContainer.getBoundingClientRect();
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

            const state = fl.getPlayerState();
            const hoverTime = percent * state.duration;
            seekerTooltip.textContent = fl.formatTime(hoverTime);

            // Position relative to body to bypass ui-container's CSS fade mask
            const winW = fl.pipWin.innerWidth;
            const winH = fl.pipWin.innerHeight;
            const targetX = rect.left + (percent * rect.width);
            const tooltipWidth = seekerTooltip.offsetWidth || 35;
            const clampedX = Math.max(tooltipWidth / 2, Math.min(winW - tooltipWidth / 2, targetX));

            seekerTooltip.style.left = `${clampedX}px`;
            seekerTooltip.style.bottom = `${winH - rect.top + 6}px`;
            seekerTooltip.style.opacity = '1';
        });

        seekerContainer.addEventListener('mouseleave', () => {
            seekerTooltip.style.opacity = '0';
        });

        const injectDuration = Math.round(performance.now() - startTime);
        chrome.runtime.sendMessage({
            type: 'TRACK_EVENT',
            payload: {
                eventName: 'processing_duration',
                params: { render_time_ms: injectDuration }
            }
        });
    }

    fl.updateCCButtonState = function () {
        if (!fl.pipWin || fl.activePipType === 'video') return;
        const btn = fl.pipWin.document.getElementById('cc-btn');
        if (btn) {
            if (fl.showTranslation) {
                btn.classList.add('cc-active');
            } else {
                btn.classList.remove('cc-active');
            }
        }
    }

    fl.updateSyncIndicator = function () {
        if (!fl.pipWin || fl.activePipType === 'video') return;
        const ind = fl.pipWin.document.getElementById('sync-indicator');
        const txt = fl.pipWin.document.getElementById('sync-text');
        if (ind && txt) {
            // Apply retrying state based on global flag
            if (fl.isRetrying) {
                ind.classList.add('is-retrying');
            } else {
                ind.classList.remove('is-retrying');
            }

            // Priority order: missing > synced > unsynced
            if (fl.isMissingLyrics) {
                ind.classList.remove('is-synced');
                ind.classList.add('is-missing');
                const isRetrying = ind.classList.contains('is-retrying');
                ind.title = isRetrying
                    ? 'No lyrics found for this track (Retrying...)'
                    : 'No lyrics found for this track';
                txt.textContent = isRetrying ? 'SEARCHING' : 'NO LYRICS';
            } else {
                if (fl.isCurrentLyricSynced) {
                    ind.classList.remove('is-missing');
                    ind.classList.add('is-synced');
                    ind.title = 'These lyrics have timestamp data';
                    txt.textContent = 'SYNCED';
                } else {
                    ind.classList.remove('is-synced', 'is-missing');
                    ind.title = 'These lyrics are missing timestamps and are roughly estimated';
                    txt.textContent = 'UNSYNCED';
                }
            }
        }
    }

    fl.setIndicatorRetrying = function (isRetrying) {
        fl.isRetrying = isRetrying; // Persist for video PiP canvas renderer
        if (!fl.pipWin || fl.activePipType === 'video') return;
        const ind = fl.pipWin.document.getElementById('sync-indicator');
        if (ind) {
            if (isRetrying) {
                ind.classList.add('is-retrying');
            } else {
                ind.classList.remove('is-retrying');
            }
            // Trigger update of sync indicator to update title/text appropriately
            fl.updateSyncIndicator();
        }
    }

    fl.applyVisualSettings = function () {
        if (!fl.pipWin || fl.pipWin.closed) return;
        const targetDoc = fl.activePipType === 'video' ? document : fl.pipWin.document;

        if (fl.activePipType !== 'video') {
            const bgCover = targetDoc.getElementById('bg-cover');
            const centerArt = targetDoc.getElementById('center-art');

            // When lyrics are missing OR the user has explicitly enabled Album Cover Mode,
            // force Cover Album Mode: override to centered art with no blur and no darkening.
            const isAlbumCoverForced = fl.isMissingLyrics || fl.albumCoverMode;
            const effectiveCoverMode = isAlbumCoverForced ? 'centered' : fl.userCoverMode;
            const blurPx = isAlbumCoverForced ? 0 : fl.userBgBlur;
            const effectiveDarkness = isAlbumCoverForced ? 0 : fl.userBgDarkness;

            if (effectiveCoverMode === 'centered') {
                if (bgCover) {
                    bgCover.style.display = '';
                    bgCover.style.backgroundSize = '';
                    bgCover.style.backgroundRepeat = '';
                    bgCover.style.backgroundPosition = '';
                    bgCover.style.filter = `blur(${blurPx}px)`;
                }

                if (centerArt) {
                    // We rely on updateCenteredArt() to add '.visible' so it doesn't show a broken image if empty
                    centerArt.style.filter = `drop-shadow(0 8px 32px rgba(0,0,0,0.65)) drop-shadow(0 2px 8px rgba(0,0,0,0.45)) blur(${blurPx}px)`;
                }

                const artUrl = fl.getCoverArt();
                // Only apply palette gradient if art has actually been extracted (not the default palette)
                if (artUrl && fl.lastExtractedArt && fl.currentPalette && fl.currentPalette.vibrant) {
                    const rawColor = fl.currentPalette.raw || fl.currentPalette.vibrant;
                    const baseBg = fl.deriveDarkBg(rawColor);
                    const topBg = fl.deriveLightBg(rawColor);
                    if (bgCover) bgCover.style.background = `linear-gradient(180deg, ${topBg} 0%, ${baseBg} 100%)`;
                } else {
                    if (bgCover) {
                        const isWaiting = fl.lyricLines && fl.lyricLines.length === 1 && 
                                          (fl.lyricLines[0].text === "Waiting for music..." || fl.lyricLines[0].isWaitingPlaceholder);
                        if (isWaiting) {
                            bgCover.style.background = '';
                        } else {
                            bgCover.style.background = '#121212';
                        }
                    }
                }

                targetDoc.body.style.background = '';
                fl.updateCenteredArt(artUrl);

            } else {
                if (bgCover) {
                    bgCover.style.display = '';
                    if (effectiveCoverMode === 'repeated') {
                        bgCover.style.backgroundSize = '400px 400px';
                        bgCover.style.backgroundRepeat = 'repeat';
                        bgCover.style.backgroundPosition = 'center';
                    } else {
                        bgCover.style.backgroundSize = 'cover';
                        bgCover.style.backgroundRepeat = 'no-repeat';
                        bgCover.style.backgroundPosition = 'center';
                    }
                    bgCover.style.filter = `blur(${blurPx}px)`;
                }

                if (centerArt) {
                    centerArt.classList.remove('visible');
                }
                targetDoc.body.style.background = '';
            }

            const bgDark = targetDoc.getElementById('bg-darkness');
            if (bgDark) {
                bgDark.style.opacity = String(effectiveDarkness / 100);
            }
        }

        const systemFontNames = ['noto sans', 'segoe ui', 'sans-serif', 'arial', 'helvetica', 'serif', 'monospace'];
        const primaryFont = fl.userFontFamily.split(',')[0].replace(/['"/]/g, '').trim().toLowerCase();
        const isSystemFont = systemFontNames.some(sf => primaryFont.includes(sf));

        targetDoc.querySelectorAll('link[data-fl-font]').forEach(el => el.remove());

        if (!isSystemFont) {
            const formattedFontName = fl.userFontFamily.split(',')[0].replace(/['"/]/g, '').trim().replace(/ /g, '+');
            const fontLink = targetDoc.createElement('link');
            fontLink.rel = 'stylesheet';
            fontLink.dataset.flFont = '1';
            fontLink.href = `https://fonts.googleapis.com/css2?family=${formattedFontName}:ital,wght@0,400;0,600;0,700;1,600&display=swap`;
            targetDoc.head.appendChild(fontLink);
        }

        if (typeof fl.needsLayoutUpdate !== 'undefined') fl.needsLayoutUpdate = true;
    }

    fl.deriveDarkBg = function (vibrantColorStr) {
        if (!vibrantColorStr) return '#121212';
        const match = vibrantColorStr.match(/\d+/g);
        if (!match || match.length < 3) return '#121212';
        const [r, g, b] = match.map(Number);
        const hsl = fl.rgbToHsl(r, g, b);
        // If the cover is essentially monochromatic (B&W), skip colorizing
        if (hsl.s < 0.17) return '#1e1e1e';
        return fl.hslToRgb(hsl.h, Math.max(hsl.s, 0.20), 0.40);
    }

    fl.deriveLightBg = function (vibrantColorStr) {
        if (!vibrantColorStr) return '#2a2a2a';
        const match = vibrantColorStr.match(/\d+/g);
        if (!match || match.length < 3) return '#2a2a2a';
        const [r, g, b] = match.map(Number);
        const hsl = fl.rgbToHsl(r, g, b);
        // If the cover is essentially monochromatic (B&W), skip colorizing
        if (hsl.s < 0.17) return '#3a3a3a';
        return fl.hslToRgb(hsl.h, Math.max(hsl.s, 0.15), 0.60);
    }

    fl.updateCenteredArt = function (artUrl) {
        // Allow centered art to render when the user has chosen 'centered' mode
        // OR when we are in forced Cover Album Mode (missing lyrics or explicit albumCoverMode).
        const isCenteredActive = fl.userCoverMode === 'centered' || fl.isMissingLyrics || fl.albumCoverMode;
        if (!fl.pipWin || fl.pipWin.closed || fl.activePipType === 'video') return;

        const img = fl.pipWin.document.getElementById('center-art');
        if (!img) return;

        if (!isCenteredActive) {
            // We're back in FILL/REPEAT mode — ensure centered art is hidden
            // so it doesn't bleed through behind the background cover.
            img.src = '';
            img.classList.remove('visible');
            return;
        }

        if (artUrl) {
            img.src = artUrl;
            img.classList.add('visible');
        } else {
            // Set src to empty string instead of removeAttribute — prevents broken image icon
            img.src = '';
            img.classList.remove('visible');
        }

        const mySessionId = fl.pipSessionId;
        setTimeout(() => {
            if (!fl.pipWin || fl.pipWin.closed) return;
            if (mySessionId !== fl.pipSessionId) return; // Reject stale sessions
            // Re-evaluate: mode may have changed by the time the timeout fires
            if (!(fl.userCoverMode === 'centered' || fl.isMissingLyrics || fl.albumCoverMode)) return;
            
            const bgCover = fl.pipWin.document.getElementById('bg-cover');
            if (bgCover) {
                // Only apply palette-based gradient if there is actual art playing
                if (artUrl && fl.lastExtractedArt && fl.currentPalette && fl.currentPalette.vibrant) {
                    const rawColor = fl.currentPalette.raw || fl.currentPalette.vibrant;
                    const baseBg = fl.deriveDarkBg(rawColor);
                    const topBg = fl.deriveLightBg(rawColor);
                    bgCover.style.background = `linear-gradient(180deg, ${topBg} 0%, ${baseBg} 100%)`;
                } else {
                    bgCover.style.background = '#121212';
                }
            }
            fl.pipWin.document.body.style.background = '';
        }, 0);
    }

    fl.createLauncher = function () {
        const host = window.location.hostname;
        const isSpotify = host.includes('spotify');
        const isYTM = host.includes('music.youtube');

        if (!isSpotify && !isYTM) return;
        if (document.getElementById('pip-trigger')) return;

        const btn = document.createElement('button');
        btn.id = 'pip-trigger';

        btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 10px; height: 10px; flex-shrink: 0;">
            <path d="M9 18V5l12-2v13"></path>
            <circle cx="6" cy="18" r="3"></circle>
            <circle cx="18" cy="16" r="3"></circle>
        </svg>
        <span style="white-space: nowrap;">FLYING LYRICS</span>
    `;

        Object.assign(btn.style, {
            zIndex: 99999,
            padding: '3px 8px', background: '#1DB954', color: '#fff',
            border: 'none', borderRadius: '50px', cursor: 'pointer',
            fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            display: 'flex', alignItems: 'center', gap: '4px',
            fontSize: '9px', transition: 'transform 0.1s ease, background 0.2s ease'
        });

        btn.onmouseover = () => btn.style.background = '#1ed760';
        btn.onmouseout = () => btn.style.background = '#1DB954';
        btn.onmousedown = () => btn.style.transform = 'scale(0.98)';
        btn.onmouseup = () => btn.style.transform = 'scale(1)';

        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await fl.launchPip();
        });

        if (isSpotify) {
            Object.assign(btn.style, {
                marginRight: '8px',
                marginBottom: '33px',
                height: '20px'
            });

            const injectSpotify = () => {
                if (document.getElementById('pip-trigger')) return;

                const rightControls = document.querySelector('.main-nowPlayingBar-right') ||
                    document.querySelector('[data-testid="now-playing-widget"]') ||
                    document.querySelector('.volume-bar')?.parentElement;

                if (rightControls) {
                    rightControls.insertBefore(btn, rightControls.firstChild);
                } else {
                    Object.assign(btn.style, {
                        position: 'fixed', bottom: '46px', right: '20px'
                    });
                    document.body.appendChild(btn);
                }
            };

            injectSpotify();

            const observer = new MutationObserver(() => {
                if (!document.getElementById('pip-trigger')) {
                    injectSpotify();
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });

        } else if (isYTM) {
            Object.assign(btn.style, {
                position: 'fixed',
                top: '80px',
                right: '20px'
            });
            document.body.appendChild(btn);
        }

        if (fl.pipMode === 'video' && typeof fl.prepareVideoPip === 'function') {
            fl.prepareVideoPip();
        }
    };

    // Global auto-launch click listener
    document.addEventListener('click', () => {
        if (fl.autoLaunch && !fl.hasAutoLaunched && (!fl.pipWin || fl.pipWin.closed)) {
            const btn = document.getElementById('pip-trigger');
            if (btn) {
                btn.click();
            }
        }
    });
})();
