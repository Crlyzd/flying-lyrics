(() => {
    const fl = window.FLYING_LYRICS;

    let resizeTimeout = null;
    function saveWindowSize(w, h) {
        if (resizeTimeout) clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            chrome.storage.local.set({ pipWidth: w, pipHeight: h });
        }, 500);
    }

    function getSavedSize() {
        return new Promise((resolve) => {
            chrome.storage.local.get({ pipWidth: 300, pipHeight: 300 }, resolve);
        });
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
            const size = await getSavedSize();
            fl.pipWin = await window.documentPictureInPicture.requestWindow({ width: size.pipWidth, height: size.pipHeight });
            fl.activePipType = 'document';

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

            fl.pipWin.addEventListener('resize', () => {
                if (fl.pipWin) {
                    saveWindowSize(fl.pipWin.innerWidth, fl.pipWin.innerHeight);
                }
            });

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
            // 1. Create or get hidden video element
            let video = document.getElementById('fl-video-pip-element');
            if (!video) {
                video = document.createElement('video');
                video.id = 'fl-video-pip-element';
                video.autoplay = true;
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
            canvas.width = 300;
            canvas.height = 300;

            fl.canvas = canvas;
            fl.ctx = canvas.getContext('2d');

            // 3. Set up the canvas stream to the video
            const stream = canvas.captureStream(30);
            video.srcObject = stream;

            // Continuously draw initial frames until video metadata is loaded
            let metadataLoaded = false;
            const drawLoadingFrame = () => {
                if (metadataLoaded || video.readyState >= 1) return;
                fl.ctx.fillStyle = '#121212';
                fl.ctx.fillRect(0, 0, canvas.width, canvas.height);
                requestAnimationFrame(drawLoadingFrame);
            };
            requestAnimationFrame(drawLoadingFrame);

            // Wait for video metadata to load so requestPictureInPicture does not throw HAVE_NOTHING / InvalidStateError
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
            });

            await video.play();

            // 4. Request Native Video PiP
            const pipWin = await video.requestPictureInPicture();
            fl.pipWin = pipWin;
            fl.activePipType = 'video';

            // Send signal to main world to hide seeker bar and skip buttons
            window.postMessage({ type: 'FL_VIDEO_PIP_START' }, '*');

            // Play/Pause and Mute syncing from PiP Window back to Host Tab
            const onPlay = () => {
                const adapter = fl.getActiveAdapter?.();
                const state = fl.getPlayerState();
                if (state.paused) {
                    if (adapter) adapter.clickPlayPause();
                    else document.querySelector('[data-testid="control-button-playpause"], .play-pause-button')?.click();
                }
            };
            const onPause = () => {
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
                canvas.width = pipWin.width;
                canvas.height = pipWin.height;
                fl.needsLayoutUpdate = true;
            };

            pipWin.addEventListener('resize', onResize);
            onResize(); // Initial sizing

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
            };
            video.addEventListener('leavepictureinpicture', onLeave);

            // Reset session state for renderLoop
            fl.currentTrack = "";
            fl.lastExtractedArt = "";
            fl._mediaEl = null;
            fl.scrollPos = 0;
            fl.targetScroll = 0;

            window.requestAnimationFrame(fl.renderLoop);
        } catch (e) {
            console.error("Video PiP Launch Failed:", e);
        } finally {
            setTimeout(() => { fl.isLaunchingPip = false; }, 500);
        }
    };
})();
