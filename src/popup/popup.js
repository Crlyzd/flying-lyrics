function getBrowserDefaultLanguage() {
    const supportedCodes = [
        'en', 'zh-CN', 'zh-TW', 'es', 'fr', 'ar', 'ru', 'pt', 
        'id', 'de', 'ja', 'tr', 'vi', 'ko', 'fa', 'it', 'th', 'ku'
    ];
    
    const preferences = [];
    if (typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.getUILanguage === 'function') {
        preferences.push(chrome.i18n.getUILanguage());
    }
    if (typeof navigator !== 'undefined') {
        if (Array.isArray(navigator.languages)) {
            preferences.push(...navigator.languages);
        }
        if (navigator.language) {
            preferences.push(navigator.language);
        }
    }
    
    for (const lang of preferences) {
        if (!lang) continue;
        const normalized = lang.toLowerCase();
        
        // Exact matches for Chinese dialects
        if (normalized === 'zh-cn' || normalized === 'zh-hans' || normalized === 'zh-sg' || normalized === 'zh-my') return 'zh-CN';
        if (normalized === 'zh-tw' || normalized === 'zh-hk' || normalized === 'zh-mo' || normalized === 'zh-hant') return 'zh-TW';
        
        // Exact match check
        const exactMatch = supportedCodes.find(code => code.toLowerCase() === normalized);
        if (exactMatch) return exactMatch;
        
        // Base match (e.g. "en-US" -> "en")
        const base = normalized.split('-')[0];
        if (base === 'zh') {
            return 'zh-CN';
        }
        const baseMatch = supportedCodes.find(code => code.toLowerCase() === base);
        if (baseMatch) return baseMatch;
    }
    
    return 'en';
}

const LANGUAGES = [
    { code: 'en', name: 'English' },
    { code: 'zh-CN', name: 'Chinese (Simplified)' },
    { code: 'zh-TW', name: 'Chinese (Traditional)' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'ar', name: 'Arabic' },
    { code: 'ru', name: 'Russian' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'id', name: 'Indonesian' },
    { code: 'de', name: 'German' },
    { code: 'ja', name: 'Japanese' },
    { code: 'tr', name: 'Turkish' },
    { code: 'vi', name: 'Vietnamese' },
    { code: 'ko', name: 'Korean' },
    { code: 'fa', name: 'Persian' },
    { code: 'it', name: 'Italian' },
    { code: 'th', name: 'Thai' },
    { code: 'ku', name: 'Kurdish' }
];


// =========================================================
//  UNIT CONVERSION HELPERS (single source of truth)
// =========================================================

/** Font size: UI step 1–10  ↔  actual px 18–36 */
const fontStepToPx = step => 18 + ((step - 1) * 2);
const fontPxToStep = px   => Math.round((px - 18) / 2) + 1;

/** Background darkness: UI step 0–10  ↔  actual percent 0–100 */
const darkStepToPct = step => step * 10;
const darkPctToStep = pct  => Math.round(pct / 10);

/** Line spacing: UI step 1–10  ↔  actual vmin multiplier 3–12 */
const spacingStepToActual = step => step + 2;
const spacingActualToStep = val  => Math.round(val - 2);

