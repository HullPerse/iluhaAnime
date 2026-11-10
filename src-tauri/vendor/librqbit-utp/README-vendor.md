# librqbit-utp 0.7.0 vendor

Patched copy of the crates.io release. The only change is `Cargo.toml`:
`ringbuf` is raised from `0.4.7` to `0.5.2` to pick up the fix for
RUSTSEC-2026-0293 (double free in `Consumer::skip`/`clear` when an element's
`Drop` panics). No source file is changed.

`librqbit-utp` only uses `SharedRb<Heap<u8>>` and the `Consumer`, `Producer`,
`Observer` and `Split` traits; the 0.5 API is a drop-in for that usage.
`Cargo.toml.orig` is kept exactly as published.

Remove `src-tauri/vendor/librqbit-utp` and its `[patch.crates-io]` entry once
upstream releases a version with `ringbuf >= 0.5.2`.
