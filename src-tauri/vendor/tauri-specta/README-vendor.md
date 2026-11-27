# Vendored tauri-specta 2.0.0-rc.29

Copy of the published MIT-licensed package. Cargo.toml alone changes the paste
dependency to a pastey 0.2.3 alias. The crate version, features, macro source,
command naming and Specta constraints remain unchanged. LICENSE and
Cargo.toml.orig are the published files.

Keep this patch paired with vendor/specta. Remove it when a checked upstream
combination replaces paste; retain byte-identical generated IPC and real native
command behavior. Never update the Specta RC combination incidentally.
