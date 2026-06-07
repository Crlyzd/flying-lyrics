// src/pages/welcome.js

document.addEventListener('DOMContentLoaded', () => {
    const consentCheckbox = document.getElementById('consent-checkbox');
    const toggleCard = document.getElementById('toggle-card');
    const btnClose = document.getElementById('btn-close');

    // 1. Initialise the checkbox status from chrome.storage.local
    chrome.storage.local.get({ telemetryConsent: true }, (items) => {
        consentCheckbox.checked = !!items.telemetryConsent;
    });

    // 2. Persist consent selection immediately on click
    consentCheckbox.addEventListener('change', () => {
        const consentGranted = consentCheckbox.checked;
        chrome.storage.local.set({ telemetryConsent: consentGranted });
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
            const musicTab = tabs.find(t => 
                t.url && (t.url.includes('open.spotify.com') || t.url.includes('music.youtube.com'))
            );

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
