/**
 * update.js
 *
 * Handles runtime logic for the update notification page (src/pages/update.html).
 * - Detects which store the extension was installed from (Chrome vs Edge)
 *   using chrome.runtime.id and redirects accordingly.
 * - Dismisses the tab when the user clicks "No thanks".
 */

(function () {
    // Extension IDs — used to differentiate Chrome Web Store vs Edge Add-ons installs.
    // Edge users who installed from the Chrome Web Store will match CHROME_EXT_ID.
    const EDGE_EXT_ID = 'ipcakmeelnooilncnjinnfjcodejbcoa';

    const CHROME_REVIEW_URL = 'https://chrome.google.com/webstore/detail/ehjobcjhlmgmpaikciicipmlpknipikd/reviews';
    const EDGE_REVIEW_URL   = 'https://microsoftedge.microsoft.com/addons/detail/flying-lyrics-romanize-/ipcakmeelnooilncnjinnfjcodejbcoa';

    /**
     * Returns the correct review URL for the store the user installed from.
     * @returns {string}
     */
    function getReviewUrl() {
        try {
            return chrome.runtime.id === EDGE_EXT_ID ? EDGE_REVIEW_URL : CHROME_REVIEW_URL;
        } catch {
            // Fallback if API is unavailable (e.g. opened from filesystem directly)
            return CHROME_REVIEW_URL;
        }
    }

    // ── Wire up the review button ────────────────────────────────────────────
    const btnReview = document.getElementById('btn-review');
    if (btnReview) {
        btnReview.addEventListener('click', () => {
            // Mark as reviewed so the popup toast stops appearing
            try {
                chrome.storage.local.set({ hasReviewed: true });
            } catch { /* not in extension context */ }

            window.open(getReviewUrl(), '_blank');
        });
    }

    // ── Dismiss button (closes this tab) ────────────────────────────────────
    const btnDismiss = document.getElementById('btn-dismiss');
    if (btnDismiss) {
        btnDismiss.addEventListener('click', () => {
            window.close();
        });
    }
})();
