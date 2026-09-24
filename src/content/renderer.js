(() => {
    const fl = window.FLYING_LYRICS;

    // ─────────────────────────────────────────────────────────────────────────────
    //  FLYING LYRICS — 2D CANVAS RENDERER ENGINE (content script context)
    //
    //  Modular sub-components:
    //    - renderer/effects.js          (Aurora slosh, particle sparkles & background caching)
    //    - renderer/layout.js           (Dynamic font sizing, wrapping, asymmetric boundary math)
    //    - renderer/emptyStateQuotes.js (Dynamic waiting state quotes & stats text)
    //    - renderer/pipBadge.js         (Video PiP status pills & waiting state overlays)
    //    - renderer/pipSync.js          (PiP controls, playback state & volume synchronization)
    //    - renderer/textDrawer.js       (Canvas lyric lines, shaders & glow rendering)
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
    fl._waitForItStartTime = null;

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
                fl._waitForItStartTime = performance.now();
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

        // Watchdog: break indefinite "Wait for it..." stall
        if (fl._waitForItStartTime &&
            fl.lyricLines.length === 1 &&
            fl.lyricLines[0]?.text === "Wait for it..." &&
            (performance.now() - fl._waitForItStartTime) > 15000) {
            console.warn('FL: "Wait for it..." watchdog fired. Transitioning to missing lyrics.');
            fl._waitForItStartTime = null;
            if (typeof fl.handleMissingLyrics === 'function') fl.handleMissingLyrics();
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
        if (typeof fl.syncPipControls === 'function') {
            fl.syncPipControls(state, isWaitingState);
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
            if (!fl.albumCoverMode && typeof fl.drawLyricLines === 'function') {
                fl.drawLyricLines(w, h, vmin, maxWidth, activeIdx, anchorOffset, isFastScroll);
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
