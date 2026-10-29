//! Streaming source integration for AnimeLib.
//!
//! Direct Rust HTTP client that resolves AnimeLib episodes into playable media
//! URLs and feeds them into the existing libmpv player integration. No QuickJS
//! extension system, no local proxy for v1.

pub mod anime_lib_client;
pub mod anime_lib_models;
pub mod anime_lib_resolver;
pub mod commands;
pub mod kodik;
pub mod prefs;

pub use commands::*;
