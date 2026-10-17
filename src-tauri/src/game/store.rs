//! ROM store: a bundled index of the CC0 chip8Archive plus verified downloads.
//!
//! The index snapshot (`data/chip8-store-v2.json`, built by
//! `scripts/build-chip8-store.ts`) pins one upstream commit and the SHA-1 of
//! every entry, so a download is stored only when its bytes hash exactly to
//! the value recorded at build time. The recorded Octo options drive the
//! session: quirk switches, `tickrate` pace and the palette for XO-CHIP
//! programs. Nothing is fetched while browsing: the list is served from the
//! embedded index plus the local database, and the network is touched only
//! after the user presses Download on one entry.

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::collections::HashSet;
use std::sync::OnceLock;
use tauri::Emitter;

use crate::app_db;
use crate::game::chip8::{Quirks, MAX_PROGRAM_BYTES};
use crate::game::roms;
use crate::game::roms::GameRomInfo;

const INDEX_JSON: &str = include_str!("../../data/chip8-store-v2.json");
const RAW_HOST: &str = "https://raw.githubusercontent.com";
const USER_AGENT: &str = "iluhaAnime/3.0";
const DOWNLOAD_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);
const STORE_LICENSE: &str = "CC0-1.0";
const XOCHIP_PLATFORM: &str = "xochip";
const PROGRESS_EVENT: &str = "game-store-progress";
/// Octo's default pace when an entry records no `tickrate`: 20 cycles per
/// 60 Hz frame (the starting `Emulator.tickrate` in Octo itself).
const OCTO_DEFAULT_TICKRATE: u32 = 20;

#[derive(Deserialize)]
struct StoreIndex {
    repo: String,
    commit: String,
    entries: Vec<IndexEntry>,
}

#[derive(Deserialize)]
struct IndexEntry {
    key: String,
    title: String,
    authors: Vec<String>,
    platform: String,
    #[serde(rename = "desc")]
    description: String,
    howto: Option<String>,
    file: String,
    sha1: String,
    size: u64,
    #[serde(default)]
    options: RomOptions,
}

/// Octo options recorded per archive entry. Absent quirk flags keep the Octo
/// default, which is "off" for every one of them; `vfOrderQuirks` is not
/// modelled because no archive entry sets it. Colour keys come from the
/// archive's flat `options` block; missing ones fall back to Octo's defaults.
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct RomOptions {
    shift_quirks: bool,
    load_store_quirks: bool,
    clip_quirks: bool,
    jump_quirks: bool,
    logic_quirks: bool,
    vblank_quirks: bool,
    /// Octo's `enableXO`: the program may use the XO-CHIP instruction set
    /// even when the archive lists it under an older platform.
    enable_xo: bool,
    fill_color: Option<String>,
    fill_color2: Option<String>,
    blend_color: Option<String>,
    background_color: Option<String>,
    /// Octo's `tickrate`: cycles per 60 Hz frame. `None` when the entry
    /// omitted it, in which case the Octo default pace applies.
    tickrate: Option<u32>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameStoreEntry {
    pub key: String,
    pub title: String,
    pub authors: Vec<String>,
    pub platform: String,
    pub description: String,
    pub howto: Option<String>,
    pub size: u64,
    pub installed: bool,
}

fn index() -> Result<&'static StoreIndex, String> {
    static INDEX: OnceLock<Result<StoreIndex, String>> = OnceLock::new();
    INDEX
        .get_or_init(|| {
            serde_json::from_str(INDEX_JSON)
                .map_err(|error| format!("parse the store index: {error}"))
        })
        .as_ref()
        .map_err(Clone::clone)
}

/// Payload of one streaming `game-store-progress` event during a download.
#[derive(Clone, Serialize)]
struct GameStoreProgress {
    key: String,
    received: u64,
    total: u64,
}

fn sha1_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha1::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

fn installed_ids(connection: &Connection) -> Result<HashSet<String>, String> {
    let mut ids: HashSet<String> = roms::BUILTIN_ROMS
        .iter()
        .map(|rom| sha1_hex(rom.bytes))
        .collect();
    let mut statement = connection
        .prepare("SELECT id FROM game_roms")
        .map_err(|error| format!("prepare installed roms: {error}"))?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| format!("query installed roms: {error}"))?;
    for row in rows {
        ids.insert(row.map_err(|error| format!("read installed rom: {error}"))?);
    }
    Ok(ids)
}

