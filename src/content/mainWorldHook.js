(() => {
    const savedHandlers = {};
    let positionStateDisabled = false;
    let originalSetPositionState = null;
    let originalSetActionHandler = null;
    let lastPositionState = null;

    if (window.navigator && window.navigator.mediaSession) {
        // Intercept setActionHandler
        originalSetActionHandler = window.navigator.mediaSession.setActionHandler;
        window.navigator.mediaSession.setActionHandler = function (action, handler) {
            savedHandlers[action] = handler;

            // If we are currently overriding to hide controls in Video PiP
            if (window.__flVideoPipActive && (action === 'seekbackward' || action === 'seekforward' || action === 'seekto')) {
                return;
            }
            return originalSetActionHandler.call(window.navigator.mediaSession, action, handler);
        };

        // Intercept setPositionState
        originalSetPositionState = window.navigator.mediaSession.setPositionState;
        window.navigator.mediaSession.setPositionState = function (state) {
            lastPositionState = state;
            if (positionStateDisabled) {
                return;
            }
            return originalSetPositionState.call(window.navigator.mediaSession, state);
        };
    }

    // Listen to messages from content script (isolated world)
    window.addEventListener('message', (event) => {
        if (!event.data) return;
        
        if (event.data.type === 'FL_VIDEO_PIP_START') {
            window.__flVideoPipActive = true;
            positionStateDisabled = true;

            if (window.navigator?.mediaSession && originalSetActionHandler) {
                // Clear position state to hide progress bar
                try {
                    originalSetPositionState?.call(window.navigator.mediaSession, null);
                } catch (e) {}

                // Clear seek-related action handlers to hide seek backward/forward buttons
                try {
                    originalSetActionHandler.call(window.navigator.mediaSession, 'seekbackward', null);
                    originalSetActionHandler.call(window.navigator.mediaSession, 'seekforward', null);
                    originalSetActionHandler.call(window.navigator.mediaSession, 'seekto', null);
                } catch (e) {}

                // Register dummy handlers for play/pause/prev/next to force browser native controls
                try {
                    const isTrackLoaded = () => {
                        const medias = Array.from(document.querySelectorAll('video, audio'))
                            .filter(el => el.id !== 'fl-video-pip-element');
                        return medias.some(m => m.readyState >= 1 && m.duration > 0 && !isNaN(m.duration));
                    };

                    const dummyPlayHandler = () => {
                        if (savedHandlers['play']) {
                            savedHandlers['play']();
                        } else if (isTrackLoaded()) {
                            const playBtn = document.querySelector('[data-testid="control-button-playpause"], .play-pause-button');
                            if (playBtn) playBtn.click();
                        }
                    };
                    const dummyPauseHandler = () => {
                        if (savedHandlers['pause']) {
                            savedHandlers['pause']();
                        } else if (isTrackLoaded()) {
                            const playBtn = document.querySelector('[data-testid="control-button-playpause"], .play-pause-button');
                            if (playBtn) playBtn.click();
                        }
                    };
                    const dummyPrevHandler = () => {
                        if (savedHandlers['previoustrack']) {
                            savedHandlers['previoustrack']();
                        } else if (isTrackLoaded()) {
                            document.querySelector('.previous-button')?.click();
                        }
                    };
                    const dummyNextHandler = () => {
                        if (savedHandlers['nexttrack']) {
                            savedHandlers['nexttrack']();
                        } else if (isTrackLoaded()) {
                            document.querySelector('.next-button')?.click();
                        }
                    };

                    if (!savedHandlers['play']) {
                        originalSetActionHandler.call(window.navigator.mediaSession, 'play', dummyPlayHandler);
                    }
                    if (!savedHandlers['pause']) {
                        originalSetActionHandler.call(window.navigator.mediaSession, 'pause', dummyPauseHandler);
                    }
                    if (!savedHandlers['previoustrack']) {
                        originalSetActionHandler.call(window.navigator.mediaSession, 'previoustrack', dummyPrevHandler);
                    }
                    if (!savedHandlers['nexttrack']) {
                        originalSetActionHandler.call(window.navigator.mediaSession, 'nexttrack', dummyNextHandler);
                    }
                } catch (e) {}
            }
        } else if (event.data.type === 'FL_VIDEO_PIP_STOP') {
            window.__flVideoPipActive = false;
            positionStateDisabled = false;

            if (window.navigator?.mediaSession && originalSetActionHandler) {
                // Restore position state
                try {
                    if (lastPositionState) {
                        originalSetPositionState?.call(window.navigator.mediaSession, lastPositionState);
                    }
                } catch (e) {}

                // Restore action handlers
                try {
                    originalSetActionHandler.call(window.navigator.mediaSession, 'seekbackward', savedHandlers['seekbackward'] || null);
                    originalSetActionHandler.call(window.navigator.mediaSession, 'seekforward', savedHandlers['seekforward'] || null);
                    originalSetActionHandler.call(window.navigator.mediaSession, 'seekto', savedHandlers['seekto'] || null);
                    originalSetActionHandler.call(window.navigator.mediaSession, 'play', savedHandlers['play'] || null);
                    originalSetActionHandler.call(window.navigator.mediaSession, 'pause', savedHandlers['pause'] || null);
                    originalSetActionHandler.call(window.navigator.mediaSession, 'previoustrack', savedHandlers['previoustrack'] || null);
                    originalSetActionHandler.call(window.navigator.mediaSession, 'nexttrack', savedHandlers['nexttrack'] || null);
                } catch (e) {}
            }
        }
    });
})();
