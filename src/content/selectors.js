(() => {
    const fl = window.FLYING_LYRICS = window.FLYING_LYRICS || {};

    // --- PLATFORM ADAPTERS ---
    fl.adapters = {
        spotify: {
            matches: () => window.location.hostname.includes('spotify.com'),
            getCurrentTime: () => {
                const timeEl = document.querySelector('[data-testid="playback-position"]');
                return timeEl ? (fl.parseTime ? fl.parseTime(timeEl.textContent) : 0) : null;
            },
            getDuration: () => {
                const durationEl = document.querySelector('[data-testid="playback-duration"]');
                return durationEl ? (fl.parseTime ? fl.parseTime(durationEl.textContent) : 1) : null;
            },
            isPaused: () => {
                const playBtn = document.querySelector('[data-testid="control-button-playpause"]');
                return playBtn ? playBtn.getAttribute('aria-label') === 'Play' : true;
            },
            getCoverArt: () => {
                const spotiImg = document.querySelector('[data-testid="now-playing-widget"] img') ||
                    document.querySelector('img[data-testid="cover-art-image"]');
                return spotiImg ? spotiImg.src : null;
            },
            clickPlayPause: () => {
                document.querySelector('[data-testid="control-button-playpause"]')?.click();
            },
            clickPrev: () => {
                document.querySelector('[data-testid="control-button-skip-back"]')?.click();
            },
            clickNext: () => {
                document.querySelector('[data-testid="control-button-skip-forward"]')?.click();
            },
            toggleMute: () => {
                document.querySelector('[data-testid="volume-bar-toggle-mute-button"]')?.click();
            },
            isMuted: () => {
                const muteToggleBtn = document.querySelector('[data-testid="volume-bar-toggle-mute-button"]');
                return muteToggleBtn ? muteToggleBtn.getAttribute('aria-label') === 'Unmute' : false;
            },
            seek: (percent) => {
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
            }
        },
        ytmusic: {
            matches: () => window.location.hostname.includes('music.youtube.com'),
            getCurrentTime: () => {
                const pb = document.querySelector('#progress-bar.ytmusic-player-bar');
                return pb ? parseFloat(pb.getAttribute('aria-valuenow')) : null;
            },
            getDuration: () => {
                const pb = document.querySelector('#progress-bar.ytmusic-player-bar');
                return pb ? parseFloat(pb.getAttribute('aria-valuemax')) : null;
            },
            isPaused: () => {
                const vid = document.querySelector('video');
                return vid ? vid.paused : true;
            },
            getCoverArt: () => {
                const ytImg = document.querySelector('.ytmusic-player-bar img');
                return ytImg ? ytImg.src : null;
            },
            clickPlayPause: () => {
                const media = document.querySelector('video, audio');
                // Guard: only play/pause YTM if a track is loaded with valid duration
                if (media && media.duration && !isNaN(media.duration)) {
                    document.querySelector('[data-testid="control-button-playpause"], .play-pause-button')?.click();
                }
            },
            clickPrev: () => {
                document.querySelector('.previous-button')?.click();
            },
            clickNext: () => {
                document.querySelector('.next-button')?.click();
            },
            toggleMute: () => {
                const media = document.querySelector('video, audio');
                if (media) media.muted = !media.muted;
            },
            isMuted: () => {
                const media = document.querySelector('audio') || document.querySelector('video, audio');
                return media ? (media.muted || media.volume === 0) : false;
            },
            seek: (percent) => {
                const s = document.createElement('script');
                s.src = chrome.runtime.getURL('src/content/inject.js');
                s.dataset.percent = percent;
                s.onload = function() { 
                    this.remove(); 
                };
                s.onerror = function() {
                    chrome.runtime.sendMessage({
                        type: 'TRACK_EVENT',
                        payload: {
                            eventName: 'context_failure',
                            params: { failure_reason: 'script_injection_failed' }
                        }
                    });
                    this.remove();
                };
                (document.head || document.documentElement).appendChild(s);
            }
        }
    };

    // Helper to get active platform adapter or null
    fl.getActiveAdapter = () => {
        if (fl.adapters.spotify.matches()) return fl.adapters.spotify;
        if (fl.adapters.ytmusic.matches()) return fl.adapters.ytmusic;
        return null;
    };

})();
