// --- ICONS (SVG STRINGS) ---
const ICON_PREV = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 20L9 12l10-8v16zM5 19V5"/></svg>`;
const ICON_NEXT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4l10 8-10 8V4zM19 5v14"/></svg>`;
const ICON_PLAY = `<svg viewBox="0 0 25 27" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="butt" stroke-linejoin="round"><path d="M20.1,11.2 C21.5,12 21.5,13.9 20.1,14.7 L5.9,22.9 C4.6,23.7 2.9,22.7 2.9,21.2 L2.9,4.7 C2.9,3.2 4.6,2.2 5.9,3 L20.1,11.2 Z"/></svg>`;
const ICON_PAUSE = `<svg viewBox="0 0 27 29" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="butt" stroke-linejoin="miter"><rect x="2.7" y="2.3" width="6.8" height="23.2" rx="3.4"/><rect x="16.5" y="2.3" width="6.8" height="23.2" rx="3.4"/></svg>`;
const ICON_VOL_HIGH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
const ICON_VOL_MUTE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;
const ICON_CC = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" ry="2"></rect><path d="M10 9.5a2 2 0 0 0 -2 2v1a2 2 0 0 0 2 2"></path><path d="M16 9.5a2 2 0 0 0 -2 2v1a2 2 0 0 0 2 2"></path></svg>`;

function injectStructure() {
    const doc = pipWin.document;
    doc.body.innerHTML = `
        <div id="bg-cover"></div>
        <div id="bg-darkness"></div>
        <img id="center-art" src="" alt="">
        <canvas id="lyricCanvas"></canvas>
        <button id="back-btn">⤺ Back to tab</button>
        <div id="ui-container">
            <div id="seeker-container"><div id="seeker-bar"></div></div>
            <div id="controls">
                <button class="btn" id="mute-btn">${ICON_VOL_HIGH}</button>
                <div style="width: 0px;"></div>
                <button class="btn" id="prev">${ICON_PREV}</button>
                <button class="btn" id="playpause">${ICON_PAUSE}</button>
                <button class="btn" id="next">${ICON_NEXT}</button>
                <div style="width: 0px;"></div>
                <button class="btn" id="cc-btn" title="Translate Lyrics">${ICON_CC}</button>
            </div>
        </div>
        <div id="sync-indicator">
            <div class="sync-dot"></div>
            <span id="sync-text">UNSYNCED</span>
        </div>
        <div id="size-warning">
            <div class="warning-pill">
                <span>Window too small</span>
            </div>
            <div class="warning-subtext">
                Please resize the window to view lyrics properly.
            </div>
        </div>
        <style>
            #bg-darkness {
                position: absolute;
                inset: 0;
                background: #000;
                opacity: ${userBgDarkness / 100};
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
        </style>
    `;

    const click = (sel) => document.querySelector(sel)?.click();
    doc.getElementById('prev').onclick = () => click('[data-testid="control-button-skip-back"], .previous-button');
    doc.getElementById('next').onclick = () => click('[data-testid="control-button-skip-forward"], .next-button');
    doc.getElementById('playpause').onclick = () => click('[data-testid="control-button-playpause"], .play-pause-button');

    doc.getElementById('back-btn').onclick = () => {
        chrome.runtime.sendMessage({ type: 'FOCUS_TAB' });
        pipWin.close();
    };

    // Mute Logic — site-specific adapter
    // On Spotify, toggling media.muted directly is ignored because the player manages
    // its own internal audio state. Clicking the real native button is the only reliable way.
    // For other sites, fall back to direct DOM mutation.
    const toggleMute = () => {
        const host = window.location.hostname;
        if (host.includes('spotify.com')) {
            // Spotify's mute button `aria-label` is "Mute" when unmuted, "Unmute" when muted.
            const spotifyMuteBtn = document.querySelector(
                '[data-testid="volume-bar-toggle-mute-button"]'
            );
            if (spotifyMuteBtn) {
                spotifyMuteBtn.click();
                return;
            }
        }
        // Generic fallback for other sites (YouTube Music, etc.)
        const media = document.querySelector('video, audio');
        if (media) media.muted = !media.muted;
    };
    doc.getElementById('mute-btn').onclick = toggleMute;

    doc.getElementById('cc-btn').onclick = () => {
        showTranslation = !showTranslation;
        chrome.storage.local.set({ showTranslation });
        updateCCButtonState();
        if (typeof needsLayoutUpdate !== 'undefined') needsLayoutUpdate = true;
        if (showTranslation && typeof translateExistingLyrics === 'function') {
            translateExistingLyrics();
        }
    };

    updateCCButtonState(); // Init state

    doc.getElementById('seeker-container').onclick = (e) => {
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
    };
}

function updateCCButtonState() {
    if (!pipWin) return;
    const btn = pipWin.document.getElementById('cc-btn');
    if (btn) {
        if (showTranslation) {
            btn.classList.add('cc-active');
        } else {
            btn.classList.remove('cc-active');
        }
    }
}

