// =========================================================
//  popup-ui.js
//  Tab navigation, version tag, language dropdown, and
//  the snoozable Review Toast event system.
//
//  Depends on: popup-state.js (window.FLYING_LYRICS.popup)
//  Must be loaded after popup-state.js.
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
    const popup  = window.FLYING_LYRICS.popup;
    // el is set by popup-state.js's own DOMContentLoaded listener.
    // Both listeners fire in load order, so el is guaranteed populated here.
    const el     = popup.el;
    const storage = window.FLYING_LYRICS.storage;

    // =========================================================
    //  LANGUAGE DROPDOWN POPULATION
    // =========================================================
    popup.LANGUAGES.forEach(lang => {
        const option = document.createElement('option');
        option.value = lang.code;
        option.textContent = lang.name;
        el.langSelect.appendChild(option);
    });

    // "Request a language" as the last option in the dropdown
    const requestLangOption = document.createElement('option');
    requestLangOption.value = 'request_language';
    requestLangOption.textContent = '+ Request a language...';
    el.langSelect.appendChild(requestLangOption);

    // =========================================================
    //  DYNAMIC VERSION DISPLAY
    // =========================================================
    if (el.appVersion) {
        const manifest = chrome.runtime.getManifest();
        el.appVersion.textContent = `v${manifest.version}`;
    }

    // =========================================================
    //  REVIEW TOAST — open-count tracking & toast visibility
    // =========================================================

    /** Marks the UI to show the user has already reviewed. */
    function markAsRated(rating) {
        if (el.footerStarStrip) {
            el.footerStarStrip.classList.add('rated');
            el.footerStarStrip.dataset.rating = rating || 5;
        }
        if (el.starLabel) el.starLabel.textContent = 'Thanks!';
    }

    /** Opens the correct Web Store review page and marks the user as having reviewed. */
    function openReviewPage(rating = 5) {
        storage.set({ hasReviewed: true, reviewRating: rating });
        markAsRated(rating);
        el.reviewToast.classList.remove('review-toast--visible');
        chrome.tabs.create({ url: popup.getReviewUrl() });
    }

    /** Shows the review toast and persists a re-show flag. */
    function showReviewToast() {
        el.reviewToast.classList.add('review-toast--visible');
        // Persist a flag so the toast re-appears if the popup is closed without acting on it
        storage.set({ reviewToastPending: true });
    }

    // Track popup opens; determine whether to show the toast on this open.
    storage.get(
        { popupOpenCount: 0, hasReviewed: false, reviewRating: 5, snoozeUntilCount: 0,
          firstInstalledAt: 0, helpClickCount: 0, milestone7DayShown: false, reviewToastPending: false,
          reviewToastBaseTime: 0 },
        (data) => {
            const newCount = data.popupOpenCount + 1;
            storage.set({ popupOpenCount: newCount });

            // Record first install timestamp on the very first popup open
            if (!data.firstInstalledAt) {
                storage.set({ firstInstalledAt: Date.now() });
            }

            // Also record the review toast base time if not set yet
            if (!data.reviewToastBaseTime) {
                storage.set({ reviewToastBaseTime: data.firstInstalledAt || Date.now() });
            }

            if (data.hasReviewed) {
                markAsRated(data.reviewRating);
                return; // Already reviewed — never show toast again
            }

            // installedAt hoisted here so the help-button logic below always has it in scope.
            const installedAt = data.firstInstalledAt || Date.now();
            const reviewToastBaseTime = data.reviewToastBaseTime || installedAt;

            // --- Pending flag: toast was shown but popup closed before user acted on it ---
            // Re-surface immediately on next open until explicitly dismissed via ✕ or snooze.
            if (data.reviewToastPending) {
                showReviewToast();
            } else {
                // --- Trigger 1: Count thresholds (5th and 20th open) ---
                const isCountThreshold = (newCount === 5 || newCount === 20);

                // --- Trigger 2: Snooze expiry (user clicked "Later" before) ---
                const isSnoozedThresholdReached =
                    data.snoozeUntilCount > 0 && newCount >= data.snoozeUntilCount;

                // --- Trigger 3: 7-day milestone (fires only once, guarded by stored flag) ---
                const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
                const is7DayMilestone =
                    !data.milestone7DayShown &&     // guard: only fire once
                    newCount > 3 &&                 // at least 3 opens (not a brand-new user)
                    (Date.now() - reviewToastBaseTime) >= sevenDaysMs;

                if (isCountThreshold || isSnoozedThresholdReached || is7DayMilestone) {
                    if (is7DayMilestone) {
                        storage.set({ milestone7DayShown: true });
                    }
                    showReviewToast();
                }
            }

            // --- Help button: show within first 3 days if opened >= 10 times and clicked < 10 times ---
            const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
            const withinThreeDays = (Date.now() - installedAt) <= threeDaysMs;
            const tooManyOpens    = newCount >= 10;
            const clickedTooMuch  = (data.helpClickCount || 0) >= 10;
            // Help button: show/hide via .hidden class (initial state set by HTML class)
            if (el.btnOpenHelp) {
                el.btnOpenHelp.classList.toggle('hidden', !(withinThreeDays && tooManyOpens && !clickedTooMuch));
            }
        }
    );

    // Clicking the toast text → open the store review page (defaults to 5 stars)
    el.reviewToastText.addEventListener('click', () => openReviewPage(5));

    // "Later" snooze → resurface after 10 more popup opens
    el.snoozeToastBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        storage.get({ popupOpenCount: 0 }, ({ popupOpenCount }) => {
            storage.set({ snoozeUntilCount: popupOpenCount + 10, reviewToastPending: false });
        });
        el.reviewToast.classList.remove('review-toast--visible');
    });

    // ✕ dismiss — clear the pending flag so the toast doesn't re-appear next open
    el.closeToastBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        storage.set({ reviewToastPending: false });
        el.reviewToast.classList.remove('review-toast--visible');
    });

    // Footer star strip → record exact rating and open review
    if (el.footerStarStrip) {
        const stars = el.footerStarStrip.querySelectorAll('span');
        stars.forEach((star, index) => {
            star.addEventListener('click', (e) => {
                e.stopPropagation();
                openReviewPage(index + 1);
            });
        });
    }

    // Help button → open welcome/tutorial page in a new tab
    if (el.btnOpenHelp) {
        el.btnOpenHelp.addEventListener('click', () => {
            storage.get({ helpClickCount: 0 }, (res) => {
                const newClickCount = (res.helpClickCount || 0) + 1;
                storage.set({ helpClickCount: newClickCount });
                // If it reaches 10, hide it immediately via class
                if (newClickCount >= 10) {
                    el.btnOpenHelp.classList.add('hidden');
                }
            });
            chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/welcome.html') });
        });
    }

    // =========================================================
    //  TAB NAVIGATION
    // =========================================================

    /**
     * Activates the given tab pane and marks the corresponding
     * tab button as active. All other tabs are deactivated.
     * @param {string} tabId  The data-tab value (e.g. "lyrics", "visuals")
     */
    function switchTab(tabId) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.toggle('active', pane.id === `tab-${tabId}`);
        });
    }

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
    });

    // =========================================================
    //  STORAGE CHANGE LISTENER
    //  Listens for live changes pushed from the content script
    //  so the popup UI stays in sync without requiring a reload.
    // =========================================================
    chrome.storage.onChanged.addListener((changes, namespace) => {
        // Sync translation toggle if changed externally
        if ((namespace === 'local' || namespace === 'sync') && changes.showTranslation) {
            el.toggleTrans.checked = changes.showTranslation.newValue;
        }
        // Live-update the glow preview color when content script extracts a new palette.
        // currentVibrantColor is written to chrome.storage.local by extractPalette() on every
        // album art change, so this fires without any polling.
        if (namespace === 'local' && changes.currentVibrantColor) {
            el.glowPreview.style.setProperty('--glow-color', changes.currentVibrantColor.newValue);
        }
    });

    // Expose switchTab globally so other modules (e.g. popup-lyrics.js)
    // can programmatically navigate to a specific tab if needed.
    popup.switchTab = switchTab;
});
