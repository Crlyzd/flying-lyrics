# 📊 Flying Lyrics — Match Success Rate Benchmark Suite

An automated testing suite to measure lyric matching accuracy, coverage, and regressions across global Spotify Top 50 playlists.

---

## 🚀 Quick Start

From within the `tools/benchmark` directory:

```bash
# Run a quick test (first 5 songs of Global Top 50)
node src/cli.js --limit 5

# Run full Global Top 50 benchmark (50 songs)
node src/cli.js --playlist global

# Run benchmark for specific country (e.g. Japan, Brazil, Korea, USA)
node src/cli.js --playlist jp
node src/cli.js --playlist br
node src/cli.js --playlist kr
node src/cli.js --playlist us

# Run comprehensive benchmark across all 20+ countries (1,000+ tracks)
npm run benchmark
```

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

## 🛡️ Anti-Bot & Safe Caching

* Track metadata is retrieved and cached to `data/cache/*.json` on the first run.
* Successive test runs execute 100% locally from disk without contacting Spotify.
* To refresh the track lists to today's newest Spotify charts, use the `--refresh` flag:
  ```bash
  node src/cli.js --playlist global --refresh
  ```
