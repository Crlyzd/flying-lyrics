(() => {
    const fl = window.FLYING_LYRICS;

    // ─────────────────────────────────────────────────────────────────────────────
    //  FLYING LYRICS — MULTI-TIER TRANSLATION WATERFALL (content script context)
    // ─────────────────────────────────────────────────────────────────────────────

    fl.translateExistingLyrics = async function () {
        if (!fl.lyricLines || fl.lyricLines.length === 0) return;
        if (fl.lyricLines.length === 1 && (fl.lyricLines[0].isWaitingPlaceholder || (fl.SYSTEM_MSG_SET && fl.SYSTEM_MSG_SET.has(fl.lyricLines[0].text)))) return;

        const placeholders = ["Waiting for music...", "No lyrics found", "Network Error", "Wait for it...", "No Lyrics Available"];

        // 1. Gather all lines that actually need Romaji
        const romajiQueue = [];
        fl.lyricLines.forEach((item, index) => {
            if (!placeholders.includes(item.text) && !item.romaji && /[぀-ゟ゠-ヿ一-鿿가-힣]/.test(item.text)) {
                romajiQueue.push({ index, text: item.text });
            }
        });

        // 2. Gather all lines that actually need Translation
        const transQueue = [];
        if (fl.showTranslation) {
            fl.lyricLines.forEach((item, index) => {
                if (!placeholders.includes(item.text) && !item.translation) {
                    transQueue.push({ index, text: item.text });
                }
            });
        }

        const tasks = [];
        if (romajiQueue.length > 0) {
            tasks.push(fl.processTranslateBatch(romajiQueue, 'rm', 'en', (itemIndex, resultText) => {
                fl.lyricLines[itemIndex].romaji = resultText;
            }));
        }

        if (transQueue.length > 0) {
            tasks.push(fl.processTranslateBatch(transQueue, 't', fl.translationLang, (itemIndex, resultText) => {
                fl.lyricLines[itemIndex].translation = resultText;
            }));
        }

        if (tasks.length > 0) {
            if (!fl.devDisableTranslation) {
                fl.activeTranslationTier = 'Translating...';
            }
            await Promise.all(tasks);
            if (fl.activeTranslationTier === 'Translating...') {
                fl.activeTranslationTier = 'None';
            }
            if (typeof fl.needsLayoutUpdate !== 'undefined') fl.needsLayoutUpdate = true;
        } else {
            fl.activeTranslationTier = 'None';
        }
    };

    /**
     * Resilient 3-tier batch translation & romanization:
     * - Tier 1 (Primary): Google Translate (client=dict-chrome-ex)
     * - Tier 2 (Network Fallbacks): Google token cascade (gtrans) -> MyMemory API -> NetEase community tlyric/romalrc
     * - Tier 3 (Local Safety Net): 100% offline rule-based romanizer.js for Japanese/Korean lyrics
     */
    fl.processTranslateBatch = async function (queue, dtMode, targetLang, applyCallback) {
        if (fl.devDisableTranslation) {
            fl.activeTranslationTier = 'Disabled (Dev)';
            if (dtMode === 'rm') {
                queue.forEach(q => {
                    const localRom = typeof romanize === 'function' ? romanize(q.text) : q.text;
                    applyCallback(q.index, (localRom || q.text).trim());
                });
                if (typeof fl.needsLayoutUpdate !== 'undefined') fl.needsLayoutUpdate = true;
            }
            return;
        }

        const CHUNK_SIZE = 15;
        const DELIMITER = (dtMode === 'rm') ? ' ||| ' : '\n';
        const staggerMs = fl.devTranslateStagger || 150;
        const transConfig = fl.devTransProviders || {
            google: fl.devSimulateTrans !== 'force_gtrans_down' && fl.devSimulateTrans !== 'force_all_trans_down',
            mymemory: fl.devSimulateTrans !== 'force_all_trans_down',
            netease: fl.devSimulateTrans !== 'force_all_trans_down'
        };
        const skipGoogle = transConfig.google === false;
        const skipMyMemory = transConfig.mymemory === false;
        const skipNetEase = transConfig.netease === false;

        // Pre-parse NetEase community fallbacks if available on active track
        let neteaseLrcMap = null;
        const extraSource = fl.activeLyricSource;
        const neteaseRawLrc = (dtMode === 't') ? extraSource?.tlyric : extraSource?.romalrc;
        if (neteaseRawLrc && typeof fl.extractLrcTimestampMap === 'function') {
            neteaseLrcMap = fl.extractLrcTimestampMap(neteaseRawLrc);
        }

        const chunks = [];
        for (let i = 0; i < queue.length; i += CHUNK_SIZE) {
            chunks.push(queue.slice(i, i + CHUNK_SIZE));
        }

        // Fire all chunks concurrently with staggered ramp-up
        await Promise.all(chunks.map((chunk, chunkIdx) => new Promise(resolve => {
            setTimeout(async () => {
                const combinedText = chunk.map(q => q.text).join(DELIMITER);
                let translatedCombo = "";

                // Tier 1 (Primary): Google Translate (client=dict-chrome-ex)
                if (!skipGoogle) {
                    try {
                        const primaryUrl = `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=auto&tl=${targetLang}&dt=${dtMode}&q=${encodeURIComponent(combinedText)}`;
                        const res = await fetch(primaryUrl);
                        if (res.ok) {
                            const data = await res.json();
                            if (dtMode === 'rm') {
                                translatedCombo = data?.[0]?.map(x => x[3] || x[0] || "").join("") || "";
                            } else if (dtMode === 't' && data && data[0]) {
                                translatedCombo = data[0].map(x => x[0] || "").join('');
                            }
                            if (translatedCombo) {
                                fl.activeTranslationTier = 'Tier 1 (Google)';
                            }
                        } else if (res.status === 429) {
                            chrome.runtime.sendMessage({
                                type: 'TRACK_EVENT',
                                payload: {
                                    eventName: 'rate_limited',
                                    params: { url: 'https://translate.googleapis.com/translate_a/single', client: 'dict-chrome-ex' }
                                }
                            }).catch(() => {});
                        }
                    } catch (e) {
                        console.log("Tier 1 Google translation error:", e);
                    }
                }

                // Tier 2A: Google token cascade (client=gtrans) for dt=t
                if (!translatedCombo && dtMode === 't' && !skipGoogle) {
                    try {
                        const cascadeUrl = `https://translate.googleapis.com/translate_a/single?client=gtrans&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(combinedText)}`;
                        const resCascade = await fetch(cascadeUrl);
                        if (resCascade.ok) {
                            const dataCascade = await resCascade.json();
                            if (dataCascade?.[0]) {
                                translatedCombo = dataCascade[0].map(x => x[0] || "").join('');
                                if (translatedCombo) {
                                    fl.activeTranslationTier = 'Tier 2A (Cascade)';
                                }
                            }
                        }
                    } catch {}
                }

                // Tier 2B: External Translation Fallback via MyMemory Translated API
                if (!translatedCombo && dtMode === 't' && !skipMyMemory) {
                    try {
                        let srcLang = 'en';
                        if (typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.detectLanguage === 'function') {
                            try {
                                const detected = await new Promise(res => chrome.i18n.detectLanguage(combinedText, res));
                                if (detected?.languages?.length > 0) {
                                    const top = detected.languages[0].language;
                                    if (top && top !== 'und') {
                                        srcLang = top.split('-')[0].toLowerCase();
                                    }
                                }
                            } catch {}
                        }

                        if (srcLang === 'en' || srcLang === 'und') {
                            if (/[぀-ゟ゠-ヿ]/.test(combinedText)) srcLang = 'ja';
                            else if (/[가-힣]/.test(combinedText)) srcLang = 'ko';
                            else if (/[一-鿿]/.test(combinedText)) srcLang = 'zh';
                            else if (/[а-яА-ЯёЁ]/.test(combinedText)) srcLang = 'ru';
                            else if (/[\u0E00-\u0E7F]/.test(combinedText)) srcLang = 'th';
                            else if (/[\u0600-\u06FF]/.test(combinedText)) srcLang = 'ar';
                            else if (/[\u0900-\u097F]/.test(combinedText)) srcLang = 'hi';
                            else if (/[\u0370-\u03FF]/.test(combinedText)) srcLang = 'el';
                            else if (/[\u0590-\u05FF]/.test(combinedText)) srcLang = 'he';
                        }

                        if (srcLang !== targetLang) {
                            const mmUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(combinedText)}&langpair=${srcLang}|${targetLang}`;
                            const resMM = await fetch(mmUrl);
                            if (resMM.ok) {
                                const mmData = await resMM.json();
                                if (mmData?.responseData?.translatedText && mmData.responseStatus !== 403 && mmData.responseStatus !== "403") {
                                    translatedCombo = mmData.responseData.translatedText;
                                    if (translatedCombo) {
                                        fl.activeTranslationTier = 'Tier 2B (MyMemory)';
                                    }
                                }
                            }
                        }
                    } catch {}
                }

                // Tier 2C: NetEase Community Lyrics Fallback
                let neteaseMatchedAny = false;
                if (!translatedCombo && !skipNetEase && neteaseLrcMap && neteaseLrcMap.size > 0) {
                    for (let j = 0; j < chunk.length; j++) {
                        const itemIndex = chunk[j].index;
                        const itemTime = fl.lyricLines[itemIndex]?.time || 0;
                        const matched = fl.findClosestLrcMatch(neteaseLrcMap, itemTime);
                        if (matched) {
                            applyCallback(itemIndex, matched.trim());
                            neteaseMatchedAny = true;
                        }
                    }
                    if (neteaseMatchedAny) {
                        fl.activeTranslationTier = 'Tier 2C (NetEase)';
                    }
                }

                // Tier 3: Local offline romanizer.js
                if (dtMode === 'rm') {
                    if (translatedCombo) {
                        const translatedLines = translatedCombo.split(/\s*\|\s*\|\s*\|\s*/);
                        for (let j = 0; j < chunk.length; j++) {
                            if (translatedLines[j]) {
                                applyCallback(chunk[j].index, translatedLines[j].trim());
                            } else if (typeof romanize === 'function') {
                                const localRom = romanize(chunk[j].text);
                                if (localRom) applyCallback(chunk[j].index, localRom.trim());
                            }
                        }
                    } else if (!neteaseMatchedAny && typeof romanize === 'function') {
                        for (let j = 0; j < chunk.length; j++) {
                            const localRom = romanize(chunk[j].text);
                            if (localRom) applyCallback(chunk[j].index, localRom.trim());
                        }
                        fl.activeTranslationTier = 'Tier 3 (Offline Romaji)';
                    }
                } else if (dtMode === 't' && translatedCombo) {
                    const translatedLines = translatedCombo.split('\n');
                    for (let j = 0; j < chunk.length; j++) {
                        if (translatedLines[j]) {
                            applyCallback(chunk[j].index, translatedLines[j].trim());
                        }
                    }
                }

                if (typeof fl.needsLayoutUpdate !== 'undefined') {
                    fl.needsLayoutUpdate = true;
                }
                resolve();
            }, chunkIdx * staggerMs);
        })));
    };

})();
