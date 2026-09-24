(() => {
    const fl = window.FLYING_LYRICS;

    // ─────────────────────────────────────────────────────────────────────────────
    //  FLYING LYRICS — UI COORDINATOR (content script context)
    //
    //  Modular sub-components:
    //    - ui/colorPalette.js (K-Means color transforms & background derivation)
    //    - ui/domBuilder.js   (Document PiP DOM structure injection & SVG icons)
    //    - ui/launcher.js     (Floating launcher widget & auto-launch listener)
    // ─────────────────────────────────────────────────────────────────────────────

    // Aliased color utilities from ui/colorPalette.js
    const hexToRgba = fl.hexToRgba;
    const applyPeachFilterAndClamp = fl.applyPeachFilterAndClamp;
    const getContrastColor = fl.getContrastColor;
    const getReadableForeground = fl.getReadableForeground;

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
        const dot = ind ? ind.querySelector('.sync-dot') : null;
        if (ind && txt) {
            // Apply retrying state based on global flag
            if (fl.isRetrying) {
                ind.classList.add('is-retrying');
            } else {
                ind.classList.remove('is-retrying');
            }

            // Priority order: failed > missing or empty > synced > unsynced
            const isEmpty = fl.activeLyricSource && fl.activeLyricSource.isEmpty;

            if (fl.isBackgroundSearchFailed && !fl.isRetrying) {
                ind.classList.remove('is-synced', 'is-missing');
                ind.classList.add('is-failed');
                ind.title = 'Lyrics search failed';
                if (dot) dot.textContent = '✕';
                txt.textContent = 'FAILED';
            } else {
                ind.classList.remove('is-failed');
                if (dot) dot.textContent = '';

                if (fl.isMissingLyrics || isEmpty) {
                    ind.classList.remove('is-synced');
                    ind.classList.add('is-missing');
                    const isRetrying = ind.classList.contains('is-retrying');
                    if (fl.isMissingLyrics) {
                        ind.title = isRetrying
                            ? 'No lyrics found for this track (Retrying...)'
                            : 'No lyrics found for this track';
                        txt.textContent = isRetrying ? 'SEARCHING' : 'NO LYRICS';
                    } else {
                        ind.title = 'This track is empty (no lyrics available)';
                        txt.textContent = 'NO LYRICS';
                    }
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

        targetDoc.documentElement.classList.remove('theme-green');
        let f1, f2, f3, raw1, raw2, raw3;
        if (fl.galaxyMode !== false) {
            f1 = applyPeachFilterAndClamp(fl.popupColor1);
            f2 = applyPeachFilterAndClamp(fl.popupColor2);
            f3 = applyPeachFilterAndClamp(fl.popupColor3);
            raw1 = fl.popupColor1;
            raw2 = fl.popupColor2;
            raw3 = fl.popupColor3;
        } else {
            f1 = '#1DB954';
            f2 = '#1DB954';
            f3 = '#1DB954';
            raw1 = '#1DB954';
            raw2 = '#1DB954';
            raw3 = '#1DB954';
        }

        const contrast1 = getContrastColor(f1);
        const contrast2 = getContrastColor(f2);
        const contrast3 = getContrastColor(f3);

        const fore1 = getReadableForeground(f1);
        const fore2 = getReadableForeground(f2);
        const fore3 = getReadableForeground(f3);

        targetDoc.documentElement.style.setProperty('--accent-1', f1);
        targetDoc.documentElement.style.setProperty('--accent-2', f2);
        targetDoc.documentElement.style.setProperty('--accent-3', f3);

        targetDoc.documentElement.style.setProperty('--accent-1-contrast', contrast1);
        targetDoc.documentElement.style.setProperty('--accent-2-contrast', contrast2);
        targetDoc.documentElement.style.setProperty('--accent-3-contrast', contrast3);
        targetDoc.documentElement.style.setProperty('--accent-contrast', contrast1);
        targetDoc.documentElement.style.setProperty('--accent-blue-contrast', contrast2);
        targetDoc.documentElement.style.setProperty('--accent-green-contrast', contrast3);

        targetDoc.documentElement.style.setProperty('--accent-1-foreground', fore1);
        targetDoc.documentElement.style.setProperty('--accent-2-foreground', fore2);
        targetDoc.documentElement.style.setProperty('--accent-3-foreground', fore3);
        targetDoc.documentElement.style.setProperty('--accent-foreground', fore1);
        targetDoc.documentElement.style.setProperty('--accent-blue-foreground', fore2);
        targetDoc.documentElement.style.setProperty('--accent-green-foreground', fore3);

        targetDoc.documentElement.style.setProperty('--raw-accent-1', raw1);
        targetDoc.documentElement.style.setProperty('--raw-accent-2', raw2);
        targetDoc.documentElement.style.setProperty('--raw-accent-3', raw3);
        targetDoc.documentElement.style.setProperty('--raw-accent', raw1);
        targetDoc.documentElement.style.setProperty('--raw-accent-blue', raw2);
        targetDoc.documentElement.style.setProperty('--raw-accent-green', raw3);

        targetDoc.documentElement.style.setProperty('--accent-bg', hexToRgba(f1, 0.08));
        targetDoc.documentElement.style.setProperty('--accent-glow', hexToRgba(f1, 0.45));

        if (fl.activePipType !== 'video') {
            const bodyEl = targetDoc.body;
            if (bodyEl && fl.currentPalette && fl.currentPalette.vibrant) {
                bodyEl.style.setProperty('--vibrant-color', fl.currentPalette.vibrant);
            }
            const bgCover = targetDoc.getElementById('bg-cover');
            const centerArt = targetDoc.getElementById('center-art');

            const isWaiting = fl.isWaitingState;
            const isAlbumCoverForced = isWaiting || fl.isMissingLyrics || fl.albumCoverMode;
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
        const fontName = fl.userFontFamily.split(',')[0].replace(/['"/]/g, '').trim();
        const primaryFont = fontName.toLowerCase();
        const isSystemFont = systemFontNames.some(sf => primaryFont.includes(sf));

        targetDoc.querySelectorAll('link[data-fl-font]').forEach(el => el.remove());

        if (!isSystemFont) {
            const formattedFontName = fontName.replace(/ /g, '+');
            const fontLink = targetDoc.createElement('link');
            fontLink.rel = 'stylesheet';
            fontLink.dataset.flFont = '1';
            fontLink.href = `https://fonts.googleapis.com/css2?family=${formattedFontName}:ital,wght@0,400;0,600;0,700;1,600&display=swap`;

            fontLink.onload = () => {
                // Yield one frame to ensure browser's CSSOM @font-face registry is fully updated
                requestAnimationFrame(() => {
                    targetDoc.fonts.load(`1em "${fontName}"`).then(() => {
                        if (typeof fl.needsLayoutUpdate !== 'undefined') fl.needsLayoutUpdate = true;
                        fl.hasDrawnIdleFrame = false;
                        chrome.runtime.sendMessage({
                            type: 'FONT_LOADED_IN_PIP',
                            payload: { fontName: fontName, success: true }
                        });
                    }).catch(() => {
                        if (typeof fl.needsLayoutUpdate !== 'undefined') fl.needsLayoutUpdate = true;
                        fl.hasDrawnIdleFrame = false;
                        chrome.runtime.sendMessage({
                            type: 'FONT_LOADED_IN_PIP',
                            payload: { fontName: fontName, success: false }
                        });
                    });
                });
            };

            fontLink.onerror = () => {
                if (typeof fl.needsLayoutUpdate !== 'undefined') fl.needsLayoutUpdate = true;
                fl.hasDrawnIdleFrame = false;
                chrome.runtime.sendMessage({
                    type: 'FONT_LOADED_IN_PIP',
                    payload: { fontName: fontName, success: false }
                });
            };

            targetDoc.head.appendChild(fontLink);
        } else {
            chrome.runtime.sendMessage({
                type: 'FONT_LOADED_IN_PIP',
                payload: { fontName: fontName }
            });
        }

        if (typeof fl.needsLayoutUpdate !== 'undefined') fl.needsLayoutUpdate = true;
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


})();
