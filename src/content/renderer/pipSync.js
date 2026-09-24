(() => {
    const fl = window.FLYING_LYRICS;

    // ─────────────────────────────────────────────────────────────────────────────
    //  FLYING LYRICS — PIP CONTROLS & HOST PLAYER SYNCHRONIZATION
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Synchronizes PiP player controls (play/pause, mute, seeker) and Video PiP
     * stream playback state with the active media playback state.
     *
     * @param {Object} state - Media playback state from fl.getPlayerState()
     * @param {boolean} isWaitingState - True if waiting for music / loading placeholder
     */
    fl.syncPipControls = function (state, isWaitingState) {
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
    };

})();