document.addEventListener('DOMContentLoaded', () => {
    // Safety fallback: reveal the popup after 150ms even if storage retrieval lags
    setTimeout(() => {
        document.body.classList.add('loaded');
    }, 150);

    // =========================================================
    //  ELEMENT REFERENCES
    // =========================================================
    const toggleTrans = document.getElementById('toggle-translation');
    const toggleAutolaunch = document.getElementById('toggle-autolaunch');
    const toggleBorderlessPip = document.getElementById('toggle-borderless-pip');
    const toggleEcoMode = document.getElementById('toggle-eco-mode');
    const toggleCloudSync = document.getElementById('toggle-cloud-sync');
    const langSelect = document.getElementById('lang-select');
    const offsetMinus = document.getElementById('offset-minus');
    const offsetPlus = document.getElementById('offset-plus');
    const offsetDisplay = document.getElementById('offset-display');
    const searchBtn = document.getElementById('search-btn');
    const searchInput = document.getElementById('search-query');
    const resultsContainer = document.getElementById('search-results-container');
    const localUpload = document.getElementById('local-lyric-upload');
    const appVersion = document.getElementById('app-version');
    const globalOffsetInput = document.getElementById('global-offset-input');
    const globalOffsetSetBtn = document.getElementById('global-offset-set-btn');
    const editLyricBtn = document.getElementById('edit-lyric-btn');
    const editLyricBtnText = document.getElementById('edit-lyric-btn-text');

    // Slide navigation
    const popupSlides = document.getElementById('popup-slides');
    const popupWindowContainer = document.querySelector('.popup-window-container');
    const btnOpenHelp = document.getElementById('btn-open-help');

    // Customization controls
    const fontFamilySelect = document.getElementById('font-family-select');
    const customFontContainer = document.getElementById('custom-font-container');
    const customFontInput = document.getElementById('custom-font-input');
    const applyCustomFontBtn = document.getElementById('apply-custom-font');
    const suggestFontsBtn = document.getElementById('btn-suggest-fonts');
    const fontChipsContainer = document.getElementById('font-chips-container');
    const fontResultsContainer = document.getElementById('font-results-container');
    const customFontLinkHint = document.getElementById('custom-font-link-hint');
    const recentFontsBtn = document.getElementById('btn-recent-fonts');
    const recentFontsPanel = document.getElementById('recent-fonts-panel');
    const fontSizeSlider = document.getElementById('font-size-slider');
    const fontSizeValue = document.getElementById('font-size-value');
    const blurSlider = document.getElementById('blur-slider');
    const blurValue = document.getElementById('blur-value');
    const darknessSlider = document.getElementById('darkness-slider');
    const darknessValue = document.getElementById('darkness-value');
    const coverModeGroup = document.getElementById('cover-mode-group');
    const toggleGlow = document.getElementById('toggle-glow');
    const toggleSpotlight = document.getElementById('toggle-spotlight');
    const glowStyleContainer = document.getElementById('glow-style-container');
    const glowStyleSelect = document.getElementById('glow-style-select');
    const alignSelect = document.getElementById('align-select');
    const glowPreview = document.getElementById('glow-preview');
    const fontSizeWarning = document.getElementById('font-size-warning');
    const lineSpacingSlider = document.getElementById('line-spacing-slider');
    const lineSpacingValue = document.getElementById('line-spacing-value');
    const anchorSlider = document.getElementById('anchor-slider');
    const anchorValue = document.getElementById('anchor-value');
    const btnExportSettings = document.getElementById('btn-export-settings');
    const btnImportSettings = document.getElementById('btn-import-settings');
    const toggleAlbumCoverMode = document.getElementById('toggle-album-cover-mode');
    const visualControlsWrapper = document.getElementById('visual-controls-wrapper');
    const albumCoverToggleCard = document.getElementById('album-cover-toggle-card');
    const importFile = document.getElementById('import-file');
    const telemetryToggle = document.getElementById('telemetry-toggle');

    // New theme and popup customizations
    const toggleBgAnimation = document.getElementById('toggle-bg-animation');
    const toggleGalaxyMode = document.getElementById('toggle-galaxy-mode');
    const btnResetPopupSettings = document.getElementById('btn-reset-popup-settings');
    const btnResetPipSettings = document.getElementById('btn-reset-pip-settings');
    const subTabPipBtn = document.getElementById('sub-tab-pip-btn');
    const subTabPopupBtn = document.getElementById('sub-tab-popup-btn');
    const subTabPipPane = document.getElementById('sub-tab-pip');
    const subTabPopupPane = document.getElementById('sub-tab-popup');
    
    // HSL Sliders & Swatches
    const hslHueSlider = document.getElementById('hsl-hue');
    const hslSatSlider = document.getElementById('hsl-saturation');
    const hslLightSlider = document.getElementById('hsl-lightness');
    const hueValDisplay = document.getElementById('hue-val-display');
    const satValDisplay = document.getElementById('sat-val-display');
    const lightValDisplay = document.getElementById('light-val-display');

    // State
    let activeColorSlot = 1;
    let slotColors = {
        1: '#ff007f',
        2: '#00b4d8',
        3: '#1DB954'
    };
    let currentResults = [];
    let currentActiveTrack = { artist: "", title: "" };
    let currentEffectiveOffset = 1000;
    let currentGlobalOffset = 1000;
    let activeSource = null;
    let activeSearchQuery = "";
    let currentlyAppliedFont = "";
    let currentlyLoadingFont = "";

    // =========================================================
    //  LANGUAGE DROPDOWN POPULATION
    // =========================================================
    LANGUAGES.forEach(lang => {
        const option = document.createElement('option');
        option.value = lang.code;
        option.textContent = lang.name;
        langSelect.appendChild(option);
    });

    // "Request a language" as the last option in the dropdown
    const requestLangOption = document.createElement('option');
    requestLangOption.value = 'request_language';
    requestLangOption.textContent = '+ Request a language...';
    langSelect.appendChild(requestLangOption);

    // =========================================================
    //  DYNAMIC VERSION
    // =========================================================
    if (appVersion) {
        const manifest = chrome.runtime.getManifest();
        appVersion.textContent = `v${manifest.version}`;
    }

    // =========================================================
    //  REVIEW TOAST — popup open counter
    // =========================================================
    // Chrome extension IDs used to detect which store the user installed from.
    // Edge users who install via Chrome Web Store will have the Chrome CWS ID.
    const EDGE_EXTENSION_ID = 'ipcakmeelnooilncnjinnfjcodejbcoa';
    const CHROME_REVIEW_URL = 'https://chrome.google.com/webstore/detail/ehjobcjhlmgmpaikciicipmlpknipikd/reviews';
    const EDGE_REVIEW_URL   = 'https://microsoftedge.microsoft.com/addons/detail/flying-lyrics-romanize-/ipcakmeelnooilncnjinnfjcodejbcoa';

    /**
     * Returns the correct Web Store review URL based on which store
     * the extension was installed from (identified by runtime ID).
     */
    function getReviewUrl() {
        return chrome.runtime.id === EDGE_EXTENSION_ID ? EDGE_REVIEW_URL : CHROME_REVIEW_URL;
    }

    const reviewToast     = document.getElementById('review-toast');
    const closeToastBtn   = document.getElementById('close-review-toast');
    const snoozeToastBtn  = document.getElementById('snooze-review-toast');
    const reviewToastText = document.getElementById('review-toast-text');
    const footerStarStrip = document.getElementById('footer-star-strip');
    const starLabel       = document.getElementById('star-label');

    /** Marks the UI to show the user has reviewed */
    function markAsRated(rating) {
        if (footerStarStrip) {
            footerStarStrip.classList.add('rated');
            footerStarStrip.dataset.rating = rating || 5;
        }
        if (starLabel) starLabel.textContent = 'Thanks!';
    }

    /** Opens the correct Web Store review page and marks the user as having reviewed. */
    function openReviewPage(rating = 5) {
        FLYING_LYRICS.storage.set({ hasReviewed: true, reviewRating: rating });
        markAsRated(rating);
        reviewToast.classList.remove('review-toast--visible');
        chrome.tabs.create({ url: getReviewUrl() });
    }

    /** Shows the review toast. */
    function showReviewToast() {
        reviewToast.classList.add('review-toast--visible');
        // Persist a flag so the toast re-appears if the popup is closed without acting on it
        FLYING_LYRICS.storage.set({ reviewToastPending: true });
    }

    FLYING_LYRICS.storage.get(
        { popupOpenCount: 0, hasReviewed: false, reviewRating: 5, snoozeUntilCount: 0, firstInstalledAt: 0, helpClickCount: 0, milestone7DayShown: false, reviewToastPending: false },
        (data) => {
            const newCount = data.popupOpenCount + 1;
            FLYING_LYRICS.storage.set({ popupOpenCount: newCount });

            // Record first install timestamp on the very first popup open
            if (!data.firstInstalledAt) {
                FLYING_LYRICS.storage.set({ firstInstalledAt: Date.now() });
            }

            if (data.hasReviewed) {
                markAsRated(data.reviewRating);
                return; // Already reviewed — never show toast again
            }

            // --- Pending flag: toast was shown but popup closed before user acted on it ---
            // Re-surface immediately on next open until explicitly dismissed via X or Remind me later.
            // installedAt hoisted here so the help-button logic below always has it in scope.
            const installedAt = data.firstInstalledAt || Date.now();

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
                    !data.milestone7DayShown &&   // guard: only fire once
                    newCount > 3 &&               // at least 3 opens (not a brand-new user)
                    (Date.now() - installedAt) >= sevenDaysMs;

                if (isCountThreshold || isSnoozedThresholdReached || is7DayMilestone) {
                    if (is7DayMilestone) {
                        FLYING_LYRICS.storage.set({ milestone7DayShown: true });
                    }
                    showReviewToast();
                }
            }

            // --- Help button: show within first 3 days if opened >= 10 times and clicked < 10 times ---
            const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
            const withinThreeDays = (Date.now() - installedAt) <= threeDaysMs;
            const tooManyOpens = newCount >= 10;
            const clickedTooMuch = (data.helpClickCount || 0) >= 10;
            // Help button: show/hide via .hidden class (initial state set by HTML class)
            if (btnOpenHelp) {
                btnOpenHelp.classList.toggle('hidden', !(withinThreeDays && tooManyOpens && !clickedTooMuch));
            }
        }
    );

    // Clicking the toast text → open the store review page (defaults to 5 stars)
    reviewToastText.addEventListener('click', () => openReviewPage(5));

    // "Later" snooze → resurface after 10 more popup opens
    snoozeToastBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        FLYING_LYRICS.storage.get({ popupOpenCount: 0 }, ({ popupOpenCount }) => {
            FLYING_LYRICS.storage.set({ snoozeUntilCount: popupOpenCount + 10, reviewToastPending: false });
        });
        reviewToast.classList.remove('review-toast--visible');
    });

    closeToastBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        FLYING_LYRICS.storage.set({ reviewToastPending: false });
        reviewToast.classList.remove('review-toast--visible');
    });

    // Footer star strip → record exact rating and open review
    if (footerStarStrip) {
        const stars = footerStarStrip.querySelectorAll('span');
        stars.forEach((star, index) => {
            star.addEventListener('click', (e) => {
                e.stopPropagation();
                openReviewPage(index + 1);
            });
        });
    }

    // Help button → open welcome/tutorial page in a new tab
    if (btnOpenHelp) {
        btnOpenHelp.addEventListener('click', () => {
            FLYING_LYRICS.storage.get({ helpClickCount: 0 }, (res) => {
                const newClickCount = (res.helpClickCount || 0) + 1;
                FLYING_LYRICS.storage.set({ helpClickCount: newClickCount });
                // If it reaches 10, hide it immediately via class
                if (newClickCount >= 10) {
                    btnOpenHelp.classList.add('hidden');
                }
            });
            chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/welcome.html') });
        });
    }

    // =========================================================
    // Fallbacks if config.js somehow isn't loaded yet into the background context
    const fallbackDefaults = {
        showTranslation: true, translationLang: getBrowserDefaultLanguage(), globalSyncOffset: 1000, autoLaunch: false,
        customFont: "'Noto Sans', 'Segoe UI', sans-serif", fontSize: 26, bgBlur: 2, bgDarkness: 40,
        coverMode: 'default', glowEnabled: false, glowStyle: 'theme', spotlightEnabled: false, lyricAlignment: 'center',
        lineSpacing: 4, verticalAnchor: 4, albumCoverMode: false, telemetryConsent: true,
        pipMode: 'document', cloudSyncEnabled: true, ecoMode: true,
        lastPipWidth: 200, lastPipHeight: 250,
        
        themeAccent: 'galaxy',
        popupBgAnimation: false,
        galaxyMode: false,
        popupColor1: '#ff007f',
        popupColor2: '#00b4d8',
        popupColor3: '#1DB954'
    };

    FLYING_LYRICS.storage.get(fallbackDefaults, (items) => {
        // Main settings
        toggleTrans.checked = items.showTranslation;
        langSelect.value = items.translationLang;
        currentGlobalOffset = items.globalSyncOffset;
        globalOffsetInput.value = currentGlobalOffset;
        toggleAutolaunch.checked = items.autoLaunch;
        toggleBorderlessPip.checked = items.pipMode === 'video';
        toggleEcoMode.checked = items.ecoMode;
        toggleCloudSync.checked = items.cloudSyncEnabled;

        // Customization settings — populate controls
        // Map stored raw values back to 1-10 UI scale

        // Handle custom fonts correctly on load
        const matchedOption = Array.from(fontFamilySelect.options).find(opt => opt.value === items.customFont);
        if (matchedOption) {
            fontFamilySelect.value = items.customFont;
            customFontContainer.style.display = 'none';
        } else {
            // It's a custom font — show the search UI and load it for preview
            fontFamilySelect.value = 'custom';
            customFontContainer.style.display = 'block';

            let rawFontName = items.customFont.split(',')[0].replace(/['"]/g, '').trim();
            customFontInput.value = rawFontName;
            currentlyAppliedFont = rawFontName;

            const formattedFontName = rawFontName.replace(/ /g, '+');
            const link = document.createElement('link');
            link.id = 'fl-custom-font-preview';
            link.rel = 'stylesheet';
            link.href = `https://fonts.googleapis.com/css2?family=${formattedFontName}:wght@400;600;700&display=swap`;
            document.head.appendChild(link);
        }

        // Font: 18 to 36px -> mapped to 1 to 10 step
        const fontStep = Math.max(1, Math.min(10, fontPxToStep(items.fontSize)));
        fontSizeSlider.value = fontStep;
        fontSizeValue.textContent = fontStep;
        if (fontSizeWarning) {
            fontSizeWarning.style.display = fontStep >= 7 ? 'inline-block' : 'none';
        }

        // Line Spacing: stored actual vmin multiplier (3–12); UI shows step 1–10.
        const spacingStep = Math.max(1, Math.min(10, spacingActualToStep(items.lineSpacing ?? 3)));
        lineSpacingSlider.value = spacingStep;
        lineSpacingValue.textContent = spacingStep;

        // Vertical Anchor mapping (1-10 scale, defaults to 5)
        const anchorStep = Math.max(1, Math.min(10, items.verticalAnchor ?? 5));
        anchorSlider.value = anchorStep;
        anchorValue.textContent = anchorStep;

        // Blur: 0 to 10px -> naturally matches 0-10 slider
        const blurStep = Math.max(0, Math.min(10, items.bgBlur));
        blurSlider.value = blurStep;
        blurValue.textContent = blurStep;

        // Darkness: 0 to 100% -> mapped to 0 to 10 step (x10)
        const darkStep = Math.max(0, Math.min(10, darkPctToStep(items.bgDarkness)));
        darknessSlider.value = darkStep;
        darknessValue.textContent = darkStep;

        alignSelect.value = items.lyricAlignment;
        toggleGlow.checked = items.glowEnabled;
        glowStyleSelect.value = items.glowStyle;
        glowStyleContainer.style.display = items.glowEnabled ? 'flex' : 'none';
        glowPreview.classList.toggle('active', items.glowEnabled);
        glowPreview.classList.toggle('rainbow', items.glowStyle === 'rainbow');

        toggleSpotlight.checked = items.spotlightEnabled;
        glowPreview.classList.toggle('highlighted', items.spotlightEnabled);

        // Load song vibrant color from local storage (written by extractPalette in content script).
        // Apply it as --glow-color so the preview matches the current song's album art color.
        chrome.storage.local.get({ currentVibrantColor: '#1DB954' }, (colorData) => {
            glowPreview.style.setProperty('--glow-color', colorData.currentVibrantColor);
        });

        // Restore cover mode selection
        document.querySelectorAll('.cover-mode-option').forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.mode === items.coverMode);
        });

        // Album Cover Mode: restore toggle state and apply disabled overlay
        toggleAlbumCoverMode.checked = items.albumCoverMode;
        applyAlbumCoverModeState(items.albumCoverMode);

        // Apply font to preview
        glowPreview.style.fontFamily = items.customFont;
        glowPreview.style.fontSize = `${items.fontSize}px`;

        // Telemetry toggle initialization
        if (telemetryToggle) {
            updateTelemetryUI(items.telemetryConsent);
        }


        // Restore Galaxy Mode (Galaxy vs Classic theme) state
        if (toggleGalaxyMode) {
            const hasGalaxyMode = items.galaxyMode ?? false;
            toggleGalaxyMode.checked = hasGalaxyMode;
            applyGalaxyModeState(hasGalaxyMode);
        }

        // Restore visual customizations variables
        toggleBgAnimation.checked = items.popupBgAnimation;
        if (items.popupBgAnimation) {
            if (popupWindowContainer) popupWindowContainer.classList.remove('bg-frozen');
        } else {
            if (popupWindowContainer) popupWindowContainer.classList.add('bg-frozen');
        }

        slotColors[1] = items.popupColor1;
        slotColors[2] = items.popupColor2;
        slotColors[3] = items.popupColor3;

        updateCustomColors();
        selectColorSlot(1);

        // Signal that the settings are fully loaded and applied, revealing the popup
        document.body.classList.add('loaded');

        // Remove preload class after rendering the initial state to enable animations
        setTimeout(() => {
            document.body.classList.remove('preload');
        }, 50);
    });

    // =========================================================
    //  STORAGE CHANGE LISTENER (e.g. from content script)
    // =========================================================
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if ((namespace === 'local' || namespace === 'sync') && changes.showTranslation) {
            toggleTrans.checked = changes.showTranslation.newValue;
        }
        // Live-update the glow preview color when the content script extracts a new palette.
        // currentVibrantColor is written to chrome.storage.local by extractPalette() on every
        // album art change, so this fires without any polling.
        if (namespace === 'local' && changes.currentVibrantColor) {
            glowPreview.style.setProperty('--glow-color', changes.currentVibrantColor.newValue);
        }
    });

    // =========================================================
    //  REQUEST CURRENT STATE FROM CONTENT SCRIPT
    // =========================================================
    chrome.tabs.query({ url: ["*://open.spotify.com/*", "*://music.youtube.com/*"] }, (tabs) => {
        let trackFound = false;

        tabs.forEach(tab => {
            if (!tab.id) return;

            chrome.tabs.sendMessage(tab.id, { type: 'GET_SYNC_OFFSET' }, (response) => {
                if (chrome.runtime.lastError) return;
                if (response && response.syncOffset !== undefined && !trackFound) {
                    updateOffsetDisplay(response.syncOffset);
                }
            });

            chrome.tabs.sendMessage(tab.id, { type: 'GET_ACTIVE_LYRIC' }, (response) => {
                if (chrome.runtime.lastError) return;
                if (response && response.source) {
                    activeSource = response.source;
                }
            });

            chrome.tabs.sendMessage(tab.id, { type: 'GET_CURRENT_TRACK' }, (response) => {
                if (chrome.runtime.lastError) return;
                if (trackFound) return;

                if (response && response.artist && response.title) {
                    trackFound = true;
                    currentActiveTrack = response;
                    const trackKey = `${response.artist} - ${response.title}`;

                    // Build a clean search query using the sanitized values exposed by the
                    // content script (fl.cleanTitle + fl.extractPrimaryArtist). If those
                    // aren't available (e.g. on an older tab), fall back to the raw values.
                    const displayArtist = response.primaryArtist || response.artist;
                    const displayTitle  = response.cleanTitle    || response.title;
                    const cleanQuery    = `${displayArtist} - ${displayTitle}`;

                    FLYING_LYRICS.storage.get({ lastSearch: null, lyricsOverrides: {} }, (items) => {
                        const override = (items.lyricsOverrides || {})[trackKey] || null;

                        if (items.lastSearch && items.lastSearch.key === trackKey && items.lastSearch.results?.length) {
                            // Restore the last explicit search query the user typed (preserves intent)
                            searchInput.value = items.lastSearch.query || cleanQuery;
                            currentResults = items.lastSearch.results;
                            renderSearchResults(currentResults, override);
                        } else if (override && override.type === 'local') {
                            searchInput.value = cleanQuery;
                            renderSearchResults([], override);
                        } else {
                            searchInput.value = cleanQuery;
                            if (activeSource) renderSearchResults([], null);
                        }
                    });
                }
            });
        });
    });

    // =========================================================
    //  SEARCH RESULTS RENDERER
    // =========================================================

    // Event Delegation: Attach one click listener to the entire container
    resultsContainer.addEventListener('click', (e) => {
        const item = e.target.closest('.result-item');
        if (!item || item.id === 'local-file-card' || item.id === 'deep-search-indicator') return; // Ignore clicks that aren't on result items or are on the read-only local card

        if (!currentActiveTrack || !currentActiveTrack.artist || !currentActiveTrack.title) {
            alert("No active track found.");
            return;
        }

        if (item.id === 'auto-match-card') {
            saveAndNotify({ lyricOverride: null });
            const spinner = document.createElement('div');
            spinner.className = 'sync-spinner';
            const dotContainer = item.querySelector('.dot-container');
            if (dotContainer) {
                const existingDot = dotContainer.querySelector('.active-dot');
                if (existingDot) existingDot.remove();
                dotContainer.appendChild(spinner);
            }
            return;
        }

        // It's a standard result
        const source = item.dataset.source;
        const id = item.dataset.id;
        const name = item.dataset.name;

        if (source && id) {
            saveAndNotify({ lyricOverride: { type: source, id: id } });
            const spinner = document.createElement('div');
            spinner.className = 'sync-spinner';
            const dotContainer = item.querySelector('.dot-container');
            if (dotContainer) {
                const existingDot = dotContainer.querySelector('.active-dot');
                if (existingDot) existingDot.remove();
                dotContainer.appendChild(spinner);
            }
        }
    });

    function renderSearchResults(results, activeOverride) {
        resultsContainer.innerHTML = '';

        if (activeOverride && activeOverride.type === 'local') {
            const localItem = document.createElement('div');
            localItem.id = 'local-file-card';
            localItem.className = 'result-item active-lyric';
            localItem.innerHTML = `
                <div class="result-left">
                    <div class="result-title lyrics-action-title">
                        <span class="icon-mask icon-folder icon-size-14"></span>
                        Local File Loaded
                    </div>
                    <div class="result-artist">Custom .lrc file</div>
                </div>
                <div class="result-right">
                    <div class="dot-container"><div class="active-dot"></div></div>
                    <div class="result-badges"><span class="result-badge">CUSTOM</span></div>
                </div>
            `;
            resultsContainer.appendChild(localItem);
        }

        const autoItem = document.createElement('div');
        autoItem.id = 'auto-match-card';
        autoItem.className = 'result-item';
        autoItem.innerHTML = `
            <div class="result-left">
                <div class="result-title">↳ Auto (Best Match)</div>
                <div class="result-artist">Reset to original search</div>
            </div>
            <div class="result-right">
                <div class="dot-container"></div>
            </div>
        `;
        resultsContainer.appendChild(autoItem);

        if (results.length === 0 && activeSource && !(activeOverride && activeOverride.type === 'local')) {
            const sourceLabel = activeSource.type === 'netease' ? 'NETEASE' : 'LRCLIB';
            const badgeClass = activeSource.type === 'netease' ? 'badge-netease' : 'badge-lrclib';
            const syncBadge = activeSource.type !== 'local'
                ? (activeSource.synced
                    ? `<span class="result-badge">SYNCED</span>`
                    : `<span class="result-badge badge-unsynced">UNSYNCED</span>`)
                : '';
            const autoCard = document.createElement('div');
            autoCard.className = 'result-item active-lyric';
            autoCard.innerHTML = `
                <div class="result-left">
                    <div class="result-title">${activeSource.name || 'Unknown'}</div>
                    <div class="result-artist">Auto-loaded · Click Search for more versions</div>
                </div>
                <div class="result-right">
                    <div class="dot-container"><div class="active-dot"></div></div>
                    <div class="result-badges">
                        <span class="result-badge ${badgeClass}">${sourceLabel}</span>
                        ${syncBadge}
                    </div>
                </div>
            `;
            resultsContainer.appendChild(autoCard);
            return;
        }

        let foundActiveInList = false;

        results.forEach(item => {
            const duration = item.duration
                ? `${Math.floor(item.duration / 60).toString().padStart(2, '0')}:${Math.floor(item.duration % 60).toString().padStart(2, '0')}`
                : "?:??";

            const div = document.createElement('div');
            div.className = 'result-item';

            // Store data for Event Delegation
            div.dataset.source = item.source;
            div.dataset.id = item.id;
            div.dataset.name = item.name;

            const isActiveOverride = activeOverride && activeOverride.type !== 'local'
                && String(activeOverride.id) === String(item.id) && activeOverride.type === item.source;
            const isActiveLive = !activeOverride && activeSource
                && String(activeSource.id) === String(item.id) && activeSource.type === item.source;

            div.innerHTML = `
                <div class="result-left">
                    <div class="result-title">${item.name}</div>
                    <div class="result-artist">${item.artistName} • ${item.albumName || 'Unknown Album'}</div>
                </div>
                <div class="result-right">
                    <div class="dot-container"></div>
                    <div class="result-badges">${item.badgeHtml}</div>
                    <div class="result-duration">${duration}</div>
                </div>
            `;

            if (isActiveOverride || isActiveLive) {
                div.classList.add('active-lyric');
                const dot = document.createElement('div');
                dot.className = 'active-dot';
                div.querySelector('.dot-container').appendChild(dot);
                foundActiveInList = true;
            }
            resultsContainer.appendChild(div);
        });

        // If the user hasn't explicitly chosen a lyric (no override) and the auto-loaded lyric
        // wasn't found in this search result list, highlight the Auto fallback card so the user
        // still sees what is actively playing.
        if (!activeOverride && results.length > 0 && !foundActiveInList) {
            autoItem.classList.add('active-lyric');
            const dot = document.createElement('div');
            dot.className = 'active-dot';
            const dotContainer = autoItem.querySelector('.dot-container');
            if (dotContainer) dotContainer.appendChild(dot);
        }
    }

    // =========================================================
    //  SEARCH HANDLER
    // =========================================================
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') searchBtn.click();
    });

    searchBtn.addEventListener('click', async () => {
        const query = searchInput.value.trim();
        if (!query) return;

        activeSearchQuery = query;
        searchBtn.textContent = '...';
        searchBtn.setAttribute('aria-busy', 'true');
        searchBtn.setAttribute('aria-label', 'Searching…');
        resultsContainer.innerHTML = '<div class="status-msg">Searching...</div>';

        try {
            // Build scoring hints from the active track's clean metadata
            const cleanArtist = currentActiveTrack?.primaryArtist || currentActiveTrack?.artist || '';
            const cleanTitleStr = currentActiveTrack?.cleanTitle || currentActiveTrack?.title || '';
            const duration = currentActiveTrack?.duration || 0;

            const response = await new Promise(resolve =>
                chrome.runtime.sendMessage({
                    type: 'UNIFIED_SEARCH',
                    payload: { query, duration, cleanArtist, cleanTitle: cleanTitleStr, timeoutMs: 5000 }
                }, resolve)
            );

            if (activeSearchQuery !== query) return;

            const results = (response?.results || []).map(item => ({
                ...item,
                badgeHtml: item.source === 'api'
                    ? `<span class="result-badge badge-lrclib">LRCLIB</span>` +
                      (item.synced ? `<span class="result-badge">SYNCED</span>` : `<span class="result-badge badge-unsynced">UNSYNCED</span>`)
                    : `<span class="result-badge badge-netease">NETEASE</span>`,
            }));

            const hasTimeout = !!response?.hasTimeout;

            if (results.length === 0 && !hasTimeout) {
                resultsContainer.innerHTML = '<div class="status-msg">No results found.</div>';
                return;
            }

            currentResults = results;
            const trackKey = `${currentActiveTrack.artist} - ${currentActiveTrack.title}`;
            if (results.length > 0) {
                FLYING_LYRICS.storage.set({
                    lastSearch: { key: trackKey, query: query, results: results }
                });
            }

            FLYING_LYRICS.storage.get({ lyricsOverrides: {} }, (items) => {
                if (activeSearchQuery !== query) return;

                const override = (items.lyricsOverrides || {})[trackKey] || null;
                renderSearchResults(results, override);

                if (hasTimeout) {
                    // 1. Render spinning gold deep search indicator at the top
                    const deepSearchCard = document.createElement('div');
                    deepSearchCard.id = 'deep-search-indicator';
                    deepSearchCard.className = 'result-item';
                    deepSearchCard.innerHTML = `
                        <div class="deep-search-label-row">
                            <div class="sync-spinner"></div>
                            Deep search running...
                        </div>
                    `;
                    resultsContainer.insertBefore(deepSearchCard, resultsContainer.firstChild);
                    resultsContainer.scrollTop = 0;

                    // 2. Launch background search with 30s timeout
                    chrome.runtime.sendMessage({
                        type: 'UNIFIED_SEARCH',
                        payload: { query, duration, cleanArtist, cleanTitle: cleanTitleStr, timeoutMs: 30000 }
                    }, (secondResponse) => {
                        if (activeSearchQuery !== query) return;

                        const secondResults = (secondResponse?.results || []).map(item => ({
                            ...item,
                            badgeHtml: item.source === 'api'
                                ? `<span class="result-badge badge-lrclib">LRCLIB</span>` +
                                  (item.synced ? `<span class="result-badge">SYNCED</span>` : `<span class="result-badge badge-unsynced">UNSYNCED</span>`)
                                : `<span class="result-badge badge-netease">NETEASE</span>`,
                        }));

                        const finalResults = [];
                        const seen = new Set();
                        secondResults.forEach(item => {
                            const key = `${item.source}-${item.id}`;
                            if (!seen.has(key)) {
                                seen.add(key);
                                finalResults.push(item);
                            }
                        });
                        results.forEach(item => {
                            const key = `${item.source}-${item.id}`;
                            if (!seen.has(key)) {
                                seen.add(key);
                                finalResults.push(item);
                            }
                        });

                        if (finalResults.length === 0) {
                            resultsContainer.innerHTML = '<div class="status-msg">No results found.</div>';
                            return;
                        }

                        currentResults = finalResults;
                        FLYING_LYRICS.storage.set({
                            lastSearch: { key: trackKey, query: query, results: finalResults }
                        });

                        renderSearchResults(finalResults, override);
                    });
                }
            });

        } catch (e) {
            resultsContainer.innerHTML = '<div class="status-msg--error">Search failed.</div>';
        } finally {
            searchBtn.textContent = 'Search';
            searchBtn.removeAttribute('aria-busy');
            searchBtn.removeAttribute('aria-label');
        }
    });

    // =========================================================
    //  LOCAL FILE UPLOAD
    // =========================================================
    localUpload.addEventListener('click', (e) => {
        if (!currentActiveTrack || !currentActiveTrack.artist || !currentActiveTrack.title) {
            e.preventDefault();
            alert("No active track found.");
        }
    });

    localUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            const rawText = ev.target.result;
            saveAndNotify({ lyricOverride: { type: 'local', data: rawText } });
            renderSearchResults(currentResults, { type: 'local' });
        };
        reader.readAsText(file);
    });

    // =========================================================
    //  EDIT / ADD LYRICS
    // =========================================================
    editLyricBtn.addEventListener('click', () => {
        if (!currentActiveTrack || !currentActiveTrack.artist || !currentActiveTrack.title) {
            alert("No active track found.");
            return;
        }

        const editorUrl = chrome.runtime.getURL('src/pages/editor.html');
        chrome.tabs.query({ url: editorUrl }, (tabs) => {
            if (tabs && tabs.length > 0) {
                const tab = tabs[0];
                chrome.windows.update(tab.windowId, { focused: true });
                
                // Query editor tab status to check if it's editing the same track
                chrome.tabs.sendMessage(tab.id, { type: 'GET_EDITOR_STATUS' }, (response) => {
                    if (chrome.runtime.lastError) {
                        // Editor might be loading or unresponsive, trigger reload
                        chrome.tabs.reload(tab.id);
                        return;
                    }
                    if (response && response.artist === currentActiveTrack.artist && response.title === currentActiveTrack.title) {
                        // Same track, focusing the window is enough
                        return;
                    }
                    // Different track, reload to load new lyrics
                    chrome.tabs.reload(tab.id);
                });
            } else {
                chrome.windows.create({
                    url: editorUrl,
                    type: 'popup',
                    width: 550,
                    height: 650,
                    focused: true
                });
            }
        });
    });

    // =========================================================
    //  SETTINGS_UPDATE BROADCAST FROM CONTENT SCRIPT
    // =========================================================
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'SETTINGS_UPDATE') {
            if (msg.payload.syncOffset !== undefined) {
                updateOffsetDisplay(msg.payload.syncOffset);
            }
            if (msg.payload.globalSyncOffset !== undefined) {
                currentGlobalOffset = msg.payload.globalSyncOffset;
                globalOffsetInput.value = currentGlobalOffset;
            }
        } else if (msg.type === 'FONT_LOADED_IN_PIP') {
            const fontName = msg.payload.fontName;
            onFontFinishedLoading(fontName);
        } else if (msg.type === 'ACTIVE_LYRIC_CHANGED') {
            activeSource = msg.payload;
            resultsContainer.querySelectorAll('.sync-spinner').forEach(s => s.remove());
            resultsContainer.querySelectorAll('.active-dot').forEach(d => d.remove());
            resultsContainer.querySelectorAll('.result-item').forEach(d => d.classList.remove('active-lyric'));

            if (activeSource) {
                let activeItem = null;
                if (activeSource.type === 'local') {
                    activeItem = resultsContainer.querySelector('#local-file-card');
                } else {
                    activeItem = resultsContainer.querySelector(`[data-id="${activeSource.id}"][data-source="${activeSource.type}"]`);
                }

                if (activeItem) {
                    activeItem.classList.add('active-lyric');
                    const dot = document.createElement('div');
                    dot.className = 'active-dot';
                    const dotContainer = activeItem.querySelector('.dot-container');
                    if (dotContainer) dotContainer.appendChild(dot);
                } else if (!activeSource.id) {
                    // Fallback to auto match card if no specific ID matched
                    const autoItem = resultsContainer.querySelector('#auto-match-card');
                    if (autoItem) {
                        autoItem.classList.add('active-lyric');
                        const dot = document.createElement('div');
                        dot.className = 'active-dot';
                        const dotContainer = autoItem.querySelector('.dot-container');
                        if (dotContainer) dotContainer.appendChild(dot);
                    }
                }
            }
        }
    });

    // =========================================================
    //  MAIN SETTING LISTENERS
    // =========================================================
    toggleAutolaunch.addEventListener('change', () => {
        saveAndNotify({ autoLaunch: toggleAutolaunch.checked });
    });

    toggleBorderlessPip.addEventListener('change', () => {
        saveAndNotify({ pipMode: toggleBorderlessPip.checked ? 'video' : 'document' });
    });

    toggleEcoMode.addEventListener('change', () => {
        saveAndNotify({ ecoMode: toggleEcoMode.checked });
    });

    toggleTrans.addEventListener('change', () => {
        saveAndNotify({ showTranslation: toggleTrans.checked });
    });

    toggleCloudSync.addEventListener('change', () => {
        const enabled = toggleCloudSync.checked;
        const syncKeysList = Array.from(FLYING_LYRICS.storage.syncKeys);

        if (enabled) {
            // Migrating Local -> Sync
            chrome.storage.local.get(syncKeysList, (localData) => {
                chrome.storage.sync.set(localData, () => {
                    chrome.storage.local.set({ cloudSyncEnabled: true }, () => {
                        notifyTab(localData);
                    });
                });
            });
        } else {
            // Migrating Sync -> Local
            chrome.storage.sync.get(syncKeysList, (syncData) => {
                chrome.storage.local.set({ ...syncData, cloudSyncEnabled: false }, () => {
                    notifyTab(syncData);
                });
            });
        }
    });

    if (telemetryToggle) {
        telemetryToggle.addEventListener('click', (e) => {
            e.preventDefault();
            FLYING_LYRICS.storage.get({ telemetryConsent: true }, (items) => {
                const newConsent = !items.telemetryConsent;
                FLYING_LYRICS.storage.set({ telemetryConsent: newConsent }, () => {
                    updateTelemetryUI(newConsent);
                });
            });
        });
    }

    function updateTelemetryUI(consentEnabled) {
        if (consentEnabled) {
            telemetryToggle.textContent = "I'm in!";
            telemetryToggle.title = "Anonymous Analytics: Opt-out";
        } else {
            telemetryToggle.textContent = "I'm out!";
            telemetryToggle.title = "Anonymous Analytics: Opt-in";
        }
    }

    langSelect.addEventListener('change', () => {
        if (langSelect.value === 'request_language') {
            // Open the Google Form and reset to the previously selected language
            chrome.tabs.create({ url: 'https://forms.gle/qdyBFtmeomtGBroXA' });
            // Revert to the first real language option so the select doesn't stay on the meta-option
            FLYING_LYRICS.storage.get({ translationLang: getBrowserDefaultLanguage() }, (items) => {
                langSelect.value = items.translationLang;
            });
            return;
        }
        saveAndNotify({ translationLang: langSelect.value });
    });

    function setupHoldButton(btnElement, delta) {
        let intervalId = null;
        let timeoutId = null;

        const start = (e) => {
            // Prevent default touch behaviors (like scrolling or double-tap zoom)
            if (e && e.type === 'touchstart') e.preventDefault();

            // Trigger 1 instant tick
            adjustOffset(delta);

            // Wait 400ms to see if user is holding
            timeoutId = setTimeout(() => {
                // Begin rapid ticking
                intervalId = setInterval(() => {
                    adjustOffset(delta);
                }, 50); // fast continuous speed
            }, 400);
        };

        const stop = () => {
            clearTimeout(timeoutId);
            clearInterval(intervalId);
        };

        btnElement.addEventListener('mousedown', start);
        btnElement.addEventListener('touchstart', start, { passive: false });

        btnElement.addEventListener('mouseup', stop);
        btnElement.addEventListener('mouseleave', stop);
        btnElement.addEventListener('touchend', stop);
    }

    setupHoldButton(offsetMinus, -100);
    setupHoldButton(offsetPlus, 100);

    globalOffsetSetBtn.addEventListener('click', () => {
        const val = parseInt(globalOffsetInput.value, 10);
        if (!isNaN(val)) {
            currentGlobalOffset = val;
            saveAndNotify({ globalSyncOffset: val });

            globalOffsetSetBtn.textContent = 'Saved!';
            globalOffsetSetBtn.classList.add('saved');
            setTimeout(() => {
                globalOffsetSetBtn.textContent = 'Set Global';
                globalOffsetSetBtn.classList.remove('saved');
            }, 1000);
        }
    });

    globalOffsetInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            globalOffsetSetBtn.click();
        }
    });

    // =========================================================
    //  TAB NAVIGATION
    // =========================================================
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

    // (Navigation shortcuts btnOpenCustomize & btnBack removed)

    // =========================================================
    //  CUSTOMIZATION LISTENERS
    // =========================================================

    // Font Family
    fontFamilySelect.addEventListener('change', () => {
        const val = fontFamilySelect.value;
        if (val === 'custom') {
            customFontContainer.style.display = 'block';
            customFontInput.focus();
        } else {
            customFontContainer.style.display = 'none';
            glowPreview.style.fontFamily = val;
            saveAndNotify({ customFont: val });
        }
    });

    // =========================================================
    //  FONT FUZZY SEARCH / SUGGESTION ENGINE
    // =========================================================

    /**
     * Scores how well `font` matches `query` (both lowercased).
     * Returns a number — higher is better, 0 means no match.
     */
    function fuzzyFontScore(font, query) {
        const f = font.toLowerCase();
        const q = query.toLowerCase();
        if (f === q) return 100;                    // exact match
        if (f.startsWith(q)) return 80;            // starts with query
        if (f.includes(q)) return 50;              // substring match

        // Character-sequence proximity: all query chars appear in order?
        let fi = 0;
        let penalty = 0;
        let lastIdx = -1;
        for (const ch of q) {
            const idx = f.indexOf(ch, fi);
            if (idx === -1) return 0;               // char not found – no match
            penalty += (idx - lastIdx - 1);         // penalise gaps between chars
            lastIdx = idx;
            fi = idx + 1;
        }
        const score = Math.max(1, 30 - penalty);
        return score;
    }

    /**
     * Applies a font by name: loads the Google Font stylesheet and
     * persists the value. Returns the css font-family string.
     */
    /**
     * Applies a font by name: loads the Google Font stylesheet and
     * persists the value. Returns the css font-family string.
     */
    function applyFontByName(fontName) {
        if (!fontName) return;
        currentlyLoadingFont = fontName;

        // Visual feedback: update the search result checks immediately to show loading
        fontResultsContainer.querySelectorAll('.google-font-item').forEach(card => {
            const nameSpan = card.querySelector('span:first-child');
            const checkSpan = card.querySelector('.google-font-check');
            if (nameSpan && checkSpan) {
                if (nameSpan.textContent === fontName) {
                    checkSpan.className = 'google-font-check active loading';
                } else {
                    checkSpan.className = 'google-font-check';
                }
            }
        });

        const formattedFontName = fontName.replace(/ /g, '+');
        const fontUrl = `https://fonts.googleapis.com/css2?family=${formattedFontName}:wght@400;600;700&display=swap`;

        let link = document.getElementById('fl-custom-font-preview');
        if (!link) {
            link = document.createElement('link');
            link.id = 'fl-custom-font-preview';
            link.rel = 'stylesheet';
            document.head.appendChild(link);
        }

        const familyValue = `"${fontName}", sans-serif`;
        glowPreview.style.fontFamily = familyValue;

        // Save & notify tabs
        saveAndNotify({ customFont: familyValue });

        checkIfPipOpen().then(isOpen => {
            if (isOpen) {
                // Wait for FONT_LOADED_IN_PIP message from the tab.
                // We still update the local preview URL
                link.href = fontUrl;
            } else {
                // Wait for local popup load
                link.href = fontUrl;
                link.onload = () => {
                    document.fonts.load(`1em "${fontName}"`).then(() => {
                        onFontFinishedLoading(fontName);
                    }).catch(() => {
                        onFontFinishedLoading(fontName);
                    });
                };
            }
        });

        // Track in recent fonts (max 10, no duplicates)
        FLYING_LYRICS.storage.get({ recentFonts: [] }, ({ recentFonts }) => {
            const updated = [fontName, ...recentFonts.filter(f => f !== fontName)].slice(0, 10);
            FLYING_LYRICS.storage.set({ recentFonts: updated });
        });

        return familyValue;
    }

    /** Renders clickable font result cards inside fontResultsContainer. */
    function renderFontResults(results) {
        fontResultsContainer.innerHTML = '';
        if (results.length === 0) {
            fontResultsContainer.innerHTML = '<div class="status-msg">No fonts found</div>';
            fontResultsContainer.style.display = 'block';
            return;
        }

        results.forEach(name => {
            const card = document.createElement('div');
            card.className = 'google-font-item';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = name;

            const checkSpan = document.createElement('span');
            checkSpan.textContent = '✓';
            if (currentlyLoadingFont === name) {
                checkSpan.className = 'google-font-check active loading';
            } else if (currentlyAppliedFont === name) {
                checkSpan.className = 'google-font-check active';
            } else {
                checkSpan.className = 'google-font-check';
            }

            card.appendChild(nameSpan);
            card.appendChild(checkSpan);

            card.onclick = () => {
                applyFontByName(name);
                customFontInput.value = name;
            };

            fontResultsContainer.appendChild(card);
        });

        fontResultsContainer.style.display = 'block';
    }

    /** Runs the fuzzy search and updates the results list. */
    function searchFonts() {
        const query = customFontInput.value.trim();
        if (!query) return;

        const fontList = typeof GOOGLE_FONTS !== 'undefined' ? GOOGLE_FONTS : [];

        // Build scored list and sort — cap at 20 results
        const scored = fontList
            .map(name => ({ name, score: fuzzyFontScore(name, query) }))
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 20)
            .map(x => x.name);

        renderFontResults(scored);
    }

    /** Picks 5 random fonts from the full Google Fonts catalogue and shows them as chips. */
    function generateFontSuggestions() {
        const fontList = typeof GOOGLE_FONTS !== 'undefined' ? GOOGLE_FONTS : [];

        // Reservoir-sample 5 fonts without cloning or fully shuffling the entire array.
        // Pick 5 random indices (no repeats) then read the names at those positions.
        const picked = new Set();
        while (picked.size < 5 && picked.size < fontList.length) {
            picked.add(Math.floor(Math.random() * fontList.length));
        }
        const shuffled = [...picked].map(i => fontList[i]);

        fontChipsContainer.innerHTML = '';
        shuffled.forEach(name => {
            const chip = document.createElement('button');
            chip.textContent = name;
            chip.className = 'font-chip';
            chip.onclick = () => {
                customFontInput.value = name;
                applyFontByName(name);
                searchFonts();
            };
            fontChipsContainer.appendChild(chip);
        });

        fontChipsContainer.style.display = 'flex';
    }

    // Hook up Search button + Enter key
    applyCustomFontBtn.addEventListener('click', searchFonts);
    customFontInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') searchFonts();
    });

    // Hook up Suggest button
    suggestFontsBtn.addEventListener('click', generateFontSuggestions);

    // =========================================================
    //  RECENT FONTS DROPDOWN
    // =========================================================

    /** Renders the recent fonts dropdown panel. */
    function renderRecentFontsPanel(recentFonts) {
        recentFontsPanel.innerHTML = '';
        if (!recentFonts || recentFonts.length === 0) {
            recentFontsPanel.innerHTML = '<div class="status-msg--dim">No recent fonts yet</div>';
            return;
        }
        recentFonts.forEach(name => {
            const card = document.createElement('div');
            card.className = 'recent-font-item';
            card.textContent = name;
            card.onclick = () => {
                customFontInput.value = name;
                applyFontByName(name);
                searchFonts();
                recentFontsPanel.style.display = 'none';
            };
            recentFontsPanel.appendChild(card);
        });
    }

    // Toggle Recent panel on button click
    recentFontsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = recentFontsPanel.style.display !== 'none';
        if (isVisible) {
            recentFontsPanel.style.display = 'none';
        } else {
            FLYING_LYRICS.storage.get({ recentFonts: [] }, ({ recentFonts }) => {
                renderRecentFontsPanel(recentFonts);
                recentFontsPanel.style.display = 'block';
            });
        }
    });

    // Close Recent panel when clicking anywhere else
    document.addEventListener('click', () => {
        if (recentFontsPanel) recentFontsPanel.style.display = 'none';
    });

    // Font Size (1-10 step maps to 18px-36px)
    fontSizeSlider.addEventListener('input', () => {
        const step = parseInt(fontSizeSlider.value, 10);
        fontSizeValue.textContent = step;
        const realPx = fontStepToPx(step);
        glowPreview.style.fontSize = `${realPx}px`;

        if (fontSizeWarning) {
            fontSizeWarning.style.display = step >= 7 ? 'inline-block' : 'none';
        }
        notifyTab({ fontSize: realPx });
    });
    fontSizeSlider.addEventListener('change', () => {
        const step = parseInt(fontSizeSlider.value, 10);
        const realPx = fontStepToPx(step);
        saveAndNotify({ fontSize: realPx });
    });

    // Background Blur (0-10 naturally matches 0-10px max required)
    blurSlider.addEventListener('input', () => {
        const step = parseInt(blurSlider.value, 10);
        blurValue.textContent = step;
        notifyTab({ bgBlur: step });
    });
    blurSlider.addEventListener('change', () => {
        const step = parseInt(blurSlider.value, 10);
        saveAndNotify({ bgBlur: step });
    });

    // Background Darkness (0-10 maps to 0-100%)
    darknessSlider.addEventListener('input', () => {
        const step = parseInt(darknessSlider.value, 10);
        darknessValue.textContent = step;
        const realPercent = darkStepToPct(step);
        notifyTab({ bgDarkness: realPercent });
    });
    darknessSlider.addEventListener('change', () => {
        const step = parseInt(darknessSlider.value, 10);
        const realPercent = darkStepToPct(step); // 0=0%, 5=50%, 10=100%
        saveAndNotify({ bgDarkness: realPercent });
    });

    // Line Spacing: UI step 1–10 maps to actual vmin multiplier 3–12 (actual = step + 2)
    lineSpacingSlider.addEventListener('input', () => {
        const step = parseInt(lineSpacingSlider.value, 10);
        lineSpacingValue.textContent = step;
        const actualSpacing = spacingStepToActual(step);
        notifyTab({ lineSpacing: actualSpacing });
    });
    lineSpacingSlider.addEventListener('change', () => {
        const step = parseInt(lineSpacingSlider.value, 10);
        const actualSpacing = spacingStepToActual(step); // step=1 → 3 (default), step=10 → 12
        saveAndNotify({ lineSpacing: actualSpacing });
    });

    // Vertical Anchor mapping
    anchorSlider.addEventListener('input', () => {
        const step = parseInt(anchorSlider.value, 10);
        anchorValue.textContent = step;
        notifyTab({ verticalAnchor: step });
    });
    anchorSlider.addEventListener('change', () => {
        const step = parseInt(anchorSlider.value, 10);
        saveAndNotify({ verticalAnchor: step });
    });


    // =========================================================
    //  ALBUM COVER MODE
    // =========================================================

    /**
     * Applies or removes the disabled overlay on visual controls based on
     * the Album Cover Mode state, and updates the toggle card's active styling.
     * @param {boolean} enabled
     */
    function applyAlbumCoverModeState(enabled) {
        visualControlsWrapper.classList.toggle('controls-disabled', enabled);
        albumCoverToggleCard.classList.toggle('active', enabled);
    }

    // Helper to apply Galaxy Mode classes
    function applyGalaxyModeState(enabled) {
        if (popupWindowContainer) {
            popupWindowContainer.classList.toggle('theme-classic', !enabled);
        }
    }

    toggleAlbumCoverMode.addEventListener('change', () => {
        const enabled = toggleAlbumCoverMode.checked;
        applyAlbumCoverModeState(enabled);
        saveAndNotify({ albumCoverMode: enabled });
    });

    // Cover Mode
    coverModeGroup.addEventListener('click', (e) => {
        const option = e.target.closest('.cover-mode-option');
        if (!option) return;
        document.querySelectorAll('.cover-mode-option').forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        saveAndNotify({ coverMode: option.dataset.mode });
    });

    // Glow Toggle
    toggleGlow.addEventListener('change', () => {
        glowPreview.classList.toggle('active', toggleGlow.checked);
        glowStyleContainer.style.display = toggleGlow.checked ? 'flex' : 'none';
        saveAndNotify({ glowEnabled: toggleGlow.checked });
    });

    // Spotlight Toggle
    toggleSpotlight.addEventListener('change', () => {
        glowPreview.classList.toggle('highlighted', toggleSpotlight.checked);
        saveAndNotify({ spotlightEnabled: toggleSpotlight.checked });
    });

    // Glow Style
    glowStyleSelect.addEventListener('change', () => {
        const val = glowStyleSelect.value;
        glowPreview.classList.toggle('rainbow', val === 'rainbow');
        saveAndNotify({ glowStyle: val });
    });


    // Lyric Alignment
    alignSelect.addEventListener('change', () => {
        saveAndNotify({ lyricAlignment: alignSelect.value });
    });

    // =========================================================
    //  THEME ACCENT / GALAXY HSL CUSTOMIZATION LOGIC
    // =========================================================

    // Helper: convert hex to rgba for glow and backgrounds
    function hexToRgba(hex, alpha) {
        let r = parseInt(hex.slice(1, 3), 16);
        let g = parseInt(hex.slice(3, 5), 16);
        let b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    // Helper: convert hex to HSL
    function hexToHsl(hex) {
        let r = parseInt(hex.slice(1, 3), 16) / 255;
        let g = parseInt(hex.slice(3, 5), 16) / 255;
        let b = parseInt(hex.slice(5, 7), 16) / 255;
        let max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        if (max === min) {
            h = s = 0; // achromatic
        } else {
            let d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
    }

    // Helper: convert HSL to hex
    function hslToHex(h, s, l) {
        s /= 100;
        l /= 100;
        let c = (1 - Math.abs(2 * l - 1)) * s;
        let x = c * (1 - Math.abs((h / 60) % 2 - 1));
        let m = l - c / 2;
        let r = 0, g = 0, b = 0;
        if (0 <= h && h < 60) { r = c; g = x; b = 0; }
        else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
        else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
        else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
        else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
        else if (300 <= h && h < 360) { r = c; g = 0; b = x; }
        r = Math.round((r + m) * 255).toString(16).padStart(2, '0');
        g = Math.round((g + m) * 255).toString(16).padStart(2, '0');
        b = Math.round((b + m) * 255).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    }

    // Blends a color with Peach (#ffaa80) and clamps the lightness
    // to prevent it from getting too dark or too white.
    function applyPeachFilterAndClamp(hex) {
        if (!hex) return hex;
        // 1. Parse Hex to RGB
        let r = parseInt(hex.slice(1, 3), 16);
        let g = parseInt(hex.slice(3, 5), 16);
        let b = parseInt(hex.slice(5, 7), 16);

        // 2. Mix with Peach (#ffaa80: R=255, G=170, B=128)
        // 60% accent color, 40% peach color
        let mixedR = Math.round(r * 0.6 + 255 * 0.4);
        let mixedG = Math.round(g * 0.6 + 170 * 0.4);
        let mixedB = Math.round(b * 0.6 + 128 * 0.4);

        // 3. Convert Mixed RGB to HSL
        let normR = mixedR / 255;
        let normG = mixedG / 255;
        let normB = mixedB / 255;
        let max = Math.max(normR, normG, normB);
        let min = Math.min(normR, normG, normB);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0; // achromatic
        } else {
            let d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case normR: h = (normG - normB) / d + (normG < normB ? 6 : 0); break;
                case normG: h = (normB - normR) / d + 2; break;
                case normB: h = (normR - normG) / d + 4; break;
            }
            h /= 6;
        }

        h = Math.round(h * 360);
        s = Math.round(s * 100);
        l = Math.round(l * 100);

        // 4. Clamp Lightness
        // Prevent too dark (minimum 50% lightness for contrast on dark background)
        // Prevent too white (maximum 78% lightness to retain hue vibrancy)
        l = Math.max(50, Math.min(l, 78));

        // 5. Convert HSL back to Hex
        s /= 100;
        l /= 100;
        let c = (1 - Math.abs(2 * l - 1)) * s;
        let x = c * (1 - Math.abs((h / 60) % 2 - 1));
        let m = l - c / 2;
        let finalR = 0, finalG = 0, finalB = 0;

        if (0 <= h && h < 60) { finalR = c; finalG = x; finalB = 0; }
        else if (60 <= h && h < 120) { finalR = x; finalG = c; finalB = 0; }
        else if (120 <= h && h < 180) { finalR = 0; finalG = c; finalB = x; }
        else if (180 <= h && h < 240) { finalR = 0; finalG = x; finalB = c; }
        else if (240 <= h && h < 300) { finalR = x; finalG = 0; finalB = c; }
        else if (300 <= h && h < 360) { finalR = c; finalG = 0; finalB = x; }

        let outR = Math.round((finalR + m) * 255).toString(16).padStart(2, '0');
        let outG = Math.round((finalG + m) * 255).toString(16).padStart(2, '0');
        let outB = Math.round((finalB + m) * 255).toString(16).padStart(2, '0');

        return `#${outR}${outG}${outB}`;
    }

    // Update custom colors variables globally
    function updateCustomColors() {
        const c1 = slotColors[1];
        const c2 = slotColors[2];
        const c3 = slotColors[3];

        const f1 = applyPeachFilterAndClamp(c1);
        const f2 = applyPeachFilterAndClamp(c2);
        const f3 = applyPeachFilterAndClamp(c3);

        // Update swatches backgrounds
        if (document.getElementById('swatch-color-1')) {
            document.getElementById('swatch-color-1').style.backgroundColor = f1;
            document.getElementById('swatch-color-2').style.backgroundColor = f2;
            document.getElementById('swatch-color-3').style.backgroundColor = f3;
        }

        document.documentElement.style.setProperty('--accent-1', f1);
        document.documentElement.style.setProperty('--accent-2', f2);
        document.documentElement.style.setProperty('--accent-3', f3);
        
        document.documentElement.style.setProperty('--raw-accent-1', c1);
        document.documentElement.style.setProperty('--raw-accent-2', c2);
        document.documentElement.style.setProperty('--raw-accent-3', c3);
        document.documentElement.style.setProperty('--raw-accent', c1);
        document.documentElement.style.setProperty('--raw-accent-blue', c2);
        document.documentElement.style.setProperty('--raw-accent-green', c3);
        
        // Recalculate accents and glows for color 1
        document.documentElement.style.setProperty('--accent-bg', hexToRgba(f1, 0.08));
        document.documentElement.style.setProperty('--accent-glow', hexToRgba(f1, 0.45));

        // Adjust logo neon glow shadow
        const logo = document.querySelector('.logo-row h2');
        if (logo) logo.style.textShadow = `0 0 8px ${hexToRgba(f1, 0.45)}`;
    }

    // Draw dynamic backgrounds on saturation/lightness slider tracks
    function updateSliderBackgrounds(h, s, l) {
        if (hslSatSlider && hslLightSlider) {
            hslSatSlider.style.background = `linear-gradient(to right, ${hslToHex(h, 0, l)}, ${hslToHex(h, 100, l)})`;
            hslLightSlider.style.background = `linear-gradient(to right, #000000, ${hslToHex(h, s, 50)}, #ffffff)`;
        }
    }

    // Select an active slot to configure
    function selectColorSlot(slotId) {
        activeColorSlot = slotId;
        
        // Update swatch active classes
        document.querySelectorAll('.color-swatch-btn').forEach((btn, idx) => {
            btn.classList.toggle('active', idx + 1 === slotId);
        });
        
        // Get slot's hex color and convert to HSL
        const hex = slotColors[slotId];
        const [h, s, l] = hexToHsl(hex);
        
        // Sync values to slider inputs
        hslHueSlider.value = h;
        hslSatSlider.value = s;
        hslLightSlider.value = l;
        
        // Update labels
        hueValDisplay.textContent = h + '°';
        satValDisplay.textContent = s + '%';
        lightValDisplay.textContent = l + '%';
        
        updateSliderBackgrounds(h, s, l);
    }

    // On input sliders adjust color in real-time (real-time CSS updates)
    function onHslSliderInput() {
        const h = parseInt(hslHueSlider.value);
        const s = parseInt(hslSatSlider.value);
        const l = parseInt(hslLightSlider.value);
        
        hueValDisplay.textContent = h + '°';
        satValDisplay.textContent = s + '%';
        lightValDisplay.textContent = l + '%';
        
        const hex = hslToHex(h, s, l);
        slotColors[activeColorSlot] = hex;
        
        // Live update swatch background
        const swatch = document.getElementById('swatch-color-' + activeColorSlot);
        if (swatch) swatch.style.backgroundColor = hex;
        
        updateCustomColors();
        updateSliderBackgrounds(h, s, l);

        // Notify tab dynamically
        notifyTab({
            [`popupColor${activeColorSlot}`]: hex
        });
    }

    // On change sliders write to storage
    function onHslSliderChange() {
        const h = parseInt(hslHueSlider.value);
        const s = parseInt(hslSatSlider.value);
        const l = parseInt(hslLightSlider.value);
        const hex = hslToHex(h, s, l);

        saveAndNotify({
            [`popupColor${activeColorSlot}`]: hex
        });
    }

    // Setup HSL pickers listeners
    if (hslHueSlider && hslSatSlider && hslLightSlider) {
        hslHueSlider.addEventListener('input', onHslSliderInput);
        hslSatSlider.addEventListener('input', onHslSliderInput);
        hslLightSlider.addEventListener('input', onHslSliderInput);

        hslHueSlider.addEventListener('change', onHslSliderChange);
        hslSatSlider.addEventListener('change', onHslSliderChange);
        hslLightSlider.addEventListener('change', onHslSliderChange);
    }

    // Color swatches click listeners
    const swatch1 = document.getElementById('swatch-btn-1');
    const swatch2 = document.getElementById('swatch-btn-2');
    const swatch3 = document.getElementById('swatch-btn-3');
    if (swatch1 && swatch2 && swatch3) {
        swatch1.addEventListener('click', () => selectColorSlot(1));
        swatch2.addEventListener('click', () => selectColorSlot(2));
        swatch3.addEventListener('click', () => selectColorSlot(3));
    }

    // Wire presets buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const c1 = btn.dataset.c1;
            const c2 = btn.dataset.c2;
            const c3 = btn.dataset.c3;
            applyPreset(c1, c2, c3);
        });
    });

    function applyPreset(c1, c2, c3) {
        slotColors[1] = c1;
        slotColors[2] = c2;
        slotColors[3] = c3;
        updateCustomColors();
        selectColorSlot(activeColorSlot);
        saveAndNotify({
            popupColor1: c1,
            popupColor2: c2,
            popupColor3: c3
        });
    }



    // Galaxy Mode checkbox toggle
    if (toggleGalaxyMode) {
        toggleGalaxyMode.addEventListener('change', () => {
            const enabled = toggleGalaxyMode.checked;
            applyGalaxyModeState(enabled);
            saveAndNotify({ galaxyMode: enabled });
        });
    }

    // Background Animation checkbox toggle
    if (toggleBgAnimation) {
        toggleBgAnimation.addEventListener('change', () => {
            const animated = toggleBgAnimation.checked;
            if (popupWindowContainer) popupWindowContainer.classList.toggle('bg-frozen', !animated);
            saveAndNotify({ popupBgAnimation: animated });
        });
    }

    // Visual sub-tabs navigation switching
    if (subTabPipBtn && subTabPopupBtn) {
        subTabPipBtn.addEventListener('click', () => {
            subTabPipBtn.classList.add('active');
            subTabPopupBtn.classList.remove('active');
            subTabPipPane.classList.add('active');
            subTabPopupPane.classList.remove('active');
        });

        subTabPopupBtn.addEventListener('click', () => {
            subTabPopupBtn.classList.add('active');
            subTabPipBtn.classList.remove('active');
            subTabPopupPane.classList.add('active');
            subTabPipPane.classList.remove('active');
        });
    }

    // Split Settings Resets: PiP Window Resets
    if (btnResetPipSettings) {
        btnResetPipSettings.addEventListener('click', () => {
            if (!confirm('Reset Floating Window visual settings to default?')) return;

            const pipDefaults = {
                customFont: "'Noto Sans', 'Segoe UI', sans-serif", fontSize: 26, bgBlur: 2, bgDarkness: 40,
                coverMode: 'default', glowEnabled: false, glowStyle: 'theme', spotlightEnabled: false, lyricAlignment: 'center',
                lineSpacing: 4, verticalAnchor: 4, albumCoverMode: false,
                lastPipWidth: 200, lastPipHeight: 250
            };

            // Reset UI Elements
            fontFamilySelect.value = pipDefaults.customFont;
            customFontContainer.style.display = 'none';
            glowPreview.style.fontFamily = pipDefaults.customFont;

            fontSizeSlider.value = 5;
            fontSizeValue.textContent = 5;
            glowPreview.style.fontSize = `${fontStepToPx(5)}px`;

            lineSpacingSlider.value = 2;
            lineSpacingValue.textContent = 2;

            anchorSlider.value = 4;
            anchorValue.textContent = 4;

            blurSlider.value = 2;
            blurValue.textContent = 2;

            darknessSlider.value = 4;
            darknessValue.textContent = 4;

            document.querySelectorAll('.cover-mode-option').forEach(o => {
                o.classList.toggle('selected', o.dataset.mode === 'default');
            });

            toggleAlbumCoverMode.checked = false;
            applyAlbumCoverModeState(false);

            alignSelect.value = 'center';

            toggleGlow.checked = false;
            toggleSpotlight.checked = false;
            glowPreview.classList.remove('active', 'rainbow', 'highlighted');
            glowStyleContainer.style.display = 'none';
            glowStyleSelect.value = 'theme';

            saveAndNotify(pipDefaults);

            btnResetPipSettings.querySelector('span').textContent = "Reset!";
            setTimeout(() => {
                btnResetPipSettings.querySelector('span').textContent = 'Reset Floating Defaults';
            }, 1000);
        });
    }

    // Split Settings Resets: Settings Popup Resets
    if (btnResetPopupSettings) {
        btnResetPopupSettings.addEventListener('click', () => {
            if (!confirm('Reset settings popup interface visuals to default?')) return;

            const popupDefaults = {
                popupBgAnimation: false,
                galaxyMode: false,
                popupColor1: '#ff007f',
                popupColor2: '#00b4d8',
                popupColor3: '#1DB954'
            };

            toggleBgAnimation.checked = popupDefaults.popupBgAnimation;
            if (popupWindowContainer) popupWindowContainer.classList.remove('bg-frozen');

            if (toggleGalaxyMode) {
                toggleGalaxyMode.checked = popupDefaults.galaxyMode;
                applyGalaxyModeState(popupDefaults.galaxyMode);
            }

            slotColors[1] = popupDefaults.popupColor1;
            slotColors[2] = popupDefaults.popupColor2;
            slotColors[3] = popupDefaults.popupColor3;

            updateCustomColors();
            selectColorSlot(activeColorSlot);

            saveAndNotify(popupDefaults);

            btnResetPopupSettings.querySelector('span').textContent = "Reset!";
            setTimeout(() => {
                btnResetPopupSettings.querySelector('span').textContent = 'Reset Interface Defaults';
            }, 1000);
        });
    }

    // =========================================================
    //  BACKUP & RESTORE
    // =========================================================
    btnExportSettings.addEventListener('click', () => {
        FLYING_LYRICS.storage.get(null, (items) => {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(items, null, 2));
            const dlAnchorElem = document.createElement('a');
            dlAnchorElem.setAttribute("href", dataStr);
            dlAnchorElem.setAttribute("download", "flying-lyrics-backup.json");
            dlAnchorElem.click();
        });
    });

    btnImportSettings.addEventListener('click', () => {
        importFile.click();
    });

    importFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedData = JSON.parse(event.target.result);
                if (typeof importedData !== 'object' || importedData === null) {
                    throw new Error("Invalid format");
                }

                if (!confirm("Are you sure you want to overwrite all your current settings with this backup?")) {
                    importFile.value = ''; // Reset input
                    return;
                }

                FLYING_LYRICS.storage.set(importedData, () => {
                    // Send global refresh ping
                    chrome.tabs.query({ url: ["*://open.spotify.com/*", "*://music.youtube.com/*"] }, (tabs) => {
                        tabs.forEach(tab => {
                            if (tab.id) {
                                chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATE', payload: importedData });
                            }
                        });
                    });
                    
                    alert("Import successful! Please reopen the extension preferences.");
                    window.close(); // Refresh UI by closing the popup
                });

            } catch (err) {
                alert("Failed to parse backup file. Make sure it is a valid Flying Lyrics JSON backup.");
            }
        };
        reader.readAsText(file);
    });

    // =========================================================
    //  HELPERS
    // =========================================================
    function adjustOffset(delta) {
        let newOffset = currentEffectiveOffset + delta;
        updateOffsetDisplay(newOffset);
        saveAndNotify({ syncOffset: newOffset });
    }

    function updateOffsetDisplay(val) {
        currentEffectiveOffset = val;
        offsetDisplay.textContent = (val > 0 ? '+' : '') + val;
    }

    let pendingChanges = null;
    let throttleTimer = null;
    let lastNotifyTime = 0;

    function notifyTab(changes) {
        if (!pendingChanges) {
            pendingChanges = {};
        }
        Object.assign(pendingChanges, changes);

        const now = performance.now();
        const execute = () => {
            const changesToSend = pendingChanges;
            pendingChanges = null;
            throttleTimer = null;
            lastNotifyTime = performance.now();

            chrome.tabs.query({ url: ["*://open.spotify.com/*", "*://music.youtube.com/*"] }, (tabs) => {
                tabs.forEach(tab => {
                    if (tab.id) {
                        chrome.tabs.sendMessage(tab.id, {
                            type: 'SETTINGS_UPDATE',
                            payload: changesToSend
                        }, () => {
                            if (chrome.runtime.lastError) return;
                        });
                    }
                });
            });
        };

        const remaining = 50 - (now - lastNotifyTime);
        if (remaining <= 0) {
            if (throttleTimer) {
                clearTimeout(throttleTimer);
                throttleTimer = null;
            }
            execute();
        } else if (!throttleTimer) {
            throttleTimer = setTimeout(execute, remaining);
        }
    }

    function saveAndNotify(changes) {
        FLYING_LYRICS.storage.set(changes, () => {
            notifyTab(changes);
        });
    }

    function checkIfPipOpen() {
        return new Promise(resolve => {
            chrome.tabs.query({ url: ["*://open.spotify.com/*", "*://music.youtube.com/*"] }, (tabs) => {
                if (!tabs || tabs.length === 0) {
                    resolve(false);
                    return;
                }
                let resolved = false;
                let checkedCount = 0;
                tabs.forEach(tab => {
                    if (!tab.id) {
                        checkedCount++;
                        if (checkedCount === tabs.length && !resolved) {
                            resolved = true;
                            resolve(false);
                        }
                        return;
                    }
                    chrome.tabs.sendMessage(tab.id, { type: 'IS_PIP_OPEN' }, (response) => {
                        checkedCount++;
                        if (chrome.runtime.lastError) {
                            if (checkedCount === tabs.length && !resolved) {
                                resolved = true;
                                resolve(false);
                            }
                            return;
                        }
                        if (response && response.isOpen) {
                            if (!resolved) {
                                resolved = true;
                                resolve(true);
                            }
                        } else {
                            if (checkedCount === tabs.length && !resolved) {
                                resolved = true;
                                resolve(false);
                            }
                        }
                    });
                });
            });
        });
    }

    function onFontFinishedLoading(fontName) {
        if (currentlyLoadingFont === fontName) {
            currentlyLoadingFont = "";
            currentlyAppliedFont = fontName;

            // Update the checkmarks in results
            fontResultsContainer.querySelectorAll('.google-font-item').forEach(card => {
                const nameSpan = card.querySelector('span:first-child');
                const checkSpan = card.querySelector('.google-font-check');
                if (nameSpan && checkSpan) {
                    if (nameSpan.textContent === fontName) {
                        checkSpan.className = 'google-font-check active';
                    } else {
                        checkSpan.className = 'google-font-check';
                    }
                }
            });
        }
    }
});
