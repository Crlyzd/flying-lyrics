document.addEventListener('DOMContentLoaded', () => {
    const subtitle = document.getElementById('track-subtitle');
    const editor = document.getElementById('lyric-editor');
    const saveBtn = document.getElementById('save-btn');
    const toast = document.getElementById('status-toast');

    let currentTrackFound = false;
    let lastSavedText = '';

    // =========================================================
    //  THEME / ACCENT COLOR REFLECTION
    // =========================================================
    const themeDefaults = {
        popupBgAnimation: true,
        popupColor1: '#ff007f',
        popupColor2: '#00b4d8',
        popupColor3: '#1DB954',
        galaxyMode: false,
        partyMode: false
    };

    function hexToRgba(hex, alpha) {
        let r = parseInt(hex.slice(1, 3), 16);
        let g = parseInt(hex.slice(3, 5), 16);
        let b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function applyPeachFilterAndClamp(hex) {
        if (!hex) return hex;
        let r = parseInt(hex.slice(1, 3), 16);
        let g = parseInt(hex.slice(3, 5), 16);
        let b = parseInt(hex.slice(5, 7), 16);

        let mixedR = Math.round(r * 0.6 + 255 * 0.4);
        let mixedG = Math.round(g * 0.6 + 170 * 0.4);
        let mixedB = Math.round(b * 0.6 + 128 * 0.4);

        let normR = mixedR / 255, normG = mixedG / 255, normB = mixedB / 255;
        let max = Math.max(normR, normG, normB), min = Math.min(normR, normG, normB);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0;
        } else {
            let d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case normR: h = (normG - normB) / d + (normG < normB ? 6 : 0); break;
                case normG: h = (normB - normR) / d + 2; break;
                case normB: h = (normR - normG) / d + 4; break;
            }
            h /= 6;
        }

        h = Math.round(h * 360);
        s = Math.round(s * 100);
        l = Math.round(l * 100);

        l = Math.max(50, Math.min(l, 78));

        s /= 100; l /= 100;
        let c = (1 - Math.abs(2 * l - 1)) * s;
        let x = c * (1 - Math.abs((h / 60) % 2 - 1));
        let m = l - c / 2;
        let finalR = 0, finalG = 0, finalB = 0;

        if (0 <= h && h < 60) { finalR = c; finalG = x; finalB = 0; }
        else if (60 <= h && h < 120) { finalR = x; finalG = c; finalB = 0; }
        else if (120 <= h && h < 180) { finalR = 0; finalG = c; finalB = x; }
        else if (180 <= h && h < 240) { finalR = 0; finalG = x; finalB = c; }
        else if (240 <= h && h < 300) { finalR = x; finalG = 0; finalB = c; }
        else if (300 <= h && h < 360) { finalR = c; finalG = 0; finalB = x; }

        let outR = Math.round((finalR + m) * 255).toString(16).padStart(2, '0');
        let outG = Math.round((finalG + m) * 255).toString(16).padStart(2, '0');
        let outB = Math.round((finalB + m) * 255).toString(16).padStart(2, '0');

        return `#${outR}${outG}${outB}`;
    }

    function applyTheme(theme) {
        const root = document.documentElement;
        const c1 = theme.popupColor1 || themeDefaults.popupColor1;
        const c2 = theme.popupColor2 || themeDefaults.popupColor2;
        const c3 = theme.popupColor3 || themeDefaults.popupColor3;
        const bgAnim = theme.popupBgAnimation !== undefined ? theme.popupBgAnimation : themeDefaults.popupBgAnimation;
        const galaxyMode = theme.galaxyMode !== undefined ? theme.galaxyMode : (theme.partyMode !== undefined ? theme.partyMode : false);

        const f1 = applyPeachFilterAndClamp(c1);
        const f2 = applyPeachFilterAndClamp(c2);
        const f3 = applyPeachFilterAndClamp(c3);

        root.style.setProperty('--accent-1', f1);
        root.style.setProperty('--accent-2', f2);
        root.style.setProperty('--accent-3', f3);
        root.style.setProperty('--accent', f1);
        root.style.setProperty('--accent-blue', f2);
        root.style.setProperty('--accent-green', f3);
        
        root.style.setProperty('--raw-accent-1', c1);
        root.style.setProperty('--raw-accent-2', c2);
        root.style.setProperty('--raw-accent-3', c3);
        root.style.setProperty('--raw-accent', c1);
        root.style.setProperty('--raw-accent-blue', c2);
        root.style.setProperty('--raw-accent-green', c3);
        
        root.style.setProperty('--accent-bg', hexToRgba(f1, 0.08));
        root.style.setProperty('--accent-glow', hexToRgba(f1, 0.45));

        document.body.classList.toggle('bg-frozen', !bgAnim);
        root.classList.toggle('theme-classic', !galaxyMode);
    }

    // Load initial theme settings using FLYING_LYRICS.storage
    if (window.window.FLYING_LYRICS && window.window.FLYING_LYRICS.storage) {
        window.window.FLYING_LYRICS.storage.get(themeDefaults, (theme) => {
            applyTheme(theme);
        });
    } else if (window.FLYING_LYRICS && window.FLYING_LYRICS.storage) {
        window.FLYING_LYRICS.storage.get(themeDefaults, (theme) => {
            applyTheme(theme);
        });
    }

    // Listen to changes in chrome.storage
    chrome.storage.onChanged.addListener((changes, namespace) => {
        const hasThemeKeys = ['popupColor1', 'popupColor2', 'popupColor3', 'popupBgAnimation', 'galaxyMode', 'partyMode'].some(key => key in changes);
        if (hasThemeKeys) {
            if (window.FLYING_LYRICS && window.FLYING_LYRICS.storage) {
                window.FLYING_LYRICS.storage.get(themeDefaults, (theme) => {
                    applyTheme(theme);
                });
            }
        }
    });

    // Retrieve active track and lyrics
    chrome.tabs.query({ url: ["*://open.spotify.com/*", "*://music.youtube.com/*"] }, (tabs) => {
        tabs.forEach(tab => {
            if (!tab.id) return;

            // Get Current Track
            chrome.tabs.sendMessage(tab.id, { type: 'GET_CURRENT_TRACK' }, (response) => {
                if (chrome.runtime.lastError) return;
                if (currentTrackFound) return;

                if (response && response.artist && response.title) {
                    currentTrackFound = true;
                    subtitle.textContent = `Editing: ${response.artist} - ${response.title}`;
                }
            });

            // Get current LRC text
            chrome.tabs.sendMessage(tab.id, { type: 'GET_LYRIC_LRC' }, (response) => {
                if (chrome.runtime.lastError) return;
                if (response && response.lrcText !== undefined) {
                    editor.value = response.lrcText;
                    lastSavedText = response.lrcText;
                }
            });
        });
    });

    function showToast() {
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 2000);
    }

    function saveLyrics() {
        const rawText = editor.value;
        lastSavedText = rawText;

        // Send SETTINGS_UPDATE with lyricOverride to all active music tabs.
        // The content script will handle persisting it to lyricsOverrides for the current track key.
        const changes = { lyricOverride: { type: 'local', data: rawText } };

        chrome.tabs.query({ url: ["*://open.spotify.com/*", "*://music.youtube.com/*"] }, (tabs) => {
            tabs.forEach(tab => {
                if (tab.id) {
                    chrome.tabs.sendMessage(tab.id, {
                        type: 'SETTINGS_UPDATE',
                        payload: changes
                    }, () => {
                        if (chrome.runtime.lastError) return;
                    });
                }
            });
        });

        showToast();

        // Light up the save button
        saveBtn.classList.add('saved');
        setTimeout(() => {
            saveBtn.classList.remove('saved');
        }, 800);
    }

    // Save on button click
    saveBtn.addEventListener('click', () => {
        saveLyrics();
    });

    // Save on Ctrl+S
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveLyrics();
        }
    });

    // Warn on close if unsaved
    window.addEventListener('beforeunload', (e) => {
        if (editor.value !== lastSavedText) {
            e.preventDefault();
            e.returnValue = ''; // Required to trigger Chrome's native "Leave Site" dialog
        }
    });
});
