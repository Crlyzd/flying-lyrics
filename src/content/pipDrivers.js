(() => {
    const fl = window.FLYING_LYRICS;

    let resizeTimeout = null;
    function saveWindowSize(win, w, h) {
        if (resizeTimeout) clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (!win || win.closed || win !== fl.pipWin) return;
            fl.lastPipWidth = w;
            fl.lastPipHeight = h;
            if (typeof FLYING_LYRICS?.storage?.set === 'function') {
                FLYING_LYRICS.storage.set({
                    lastPipWidth: w,
                    lastPipHeight: h
                });
            }
        }, 500);
    }

    function getSavedSize() {
        return {
            pipWidth: fl.lastPipWidth || 200,
            pipHeight: fl.lastPipHeight || 250
        };
    }

    fl.launchPip = async function () {
        if (fl.pipMode === 'video') {
            await fl.launchVideoPip();
        } else {
            await fl.launchDocumentPip();
        }
    };

    fl.launchDocumentPip = async function () {
        if (!window.documentPictureInPicture) {
            alert("Flying Lyrics: Document Picture-in-Picture is not supported or is disabled in your browser.");
            return;
        }
        if (fl.isLaunchingPip || window.documentPictureInPicture.window) return;
        fl.isLaunchingPip = true;

        try {
            fl.pipLaunchTime = performance.now();
            const size = getSavedSize();
            fl.pipWin = await window.documentPictureInPicture.requestWindow({
                width: size.pipWidth,
                height: size.pipHeight,
                preferInitialWindowPlacement: true
            });
            fl.activePipType = 'document';
            fl.pipSessionId = (fl.pipSessionId || 0) + 1;
            fl.hasAutoLaunched = true;

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
            fl._refreshEls(); // OPT-4: pre-cache DOM element refs for the render loop
            fl.applyVisualSettings();

            // Reset session state so the render loop always detects the
            // current track as "new" on the first tick
            fl.currentTrack = "";
            fl.lastExtractedArt = "";
            fl._mediaEl = null;
            fl.scrollPos = 0;
            fl.targetScroll = 0;
            fl.canvasBgImage = null;       // clear stale art from previous session
            fl.canvasBgImageUrl = "";
            fl.lastHostMutedState = undefined;

            // Pre-warm palette extraction immediately so colors are ready by the time
            // the first frame renders. Without this, fl.currentPalette.raw is undefined
            // for the first 1-3s, causing a dark background and wrong lyric text color.
            const preWarmArt = fl.getCoverArt();
            if (preWarmArt) {
                fl.extractPalette(preWarmArt);
            }

            // Capture the specific window instance created in this launch cycle
            const activeWin = fl.pipWin;

            // Delay registering the resize listener to avoid capturing initial layout/browser-chrome setup sizes
            setTimeout(() => {
                if (fl.pipWin === activeWin && !activeWin.closed) {
                    activeWin.addEventListener('resize', () => {
                        if (fl.pipWin === activeWin && !activeWin.closed) {
                            saveWindowSize(activeWin, activeWin.innerWidth, activeWin.innerHeight);
                        }
                    });
                }
            }, 2000);

            fl.pipWin.addEventListener('pagehide', () => {
                fl.pipWin = null;
                fl.activePipType = null;
                fl.canvas = null;
                fl.ctx = null;
                fl.lastW = -1;
                fl.lastH = -1;
            });

            fl.pipWin.requestAnimationFrame(fl.renderLoop);
        } catch (e) {
            console.error("Document PiP Launch Failed:", e);
        } finally {
            setTimeout(() => { fl.isLaunchingPip = false; }, 500);
        }
    };

    fl.launchVideoPip = async function () {
        if (fl.isLaunchingPip || fl.pipWin) return;
        fl.isLaunchingPip = true;

        try {
            // Ensure elements are created and stream is set up
            fl.prepareVideoPip();

            const video = document.getElementById('fl-video-pip-element');
            const canvas = document.getElementById('fl-video-pip-canvas');

            // Wait for video metadata to load so requestPictureInPicture does not throw HAVE_NOTHING / InvalidStateError
            if (video.readyState < 1) {
                let metadataLoaded = false;
                const drawLoadingFrame = () => {
                    if (metadataLoaded || video.readyState >= 1) return;
                    fl.ctx.fillStyle = '#121212';
                    fl.ctx.fillRect(0, 0, canvas.width, canvas.height);
                    requestAnimationFrame(drawLoadingFrame);
                };
                requestAnimationFrame(drawLoadingFrame);

                await new Promise((resolve) => {
                    const onLoaded = () => {
                        metadataLoaded = true;
                        resolve();
                    };
                    video.onloadedmetadata = onLoaded;
                    // If it's already loaded metadata, resolve immediately
                    if (video.readyState >= 1) {
                        metadataLoaded = true;
                        resolve();
                    }
                    setTimeout(() => {
                        metadataLoaded = true;
                        resolve();
                    }, 1000);
                });
            }

            if (video.paused) {
                await video.play().catch(err => console.warn("video.play() failed:", err));
            }

            // 4. Request Native Video PiP
            const pipWin = await video.requestPictureInPicture();
            fl.pipWin = pipWin;
            fl.activePipType = 'video';
            if (typeof fl.applyVisualSettings === 'function') {
                fl.applyVisualSettings();
            }
            fl.pipSessionId = (fl.pipSessionId || 0) + 1;
            fl.hasAutoLaunched = true;

            // Send signal to main world to hide seeker bar and skip buttons
            window.postMessage({ type: 'FL_VIDEO_PIP_START' }, '*');

            // Play/Pause and Mute syncing from PiP Window back to Host Tab
            const onPlay = () => {
                if (fl.ignoreVideoPlayEvent) {
                    fl.ignoreVideoPlayEvent = false;
                    return;
                }
                const adapter = fl.getActiveAdapter?.();
                const state = fl.getPlayerState();
                if (state.paused) {
                    if (adapter) adapter.clickPlayPause();
                    else document.querySelector('[data-testid="control-button-playpause"], .play-pause-button')?.click();
                }
            };
            const onPause = () => {
                if (fl.ignoreVideoPauseEvent) {
                    fl.ignoreVideoPauseEvent = false;
                    return;
                }
                const adapter = fl.getActiveAdapter?.();
                const state = fl.getPlayerState();
                if (!state.paused) {
                    if (adapter) adapter.clickPlayPause();
                    else document.querySelector('[data-testid="control-button-playpause"], .play-pause-button')?.click();
                }
            };
            const onVolumeChange = () => {
                const adapter = fl.getActiveAdapter?.();
                let isCurrentlyMuted = false;
                if (adapter) {
                    isCurrentlyMuted = adapter.isMuted();
                } else {
                    const media = fl.queryMedia('audio') || fl.queryMedia('video, audio');
                    isCurrentlyMuted = media ? (media.muted || media.volume === 0) : false;
                }
                if (video.muted !== isCurrentlyMuted) {
                    if (adapter) adapter.toggleMute();
                    else {
                        const media = fl.queryMedia('video, audio');
                        if (media) media.muted = video.muted;
                    }
                }
            };

            video.addEventListener('play', onPlay);
            video.addEventListener('pause', onPause);
            video.addEventListener('volumechange', onVolumeChange);

            // Handle Resize
            const onResize = () => {
                if (!fl.pipWin) return;
                // pipWin.width/height may be 0 right after PiP creation before the browser
                // has laid out the window. Skip the update in that case — renderLoop handles
                // canvas sizing itself and will pick up the correct size on its next frame.
                if (pipWin.width <= 0 || pipWin.height <= 0) return;
                fl.needsLayoutUpdate = true;
            };

            pipWin.addEventListener('resize', onResize);
            onResize(); // Initial sizing (guarded — safe to call even if dimensions are 0)

            // Handle Exit
            const onLeave = () => {
                pipWin.removeEventListener('resize', onResize);
                video.removeEventListener('leavepictureinpicture', onLeave);
                video.removeEventListener('play', onPlay);
                video.removeEventListener('pause', onPause);
                video.removeEventListener('volumechange', onVolumeChange);

                // Restore Media Session controls
                window.postMessage({ type: 'FL_VIDEO_PIP_STOP' }, '*');

                if (video.srcObject) {
                    const tracks = video.srcObject.getTracks();
                    tracks.forEach(track => track.stop());
                    video.srcObject = null;
                }
                fl.pipWin = null;
                fl.activePipType = null;
                fl.canvas = null;
                fl.ctx = null;
                fl.lastW = -1;
                fl.lastH = -1;
                fl.lastHostMutedState = undefined;

                if (fl.pipMode === 'video') {
                    fl.prepareVideoPip();
                }
            };
            video.addEventListener('leavepictureinpicture', onLeave);

            // Reset session state for renderLoop
            fl.currentTrack = "";
            fl.lastExtractedArt = "";
            fl._mediaEl = null;
            fl.scrollPos = 0;
            fl.targetScroll = 0;
            fl.lastW = -1;  // force canvas resize on first valid frame
            fl.lastH = -1;
            fl.canvasBgImage = null;       // clear stale art from previous session
            fl.canvasBgImageUrl = "";
            fl.pipLaunchTime = performance.now(); // used by renderer grace-period check
            fl.lastHostMutedState = undefined;

            // Pre-warm palette extraction immediately so colors are ready by the time
            // the first frame renders. Without this, fl.currentPalette.raw is undefined
            // for the first 1-3s, causing a dark background and wrong lyric text color.
            // (Previously only fixed by switching doc pip → video pip to force extraction.)
            const preWarmArt = fl.getCoverArt();
            if (preWarmArt) {
                fl.extractPalette(preWarmArt);
            }

            window.requestAnimationFrame(fl.renderLoop);
        } catch (e) {
            console.error("Video PiP Launch Failed:", e);
        } finally {
            setTimeout(() => { fl.isLaunchingPip = false; }, 500);
        }
    };

    fl.prepareVideoPip = function () {
        if (fl.pipWin) return; // Already running

        // 1. Create or get hidden video element
        let video = document.getElementById('fl-video-pip-element');
        if (!video) {
            video = document.createElement('video');
            video.id = 'fl-video-pip-element';
            // Note: autoplay intentionally omitted — play() is called explicitly below
            // only when the music player is active, to avoid accidentally unlocking a
            // paused player via Chromium's user-activation propagation.
            video.playsInline = true;
            video.muted = true;
            Object.assign(video.style, {
                position: 'fixed',
                top: '0',
                left: '0',
                width: '4px',
                height: '4px',
                opacity: '0.001',
                pointerEvents: 'none',
                zIndex: '-99999'
            });
            document.body.appendChild(video);
        }

        // 2. Create or get hidden canvas
        let canvas = document.getElementById('fl-video-pip-canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'fl-video-pip-canvas';
            Object.assign(canvas.style, {
                position: 'fixed',
                top: '0',
                left: '0',
                width: '4px',
                height: '4px',
                opacity: '0.001',
                pointerEvents: 'none',
                zIndex: '-99999'
            });
            document.body.appendChild(canvas);
        }

        if (canvas.width !== 200) canvas.width = 200;
        if (canvas.height !== 200) canvas.height = 200;

        fl.canvas = canvas;
        fl.ctx = canvas.getContext('2d');

        // Draw initial black frame
        fl.ctx.fillStyle = '#121212';
        fl.ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 3. Set up the canvas stream to the video if not already set
        if (!video.srcObject) {
            const stream = canvas.captureStream(fl.ecoMode ? 20 : 30);
            video.srcObject = stream;
        }

        // Play the canvas-stream video so it's ready for PiP — but only if the
        // music player is NOT currently paused. Calling video.play() while music
        // is paused can propagate Chromium's user-activation token and inadvertently
        // resume playback on the music page (e.g. when toggling Album BG Mode).
        if (video.paused) {
            const _playerState = typeof fl.getPlayerState === 'function' ? fl.getPlayerState() : null;
            const _musicIsPaused = _playerState ? _playerState.paused : false;
            if (!_musicIsPaused) {
                video.play().catch(() => {});
            }
        }
    };
})();
