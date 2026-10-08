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
        const hasDocPip = typeof window !== 'undefined' && !!window.documentPictureInPicture?.requestWindow;
        if (fl.pipMode === 'window') {
            await fl.launchWindowPip();
        } else if (fl.pipMode === 'video' || !hasDocPip) {
            await fl.launchVideoPip();
        } else {
            await fl.launchDocumentPip();
        }
    };

    fl.launchWindowPip = async function () {
        const size = getSavedSize();
        try {
            chrome.runtime.sendMessage({
                type: 'OPEN_PIP_WINDOW',
                payload: {
                    width: size.pipWidth,
                    height: size.pipHeight
                }
            });
            fl.activePipType = 'window';
            fl.hasAutoLaunched = true;
        } catch (e) {
            console.warn("Failed to open pop-out window:", e);
        }
    };

    fl.launchDocumentPip = async function () {
        if (!window.documentPictureInPicture) {
            await fl.launchVideoPip();
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
            console.warn("Document PiP Launch Failed:", e);
        } finally {
            setTimeout(() => { fl.isLaunchingPip = false; }, 500);
        }
    };
})();

