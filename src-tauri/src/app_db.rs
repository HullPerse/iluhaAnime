use base64::Engine as _;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Manager;

const DATABASE_FILE: &str = "app_data.sqlite3";
const MAX_PAYLOAD_BYTES: usize = 8 * 1024 * 1024;
const CURRENT_SCHEMA_VERSION: i64 = 7;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppCacheRecord {
    pub namespace: String,
    pub key: String,
    pub payload: String,
    pub expires_at: Option<i64>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaRecordInput {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub title: String,
    pub season: u32,
    pub episode: Option<u32>,
    pub quality: Option<String>,
    pub codec: Option<String>,
    pub subtitle_likely: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaRecord {
    pub path: String,
    pub identity: serde_json::Value,
    pub metadata: serde_json::Value,
    pub scanned_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnifiedIndexEntryInput {
    pub id: String,
    pub kind: String,
    pub scope: String,
    pub value: String,
    pub subtitle: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnifiedIndexEntry {
    pub id: String,
    pub kind: String,
    pub scope: String,
    pub value: String,
    pub subtitle: Option<String>,
    pub metadata: serde_json::Value,
    pub use_count: i64,
    pub selected_count: i64,
    pub ignored_count: i64,
    pub last_used_at: i64,
}

fn normalize_index_text(value: &str) -> String {
    value
        .chars()
        .flat_map(char::to_lowercase)
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(256)
        .collect()
}

fn build_fts_match_query(normalized: &str) -> String {
    normalized
        .split_whitespace()
        .map(|token| format!("\"{}\"", token.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" AND ")
}

fn now_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

pub fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data dir: {error}"))?;
    Ok(directory.join(DATABASE_FILE))
}

fn initialize_schema(connection: &Connection) -> Result<(), String> {
    connection
        .busy_timeout(Duration::from_secs(5))
        .map_err(|error| format!("app database timeout: {error}"))?;
    connection
        .pragma_update(None, "journal_mode", "WAL")
        .map_err(|error| format!("app database journal mode: {error}"))?;
    connection
        .pragma_update(None, "synchronous", "NORMAL")
        .map_err(|error| format!("app database synchronous mode: {error}"))?;
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| format!("app database foreign keys: {error}"))?;

    let version = connection
        .pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
        .map_err(|error| format!("app database version: {error}"))?;

    if version < 1 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database migration transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                CREATE TABLE IF NOT EXISTS cache_entries (
                    namespace TEXT NOT NULL,
                    cache_key TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    expires_at INTEGER,
                    updated_at INTEGER NOT NULL,
                    PRIMARY KEY (namespace, cache_key)
                );
                CREATE INDEX IF NOT EXISTS idx_cache_entries_expiry
                    ON cache_entries (namespace, expires_at);

                CREATE TABLE IF NOT EXISTS media_records (
                    path TEXT PRIMARY KEY,
                    identity_json TEXT,
                    metadata_json TEXT,
                    scanned_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS release_analysis (
                    release_id TEXT PRIMARY KEY,
                    payload TEXT NOT NULL,
                    analyzed_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS anime_statistics (
                    scope TEXT NOT NULL,
                    stat_key TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    updated_at INTEGER NOT NULL,
                    PRIMARY KEY (scope, stat_key)
                );

                PRAGMA user_version = 1;
                ",
            )
            .map_err(|error| format!("app database schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database migration commit: {error}"))?;
    }

    if version < 2 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database index migration transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                CREATE TABLE IF NOT EXISTS unified_index (
                    id TEXT PRIMARY KEY,
                    kind TEXT NOT NULL,
                    scope TEXT NOT NULL,
                    value TEXT NOT NULL,
                    normalized_value TEXT NOT NULL,
                    subtitle TEXT,
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    use_count INTEGER NOT NULL DEFAULT 0,
                    selected_count INTEGER NOT NULL DEFAULT 0,
                    ignored_count INTEGER NOT NULL DEFAULT 0,
                    last_used_at INTEGER NOT NULL DEFAULT 0,
                    updated_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_unified_index_scope_normalized
                    ON unified_index (scope, normalized_value);
                CREATE INDEX IF NOT EXISTS idx_unified_index_kind_normalized
                    ON unified_index (kind, normalized_value);
                PRAGMA user_version = 2;
                ",
            )
            .map_err(|error| format!("app database index schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database index migration commit: {error}"))?;
    }

    if version < 3 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database fts migration transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                CREATE VIRTUAL TABLE IF NOT EXISTS unified_index_fts USING fts5(
                    normalized_value,
                    tokenize='trigram'
                );
                CREATE TRIGGER IF NOT EXISTS trg_unified_index_fts_insert
                AFTER INSERT ON unified_index BEGIN
                    INSERT INTO unified_index_fts(rowid, normalized_value)
                    VALUES (new.rowid, new.normalized_value);
                END;
                CREATE TRIGGER IF NOT EXISTS trg_unified_index_fts_update
                AFTER UPDATE OF normalized_value ON unified_index BEGIN
                    DELETE FROM unified_index_fts WHERE rowid = old.rowid;
                    INSERT INTO unified_index_fts(rowid, normalized_value)
                    VALUES (new.rowid, new.normalized_value);
                END;
                CREATE TRIGGER IF NOT EXISTS trg_unified_index_fts_delete
                AFTER DELETE ON unified_index BEGIN
                    DELETE FROM unified_index_fts WHERE rowid = old.rowid;
                END;
                INSERT INTO unified_index_fts(rowid, normalized_value)
                SELECT rowid, normalized_value FROM unified_index;
                PRAGMA user_version = 3;
                ",
            )
            .map_err(|error| format!("app database fts schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database fts migration commit: {error}"))?;
    }

    if version < 4 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database collection migration transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                CREATE TABLE IF NOT EXISTS collection_items (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    alt_titles_json TEXT NOT NULL DEFAULT '[]',
                    type TEXT NOT NULL CHECK(type IN ('anime','movie','series','custom')),
                    status TEXT NOT NULL CHECK(status IN ('planned','watching','completed','paused','dropped','rewatching')),
                    progress_value INTEGER NOT NULL DEFAULT 0,
                    progress_total INTEGER,
                    progress_unit TEXT NOT NULL CHECK(progress_unit IN ('episodes','seasons','minutes','pages')),
                    duration_minutes INTEGER,
                    rating INTEGER CHECK(rating BETWEEN 0 AND 10),
                    priority TEXT NOT NULL CHECK(priority IN ('low','normal','high')),
                    is_favorite INTEGER NOT NULL DEFAULT 0,
                    year INTEGER,
                    genres_json TEXT NOT NULL DEFAULT '[]',
                    studio TEXT,
                    description TEXT,
                    notes TEXT,
                    cover_url TEXT,
                    cover_blob_id TEXT,
                    thumb_blob_id TEXT,
                    external_ids_json TEXT NOT NULL DEFAULT '{}',
                    custom_fields_json TEXT NOT NULL DEFAULT '{}',
                    local_path TEXT,
                    local_kind TEXT CHECK(local_kind IN ('file','folder')),
                    started_at INTEGER,
                    finished_at INTEGER,
                    last_watched_at INTEGER,
                    rewatch_count INTEGER NOT NULL DEFAULT 0,
                    added_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS collection_reviews (
                    id TEXT PRIMARY KEY,
                    item_id TEXT REFERENCES collection_items(id) ON DELETE SET NULL,
                    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 10),
                    comment TEXT NOT NULL,
                    image_blob_id TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    orphaned INTEGER NOT NULL DEFAULT 0,
                    snapshot_title TEXT
                );
                CREATE TABLE IF NOT EXISTS collection_events (
                    id TEXT PRIMARY KEY,
                    item_id TEXT REFERENCES collection_items(id) ON DELETE SET NULL,
                    kind TEXT NOT NULL,
                    from_value TEXT,
                    to_value TEXT,
                    at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS custom_field_defs (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    field_type TEXT NOT NULL CHECK(field_type IN ('text','number','select','date')),
                    options_json TEXT
                );
                CREATE VIRTUAL TABLE IF NOT EXISTS collection_items_fts USING fts5(
                    title, alt_titles_json, description, notes, genres_json, studio, tokenize='trigram'
                );
                CREATE TRIGGER IF NOT EXISTS trg_collection_items_fts_insert
                AFTER INSERT ON collection_items BEGIN
                    INSERT INTO collection_items_fts(rowid, title, alt_titles_json, description, notes, genres_json, studio)
                    VALUES (new.rowid, new.title, new.alt_titles_json, new.description, new.notes, new.genres_json, new.studio);
                END;
                CREATE TRIGGER IF NOT EXISTS trg_collection_items_fts_update
                AFTER UPDATE ON collection_items BEGIN
                    DELETE FROM collection_items_fts WHERE rowid = old.rowid;
                    INSERT INTO collection_items_fts(rowid, title, alt_titles_json, description, notes, genres_json, studio)
                    VALUES (new.rowid, new.title, new.alt_titles_json, new.description, new.notes, new.genres_json, new.studio);
                END;
                CREATE TRIGGER IF NOT EXISTS trg_collection_items_fts_delete
                AFTER DELETE ON collection_items BEGIN
                    DELETE FROM collection_items_fts WHERE rowid = old.rowid;
                END;
                CREATE INDEX IF NOT EXISTS idx_collection_items_status ON collection_items(status);
                CREATE INDEX IF NOT EXISTS idx_collection_items_rating ON collection_items(rating);
                CREATE INDEX IF NOT EXISTS idx_collection_items_year ON collection_items(year);
                CREATE INDEX IF NOT EXISTS idx_collection_items_favorite ON collection_items(is_favorite);
                CREATE INDEX IF NOT EXISTS idx_collection_events_item ON collection_events(item_id);
                CREATE INDEX IF NOT EXISTS idx_collection_events_at ON collection_events(at);
                PRAGMA user_version = 4;
                ",
            )
            .map_err(|error| format!("app database collection schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database collection migration commit: {error}"))?;
    }

    // v5: user-customizable statuses. Statuses move from a hard CHECK enum into a
    // collection_statuses table (label + color editable); collection_items.status
    // becomes a free TEXT reference, so the table is rebuilt without the CHECK.
    if version < 5 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database statuses migration transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                CREATE TABLE IF NOT EXISTS collection_statuses (
                    id TEXT PRIMARY KEY,
                    label TEXT NOT NULL,
                    color TEXT NOT NULL,
                    order_index INTEGER NOT NULL,
                    is_core INTEGER NOT NULL DEFAULT 0
                );
                INSERT OR IGNORE INTO collection_statuses (id, label, color, order_index, is_core) VALUES
                    ('planned','Planned','#9ca3af',0,1),
                    ('watching','Watching','#3b82f6',1,1),
                    ('completed','Completed','#22c55e',2,1),
                    ('paused','Paused','#f59e0b',3,1),
                    ('dropped','Dropped','#ef4444',4,1),
                    ('rewatching','Rewatching','#a855f7',5,1);
                CREATE TABLE collection_items_v5 (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    alt_titles_json TEXT NOT NULL DEFAULT '[]',
                    type TEXT NOT NULL CHECK(type IN ('anime','movie','series','custom')),
                    status TEXT NOT NULL,
                    progress_value INTEGER NOT NULL DEFAULT 0,
                    progress_total INTEGER,
                    progress_unit TEXT NOT NULL CHECK(progress_unit IN ('episodes','seasons','minutes','pages')),
                    duration_minutes INTEGER,
                    rating INTEGER CHECK(rating BETWEEN 0 AND 10),
                    priority TEXT NOT NULL CHECK(priority IN ('low','normal','high')),
                    is_favorite INTEGER NOT NULL DEFAULT 0,
                    year INTEGER,
                    genres_json TEXT NOT NULL DEFAULT '[]',
                    studio TEXT,
                    description TEXT,
                    notes TEXT,
                    cover_url TEXT,
                    cover_blob_id TEXT,
                    thumb_blob_id TEXT,
                    external_ids_json TEXT NOT NULL DEFAULT '{}',
                    custom_fields_json TEXT NOT NULL DEFAULT '{}',
                    local_path TEXT,
                    local_kind TEXT CHECK(local_kind IN ('file','folder')),
                    started_at INTEGER,
                    finished_at INTEGER,
                    last_watched_at INTEGER,
                    rewatch_count INTEGER NOT NULL DEFAULT 0,
                    added_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                INSERT INTO collection_items_v5 (
                    id, title, alt_titles_json, type, status, progress_value, progress_total,
                    progress_unit, duration_minutes, rating, priority, is_favorite, year,
                    genres_json, studio, description, notes, cover_url, cover_blob_id,
                    thumb_blob_id, external_ids_json, custom_fields_json, local_path, local_kind,
                    started_at, finished_at, last_watched_at, rewatch_count, added_at, updated_at
                )
                SELECT
                    id, title, alt_titles_json, type, status, progress_value, progress_total,
                    progress_unit, duration_minutes, rating, priority, is_favorite, year,
                    genres_json, studio, description, notes, cover_url, cover_blob_id,
                    thumb_blob_id, external_ids_json, custom_fields_json, local_path, local_kind,
                    started_at, finished_at, last_watched_at, rewatch_count, added_at, updated_at
                FROM collection_items;
                DROP TABLE collection_items;
                ALTER TABLE collection_items_v5 RENAME TO collection_items;
                CREATE TRIGGER IF NOT EXISTS trg_collection_items_fts_insert
                AFTER INSERT ON collection_items BEGIN
                    INSERT INTO collection_items_fts(rowid, title, alt_titles_json, description, notes, genres_json, studio)
                    VALUES (new.rowid, new.title, new.alt_titles_json, new.description, new.notes, new.genres_json, new.studio);
                END;
                CREATE TRIGGER IF NOT EXISTS trg_collection_items_fts_update
                AFTER UPDATE ON collection_items BEGIN
                    DELETE FROM collection_items_fts WHERE rowid = old.rowid;
                    INSERT INTO collection_items_fts(rowid, title, alt_titles_json, description, notes, genres_json, studio)
                    VALUES (new.rowid, new.title, new.alt_titles_json, new.description, new.notes, new.genres_json, new.studio);
                END;
                CREATE TRIGGER IF NOT EXISTS trg_collection_items_fts_delete
                AFTER DELETE ON collection_items BEGIN
                    DELETE FROM collection_items_fts WHERE rowid = old.rowid;
                END;
                CREATE INDEX IF NOT EXISTS idx_collection_items_status ON collection_items(status);
                CREATE INDEX IF NOT EXISTS idx_collection_items_rating ON collection_items(rating);
                CREATE INDEX IF NOT EXISTS idx_collection_items_year ON collection_items(year);
                CREATE INDEX IF NOT EXISTS idx_collection_items_favorite ON collection_items(is_favorite);
                PRAGMA user_version = 5;
                ",
            )
            .map_err(|error| format!("app database statuses schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database statuses migration commit: {error}"))?;
    }

    // v6: fix FTS5 update/delete triggers. The special 'delete' INSERT command
    // is only valid for contentless or external-content fts5 tables; on a regular
    // fts5 table it fails with "SQL logic error", aborting every UPDATE/DELETE of
    // the base table (collection_items and unified_index). Plain DELETE works.
    if version < 6 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database fts trigger fix transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                DROP TRIGGER IF EXISTS trg_collection_items_fts_update;
                DROP TRIGGER IF EXISTS trg_collection_items_fts_delete;
                CREATE TRIGGER trg_collection_items_fts_update
                AFTER UPDATE ON collection_items BEGIN
                    DELETE FROM collection_items_fts WHERE rowid = old.rowid;
                    INSERT INTO collection_items_fts(rowid, title, alt_titles_json, description, notes, genres_json, studio)
                    VALUES (new.rowid, new.title, new.alt_titles_json, new.description, new.notes, new.genres_json, new.studio);
                END;
                CREATE TRIGGER trg_collection_items_fts_delete
                AFTER DELETE ON collection_items BEGIN
                    DELETE FROM collection_items_fts WHERE rowid = old.rowid;
                END;
                DROP TRIGGER IF EXISTS trg_unified_index_fts_update;
                DROP TRIGGER IF EXISTS trg_unified_index_fts_delete;
                CREATE TRIGGER trg_unified_index_fts_update
                AFTER UPDATE OF normalized_value ON unified_index BEGIN
                    DELETE FROM unified_index_fts WHERE rowid = old.rowid;
                    INSERT INTO unified_index_fts(rowid, normalized_value)
                    VALUES (new.rowid, new.normalized_value);
                END;
                CREATE TRIGGER trg_unified_index_fts_delete
                AFTER DELETE ON unified_index BEGIN
                    DELETE FROM unified_index_fts WHERE rowid = old.rowid;
                END;
                PRAGMA user_version = 6;
                ",
            )
            .map_err(|error| format!("app database fts trigger fix schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database fts trigger fix commit: {error}"))?;
    }

    // v7: drop the collections feature (collection_lists + collection_members).
    // Collections were removed from the product: separation is by status only.
    if version < 7 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database collections removal transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                DROP TABLE IF EXISTS collection_members;
                DROP TABLE IF EXISTS collection_lists;
                PRAGMA user_version = 7;
                ",
            )
            .map_err(|error| format!("app database collections removal schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database collections removal commit: {error}"))?;
    }

    if version > CURRENT_SCHEMA_VERSION {
        return Err(format!(
            "app database is newer than this application ({version} > {CURRENT_SCHEMA_VERSION})"
        ));
    }

    Ok(())
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

