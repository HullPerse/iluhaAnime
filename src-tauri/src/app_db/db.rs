use super::schema::initialize_schema;
use rusqlite::Connection;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
pub const DATABASE_FILE: &str = "app_data.sqlite3";
pub const MAX_PAYLOAD_BYTES: usize = 8 * 1024 * 1024;
pub const CURRENT_SCHEMA_VERSION: i64 = 17;
pub fn now_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

pub fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
pub fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data dir: {error}"))?;
    Ok(directory.join(DATABASE_FILE))
}
pub fn open_database(app: &tauri::AppHandle) -> Result<Connection, String> {
    let path = database_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("create app database dir: {error}"))?;
    }
    let connection =
        Connection::open(&path).map_err(|error| format!("open app database: {error}"))?;
    let version = connection
        .pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
        .map_err(|error| format!("read app database version: {error}"))?;
    if version < CURRENT_SCHEMA_VERSION && path.is_file() {
        let backup = PathBuf::from(format!("{}.bak", path.to_string_lossy()));
        if !backup.exists() {
            connection
                .execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")
                .map_err(|error| format!("checkpoint app database before backup: {error}"))?;
            fs::copy(&path, &backup)
                .map_err(|error| format!("backup app database before migration: {error}"))?;
        }
    }
    initialize_schema(&connection)?;
    Ok(connection)
}