/// The store list: embedded index entries with a live `installed` flag taken
/// from the built-in table plus the `game_roms` rows. Offline-safe by design.
pub fn list_entries(connection: &Connection) -> Result<Vec<GameStoreEntry>, String> {
    let installed = installed_ids(connection)?;
    Ok(index()?
        .entries
        .iter()
        .map(|entry| GameStoreEntry {
            key: entry.key.clone(),
            title: entry.title.clone(),
            authors: entry.authors.clone(),
            platform: entry.platform.clone(),
            description: entry.description.clone(),
            howto: entry.howto.clone(),
            size: entry.size,
            installed: installed.contains(&entry.sha1),
        })
        .collect())
}

fn download_url(repo: &str, commit: &str, file: &str) -> String {
    format!("{RAW_HOST}/{repo}/{commit}/{file}")
}

async fn read_capped(
    response: reqwest::Response,
    limit: usize,
    mut on_progress: impl FnMut(u64),
) -> Result<Vec<u8>, String> {
    use futures::StreamExt;
    let mut body = Vec::with_capacity(4 * 1024);
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| format!("store download read: {error}"))?;
        if body.len().saturating_add(chunk.len()) > limit {
            return Err(format!("the store ROM exceeds {limit} bytes"));
        }
        body.extend_from_slice(&chunk);
        on_progress(body.len() as u64);
    }
    Ok(body)
}

async fn download(url: &str, on_progress: impl FnMut(u64)) -> Result<Vec<u8>, String> {
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(DOWNLOAD_TIMEOUT)
        .build()
        .map_err(|error| format!("store http client: {error}"))?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("store download: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!(
            "store download failed with HTTP {}",
            status.as_u16()
        ));
    }
    read_capped(response, MAX_PROGRAM_BYTES, on_progress).await
}

/// Stores verified bytes for one index entry. Split from the network so the
/// verification and persistence path stays unit-testable offline.
fn install_entry(
    connection: &Connection,
    entry: &IndexEntry,
    bytes: &[u8],
) -> Result<GameRomInfo, String> {
    if bytes.is_empty() {
        return Err("the downloaded ROM is empty".to_string());
    }
    if bytes.len() > MAX_PROGRAM_BYTES {
        return Err(format!(
            "the downloaded ROM exceeds {MAX_PROGRAM_BYTES} bytes"
        ));
    }
    let actual = sha1_hex(bytes);
    if actual != entry.sha1 {
        return Err(format!(
            "checksum mismatch for {}: expected {}, got {actual}",
            entry.key, entry.sha1
        ));
    }
    let author = entry.authors.join(", ");
    let platform = roms::normalize_platform(&entry.platform);
    roms::store_rom(
        connection,
        bytes,
        &platform,
        &entry.title,
        Some(&author),
        Some(STORE_LICENSE),
        app_db::now_seconds(),
    )
}

fn find_entry(key: &str) -> Result<&'static IndexEntry, String> {
    index()?
        .entries
        .iter()
        .find(|entry| entry.key == key)
        .ok_or_else(|| format!("unknown store ROM: {key}"))
}

/// Controls hint that matches a ROM's exact bytes, by SHA-1 in the index.
///
/// Covers bundled and downloaded ROMs and identical files imported by hand;
/// `None` means the archive recorded no hint for these bytes.
pub fn hint_for_bytes(bytes: &[u8]) -> Result<Option<String>, String> {
    let sha1 = sha1_hex(bytes);
    Ok(index()?
        .entries
        .iter()
        .find(|entry| entry.sha1 == sha1)
        .and_then(|entry| entry.howto.clone()))
}

/// Quirks recorded by the archive for these exact bytes, when the index knows
/// the ROM. `None` means the bytes are not in the index and the platform
/// profile applies instead.
#[must_use]
pub fn quirks_for_bytes(bytes: &[u8]) -> Option<Quirks> {
    let sha1 = sha1_hex(bytes);
    index()
        .ok()?
        .entries
        .iter()
        .find(|entry| entry.sha1 == sha1)
        .map(quirks_for_entry)
}

