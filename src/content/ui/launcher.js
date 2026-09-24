(() => {
    const fl = window.FLYING_LYRICS;

    // ─────────────────────────────────────────────────────────────────────────────
    //  FLYING LYRICS — FLOATING LAUNCHER & AUTO-LAUNCH LISTENER (content UI context)
    // ─────────────────────────────────────────────────────────────────────────────

    fl.createLauncher = function () {
        const host = window.location.hostname;
        const isSpotify = host.includes('spotify');
        const isYTM = host.includes('music.youtube');

        if (!isSpotify && !isYTM) return;
        if (document.getElementById('pip-trigger')) return;

        const btn = document.createElement('button');
        btn.id = 'pip-trigger';

        btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 10px; height: 10px; flex-shrink: 0;">
            <path d="M9 18V5l12-2v13"></path>
            <circle cx="6" cy="18" r="3"></circle>
            <circle cx="18" cy="16" r="3"></circle>
        </svg>
        <span style="white-space: nowrap;">FLYING LYRICS</span>
    `;

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

        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await fl.launchPip();
        });

        if (isSpotify) {
            Object.assign(btn.style, {
                marginRight: '8px',
                marginBottom: '33px',
                height: '20px'
            });

            const injectSpotify = () => {
                if (document.getElementById('pip-trigger')) return;

                const rightControls = document.querySelector('.main-nowPlayingBar-right') ||
                    document.querySelector('[data-testid="now-playing-widget"]') ||
                    document.querySelector('.volume-bar')?.parentElement;

                if (rightControls) {
                    rightControls.insertBefore(btn, rightControls.firstChild);
                } else {
                    Object.assign(btn.style, {
                        position: 'fixed', bottom: '46px', right: '20px'
                    });
                    document.body.appendChild(btn);
                }
            };

            injectSpotify();


        } else if (isYTM) {
            Object.assign(btn.style, {
                position: 'fixed',
                top: '80px',
                right: '20px'
            });
            document.body.appendChild(btn);
        }

        if (fl.pipMode === 'video' && typeof fl.prepareVideoPip === 'function') {
            fl.prepareVideoPip();
        }
    };

    // Global auto-launch click listener
    document.addEventListener('click', () => {
        if (fl.autoLaunch && !fl.hasAutoLaunched && (!fl.pipWin || fl.pipWin.closed)) {
            const btn = document.getElementById('pip-trigger');
            if (btn) {
                btn.click();
            }
        }
    });

})();
