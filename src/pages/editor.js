document.addEventListener('DOMContentLoaded', () => {
    const subtitle = document.getElementById('track-subtitle');
    const editor = document.getElementById('lyric-editor');
    const saveBtn = document.getElementById('save-btn');
    const toast = document.getElementById('status-toast');

    let currentTrackFound = false;
    let lastSavedText = '';

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
