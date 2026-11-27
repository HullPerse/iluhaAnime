# Vendored librqbit 9.1.0

Copy of crates.io `librqbit` 9.1.0 with local patches:

- `src/storage/filesystem/fs.rs`: payload files are written as `<name>.part` and
  renamed to the final name when they finish. `prefer_part_files` parks a fresh
  add in the `.part` twin, so a file that already has the final name is only
  replaced once the finished `.part` is renamed over it.
- `src/storage/filesystem/sparse.rs`: `FSCTL_SET_SPARSE` gets a valid
  `lpBytesReturned`, so Windows marks the payload sparse and setting the file
  length does not allocate the whole torrent up front.
- `src/storage/filesystem/opened_file.rs`: the sparse marking moved out of the
  `tracing::debug!` macro. Its field values are only evaluated when the event
  is enabled, and the app logs at info level, so the payload used to allocate
  its whole length.
- `src/session.rs` and `src/torrent_state/mod.rs`: `AddTorrentOptions` and
  `ManagedTorrentOptions` carry the `prefer_part_files` flag. It is not
  persisted: a restored session rebuilds its options from the serialized
  torrent, so a restored torrent opens the files that are on disk.
- `src/session.rs`, `src/torrent_state/mod.rs` and
  `src/session_persistence/`: `AddTorrentOptions.root_name` renames the common
  root folder in `file_infos` without touching the metainfo or info hash. The
  app uses it after renaming a torrent folder on disk. Unlike
  `prefer_part_files`, `root_name` is persisted, so a restored session keeps
  resolving the payload under the renamed folder.

`examples/` is a verbatim copy of the crates.io package. `webui/` is not
vendored: the app never enables the `webui` feature and `build.rs` only touches
that directory when the feature is on. The crate is Apache-2.0; `LICENSE` is
the upstream license file.

Updating: copy the new crates.io release over this directory, reapply the
patches listed above, then run

```
cargo check --manifest-path src-tauri/Cargo.toml --locked --all-targets
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

U6 (2026-11-27): rebased on crates.io 9.1.0. Upstream now also evaluates
sparse marking outside tracing; retain the local explanatory comment and
Windows lpBytesReturned correction. All .part/root_name patches remain.
Additional pre-existing patches discovered during the rebase:
- src/stream_connect.rs: HTTP CONNECT proxy transport, percent-decoded proxy
  credentials, and HTTP connection statistics. Preserve SOCKS5/SOCKS5H support.
- src/session.rs: pass the local ProxyConfig to the connector.
- src/torrent_state/live/peers/stats/mod.rs: HTTP transport uses the aggregate
  proxy statistics bucket.
The librqbit-utp 0.7.0 ringbuf >=0.5.2 safety patch remains separately vendored.

Pre-F audit (2026-11-27): HTTP CONNECT response parsing lives in
`src/stream_connect/http_connect.rs`. It consumes only the response header,
preserves coalesced tunnel bytes and enforces the 16 KiB limit before accepting
the terminator. The app integration test `tests/http_connect.rs` includes this
same parser source and checks loopback responses, truncation and refusal.
