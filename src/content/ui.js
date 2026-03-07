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
        const seekerBar = doc.createElement('div');
        seekerBar.id = 'seeker-bar';
        seekerContainer.appendChild(seekerBar);

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

        const syncText = doc.createElement('span');
        syncText.id = 'sync-text';
        syncText.textContent = 'UNSYNCED';

        syncIndicator.append(syncDot, syncText);

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
            background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(4px);
            border: 1px solid rgba(255, 255, 255, 0.1); padding: 4px 8px;
            border-radius: 4px; font-size: 10px; font-weight: 700;
            letter-spacing: 0.5px; color: rgba(255, 255, 255, 0.7);
            transition: all 0.3s ease; user-select: none;
            transform: scale(0.6); transform-origin: top right;
        }
        .sync-dot {
            width: 6px; height: 6px; border-radius: 50%;
            background-color: #555; box-shadow: 0 0 0px transparent;
            transition: all 0.3s ease;
        }
        #sync-indicator.is-synced .sync-dot {
            background-color: #1DB954; box-shadow: 0 0 6px rgba(29, 185, 84, 0.6);
        }
        #sync-indicator.is-synced {
            color: rgba(255, 255, 255, 0.9); border-color: rgba(29, 185, 84, 0.3);
        }
        @keyframes lyric-glow {
            0%   { text-shadow: 0 0 8px currentColor, 0 0 16px currentColor; }
            50%  { text-shadow: 0 0 24px currentColor, 0 0 40px currentColor, 0 0 6px #fff; }
            100% { text-shadow: 0 0 8px currentColor, 0 0 16px currentColor; }
        }
    `;

        doc.body.replaceChildren(bgCover, bgDarkness, centerArt, lyricCanvas, backBtn, uiContainer, syncIndicator, sizeWarning);
        doc.head.appendChild(styleEl);

        // Attach native event listeners directly
        const click = (sel) => document.querySelector(sel)?.click();

        prevBtn.addEventListener('click', () => click('[data-testid="control-button-skip-back"], .previous-button'));
        nextBtn.addEventListener('click', () => click('[data-testid="control-button-skip-forward"], .next-button'));
        playBtn.addEventListener('click', () => click('[data-testid="control-button-playpause"], .play-pause-button'));

        backBtn.addEventListener('click', () => {
            chrome.runtime.sendMessage({ type: 'FOCUS_TAB' });
            fl.pipWin.close();
        });

        const toggleMute = () => {
            const host = window.location.hostname;
            if (host.includes('spotify.com')) {
                const spotifyMuteBtn = document.querySelector('[data-testid="volume-bar-toggle-mute-button"]');
                if (spotifyMuteBtn) {
                    spotifyMuteBtn.click();
                    return;
                }
            }
            const media = document.querySelector('video, audio');
            if (media) media.muted = !media.muted;
        };
        muteBtn.addEventListener('click', toggleMute);

        ccBtn.addEventListener('click', () => {
            fl.showTranslation = !fl.showTranslation;
            chrome.storage.local.set({ showTranslation: fl.showTranslation });
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

            const p = document.querySelector('video, audio');
            if (p && p.duration > 0) {
                p.currentTime = percent * p.duration;
            }

            const spotifyProgressBar = document.querySelector('[data-testid="progress-bar"]');
            if (spotifyProgressBar) {
                const spRect = spotifyProgressBar.getBoundingClientRect();
                const targetX = spRect.left + (percent * spRect.width);
                const targetY = spRect.top + (spRect.height / 2);

                const pointerDown = new PointerEvent('pointerdown', {
                    bubbles: true, cancelable: true,
                    clientX: targetX, clientY: targetY, pointerId: 1, pointerType: 'mouse'
                });
                spotifyProgressBar.dispatchEvent(pointerDown);

                const pointerUp = new PointerEvent('pointerup', {
                    bubbles: true, cancelable: true,
                    clientX: targetX, clientY: targetY, pointerId: 1, pointerType: 'mouse'
                });
                spotifyProgressBar.dispatchEvent(pointerUp);
            }
        });
    }

    fl.updateCCButtonState = function () {
        if (!fl.pipWin) return;
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
        if (!fl.pipWin) return;
        const ind = fl.pipWin.document.getElementById('sync-indicator');
        const txt = fl.pipWin.document.getElementById('sync-text');
        if (ind && txt) {
            if (fl.isCurrentLyricSynced) {
                ind.classList.add('is-synced');
                ind.title = 'These lyrics have timestamp data';
                txt.textContent = 'SYNCED';
            } else {
                ind.classList.remove('is-synced');
                ind.title = 'These lyrics are missing timestamps and are roughly estimated';
                txt.textContent = 'UNSYNCED';
            }
        }
    }

    fl.applyVisualSettings = function () {
        if (!fl.pipWin || fl.pipWin.closed) return;
        const doc = fl.pipWin.document;

        const bgCover = doc.getElementById('bg-cover');
        const centerArt = doc.getElementById('center-art');
        const blurPx = fl.userBgBlur;

        if (fl.userCoverMode === 'centered') {
            if (bgCover) bgCover.style.display = 'none';

            if (centerArt) {
                // We rely on updateCenteredArt() to add '.visible' so it doesn't show a broken image if empty
                centerArt.style.filter = `drop-shadow(0 8px 32px rgba(0,0,0,0.65)) drop-shadow(0 2px 8px rgba(0,0,0,0.45)) blur(${blurPx}px)`;
            }

            const artUrl = fl.getCoverArt();
            if (artUrl && fl.currentPalette && fl.currentPalette.vibrant) {
                const baseBg = fl.deriveDarkBg(fl.currentPalette.vibrant);
                const topBg = fl.deriveLightBg(fl.currentPalette.vibrant);
                doc.body.style.background = `linear-gradient(180deg, ${topBg} 0%, ${baseBg} 100%)`;
            } else {
                doc.body.style.background = '#121212';
            }

            fl.updateCenteredArt(artUrl);

        } else {
            if (bgCover) {
                bgCover.style.display = '';
                if (fl.userCoverMode === 'repeated') {
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
            doc.body.style.background = '';
        }

        const bgDark = doc.getElementById('bg-darkness');
        if (bgDark) {
            bgDark.style.opacity = String(fl.userBgDarkness / 100);
        }

        const systemFontNames = ['noto sans', 'segoe ui', 'sans-serif', 'arial', 'helvetica', 'serif', 'monospace'];
        const primaryFont = fl.userFontFamily.split(',')[0].replace(/['"/]/g, '').trim().toLowerCase();
        const isSystemFont = systemFontNames.some(sf => primaryFont.includes(sf));

        doc.querySelectorAll('link[data-fl-font]').forEach(el => el.remove());

        if (!isSystemFont) {
            const formattedFontName = fl.userFontFamily.split(',')[0].replace(/['"/]/g, '').trim().replace(/ /g, '+');
            const fontLink = doc.createElement('link');
            fontLink.rel = 'stylesheet';
            fontLink.dataset.flFont = '1';
            fontLink.href = `https://fonts.googleapis.com/css2?family=${formattedFontName}:ital,wght@0,400;0,600;0,700;1,600&display=swap`;
            doc.head.appendChild(fontLink);
        }

        if (typeof fl.needsLayoutUpdate !== 'undefined') fl.needsLayoutUpdate = true;
    }

    fl.deriveDarkBg = function (vibrantColorStr) {
        if (!vibrantColorStr) return '#121212';
        const match = vibrantColorStr.match(/\d+/g);
        if (!match || match.length < 3) return '#121212';
        const [r, g, b] = match.map(Number);
        const hsl = fl.rgbToHsl(r, g, b);
        return fl.hslToRgb(hsl.h, Math.max(hsl.s, 0.75), 0.40);
    }

    fl.deriveLightBg = function (vibrantColorStr) {
        if (!vibrantColorStr) return '#2a2a2a';
        const match = vibrantColorStr.match(/\d+/g);
        if (!match || match.length < 3) return '#2a2a2a';
        const [r, g, b] = match.map(Number);
        const hsl = fl.rgbToHsl(r, g, b);
        return fl.hslToRgb(hsl.h, Math.max(hsl.s, 0.65), 0.60);
    }

    fl.updateCenteredArt = function (artUrl) {
        if (!fl.pipWin || fl.pipWin.closed || fl.userCoverMode !== 'centered') return;

        const img = fl.pipWin.document.getElementById('center-art');
        if (img) {
            if (artUrl) {
                img.src = artUrl;
                img.classList.add('visible');
            } else {
                img.removeAttribute('src');
                img.classList.remove('visible');
            }
        }

        setTimeout(() => {
            if (!fl.pipWin || fl.pipWin.closed || fl.userCoverMode !== 'centered') return;
            if (artUrl && fl.currentPalette && fl.currentPalette.vibrant) {
                const baseBg = fl.deriveDarkBg(fl.currentPalette.vibrant);
                const topBg = fl.deriveLightBg(fl.currentPalette.vibrant);
                fl.pipWin.document.body.style.background = `linear-gradient(180deg, ${topBg} 0%, ${baseBg} 100%)`;
            } else {
                fl.pipWin.document.body.style.background = '#121212';
            }
        }, 250);
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

        btn.onclick = async () => {
            if (fl.isLaunchingPip || window.documentPictureInPicture.window) return;
            fl.isLaunchingPip = true;
            try {
                fl.pipWin = await window.documentPictureInPicture.requestWindow({ width: 300, height: 300 });

                // --- SANITIZE PIP WINDOW (Fixes Spotify white background bleed) ---
                fl.pipWin.document.head.replaceChildren();
                fl.pipWin.document.documentElement.removeAttribute('style');
                fl.pipWin.document.documentElement.removeAttribute('class');
                fl.pipWin.document.body.removeAttribute('style');
                fl.pipWin.document.body.removeAttribute('class');

                const link = fl.pipWin.document.createElement('link');
                link.rel = 'stylesheet';
                link.href = chrome.runtime.getURL('src/content/styles.css');
                fl.pipWin.document.head.appendChild(link);

                try {
                    const primaryFont = fl.userFontFamily.split(',')[0].replace(/['"]/g, '').trim();

                    const systemFonts = ['sans-serif', 'serif', 'monospace', 'segoe ui', 'arial', 'helvetica'];
                    if (!systemFonts.includes(primaryFont.toLowerCase())) {
                        const formattedFontName = primaryFont.replace(/ /g, '+');
                        const fontLink = fl.pipWin.document.createElement('link');
                        fontLink.rel = 'stylesheet';
                        fontLink.href = `https://fonts.googleapis.com/css2?family=${formattedFontName}:ital,wght@0,400;0,600;0,700;1,600&display=swap`;
                        fl.pipWin.document.head.appendChild(fontLink);

                        await fl.pipWin.document.fonts.ready;
                    }
                } catch (err) {
                    console.warn("Failed to load Google Font, falling back to system fonts:", err);
                }

                fl.injectStructure();
                fl.applyVisualSettings();
                fl.fetchLyrics();

                if (!fl.isRenderLoopRunning) {
                    fl.isRenderLoopRunning = true;
                    fl.pipWin.requestAnimationFrame(fl.renderLoop);
                }
            } catch (e) {
                console.error("Launch Failed:", e);
            } finally {
                setTimeout(() => { fl.isLaunchingPip = false; }, 500);
            }
        };

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

        if (fl.autoLaunch && (!fl.pipWin || fl.pipWin.closed)) {
            document.addEventListener('click', () => {
                if (!fl.pipWin || fl.pipWin.closed) {
                    btn.click();
                }
            }, { once: true });
        }
    };

})();
