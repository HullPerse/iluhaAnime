# Vendored specta 2.0.0-rc.28

Published package, unchanged RC and source. The only functional patch is the
Cargo.toml dependency alias: paste uses reviewed pastey 0.2.3 instead of the
unmaintained paste 1.0.15. The alias and optional feature name remain paste;
no Rust macro source or exported type contract is changed.

MIT license: LICENCE is copied from the repository root at the published
commit 82278bb5fef379b755af41b831ae3d3533e55b39 because the archive omitted it.
Cargo.toml.orig remains as published.

Remove this path patch when the checked upstream Specta combination supports a
maintained macro dependency. Update together with tauri-specta's alias patch;
verify locked all-target compilation, native tests and byte-identical generated
IPC before adoption. Do not change RC pins as part of a manifest-only refresh.