/// Cycles per 60 Hz frame for these exact bytes as the archive plays them:
/// the recorded `tickrate`, or the Octo default when the entry omits one.
/// `None` means the bytes are not in the index and the platform pace applies.
#[must_use]
pub fn tickrate_for_bytes(bytes: &[u8]) -> Option<u32> {
    let sha1 = sha1_hex(bytes);
    index()
        .ok()?
        .entries
        .iter()
        .find(|entry| entry.sha1 == sha1)
        .map(tickrate_for_entry)
}

fn tickrate_for_entry(entry: &IndexEntry) -> u32 {
    entry.options.tickrate.unwrap_or(OCTO_DEFAULT_TICKRATE)
}

/// The four colours a session paints: XO-CHIP indexes pixels as background,
/// first plane, second plane and overlap.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Palette {
    pub background: String,
    pub fill: String,
    pub fill2: String,
    pub blend: String,
}

/// Octo's own defaults, which the archive player shows for programs that
/// record no colours.
#[must_use]
fn octo_default_palette() -> Palette {
    Palette {
        background: "#996600".to_string(),
        fill: "#FFCC00".to_string(),
        fill2: "#FF6600".to_string(),
        blend: "#662200".to_string(),
    }
}

/// Palette for one program: the archive-recorded colours where present and
/// Octo defaults for the rest. Bytes outside the index get the defaults.
///
/// # Errors
///
/// Returns an error when the embedded index cannot be parsed.
pub fn palette_for_bytes(bytes: &[u8]) -> Result<Palette, String> {
    let mut palette = octo_default_palette();
    let sha1 = sha1_hex(bytes);
    let Some(entry) = index()?.entries.iter().find(|entry| entry.sha1 == sha1) else {
        return Ok(palette);
    };
    let options = &entry.options;
    if let Some(fill) = &options.fill_color {
        palette.fill.clone_from(fill);
    }
    if let Some(fill2) = &options.fill_color2 {
        palette.fill2.clone_from(fill2);
    }
    if let Some(blend) = &options.blend_color {
        palette.blend.clone_from(blend);
    }
    if let Some(background) = &options.background_color {
        palette.background.clone_from(background);
    }
    Ok(palette)
}

/// Translates one archive entry's Octo flags into interpreter quirks. Octo
/// flips two of the switches: its `loadStoreQuirks` means "do not advance I"
/// and `jumpQuirks` means "jump through VX", so both invert here.
fn quirks_for_entry(entry: &IndexEntry) -> Quirks {
    let options = &entry.options;
    Quirks {
        shift_uses_vx: options.shift_quirks,
        load_store_increment: !options.load_store_quirks,
        jump_v0: !options.jump_quirks,
        clip: options.clip_quirks,
        logic_resets_vf: options.logic_quirks,
        vblank_wait: options.vblank_quirks,
        xochip: entry.platform == XOCHIP_PLATFORM || options.enable_xo,
    }
}

#[tauri::command]
pub fn game_store_list(app: tauri::AppHandle) -> Result<Vec<GameStoreEntry>, String> {
    let connection = app_db::open_database(&app)?;
    list_entries(&connection)
}

