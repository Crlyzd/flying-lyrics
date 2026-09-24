(() => {
    const fl = window.FLYING_LYRICS;
    if (!fl) return;

    // ─────────────────────────────────────────────────────────────────────────────
    //  FLYING LYRICS — RUNTIME MESSAGE PASSING UTILITIES (content script context)
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Dispatches a runtime message to background with a client-side hard timeout guard.
     * Prevents async deadlocks if Chrome's MV3 service worker terminates, drops the port,
     * or fails to invoke sendResponse before suspension.
     *
     * @param {Object} message - chrome.runtime message object ({ type, payload }).
     * @param {number} [totalTimeoutMs=10000] - Hard client-side timeout in milliseconds.
     * @param {*} [fallbackResponse=null] - Fallback value returned on timeout or error.
     * @returns {Promise<*>} Resolves with background response or fallbackResponse.
     */
    fl.sendMessageWithTimeout = function (message, totalTimeoutMs = 10000, fallbackResponse = null) {
        return new Promise((resolve) => {
            let settled = false;
            const timer = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    resolve(fallbackResponse);
                }
            }, totalTimeoutMs);

            try {
                chrome.runtime.sendMessage(message, (response) => {
                    if (chrome.runtime.lastError) {
                        // Port closed or service worker suspended; swallow runtime error
                    }
                    clearTimeout(timer);
                    if (!settled) {
                        settled = true;
                        resolve(response ?? fallbackResponse);
                    }
                });
            } catch (err) {
                clearTimeout(timer);
                if (!settled) {
                    settled = true;
                    resolve(fallbackResponse);
                }
            }
        });
    };

})();