#[tauri::command]
pub fn check_app_database_integrity(app: tauri::AppHandle) -> Result<String, String> {
    let connection = open_database(&app)?;
    let result = connection
        .query_row("PRAGMA integrity_check", [], |row| row.get::<_, String>(0))
        .map_err(|error| format!("app database integrity check: {error}"))?;
    if result.eq_ignore_ascii_case("ok") {
        Ok(result)
    } else {
        Err(format!("app database integrity check failed: {result}"))
    }
}

fn validate_cache_input(namespace: &str, key: &str, payload: &str) -> Result<(), String> {
    if namespace.is_empty() || namespace.len() > 100 || key.is_empty() || key.len() > 512 {
        return Err("Cache namespace or key has an invalid length".to_string());
    }
    if payload.len() > MAX_PAYLOAD_BYTES {
        return Err(format!(
            "Cache payload exceeds {} MiB",
            MAX_PAYLOAD_BYTES / 1024 / 1024
        ));
    }
    serde_json::from_str::<serde_json::Value>(payload)
        .map_err(|error| format!("Cache payload must be valid JSON: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn get_app_cache(
    app: tauri::AppHandle,
    namespace: String,
    key: String,
) -> Result<Option<AppCacheRecord>, String> {
    let connection = open_database(&app)?;
    let record = connection
        .query_row(
            "SELECT namespace, cache_key, payload, expires_at, updated_at
             FROM cache_entries WHERE namespace = ?1 AND cache_key = ?2",
            params![namespace, key],
            |row| {
                Ok(AppCacheRecord {
                    namespace: row.get(0)?,
                    key: row.get(1)?,
                    payload: row.get(2)?,
                    expires_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            },
        )
        .optional()
        .map_err(|error| format!("read app cache: {error}"))?;

    if let Some(record) = record {
        if record
            .expires_at
            .is_some_and(|expires_at| expires_at <= now_seconds())
        {
            connection
                .execute(
                    "DELETE FROM cache_entries WHERE namespace = ?1 AND cache_key = ?2",
                    params![record.namespace, record.key],
                )
                .map_err(|error| format!("remove expired cache: {error}"))?;
            return Ok(None);
        }
        return Ok(Some(record));
    }

    Ok(None)
}

#[tauri::command]
pub fn put_app_cache(
    app: tauri::AppHandle,
    namespace: String,
    key: String,
    payload: String,
    ttl_seconds: Option<i64>,
) -> Result<(), String> {
    validate_cache_input(&namespace, &key, &payload)?;
    let connection = open_database(&app)?;
    let expires_at = ttl_seconds
        .filter(|ttl| *ttl > 0)
        .map(|ttl| now_seconds().saturating_add(ttl));
    connection
        .execute(
            "INSERT INTO cache_entries (namespace, cache_key, payload, expires_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(namespace, cache_key) DO UPDATE SET
                payload = excluded.payload,
                expires_at = excluded.expires_at,
                updated_at = excluded.updated_at",
            params![namespace, key, payload, expires_at, now_seconds()],
        )
        .map_err(|error| format!("write app cache: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn delete_app_cache(
    app: tauri::AppHandle,
    namespace: String,
    key: String,
) -> Result<(), String> {
    let connection = open_database(&app)?;
    connection
        .execute(
            "DELETE FROM cache_entries WHERE namespace = ?1 AND cache_key = ?2",
            params![namespace, key],
        )
        .map_err(|error| format!("delete app cache: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn clear_app_cache(app: tauri::AppHandle, namespace: Option<String>) -> Result<u64, String> {
    let connection = open_database(&app)?;
    let deleted = if let Some(namespace) = namespace {
        connection
            .execute(
                "DELETE FROM cache_entries WHERE namespace = ?1",
                params![namespace],
            )
            .map_err(|error| format!("clear app cache: {error}"))?
    } else {
        connection
            .execute("DELETE FROM cache_entries", [])
            .map_err(|error| format!("clear app cache: {error}"))?
    };
    Ok(deleted as u64)
}

fn validate_unified_index_entry(entry: &UnifiedIndexEntryInput) -> Result<String, String> {
    if entry.id.is_empty()
        || entry.id.len() > 512
        || entry.kind.is_empty()
        || entry.kind.len() > 64
        || entry.scope.is_empty()
        || entry.scope.len() > 64
        || entry.value.trim().is_empty()
        || entry.value.chars().count() > 512
        || entry
            .subtitle
            .as_ref()
            .is_some_and(|value| value.chars().count() > 512)
    {
        return Err("Unified index entry contains an invalid or oversized field".into());
    }
    let metadata = entry.metadata.clone().unwrap_or(serde_json::Value::Null);
    let metadata_text = serde_json::to_string(&metadata)
        .map_err(|error| format!("Unified index metadata: {error}"))?;
    if metadata_text.len() > 32 * 1024 {
        return Err("Unified index metadata is too large".into());
    }
    Ok(metadata_text)
}

#[tauri::command]
pub fn upsert_unified_index(
    app: tauri::AppHandle,
    entries: Vec<UnifiedIndexEntryInput>,
) -> Result<usize, String> {
    if entries.len() > 5_000 {
        return Err("Too many unified index entries".into());
    }
    let connection = open_database(&app)?;
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| format!("unified index transaction: {error}"))?;
    let now = now_seconds();
    for entry in &entries {
        let metadata = validate_unified_index_entry(entry)?;
        let normalized = normalize_index_text(&entry.value);
        transaction
            .execute(
                "INSERT INTO unified_index
                    (id, kind, scope, value, normalized_value, subtitle, metadata_json, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                 ON CONFLICT(id) DO UPDATE SET
                    kind = excluded.kind,
                    scope = excluded.scope,
                    value = excluded.value,
                    normalized_value = excluded.normalized_value,
                    subtitle = excluded.subtitle,
                    metadata_json = excluded.metadata_json,
                    updated_at = excluded.updated_at",
                params![
                    entry.id,
                    entry.kind,
                    entry.scope,
                    entry.value,
                    normalized,
                    entry.subtitle,
                    metadata,
                    now
                ],
            )
            .map_err(|error| format!("upsert unified index: {error}"))?;
    }
    transaction
        .commit()
        .map_err(|error| format!("unified index commit: {error}"))?;
    Ok(entries.len())
}

pub fn prune_unified_index_scope(
    app: tauri::AppHandle,
    scope: String,
    keep_ids: Vec<String>,
) -> Result<usize, String> {
    if scope.is_empty() || scope.len() > 64 || keep_ids.len() > 50_000 {
        return Err("Unified index scope or keep list is invalid".into());
    }
    let connection = open_database(&app)?;
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| format!("prune unified index transaction: {error}"))?;
    let keep_ids: HashSet<&str> = keep_ids.iter().map(String::as_str).collect();
    let stale_ids = {
        let mut statement = transaction
            .prepare("SELECT id FROM unified_index WHERE scope = ?1")
            .map_err(|error| format!("list stale unified index entries: {error}"))?;
        let rows = statement
            .query_map(params![scope], |row| row.get::<_, String>(0))
            .map_err(|error| format!("query stale unified index entries: {error}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("read stale unified index entries: {error}"))?;
        rows
    };
    let mut removed = 0usize;
    for id in stale_ids {
        if keep_ids.contains(id.as_str()) {
            continue;
        }
        removed += transaction
            .execute(
                "DELETE FROM unified_index WHERE scope = ?1 AND id = ?2",
                params![scope, id],
            )
            .map_err(|error| format!("delete stale unified index entry: {error}"))?;
    }
    transaction
        .commit()
        .map_err(|error| format!("prune unified index commit: {error}"))?;
    Ok(removed)
}

#[tauri::command]
pub fn record_unified_index_action(
    app: tauri::AppHandle,
    id: String,
    action: String,
) -> Result<(), String> {
    if id.is_empty() || id.len() > 512 {
        return Err("Unified index id is invalid".into());
    }
    let column = match action.as_str() {
        "use" => "use_count",
        "select" => "selected_count",
        "ignore" => "ignored_count",
        _ => return Err("Unknown unified index action".into()),
    };
    let connection = open_database(&app)?;
    connection
        .execute(
            &format!(
                "UPDATE unified_index SET {column} = {column} + 1, last_used_at = ?2, updated_at = ?2 WHERE id = ?1"
            ),
            params![id, now_seconds()],
        )
        .map_err(|error| format!("record unified index action: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn search_unified_index(
    app: tauri::AppHandle,
    query: String,
    scope: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<UnifiedIndexEntry>, String> {
    let normalized = normalize_index_text(&query);
    if normalized.is_empty() {
        return Ok(Vec::new());
    }
    let limit = limit.unwrap_or(20).clamp(1, 100);
    let connection = open_database(&app)?;
    let prefix = format!("{normalized}%");

    if normalized.chars().count() >= 3 {
        let match_query = build_fts_match_query(&normalized);
        let mut statement = connection
            .prepare(
                "SELECT ui.id, ui.kind, ui.scope, ui.value, ui.subtitle,
                        ui.metadata_json, ui.use_count, ui.selected_count,
                        ui.ignored_count, ui.last_used_at
                 FROM unified_index_fts
                 JOIN unified_index ui ON ui.rowid = unified_index_fts.rowid
                 WHERE unified_index_fts MATCH ?1
                   AND (?2 IS NULL OR ui.scope = ?2)
                 ORDER BY
                   CASE WHEN ui.normalized_value = ?3 THEN 0
                        WHEN ui.normalized_value LIKE ?4 THEN 1
                        ELSE 2 END,
                   bm25(unified_index_fts) ASC,
                   (ui.selected_count * 20 + ui.use_count * 4 - ui.ignored_count * 8) DESC,
                   ui.last_used_at DESC, ui.value COLLATE NOCASE
                 LIMIT ?5",
            )
            .map_err(|error| format!("search unified index: {error}"))?;
        let rows = statement
            .query_map(
                params![match_query, scope, normalized, prefix, limit],
                |row| {
                    let metadata_text: String = row.get(5)?;
                    Ok(UnifiedIndexEntry {
                        id: row.get(0)?,
                        kind: row.get(1)?,
                        scope: row.get(2)?,
                        value: row.get(3)?,
                        subtitle: row.get(4)?,
                        metadata: serde_json::from_str(&metadata_text)
                            .unwrap_or(serde_json::Value::Null),
                        use_count: row.get(6)?,
                        selected_count: row.get(7)?,
                        ignored_count: row.get(8)?,
                        last_used_at: row.get(9)?,
                    })
                },
            )
            .map_err(|error| format!("search unified index rows: {error}"))?;
        return rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("read unified index rows: {error}"));
    }

    let pattern = format!("%{normalized}%");
    let mut statement = connection
        .prepare(
            "SELECT id, kind, scope, value, subtitle, metadata_json,
                    use_count, selected_count, ignored_count, last_used_at
             FROM unified_index
             WHERE normalized_value LIKE ?1
               AND (?2 IS NULL OR scope = ?2)
             ORDER BY
               CASE WHEN normalized_value = ?3 THEN 0
                    WHEN normalized_value LIKE ?4 THEN 1
                    ELSE 2 END,
               (selected_count * 20 + use_count * 4 - ignored_count * 8) DESC,
               last_used_at DESC, value COLLATE NOCASE
             LIMIT ?5",
        )
        .map_err(|error| format!("search unified index: {error}"))?;
    let rows = statement
        .query_map(params![pattern, scope, normalized, prefix, limit], |row| {
            let metadata_text: String = row.get(5)?;
            Ok(UnifiedIndexEntry {
                id: row.get(0)?,
                kind: row.get(1)?,
                scope: row.get(2)?,
                value: row.get(3)?,
                subtitle: row.get(4)?,
                metadata: serde_json::from_str(&metadata_text).unwrap_or(serde_json::Value::Null),
                use_count: row.get(6)?,
                selected_count: row.get(7)?,
                ignored_count: row.get(8)?,
                last_used_at: row.get(9)?,
            })
        })
        .map_err(|error| format!("search unified index rows: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("read unified index rows: {error}"))
}

#[tauri::command]
fn path_is_in_scope(path: &str, scopes: &[String]) -> bool {
    let path = Path::new(path);
    scopes
        .iter()
        .map(Path::new)
        .any(|scope| path.starts_with(scope))
}

#[tauri::command]
pub fn save_vault_media_records(
    app: tauri::AppHandle,
    records: Vec<MediaRecordInput>,
    scopes: Vec<String>,
) -> Result<usize, String> {
    if records.len() > 20_000
        || scopes.len() > 100
        || scopes.iter().any(|scope| scope.len() > 4_096)
    {
        return Err("Vault scan contains too many records or invalid scopes".to_string());
    }
    let connection = open_database(&app)?;
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| format!("vault records transaction: {error}"))?;
    let scanned_at = now_seconds();
    for record in &records {
        if record.path.is_empty()
            || record.path.len() > 4_096
            || record.name.len() > 1_024
            || record.title.len() > 512
            || record
                .quality
                .as_ref()
                .is_some_and(|value| value.len() > 64)
            || record.codec.as_ref().is_some_and(|value| value.len() > 64)
        {
            return Err("Vault media record contains an oversized or invalid field".to_string());
        }
        let identity = serde_json::json!({
            "title": record.title,
            "season": record.season,
            "episode": record.episode,
            "quality": record.quality,
            "codec": record.codec,
            "subtitleLikely": record.subtitle_likely,
        });
        let metadata = serde_json::json!({
            "name": record.name,
            "size": record.size,
        });
        transaction
            .execute(
                "INSERT INTO media_records (path, identity_json, metadata_json, scanned_at)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(path) DO UPDATE SET
                    identity_json = excluded.identity_json,
                    metadata_json = excluded.metadata_json,
                    scanned_at = excluded.scanned_at",
                params![
                    record.path,
                    identity.to_string(),
                    metadata.to_string(),
                    scanned_at
                ],
            )
            .map_err(|error| format!("save vault media record: {error}"))?;
    }
    if !scopes.is_empty() {
        let current_paths: HashSet<&str> =
            records.iter().map(|record| record.path.as_str()).collect();
        let stored_paths = {
            let mut statement = transaction
                .prepare("SELECT path FROM media_records")
                .map_err(|error| format!("list vault media records for pruning: {error}"))?;
            let paths = statement
                .query_map([], |row| row.get::<_, String>(0))
                .map_err(|error| format!("list vault media records query: {error}"))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| format!("list vault media records rows: {error}"))?;
            paths
        };
        for path in stored_paths {
            if path_is_in_scope(&path, &scopes) && !current_paths.contains(path.as_str()) {
                transaction
                    .execute("DELETE FROM media_records WHERE path = ?1", params![path])
                    .map_err(|error| format!("prune stale vault media record: {error}"))?;
            }
        }
    }
    transaction
        .commit()
        .map_err(|error| format!("save vault records commit: {error}"))?;
    Ok(records.len())
}

#[tauri::command]
pub fn get_vault_media_records(
    app: tauri::AppHandle,
    limit: Option<u32>,
) -> Result<Vec<MediaRecord>, String> {
    let connection = open_database(&app)?;
    let limit = limit.unwrap_or(20_000).clamp(1, 20_000);
    let mut statement = connection
        .prepare(
            "SELECT path, identity_json, metadata_json, scanned_at
             FROM media_records ORDER BY path LIMIT ?1",
        )
        .map_err(|error| format!("read vault media records: {error}"))?;
    let rows = statement
        .query_map(params![limit], |row| {
            let identity_json: String = row.get(1)?;
            let metadata_json: String = row.get(2)?;
            Ok(MediaRecord {
                path: row.get(0)?,
                identity: serde_json::from_str(&identity_json).unwrap_or(serde_json::Value::Null),
                metadata: serde_json::from_str(&metadata_json).unwrap_or(serde_json::Value::Null),
                scanned_at: row.get(3)?,
            })
        })
        .map_err(|error| format!("read vault media records query: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("read vault media records rows: {error}"))
}

// ===== Collection tracker types =====

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionItemRow {
    pub id: String,
    pub title: String,
    pub alt_titles: serde_json::Value,
    pub r#type: String,
    pub status: String,
    pub progress_value: i64,
    pub progress_total: Option<i64>,
    pub progress_unit: String,
    pub duration_minutes: Option<i64>,
    pub rating: Option<i64>,
    pub priority: String,
    pub is_favorite: bool,
    pub year: Option<i64>,
    pub genres: serde_json::Value,
    pub studio: Option<String>,
    pub description: Option<String>,
    pub notes: Option<String>,
    pub cover_url: Option<String>,
    pub cover_blob_id: Option<String>,
    pub thumb_blob_id: Option<String>,
    pub external_ids: serde_json::Value,
    pub custom_fields: serde_json::Value,
    pub local_path: Option<String>,
    pub local_kind: Option<String>,
    pub started_at: Option<i64>,
    pub finished_at: Option<i64>,
    pub last_watched_at: Option<i64>,
    pub rewatch_count: i64,
    pub added_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionItemInput {
    pub id: String,
    pub title: String,
    pub alt_titles: serde_json::Value,
    pub r#type: String,
    pub status: String,
    pub progress_value: i64,
    pub progress_total: Option<i64>,
    pub progress_unit: String,
    pub duration_minutes: Option<i64>,
    pub rating: Option<i64>,
    pub priority: String,
    pub is_favorite: bool,
    pub year: Option<i64>,
    pub genres: serde_json::Value,
    pub studio: Option<String>,
    pub description: Option<String>,
    pub notes: Option<String>,
    pub cover_url: Option<String>,
    pub cover_blob_id: Option<String>,
    pub thumb_blob_id: Option<String>,
    pub external_ids: serde_json::Value,
    pub custom_fields: serde_json::Value,
    pub local_path: Option<String>,
    pub local_kind: Option<String>,
    pub started_at: Option<i64>,
    pub finished_at: Option<i64>,
    pub last_watched_at: Option<i64>,
    pub rewatch_count: i64,
    pub added_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionReviewRow {
    pub id: String,
    pub item_id: Option<String>,
    pub rating: i64,
    pub comment: String,
    pub image_blob_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub orphaned: bool,
    pub snapshot_title: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionReviewInput {
    pub id: String,
    pub item_id: Option<String>,
    pub rating: i64,
    pub comment: String,
    pub image_blob_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub orphaned: bool,
    pub snapshot_title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionEventRow {
    pub id: String,
    pub item_id: Option<String>,
    pub kind: String,
    pub from_value: Option<String>,
    pub to_value: Option<String>,
    pub at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionEventInput {
    pub id: String,
    pub item_id: Option<String>,
    pub kind: String,
    pub from_value: Option<String>,
    pub to_value: Option<String>,
    pub at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomFieldDefRow {
    pub id: String,
    pub name: String,
    pub field_type: String,
    pub options: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionStatusRow {
    pub id: String,
    pub label: String,
    pub color: String,
    pub order_index: i64,
    pub is_core: bool,
}

fn validate_collection_color(value: &str) -> Result<(), String> {
    let bytes = value.as_bytes();
    if bytes.len() != 7 || bytes[0] != b'#' || !bytes[1..].iter().all(u8::is_ascii_hexdigit) {
        return Err("Collection status color must be in #rrggbb format".into());
    }
    Ok(())
}

const CORE_COLLECTION_STATUS_IDS: [&str; 6] = [
    "planned",
    "watching",
    "completed",
    "paused",
    "dropped",
    "rewatching",
];

#[tauri::command]
pub fn list_collection_statuses(app: tauri::AppHandle) -> Result<Vec<CollectionStatusRow>, String> {
    let connection = open_database(&app)?;
    let mut statement = connection
        .prepare(
            "SELECT id, label, color, order_index, is_core
             FROM collection_statuses ORDER BY order_index, label",
        )
        .map_err(|e| format!("list collection statuses: {e}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok(CollectionStatusRow {
                id: row.get(0)?,
                label: row.get(1)?,
                color: row.get(2)?,
                order_index: row.get(3)?,
                is_core: row.get::<_, i64>(4)? != 0,
            })
        })
        .map_err(|e| format!("list collection statuses query: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("read collection statuses: {e}"))
}

#[tauri::command]
pub fn upsert_collection_status(
    app: tauri::AppHandle,
    status: CollectionStatusRow,
) -> Result<(), String> {
    validate_collection_text(&status.id, 64, "status id")?;
    validate_collection_text(&status.label, 64, "status label")?;
    validate_collection_color(&status.color)?;
    if status
        .id
        .chars()
        .any(|c| !c.is_ascii_alphanumeric() && c != '_' && c != '-')
    {
        return Err("Collection status id must be alphanumeric, '_' or '-'".into());
    }
    let is_core = CORE_COLLECTION_STATUS_IDS.contains(&status.id.as_str());
    let connection = open_database(&app)?;
    connection
        .execute(
            "INSERT INTO collection_statuses (id, label, color, order_index, is_core)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET
                label = excluded.label, color = excluded.color,
                order_index = excluded.order_index",
            params![
                status.id,
                status.label,
                status.color,
                status.order_index,
                is_core as i64
            ],
        )
        .map_err(|e| format!("upsert collection status: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn delete_collection_status(app: tauri::AppHandle, id: String) -> Result<(), String> {
    if CORE_COLLECTION_STATUS_IDS.contains(&id.as_str()) {
        return Err("Core statuses cannot be deleted".into());
    }
    let connection = open_database(&app)?;
    // Reassign items to the core "planned" status before dropping the row.
    connection
        .execute(
            "UPDATE collection_items SET status = 'planned' WHERE status = ?1",
            params![id],
        )
        .map_err(|e| format!("reassign collection items on status delete: {e}"))?;
    connection
        .execute(
            "DELETE FROM collection_statuses WHERE id = ?1 AND is_core = 0",
            params![id],
        )
        .map_err(|e| format!("delete collection status: {e}"))?;
    Ok(())
}

fn validate_collection_text(value: &str, max: usize, field: &str) -> Result<(), String> {
    if value.is_empty() || value.chars().count() > max {
        return Err(format!(
            "Collection {field} is empty or exceeds {max} characters"
        ));
    }
    Ok(())
}

#[tauri::command]
pub fn list_collection_items(app: tauri::AppHandle) -> Result<Vec<CollectionItemRow>, String> {
    let connection = open_database(&app)?;
    let mut statement = connection
        .prepare(
            "SELECT id, title, alt_titles_json, type, status, progress_value, progress_total,
                    progress_unit, duration_minutes, rating, priority, is_favorite, year,
                    genres_json, studio, description, notes, cover_url, cover_blob_id,
                    thumb_blob_id, external_ids_json, custom_fields_json, local_path,
                    local_kind, started_at, finished_at, last_watched_at, rewatch_count,
                    added_at, updated_at
             FROM collection_items ORDER BY updated_at DESC",
        )
        .map_err(|e| format!("list collection items: {e}"))?;
    let rows = statement
        .query_map([], |row| {
            let alt_titles: String = row.get(2)?;
            let genres: String = row.get(13)?;
            let external_ids: String = row.get(20)?;
            let custom_fields: String = row.get(21)?;
            Ok(CollectionItemRow {
                id: row.get(0)?,
                title: row.get(1)?,
                alt_titles: serde_json::from_str(&alt_titles)
                    .unwrap_or(serde_json::Value::Array(vec![])),
                r#type: row.get(3)?,
                status: row.get(4)?,
                progress_value: row.get(5)?,
                progress_total: row.get(6)?,
                progress_unit: row.get(7)?,
                duration_minutes: row.get(8)?,
                rating: row.get(9)?,
                priority: row.get(10)?,
                is_favorite: row.get::<_, i64>(11)? != 0,
                year: row.get(12)?,
                genres: serde_json::from_str(&genres).unwrap_or(serde_json::Value::Array(vec![])),
                studio: row.get(14)?,
                description: row.get(15)?,
                notes: row.get(16)?,
                cover_url: row.get(17)?,
                cover_blob_id: row.get(18)?,
                thumb_blob_id: row.get(19)?,
                external_ids: serde_json::from_str(&external_ids)
                    .unwrap_or(serde_json::Value::Object(Default::default())),
                custom_fields: serde_json::from_str(&custom_fields)
                    .unwrap_or(serde_json::Value::Object(Default::default())),
                local_path: row.get(22)?,
                local_kind: row.get(23)?,
                started_at: row.get(24)?,
                finished_at: row.get(25)?,
                last_watched_at: row.get(26)?,
                rewatch_count: row.get(27)?,
                added_at: row.get(28)?,
                updated_at: row.get(29)?,
            })
        })
        .map_err(|e| format!("list collection items query: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("read collection items: {e}"))
}

#[tauri::command]
pub fn upsert_collection_item(
    app: tauri::AppHandle,
    item: CollectionItemInput,
) -> Result<(), String> {
    validate_collection_text(&item.id, 128, "id")?;
    validate_collection_text(&item.title, 512, "title")?;
    let alt_titles = serde_json::to_string(&item.alt_titles)
        .map_err(|e| format!("serialize alt_titles: {e}"))?;
    let genres =
        serde_json::to_string(&item.genres).map_err(|e| format!("serialize genres: {e}"))?;
    let external_ids = serde_json::to_string(&item.external_ids)
        .map_err(|e| format!("serialize external_ids: {e}"))?;
    let custom_fields = serde_json::to_string(&item.custom_fields)
        .map_err(|e| format!("serialize custom_fields: {e}"))?;
    let connection = open_database(&app)?;
    connection
        .execute(
            "INSERT INTO collection_items (
                id, title, alt_titles_json, type, status, progress_value, progress_total,
                progress_unit, duration_minutes, rating, priority, is_favorite, year,
                genres_json, studio, description, notes, cover_url, cover_blob_id,
                thumb_blob_id, external_ids_json, custom_fields_json, local_path, local_kind,
                started_at, finished_at, last_watched_at, rewatch_count, added_at, updated_at
             ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17,
                ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30
             )
             ON CONFLICT(id) DO UPDATE SET
                title = excluded.title, alt_titles_json = excluded.alt_titles_json,
                type = excluded.type, status = excluded.status,
                progress_value = excluded.progress_value, progress_total = excluded.progress_total,
                progress_unit = excluded.progress_unit, duration_minutes = excluded.duration_minutes,
                rating = excluded.rating, priority = excluded.priority,
                is_favorite = excluded.is_favorite, year = excluded.year,
                genres_json = excluded.genres_json, studio = excluded.studio,
                description = excluded.description, notes = excluded.notes,
                cover_url = excluded.cover_url, cover_blob_id = excluded.cover_blob_id,
                thumb_blob_id = excluded.thumb_blob_id, external_ids_json = excluded.external_ids_json,
                custom_fields_json = excluded.custom_fields_json, local_path = excluded.local_path,
                local_kind = excluded.local_kind, started_at = excluded.started_at,
                finished_at = excluded.finished_at, last_watched_at = excluded.last_watched_at,
                rewatch_count = excluded.rewatch_count, updated_at = excluded.updated_at",
            params![
                item.id, item.title, alt_titles, item.r#type, item.status, item.progress_value,
                item.progress_total, item.progress_unit, item.duration_minutes, item.rating,
                item.priority, item.is_favorite as i64, item.year, genres, item.studio,
                item.description, item.notes, item.cover_url, item.cover_blob_id,
                item.thumb_blob_id, external_ids, custom_fields, item.local_path,
                item.local_kind, item.started_at, item.finished_at, item.last_watched_at,
                item.rewatch_count, item.added_at, item.updated_at
            ],
        )
        .map_err(|e| format!("upsert collection item: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn delete_collection_item(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let connection = open_database(&app)?;
    // Orphan reviews: ON DELETE SET NULL on FK + flag orphaned + snapshot title.
    let title: Option<String> = connection
        .query_row(
            "SELECT title FROM collection_items WHERE id = ?1",
            params![&id],
            |row| row.get(0),
        )
        .ok();
    let tx = connection
        .unchecked_transaction()
        .map_err(|e| format!("delete item transaction: {e}"))?;
    tx.execute(
        "UPDATE collection_reviews SET orphaned = 1, snapshot_title = COALESCE(snapshot_title, ?2)
         WHERE item_id = ?1",
        params![&id, title],
    )
    .map_err(|e| format!("orphan reviews: {e}"))?;
    tx.execute("DELETE FROM collection_items WHERE id = ?1", params![&id])
        .map_err(|e| format!("delete collection item: {e}"))?;
    tx.commit()
        .map_err(|e| format!("delete item commit: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn upsert_collection_review(
    app: tauri::AppHandle,
    review: CollectionReviewInput,
) -> Result<(), String> {
    validate_collection_text(&review.id, 128, "id")?;
    validate_collection_text(&review.comment, 8_000, "comment")?;
    if !(1..=10).contains(&review.rating) {
        return Err("Review rating must be between 1 and 10".into());
    }
    let connection = open_database(&app)?;
    connection
        .execute(
            "INSERT INTO collection_reviews
                (id, item_id, rating, comment, image_blob_id, created_at, updated_at, orphaned, snapshot_title)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
                item_id = excluded.item_id, rating = excluded.rating, comment = excluded.comment,
                image_blob_id = excluded.image_blob_id, updated_at = excluded.updated_at,
                orphaned = excluded.orphaned, snapshot_title = excluded.snapshot_title",
            params![
                review.id, review.item_id, review.rating, review.comment,
                review.image_blob_id, review.created_at, review.updated_at,
                review.orphaned as i64, review.snapshot_title
            ],
        )
        .map_err(|e| format!("upsert review: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn list_collection_reviews(app: tauri::AppHandle) -> Result<Vec<CollectionReviewRow>, String> {
    let connection = open_database(&app)?;
    let mut statement = connection
        .prepare(
            "SELECT id, item_id, rating, comment, image_blob_id, created_at, updated_at, orphaned, snapshot_title
             FROM collection_reviews ORDER BY created_at DESC",
        )
        .map_err(|e| format!("list reviews: {e}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok(CollectionReviewRow {
                id: row.get(0)?,
                item_id: row.get(1)?,
                rating: row.get(2)?,
                comment: row.get(3)?,
                image_blob_id: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                orphaned: row.get::<_, i64>(7)? != 0,
                snapshot_title: row.get(8)?,
            })
        })
        .map_err(|e| format!("list reviews query: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("read reviews: {e}"))
}

#[tauri::command]
pub fn delete_collection_review(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let connection = open_database(&app)?;
    connection
        .execute("DELETE FROM collection_reviews WHERE id = ?1", params![id])
        .map_err(|e| format!("delete review: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn append_collection_event(
    app: tauri::AppHandle,
    event: CollectionEventInput,
) -> Result<(), String> {
    validate_collection_text(&event.id, 128, "id")?;
    validate_collection_text(&event.kind, 64, "kind")?;
    let connection = open_database(&app)?;
    connection
        .execute(
            "INSERT INTO collection_events (id, item_id, kind, from_value, to_value, at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                event.id,
                event.item_id,
                event.kind,
                event.from_value,
                event.to_value,
                event.at
            ],
        )
        .map_err(|e| format!("append event: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn list_collection_events(
    app: tauri::AppHandle,
    limit: Option<u32>,
) -> Result<Vec<CollectionEventRow>, String> {
    let limit = limit.unwrap_or(500).clamp(1, 5_000);
    let connection = open_database(&app)?;
    let mut statement = connection
        .prepare(
            "SELECT id, item_id, kind, from_value, to_value, at
             FROM collection_events ORDER BY at DESC LIMIT ?1",
        )
        .map_err(|e| format!("list events: {e}"))?;
    let rows = statement
        .query_map(params![limit], |row| {
            Ok(CollectionEventRow {
                id: row.get(0)?,
                item_id: row.get(1)?,
                kind: row.get(2)?,
                from_value: row.get(3)?,
                to_value: row.get(4)?,
                at: row.get(5)?,
            })
        })
        .map_err(|e| format!("list events query: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("read events: {e}"))
}

#[tauri::command]
pub fn list_custom_field_defs(app: tauri::AppHandle) -> Result<Vec<CustomFieldDefRow>, String> {
    let connection = open_database(&app)?;
    let mut statement = connection
        .prepare("SELECT id, name, field_type, options_json FROM custom_field_defs")
        .map_err(|e| format!("list field defs: {e}"))?;
    let rows = statement
        .query_map([], |row| {
            let options_text: Option<String> = row.get(3)?;
            Ok(CustomFieldDefRow {
                id: row.get(0)?,
                name: row.get(1)?,
                field_type: row.get(2)?,
                options: options_text
                    .as_deref()
                    .and_then(|t| serde_json::from_str(t).ok()),
            })
        })
        .map_err(|e| format!("list field defs query: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("read field defs: {e}"))
}

#[tauri::command]
pub fn upsert_custom_field_def(
    app: tauri::AppHandle,
    def: CustomFieldDefRow,
) -> Result<(), String> {
    validate_collection_text(&def.id, 128, "id")?;
    validate_collection_text(&def.name, 128, "name")?;
    if !matches!(
        def.field_type.as_str(),
        "text" | "number" | "select" | "date"
    ) {
        return Err("Custom field type must be text, number, select, or date".into());
    }
    let options_text = match &def.options {
        Some(v) => {
            Some(serde_json::to_string(v).map_err(|e| format!("serialize field options: {e}"))?)
        }
        None => None,
    };
    let connection = open_database(&app)?;
    connection
        .execute(
            "INSERT INTO custom_field_defs (id, name, field_type, options_json)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name, field_type = excluded.field_type,
                options_json = excluded.options_json",
            params![def.id, def.name, def.field_type, options_text],
        )
        .map_err(|e| format!("upsert field def: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn delete_custom_field_def(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let connection = open_database(&app)?;
    connection
        .execute("DELETE FROM custom_field_defs WHERE id = ?1", params![id])
        .map_err(|e| format!("delete field def: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn search_collection_items(
    app: tauri::AppHandle,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<CollectionItemRow>, String> {
    let normalized = normalize_index_text(&query);
    let limit = limit.unwrap_or(50).clamp(1, 500) as i64;
    let connection = open_database(&app)?;
    if normalized.chars().count() >= 3 {
        let match_query = build_fts_match_query(&normalized);
        let mut statement = connection
            .prepare(
                "SELECT ci.id, ci.title, ci.alt_titles_json, ci.type, ci.status, ci.progress_value,
                        ci.progress_total, ci.progress_unit, ci.duration_minutes, ci.rating,
                        ci.priority, ci.is_favorite, ci.year, ci.genres_json, ci.studio,
                        ci.description, ci.notes, ci.cover_url, ci.cover_blob_id, ci.thumb_blob_id,
                        ci.external_ids_json, ci.custom_fields_json, ci.local_path, ci.local_kind,
                        ci.started_at, ci.finished_at, ci.last_watched_at, ci.rewatch_count,
                        ci.added_at, ci.updated_at
                 FROM collection_items_fts
                 JOIN collection_items ci ON ci.rowid = collection_items_fts.rowid
                 WHERE collection_items_fts MATCH ?1
                 ORDER BY bm25(collection_items_fts) ASC, ci.updated_at DESC
                 LIMIT ?2",
            )
            .map_err(|e| format!("search collection items: {e}"))?;
        let rows = statement
            .query_map(params![match_query, limit], |row| {
                let alt_titles: String = row.get(2)?;
                let genres: String = row.get(13)?;
                let external_ids: String = row.get(20)?;
                let custom_fields: String = row.get(21)?;
                Ok(CollectionItemRow {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    alt_titles: serde_json::from_str(&alt_titles)
                        .unwrap_or(serde_json::Value::Array(vec![])),
                    r#type: row.get(3)?,
                    status: row.get(4)?,
                    progress_value: row.get(5)?,
                    progress_total: row.get(6)?,
                    progress_unit: row.get(7)?,
                    duration_minutes: row.get(8)?,
                    rating: row.get(9)?,
                    priority: row.get(10)?,
                    is_favorite: row.get::<_, i64>(11)? != 0,
                    year: row.get(12)?,
                    genres: serde_json::from_str(&genres)
                        .unwrap_or(serde_json::Value::Array(vec![])),
                    studio: row.get(14)?,
                    description: row.get(15)?,
                    notes: row.get(16)?,
                    cover_url: row.get(17)?,
                    cover_blob_id: row.get(18)?,
                    thumb_blob_id: row.get(19)?,
                    external_ids: serde_json::from_str(&external_ids)
                        .unwrap_or(serde_json::Value::Object(Default::default())),
                    custom_fields: serde_json::from_str(&custom_fields)
                        .unwrap_or(serde_json::Value::Object(Default::default())),
                    local_path: row.get(22)?,
                    local_kind: row.get(23)?,
                    started_at: row.get(24)?,
                    finished_at: row.get(25)?,
                    last_watched_at: row.get(26)?,
                    rewatch_count: row.get(27)?,
                    added_at: row.get(28)?,
                    updated_at: row.get(29)?,
                })
            })
            .map_err(|e| format!("search collection items query: {e}"))?;
        return rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("read search collection items: {e}"));
    }
    let pattern = format!("%{normalized}%");
    let mut statement = connection
        .prepare(
            "SELECT id, title, alt_titles_json, type, status, progress_value, progress_total,
                    progress_unit, duration_minutes, rating, priority, is_favorite, year,
                    genres_json, studio, description, notes, cover_url, cover_blob_id,
                    thumb_blob_id, external_ids_json, custom_fields_json, local_path,
                    local_kind, started_at, finished_at, last_watched_at, rewatch_count,
                    added_at, updated_at
             FROM collection_items
             WHERE title LIKE ?1 COLLATE NOCASE OR alt_titles_json LIKE ?1 COLLATE NOCASE
             ORDER BY updated_at DESC LIMIT ?2",
        )
        .map_err(|e| format!("search collection items like fallback: {e}"))?;
    let rows = statement
        .query_map(params![pattern, limit], |row| {
            let alt_titles: String = row.get(2)?;
            let genres: String = row.get(13)?;
            let external_ids: String = row.get(20)?;
            let custom_fields: String = row.get(21)?;
            Ok(CollectionItemRow {
                id: row.get(0)?,
                title: row.get(1)?,
                alt_titles: serde_json::from_str(&alt_titles)
                    .unwrap_or(serde_json::Value::Array(vec![])),
                r#type: row.get(3)?,
                status: row.get(4)?,
                progress_value: row.get(5)?,
                progress_total: row.get(6)?,
                progress_unit: row.get(7)?,
                duration_minutes: row.get(8)?,
                rating: row.get(9)?,
                priority: row.get(10)?,
                is_favorite: row.get::<_, i64>(11)? != 0,
                year: row.get(12)?,
                genres: serde_json::from_str(&genres).unwrap_or(serde_json::Value::Array(vec![])),
                studio: row.get(14)?,
                description: row.get(15)?,
                notes: row.get(16)?,
                cover_url: row.get(17)?,
                cover_blob_id: row.get(18)?,
                thumb_blob_id: row.get(19)?,
                external_ids: serde_json::from_str(&external_ids)
                    .unwrap_or(serde_json::Value::Object(Default::default())),
                custom_fields: serde_json::from_str(&custom_fields)
                    .unwrap_or(serde_json::Value::Object(Default::default())),
                local_path: row.get(22)?,
                local_kind: row.get(23)?,
                started_at: row.get(24)?,
                finished_at: row.get(25)?,
                last_watched_at: row.get(26)?,
                rewatch_count: row.get(27)?,
                added_at: row.get(28)?,
                updated_at: row.get(29)?,
            })
        })
        .map_err(|e| format!("search collection items like query: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("read search collection items like: {e}"))
}

// ===== Export / Import =====

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionExport {
    pub version: u32,
    pub exported_at: i64,
    pub items: Vec<CollectionItemRow>,
    pub reviews: Vec<CollectionReviewRow>,
    pub events: Vec<CollectionEventRow>,
    pub custom_field_defs: Vec<CustomFieldDefRow>,
}

#[tauri::command]
pub fn export_collection_data(app: tauri::AppHandle) -> Result<CollectionExport, String> {
    let connection = open_database(&app)?;
    // Items
    let items = list_collection_items(app.clone())?;
    // Reviews
    let reviews = list_collection_reviews(app.clone())?;
    // Events
    let mut stmt = connection
        .prepare(
            "SELECT id, item_id, kind, from_value, to_value, at FROM collection_events ORDER BY at",
        )
        .map_err(|e| format!("export events: {e}"))?;
    let events: Vec<CollectionEventRow> = stmt
        .query_map([], |row| {
            Ok(CollectionEventRow {
                id: row.get(0)?,
                item_id: row.get(1)?,
                kind: row.get(2)?,
                from_value: row.get(3)?,
                to_value: row.get(4)?,
                at: row.get(5)?,
            })
        })
        .map_err(|e| format!("export events query: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("export events rows: {e}"))?;
    // Field defs
    let custom_field_defs = list_custom_field_defs(app)?;
    Ok(CollectionExport {
        version: 1,
        exported_at: now_seconds(),
        items,
        reviews,
        events,
        custom_field_defs,
    })
}

#[tauri::command]
pub fn import_collection_data(
    app: tauri::AppHandle,
    data: CollectionExport,
    strategy: String,
) -> Result<ImportSummary, String> {
    let strategy = match strategy.as_str() {
        "skip" => ImportStrategy::Skip,
        "overwrite" => ImportStrategy::Overwrite,
        _ => ImportStrategy::CreateNew,
    };
    let connection = open_database(&app)?;
    let mut summary = ImportSummary {
        imported: 0,
        skipped: 0,
        overwritten: 0,
        created: 0,
    };
    for item in &data.items {
        // Duplicate detection: by external_ids (anilist/tmdb) or title+year.
        let external_ids = serde_json::from_str::<serde_json::Value>(
            &serde_json::to_string(&item.external_ids)
                .unwrap_or_default()
                .to_string(),
        )
        .unwrap_or_default();
        let existing: Option<String> = {
            let anilist = external_ids.get("anilist").and_then(|v| v.as_i64());
            let tmdb = external_ids.get("tmdb").and_then(|v| v.as_i64());
            let mut query = String::from("SELECT id FROM collection_items WHERE ");
            let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = vec![];
            if let Some(al) = anilist {
                query.push_str("json_extract(external_ids_json, '$.anilist') = ?1");
                params_vec.push(Box::new(al));
            } else if let Some(tb) = tmdb {
                query.push_str("json_extract(external_ids_json, '$.tmdb') = ?1");
                params_vec.push(Box::new(tb));
            } else {
                query.push_str("title = ?1 AND year IS ?2");
                params_vec.push(Box::new(item.title.clone()));
                params_vec.push(Box::new(item.year));
            }
            let params_refs: Vec<&dyn rusqlite::ToSql> =
                params_vec.iter().map(|p| p.as_ref()).collect();
            connection
                .query_row(&query, params_refs.as_slice(), |row| {
                    row.get::<_, String>(0)
                })
                .ok()
        };
        match (existing, &strategy) {
            (Some(_), ImportStrategy::Skip) => {
                summary.skipped += 1;
            }
            (Some(_), ImportStrategy::Overwrite) => {
                upsert_collection_item(
                    app.clone(),
                    CollectionItemInput {
                        id: item.id.clone(),
                        title: item.title.clone(),
                        alt_titles: item.alt_titles.clone(),
                        r#type: item.r#type.clone(),
                        status: item.status.clone(),
                        progress_value: item.progress_value,
                        progress_total: item.progress_total,
                        progress_unit: item.progress_unit.clone(),
                        duration_minutes: item.duration_minutes,
                        rating: item.rating,
                        priority: item.priority.clone(),
                        is_favorite: item.is_favorite,
                        year: item.year,
                        genres: item.genres.clone(),
                        studio: item.studio.clone(),
                        description: item.description.clone(),
                        notes: item.notes.clone(),
                        cover_url: item.cover_url.clone(),
                        cover_blob_id: item.cover_blob_id.clone(),
                        thumb_blob_id: item.thumb_blob_id.clone(),
                        external_ids: item.external_ids.clone(),
                        custom_fields: item.custom_fields.clone(),
                        local_path: item.local_path.clone(),
                        local_kind: item.local_kind.clone(),
                        started_at: item.started_at,
                        finished_at: item.finished_at,
                        last_watched_at: item.last_watched_at,
                        rewatch_count: item.rewatch_count,
                        added_at: item.added_at,
                        updated_at: item.updated_at,
                    },
                )?;
                summary.overwritten += 1;
                summary.imported += 1;
            }
            (Some(_), ImportStrategy::CreateNew) | (None, _) => {
                let new_id = format!("imp_{}_{}", item.id, now_seconds());
                upsert_collection_item(
                    app.clone(),
                    CollectionItemInput {
                        id: new_id.clone(),
                        title: item.title.clone(),
                        alt_titles: item.alt_titles.clone(),
                        r#type: item.r#type.clone(),
                        status: item.status.clone(),
                        progress_value: item.progress_value,
                        progress_total: item.progress_total,
                        progress_unit: item.progress_unit.clone(),
                        duration_minutes: item.duration_minutes,
                        rating: item.rating,
                        priority: item.priority.clone(),
                        is_favorite: item.is_favorite,
                        year: item.year,
                        genres: item.genres.clone(),
                        studio: item.studio.clone(),
                        description: item.description.clone(),
                        notes: item.notes.clone(),
                        cover_url: item.cover_url.clone(),
                        cover_blob_id: item.cover_blob_id.clone(),
                        thumb_blob_id: item.thumb_blob_id.clone(),
                        external_ids: item.external_ids.clone(),
                        custom_fields: item.custom_fields.clone(),
                        local_path: item.local_path.clone(),
                        local_kind: item.local_kind.clone(),
                        started_at: item.started_at,
                        finished_at: item.finished_at,
                        last_watched_at: item.last_watched_at,
                        rewatch_count: item.rewatch_count,
                        added_at: item.added_at,
                        updated_at: item.updated_at,
                    },
                )?;
                summary.created += 1;
                summary.imported += 1;
            }
        }
    }
    for def in &data.custom_field_defs {
        upsert_custom_field_def(app.clone(), def.clone())?;
    }
    Ok(summary)
}

#[derive(Clone)]
enum ImportStrategy {
    Skip,
    Overwrite,
    CreateNew,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub imported: usize,
    pub skipped: usize,
    pub overwritten: usize,
    pub created: usize,
}

// ===== ZIP export with embedded covers =====

#[tauri::command]
pub async fn export_collection_zip(app: tauri::AppHandle, out_path: String) -> Result<(), String> {
    let data = export_collection_data(app.clone())?;
    // Resolve cover bytes per item: download remote or read cached blob.
    let assets_db = crate::user_assets::database_path(&app)?;
    let assets_conn = Connection::open(&assets_db).map_err(|e| format!("open assets db: {e}"))?;
    let mut zip = zip::ZipWriter::new(
        std::fs::File::create(&out_path).map_err(|e| format!("create zip file: {e}"))?,
    );
    let opts = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    // media.json
    let json = serde_json::to_string_pretty(&data).map_err(|e| format!("serialize export: {e}"))?;
    zip.start_file("media.json", opts)
        .map_err(|e| format!("zip media.json: {e}"))?;
    zip.write_all(json.as_bytes())
        .map_err(|e| format!("write media.json: {e}"))?;
    // images/
    let mut written = std::collections::HashSet::new();
    for item in &data.items {
        let Some(cover_url) = &item.cover_url else {
            continue;
        };
        if written.contains(cover_url) {
            continue;
        }
        written.insert(cover_url.clone());
        let ext = if cover_url.contains(".png") {
            "png"
        } else if cover_url.contains(".webp") {
            "webp"
        } else if cover_url.contains(".gif") {
            "gif"
        } else {
            "jpg"
        };
        let name = format!("images/{}.{}", item.id, ext);
        // Try cached blob by cover_blob_id; else download remote.
        let bytes_opt: Option<Vec<u8>> = if let Some(blob_id) = &item.cover_blob_id {
            assets_conn
                .query_row(
                    "SELECT data FROM user_images WHERE id = ?1",
                    params![blob_id],
                    |row| row.get::<_, Vec<u8>>(0),
                )
                .ok()
        } else {
            None
        };
        let bytes = match bytes_opt {
            Some(b) => b,
            None => {
                if cover_url.starts_with("http://") || cover_url.starts_with("https://") {
                    let client = reqwest::Client::builder()
                        .user_agent("iluhaAnime/3.0")
                        .build()
                        .map_err(|e| format!("image http client: {e}"))?;
                    match client.get(cover_url).send().await {
                        Ok(r) if r.status().is_success() => {
                            r.bytes().await.map(|b| b.to_vec()).unwrap_or_default()
                        }
                        _ => Vec::new(),
                    }
                } else if cover_url.starts_with("data:") {
                    // data URL: decode base64 payload after comma.
                    let payload = cover_url.split(',').nth(1).unwrap_or("");
                    base64::engine::general_purpose::STANDARD
                        .decode(payload)
                        .unwrap_or_default()
                } else {
                    Vec::new()
                }
            }
        };
        if !bytes.is_empty() {
            zip.start_file(&name, opts)
                .map_err(|e| format!("zip image: {e}"))?;
            zip.write_all(&bytes)
                .map_err(|e| format!("write image: {e}"))?;
        }
    }
    zip.finish().map_err(|e| format!("finalize zip: {e}"))?;
    Ok(())
}

pub fn remove_database(app: &tauri::AppHandle) -> Result<bool, String> {
    let path = database_path(app)?;
    let mut removed = false;
    for suffix in ["", "-wal", "-shm"] {
        let candidate = if suffix.is_empty() {
            path.clone()
        } else {
            PathBuf::from(format!("{}{}", path.to_string_lossy(), suffix))
        };
        match fs::remove_file(candidate) {
            Ok(()) => removed = true,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("remove app database: {error}")),
        }
    }
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migration_creates_cache_and_metadata_tables() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema migration");
        let table_count: i64 = connection
            .query_row(
                "            SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('cache_entries', 'media_records', 'release_analysis', 'anime_statistics', 'unified_index', 'collection_items', 'collection_reviews', 'collection_events', 'custom_field_defs')",
                [],
                |row| row.get(0),
            )
            .expect("table count");
        assert_eq!(table_count, 9);
    }

    #[test]
    fn unified_index_normalizes_and_orders_entries() {
        assert_eq!(normalize_index_text("  Frieren   S02  "), "frieren s02");
        assert_eq!(normalize_index_text("ЖЁсткий  Тест"), "жёсткий тест");
    }

    #[test]
    fn cache_input_rejects_non_json_and_oversized_payloads() {
        assert!(validate_cache_input("test", "key", "{\"ok\":true}").is_ok());
        assert!(validate_cache_input("test", "key", "not-json").is_err());
        assert!(validate_cache_input("test", "key", &"x".repeat(MAX_PAYLOAD_BYTES + 1)).is_err());
    }

    #[test]
    fn scoped_pruning_never_removes_records_outside_the_scan_scope() {
        assert!(path_is_in_scope(
            "C:/Anime/Show/episode.mkv",
            &["C:/Anime/Show".to_string()]
        ));
        assert!(!path_is_in_scope(
            "C:/Other/episode.mkv",
            &["C:/Anime/Show".to_string()]
        ));
    }

    #[test]
    fn media_records_are_upsertable_with_normalized_json() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema migration");
        let identity = serde_json::json!({
            "title": "Frieren",
            "season": 1,
            "episode": 4,
            "quality": "1080p",
            "codec": "hevc",
            "subtitleLikely": true,
        });
        connection
            .execute(
                "INSERT INTO media_records (path, identity_json, metadata_json, scanned_at)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(path) DO UPDATE SET identity_json = excluded.identity_json",
                params!["/anime/frieren.mkv", identity.to_string(), "{}", 1_i64],
            )
            .expect("insert record");
        connection
            .execute(
                "INSERT INTO media_records (path, identity_json, metadata_json, scanned_at)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(path) DO UPDATE SET identity_json = excluded.identity_json",
                params!["/anime/frieren.mkv", "{\"episode\":5}", "{}", 2_i64],
            )
            .expect("upsert record");
        let (count, episode): (i64, i64) = connection
            .query_row(
                "SELECT COUNT(*), json_extract(identity_json, '$.episode') FROM media_records",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read record");
        assert_eq!(count, 1);
        assert_eq!(episode, 5);
    }

    #[test]
    fn collection_item_status_update_keeps_fts_index_in_sync() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema migration");
        connection
            .execute(
                "INSERT INTO collection_items (
                    id, title, alt_titles_json, type, status, progress_value, progress_total,
                    progress_unit, duration_minutes, rating, priority, is_favorite, year,
                    genres_json, studio, description, notes, cover_url, cover_blob_id,
                    thumb_blob_id, external_ids_json, custom_fields_json, local_path, local_kind,
                    started_at, finished_at, last_watched_at, rewatch_count, added_at, updated_at
                 ) VALUES (
                    'item_1', 'Serial Experiments Lain', '[]', 'anime', 'completed', 13, 13,
                    'episodes', 23, 10, 'normal', 0, 1998, '[\"Drama\"]', 'TV Tokyo', NULL, NULL,
                    NULL, NULL, NULL, '{\"anilist\":339}', '{}', NULL, NULL, NULL, NULL, NULL,
                    0, 1000, 1000
                 )",
                [],
            )
            .expect("insert item");
        // Same upsert shape the app runs when the card status select changes.
        connection
            .execute(
                "INSERT INTO collection_items (
                    id, title, alt_titles_json, type, status, progress_value, progress_total,
                    progress_unit, duration_minutes, rating, priority, is_favorite, year,
                    genres_json, studio, description, notes, cover_url, cover_blob_id,
                    thumb_blob_id, external_ids_json, custom_fields_json, local_path, local_kind,
                    started_at, finished_at, last_watched_at, rewatch_count, added_at, updated_at
                 ) VALUES (
                    'item_1', 'Serial Experiments Lain', '[]', 'anime', 'watching', 13, 13,
                    'episodes', 23, 10, 'normal', 0, 1998, '[\"Drama\"]', 'TV Tokyo', NULL, NULL,
                    NULL, NULL, NULL, '{\"anilist\":339}', '{}', NULL, NULL, NULL, NULL, NULL,
                    0, 1000, 2000
                 )
                 ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title, alt_titles_json = excluded.alt_titles_json,
                    type = excluded.type, status = excluded.status,
                    progress_value = excluded.progress_value, progress_total = excluded.progress_total,
                    progress_unit = excluded.progress_unit, duration_minutes = excluded.duration_minutes,
                    rating = excluded.rating, priority = excluded.priority,
                    is_favorite = excluded.is_favorite, year = excluded.year,
                    genres_json = excluded.genres_json, studio = excluded.studio,
                    description = excluded.description, notes = excluded.notes,
                    cover_url = excluded.cover_url, cover_blob_id = excluded.cover_blob_id,
                    thumb_blob_id = excluded.thumb_blob_id, external_ids_json = excluded.external_ids_json,
                    custom_fields_json = excluded.custom_fields_json, local_path = excluded.local_path,
                    local_kind = excluded.local_kind, started_at = excluded.started_at,
                    finished_at = excluded.finished_at, last_watched_at = excluded.last_watched_at,
                    rewatch_count = excluded.rewatch_count, added_at = excluded.added_at,
                    updated_at = excluded.updated_at",
                [],
            )
            .expect("upsert item status");
        let status: String = connection
            .query_row(
                "SELECT status FROM collection_items WHERE id = 'item_1'",
                [],
                |row| row.get(0),
            )
            .expect("read status");
        assert_eq!(status, "watching");
        // FTS index still has exactly one entry for the updated title.
        let match_query = build_fts_match_query("lain");
        let count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM collection_items_fts WHERE collection_items_fts MATCH ?1",
                params![match_query],
                |row| row.get(0),
            )
            .expect("fts count");
        assert_eq!(count, 1);
    }

    #[test]
    fn unified_index_update_keeps_fts_index_in_sync() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema migration");
        let now = now_seconds();
        connection
            .execute(
                "INSERT INTO unified_index
                    (id, kind, scope, value, normalized_value, metadata_json, updated_at)
                 VALUES ('1', 'anime', 'g', 'Frieren', 'frieren', '{}', ?1)",
                params![now],
            )
            .expect("insert entry");
        connection
            .execute(
                "UPDATE unified_index
                 SET value = 'Frieren S2', normalized_value = 'frieren s2', updated_at = ?1
                 WHERE id = '1'",
                params![now],
            )
            .expect("update entry");
        // Old and new normalized values both contain 'frieren': exactly one FTS
        // entry proves the old one was removed instead of duplicated.
        let match_query = build_fts_match_query("frieren");
        let count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM unified_index_fts WHERE unified_index_fts MATCH ?1",
                params![match_query],
                |row| row.get(0),
            )
            .expect("fts count");
        assert_eq!(count, 1);
    }

    #[test]
    fn unified_index_fts_backfills_and_matches_substrings() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema migration");
        let now = now_seconds();
        connection
            .execute(
                "INSERT INTO unified_index
                    (id, kind, scope, value, normalized_value, metadata_json, updated_at)
                 VALUES ('1', 'anime', 'g', 'Frieren: Beyond Journey’s End', 'frieren beyond journeys end', '{}', ?1)",
                params![now],
            )
            .expect("insert frieren");
        connection
            .execute(
                "INSERT INTO unified_index
                    (id, kind, scope, value, normalized_value, metadata_json, updated_at)
                 VALUES ('2', 'anime', 'g', 'Attack on Titan', 'attack on titan', '{}', ?1)",
                params![now],
            )
            .expect("insert titan");

        let match_query = build_fts_match_query("frieren");
        let ids: Vec<String> = connection
            .prepare(
                "SELECT ui.id FROM unified_index_fts
                 JOIN unified_index ui ON ui.rowid = unified_index_fts.rowid
                 WHERE unified_index_fts MATCH ?1 ORDER BY bm25(unified_index_fts)",
            )
            .expect("prepare fts query")
            .query_map(params![match_query], |row| row.get::<_, String>(0))
            .expect("query fts")
            .collect::<Result<Vec<_>, _>>()
            .expect("collect fts rows");
        assert_eq!(ids, vec!["1".to_string()]);
    }

    #[test]
    fn fts_match_query_escapes_quotes() {
        assert_eq!(
            build_fts_match_query("sa\u{00f8} \"x\" y"),
            "\"sa\u{00f8}\" AND \"\"\"x\"\"\" AND \"y\""
        );
    }

    #[test]
    fn search_uses_like_fallback_for_short_queries() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema migration");
        let now = now_seconds();
        for (id, value) in [("1", "btooom"), ("2", "ab")] {
            connection
                .execute(
                    "INSERT INTO unified_index
                        (id, kind, scope, value, normalized_value, metadata_json, updated_at)
                     VALUES (?1, 'anime', 'g', ?2, ?2, '{}', ?3)",
                    params![id, value, now],
                )
                .expect("insert entry");
        }
        let count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM unified_index WHERE normalized_value LIKE '%btooom%'",
                [],
                |row| row.get(0),
            )
            .expect("like count");
        assert_eq!(count, 1);
    }
}
