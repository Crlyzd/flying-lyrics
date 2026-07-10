// src/background/storage.js

(function () {
    const globalScope = typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : window);
    globalScope.FLYING_LYRICS = globalScope.FLYING_LYRICS || {};

    const storage = {
        // List of keys to store in chrome.storage.sync
        syncKeys: new Set([
            'showTranslation',
            'translationLang',
            'globalSyncOffset',
            'autoLaunch',
            'customFont',
            'fontSize',
            'bgBlur',
            'bgDarkness',
            'coverMode',
            'glowEnabled',
            'glowStyle',
            'spotlightEnabled',
            'lyricShadowEnabled',
            'lyricAlignment',
            'lineSpacing',
            'verticalAnchor',
            'albumCoverMode',
            'pipMode',
            'recentFonts',
            'popupBgAnimation',
            'popupColor1',
            'popupColor2',
            'popupColor3',
            'galaxyMode',
            'fluidScrolling'
        ]),

        get(keys, callback) {
            chrome.storage.local.get('cloudSyncEnabled', (syncStatus) => {
                const cloudSync = syncStatus.cloudSyncEnabled !== false;

                // Case 1: keys is null (retrieve all)
                if (keys === null) {
                    let syncItems = {};
                    let localItems = {};
                    let pending = 2;

                    const decrement = () => {
                        pending--;
                        if (pending === 0 && callback) {
                            if (cloudSync) {
                                callback({ ...localItems, ...syncItems });
                            } else {
                                callback({ ...syncItems, ...localItems });
                            }
                        }
                    };

                    chrome.storage.sync.get(null, (res) => {
                        syncItems = res || {};
                        decrement();
                    });
                    chrome.storage.local.get(null, (res) => {
                        localItems = res || {};
                        decrement();
                    });
                    return;
                }

                // Case 2: keys is a single key string
                if (typeof keys === 'string') {
                    const useSync = cloudSync && this.syncKeys.has(keys);
                    const storageArea = useSync ? chrome.storage.sync : chrome.storage.local;
                    storageArea.get(keys, (res) => {
                        if (callback) callback(res);
                    });
                    return;
                }

                // Case 3: keys is an array
                if (Array.isArray(keys)) {
                    const syncQuery = [];
                    const localQuery = [];
                    for (const key of keys) {
                        if (cloudSync && this.syncKeys.has(key)) {
                            syncQuery.push(key);
                        } else {
                            localQuery.push(key);
                        }
                    }

                    let syncResult = {};
                    let localResult = {};
                    let pending = (syncQuery.length ? 1 : 0) + (localQuery.length ? 1 : 0);

                    if (pending === 0) {
                        if (callback) callback({});
                        return;
                    }

                    const decrement = () => {
                        pending--;
                        if (pending === 0 && callback) {
                            const merged = {};
                            for (const key of keys) {
                                if (cloudSync && this.syncKeys.has(key)) {
                                    merged[key] = syncResult ? syncResult[key] : undefined;
                                } else {
                                    merged[key] = localResult ? localResult[key] : undefined;
                                }
                            }
                            if (callback) callback(merged);
                        }
                    };

                    if (syncQuery.length) {
                        chrome.storage.sync.get(syncQuery, (res) => {
                            syncResult = res || {};
                            decrement();
                        });
                    }
                    if (localQuery.length) {
                        chrome.storage.local.get(localQuery, (res) => {
                            localResult = res || {};
                            decrement();
                        });
                    }
                    return;
                }

                // Case 4: keys is an object with default values
                if (typeof keys === 'object') {
                    const syncQuery = {};
                    const localQuery = {};
                    for (const [key, val] of Object.entries(keys)) {
                        if (cloudSync && this.syncKeys.has(key)) {
                            syncQuery[key] = val;
                        } else {
                            localQuery[key] = val;
                        }
                    }

                    const syncKeysCount = Object.keys(syncQuery).length;
                    const localKeysCount = Object.keys(localQuery).length;

                    let pending = (syncKeysCount ? 1 : 0) + (localKeysCount ? 1 : 0);
                    if (pending === 0) {
                        if (callback) callback({});
                        return;
                    }

                    let syncResult = {};
                    let localResult = {};

                    const decrement = () => {
                        pending--;
                        if (pending === 0 && callback) {
                            if (callback) callback({ ...localResult, ...syncResult });
                        }
                    };

                    if (syncKeysCount) {
                        chrome.storage.sync.get(syncQuery, (res) => {
                            syncResult = res || {};
                            decrement();
                        });
                    }
                    if (localKeysCount) {
                        chrome.storage.local.get(localQuery, (res) => {
                            localResult = res || {};
                            decrement();
                        });
                    }
                    return;
                }
            });
        },

        set(items, callback) {
            chrome.storage.local.get('cloudSyncEnabled', (syncStatus) => {
                const cloudSync = syncStatus.cloudSyncEnabled !== false;
                const syncItems = {};
                const localItems = {};
                let hasSync = false;
                let hasLocal = false;

                for (const [key, val] of Object.entries(items)) {
                    if (key === 'cloudSyncEnabled') {
                        localItems[key] = val;
                        hasLocal = true;
                    } else if (cloudSync && this.syncKeys.has(key)) {
                        syncItems[key] = val;
                        hasSync = true;
                    } else {
                        localItems[key] = val;
                        hasLocal = true;
                    }
                }

                let pending = (hasSync ? 1 : 0) + (hasLocal ? 1 : 0);
                if (pending === 0) {
                    if (callback) callback();
                    return;
                }

                const decrement = () => {
                    pending--;
                    if (pending === 0 && callback) {
                        callback();
                    }
                };

                if (hasSync) {
                    chrome.storage.sync.set(syncItems, decrement);
                }
                if (hasLocal) {
                    chrome.storage.local.set(localItems, decrement);
                }
            });
        },

        remove(keys, callback) {
            chrome.storage.local.get('cloudSyncEnabled', (syncStatus) => {
                const cloudSync = syncStatus.cloudSyncEnabled !== false;

                if (typeof keys === 'string') {
                    if (cloudSync && this.syncKeys.has(keys)) {
                        chrome.storage.sync.remove(keys, callback);
                    } else {
                        chrome.storage.local.remove(keys, callback);
                    }
                    return;
                }

                if (Array.isArray(keys)) {
                    const syncKeysToRemove = [];
                    const localKeysToRemove = [];
                    for (const key of keys) {
                        if (cloudSync && this.syncKeys.has(key)) {
                            syncKeysToRemove.push(key);
                        } else {
                            localKeysToRemove.push(key);
                        }
                    }

                    let pending = (syncKeysToRemove.length ? 1 : 0) + (localKeysToRemove.length ? 1 : 0);
                    if (pending === 0) {
                        if (callback) callback();
                        return;
                    }

                    const decrement = () => {
                        pending--;
                        if (pending === 0 && callback) {
                            callback();
                        }
                    };

                    if (syncKeysToRemove.length) {
                        chrome.storage.sync.remove(syncKeysToRemove, decrement);
                    }
                    if (localKeysToRemove.length) {
                        chrome.storage.local.remove(localKeysToRemove, decrement);
                    }
                }
            });
        }
    };

    globalScope.FLYING_LYRICS.storage = storage;
})();
