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

    // 3. CTA closes the onboarding tab
    btnClose.addEventListener('click', () => {
        chrome.tabs.getCurrent((tab) => {
            if (tab && tab.id) {
                chrome.tabs.remove(tab.id);
            } else {
                // Fallback if tab context is not fully loaded
                window.close();
            }
        });
    });
});
