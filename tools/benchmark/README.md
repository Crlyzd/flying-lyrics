# 📊 Flying Lyrics — Match Success Rate Benchmark Suite

An automated testing suite to measure lyric matching accuracy, coverage, and regressions across global music markets with 100% algorithm parity to the Flying Lyrics extension.

---

## 🚀 Benchmark Operating Modes

The benchmark operates in two specialized paradigms:

### 1. 🌍 Wide Benchmark Mode (Top 50 per Country)
Runs across **45 global countries** across all 5 continents. Every country in Wide Mode is **strictly capped at 50 tracks** to ensure fast, uniform execution (~12–15 minutes) without rate limit risks.

```bash
# Run wide benchmark across all 45 countries (2,250 tracks)
npm run benchmark

# Equivalent CLI invocation
node src/cli.js --wide
```

### 2. 🗾 Localized CJK Deep Benchmark (Top 500 Tracks)
Specifically tailored for **Japan** and **South Korea**. Sourced from Kworb Spotify All-Time Totals (6,000+ tracks) to rigorously stress-test the extension's 3-pass CJK search hierarchy (Cleaned $\to$ Dual-Language Aliases $\to$ Phonetic Romanization) against complex Kanji, Hiragana, Katakana, Hangul, Romaji, and anime/OST tags.

```bash
# Run combined CJK deep suite (Japan 500 + Korea 500 = 1,000 tracks)
npm run benchmark:cjk

# Run localized deep benchmark for Japan (500 tracks)
npm run benchmark:jp
# or: node src/cli.js --playlist jp

# Run localized deep benchmark for South Korea (500 tracks)
npm run benchmark:kr
# or: node src/cli.js --playlist kr

# Test a fast slice (e.g. first 20 songs of Japan)
node src/cli.js --playlist jp --limit 20
```

---

## 🔍 Search Engine Parity (3-Pass Multi-Search)

The benchmark search engine emulates the extension's live production engine with 100% fidelity:
1. **Pass 1 (Primary)**: Cleaned Title & Artist queried concurrently across **LRCLIB** and **NetEase CloudSearch** (`cloudsearch/pc`). If NetEase wins, lyric text is verified via `/api/song/lyric`.
2. **Pass 2 (Dual-Language Title Aliases)**: Bracketed/parenthetical dual titles (e.g. `"좋은 날 (Good Day)"` $\to$ `["좋은 날", "Good Day"]`) are extracted and queried on NetEase and LRCLIB.
3. **Pass 3 (Phonetic Romanization)**: Non-ASCII CJK titles are phonetically transliterated into Latin characters and queried against LRCLIB.

---

## 📈 Output & Metrics

The runner categorizes every track into one of three standard categories:

| Status | Meaning |
| :--- | :--- |
| **`Success`** | The provider returned matching lyrics meeting fuzzy title/artist similarity and duration threshold ($\Delta t \le 6\text{s}$). |
| **`No Match`** | Search returned candidates in the database, but none passed match thresholds (e.g. remix, live version, instrumental mismatch). |
| **`No Lyrics`** | The provider database returned 0 candidates for this song. |

After running, results are printed to the console and automatically formatted as a Markdown table in `reports/latest.md`.

---

## 🛡️ Safe Caching & Quota Protection

* Metadata is cached locally to `data/cache/*.json` (`${id}_top50.json` or `${id}_top500.json`) on the first run.
* Successive test runs execute 100% locally from disk without contacting Spotify or Kworb.
* To refresh the track lists to today's newest charts, use the `--refresh` flag:
  ```bash
  node src/cli.js --playlist jp --refresh
  ```

