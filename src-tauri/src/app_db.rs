use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Manager;

const DATABASE_FILE: &str = "app_data.sqlite3";
const MAX_PAYLOAD_BYTES: usize = 8 * 1024 * 1024;
const CURRENT_SCHEMA_VERSION: i64 = 3;

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
                    INSERT INTO unified_index_fts(unified_index_fts, rowid, normalized_value)
                    VALUES ('delete', old.rowid, old.normalized_value);
                    INSERT INTO unified_index_fts(rowid, normalized_value)
                    VALUES (new.rowid, new.normalized_value);
                END;
                CREATE TRIGGER IF NOT EXISTS trg_unified_index_fts_delete
                AFTER DELETE ON unified_index BEGIN
                    INSERT INTO unified_index_fts(unified_index_fts, rowid, normalized_value)
                    VALUES ('delete', old.rowid, old.normalized_value);
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
                "            SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('cache_entries', 'media_records', 'release_analysis', 'anime_statistics', 'unified_index')",
                [],
                |row| row.get(0),
            )
            .expect("table count");
        assert_eq!(table_count, 5);
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
