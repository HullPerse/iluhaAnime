# Benchmarks

TS benchmarks run with `@pmndrs/labs` from `benches/labs.config.ts`. Rust benchmarks run with cargo from `src-tauri/benches`.

## Commands

- `bun run bench:all`: quick profile only (`labs "@quick"`). Default command, finishes in minutes.
- `bun run bench:full`: every labs file including `@slow`. Slow, run explicitly.
- `bun run bench:slow`: slow files only (currently did-you-mean).
- `bun run bench:labs:compare`: compare the last two saved runs.
- `bun run bench:snapshot`: read-only snapshot of the real learning data in `%APPDATA%\iluhaAnime\app_data.sqlite3`.
- `bun run bench:eval`: Top-1 / Top-3 / MRR@8 against `benches/rank-eval-queries.json`.
- `bun run bench:simulate`: SIMULATED feedback loop over self-labeled family prefixes; not a benchmark and not real user data.
- `bun run bench:rust`: Rust benches (`scan_walk`, `anilist_queries`, `anilist_detail_bundle`, `anilist_detail_audit`, `anilist_list_trim`, `string_intern`, `parse_resolve`, `cover_diff`, `file_query`, `unified_index`; live-only `search_probe`, `details_batch` behind `ILUHA_BENCH_LIVE=1`).
- `bun run bench:ipc`: live IPC ping; needs `tauri dev` with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`.

Correct tag filtering is `labs "@tag"` with quotes and without the word `bench`: `labs bench "@tag"` misparses `bench` as a filename filter and runs everything.

## Profiles

- `@quick`: fast files, safe for routine runs.
- `@slow`: heavy files excluded from the default command.
- `@ranking`: feedback formula, learning projection and learning-density arms.
- `@search`: suggestion pipeline, score, keystroke and learning-density arms.
- `@ipc`: invoke/byte pins for hot call shapes.
- `@memory`: heap per iteration at several input sizes.

## Rules

- Every bench returns a checksum so labs can detect dead code elimination.
- Every bench file states its budget in the header comment. No budget means the file must not be added.
- Regression threshold is the labs `minDelta` of 5%.
- New bench workloads use deterministic fixtures and seeded generators.
- Chatter benches (`@ipc`) pin invoke counts plus request/response bytes per scenario alongside timing benches.
- Scale benches (`@memory`) report heap per iteration at several input sizes so bytes per item can be quoted.
- Bench only performance-sensitive paths with a stated budget. Domains ruled not applicable: locale, settings, theme (static lookups and config), pacer (timing behavior, not throughput).

## System requirements evidence

Measured on Ryzen 7 5800X (8 cores), node 26, release profile, cold and warm as noted. Per-item figures are flat across scales, so they extrapolate linearly. Repeated-run spread on `memory-scale` is +-1.4% (resolution +-2.0%), so these numbers survive a re-run.

| Workload | Per item | Basis |
| --- | --- | --- |
| Filename parsing (cold) | ~73-86us per file | 125 / 500 / 2000 file corpus, 145.99ms at 2000 |
| Filename parsing (warm) | ~0.96us per file when resident | 2000 file corpus, 1.91ms and 1.17MB at 2000; LRU cap is 8000 entries |
| Torrent tree build | ~0.3-1.0us and ~300B per file | 148 / 6k / 60k files, 41.6ms and 18.6MB at 60k |
| Anime index rank (suggest) | ~29ms per keystroke at 5k titles | `suggest-pipeline`, per keystroke |
| Suggest with learning | ~7.9ms per query at 5k titles, learning adds <1% | `suggest-learning`, 6 queries/iter, 10% density |
| Suggest cold index | ~11.7ms per query at 5k titles (+47%) | `suggest-learning`, fresh index reference |
| Ranking feedback (new) | ~23ns per candidate | `ranking`, 50k calls with counters |
| Learning projection build | ~5.5ms at 10k rows, ~38ms at 50k | `ranking`, JS after the SQL read |
| Unified index FTS recall | ~3.1ms at 16k entries, limit 48 | `unified_index`, p50, release |
| Unified index LIKE recall | ~2.0ms at 16k entries, limit 48 | `unified_index`, short query path |
| Learning stats read | ~16ms at 10k rows, ~100ms at 50k | `unified_index`, startup only |
| Feedback UPDATE | ~0.01ms | `unified_index`, schema 22 index; was ~0.85ms full scan |
| IPC chattiness, torrent files | 1 invoke per poll cycle (20 ids) | `ipc-chatter`, batched |
| Suggest pool payload | 1.3KB at 8 rows, 7.9KB at 48 rows | `ipc-chatter`, response bytes per query |

### Ranking and search (2026-10-20)

Medians of 3 labs runs on the same host; the host clock drifted, and labs reported 5-35% run-to-run spread, so treat sub-5% deltas as noise. `unified_index` is a Rust release bench over an in-memory fixture: 8000 anime + 8000 aliases + 200 history rows.

- Widen the recall pool from 8 to 48 rows and the backend stays flat: FTS p50 2.8-3.1ms at limit 8/48/60. The IPC response grows from 1.3KB to 7.9KB per query, invoke count unchanged.
- Learning density 0% / 1% / 10% does not move the 5k suggestion pipeline (47.6 / 48.2 / 47.5ms per 6 queries). The cost is the O(titles x aliases) scan, not the feedback score.
- A fresh index reference (cold normalized-title and SymSpell caches) costs +47%: 70.2ms vs 47.5ms per 6 queries at 5k.
- The new feedback formula is ~23ns per candidate vs ~1ns for the replaced tier formulas. At 10k strings that is ~0.23ms, under 0.5% of a keystroke.
- Feedback UPDATE (`record select one row`) is ~0.01ms after schema 22 added `idx_unified_index_normalized` (was ~0.85ms with a full scan; composite indexes start with `scope`/`kind`, so they cannot serve a bare `normalized_value = ?`). The index is covered by a test that also asserts the query plan uses it.
- Real database snapshot (2026-10-20): 1063 anime, 5650 aliases, 919 local files, 11 torrent history rows, 6 learned rows; projection JSON is small. The 51-query eval scores Top-1 98.0% / Top-3 100% / MRR 0.990, identical for the new and the replaced formula on the same 60-candidate pool. The set is still draft (unique titles, aliases, prefixes, typos, release noise, base-title choices, one Cyrillic alias, one English title without punctuation), so treat it as a floor; replace it with user-checked queries before quoting quality.
- Pasted release names now work: a strong noise signal (quality tag, episode token, bracket group) makes `getSearchSuggestions` prefer `stripReleaseNoise` plus episode-token removal (`AKIRA S01E05 1080p` -> `AKIRA`, `[SubsPlease] AKIRA - 05 [1080p]` -> `AKIRA`). The release-noise category is 9/9 top-1; `Afro Samurai S01E05 1080p` returns the series, not the movie. Generic tokens such as `dual` are left to the direct pass first, so titles like `Dual! Parallel Trouble Adventure` are untouched.
- Base-title promotion: when one candidate only extends another and is within 10% of its score, the shorter base title goes first. This fixes six-character prefixes such as `jujuts` -> `Jujutsu Kaisen 0`, `steins` -> the OVA, `boku n` -> season 7 and `hagane` -> Brotherhood. Unrelated prefix collisions (`Dragon` -> `Dragon Crisis!`) are not reordered.

### Feedback simulation (2026-10-20)

`bun run bench:simulate` is a simulation, not a benchmark and not real user data. It builds a hard set from 109 title families (a six-character prefix of a base title should resolve to that base), generates a rank-biased click stream over it, and replays 12 simulated days (one round per day). Click probability by rank is `1 / 0.85 / 0.65 / 0.45 / 0.3 / 0.2 / 0.15 / 0.1`, with 10% misclicks and a 50% chance to ignore a wrong suggestion above the chosen one. Every arm starts from the same pure match + popularity candidates; only the feedback formula differs.

| Arm | Top-1 | MRR |
| --- | --- | --- |
| No learning | 0.899 | 0.947 |
| New formula (10-day half-life, caps 80/40/60) | 0.972 | 0.986 |
| Old TS formula | 0.972 | 0.986 |
| Half-life 5 days | 0.963 | 0.982 |
| Half-life 20 days | 0.972 | 0.986 |
| Selected cap 160 | 0.972 | 0.985 |
| Selected cap 40 | 0.963 | 0.982 |

The defaults are already on the plateau: learning adds 7.3 points of Top-1 and 0.039 MRR, the old formula catches up to the same final numbers, a shorter half-life or a smaller cap is worse, and a longer half-life or a larger cap is neutral. No ranking constant was changed. The caveat is the point: the labels and the click model are assumptions, so this validates mechanics and rules out obviously bad constants; it does not calibrate real users. The ignore stream is small (32 actions), so negative behaviour is undertested.

Derived figures for a full-library scan: 20k files parse cold in about 1.5s (20,000 x ~80us); warm is about 1us per file only while resident, and the 8000-entry LRU cap means a 20k repeat pass partially misses. The 60k-file torrent tree costs ~53ms and ~18.6MB of transient heap. Parse heap per run includes the retained LRU cache plus transient allocations, so it does not scale linearly below cache capacity. These are transient per-pass allocations, not steady-state footprint.
