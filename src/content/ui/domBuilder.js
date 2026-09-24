(() => {
    const fl = window.FLYING_LYRICS;

    // ─────────────────────────────────────────────────────────────────────────────
    //  FLYING LYRICS — PIP DOM BUILDER & SVG ASSETS (content UI context)
    // ─────────────────────────────────────────────────────────────────────────────

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

        // Inject Google Font Fredoka stylesheet
        const fontLink = doc.createElement('link');
        fontLink.rel = 'stylesheet';
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Fredoka:wght@300;400;500;600;700&display=swap';
        doc.head.appendChild(fontLink);

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

        /* 4. FAILED (Red theme - applied when 30s background retry search fails) */
        #sync-indicator.is-failed {
            color: #FEE2E2;
            border-color: rgba(239, 68, 68, 0.35);
        }
        #sync-indicator.is-failed .sync-dot {
            width: auto;
            height: auto;
            background-color: transparent;
            border-radius: 0;
            color: #EF4444;
            font-size: 8px;
            font-weight: 900;
            line-height: 1;
            box-shadow: none;
            display: inline-block;
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
        }).catch(() => {});
    };

})();
