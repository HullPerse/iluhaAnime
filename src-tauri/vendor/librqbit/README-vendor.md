# Vendored librqbit 9.0.1

Copy of crates.io `librqbit` 9.0.1 with five patched files:

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

`examples/` is a verbatim copy of the crates.io package. `webui/` is not
vendored: the app never enables the `webui` feature and `build.rs` only touches
that directory when the feature is on. The crate is Apache-2.0; `LICENSE` is
the upstream license file.

Updating: copy the new crates.io release over this directory, reapply the five
patches listed above, then run

```
cargo check --manifest-path src-tauri/Cargo.toml --locked --all-targets
cargo test --manifest-path src-tauri/Cargo.toml --lib
```
