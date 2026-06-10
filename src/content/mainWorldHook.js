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
                } catch (e) {}
            }
        }
    });
})();
