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
        <style>
            #back-btn {
                position: absolute; top: 15px; left: 15px;
                background: rgba(255,255,255,0.2); border: none;
                color: white; padding: 8px 15px; border-radius: 20px;
                font-weight: bold; cursor: pointer; backdrop-filter: blur(5px);
                font-family: ${userFontFamily}; opacity: 0; transition: opacity 0.2s;
                z-index: 20;
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

const createLauncher = () => {
    const host = window.location.hostname;
    if (!host.includes('spotify') && !host.includes('music.youtube')) return;

    if (document.getElementById('pip-trigger')) return;
    const btn = document.createElement('button');
    btn.id = 'pip-trigger';

    // Add SVG and Text
    btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 10px; height: 10px;">
            <path d="M9 18V5l12-2v13"></path>
            <circle cx="6" cy="18" r="3"></circle>
            <circle cx="18" cy="16" r="3"></circle>
        </svg>
        <span>FLYING LYRICS</span>
    `;

    const isSpotify = host.includes('spotify');

    Object.assign(btn.style, {
        position: 'fixed', zIndex: 99999,
        ...(isSpotify
            ? { bottom: '46px', left: '975px', top: 'unset', right: 'unset' }
            : { top: '80px', right: '20px', bottom: 'unset', left: 'unset' }),
        padding: '3px 8px', background: '#1DB954', color: '#fff',
        border: 'none', borderRadius: '50px', cursor: 'pointer',
        fontWeight: 'bold', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        display: 'flex', alignItems: 'center', gap: '3px',
        fontSize: '8px', transition: 'transform 0.1s ease, background 0.2s ease'
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
            fetchLyrics();

            pipWin.requestAnimationFrame(renderLoop);
        } catch (e) {
            console.error("Launch Failed:", e);
        }
    };

    document.body.appendChild(btn);

    // --- AUTO-LAUNCH: First-Interaction Trigger ---
    // Browsers require a user gesture to open a Picture-in-Picture window.
    // If auto-launch is enabled, we attach a one-time listener to the document
    // so the lyrics window opens on the user's very first click on the page.
    if (autoLaunch && (!pipWin || pipWin.closed)) {
        document.addEventListener('click', () => {
            // Guard: only launch if PiP isn't already open
            if (!pipWin || pipWin.closed) {
                btn.click();
            }
        }, { once: true });
    }
};
