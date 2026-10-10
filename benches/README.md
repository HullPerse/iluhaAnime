# Benchmarks

TS benchmarks run with `@pmndrs/labs` from `benches/labs.config.ts`. Rust benchmarks run with cargo from `src-tauri/benches`.

## Commands

- `bun run bench:all`: quick profile only (`labs "@quick"`). Default command, finishes in minutes.
- `bun run bench:full`: every labs file including `@slow`. Slow, run explicitly.
- `bun run bench:slow`: slow files only (currently did-you-mean).
- `bun run bench:labs:compare`: compare the last two saved runs.
- `bun run bench:rust`: Rust benches (`scan_walk`, `anilist_queries`, `string_intern`, `parse_resolve`).

Correct tag filtering is `labs "@tag"` with quotes and without the word `bench`: `labs bench "@tag"` misparses `bench` as a filename filter and runs everything.

## Profiles

- `@quick`: fast files, safe for routine runs.
- `@slow`: heavy files excluded from the default command.

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
| Filename parsing (cold) | ~0.75us and ~600B per file | 125 / 500 / 2000 file corpus, 1.50ms and 1.20MB at 2000 |
| Filename parsing (warm) | same as cold | LRU hit path equals cold at 2000 files |
| Torrent tree build | ~0.3-1.0us and ~300B per file | 148 / 6k / 60k files, 41.6ms and 18.6MB at 60k |
| Anime index rank (suggest) | ~29ms per keystroke at 5k titles | `suggest-pipeline`, per keystroke |
| IPC chattiness, torrent files | 1 invoke per poll cycle (20 ids) | `ipc-chatter`, batched |

Derived figures for a full-library scan: 20k files parse in ~15ms and allocate ~12MB; the 60k-file torrent tree costs ~42ms and ~18.6MB of transient heap. These are transient per-pass allocations, not steady-state footprint.
