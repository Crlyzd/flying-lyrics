const LANGUAGES = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'it', name: 'Italian' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'zh-CN', name: 'Chinese (Simplified)' },
    { code: 'zh-TW', name: 'Chinese (Traditional)' },
    { code: 'ru', name: 'Russian' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'id', name: 'Indonesian' },
    { code: 'vi', name: 'Vietnamese' },
    { code: 'th', name: 'Thai' }
];

document.addEventListener('DOMContentLoaded', () => {
    const toggleTrans = document.getElementById('toggle-translation');
    const langSelect = document.getElementById('lang-select');
    const offsetMinus = document.getElementById('offset-minus');
    const offsetPlus = document.getElementById('offset-plus');
    const offsetDisplay = document.getElementById('offset-display');

    // Populate Languages
    LANGUAGES.forEach(lang => {
        const option = document.createElement('option');
        option.value = lang.code;
        option.textContent = lang.name;
        langSelect.appendChild(option);
    });

    // Load Saved Settings
    chrome.storage.local.get({
        showTranslation: true,
        translationLang: 'id',
        syncOffset: 400
    }, (items) => {
        toggleTrans.checked = items.showTranslation;
        langSelect.value = items.translationLang;
        updateOffsetDisplay(items.syncOffset);
    });

    // Listen for changes from Content Script (PiP)
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.showTranslation) {
            toggleTrans.checked = changes.showTranslation.newValue;
        }
    });

    // Request current effective offset (in case song-specific offset is active)
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_SYNC_OFFSET' }, (response) => {
                if (response && response.syncOffset !== undefined) {
                    updateOffsetDisplay(response.syncOffset);
                }
            });
        }
    });

    // Listen for SETTINGS_UPDATE broadcast from content.js (e.g. song change)
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'SETTINGS_UPDATE' && msg.payload.syncOffset !== undefined) {
            updateOffsetDisplay(msg.payload.syncOffset);
        }
    });

    // --- Event Listeners ---

    // 1. Toggle Translation
    toggleTrans.addEventListener('change', () => {
        const val = toggleTrans.checked;
        saveAndNotify({ showTranslation: val });
    });

    // 2. Language Change
    langSelect.addEventListener('change', () => {
        const val = langSelect.value;
        saveAndNotify({ translationLang: val });
    });

    // 3. Offset Controls
    offsetMinus.addEventListener('click', () => adjustOffset(-100));
    offsetPlus.addEventListener('click', () => adjustOffset(100));

    function adjustOffset(delta) {
        chrome.storage.local.get({ syncOffset: 0 }, (items) => {
            let newOffset = items.syncOffset + delta;
            updateOffsetDisplay(newOffset);
            saveAndNotify({ syncOffset: newOffset });
        });
    }

    function updateOffsetDisplay(val) {
        offsetDisplay.textContent = (val > 0 ? '+' : '') + val;
    }

    function saveAndNotify(changes) {
        chrome.storage.local.set(changes, () => {
            // Notify active tab's content script
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]?.id) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        type: 'SETTINGS_UPDATE',
                        payload: changes
                    });
                }
            });
        });
    }
});
