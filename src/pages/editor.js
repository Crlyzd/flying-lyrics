document.addEventListener('DOMContentLoaded', () => {
    const subtitle = document.getElementById('track-subtitle');
    const editor = document.getElementById('lyric-editor');
    const saveBtn = document.getElementById('save-btn');
    const toast = document.getElementById('status-toast');

    let currentTrackFound = false;
    let lastSavedText = '';
    let currentArtist = '';
    let currentTitle = '';

    // =========================================================
    //  THEME / ACCENT COLOR REFLECTION
    // =========================================================
    const themeDefaults = {
        popupBgAnimation: true,
        popupColor1: '#ff007f',
        popupColor2: '#00b4d8',
        popupColor3: '#1DB954',
        galaxyMode: false
    };

    function hexToRgba(hex, alpha) {
        let r = parseInt(hex.slice(1, 3), 16);
        let g = parseInt(hex.slice(3, 5), 16);
        let b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function applyPeachFilterAndClamp(hex) {
        return hex; // Simply return the raw color, no more clamping or peach blending!
    }

    function getContrastColor(hex) {
        if (!hex) return '#ffffff';
        let r = parseInt(hex.slice(1, 3), 16);
        let g = parseInt(hex.slice(3, 5), 16);
        let b = parseInt(hex.slice(5, 7), 16);
        let yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        return (yiq >= 140) ? '#000000' : '#ffffff';
    }

    function getReadableForeground(hex) {
        if (!hex) return '#ffffff';
        let r = parseInt(hex.slice(1, 3), 16);
        let g = parseInt(hex.slice(3, 5), 16);
        let b = parseInt(hex.slice(5, 7), 16);
        let yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
        
        if (yiq < 90) {
            // Boost brightness for readability on dark backgrounds
            // Mix 30% of raw color with 70% white to boost lightness while preserving hue
            let brR = Math.min(255, Math.round(r * 0.3 + 255 * 0.7));
            let brG = Math.min(255, Math.round(g * 0.3 + 255 * 0.7));
            let brB = Math.min(255, Math.round(b * 0.3 + 255 * 0.7));
            
            let outR = brR.toString(16).padStart(2, '0');
            let outG = brG.toString(16).padStart(2, '0');
            let outB = brB.toString(16).padStart(2, '0');
            return `#${outR}${outG}${outB}`;
        }
        return hex;
    }

    function applyTheme(theme) {
        const root = document.documentElement;
        const c1 = theme.popupColor1 || themeDefaults.popupColor1;
        const c2 = theme.popupColor2 || themeDefaults.popupColor2;
        const c3 = theme.popupColor3 || themeDefaults.popupColor3;
        const bgAnim = theme.popupBgAnimation !== undefined ? theme.popupBgAnimation : themeDefaults.popupBgAnimation;
        const galaxyMode = theme.galaxyMode ?? false;

        const f1 = applyPeachFilterAndClamp(c1);
        const f2 = applyPeachFilterAndClamp(c2);
        const f3 = applyPeachFilterAndClamp(c3);

        const contrast1 = getContrastColor(f1);
        const contrast2 = getContrastColor(f2);
        const contrast3 = getContrastColor(f3);

        const fore1 = getReadableForeground(f1);
        const fore2 = getReadableForeground(f2);
        const fore3 = getReadableForeground(f3);

        root.style.setProperty('--accent-1', f1);
        root.style.setProperty('--accent-2', f2);
        root.style.setProperty('--accent-3', f3);
        root.style.setProperty('--accent', f1);
        root.style.setProperty('--accent-blue', f2);
        root.style.setProperty('--accent-green', f3);
        
        root.style.setProperty('--accent-1-contrast', contrast1);
        root.style.setProperty('--accent-2-contrast', contrast2);
        root.style.setProperty('--accent-3-contrast', contrast3);
        root.style.setProperty('--accent-contrast', contrast1);
        root.style.setProperty('--accent-blue-contrast', contrast2);
        root.style.setProperty('--accent-green-contrast', contrast3);

        root.style.setProperty('--accent-1-foreground', fore1);
        root.style.setProperty('--accent-2-foreground', fore2);
        root.style.setProperty('--accent-3-foreground', fore3);
        root.style.setProperty('--accent-foreground', fore1);
        root.style.setProperty('--accent-blue-foreground', fore2);
        root.style.setProperty('--accent-green-foreground', fore3);

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
            document.body.classList.add('loaded');
            setTimeout(() => {
                document.body.classList.remove('preload');
            }, 100);
        });
    } else if (window.FLYING_LYRICS && window.FLYING_LYRICS.storage) {
        window.FLYING_LYRICS.storage.get(themeDefaults, (theme) => {
            applyTheme(theme);
            document.body.classList.add('loaded');
            setTimeout(() => {
                document.body.classList.remove('preload');
            }, 100);
        });
    } else {
        document.body.classList.add('loaded');
        setTimeout(() => {
            document.body.classList.remove('preload');
        }, 100);
    }

    // Listen to changes in chrome.storage
    chrome.storage.onChanged.addListener((changes, namespace) => {
        const hasThemeKeys = ['popupColor1', 'popupColor2', 'popupColor3', 'popupBgAnimation', 'galaxyMode'].some(key => key in changes);
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
                    currentArtist = response.artist;
                    currentTitle = response.title;
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

    // Listen for editor status requests from the popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'GET_EDITOR_STATUS') {
            sendResponse({
                artist: currentArtist,
                title: currentTitle
            });
        }
    });
});
