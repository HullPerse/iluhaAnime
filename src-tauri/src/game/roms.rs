//! ROM library: bundled defaults plus per-user imports stored in the app DB.
//!
//! Built-in ROMs are compiled in (`include_bytes!`) and never touch SQLite;
//! imported ROMs are capped at the CHIP-8 program address space and keyed by
//! the SHA-1 of their bytes, so importing the same file twice updates one row.

use rusqlite::Connection;
use serde::Serialize;
use sha1::{Digest, Sha1};
use std::io::Read;
use std::path::Path;

use crate::app_db;
use crate::game::chip8::MAX_PROGRAM_BYTES;

pub const PLATFORMS: [&str; 4] = ["chip8", "schip", "schip11", "xochip"];

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameRomInfo {
    pub id: String,
    pub name: String,
    pub platform: String,
    pub source: String,
    pub author: Option<String>,
    pub license: Option<String>,
    pub size: usize,
}

pub struct BuiltinRom {
    pub id: &'static str,
    pub name: &'static str,
    pub platform: &'static str,
    pub author: &'static str,
    pub license: &'static str,
    pub bytes: &'static [u8],
}

/// Ships with the app. `Snake` is by `TimoTriisa` (SUPER-CHIP, SHA-1
/// `06a6692c92eb8077329b6d4e59d55479d60574a8`) and `Dino Run` by
/// `Andrezinrc` (CHIP-8, SHA-1 `1a7a2138161b06e083722f978f8cbaaa1ad5344d`),
/// both taken from `chip8Archive` (the archive is CC0); every entry must
/// stay redistributable.
pub const BUILTIN_ROMS: &[BuiltinRom] = &[
    BuiltinRom {
        id: "builtin:snake",
        name: "Snake",
        platform: "schip",
        author: "TimoTriisa",
        license: "CC0-1.0",
        bytes: include_bytes!("../../assets/roms/snake.ch8"),
    },
    BuiltinRom {
        id: "builtin:dinorun",
        name: "Dino Run",
        platform: "chip8",
        author: "Andrezinrc",
        license: "CC0-1.0",
        bytes: include_bytes!("../../assets/roms/dinorun.ch8"),
    },
];

fn builtin_info(rom: &BuiltinRom) -> GameRomInfo {
    GameRomInfo {
        id: rom.id.to_string(),
        name: rom.name.to_string(),
        platform: rom.platform.to_string(),
        source: "builtin".to_string(),
        author: Some(rom.author.to_string()),
        license: Some(rom.license.to_string()),
        size: rom.bytes.len(),
    }
}

#[must_use]
pub fn builtin_by_id(id: &str) -> Option<&'static BuiltinRom> {
    BUILTIN_ROMS.iter().find(|rom| rom.id == id)
}

#[must_use]
pub fn normalize_platform(platform: &str) -> String {
    match platform {
        "schip" | "schip10" => "schip".to_string(),
        "schip11" => "schip11".to_string(),
        "xochip" => "xochip".to_string(),
        _ => "chip8".to_string(),
    }
}

pub fn list_roms(connection: &Connection) -> Result<Vec<GameRomInfo>, String> {
    let mut roms: Vec<GameRomInfo> = BUILTIN_ROMS.iter().map(builtin_info).collect();
    let mut statement = connection
        .prepare(
            "SELECT id, name, platform, source, author, license, size
               FROM game_roms
              ORDER BY added_at DESC, name ASC",
        )
        .map_err(|error| format!("prepare rom list: {error}"))?;
    let records = statement
        .query_map([], |row| {
            Ok(GameRomInfo {
                id: row.get(0)?,
                name: row.get(1)?,
                platform: row.get(2)?,
                source: row.get(3)?,
                author: row.get(4)?,
                license: row.get(5)?,
                size: usize::try_from(row.get::<_, i64>(6)?).unwrap_or(0),
            })
        })
        .map_err(|error| format!("query rom list: {error}"))?;
    for row in records {
        roms.push(row.map_err(|error| format!("read rom row: {error}"))?);
    }
    Ok(roms)
}