function updateSyncIndicator() {
    if (!pipWin) return;
    const ind = pipWin.document.getElementById('sync-indicator');
    const txt = pipWin.document.getElementById('sync-text');
    if (ind && txt) {
        if (isCurrentLyricSynced) {
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

/**
 * Applies all current visual customization settings to the open PiP window.
 * Safe to call at any time — bails out immediately if the window isn't open.
 */
function applyVisualSettings() {
    if (!pipWin || pipWin.closed) return;
    const doc = pipWin.document;

    const bgCover = doc.getElementById('bg-cover');
    const centerArt = doc.getElementById('center-art');
    const blurPx = userBgBlur;

    if (userCoverMode === 'centered') {
        // Hide the blurred full-cover bleeding background
        if (bgCover) bgCover.style.display = 'none';

        if (centerArt) {
            centerArt.classList.add('visible');
            // Apply the user's blur to the center art, but keep it fully bright
            centerArt.style.filter = `drop-shadow(0 8px 32px rgba(0,0,0,0.65)) drop-shadow(0 2px 8px rgba(0,0,0,0.45)) blur(${blurPx}px)`;
        }

        // Set body background to a palette-derived gradient (lighter at top, darker at bottom)
        if (currentPalette && currentPalette.vibrant) {
            const baseBg = deriveDarkBg(currentPalette.vibrant);
            const topBg = deriveLightBg(currentPalette.vibrant);
            doc.body.style.background = `linear-gradient(180deg, ${topBg} 0%, ${baseBg} 100%)`;
        } else {
            doc.body.style.background = '#121212';
        }

        updateCenteredArt(getCoverArt());

    } else {
        // Restore default blurred background behavior
        if (bgCover) {
            bgCover.style.display = '';
            if (userCoverMode === 'repeated') {
                bgCover.style.backgroundSize = '400px 400px';
                bgCover.style.backgroundRepeat = 'repeat';
                bgCover.style.backgroundPosition = 'center';
            } else {
                // 'default' — original blurred full-cover
                bgCover.style.backgroundSize = 'cover';
                bgCover.style.backgroundRepeat = 'no-repeat';
                bgCover.style.backgroundPosition = 'center';
            }
            bgCover.style.filter = `blur(${blurPx}px)`;
        }

        if (centerArt) {
            centerArt.classList.remove('visible');
        }
        doc.body.style.background = ''; // clear gradient
    }

    // --- Background Darkness Overlay ---
    const bgDark = doc.getElementById('bg-darkness');
    if (bgDark) {
        bgDark.style.opacity = String(userBgDarkness / 100);
    }

    // --- Font Family (reload Google Font if needed) ---
    const systemFontNames = ['noto sans', 'segoe ui', 'sans-serif', 'arial', 'helvetica', 'serif', 'monospace'];
    const primaryFont = userFontFamily.split(',')[0].replace(/['"/]/g, '').trim().toLowerCase();
    const isSystemFont = systemFontNames.some(sf => primaryFont.includes(sf));

    // Remove any previously injected Google Font links so we don't pile them up
    doc.querySelectorAll('link[data-fl-font]').forEach(el => el.remove());

    if (!isSystemFont) {
        const formattedFontName = userFontFamily.split(',')[0].replace(/['"/]/g, '').trim().replace(/ /g, '+');
        const fontLink = doc.createElement('link');
        fontLink.rel = 'stylesheet';
        fontLink.dataset.flFont = '1'; // marker so we can remove it later
        fontLink.href = `https://fonts.googleapis.com/css2?family=${formattedFontName}:ital,wght@0,400;0,600;0,700;1,600&display=swap`;
        doc.head.appendChild(fontLink);
    }

    // Trigger layout recalculation so the canvas re-draws with the new font
    if (typeof needsLayoutUpdate !== 'undefined') needsLayoutUpdate = true;
}

/**
 * Derives a dark-ish background color from a vibrant rgb string.
 * Used as the bottom of the gradient in centered mode.
 */
function deriveDarkBg(vibrantColorStr) {
    if (!vibrantColorStr) return '#121212';
    const match = vibrantColorStr.match(/\d+/g);
    if (!match || match.length < 3) return '#121212';
    const [r, g, b] = match.map(Number);
    const hsl = rgbToHsl(r, g, b);
    // Lightness 40%, high saturation 75% — rich and clearly colored
    return hslToRgb(hsl.h, Math.max(hsl.s, 0.75), 0.40);
}

/**
 * Derives a lighter version of the palette color.
 * Used as the top of the gradient in centered mode.
 */
function deriveLightBg(vibrantColorStr) {
    if (!vibrantColorStr) return '#2a2a2a';
    const match = vibrantColorStr.match(/\d+/g);
    if (!match || match.length < 3) return '#2a2a2a';
    const [r, g, b] = match.map(Number);
    const hsl = rgbToHsl(r, g, b);
    // Lightness 60%, saturation 65% — lighter band at top, still clearly colored
    return hslToRgb(hsl.h, Math.max(hsl.s, 0.65), 0.60);
}

/**
 * Updates the <img id="center-art"> source and the body background color.
 */
function updateCenteredArt(artUrl) {
    if (!pipWin || pipWin.closed || userCoverMode !== 'centered') return;

    const img = pipWin.document.getElementById('center-art');
    if (img && artUrl) {
        img.src = artUrl;
    }

    // Delay slightly to let extractPalette finish async processing
    setTimeout(() => {
        if (!pipWin || pipWin.closed || userCoverMode !== 'centered') return;
        if (currentPalette && currentPalette.vibrant) {
            const baseBg = deriveDarkBg(currentPalette.vibrant);
            const topBg = deriveLightBg(currentPalette.vibrant);
            pipWin.document.body.style.background = `linear-gradient(180deg, ${topBg} 0%, ${baseBg} 100%)`;
        }
    }, 250);
}

const createLauncher = () => {
    const host = window.location.hostname;
    const isSpotify = host.includes('spotify');
    const isYTM = host.includes('music.youtube');

    if (!isSpotify && !isYTM) return;
    if (document.getElementById('pip-trigger')) return;

    const btn = document.createElement('button');
    btn.id = 'pip-trigger';

    // Add SVG and Text
    btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 10px; height: 10px; flex-shrink: 0;">
            <path d="M9 18V5l12-2v13"></path>
            <circle cx="6" cy="18" r="3"></circle>
            <circle cx="18" cy="16" r="3"></circle>
        </svg>
        <span style="white-space: nowrap;">FLYING LYRICS</span>
    `;

    // Common Base Styling
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
        try {
            pipWin = await window.documentPictureInPicture.requestWindow({ width: 300, height: 300 });

            const link = pipWin.document.createElement('link');
            link.rel = 'stylesheet';
            link.href = chrome.runtime.getURL('src/content/styles.css');
            pipWin.document.head.appendChild(link);

            // --- DYNAMIC FONT LOADING ---
            try {
                // Extract the first font from the stack (e.g., "'Noto Sans', 'Segoe UI'" -> "Noto Sans")
                const primaryFont = userFontFamily.split(',')[0].replace(/['"]/g, '').trim();

                // Only load if it's not a generic system font (like sans-serif, serif, Segoe UI, Arial)
                const systemFonts = ['sans-serif', 'serif', 'monospace', 'segoe ui', 'arial', 'helvetica'];
                if (!systemFonts.includes(primaryFont.toLowerCase())) {
                    const formattedFontName = primaryFont.replace(/ /g, '+');
                    const fontLink = pipWin.document.createElement('link');
                    fontLink.rel = 'stylesheet';
                    // Load typical weights: 400(Regular), 600(SemiBold), 700(Bold) + Italic variants
                    fontLink.href = `https://fonts.googleapis.com/css2?family=${formattedFontName}:ital,wght@0,400;0,600;0,700;1,600&display=swap`;
                    pipWin.document.head.appendChild(fontLink);

                    // Wait for the font to physically load into the DOM to prevent Canvas flickering
                    await pipWin.document.fonts.ready;
                }
            } catch (err) {
                console.warn("Failed to load Google Font, falling back to system fonts:", err);
            }

            injectStructure();
            applyVisualSettings();
            fetchLyrics();

            pipWin.requestAnimationFrame(renderLoop);
        } catch (e) {
            console.error("Launch Failed:", e);
        }
    };

    if (isSpotify) {
        // Spotify is a flexbox environment in the player bar
        Object.assign(btn.style, {
            marginRight: '8px',
            marginBottom: '33px',
            height: '20px'
        });

        const injectSpotify = () => {
            if (document.getElementById('pip-trigger')) return;

            // Common Spotify selectors for the right-side control area
            const rightControls = document.querySelector('.main-nowPlayingBar-right') ||
                document.querySelector('[data-testid="now-playing-widget"]') ||
                document.querySelector('.volume-bar')?.parentElement;

            if (rightControls) {
                rightControls.insertBefore(btn, rightControls.firstChild);
            } else {
                // Graceful fallback to fixed position if Spotify redesigns radically
                Object.assign(btn.style, {
                    position: 'fixed', bottom: '46px', right: '20px'
                });
                document.body.appendChild(btn);
            }
        };

        // Try injecting
        injectSpotify();

        // Observe DOM for React re-renders since Spotify dynamically replaces the player bar
        const observer = new MutationObserver(() => {
            if (!document.getElementById('pip-trigger')) {
                injectSpotify();
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

    } else if (isYTM) {
        // YouTube Music uses standard fixed positioning
        Object.assign(btn.style, {
            position: 'fixed',
            top: '80px',
            right: '20px'
        });
        document.body.appendChild(btn);
    }

    // --- AUTO-LAUNCH: First-Interaction Trigger ---
    if (autoLaunch && (!pipWin || pipWin.closed)) {
        document.addEventListener('click', () => {
            // Guard: only launch if PiP isn't already open
            if (!pipWin || pipWin.closed) {
                btn.click();
            }
        }, { once: true });
    }
};
