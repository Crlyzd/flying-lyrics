// src/pages/welcome.js

document.addEventListener('DOMContentLoaded', () => {
    const consentCheckbox = document.getElementById('consent-checkbox');
    const toggleCard = document.getElementById('toggle-card');
    const btnClose = document.getElementById('btn-close');

    // Store the welcome page's own tab ID in local storage
    chrome.tabs.getCurrent((tab) => {
        if (tab && tab.id) {
            FLYING_LYRICS.storage.set({ welcomeTabId: tab.id });
        }
    });

    // 1. Initialise the checkbox status from chrome.storage.local
    FLYING_LYRICS.storage.get({ telemetryConsent: true }, (items) => {
        consentCheckbox.checked = !!items.telemetryConsent;
    });

    // 2. Persist consent selection immediately on click
    consentCheckbox.addEventListener('change', () => {
        const consentGranted = consentCheckbox.checked;
        FLYING_LYRICS.storage.set({ telemetryConsent: consentGranted });
    });

    // Click container card toggles checkbox
    toggleCard.addEventListener('click', (e) => {
        // Prevent recursive trigger when clicking checkbox directly
        if (e.target !== consentCheckbox && !e.target.classList.contains('slider') && !e.target.classList.contains('switch')) {
            consentCheckbox.checked = !consentCheckbox.checked;
            // Dispatch change event to trigger persistence handler
            consentCheckbox.dispatchEvent(new Event('change'));
        }
    });

    // 3. CTA closes the onboarding tab and redirects to music player
    btnClose.addEventListener('click', () => {
        chrome.tabs.query({}, (tabs) => {
            const musicTabs = tabs.filter(t => 
                t.url && (t.url.includes('open.spotify.com') || t.url.includes('music.youtube.com'))
            );

            // Sort to prioritize audible tabs, then most recently accessed
            musicTabs.sort((a, b) => {
                if (a.audible && !b.audible) return -1;
                if (!a.audible && b.audible) return 1;
                return (b.lastAccessed || 0) - (a.lastAccessed || 0);
            });

            const musicTab = musicTabs[0];

            const closeWelcomeTab = () => {
                chrome.tabs.getCurrent((tab) => {
                    if (tab && tab.id) {
                        chrome.tabs.remove(tab.id);
                    } else {
                        window.close();
                    }
                });
            };

            if (musicTab) {
                chrome.tabs.update(musicTab.id, { active: true });
                chrome.windows.update(musicTab.windowId, { focused: true }, () => {
                    chrome.tabs.reload(musicTab.id);
                    closeWelcomeTab();
                });
            } else {
                chrome.tabs.create({ url: 'https://music.youtube.com' }, () => {
                    closeWelcomeTab();
                });
            }
        });
    });
});