pub fn find_rom(connection: &Connection, id: &str) -> Result<Option<GameRomInfo>, String> {
    if let Some(rom) = builtin_by_id(id) {
        return Ok(Some(builtin_info(rom)));
    }
    connection
        .query_row(
            "SELECT id, name, platform, source, author, license, size FROM game_roms WHERE id = ?1",
            [id],
            |row| {
                Ok(GameRomInfo {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    platform: row.get(2)?,
                    source: row.get(3)?,
                    author: row.get(4)?,
                    license: row.get(5)?,
                    size: usize::try_from(row.get::<_, i64>(6)?).unwrap_or(0),
                })
            },
        )
        .map(Some)
        .or_else(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            other => Err(format!("read rom: {other}")),
        })
}

pub fn read_rom(connection: &Connection, id: &str) -> Result<Vec<u8>, String> {
    if let Some(rom) = builtin_by_id(id) {
        return Ok(rom.bytes.to_vec());
    }
    connection
        .query_row("SELECT data FROM game_roms WHERE id = ?1", [id], |row| {
            row.get::<_, Vec<u8>>(0)
        })
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => format!("unknown ROM: {id}"),
            other => format!("read rom bytes: {other}"),
        })
}

pub fn import_rom(
    connection: &Connection,
    path: &Path,
    platform: &str,
    name: Option<&str>,
) -> Result<GameRomInfo, String> {
    // Read one byte past the address space cap: enough to reject oversized
    // files without pulling a hostile multi-gigabyte pick into memory.
    let file = std::fs::File::open(path).map_err(|error| format!("open rom file: {error}"))?;
    let mut bytes = Vec::with_capacity(MAX_PROGRAM_BYTES + 1);
    file.take(MAX_PROGRAM_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("read rom file: {error}"))?;
    let name = name
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map_or_else(
            || {
                path.file_stem().map_or_else(
                    || "ROM".to_string(),
                    |stem| stem.to_string_lossy().to_string(),
                )
            },
            str::to_string,
        );
    store_rom(
        connection,
        &bytes,
        platform,
        &name,
        None,
        None,
        app_db::now_seconds(),
    )
}

/// Upserts bytes into `game_roms`. Shared by the file importer and the ROM
/// store: the store passes the archive author and license so attribution
/// survives, while a later plain re-import keeps them (`COALESCE` on conflict).
pub fn store_rom(
    connection: &Connection,
    bytes: &[u8],
    platform: &str,
    name: &str,
    author: Option<&str>,
    license: Option<&str>,
    added_at: i64,
) -> Result<GameRomInfo, String> {
    if bytes.is_empty() {
        return Err("the ROM file is empty".to_string());
    }
    if bytes.len() > MAX_PROGRAM_BYTES {
        return Err(format!(
            "the ROM exceeds the CHIP-8 address space of {MAX_PROGRAM_BYTES} bytes"
        ));
    }
    let platform = normalize_platform(platform);
    let mut hasher = Sha1::new();
    hasher.update(bytes);
    let id = hex::encode(hasher.finalize());
    connection
        .execute(
            "INSERT INTO game_roms (id, name, platform, source, author, license, size, added_at, data)
             VALUES (?1, ?2, ?3, 'user', ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                platform = excluded.platform,
                author = COALESCE(excluded.author, game_roms.author),
                license = COALESCE(excluded.license, game_roms.license),
                size = excluded.size,
                added_at = excluded.added_at,
                data = excluded.data",
            rusqlite::params![
                id,
                name,
                platform,
                author,
                license,
                bytes.len() as i64,
                added_at,
                bytes
            ],
        )
        .map_err(|error| format!("store rom: {error}"))?;
    Ok(GameRomInfo {
        id,
        name: name.to_string(),
        platform,
        source: "user".to_string(),
        author: author.map(str::to_string),
        license: license.map(str::to_string),
        size: bytes.len(),
    })
}

pub fn delete_rom(connection: &Connection, id: &str) -> Result<(), String> {
    if builtin_by_id(id).is_some() {
        return Err("built-in ROMs cannot be deleted".to_string());
    }
    let removed = connection
        .execute("DELETE FROM game_roms WHERE id = ?1", [id])
        .map_err(|error| format!("delete rom: {error}"))?;
    if removed == 0 {
        return Err(format!("unknown ROM: {id}"));
    }
    Ok(())
}

pub fn load_rom_for_start(
    app: &tauri::AppHandle,
    id: &str,
) -> Result<(Vec<u8>, GameRomInfo), String> {
    let connection = app_db::open_database(app)?;
    let info = find_rom(&connection, id)?.ok_or_else(|| format!("unknown ROM: {id}"))?;
    let bytes = read_rom(&connection, id)?;
    Ok((bytes, info))
}

/// Platform ids the frontend offers when importing a ROM.
#[tauri::command]
#[must_use]
pub fn game_platforms() -> Vec<&'static str> {
    PLATFORMS.to_vec()
}