#[tauri::command]
pub async fn game_store_install(app: tauri::AppHandle, key: String) -> Result<GameRomInfo, String> {
    let entry = find_entry(&key)?;
    let index = index()?;
    let url = download_url(&index.repo, &index.commit, &entry.file);
    let bytes = download(&url, |received| {
        let _ = app.emit(
            PROGRESS_EVENT,
            GameStoreProgress {
                key: entry.key.clone(),
                received,
                total: entry.size,
            },
        );
    })
    .await?;
    let _guard = app_db::lock_app_data_write_timeout(app_db::APP_DATA_WRITE_TIMEOUT)?;
    let connection = app_db::open_database(&app)?;
    install_entry(&connection, entry, &bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_db::schema::initialize_schema;

    fn test_db() -> Connection {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema");
        connection
    }

    fn rom_count(connection: &Connection) -> i64 {
        connection
            .query_row("SELECT COUNT(*) FROM game_roms", [], |row| row.get(0))
            .expect("count rows")
    }

    fn synthetic_entry(bytes: &[u8], platform: &str) -> IndexEntry {
        IndexEntry {
            key: "synthetic".to_string(),
            title: "Synthetic ROM".to_string(),
            authors: vec!["Author One".to_string(), "Author Two".to_string()],
            platform: platform.to_string(),
            description: "Test fixture".to_string(),
            howto: None,
            file: "roms/synthetic.ch8".to_string(),
            sha1: sha1_hex(bytes),
            size: bytes.len() as u64,
            options: RomOptions::default(),
        }
    }

    fn is_lower_hex(value: &str) -> bool {
        value
            .chars()
            .all(|ch| ch.is_ascii_digit() || ('a'..='f').contains(&ch))
    }

    #[test]
    fn embedded_index_is_consistent() {
        let index = index().expect("index parses");
        assert!(
            index.entries.len() >= 100,
            "unexpected entry count: {}",
            index.entries.len()
        );
        assert_eq!(index.repo, "JohnEarnest/chip8Archive");
        assert_eq!(index.commit.len(), 40);
        for entry in &index.entries {
            assert_eq!(entry.sha1.len(), 40, "{}: bad sha1 length", entry.key);
            assert!(
                is_lower_hex(&entry.sha1),
                "{}: sha1 is not lowercase hex",
                entry.key
            );
            assert_eq!(entry.file, format!("roms/{}.ch8", entry.key));
            assert!(entry.size > 0, "{}: zero size", entry.key);
            assert!(!entry.title.is_empty(), "{}: empty title", entry.key);
            assert!(roms::PLATFORMS.contains(&entry.platform.as_str()));
            assert!(
                entry.size as usize <= MAX_PROGRAM_BYTES,
                "{}: does not fit the address space",
                entry.key
            );
            for color in [
                entry.options.fill_color.as_deref(),
                entry.options.fill_color2.as_deref(),
                entry.options.blend_color.as_deref(),
                entry.options.background_color.as_deref(),
            ]
            .into_iter()
            .flatten()
            {
                assert!(
                    color.strip_prefix('#').is_some_and(
                        |hex| hex.len() == 6 && hex.chars().all(|c| c.is_ascii_hexdigit())
                    ),
                    "{}: bad colour {color}",
                    entry.key
                );
            }
            if let Some(howto) = &entry.howto {
                assert!(
                    !howto.trim().is_empty() && howto == howto.trim(),
                    "{}: howto must be non-empty and trimmed",
                    entry.key
                );
            }
        }
    }

    #[test]
    fn hint_for_bytes_matches_known_roms_by_sha1() {
        let howtos = index()
            .expect("index parses")
            .entries
            .iter()
            .filter(|entry| entry.howto.is_some())
            .count();
        assert!(howtos >= 50, "unexpected howto share: {howtos}");
        let snake = roms::BUILTIN_ROMS
            .iter()
            .find(|rom| rom.id == "builtin:snake")
            .expect("bundled snake");
        let hint = hint_for_bytes(snake.bytes)
            .expect("lookup")
            .expect("the bundled snake carries a hint");
        assert!(hint.contains("5 7 8 9"), "unexpected snake hint: {hint}");
        let dinorun = roms::BUILTIN_ROMS
            .iter()
            .find(|rom| rom.id == "builtin:dinorun")
            .expect("bundled dinorun");
        let dinorun_hint = hint_for_bytes(dinorun.bytes)
            .expect("lookup")
            .expect("the bundled dinorun carries a hint");
        assert!(
            dinorun_hint.contains("Key 5"),
            "unexpected dinorun hint: {dinorun_hint}"
        );
        assert!(
            hint_for_bytes(&[0x12, 0x34, 0x56, 0x78])
                .expect("lookup")
                .is_none(),
            "unknown bytes must not invent a hint"
        );
    }

    #[test]
    fn quirks_for_bytes_uses_octo_defaults_for_bundled_roms() {
        let snake = roms::BUILTIN_ROMS
            .iter()
            .find(|rom| rom.id == "builtin:snake")
            .expect("bundled snake");
        let quirks = quirks_for_bytes(snake.bytes).expect("snake is indexed");
        assert_eq!(
            quirks,
            Quirks {
                shift_uses_vx: false,
                load_store_increment: true,
                jump_v0: true,
                clip: false,
                logic_resets_vf: false,
                vblank_wait: false,
                xochip: false,
            },
            "Octo defaults must apply when the entry records no flags"
        );
        assert!(
            quirks_for_bytes(&[0x12, 0x34, 0x56, 0x78]).is_none(),
            "unknown bytes must not invent quirks"
        );
    }

    #[test]
    fn tickrate_for_bytes_reads_the_archive_pace() {
        let snake = roms::BUILTIN_ROMS
            .iter()
            .find(|rom| rom.id == "builtin:snake")
            .expect("bundled snake");
        assert_eq!(tickrate_for_bytes(snake.bytes), Some(15));
        let dinorun = roms::BUILTIN_ROMS
            .iter()
            .find(|rom| rom.id == "builtin:dinorun")
            .expect("bundled dinorun");
        assert_eq!(tickrate_for_bytes(dinorun.bytes), Some(15));
        assert!(
            tickrate_for_bytes(&[0x12, 0x34, 0x56, 0x78]).is_none(),
            "unknown bytes must not invent a pace"
        );
    }

    #[test]
    fn tickrate_falls_back_to_the_octo_default() {
        let mut entry = synthetic_entry(&[0x60, 0x01], "chip8");
        assert_eq!(tickrate_for_entry(&entry), OCTO_DEFAULT_TICKRATE);
        entry.options.tickrate = Some(7);
        assert_eq!(tickrate_for_entry(&entry), 7);
    }

    #[test]
    fn quirks_for_entry_inverts_the_octo_switches() {
        let entry = IndexEntry {
            key: "sense".to_string(),
            title: "Sens8tion".to_string(),
            authors: vec!["test".to_string()],
            platform: "schip".to_string(),
            description: String::new(),
            howto: None,
            file: "roms/sense.ch8".to_string(),
            sha1: "0".repeat(40),
            size: 1,
            options: RomOptions {
                shift_quirks: true,
                load_store_quirks: true,
                clip_quirks: false,
                jump_quirks: true,
                logic_quirks: false,
                vblank_quirks: true,
                tickrate: None,
                ..RomOptions::default()
            },
        };
        assert_eq!(
            quirks_for_entry(&entry),
            Quirks {
                shift_uses_vx: true,
                load_store_increment: false,
                jump_v0: false,
                clip: false,
                logic_resets_vf: false,
                vblank_wait: true,
                xochip: false,
            },
            "shiftQuirks/jumpQuirks invert, loadStoreQuirks means no increment"
        );
        let xo = synthetic_entry(&[0x60, 0x01], "xochip");
        assert!(
            quirks_for_entry(&xo).xochip,
            "the xochip platform enables XO-CHIP"
        );
        let mut legacy = synthetic_entry(&[0x60, 0x01], "chip8");
        legacy.options.enable_xo = true;
        assert!(
            quirks_for_entry(&legacy).xochip,
            "an enableXO program runs as XO-CHIP on any platform"
        );
    }

    #[test]
    fn palette_for_bytes_prefers_archive_colours() {
        let snake = roms::BUILTIN_ROMS
            .iter()
            .find(|rom| rom.id == "builtin:snake")
            .expect("bundled snake");
        let palette = palette_for_bytes(snake.bytes).expect("palette");
        assert_eq!(palette.fill, "#84a174", "snake records its own fill colour");
        assert_eq!(palette.background, "#30283e", "and its own background");
        assert_eq!(palette.fill2, "#FF6600", "missing keys keep Octo defaults");
        let unknown = palette_for_bytes(&[0x12, 0x34, 0x56, 0x78]).expect("palette");
        assert_eq!(unknown, octo_default_palette());
    }

    #[test]
    fn download_url_pins_host_repo_commit_and_file() {
        let index = index().expect("index parses");
        let entry = &index.entries[0];
        let url = download_url(&index.repo, &index.commit, &entry.file);
        assert!(url.starts_with("https://raw.githubusercontent.com/JohnEarnest/chip8Archive/"));
        assert!(url.contains(&index.commit));
        assert!(url.ends_with(&format!("/roms/{}.ch8", entry.key)));
    }

    #[test]
    fn list_marks_bundled_and_stored_roms_as_installed() {
        let connection = test_db();
        let entries = list_entries(&connection).expect("list");
        let snake = entries
            .iter()
            .find(|entry| entry.key == "snake")
            .expect("snake is listed");
        assert!(
            snake.installed,
            "the bundled snake must already show as installed"
        );
        let target = entries
            .iter()
            .find(|entry| entry.key != "snake" && entry.platform == "chip8" && !entry.installed)
            .expect("a downloadable chip8 entry");
        let target_sha1 = index()
            .expect("index parses")
            .entries
            .iter()
            .find(|entry| entry.key == target.key)
            .expect("target in index")
            .sha1
            .clone();
        connection
            .execute(
                "INSERT INTO game_roms (id, name, platform, source, size, added_at, data)
                 VALUES (?1, 'stub', 'chip8', 'user', 2, 0, ?2)",
                rusqlite::params![target_sha1, vec![0x12_u8, 0x00]],
            )
            .expect("insert stub row");
        let entries = list_entries(&connection).expect("list again");
        let updated = entries
            .iter()
            .find(|entry| entry.key == target.key)
            .expect("target is still listed");
        assert!(
            updated.installed,
            "a stored sha1 must flip the entry to installed"
        );
    }

    #[test]
    fn install_entry_stores_verified_bytes_with_attribution() {
        let connection = test_db();
        let bytes = [0x60_u8, 0x0A, 0x12, 0x00];
        let entry = synthetic_entry(&bytes, "chip8");
        let stored = install_entry(&connection, &entry, &bytes).expect("install");
        assert_eq!(stored.id, sha1_hex(&bytes));
        assert_eq!(stored.name, "Synthetic ROM");
        assert_eq!(stored.platform, "chip8");
        assert_eq!(stored.source, "user");
        assert_eq!(stored.author.as_deref(), Some("Author One, Author Two"));
        assert_eq!(stored.license.as_deref(), Some("CC0-1.0"));
        assert_eq!(stored.size, bytes.len());
        let listed = roms::find_rom(&connection, &stored.id)
            .expect("find")
            .expect("exists");
        assert_eq!(listed.author.as_deref(), Some("Author One, Author Two"));
        assert_eq!(
            roms::read_rom(&connection, &stored.id).expect("read"),
            bytes
        );
        let again = install_entry(&connection, &entry, &bytes).expect("reinstall");
        assert_eq!(again.id, stored.id);
        assert_eq!(
            rom_count(&connection),
            1,
            "identical bytes must upsert one row"
        );
    }

    #[test]
    fn install_entry_rejects_mismatch_empty_and_oversize() {
        let connection = test_db();
        let bytes = [0x60_u8, 0x0A];
        let mut mismatched = synthetic_entry(&bytes, "chip8");
        mismatched.sha1 = "0".repeat(40);
        let error = install_entry(&connection, &mismatched, &bytes)
            .err()
            .expect("mismatch must fail");
        assert!(error.contains("checksum mismatch"), "{error}");
        assert_eq!(rom_count(&connection), 0, "a mismatch must store nothing");
        let empty = synthetic_entry(&[], "chip8");
        assert!(install_entry(&connection, &empty, &[]).is_err());
        let big = vec![0x12_u8; MAX_PROGRAM_BYTES + 1];
        let big_entry = synthetic_entry(&big, "chip8");
        let error = install_entry(&connection, &big_entry, &big)
            .err()
            .expect("oversize must fail");
        assert!(error.contains("exceeds"), "{error}");
        assert_eq!(rom_count(&connection), 0);
    }

    #[test]
    fn install_entry_accepts_xochip_entries() {
        let connection = test_db();
        let bytes = [0xF3_u8, 0x01, 0x12, 0x00];
        let entry = synthetic_entry(&bytes, "xochip");
        let stored = install_entry(&connection, &entry, &bytes).expect("xochip must install");
        assert_eq!(stored.platform, "xochip");
        assert_eq!(
            roms::read_rom(&connection, &stored.id).expect("read"),
            bytes
        );
    }
}
