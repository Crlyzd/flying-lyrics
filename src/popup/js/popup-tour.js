// src/popup/js/popup-tour.js

(() => {
    const popup = window.FLYING_LYRICS.popup = window.FLYING_LYRICS.popup || {};
    const storage = window.FLYING_LYRICS.storage;

    const tourSteps = [
        {
            tab: "lyrics",
            element: "#search-query",
            title: "Manual Lyric Search",
            desc: "If the automatically matched lyrics are wrong or missing, search by <strong>Artist - Title</strong> here to find and load other synced versions."
        },
        {
            tab: "lyrics",
            element: ".sync-control-row",
            title: "Sync Offset Adjustments",
            desc: "Adjust lyric timing in milliseconds to speed up or slow down the lines, syncing them perfectly with the singer."
        },
        {
            tab: "visuals",
            subTab: "pip",
            element: "#visual-controls-wrapper",
            title: "Visual Customization",
            desc: "Expand these sections to customize fonts, sizes, spacing, background blur, and glowing text. Changes apply instantly to the floating window."
        },
        {
            tab: "visuals",
            subTab: "popup",
            element: "#galaxy-mode-toggle-card",
            title: "Galaxy Mode",
            desc: "Enable a custom animated background inside the extension popup and customize its colors."
        },
        {
            tab: "settings",
            element: "#toggle-borderless-pip",
            title: "Borderless Mode",
            desc: "Turn this on to run in borderless mode (removes the window frame)."
        },
        {
            tab: "settings",
            element: "#toggle-eco-mode",
            title: "Eco Mode (ON by Default)",
            desc: "Eco Mode is enabled by default to save battery and CPU (caps rate at 30 FPS). If the text looks slightly soft on your monitor, turn this <strong>OFF</strong> for ultra-sharp quality and smoother scroll animations."
        },
        {
            tab: "settings",
            element: "#toggle-translation",
            title: "Lyric Translation",
            desc: "Toggle this to automatically translate song lyrics into your preferred language using Google Translate."
        },
        {
            tab: "settings",
            element: "#lang-select",
            title: "Translation Language",
            desc: "Choose your preferred translation language. It matches your browser's language by default."
        },
        {
            tab: "settings",
            element: ".global-offset-row",
            title: "Global Sync Offset",
            desc: "Set a default timing offset (in milliseconds) that applies to all songs as a global fallback. This will not override any custom offsets you save for individual songs."
        }
    ];

    let currentStepIdx = 0;
    let overlayEl = null;
    let bubbleEl = null;
    let cooldownTimer = null;
    let canSkip = false;

    popup.startTour = function () {
        // Reset state
        currentStepIdx = 0;
        
        // Force Galaxy Mode OFF when starting the tour so the walkthrough demonstrates toggling it on
        if (typeof popup.saveAndNotify === 'function') {
            popup.saveAndNotify({ galaxyMode: false });
        }
        const el = popup.el;
        if (el && el.toggleGalaxyMode) {
            el.toggleGalaxyMode.checked = false;
        }
        if (typeof popup.applyGalaxyModeState === 'function') {
            popup.applyGalaxyModeState(false);
        }

        // Programmatically collapse all accordion groups when starting the tour
        document.querySelectorAll('.collapsible-group').forEach(group => {
            group.classList.add('collapsed');
            const header = group.querySelector('.collapsible-header');
            if (header) {
                header.setAttribute('aria-expanded', 'false');
            }
            if (group.id) {
                const storageKey = `collapsed_${group.id}`;
                storage.set({ [storageKey]: true });
            }
        });

        // Check if user is allowed to skip (installed >= 2 months / 60 days ago)
        storage.get({ firstInstalledAt: 0 }, (items) => {
            const installedAt = items.firstInstalledAt || 0;
            const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;
            canSkip = installedAt > 0 && (Date.now() - installedAt >= sixtyDaysMs);
            
            createTourElements();
            showStep(0);
        });
    };

    function createTourElements() {
        if (document.getElementById('tour-overlay')) return;

        overlayEl = document.createElement('div');
        overlayEl.id = 'tour-overlay';
        overlayEl.className = 'tour-overlay';
        document.body.appendChild(overlayEl);

        bubbleEl = document.createElement('div');
        bubbleEl.id = 'tour-bubble';
        bubbleEl.className = 'tour-bubble';
        
        bubbleEl.innerHTML = `
            <div class="tour-bubble-header">
                <span class="tour-bubble-title" id="tour-title"></span>
            </div>
            <div class="tour-bubble-body" id="tour-desc"></div>
            <div class="tour-bubble-footer">
                <button class="tour-btn tour-btn-skip" id="tour-skip">Skip</button>
                <div class="tour-step-dots" id="tour-dots"></div>
                <div class="tour-nav-group">
                    <button class="tour-btn tour-btn-prev" id="tour-prev" style="visibility: hidden;">Prev</button>
                    <button class="tour-btn tour-btn-next disabled" id="tour-next" disabled>Next</button>
                </div>
            </div>
        `;
        document.body.appendChild(bubbleEl);

        // Bind event listeners
        document.getElementById('tour-skip').addEventListener('click', endTour);
        document.getElementById('tour-prev').addEventListener('click', handlePrev);
        document.getElementById('tour-next').addEventListener('click', handleNext);
    }

    function showStep(idx) {
        // Clear previous highlight classes
        document.querySelectorAll('.tour-highlight').forEach(el => {
            el.classList.remove('tour-highlight');
        });

        const step = tourSteps[idx];

        // 1. Programmatically navigate to target tab
        if (step.tab && typeof popup.switchTab === 'function') {
            popup.switchTab(step.tab);
        }

        // 2. Programmatically navigate to target visuals sub-tab if applicable
        if (step.subTab) {
            const el = popup.el;
            if (step.subTab === 'pip' && el.subTabPipBtn) {
                el.subTabPipBtn.click();
            } else if (step.subTab === 'popup' && el.subTabPopupBtn) {
                el.subTabPopupBtn.click();
            }
        }

        // Wait a brief moment for DOM layouts to settle after tab-switches
        setTimeout(() => {
            let targetEl = document.querySelector(step.element);
            
            // Special fallback for container elements (like switches) so we highlight the row/wrapper
            if (targetEl && (step.element.startsWith('#toggle-') || step.element.includes('toggle'))) {
                const parentGroup = targetEl.closest('.control-group');
                if (parentGroup) targetEl = parentGroup;
            }

            if (!targetEl) {
                // Element not found/visible, jump to next or end
                if (idx + 1 < tourSteps.length) {
                    currentStepIdx++;
                    showStep(currentStepIdx);
                } else {
                    endTour();
                }
                return;
            }

            // Snap scroll to bottom for elements at the bottom of the Settings tab, otherwise scroll nearest
            const tabContent = document.querySelector('.tab-content');
            const isBottomSetting = step.element === '#toggle-translation' || 
                                    step.element === '#lang-select' || 
                                    step.element === '.global-offset-row';
            if (tabContent && isBottomSetting) {
                tabContent.scrollTop = tabContent.scrollHeight;
            } else {
                targetEl.scrollIntoView({ block: 'nearest', behavior: 'auto' });
            }

            // Highlight target
            targetEl.classList.add('tour-highlight');

            // Punch cutout hole in overlay using clip-path to lift it above the dim mask
            if (overlayEl) {
                const rect = targetEl.getBoundingClientRect();
                const pad = 4;
                const cLeft = Math.max(0, rect.left - pad);
                const cTop = Math.max(0, rect.top - pad);
                const cRight = Math.min(window.innerWidth, rect.right + pad);
                const cBottom = Math.min(window.innerHeight, rect.bottom + pad);
                
                overlayEl.style.clipPath = `polygon(
                    0% 0%, 
                    0% 100%, 
                    ${cLeft}px 100%, 
                    ${cLeft}px ${cTop}px, 
                    ${cRight}px ${cTop}px, 
                    ${cRight}px ${cBottom}px, 
                    ${cLeft}px ${cBottom}px, 
                    ${cLeft}px 100%, 
                    100% 100%, 
                    100% 0%
                )`;
            }

            // Fill bubble details
            document.getElementById('tour-title').textContent = step.title;
            document.getElementById('tour-desc').innerHTML = step.desc;

            // Handle skip button visibility (only show if 2 months have passed since installation)
            const skipBtn = document.getElementById('tour-skip');
            if (skipBtn) {
                skipBtn.style.display = canSkip ? 'inline-block' : 'none';
            }

            // Draw step dots
            const dotsContainer = document.getElementById('tour-dots');
            dotsContainer.innerHTML = '';
            tourSteps.forEach((_, i) => {
                const dot = document.createElement('span');
                dot.className = `tour-dot ${i === idx ? 'active' : ''}`;
                dotsContainer.appendChild(dot);
            });

            // Update Prev and Next button copy
            const prevBtn = document.getElementById('tour-prev');
            if (prevBtn) {
                prevBtn.style.visibility = idx === 0 ? 'hidden' : 'visible';
            }

            const nextBtn = document.getElementById('tour-next');
            nextBtn.textContent = idx === tourSteps.length - 1 ? 'Finish' : 'Next';

            // Anti-Spam: Disable Next button for a 2.0 seconds cooldown
            nextBtn.disabled = true;
            nextBtn.classList.add('disabled');
            
            if (cooldownTimer) clearTimeout(cooldownTimer);
            cooldownTimer = setTimeout(() => {
                nextBtn.disabled = false;
                nextBtn.classList.remove('disabled');
            }, 2000);

            // 3. Position the bubble with window bounds checking
            const rect = targetEl.getBoundingClientRect();
            const bubbleWidth = 280;

            // Determine horizontal position first (center aligned, but clamp within window edges)
            let left = rect.left + (rect.width - bubbleWidth) / 2;
            left = Math.max(8, Math.min(window.innerWidth - bubbleWidth - 8, left));

            // Assign horizontal positioning and class first to let the DOM settle width constraints before measuring height
            bubbleEl.style.left = `${left}px`;
            bubbleEl.className = `tour-bubble`;

            // Force reflow and measure the true offsetHeight
            const bubbleHeight = bubbleEl.offsetHeight || 135;

            // Determine vertical position (default: below the element)
            let top = rect.bottom + 14;
            let arrowClass = 'arrow-top';

            // If bubble overflows bottom screen limit, flip it to display above the element
            if (top + bubbleHeight > window.innerHeight) {
                top = rect.top - bubbleHeight - 14;
                arrowClass = 'arrow-bottom';
            }

            // Clamp vertical position to prevent it from going off-screen (above the top or below the bottom)
            top = Math.max(8, Math.min(window.innerHeight - bubbleHeight - 8, top));

            bubbleEl.style.top = `${top}px`;
            bubbleEl.className = `tour-bubble ${arrowClass}`;
            bubbleEl.style.opacity = '1'; // Fade in once positioned correctly

        }, 120);
    }

    function handleNext() {
        const nextBtn = document.getElementById('tour-next');
        if (nextBtn.disabled) return; // Prevent clicking during cooldown

        if (currentStepIdx + 1 < tourSteps.length) {
            currentStepIdx++;
            showStep(currentStepIdx);
        } else {
            endTour();
        }
    }

    function handlePrev() {
        if (currentStepIdx > 0) {
            currentStepIdx--;
            showStep(currentStepIdx);
        }
    }

    function endTour() {
        if (cooldownTimer) clearTimeout(cooldownTimer);
        
        // Remove DOM nodes
        if (overlayEl) {
            overlayEl.remove();
            overlayEl = null;
        }
        if (bubbleEl) {
            bubbleEl.remove();
            bubbleEl = null;
        }

        // Clean highlight classes
        document.querySelectorAll('.tour-highlight').forEach(el => {
            el.classList.remove('tour-highlight');
        });

        // Set local storage flag so the tour does not auto-trigger on future openings
        storage.set({ needsOnboardingTour: false });
    }
})();