#[tauri::command]
pub fn game_rom_list(app: tauri::AppHandle) -> Result<Vec<GameRomInfo>, String> {
    let connection = app_db::open_database(&app)?;
    list_roms(&connection)
}

#[tauri::command]
pub fn game_rom_read(app: tauri::AppHandle, id: String) -> Result<tauri::ipc::Response, String> {
    let connection = app_db::open_database(&app)?;
    let bytes = read_rom(&connection, &id)?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub fn game_rom_import(
    app: tauri::AppHandle,
    path: String,
    platform: Option<String>,
    name: Option<String>,
) -> Result<GameRomInfo, String> {
    let platform = platform.unwrap_or_else(|| "chip8".to_string());
    let _guard = app_db::lock_app_data_write_timeout(app_db::APP_DATA_WRITE_TIMEOUT)?;
    let connection = app_db::open_database(&app)?;
    import_rom(&connection, Path::new(&path), &platform, name.as_deref())
}

#[tauri::command]
pub fn game_rom_delete(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let _guard = app_db::lock_app_data_write_timeout(app_db::APP_DATA_WRITE_TIMEOUT)?;
    let connection = app_db::open_database(&app)?;
    delete_rom(&connection, &id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_db::schema::initialize_schema;
    use crate::game::chip8::{Chip8, Quirks};

    fn test_db() -> Connection {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema");
        connection
    }

    fn temp_rom(tag: &str, bytes: &[u8]) -> std::path::PathBuf {
        let path =
            std::env::temp_dir().join(format!("iluha_rom_test_{}_{tag}.ch8", std::process::id()));
        std::fs::write(&path, bytes).expect("write fixture rom");
        path
    }

    #[test]
    fn builtin_roms_are_listed_first_and_readable() {
        let connection = test_db();
        let roms = list_roms(&connection).expect("list");
        assert_eq!(roms[0].id, "builtin:snake");
        assert_eq!(roms[0].source, "builtin");
        assert_eq!(roms[0].platform, "schip");
        assert_eq!(roms[0].author.as_deref(), Some("TimoTriisa"));
        assert_eq!(roms[0].size, 1438);
        let bytes = read_rom(&connection, "builtin:snake").expect("read builtin");
        assert_eq!(bytes.len(), 1438);
        let mut hasher = Sha1::new();
        hasher.update(&bytes);
        assert_eq!(
            hex::encode(hasher.finalize()),
            "06a6692c92eb8077329b6d4e59d55479d60574a8",
            "the bundled snake asset must stay byte-identical to chip8Archive"
        );
        assert_eq!(
            roms.len(),
            BUILTIN_ROMS.len(),
            "no stray rows in a fresh db"
        );
        assert_eq!(roms[1].id, "builtin:dinorun");
        assert_eq!(roms[1].source, "builtin");
        assert_eq!(roms[1].platform, "chip8");
        assert_eq!(roms[1].author.as_deref(), Some("Andrezinrc"));
        assert_eq!(roms[1].size, 520);
        let dino = read_rom(&connection, "builtin:dinorun").expect("read builtin");
        let mut dino_hasher = Sha1::new();
        dino_hasher.update(&dino);
        assert_eq!(
            hex::encode(dino_hasher.finalize()),
            "1a7a2138161b06e083722f978f8cbaaa1ad5344d",
            "the bundled dinorun asset must stay byte-identical to chip8Archive"
        );
    }

    #[test]
    fn builtin_roms_run_and_draw() {
        for rom in BUILTIN_ROMS {
            let mut vm = Chip8::new(Quirks::for_platform(rom.platform));
            vm.load(rom.bytes).expect("builtin rom loads");
            let mut out = Vec::new();
            let mut drew = false;
            for _ in 0..300 {
                for _ in 0..12 {
                    if vm.tick() {
                        break;
                    }
                }
                vm.pack_frame(&mut out);
                if out.iter().any(|byte| *byte != 0) {
                    drew = true;
                }
            }
            assert!(vm.cycles() > 0, "{} executed no cycles", rom.id);
            assert!(drew, "{} never drew a frame", rom.id);
        }
    }

    #[test]
    fn import_deduplicates_by_sha1_and_lists() {
        let connection = test_db();
        let program = [0x12u8, 0x00, 0x60, 0x01];
        let path = temp_rom("dedup", &program);
        let first = import_rom(&connection, &path, "chip8", None).expect("import");
        assert_eq!(
            first.name,
            format!("iluha_rom_test_{}_dedup", std::process::id())
        );
        assert_eq!(first.size, 4);
        let second = import_rom(&connection, &path, "schip", Some("Renamed")).expect("reimport");
        assert_eq!(second.id, first.id, "identical bytes share one row");
        assert_eq!(second.name, "Renamed");
        assert_eq!(second.platform, "schip");
        let roms = list_roms(&connection).expect("list");
        let user_count = roms.iter().filter(|rom| rom.source == "user").count();
        assert_eq!(user_count, 1, "the reimport must update, not duplicate");
        let bytes = read_rom(&connection, &first.id).expect("read");
        assert_eq!(bytes, program);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn import_rejects_empty_and_oversized_files() {
        let connection = test_db();
        let empty = temp_rom("empty", &[]);
        assert!(import_rom(&connection, &empty, "chip8", None).is_err());
        let big = temp_rom("big", &vec![0u8; MAX_PROGRAM_BYTES + 1]);
        assert!(import_rom(&connection, &big, "chip8", None).is_err());
        let exact = temp_rom("exact", &vec![0u8; MAX_PROGRAM_BYTES]);
        let rom = import_rom(&connection, &exact, "chip8", None).expect("exact cap imports");
        assert_eq!(rom.size, MAX_PROGRAM_BYTES);
        let _ = std::fs::remove_file(&empty);
        let _ = std::fs::remove_file(&big);
        let _ = std::fs::remove_file(&exact);
    }

    #[test]
    fn delete_refuses_builtins_and_reports_missing_rows() {
        let connection = test_db();
        for builtin in BUILTIN_ROMS {
            assert!(delete_rom(&connection, builtin.id).is_err());
        }
        assert!(delete_rom(&connection, "nope").is_err());
        let path = temp_rom("delete", &[0x00, 0xE0]);
        let rom = import_rom(&connection, &path, "chip8", None).expect("import");
        delete_rom(&connection, &rom.id).expect("delete");
        assert!(find_rom(&connection, &rom.id).expect("find").is_none());
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn store_metadata_survives_plain_reimports() {
        let connection = test_db();
        let bytes = [0x12u8, 0x00, 0x60, 0x01];
        let path = temp_rom("metadata", &bytes);
        import_rom(&connection, &path, "schip", None).expect("import");
        let stored = store_rom(
            &connection,
            &bytes,
            "schip",
            "Archive Title",
            Some("Some Author"),
            Some("CC0-1.0"),
            app_db::now_seconds(),
        )
        .expect("store");
        assert_eq!(stored.author.as_deref(), Some("Some Author"));
        let reimported = import_rom(&connection, &path, "schip", None).expect("reimport");
        assert_eq!(reimported.id, stored.id);
        let listed = find_rom(&connection, &stored.id)
            .expect("find")
            .expect("exists");
        assert_eq!(
            listed.author.as_deref(),
            Some("Some Author"),
            "COALESCE keeps the store attribution"
        );
        assert_eq!(listed.license.as_deref(), Some("CC0-1.0"));
        assert_eq!(
            listed.name,
            format!("iluha_rom_test_{}_metadata", std::process::id()),
            "a plain re-import renames the row"
        );
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn platform_normalization_maps_known_aliases() {
        assert_eq!(normalize_platform("chip8"), "chip8");
        assert_eq!(normalize_platform("schip"), "schip");
        assert_eq!(normalize_platform("schip10"), "schip");
        assert_eq!(normalize_platform("schip11"), "schip11");
        assert_eq!(normalize_platform("what"), "chip8");
    }
}
