// src/background/analytics.js

const GA_MEASUREMENT_ID = 'G-PEHXX4M5R8';
const GA_API_SECRET = '4ESFIsGvQHm2zttVE3hAEg';
const GA_ENDPOINT = `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`;

let cachedClientId = null;
let sessionId = null;

/**
 * Returns a transient session ID generated on worker startup.
 */
function getSessionId() {
    if (!sessionId) {
        sessionId = Date.now().toString();
    }
    return sessionId;
}

/**
 * Retrieves the persistent anonymous client ID from chrome.storage.local.
 * If not present, generates a new one.
 */
async function getClientId() {
    if (cachedClientId) return cachedClientId;
    return new Promise((resolve) => {
        chrome.storage.local.get(['anonymousClientId'], (result) => {
            if (result.anonymousClientId) {
                cachedClientId = result.anonymousClientId;
                resolve(cachedClientId);
            } else {
                const newId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                    const r = Math.random() * 16 | 0;
                    const v = c === 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                });
                chrome.storage.local.set({ anonymousClientId: newId }, () => {
                    cachedClientId = newId;
                    resolve(newId);
                });
            }
        });
    });
}

/**
 * Tracks an event using GA4 Measurement Protocol if consent is granted.
 * @param {string} eventName
 * @param {object} params
 */
async function trackEvent(eventName, params = {}) {
    return new Promise((resolve) => {
        chrome.storage.local.get({ telemetryConsent: true }, async (result) => {
            if (!result.telemetryConsent) {
                // Telemetry consent is disabled, discard the event.
                resolve(false);
                return;
            }

            try {
                const clientId = await getClientId();
                
                // Clean params to ensure no complex objects or nested structures are passed directly to GA
                const cleanParams = { session_id: getSessionId() };
                for (const [key, val] of Object.entries(params)) {
                    if (val !== null && val !== undefined) {
                        cleanParams[key] = (typeof val === 'object') ? JSON.stringify(val) : val;
                    }
                }

                const payload = {
                    client_id: clientId,
                    events: [{
                        name: eventName,
                        params: cleanParams
                    }]
                };

                const response = await fetch(GA_ENDPOINT, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });
                
                resolve(response.ok);
            } catch (err) {
                console.warn('FL Telemetry: Error sending payload to GA4', err);
                resolve(false);
            }
        });
    });
}
