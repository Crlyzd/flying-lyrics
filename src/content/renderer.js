(() => {
    const fl = window.FLYING_LYRICS;

    // ─────────────────────────────────────────────────────────────────────────────
    //  FLYING LYRICS — 2D CANVAS RENDERER ENGINE (content script context)
    //
    //  Modular sub-components:
    //    - renderer/effects.js   (Aurora slosh, particle sparkles & background caching)
    //    - renderer/layout.js    (Dynamic font sizing, wrapping, asymmetric boundary math)
    //    - renderer/pipBadge.js  (Video PiP status pills & waiting state overlays)
    // ─────────────────────────────────────────────────────────────────────────────

    // Layout cache state
    fl.lastW = -1;
    fl.lastH = -1;
    fl.lastActiveIdx = -1;
    fl.lastLyricsLen = 0;
    fl.needsLayoutUpdate = true;
    fl.cachedLayout = [];
    fl.bgCacheCanvas = null;
    fl.bgCacheCtx = null;
    fl.bgCacheW = -1;
    fl.bgCacheH = -1;
    fl.bgCacheUrl = "";
    fl.bgCacheBlur = -1;
    fl.bgCacheDarkness = -1;
    fl.bgCacheMode = "";
    fl.bgCacheVibrant = "";
    fl.bgCacheRaw = "";

    // Cached PiP DOM element references
    fl._els = null;

    fl._refreshEls = function () {
        if (!fl.pipWin) { fl._els = null; return; }
        const doc = fl.pipWin.document;
        fl._els = {
            bgCover: doc.getElementById('bg-cover'),
            seeker: doc.getElementById('seeker-bar'),
            seekerContainer: doc.getElementById('seeker-container'),
            ppBtn: doc.getElementById('playpause'),
            muteBtn: doc.getElementById('mute-btn'),
        };
    };

    fl.queueNextFrame = function (callback) {
        if (fl.activePipType === 'video') {
            if (!fl.ecoMode) {
                window.setTimeout(callback, 16.6);
            } else {
                window.setTimeout(callback, 50);
            }
        } else if (fl.activePipType === 'document' && fl.pipWin && !fl.pipWin.closed) {
            if (fl.ecoMode) {
                const timerHost = fl.pipWin;
                timerHost.setTimeout(() => fl.pipWin && !fl.pipWin.closed && fl.pipWin.requestAnimationFrame(callback), 30);
            } else {
                fl.pipWin.requestAnimationFrame(callback);
            }
        }
    };

    fl.renderLoop = function () {
        if (!fl.pipWin || (fl.activePipType !== 'video' && fl.pipWin.closed)) return;

        fl.isRenderLoopRunning = true;

        // FPS Limit Throttling (Eco Mode)
        if (fl.ecoMode) {
            const now = performance.now();
            const elapsed = now - (fl.lastFrameTimeMs || 0);
            const ecoTargetDelay = fl.isWaitingState ? 83.3 : 33.3;
            if (elapsed < ecoTargetDelay - 2) {
                fl.queueNextFrame(fl.renderLoop);
                return;
            }
            fl.lastFrameTimeMs = now;
        }

        const state = fl.getPlayerState();

        // Auto-next simulation for YouTube Music 3s before end
        if (fl.getActiveAdapter?.() === fl.adapters?.ytmusic && !state.paused && state.duration > 5) {
            const timeRemaining = state.duration - state.currentTime;
            if (timeRemaining > 3) {
                fl.hasTriggeredAutoNext = false;
            } else if (timeRemaining > 0 && timeRemaining <= 3 && !fl.hasTriggeredAutoNext) {
                fl.hasTriggeredAutoNext = true;
                fl.adapters.ytmusic.clickNext();
            }
        }

        if (!state.paused) {
            state.currentTime += (fl.syncOffset / 1000);
        }

        // Auto-heal if duration becomes valid
        if (fl.currentTrack &&
            (fl.isMissingLyrics || (fl.lyricLines.length === 1 && fl.lyricLines[0].text === "Wait for it...")) &&
            state.duration > 5 &&
            (!fl.lastKnownValidDuration || fl.lastKnownValidDuration <= 5)) {
            fl.fetchLyrics();
        }
        fl.lastKnownValidDuration = state.duration;

        const trackMeta = typeof fl.getCurrentTrackMetadata === 'function' ? fl.getCurrentTrackMetadata() : null;
        const nowTitle = trackMeta?.title || navigator.mediaSession?.metadata?.title || "";
        const nowArtist = trackMeta?.artist || navigator.mediaSession?.metadata?.artist || "";
        const trackKey = `${nowArtist} - ${nowTitle}`.trim();

        if (trackKey !== fl.currentTrack) {
            fl.currentTrack = trackKey;
            fl.hasTriggeredAutoNext = false;
            fl.activeLyricSource = null;
            fl.activeTranslationTier = 'None';

            if (!nowTitle) {
                fl.lyricLines = [{ time: 0, text: "Waiting for music...", romaji: "", translation: "" }];
                fl.lyricLines[0].isWaitingPlaceholder = true;
                fl.isCurrentLyricSynced = false;
                fl.isMissingLyrics = false;
                fl.needsLayoutUpdate = true;
                fl._els = null;
                fl.lastKnownValidDuration = 0;
                fl.scrollPos = 0;
                fl.targetScroll = 0;
                fl.lastAnimationTimeMs = null;
                fl.lastExtractedArt = "";
                chrome.storage.local.set({ currentVibrantColor: "#1DB954" });
                if (typeof fl.updateSyncIndicator === 'function') fl.updateSyncIndicator();
                if (typeof fl.applyVisualSettings === 'function') fl.applyVisualSettings();
                chrome.runtime.sendMessage({ type: 'ACTIVE_TRACK_CHANGED', payload: null }).catch(() => { });
            } else {
                fl.lyricLines = [{ time: 0, text: "Wait for it...", romaji: "", translation: "" }];
                fl.isCurrentLyricSynced = false;
                fl.isMissingLyrics = false;
                fl.needsLayoutUpdate = true;
                fl._els = null;
                fl.lastKnownValidDuration = 0;
                fl.scrollPos = 0;
                fl.targetScroll = 0;
                fl.lastAnimationTimeMs = null;
                if (typeof fl.updateSyncIndicator === 'function') fl.updateSyncIndicator();
                if (typeof fl.applyVisualSettings === 'function') fl.applyVisualSettings();

                fl._mediaEl = null;
                fl.lastTimeStr = "";
                fl.lastTimeValue = 0;
                fl.lastUpdateMs = performance.now();

                chrome.runtime.sendMessage({
                    type: 'ACTIVE_TRACK_CHANGED',
                    payload: {
                        artist: nowArtist,
                        title: nowTitle,
                        cleanTitle: trackMeta?.cleanTitle || (typeof fl.cleanTitle === 'function' ? fl.cleanTitle(nowTitle) : nowTitle),
                        primaryArtist: trackMeta?.primaryArtist || (typeof fl.extractPrimaryArtist === 'function' ? fl.extractPrimaryArtist(nowArtist) : nowArtist),
                        duration: state.duration || 0
                    }
                }).catch(() => { });

                fl.fetchLyrics();
            }
        }

        if (fl.activePipType !== 'video' && !fl._els) fl._refreshEls();

        // Continuous background image sync
        const art = typeof fl.getCoverArt === 'function' ? fl.getCoverArt() : '';
        if (fl.activePipType === 'video') {
            if (art && fl.lastExtractedArt !== art) {
                fl.extractPalette(art);
            }
        } else {
            const bg = fl._els?.bgCover;
            if (bg && art) {
                const isAlbumCoverForced = fl.isMissingLyrics || fl.albumCoverMode;
                const effectiveCoverMode = isAlbumCoverForced ? 'centered' : fl.userCoverMode;

                if (effectiveCoverMode === 'centered') {
                    if (bg.style.backgroundImage.includes('url(')) {
                        bg.style.backgroundImage = 'none';
                    }
                    if (fl.lastExtractedArt !== art) {
                        fl.extractPalette(art);
                        if (typeof fl.updateCenteredArt === 'function') fl.updateCenteredArt(art);
                    }
                } else {
                    const newBg = `url("${art}")`;
                    if (bg.style.backgroundImage !== newBg) {
                        bg.style.backgroundImage = newBg;
                        fl.extractPalette(art);
                        if (typeof fl.updateCenteredArt === 'function') fl.updateCenteredArt(art);
                    }
                }
            } else if (bg && !art) {
                if (bg.style.backgroundImage !== 'none' && bg.style.backgroundImage !== '') {
                    bg.style.backgroundImage = 'none';
                    if (typeof fl.updateCenteredArt === 'function') fl.updateCenteredArt("");
                }
            }
        }

        const shouldShowLoadingPlaceholder =
            fl.activePipType === 'video' &&
            !fl.canvasBgImage &&
            (fl.albumCoverMode || (fl.isMissingLyrics && fl.lyricLines.length === 0));

        const isWaitingState = (fl.lyricLines.length === 1 && (fl.lyricLines[0].text === "Waiting for music..." || fl.lyricLines[0].isWaitingPlaceholder)) ||
            shouldShowLoadingPlaceholder;

        if (fl.activePipType === 'video') {
            if (!fl.canvas) {
                if (fl.pipWin) fl.queueNextFrame(fl.renderLoop);
                return null;
            }
        } else {
            if (!fl.canvas || !fl.pipWin.document.body.contains(fl.canvas)) {
                fl.canvas = fl.pipWin.document.getElementById('lyricCanvas');
                fl.ctx = null;
                fl.lastW = -1;
                fl.lastH = -1;
                fl._els = null;
            }
        }
        if (!fl.canvas) {
            fl.queueNextFrame(fl.renderLoop);
            return;
        }
        if (!fl.ctx) fl.ctx = fl.canvas.getContext('2d');

        let w = fl.activePipType === 'video' ? fl.pipWin.width : fl.pipWin.innerWidth;
        let h = fl.activePipType === 'video' ? fl.pipWin.height : fl.pipWin.innerHeight;

        if (fl.ecoMode) {
            const maxRes = 480;
            if (w > maxRes || h > maxRes) {
                const scale = maxRes / Math.max(w, h);
                w = Math.round(w * scale);
                h = Math.round(h * scale);
            }
        }

        if (w <= 0 || h <= 0) {
            fl.queueNextFrame(fl.renderLoop);
            return;
        }

        if (w !== fl.lastW || h !== fl.lastH) {
            fl.canvas.width = w;
            fl.canvas.height = h;
            fl.lastW = w; fl.lastH = h;
            fl.needsLayoutUpdate = true;
        }

        const vmin = Math.min(w, h) / 100;
        const maxWidth = w * 0.94;

        // Seeker & Play/Pause/Mute sync
        const seekerContainer = fl._els?.seekerContainer;
        const hasTrack = fl.currentTrack &&
            fl.currentTrack !== "" &&
            !((fl.lyricLines.length === 1 && (fl.lyricLines[0].text === "Waiting for music..." || fl.lyricLines[0].isWaitingPlaceholder)) || (state.paused && state.duration <= 5));

        if (hasTrack && !state.paused) {
            const nowTick = performance.now();
            if (fl.lastActiveTickMs) {
                const deltaMs = nowTick - fl.lastActiveTickMs;
                if (typeof fl.accumulateListeningTime === 'function') fl.accumulateListeningTime(deltaMs);
            }
            fl.lastActiveTickMs = nowTick;
        } else {
            fl.lastActiveTickMs = null;
        }

        if (fl.activePipType !== 'video') {
            const uiContainer = seekerContainer?.parentElement;
            if (uiContainer && !isWaitingState && uiContainer.style.getPropertyValue('--vibrant-color')) {
                uiContainer.style.removeProperty('--vibrant-color');
            }

            if (seekerContainer) seekerContainer.style.display = hasTrack ? 'block' : 'none';

            const seeker = fl._els?.seeker;
            if (seeker && hasTrack) seeker.style.width = `${(state.currentTime / state.duration) * 100}%`;

            const ppBtn = fl._els?.ppBtn;
            if (ppBtn) {
                const targetState = state.paused ? 'paused' : 'playing';
                if (ppBtn.dataset.state !== targetState) {
                    ppBtn.dataset.state = targetState;
                    ppBtn.innerHTML = state.paused ? fl.ICON_PLAY : fl.ICON_PAUSE;
                }
            }

            const muteBtn = fl._els?.muteBtn;
            if (muteBtn) {
                const adapter = fl.getActiveAdapter?.();
                let isMuted = false;
                if (adapter) {
                    isMuted = adapter.isMuted();
                } else {
                    const media = fl.queryMedia('audio') || fl.queryMedia('video, audio');
                    isMuted = media ? (media.muted || media.volume === 0) : false;
                }
                const targetMuteIcon = isMuted ? fl.ICON_VOL_MUTE : fl.ICON_VOL_HIGH;
                if (muteBtn.innerHTML !== targetMuteIcon) muteBtn.innerHTML = targetMuteIcon;
            }
        } else {
            const video = document.getElementById('fl-video-pip-element');
            if (video) {
                const timeSinceLaunch = performance.now() - (fl.pipLaunchTime || 0);
                const gracePeriodOver = timeSinceLaunch > 400;

                const isBgLoading = fl.canvasBgImageUrl && !fl.canvasBgImage;
                const absScrollDelta = Math.abs(fl.targetScroll - fl.scrollPos);
                const isAnimating = absScrollDelta >= 0.5;
                const shouldPauseVideo = state.paused && !isWaitingState && !isBgLoading && !fl.needsLayoutUpdate && !isAnimating && !fl.needsVideoFramePush;

                if (gracePeriodOver && shouldPauseVideo !== video.paused) {
                    if (shouldPauseVideo) {
                        fl.ignoreVideoPauseEvent = true;
                        video.pause();
                    } else {
                        fl.ignoreVideoPlayEvent = true;
                        video.play().catch(() => { fl.ignoreVideoPlayEvent = false; });
                    }
                } else if (!gracePeriodOver && video.paused) {
                    fl.ignoreVideoPlayEvent = true;
                    video.play().catch(() => { fl.ignoreVideoPlayEvent = false; });
                }

                const adapter = fl.getActiveAdapter?.();
                let isMuted = false;
                if (adapter) {
                    isMuted = adapter.isMuted();
                } else {
                    const media = fl.queryMedia('audio') || fl.queryMedia('video, audio');
                    isMuted = media ? (media.muted || media.volume === 0) : false;
                }

                if (fl.lastHostMutedState === undefined) {
                    fl.lastHostMutedState = isMuted;
                    if (video.muted !== isMuted) {
                        fl.ignoreVideoVolumeEvent = true;
                        video.muted = isMuted;
                    }
                } else if (isMuted !== fl.lastHostMutedState) {
                    fl.lastHostMutedState = isMuted;
                    if (video.muted !== isMuted) {
                        fl.ignoreVideoVolumeEvent = true;
                        video.muted = isMuted;
                    }
                }
            }
        }

        if (fl.activePipType !== 'video' && (w < 140 || h < 140)) {
            const timerHost = fl.pipWin || window;
            timerHost.setTimeout(() => fl.queueNextFrame(fl.renderLoop), 500);
            return;
        }

        const _isScrollSettled = Math.abs(fl.targetScroll - fl.scrollPos) < 0.1;
        const _isLoopIdle = _isScrollSettled && !fl.needsLayoutUpdate && !(fl.userGlowEnabled && !fl.ecoMode);
        const isStaticAlbumMode = fl.albumCoverMode && !fl.needsLayoutUpdate;

        if (fl.albumCoverMode) {
            fl.scrollPos = fl.targetScroll;
        }

        if ((_isLoopIdle && state.paused && !fl.isWaitingState) || isStaticAlbumMode) {
            if (fl.hasDrawnIdleFrame) {
                const throttleDelay = fl.albumCoverMode
                    ? (fl.activePipType === 'video' ? 250 : 100)
                    : 250;

                if (fl.ecoMode || fl.albumCoverMode) {
                    const timerHost = fl.activePipType === 'video' ? window : fl.pipWin;
                    timerHost.setTimeout(() => {
                        fl.lastAnimationTimeMs = null;
                        fl.queueNextFrame(fl.renderLoop);
                    }, throttleDelay);
                } else {
                    fl.queueNextFrame(fl.renderLoop);
                }
                return;
            }
        } else {
            fl.hasDrawnIdleFrame = false;
        }

        fl.ctx.clearRect(0, 0, w, h);
        if (typeof fl.drawCanvasBackground === 'function') fl.drawCanvasBackground(w, h);

        let activeIdx = fl.lyricLines.findIndex((l, i) =>
            state.currentTime >= l.time && (!fl.lyricLines[i + 1] || state.currentTime < fl.lyricLines[i + 1].time)
        );
        if (activeIdx === -1) activeIdx = 0;

        // Dynamic Layout Calculation
        if (typeof fl.updateLyricLayout === 'function') {
            fl.updateLyricLayout(w, h, vmin, maxWidth, activeIdx);
        }

        const now = performance.now();
        const dt = fl.lastAnimationTimeMs ? (now - fl.lastAnimationTimeMs) / 1000 : 0.0166;
        fl.lastAnimationTimeMs = now;
        const clippedDt = Math.min(dt, 0.1);
        const scrollDelta = fl.targetScroll - fl.scrollPos;

        if (!fl.fluidScrolling) {
            fl.scrollPos = fl.targetScroll;
        } else {
            if (Math.abs(scrollDelta) > h * 0.8) {
                fl.scrollPos = fl.targetScroll - (Math.sign(scrollDelta) * (h * 0.1));
                fl.lastAnimationTimeMs = null;
            } else {
                const k = 15.0;
                const decay = 1 - Math.exp(-k * clippedDt);
                fl.scrollPos += scrollDelta * Math.min(1, decay);
            }
        }

        const isFastScroll = Math.abs(scrollDelta) > (h * 0.05);
        const absScrollDelta = Math.abs(fl.targetScroll - fl.scrollPos);
        const isGlowDynamic = fl.userGlowEnabled && fl.userLyricShadowEnabled && !fl.ecoMode;
        const isIdle = fl.ecoMode && (absScrollDelta < 0.1 && !fl.needsLayoutUpdate) && !isGlowDynamic;

        const isWaitForItGlobal = fl.lyricLines.length === 1 && fl.lyricLines[0]?.text === "Wait for it...";
        const anchorOffset = isWaitForItGlobal ? 0 : (((fl.userVerticalAnchor ?? 5) - 6) * vmin * 5);
        const isWaiting = fl.isWaitingState;

        fl.ctx.save();
        if (shouldShowLoadingPlaceholder || isWaiting) {
            fl.ctx.translate(w / 2, h / 2);
            if (fl.lyricLines && fl.lyricLines[0]) {
                fl.lyricLines[0].isWaitingPlaceholder = true;
            }
            if (typeof fl.drawWaitingState === 'function') {
                fl.drawWaitingState(w, h, vmin, maxWidth, 0);
            }
        } else {
            fl.ctx.translate(w / 2, (h / 2) - fl.scrollPos + anchorOffset);
            if (!fl.albumCoverMode) {
                fl.lyricLines.forEach((line, i) => {
                    const entry = fl.cachedLayout[i];
                    if (!entry) return;
                    const y = entry.y;

                    // Culling: Skip drawing off-screen lines
                    const screenY = (h / 2) - fl.scrollPos + anchorOffset + y;
                    if (screenY < -h * 0.5 || screenY > h * 1.5) return;

                    const dist = Math.abs(i - activeIdx);
                    fl.ctx.globalAlpha = Math.max(0.3, 1 - dist * 0.3);

                    const isSystemMessage = fl.lyricLines.length === 1 && (fl.SYSTEM_MSG_SET ? fl.SYSTEM_MSG_SET.has(line.text) : false);
                    const isWaitForIt = fl.lyricLines.length === 1 && line.text === "Wait for it...";
                    let drawX = 0;
                    if (isSystemMessage) {
                        fl.ctx.textAlign = 'center';
                    } else if (fl.userLyricAlignment === 'left') {
                        fl.ctx.textAlign = 'left';
                        drawX = -(maxWidth / 2);
                    } else if (fl.userLyricAlignment === 'right') {
                        fl.ctx.textAlign = 'right';
                        drawX = maxWidth / 2;
                    } else {
                        fl.ctx.textAlign = 'center';
                    }

                    const isCurrent = (i === activeIdx);
                    const displayFontFamily = (isSystemMessage && !isWaitForIt) ? "'Noto Sans', 'Segoe UI', sans-serif" : fl.userFontFamily;
                    const fontScale = isSystemMessage ? 1 : (fl.userFontSize / 18);

                    const mainSize = entry.mainSize || (isCurrent ? vmin * 7.5 * fontScale : vmin * 6.0 * fontScale);
                    const romajiSize = isCurrent ? mainSize * 0.86 : vmin * 5.2 * fontScale;
                    const transSize = isCurrent ? mainSize * 0.86 : vmin * 5.2 * fontScale;

                    fl.ctx.font = (isCurrent ? `700 ` : `600 `) + `${mainSize}px ${displayFontFamily}`;
                    const mainLineCount = fl.getWrapLines(fl.ctx, line.text, maxWidth).length;
                    const mainWrapShift = (mainLineCount > 1 ? mainLineCount - 1 : 0) * (mainSize * 1.2);

                    // Draw Romaji
                    if (line.romaji) {
                        fl.ctx.font = `italic 600 ${romajiSize}px ${displayFontFamily}`;
                        fl.ctx.fillStyle = isCurrent ? (fl.galaxyMode ? "#FFEAA7" : "rgba(255, 255, 255, 0.9)") : "rgba(255, 255, 255, 0.7)";
                        if (isCurrent && fl.userLyricShadowEnabled) {
                            fl.ctx.shadowColor = fl.userGlowEnabled ? (fl.currentPalette.vibrant || "rgba(0, 210, 255, 0.8)") : "rgba(0, 0, 0, 0.8)";
                            fl.ctx.shadowBlur = 10;
                        } else {
                            fl.ctx.shadowBlur = 0;
                        }
                        fl.wrapText(fl.ctx, line.romaji, drawX, y - (romajiSize * 1.5), maxWidth, romajiSize * 1.2, true);
                    }

                    // Draw Main Lyric
                    fl.ctx.font = (isCurrent ? `700 ` : `600 `) + `${mainSize}px ${displayFontFamily}`;
                    fl.ctx.fillStyle = isCurrent ? (fl.galaxyMode ? "#FFFFFF" : "#FFFFFF") : "rgba(255, 255, 255, 0.6)";

                    if (isCurrent) {
                        if (!fl.userLyricShadowEnabled) {
                            fl.ctx.shadowBlur = 0;
                            fl.ctx.shadowColor = 'transparent';
                            fl.wrapText(fl.ctx, line.text, drawX, y, maxWidth, mainSize * 1.2, false, true);
                        } else {
                            if (fl.userGlowEnabled) {
                                fl.ctx.shadowColor = fl.currentPalette.vibrant || "rgba(0, 210, 255, 0.8)";
                                fl.ctx.shadowBlur = fl.ecoMode ? 15 : (15 + Math.sin(now * 0.003) * 5);
                            } else {
                                fl.ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
                                fl.ctx.shadowBlur = 15;
                            }
                            fl.wrapText(fl.ctx, line.text, drawX, y, maxWidth, mainSize * 1.2, false, false);
                        }
                    } else {
                        fl.ctx.shadowBlur = 0;
                        fl.ctx.shadowColor = 'transparent';
                        fl.wrapText(fl.ctx, line.text, drawX, y, maxWidth, mainSize * 1.2, false, false);
                    }

                    // Draw Translation
                    if (fl.showTranslation && line.translation) {
                        fl.ctx.font = `600 ${transSize}px ${displayFontFamily}`;
                        fl.ctx.fillStyle = isCurrent ? (fl.galaxyMode ? "#81ECEC" : "rgba(255, 255, 255, 0.85)") : "rgba(255, 255, 255, 0.5)";
                        if (isCurrent && fl.userLyricShadowEnabled) {
                            fl.ctx.shadowColor = fl.userGlowEnabled ? (fl.currentPalette.vibrant || "rgba(0, 210, 255, 0.8)") : "rgba(0, 0, 0, 0.8)";
                            fl.ctx.shadowBlur = 10;
                        } else {
                            fl.ctx.shadowBlur = 0;
                        }
                        fl.wrapText(fl.ctx, `(${line.translation})`, drawX, y + mainWrapShift + (transSize * 1.5), maxWidth, transSize * 1.2, false);
                    }

                    fl.ctx.shadowBlur = 0;
                });
            }
        }
        fl.ctx.restore();

        // Push frame to video stream if needed
        if (fl.activePipType === 'video' && fl.needsVideoFramePush) {
            const video = document.getElementById('fl-video-pip-element');
            if (video && video.paused) {
                fl.ignoreVideoPlayEvent = true;
                video.play().then(() => {
                    fl.ignoreVideoPauseEvent = true;
                    video.pause();
                }).catch(() => {});
            }
            fl.needsVideoFramePush = false;
        }

        // Draw Video PiP Sync Status Badge
        if (typeof fl.drawVideoPipSyncStatus === 'function') {
            fl.drawVideoPipSyncStatus(w, h);
        }

        // Idle frame tracking
        if (_isLoopIdle && state.paused && !fl.isWaitingState) {
            fl.hasDrawnIdleFrame = true;
        }

        if (isIdle) {
            const timerHost = fl.activePipType === 'video' ? window : fl.pipWin;
            timerHost.setTimeout(() => {
                fl.lastAnimationTimeMs = null;
                fl.queueNextFrame(fl.renderLoop);
            }, 250);
        } else {
            fl.queueNextFrame(fl.renderLoop);
        }
    };

})();
