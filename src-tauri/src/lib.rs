#![allow(
    linker_messages,
    clippy::needless_pass_by_value,
    clippy::unnecessary_wraps,
    clippy::missing_panics_doc,
    clippy::too_many_lines,
    clippy::large_stack_frames
)]

use rusqlite::{
    types::{Value, ValueRef},
    Connection, OptionalExtension,
};
use std::collections::{HashMap, HashSet};
use std::num::NonZeroU32;
use std::sync::Arc;
use tauri::{Emitter, Manager};

use base64::Engine as _;

const MAX_SQLITE_CELL_TEXT_BYTES: usize = 16 * 1024;
const MAX_SQLITE_SEARCH_CHARS: usize = 200;
const MAX_SQLITE_QUERY_ROWS: usize = 1_000;

mod anilist;
mod app_db;

/// Narrow, offline-only API used by the query benchmark target.
#[doc(hidden)]
pub mod benchmark_api {
    pub use crate::anilist::{franchise_query_body, franchise_query_metrics};
}
mod auth;
mod bencode;
mod errors;
mod ffmpeg;
mod file_index;
mod fswatcher;
pub mod ipc;
mod progress;
mod scrapers;
mod shaders;
mod torrent;
mod user_assets;
mod video;
use file_index::FileEntry;
use torrent::{
    FilePriority, TorrentCheckResult, TorrentFileInfo, TorrentInfo, TorrentInfoResult,
    TorrentLimits, TorrentManager,
};
use video::{ActiveChildren, CancelFlag};

#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct NotificationConfig {
    enabled: bool,
    on_complete: bool,
    on_error: bool,
}

impl Default for NotificationConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            on_complete: true,
            on_error: true,
        }
    }
}

pub(crate) struct TorrentBackend {
    pub(crate) manager: Arc<TorrentManager>,
}

#[tauri::command]
async fn start_torrent_download(
    magnet: String,
    save_dir: String,
    only_files: Option<Vec<usize>>,
    sub_folder: Option<String>,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<usize, String> {
    manager
        .manager
        .add_torrent(magnet, save_dir, only_files, sub_folder)
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn get_torrent_info(
    magnet: String,
    save_dir: String,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<TorrentInfoResult, String> {
    manager.manager.get_torrent_info(magnet, save_dir).await
}

#[tauri::command]
async fn start_torrent_download_from_file(
    file_bytes: Vec<u8>,
    save_dir: String,
    only_files: Option<Vec<usize>>,
    sub_folder: Option<String>,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<usize, String> {
    manager
        .manager
        .add_torrent_from_bytes(file_bytes, save_dir, only_files, sub_folder)
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn get_torrent_info_from_file(
    file_bytes: Vec<u8>,
    save_dir: String,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<TorrentInfoResult, String> {
    manager
        .manager
        .get_torrent_info_from_bytes(file_bytes, save_dir)
        .await
}

#[tauri::command]
fn list_torrents(manager: tauri::State<'_, TorrentBackend>) -> Result<Vec<TorrentInfo>, String> {
    Ok(manager.manager.collect_torrents())
}

#[tauri::command]
async fn pause_torrent(id: usize, manager: tauri::State<'_, TorrentBackend>) -> Result<(), String> {
    manager
        .manager
        .pause_torrent(id)
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn resume_torrent(
    id: usize,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<(), String> {
    manager
        .manager
        .resume_torrent(id)
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn remove_torrent(
    id: usize,
    delete_files: bool,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<(), String> {
    manager
        .manager
        .remove_torrent(id, delete_files)
        .await
        .map_err(|e| format!("{e:#}"))
}

#[derive(serde::Serialize, serde::Deserialize)]
struct VideoFileEntry {
    path: String,
    name: String,
    size: u64,
}

#[tauri::command]
async fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    let file_path = std::path::Path::new(&path);
    let is_torrent = file_path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("torrent"));
    if !is_torrent {
        return Err("Ожидался файл с расширением .torrent".to_string());
    }

    const MAX_TORRENT_BYTES: u64 = 64 * 1024 * 1024;
    let metadata = tokio::fs::metadata(file_path)
        .await
        .map_err(|e| format!("metadata: {e:#}"))?;
    if !metadata.is_file() {
        return Err("Указанный путь не является файлом".to_string());
    }
    if metadata.len() > MAX_TORRENT_BYTES {
        return Err("Файл торрента слишком большой".to_string());
    }

    tokio::fs::read(file_path)
        .await
        .map_err(|e| format!("read: {e:#}"))
}

#[tauri::command]
fn get_file_size(path: String) -> Result<u64, String> {
    std::fs::metadata(&path)
        .map(|m| m.len())
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn reset_sqlite_data(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?;
    let databases = [
        (
            "AniList franchise cache",
            app_dir.join("franchise_relations_cache.sqlite3"),
        ),
        ("Uploaded user images", app_dir.join("user_assets.sqlite3")),
    ];
    let mut removed = Vec::new();
    for (label, path) in databases {
        let mut removed_this = false;
        for suffix in ["", "-wal", "-shm"] {
            let candidate = if suffix.is_empty() {
                path.clone()
            } else {
                std::path::PathBuf::from(format!("{}{}", path.to_string_lossy(), suffix))
            };
            match std::fs::remove_file(&candidate) {
                Ok(()) => removed_this = true,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(format!("remove {}: {error}", candidate.display())),
            }
        }
        if removed_this {
            removed.push(label.to_string());
        }
    }
    if app_db::remove_database(&app_handle)? {
        removed.push("Shared app cache and metadata".to_string());
    }
    anilist::clear_franchise_cache_memory();
    Ok(removed)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SqliteDatabaseInfo {
    id: String,
    label: String,
    file_name: String,
    available: bool,
    size_bytes: u64,
    tables: Vec<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SqliteColumnInfo {
    name: String,
    data_type: String,
    not_null: bool,
    primary_key: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SqliteTableInfo {
    name: String,
    row_count: u64,
    columns: Vec<SqliteColumnInfo>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SqliteRowsPage {
    database: String,
    table: String,
    columns: Vec<String>,
    rows: Vec<Vec<serde_json::Value>>,
    total: u64,
    page: u32,
    page_size: u32,
}

pub(crate) fn sqlite_database_spec(database: &str) -> Option<(&'static str, &'static str)> {
    match database {
        "franchise" => Some((
            "AniList franchise cache",
            "franchise_relations_cache.sqlite3",
        )),
        "user_assets" => Some(("Uploaded user images", "user_assets.sqlite3")),
        "app_data" => Some(("Shared app cache and metadata", "app_data.sqlite3")),
        _ => None,
    }
}

pub(crate) fn sqlite_database_path(
    app_handle: &tauri::AppHandle,
    database: &str,
) -> Result<std::path::PathBuf, String> {
    let (_, file_name) =
        sqlite_database_spec(database).ok_or_else(|| "Unknown SQLite database".to_string())?;
    Ok(app_handle
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data dir: {error}"))?
        .join(file_name))
}

fn open_sqlite_browser_database(
    app_handle: &tauri::AppHandle,
    database: &str,
) -> Result<Connection, String> {
    let path = sqlite_database_path(app_handle, database)?;
    if !path.is_file() {
        return Err("SQLite database does not exist yet".to_string());
    }
    let connection = Connection::open(path).map_err(|error| format!("open database: {error}"))?;
    connection
        .busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|error| format!("busy timeout: {error}"))?;
    Ok(connection)
}

pub(crate) fn open_sqlite_browser_database_read_only(
    app_handle: &tauri::AppHandle,
    database: &str,
) -> Result<Connection, String> {
    let connection = open_sqlite_browser_database(app_handle, database)?;
    connection
        .pragma_update(None, "query_only", "ON")
        .map_err(|error| format!("read-only pragma: {error}"))?;
    Ok(connection)
}

fn quote_sqlite_identifier(identifier: &str) -> Result<String, String> {
    if identifier.is_empty()
        || !identifier
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '_')
    {
        return Err("Invalid SQLite identifier".to_string());
    }
    Ok(format!("\"{identifier}\""))
}

fn allowed_sqlite_table(database: &str, table: &str) -> bool {
    matches!(
        (database, table),
        ("franchise", "franchise_nodes")
            | ("user_assets", "user_images")
            | ("app_data", "cache_entries")
            | ("app_data", "media_records")
            | ("app_data", "release_analysis")
            | ("app_data", "anime_statistics")
            | ("app_data", "unified_index")
    )
}

fn sqlite_columns(connection: &Connection, table: &str) -> Result<Vec<SqliteColumnInfo>, String> {
    let quoted = quote_sqlite_identifier(table)?;
    let mut statement = connection
        .prepare(&format!("PRAGMA table_info({quoted})"))
        .map_err(|error| format!("table info: {error}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok(SqliteColumnInfo {
                name: row.get(1)?,
                data_type: row.get::<_, String>(2).unwrap_or_default(),
                not_null: row.get::<_, i64>(3)? != 0,
                primary_key: row.get::<_, i64>(5)? != 0,
            })
        })
        .map_err(|error| format!("table info query: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("table info rows: {error}"))
}

fn sqlite_value_to_json(value: ValueRef<'_>) -> serde_json::Value {
    match value {
        ValueRef::Null => serde_json::Value::Null,
        ValueRef::Integer(value) => serde_json::json!(value),
        ValueRef::Real(value) => serde_json::json!(value),
        ValueRef::Text(value) => {
            if value.len() > MAX_SQLITE_CELL_TEXT_BYTES {
                serde_json::Value::String(format!("[TEXT truncated: {} bytes]", value.len()))
            } else {
                serde_json::Value::String(String::from_utf8_lossy(value).into())
            }
        }
        ValueRef::Blob(value) => {
            serde_json::Value::String(format!("[BLOB: {} bytes]", value.len()))
        }
    }
}

#[tauri::command]
async fn list_sqlite_databases(
    app_handle: tauri::AppHandle,
) -> Result<Vec<SqliteDatabaseInfo>, String> {
    let app_handle = app_handle.clone();
    tokio::task::spawn_blocking(move || {
        let mut result = Vec::new();
        for id in ["franchise", "user_assets", "app_data"] {
            let (label, file_name) = sqlite_database_spec(id).expect("known database");
            let path = sqlite_database_path(&app_handle, id)?;
            let metadata = std::fs::metadata(&path).ok();
            let tables = if metadata.is_some() {
                open_sqlite_browser_database_read_only(&app_handle, id)
                    .ok()
                    .map(|connection| {
                        let mut statement = connection
                            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
                            .map_err(|error| format!("table list: {error}"))?;
                        let names = statement
                            .query_map([], |row| row.get::<_, String>(0))
                            .map_err(|error| format!("table list query: {error}"))?
                            .collect::<Result<Vec<_>, _>>()
                            .map_err(|error| format!("table list rows: {error}"))?;
                        Ok::<Vec<String>, String>(names)
                    })
                    .transpose()?
                    .unwrap_or_default()
            } else {
                Vec::new()
            };
            result.push(SqliteDatabaseInfo {
                id: id.to_string(),
                label: label.to_string(),
                file_name: file_name.to_string(),
                available: metadata.as_ref().is_some_and(std::fs::Metadata::is_file),
                size_bytes: metadata.as_ref().map_or(0, std::fs::Metadata::len),
                tables,
            });
        }
        Ok(result)
    })
    .await
    .map_err(|error| format!("SQLite inventory task failed: {error}"))?
}

#[tauri::command]
async fn get_sqlite_tables(
    app_handle: tauri::AppHandle,
    database: String,
) -> Result<Vec<SqliteTableInfo>, String> {
    tokio::task::spawn_blocking(move || {
        let connection = match open_sqlite_browser_database_read_only(&app_handle, &database) {
            Ok(connection) => connection,
            Err(error) if error == "SQLite database does not exist yet" => return Ok(Vec::new()),
            Err(error) => return Err(error),
        };
        let mut statement = connection
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
            .map_err(|error| format!("table list: {error}"))?;
        let names = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| format!("table list query: {error}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("table list rows: {error}"))?;
        names
            .into_iter()
            .filter(|name| allowed_sqlite_table(&database, name))
            .map(|name| {
                let quoted = quote_sqlite_identifier(&name)?;
                let row_count = connection
                    .query_row(&format!("SELECT COUNT(*) FROM {quoted}"), [], |row| row.get::<_, i64>(0))
                    .map_err(|error| format!("row count: {error}"))?;
                Ok(SqliteTableInfo {
                    columns: sqlite_columns(&connection, &name)?,
                    name,
                    row_count: row_count.max(0) as u64,
                })
            })
            .collect()
    })
    .await
    .map_err(|error| format!("SQLite table task failed: {error}"))?
}

#[derive(Clone)]
enum SqliteFilterOperator {
    Eq,
    Ne,
    Gt,
    GtEq,
    Lt,
    LtEq,
    Contains,
    NotContains,
    StartsWith,
    EndsWith,
}

#[derive(Clone)]
enum SqliteFilterValue {
    Null,
    Integer(i64),
    Real(f64),
    Bool(bool),
    Text(String),
}

impl SqliteFilterValue {
    fn to_sql_value(&self) -> Value {
        match self {
            Self::Null => Value::Null,
            Self::Integer(value) => Value::Integer(*value),
            Self::Real(value) => Value::Real(*value),
            Self::Bool(value) => Value::Integer(*value as i64),
            Self::Text(value) => Value::Text(value.clone()),
        }
    }

    fn display(&self) -> String {
        match self {
            Self::Null => "NULL".to_string(),
            Self::Integer(value) => value.to_string(),
            Self::Real(value) => value.to_string(),
            Self::Bool(value) => {
                if *value {
                    "1".to_string()
                } else {
                    "0".to_string()
                }
            }
            Self::Text(value) => value.clone(),
        }
    }
}

struct SqliteFilterCondition {
    column: String,
    operator: SqliteFilterOperator,
    value: SqliteFilterValue,
}

const SQLITE_FILTER_OPERATORS: [(&str, SqliteFilterOperator); 10] = [
    ("!=", SqliteFilterOperator::Ne),
    (">=", SqliteFilterOperator::GtEq),
    ("<=", SqliteFilterOperator::LtEq),
    ("!~", SqliteFilterOperator::NotContains),
    ("~", SqliteFilterOperator::Contains),
    ("^", SqliteFilterOperator::StartsWith),
    ("$", SqliteFilterOperator::EndsWith),
    ("=", SqliteFilterOperator::Eq),
    (">", SqliteFilterOperator::Gt),
    ("<", SqliteFilterOperator::Lt),
];

/// Splits `input` at the first top-level occurrence of `needle`, outside quotes.
fn split_sqlite_filter_top_level<'a>(input: &'a str, needle: &str) -> Option<(&'a str, &'a str)> {
    let mut in_single = false;
    let mut in_double = false;
    for (index, character) in input.char_indices() {
        match character {
            '\'' if !in_double => in_single = !in_single,
            '"' if !in_single => in_double = !in_double,
            _ => {}
        }
        if !in_single && !in_double && input[index..].starts_with(needle) {
            return Some((&input[..index], &input[index + needle.len()..]));
        }
    }
    None
}

fn sqlite_filter_has_operator(input: &str) -> bool {
    let mut in_single = false;
    let mut in_double = false;
    for (index, character) in input.char_indices() {
        match character {
            '\'' if !in_double => in_single = !in_single,
            '"' if !in_single => in_double = !in_double,
            _ => {}
        }
        if in_single || in_double {
            continue;
        }
        for (operator_text, _) in SQLITE_FILTER_OPERATORS {
            if input[index..].starts_with(operator_text) {
                return true;
            }
        }
    }
    false
}

fn parse_sqlite_filter_value(raw: &str) -> SqliteFilterValue {
    let value = raw.trim();
    if value.eq_ignore_ascii_case("null") {
        return SqliteFilterValue::Null;
    }
    if value.eq_ignore_ascii_case("true") {
        return SqliteFilterValue::Bool(true);
    }
    if value.eq_ignore_ascii_case("false") {
        return SqliteFilterValue::Bool(false);
    }
    let first = value.chars().next();
    let last = value.chars().last();
    if first == last && matches!(first, Some('"') | Some('\'')) {
        let quote = first.unwrap();
        let inner = &value[quote.len_utf8()..value.len() - quote.len_utf8()];
        let doubled = format!("{quote}{quote}");
        let single = quote.to_string();
        return SqliteFilterValue::Text(inner.replace(&doubled, &single));
    }
    if let Ok(number) = value.parse::<i64>() {
        return SqliteFilterValue::Integer(number);
    }
    if let Ok(number) = value.parse::<f64>() {
        return SqliteFilterValue::Real(number);
    }
    SqliteFilterValue::Text(value.to_string())
}

fn parse_sqlite_filter_condition(raw: &str) -> Option<SqliteFilterCondition> {
    let input = raw.trim();
    if input.is_empty() {
        return None;
    }
    let mut in_single = false;
    let mut in_double = false;
    for (index, character) in input.char_indices() {
        match character {
            '\'' if !in_double => in_single = !in_single,
            '"' if !in_single => in_double = !in_double,
            _ => {}
        }
        if in_single || in_double {
            continue;
        }
        for (operator_text, operator) in SQLITE_FILTER_OPERATORS {
            if input[index..].starts_with(operator_text) {
                let column = input[..index].trim();
                let value_raw = input[index + operator_text.len()..].trim();
                if column.is_empty() || value_raw.is_empty() {
                    return None;
                }
                return Some(SqliteFilterCondition {
                    column: column.to_string(),
                    operator,
                    value: parse_sqlite_filter_value(value_raw),
                });
            }
        }
    }
    None
}

fn parse_sqlite_filter_group(input: &str) -> Result<Vec<SqliteFilterCondition>, String> {
    let mut conditions = Vec::new();
    let mut remainder = input;
    while let Some((before, after)) = split_sqlite_filter_top_level(remainder, "&&") {
        let trimmed = before.trim();
        if trimmed.is_empty() {
            return Err("Empty condition in SQLite filter".to_string());
        }
        conditions.push(parse_sqlite_filter_condition(trimmed).ok_or_else(|| {
            format!(
                "Invalid filter condition: \"{trimmed}\". Expected \"column operator value\", e.g. title ~ \"text\" or id > 5"
            )
        })?);
        remainder = after;
    }
    let trimmed = remainder.trim();
    if !trimmed.is_empty() {
        conditions.push(parse_sqlite_filter_condition(trimmed).ok_or_else(|| {
            format!(
                "Invalid filter condition: \"{trimmed}\". Expected \"column operator value\", e.g. title = \"text\""
            )
        })?);
    }
    Ok(conditions)
}

/// Parses a PocketBase-style filter: `column op value`, combined with `&&` (AND)
/// and `||` (OR). Returns groups OR-ed together; conditions inside a group AND-ed.
fn parse_sqlite_filter(input: &str) -> Result<Vec<Vec<SqliteFilterCondition>>, String> {
    let mut groups: Vec<Vec<SqliteFilterCondition>> = Vec::new();
    let mut remainder = input;
    while let Some((before, after)) = split_sqlite_filter_top_level(remainder, "||") {
        let conditions = parse_sqlite_filter_group(before)?;
        if !conditions.is_empty() {
            groups.push(conditions);
        }
        remainder = after;
    }
    let conditions = parse_sqlite_filter_group(remainder)?;
    if !conditions.is_empty() {
        groups.push(conditions);
    }
    if groups.is_empty() {
        return Err("Empty SQLite filter".to_string());
    }
    Ok(groups)
}

fn build_sqlite_condition_sql(
    quoted_column: &str,
    operator: &SqliteFilterOperator,
    value: &SqliteFilterValue,
) -> (String, Option<Value>) {
    let like = |pattern: String| {
        (
            format!("CAST({quoted_column} AS TEXT) LIKE ?"),
            Some(Value::Text(pattern)),
        )
    };
    match operator {
        SqliteFilterOperator::Eq => match value {
            SqliteFilterValue::Null => (format!("{quoted_column} IS NULL"), None),
            _ => (format!("{quoted_column} = ?"), Some(value.to_sql_value())),
        },
        SqliteFilterOperator::Ne => match value {
            SqliteFilterValue::Null => (format!("{quoted_column} IS NOT NULL"), None),
            _ => (format!("{quoted_column} != ?"), Some(value.to_sql_value())),
        },
        SqliteFilterOperator::Gt => (format!("{quoted_column} > ?"), Some(value.to_sql_value())),
        SqliteFilterOperator::GtEq => (format!("{quoted_column} >= ?"), Some(value.to_sql_value())),
        SqliteFilterOperator::Lt => (format!("{quoted_column} < ?"), Some(value.to_sql_value())),
        SqliteFilterOperator::LtEq => (format!("{quoted_column} <= ?"), Some(value.to_sql_value())),
        SqliteFilterOperator::Contains => like(format!("%{}%", value.display())),
        SqliteFilterOperator::NotContains => {
            let (sql, param) = like(format!("%{}%", value.display()));
            (sql.replace("LIKE ?", "NOT LIKE ?"), param)
        }
        SqliteFilterOperator::StartsWith => like(format!("{}%", value.display())),
        SqliteFilterOperator::EndsWith => like(format!("%{}", value.display())),
    }
}

fn build_sqlite_filter_where(
    groups: &[Vec<SqliteFilterCondition>],
    columns: &[SqliteColumnInfo],
) -> Result<(String, Vec<Value>), String> {
    let allowed = columns
        .iter()
        .map(|column| column.name.as_str())
        .collect::<HashSet<_>>();
    let mut params: Vec<Value> = Vec::new();
    let mut group_sqls: Vec<String> = Vec::new();
    for group in groups {
        let mut condition_sqls: Vec<String> = Vec::new();
        for condition in group {
            if !allowed.contains(condition.column.as_str()) {
                return Err(format!(
                    "Unknown column \"{}\" in SQLite filter",
                    condition.column
                ));
            }
            let quoted = quote_sqlite_identifier(&condition.column)?;
            let (sql, param) =
                build_sqlite_condition_sql(&quoted, &condition.operator, &condition.value);
            condition_sqls.push(sql);
            if let Some(param) = param {
                params.push(param);
            }
        }
        if !condition_sqls.is_empty() {
            group_sqls.push(format!("({})", condition_sqls.join(" AND ")));
        }
    }
    if group_sqls.is_empty() {
        return Err("Empty SQLite filter".to_string());
    }
    Ok((format!(" WHERE {}", group_sqls.join(" OR ")), params))
}

fn build_sqlite_substring_where(
    columns: &[SqliteColumnInfo],
    value: &str,
) -> Result<(String, Vec<Value>), String> {
    let searchable = columns
        .iter()
        .filter(|column| !column.data_type.eq_ignore_ascii_case("BLOB"))
        .collect::<Vec<_>>();
    if searchable.is_empty() {
        return Ok((String::new(), Vec::new()));
    }
    let pattern = format!("%{value}%");
    let mut quoted = Vec::with_capacity(searchable.len());
    for column in &searchable {
        quoted.push(quote_sqlite_identifier(&column.name)?);
    }
    let predicates = quoted
        .iter()
        .map(|column| format!("CAST({column} AS TEXT) LIKE ?1"))
        .collect::<Vec<_>>()
        .join(" OR ");
    Ok((format!(" WHERE {predicates}"), vec![Value::Text(pattern)]))
}

#[tauri::command]
async fn get_sqlite_rows(
    app_handle: tauri::AppHandle,
    database: String,
    table: String,
    page: u32,
    page_size: u32,
    search: Option<String>,
    filter: Option<String>,
    order_column: Option<String>,
    order_direction: Option<String>,
) -> Result<SqliteRowsPage, String> {
    tokio::task::spawn_blocking(move || {
        if !allowed_sqlite_table(&database, &table) {
            return Err("This SQLite table is not available in the browser".to_string());
        }
        let connection = open_sqlite_browser_database_read_only(&app_handle, &database)?;
        let quoted_table = quote_sqlite_identifier(&table)?;
        let columns = sqlite_columns(&connection, &table)?;
        let column_names = columns.iter().map(|column| column.name.clone()).collect::<Vec<_>>();
        let quoted_columns = column_names
            .iter()
            .map(|column| quote_sqlite_identifier(column))
            .collect::<Result<Vec<_>, _>>()?
            .join(", ");
        let page = page.max(1);
        let page_size = page_size.clamp(1, 100);
        let offset = (page - 1) as u64 * page_size as u64;
        let filter_value = filter
            .map(|value| value.trim().chars().take(MAX_SQLITE_SEARCH_CHARS).collect::<String>())
            .filter(|value| !value.is_empty());
        let (where_sql, where_params): (String, Vec<Value>) = if let Some(value) = filter_value {
            if sqlite_filter_has_operator(&value) {
                let groups = parse_sqlite_filter(&value)
                    .map_err(|error| format!("SQLite filter: {error}"))?;
                build_sqlite_filter_where(&groups, &columns)?
            } else {
                build_sqlite_substring_where(&columns, &value)?
            }
        } else if let Some(value) = search
            .map(|value| value.trim().chars().take(MAX_SQLITE_SEARCH_CHARS).collect::<String>())
            .filter(|value| !value.is_empty())
        {
            build_sqlite_substring_where(&columns, &value)?
        } else {
            (String::new(), Vec::new())
        };
        let total_sql = format!("SELECT COUNT(*) FROM {quoted_table}{where_sql}");
        let total = if where_params.is_empty() {
            connection
                .query_row(&total_sql, [], |row| row.get::<_, i64>(0))
                .map_err(|error| format!("row count: {error}"))?
        } else {
            connection
                .query_row(
                    &total_sql,
                    rusqlite::params_from_iter(where_params.iter()),
                    |row| row.get::<_, i64>(0),
                )
                .map_err(|error| format!("row count: {error}"))?
        };
        let order_column = match order_column.as_deref() {
            Some(value) if column_names.iter().any(|name| name == value) => {
                quote_sqlite_identifier(value)?
            }
            _ => quote_sqlite_identifier(
                columns
                    .iter()
                    .find(|column| column.primary_key)
                    .map(|column| column.name.as_str())
                    .unwrap_or(column_names.first().map(String::as_str).unwrap_or("rowid")),
            )?,
        };
        let order_direction = match order_direction.as_deref() {
            Some("desc") | Some("DESC") => "DESC",
            _ => "ASC",
        };
        let mut all_params = where_params.clone();
        all_params.push(Value::Integer(page_size as i64));
        all_params.push(Value::Integer(offset as i64));
        let rows_sql = format!("SELECT {quoted_columns} FROM {quoted_table}{where_sql} ORDER BY {order_column} {order_direction}, rowid LIMIT ? OFFSET ?");
        let mut statement = connection.prepare(&rows_sql).map_err(|error| format!("rows query: {error}"))?;
        let mut rows = statement
            .query(rusqlite::params_from_iter(all_params.iter()))
            .map_err(|error| format!("rows query: {error}"))?;
        let mut values = Vec::new();
        while let Some(row) = rows.next().map_err(|error| format!("rows read: {error}"))? {
            let mut value_row = Vec::with_capacity(column_names.len());
            for index in 0..column_names.len() {
                value_row.push(
                    sqlite_value_to_json(
                        row.get_ref(index)
                            .map_err(|error| format!("cell read: {error}"))?,
                    ),
                );
            }
            values.push(value_row);
        }
        Ok(SqliteRowsPage {
            database,
            table,
            columns: column_names,
            rows: values,
            total: total.max(0) as u64,
            page,
            page_size,
        })
    })
    .await
    .map_err(|error| format!("SQLite rows task failed: {error}"))?
    .map_err(|error| format!("SQLite rows: {error}"))
}

#[tauri::command]
async fn delete_sqlite_row(
    app_handle: tauri::AppHandle,
    database: String,
    table: String,
    keys: Vec<String>,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        if !allowed_sqlite_table(&database, &table) {
            return Err("This SQLite table cannot be edited in the browser".to_string());
        }
        let connection = open_sqlite_browser_database(&app_handle, &database)?;
        let columns = sqlite_columns(&connection, &table)?;
        let primary_keys = columns
            .iter()
            .filter(|column| column.primary_key)
            .map(|column| column.name.as_str())
            .collect::<Vec<_>>();
        if primary_keys.is_empty() {
            return Err("This table has no primary key".to_string());
        }
        if primary_keys.len() != keys.len() {
            return Err("Primary key value count does not match".to_string());
        }
        let quoted_table = quote_sqlite_identifier(&table)?;
        let where_clause = primary_keys
            .iter()
            .zip(keys.iter())
            .enumerate()
            .map(|(index, (column, _))| {
                let quoted = quote_sqlite_identifier(column)?;
                Ok(format!("{quoted} = ?{}", index + 1))
            })
            .collect::<Result<Vec<_>, String>>()?
            .join(" AND ");
        let params = keys.iter().map(|key| key.as_str()).collect::<Vec<_>>();
        let deleted = connection
            .execute(
                &format!("DELETE FROM {quoted_table} WHERE {where_clause}"),
                rusqlite::params_from_iter(params),
            )
            .map_err(|error| format!("delete row: {error}"))?;
        if deleted == 0 {
            return Err("No matching row was found".to_string());
        }
        if database == "franchise" {
            anilist::clear_franchise_cache_memory();
        }
        Ok(())
    })
    .await
    .map_err(|error| format!("SQLite delete task failed: {error}"))?
    .map_err(|error| format!("SQLite delete: {error}"))
}

#[tauri::command]
async fn delete_sqlite_rows(
    app_handle: tauri::AppHandle,
    database: String,
    table: String,
    keys: Vec<Vec<String>>,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        if !allowed_sqlite_table(&database, &table) {
            return Err("This SQLite table cannot be edited in the browser".to_string());
        }
        let connection = open_sqlite_browser_database(&app_handle, &database)?;
        let columns = sqlite_columns(&connection, &table)?;
        let primary_keys = columns
            .iter()
            .filter(|column| column.primary_key)
            .map(|column| column.name.as_str())
            .collect::<Vec<_>>();
        if primary_keys.is_empty() {
            return Err("This table has no primary key".to_string());
        }
        let quoted_table = quote_sqlite_identifier(&table)?;
        let where_clause = primary_keys
            .iter()
            .enumerate()
            .map(|(index, column)| {
                let quoted = quote_sqlite_identifier(column)?;
                Ok(format!("{quoted} = ?{}", index + 1))
            })
            .collect::<Result<Vec<_>, String>>()?
            .join(" AND ");
        for row_keys in keys {
            if primary_keys.len() != row_keys.len() {
                return Err("Primary key value count does not match".to_string());
            }
            let params = row_keys.iter().map(|key| key.as_str()).collect::<Vec<_>>();
            connection
                .execute(
                    &format!("DELETE FROM {quoted_table} WHERE {where_clause}"),
                    rusqlite::params_from_iter(params),
                )
                .map_err(|error| format!("delete row: {error}"))?;
        }
        if database == "franchise" {
            anilist::clear_franchise_cache_memory();
        }
        Ok(())
    })
    .await
    .map_err(|error| format!("SQLite delete task failed: {error}"))?
    .map_err(|error| format!("SQLite delete: {error}"))
}

#[tauri::command]
async fn write_sqlite_export(path: String, content: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        std::fs::write(&path, content).map_err(|error| format!("write export: {error}"))
    })
    .await
    .map_err(|error| format!("SQLite export task failed: {error}"))?
    .map_err(|error| format!("SQLite export: {error}"))
}

fn sqlite_text_to_value(value: &str) -> Value {
    let trimmed = value.trim();
    if trimmed.eq_ignore_ascii_case("null") {
        Value::Null
    } else if let Ok(integer) = trimmed.parse::<i64>() {
        Value::Integer(integer)
    } else if let Ok(real) = trimmed.parse::<f64>() {
        Value::Real(real)
    } else {
        Value::Text(value.to_string())
    }
}

#[tauri::command]
async fn update_sqlite_cell(
    app_handle: tauri::AppHandle,
    database: String,
    table: String,
    column: String,
    keys: Vec<String>,
    value: Option<String>,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        if !allowed_sqlite_table(&database, &table) {
            return Err("This SQLite table cannot be edited in the browser".to_string());
        }
        if !column
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '_')
            || column.is_empty()
        {
            return Err("Invalid SQLite column".to_string());
        }
        let connection = open_sqlite_browser_database(&app_handle, &database)?;
        let columns = sqlite_columns(&connection, &table)?;
        let column_info = columns
            .iter()
            .find(|candidate| candidate.name == column)
            .ok_or_else(|| "This column does not exist in the table".to_string())?;
        if column_info.data_type.eq_ignore_ascii_case("BLOB") {
            return Err("BLOB cells cannot be edited in the browser".to_string());
        }
        let primary_keys = columns
            .iter()
            .filter(|candidate| candidate.primary_key)
            .map(|candidate| candidate.name.as_str())
            .collect::<Vec<_>>();
        if primary_keys.is_empty() {
            return Err("This table has no primary key".to_string());
        }
        if primary_keys.len() != keys.len() {
            return Err("Primary key value count does not match".to_string());
        }
        let quoted_table = quote_sqlite_identifier(&table)?;
        let quoted_column = quote_sqlite_identifier(&column)?;
        let where_clause = primary_keys
            .iter()
            .enumerate()
            .map(|(index, primary_key)| {
                let quoted = quote_sqlite_identifier(primary_key)?;
                Ok(format!("{quoted} = ?{}", index + 2))
            })
            .collect::<Result<Vec<_>, String>>()?
            .join(" AND ");
        let mut bindings = Vec::with_capacity(keys.len() + 1);
        bindings.push(match value.as_deref() {
            Some(raw) => sqlite_text_to_value(raw),
            None => Value::Null,
        });
        bindings.extend(keys.iter().cloned().map(Value::Text));
        let updated = connection
            .execute(
                &format!("UPDATE {quoted_table} SET {quoted_column} = ?1 WHERE {where_clause}"),
                rusqlite::params_from_iter(bindings),
            )
            .map_err(|error| format!("update cell: {error}"))?;
        if updated == 0 {
            return Err("No matching row was found".to_string());
        }
        if database == "franchise" {
            anilist::clear_franchise_cache_memory();
        }
        Ok(())
    })
    .await
    .map_err(|error| format!("SQLite update task failed: {error}"))?
    .map_err(|error| format!("SQLite update: {error}"))
}

#[tauri::command]
async fn run_sqlite_query(
    app_handle: tauri::AppHandle,
    database: String,
    sql: String,
) -> Result<SqliteRowsPage, String> {
    tokio::task::spawn_blocking(move || {
        let trimmed = sql.trim();
        if trimmed.is_empty() {
            return Err("SQL query is empty".to_string());
        }
        let first_keyword = trimmed
            .split(|character: char| !character.is_ascii_alphabetic())
            .find(|token| !token.is_empty())
            .map(str::to_ascii_uppercase);
        if !matches!(first_keyword.as_deref(), Some("SELECT") | Some("EXPLAIN")) {
            return Err("Only SELECT and EXPLAIN queries are allowed".to_string());
        }
        let connection = open_sqlite_browser_database_read_only(&app_handle, &database)?;
        let mut statement = connection
            .prepare(&trimmed)
            .map_err(|error| format!("query prepare: {error}"))?;
        let column_names = statement
            .column_names()
            .iter()
            .map(|name| name.to_string())
            .collect::<Vec<_>>();
        let mut query_rows = statement
            .query([])
            .map_err(|error| format!("query execute: {error}"))?;
        let mut values = Vec::new();
        while let Some(row) = query_rows
            .next()
            .map_err(|error| format!("query row: {error}"))?
        {
            if values.len() >= MAX_SQLITE_QUERY_ROWS {
                break;
            }
            let mut value_row = Vec::with_capacity(column_names.len());
            for index in 0..column_names.len() {
                value_row.push(sqlite_value_to_json(
                    row.get_ref(index)
                        .map_err(|error| format!("query cell: {error}"))?,
                ));
            }
            values.push(value_row);
        }
        Ok(SqliteRowsPage {
            database,
            table: String::new(),
            columns: column_names,
            rows: values,
            total: 0,
            page: 1,
            page_size: MAX_SQLITE_QUERY_ROWS as u32,
        })
    })
    .await
    .map_err(|error| format!("SQLite query task failed: {error}"))?
    .map_err(|error| format!("SQLite query: {error}"))
}

fn sqlite_value_ref_to_string(value: ValueRef<'_>) -> Option<String> {
    match value {
        ValueRef::Null => None,
        ValueRef::Integer(value) => Some(value.to_string()),
        ValueRef::Real(value) => Some(value.to_string()),
        ValueRef::Text(value) => Some(String::from_utf8_lossy(value).into()),
        ValueRef::Blob(value) => Some(format!("[BLOB: {} bytes]", value.len())),
    }
}

#[tauri::command]
async fn get_sqlite_cell(
    app_handle: tauri::AppHandle,
    database: String,
    table: String,
    column: String,
    keys: Vec<String>,
) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || {
        if !allowed_sqlite_table(&database, &table) {
            return Err("This SQLite table is not available in the browser".to_string());
        }
        if !column
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '_')
            || column.is_empty()
        {
            return Err("Invalid SQLite column".to_string());
        }
        let connection = open_sqlite_browser_database_read_only(&app_handle, &database)?;
        let columns = sqlite_columns(&connection, &table)?;
        let column_info = columns
            .iter()
            .find(|candidate| candidate.name == column)
            .ok_or_else(|| "This column does not exist in the table".to_string())?;
        if column_info.data_type.eq_ignore_ascii_case("BLOB") {
            return Err("BLOB cells cannot be viewed in the browser".to_string());
        }
        let primary_keys = columns
            .iter()
            .filter(|candidate| candidate.primary_key)
            .map(|candidate| candidate.name.as_str())
            .collect::<Vec<_>>();
        if primary_keys.len() != keys.len() {
            return Err("Primary key value count does not match".to_string());
        }
        let quoted_table = quote_sqlite_identifier(&table)?;
        let quoted_column = quote_sqlite_identifier(&column)?;
        let where_clause = primary_keys
            .iter()
            .enumerate()
            .map(|(index, primary_key)| {
                let quoted = quote_sqlite_identifier(primary_key)?;
                Ok(format!("{quoted} = ?{}", index + 1))
            })
            .collect::<Result<Vec<_>, String>>()?
            .join(" AND ");
        let sql = format!("SELECT {quoted_column} FROM {quoted_table} WHERE {where_clause}");
        let params = keys.iter().map(|key| key.as_str()).collect::<Vec<_>>();
        let value = connection
            .query_row(&sql, rusqlite::params_from_iter(params), |row| {
                Ok(sqlite_value_ref_to_string(row.get_ref(0)?))
            })
            .optional()
            .map_err(|error| format!("read cell: {error}"))?
            .ok_or_else(|| "No matching row was found".to_string())?;
        Ok(value)
    })
    .await
    .map_err(|error| format!("SQLite cell task failed: {error}"))?
    .map_err(|error| format!("SQLite cell: {error}"))
}

#[tauri::command]
async fn get_sqlite_cell_blob(
    app_handle: tauri::AppHandle,
    database: String,
    table: String,
    column: String,
    keys: Vec<String>,
) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || {
        if !allowed_sqlite_table(&database, &table) {
            return Err("This SQLite table is not available in the browser".to_string());
        }
        if !column
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '_')
            || column.is_empty()
        {
            return Err("Invalid SQLite column".to_string());
        }
        let connection = open_sqlite_browser_database_read_only(&app_handle, &database)?;
        let columns = sqlite_columns(&connection, &table)?;
        let column_info = columns
            .iter()
            .find(|candidate| candidate.name == column)
            .ok_or_else(|| "This column does not exist in the table".to_string())?;
        if !column_info.data_type.eq_ignore_ascii_case("BLOB") {
            return Ok(None);
        }
        let primary_keys = columns
            .iter()
            .filter(|candidate| candidate.primary_key)
            .map(|candidate| candidate.name.as_str())
            .collect::<Vec<_>>();
        if primary_keys.len() != keys.len() {
            return Err("Primary key value count does not match".to_string());
        }
        let quoted_table = quote_sqlite_identifier(&table)?;
        let quoted_column = quote_sqlite_identifier(&column)?;
        let where_clause = primary_keys
            .iter()
            .enumerate()
            .map(|(index, primary_key)| {
                let quoted = quote_sqlite_identifier(primary_key)?;
                Ok(format!("{quoted} = ?{}", index + 1))
            })
            .collect::<Result<Vec<_>, String>>()?
            .join(" AND ");
        let sql = format!("SELECT {quoted_column} FROM {quoted_table} WHERE {where_clause}");
        let params = keys.iter().map(|key| key.as_str()).collect::<Vec<_>>();
        let blob = connection
            .query_row(&sql, rusqlite::params_from_iter(params), |row| {
                row.get::<_, Vec<u8>>(0)
            })
            .optional()
            .map_err(|error| format!("read cell blob: {error}"))?
            .ok_or_else(|| "No matching row was found".to_string())?;
        let mime = user_assets::image_mime(&blob, None)
            .ok_or_else(|| "Cell is not a recognized image".to_string())?;
        let data_url = format!(
            "data:{mime};base64,{}",
            base64::engine::general_purpose::STANDARD.encode(blob)
        );
        Ok(Some(data_url))
    })
    .await
    .map_err(|error| format!("SQLite cell blob task failed: {error}"))?
    .map_err(|error| format!("SQLite cell blob: {error}"))
}

#[derive(serde::Deserialize)]
struct VaultOrganizationMove {
    source_path: String,
    target_path: String,
}

#[derive(serde::Serialize)]
struct VaultOrganizationResult {
    moved: usize,
    skipped: usize,
    errors: Vec<String>,
}

#[tauri::command]
async fn apply_vault_organization(
    root: String,
    moves: Vec<VaultOrganizationMove>,
) -> Result<VaultOrganizationResult, String> {
    tokio::task::spawn_blocking(move || {
        if moves.len() > 500 {
            return Err("Too many organization moves in one operation".to_string());
        }
        let root =
            std::fs::canonicalize(&root).map_err(|error| format!("organization root: {error}"))?;
        if !root.is_dir() {
            return Err("Organization root is not a directory".to_string());
        }
        let mut result = VaultOrganizationResult {
            moved: 0,
            skipped: 0,
            errors: Vec::new(),
        };
        for item in moves {
            let source = match std::fs::canonicalize(&item.source_path) {
                Ok(path) if path.is_file() => path,
                Ok(_) => {
                    result
                        .errors
                        .push(format!("Source is not a file: {}", item.source_path));
                    continue;
                }
                Err(error) => {
                    result.errors.push(format!(
                        "Source unavailable ({}): {error}",
                        item.source_path
                    ));
                    continue;
                }
            };
            let target = std::path::PathBuf::from(&item.target_path);
            let Some(target_name) = target.file_name().map(|name| name.to_owned()) else {
                result
                    .errors
                    .push(format!("Invalid target path: {}", item.target_path));
                continue;
            };
            let Some(target_parent) = target.parent() else {
                result
                    .errors
                    .push(format!("Invalid target path: {}", item.target_path));
                continue;
            };
            if target
                .components()
                .any(|component| matches!(component, std::path::Component::ParentDir))
            {
                result.errors.push(format!(
                    "Target escapes organization root: {}",
                    item.target_path
                ));
                continue;
            }
            // Check the nearest existing ancestor before creating anything.
            // This prevents a malicious target from creating directories outside
            // the selected root and only then failing the scope check.
            let mut existing_parent = target_parent;
            let mut missing_ancestor = false;
            while !existing_parent.exists() {
                let Some(parent) = existing_parent.parent() else {
                    missing_ancestor = true;
                    break;
                };
                existing_parent = parent;
            }
            if missing_ancestor {
                result
                    .errors
                    .push(format!("Target folder unavailable: {}", item.target_path));
                continue;
            }
            match std::fs::canonicalize(existing_parent) {
                Ok(path) if path.starts_with(&root) => {}
                Ok(_) => {
                    result.errors.push(format!(
                        "Target escapes organization root: {}",
                        item.target_path
                    ));
                    continue;
                }
                Err(error) => {
                    result
                        .errors
                        .push(format!("Target folder unavailable: {error}"));
                    continue;
                }
            }
            if let Err(error) = std::fs::create_dir_all(target_parent) {
                result
                    .errors
                    .push(format!("Could not create target folder: {error}"));
                continue;
            }
            let target_parent = match std::fs::canonicalize(target_parent) {
                Ok(path) if path.starts_with(&root) => path,
                Ok(_) => {
                    result.errors.push(format!(
                        "Target escapes organization root: {}",
                        item.target_path
                    ));
                    continue;
                }
                Err(error) => {
                    result
                        .errors
                        .push(format!("Target folder unavailable: {error}"));
                    continue;
                }
            };
            let target = target_parent.join(target_name);
            if source == target {
                result.skipped += 1;
                continue;
            }
            if target.exists() {
                result
                    .errors
                    .push(format!("Target already exists: {}", target.display()));
                continue;
            }
            match std::fs::rename(&source, &target) {
                Ok(()) => result.moved += 1,
                Err(error) => result
                    .errors
                    .push(format!("Could not move {}: {error}", source.display())),
            }
        }
        Ok(result)
    })
    .await
    .map_err(|error| format!("organization task failed: {error}"))?
}

#[tauri::command]
async fn scan_video_folder(
    app_handle: tauri::AppHandle,
    path: String,
    extensions: Vec<String>,
) -> Result<Vec<VideoFileEntry>, String> {
    let ext_set: HashSet<String> = extensions.into_iter().map(|e| e.to_lowercase()).collect();
    let path_clone = path.clone();

    let entries = tokio::task::spawn_blocking(move || -> Result<Vec<VideoFileEntry>, String> {
        let mut entries = Vec::new();
        let mut walked: u64 = 0;

        for entry in walkdir::WalkDir::new(&path_clone).follow_links(false) {
            let entry = entry.map_err(|e| format!("walkdir error: {e}"))?;

            if entry.file_type().is_dir() {
                continue;
            }

            walked += 1;

            if walked.is_multiple_of(100) {
                let _ = app_handle.emit(
                    "folder-scan-progress",
                    serde_json::json!({
                        "path": path_clone,
                        "current": walked,
                        "total": 0,
                    }),
                );
            }

            let file_path = entry.path();
            if let Some(ext) = file_path.extension() {
                if ext_set.contains(&ext.to_string_lossy().to_lowercase()) {
                    let name = file_path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();
                    let size = std::fs::metadata(file_path)
                        .map_err(|e| format!("metadata error: {e}"))?
                        .len();
                    entries.push(VideoFileEntry {
                        path: file_path.to_string_lossy().to_string(),
                        name,
                        size,
                    });
                }
            }
        }
        Ok(entries)
    })
    .await
    .map_err(|e| format!("scan task failed: {e}"))??;

    Ok(entries)
}

#[tauri::command]
async fn delete_extra_file(path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let p = std::path::Path::new(&path);
        let file_name = p
            .file_name()
            .ok_or_else(|| "invalid path".to_string())?
            .to_string_lossy()
            .to_string();
        if !file_name.contains("_upscaled") && !file_name.contains("_converted") {
            return Err("not an extra file".to_string());
        }
        let canonical = std::fs::canonicalize(&path).map_err(|e| format!("{e}"))?;
        std::fs::remove_file(&canonical).map_err(|e| format!("{e:#}"))
    })
    .await
    .map_err(|e| format!("delete task failed: {e}"))?
}

#[tauri::command]
async fn scan_extra_files(path: String) -> Result<Vec<VideoFileEntry>, String> {
    let entries = tokio::task::spawn_blocking(move || -> Result<Vec<VideoFileEntry>, String> {
        let mut entries = Vec::new();
        for entry in walkdir::WalkDir::new(&path).follow_links(false) {
            let entry = entry.map_err(|e| format!("walkdir error: {e}"))?;
            if entry.file_type().is_dir() {
                continue;
            }
            let file_path = entry.path();
            let name = file_path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            let lower = name.to_lowercase();
            if !lower.contains("_upscaled") && !lower.contains("_converted") {
                continue;
            }
            let size = std::fs::metadata(file_path)
                .map_err(|e| format!("metadata error: {e}"))?
                .len();
            entries.push(VideoFileEntry {
                path: file_path.to_string_lossy().to_string(),
                name,
                size,
            });
        }
        Ok(entries)
    })
    .await
    .map_err(|e| format!("scan task failed: {e}"))??;
    Ok(entries)
}

#[tauri::command]
fn set_global_speed_limits(
    download_bps: Option<u32>,
    upload_bps: Option<u32>,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<(), String> {
    manager.manager.set_global_limits(
        download_bps.and_then(NonZeroU32::new),
        upload_bps.and_then(NonZeroU32::new),
    );
    Ok(())
}

#[tauri::command]
async fn get_running_torrent_files(
    id: usize,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<Vec<TorrentFileInfo>, String> {
    manager.manager.get_running_torrent_files(id)
}

#[tauri::command]
async fn get_session_config(
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<torrent::SessionConfig, String> {
    Ok(manager.manager.get_session_config())
}

#[tauri::command]
async fn save_session_config(
    config: torrent::SessionConfig,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<(), String> {
    manager.manager.save_session_config(config);
    Ok(())
}

#[tauri::command]
async fn create_torrent_from_folder(
    folder_path: String,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<String, String> {
    manager
        .manager
        .create_torrent_from_folder(folder_path)
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn update_torrent_only_files(
    id: usize,
    only_files: Vec<usize>,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<(), String> {
    manager
        .manager
        .update_torrent_only_files(id, only_files)
        .await
}

#[tauri::command]
async fn set_file_priority(
    id: usize,
    file_indices: Vec<usize>,
    priority: String,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<(), String> {
    let priority_enum = match priority.as_str() {
        "do_not_download" => FilePriority::DoNotDownload,
        "normal" => FilePriority::Normal,
        _ => return Err("Invalid priority. Use: do_not_download, normal".to_string()),
    };
    manager
        .manager
        .set_file_priority(id, file_indices, priority_enum)
        .await
}

#[tauri::command]
async fn redownload_file(
    id: usize,
    file_index: usize,
    info_hash: String,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<usize, String> {
    manager
        .manager
        .redownload_file(id, file_index, info_hash)
        .await
}

#[tauri::command]
async fn start_watching_folders(
    watcher: tauri::State<'_, std::sync::Mutex<fswatcher::FolderWatcher>>,
    app_handle: tauri::AppHandle,
    folders: Vec<String>,
) -> Result<(), String> {
    watcher
        .lock()
        .map_err(|e| format!("lock: {e}"))?
        .start(app_handle, folders)
}

#[tauri::command]
async fn stop_watching_folders(
    watcher: tauri::State<'_, std::sync::Mutex<fswatcher::FolderWatcher>>,
) -> Result<(), String> {
    watcher.lock().map_err(|e| format!("lock: {e}"))?.stop();
    Ok(())
}

#[tauri::command]
async fn set_sequential_download(
    id: usize,
    enabled: bool,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<(), String> {
    manager.manager.set_sequential_download(id, enabled).await
}

#[tauri::command]
async fn recheck_torrent(
    id: usize,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<TorrentCheckResult, String> {
    manager.manager.recheck_torrent(id)
}

#[tauri::command]
async fn set_torrent_limits(
    id: usize,
    limits: TorrentLimits,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<(), String> {
    manager.manager.set_torrent_limits(id, limits).await
}

#[tauri::command]
async fn get_torrent_limits(
    id: usize,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<TorrentLimits, String> {
    Ok(manager.manager.get_torrent_limits(id))
}

async fn persist_file_index(
    app_handle: &tauri::AppHandle,
    indexer: &file_index::FileIndexer,
) -> Result<(), String> {
    let entries = indexer.snapshot().await;
    let unified_entries: Vec<_> = entries
        .into_iter()
        .map(|entry| app_db::UnifiedIndexEntryInput {
            id: format!("local:{}", entry.path),
            kind: "local_file".to_string(),
            scope: "player".to_string(),
            value: entry.name,
            subtitle: Some(entry.path),
            metadata: Some(serde_json::json!({ "size": entry.size })),
        })
        .collect();
    let keep_ids = unified_entries
        .iter()
        .map(|entry| entry.id.clone())
        .collect();
    for batch in unified_entries.chunks(5_000) {
        app_db::upsert_unified_index(app_handle.clone(), batch.to_vec())?;
    }
    app_db::prune_unified_index_scope(app_handle.clone(), "player".into(), keep_ids)?;
    Ok(())
}

#[tauri::command]
async fn rebuild_file_index(
    app_handle: tauri::AppHandle,
    paths: Vec<String>,
    extensions: Vec<String>,
    indexer: tauri::State<'_, file_index::FileIndexer>,
) -> Result<(), String> {
    indexer.rebuild(paths, extensions).await?;
    persist_file_index(&app_handle, &indexer).await
}

#[tauri::command]
async fn refresh_file_index(
    app_handle: tauri::AppHandle,
    paths: Vec<String>,
    extensions: Vec<String>,
    indexer: tauri::State<'_, file_index::FileIndexer>,
) -> Result<(), String> {
    indexer.refresh(paths, extensions).await?;
    persist_file_index(&app_handle, &indexer).await
}

#[tauri::command]
async fn search_file_index(
    query: String,
    extensions: Vec<String>,
    limit: usize,
    indexer: tauri::State<'_, file_index::FileIndexer>,
) -> Result<Vec<FileEntry>, String> {
    Ok(indexer.search(&query, &extensions, limit).await)
}

#[tauri::command]
async fn set_notification_settings(
    config: NotificationConfig,
    state: tauri::State<'_, std::sync::Mutex<NotificationConfig>>,
) -> Result<(), String> {
    let mut c = state.lock().map_err(|e| format!("{e}"))?;
    *c = config;
    drop(c);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("iluhaanime=info,tauri=warn"));
    if let Err(error) = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(false)
        .compact()
        .try_init()
    {
        // A host application may already own the global subscriber. Keep the
        // backend usable, but make the loss of this logger visible in that case.
        eprintln!("unable to initialize tracing subscriber: {error}");
    }
    tracing::info!("starting iluhaAnime backend");

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let _ = std::fs::read_dir(std::env::temp_dir()).map(|entries| {
                for entry in entries.flatten() {
                    let name = entry.file_name();
                    let name = name.to_string_lossy();
                    if name.starts_with("iluha_") {
                        let _ = std::fs::remove_file(entry.path());
                    }
                }
            });

            let _ = video::CACHED_FFMPEG_PATH.get_or_init(|| {
                let app_handle = app.handle();
                video::ffmpeg_exe(app_handle)
            });

            let app_data = app.path().app_data_dir().unwrap_or_else(|e| {
                eprintln!("Failed to get app data dir: {e}");
                std::path::PathBuf::from(".")
            });
            if let Err(error) = app_db::open_database(app.handle()) {
                tracing::error!("unable to initialize shared app database: {error}");
            }
            let handle = app.handle().clone();
            handle.manage(std::sync::Mutex::new(NotificationConfig::default()));
            handle.manage(CancelFlag::new());
            handle.manage(ActiveChildren::new());
            handle.manage(progress::StreamRegistry::new());
            handle.manage(std::sync::Mutex::new(fswatcher::FolderWatcher::new()));
            handle.manage(file_index::FileIndexer::new());

            tauri::async_runtime::block_on(async {
                let manager =
                    match TorrentManager::new(app_data).await {
                        Ok(m) => Arc::new(m),
                        Err(e) => {
                            let _ = handle.emit("show-notification", serde_json::json!({
                            "title": "Критическая ошибка",
                            "body": format!("Не удалось инициализировать торрент-сессию: {e}"),
                            "type": "error",
                        }));
                            return;
                        }
                    };
                manager.start_http_api();
                handle.manage(TorrentBackend {
                    manager: manager.clone(),
                });
                let app_clone = handle.clone();
                let mgr_clone = manager;
                tokio::spawn(async move {
                    let mut prev_states: HashMap<usize, (bool, Option<String>)> = HashMap::new();
                    let mut notified_errors: HashMap<usize, String> = HashMap::new();
                    let mut cleanup_counter: u32 = 0;
                    let mut first_run = true;
                    loop {
                        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                        let torrents = mgr_clone.collect_torrents();
                        let _ = app_clone.emit("torrents-update", &torrents);

                        if first_run {
                            for t in &torrents {
                                prev_states.insert(t.id, (t.finished, t.error.clone()));
                            }
                            first_run = false;
                        } else {
                            let cfg_state =
                                app_clone.state::<std::sync::Mutex<NotificationConfig>>();
                            let cfg = cfg_state
                                .lock()
                                .unwrap_or_else(std::sync::PoisonError::into_inner);

                            for t in &torrents {
                                let prev = prev_states.get(&t.id);
                                let prev_finished = prev.is_some_and(|(f, _)| *f);

                                if cfg.enabled {
                                    if cfg.on_complete
                                        && t.finished
                                        && !prev_finished
                                        && t.total_bytes > 0
                                    {
                                        let _ = app_clone.emit(
                                            "show-notification",
                                            serde_json::json!({
                                                "title": "Загрузка завершена",
                                                "body": &t.name,
                                                "type": "success",
                                                "eventKey": format!(
                                                    "torrent-complete:{}:{}",
                                                    t.id, t.info_hash
                                                ),
                                            }),
                                        );
                                    }

                                    if cfg.on_error {
                                        if let Some(error) = t.error.as_deref() {
                                            let already_notified = notified_errors
                                                .get(&t.id)
                                                .is_some_and(|last| last == error);
                                            if !already_notified {
                                                let msg = format!("{}: {}", t.name, error);
                                                let _ = app_clone.emit(
                                                    "show-notification",
                                                    serde_json::json!({
                                                        "title": "Ошибка загрузки",
                                                        "body": &msg,
                                                        "type": "error",
                                                    }),
                                                );
                                                notified_errors.insert(t.id, error.to_string());
                                            }
                                        }
                                    }
                                }

                                prev_states.insert(t.id, (t.finished, t.error.clone()));
                            }
                        }

                        let current_ids: HashSet<usize> = torrents.iter().map(|t| t.id).collect();
                        prev_states.retain(|id, _| current_ids.contains(id));
                        notified_errors.retain(|id, _| current_ids.contains(id));

                        {
                            let ids: Vec<usize> = mgr_clone
                                .sequential_torrents
                                .iter()
                                .map(|r| *r.key())
                                .collect();
                            for &sid in &ids {
                                let _ = mgr_clone.advance_sequential(sid).await;
                            }
                        }

                        cleanup_counter += 1;
                        if cleanup_counter >= 30 {
                            cleanup_counter = 0;
                            mgr_clone.cleanup_unselected_files();
                        }
                    }
                });
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scrapers::search_erairaws,
            scrapers::search_nyaa,
            scrapers::search_sukebei,
            scrapers::search_rutracker,
            scrapers::search_nekobt,
            scrapers::get_torrent_details,
            scrapers::fetch_torrent_bytes,
            auth::rutracker_login,
            auth::rutracker_set_cookies,
            auth::rutracker_webview_login,
            auth::rutracker_finish_webview_login,
            auth::check_rutracker_session,
            auth::rutracker_logout,
            auth::rutracker_get_torrent_bytes,
            auth::rutracker_get_magnet,
            auth::erai_webview_login,
            auth::erai_finish_webview_login,
            auth::erai_open_page,
            auth::check_erai_session,
            auth::erai_logout,
            auth::nekobt_set_api_key,
            auth::check_nekobt_session,
            auth::nekobt_logout,
            video::upscale_video,
            video::convert_video,
            video::cancel_upscale,
            video::get_media_keyframe,
            video::get_media_timeline_sprite,
            video::check_gpu_encoders,
            shaders::list_anime4k_shaders,
            shaders::default_anime4k_shaders,
            shaders::estimate_anime4k_time,
            ffmpeg::check_ffprobe,
            ffmpeg::check_libplacebo,
            ffmpeg::download_ffmpeg,
            ffmpeg::remove_ffmpeg,
            anilist::search_anilist,
            anilist::search_anilist_by_studio,
            anilist::get_profile_recommendations,
            anilist::search_anilist_by_tag,
            anilist::search_anilist_by_genre,
            anilist::get_anime_by_id,
            anilist::get_anilist_profile,
            anilist::anilist_login,
            anilist::check_anilist_auth,
            anilist::get_anilist_lists,
            anilist::anilist_logout,
            anilist::save_anilist_entry,
            anilist::toggle_favourite,
            anilist::get_favourites,
            anilist::get_anime_characters,
            anilist::get_character_media,
            anilist::get_staff_characters,
            anilist::get_anilist_activity,
            anilist::get_anime_franchise,
            anilist::prefetch_anime_relations,
            anilist::cancel_anime_prefetch,
            anilist::sync_franchise_to_index,
            user_assets::import_user_image,
            user_assets::list_user_images,
            user_assets::get_user_image,
            user_assets::delete_user_image,
            app_db::get_app_cache,
            app_db::put_app_cache,
            app_db::delete_app_cache,
            app_db::clear_app_cache,
            app_db::check_app_database_integrity,
            app_db::upsert_unified_index,
            app_db::record_unified_index_action,
            app_db::search_unified_index,
            app_db::save_vault_media_records,
            app_db::get_vault_media_records,
            reset_sqlite_data,
            list_sqlite_databases,
            get_sqlite_tables,
            get_sqlite_rows,
            delete_sqlite_row,
            delete_sqlite_rows,
            write_sqlite_export,
            update_sqlite_cell,
            get_sqlite_cell,
            get_sqlite_cell_blob,
            run_sqlite_query,
            start_torrent_download,
            get_torrent_info,
            list_torrents,
            pause_torrent,
            resume_torrent,
            remove_torrent,
            scan_video_folder,
            apply_vault_organization,
            scan_extra_files,
            delete_extra_file,
            start_watching_folders,
            stop_watching_folders,
            set_global_speed_limits,
            get_running_torrent_files,
            get_session_config,
            save_session_config,
            create_torrent_from_folder,
            update_torrent_only_files,
            set_file_priority,
            redownload_file,
            set_sequential_download,
            recheck_torrent,
            set_torrent_limits,
            get_torrent_limits,
            get_torrent_info_from_file,
            start_torrent_download_from_file,
            read_file_bytes,
            get_file_size,
            rebuild_file_index,
            refresh_file_index,
            set_notification_settings,
            search_file_index,
            ipc::get_backend_capabilities,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                tracing::info!("shutting down iluhaAnime backend");
                let cancel = app_handle.state::<CancelFlag>();
                cancel.cancel();
                let children = app_handle.state::<ActiveChildren>();
                children.kill_all();
            }
        });
}

#[cfg(test)]
mod sqlite_browser_tests {
    use super::*;

    #[test]
    fn database_and_table_allowlist_is_narrow() {
        assert!(sqlite_database_spec("franchise").is_some());
        assert!(sqlite_database_spec("user_assets").is_some());
        assert!(sqlite_database_spec("app_data").is_some());
        assert!(sqlite_database_spec("other").is_none());
        assert!(allowed_sqlite_table("franchise", "franchise_nodes"));
        assert!(allowed_sqlite_table("user_assets", "user_images"));
        assert!(allowed_sqlite_table("app_data", "cache_entries"));
        assert!(!allowed_sqlite_table("franchise", "sqlite_master"));
        assert!(!allowed_sqlite_table("user_assets", "franchise_nodes"));
        assert!(!allowed_sqlite_table("app_data", "sqlite_master"));
    }

    #[test]
    fn identifiers_reject_sql_fragments() {
        assert_eq!(
            quote_sqlite_identifier("user_images").unwrap(),
            "\"user_images\""
        );
        assert!(quote_sqlite_identifier("user_images; DROP TABLE user_images").is_err());
        assert!(quote_sqlite_identifier("user images").is_err());
        assert!(quote_sqlite_identifier("").is_err());
    }

    #[test]
    fn composite_primary_key_delete_requires_all_parts() {
        // cache_entries has a composite PK (namespace, cache_key). Deleting by
        // only the first column would remove every row in that namespace.
        let connection = Connection::open_in_memory().expect("open memory db");
        connection
            .execute_batch(
                "CREATE TABLE cache_entries (
                    namespace TEXT NOT NULL,
                    cache_key TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    PRIMARY KEY (namespace, cache_key)
                );
                INSERT INTO cache_entries VALUES ('ns', 'a', '{}');
                INSERT INTO cache_entries VALUES ('ns', 'b', '{}');
                INSERT INTO cache_entries VALUES ('other', 'a', '{}');",
            )
            .expect("seed");

        let columns = sqlite_columns(&connection, "cache_entries").expect("columns");
        let primary_keys = columns
            .iter()
            .filter(|column| column.primary_key)
            .map(|column| column.name.as_str())
            .collect::<Vec<_>>();
        assert_eq!(primary_keys, vec!["namespace", "cache_key"]);

        let delete_one = |namespace: &str, cache_key: &str| {
            let where_clause = primary_keys
                .iter()
                .zip([namespace, cache_key])
                .enumerate()
                .map(|(index, (column, _value))| format!("\"{column}\" = ?{}", index + 1))
                .collect::<Vec<_>>()
                .join(" AND ");
            connection
                .execute(
                    &format!("DELETE FROM \"cache_entries\" WHERE {where_clause}"),
                    rusqlite::params![namespace, cache_key],
                )
                .expect("delete")
        };

        // Only the targeted composite row is removed, not the whole namespace.
        assert_eq!(delete_one("ns", "a"), 1);
        let remaining = connection
            .query_row("SELECT COUNT(*) FROM cache_entries", [], |row| {
                row.get::<_, i64>(0)
            })
            .expect("count");
        assert_eq!(remaining, 2);
    }

    #[test]
    fn blob_cells_are_redacted_to_size_markers() {
        assert_eq!(
            sqlite_value_to_json(ValueRef::Null),
            serde_json::Value::Null
        );
        assert_eq!(
            sqlite_value_to_json(ValueRef::Blob(&[1, 2, 3])),
            serde_json::json!("[BLOB: 3 bytes]")
        );
        assert_eq!(
            sqlite_value_to_json(ValueRef::Text(b"hello")),
            serde_json::json!("hello")
        );
    }

    #[test]
    fn filter_parser_handles_operators_and_values() {
        let groups = parse_sqlite_filter(r#"title ~ "naruto""#).expect("parse");
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].len(), 1);
        let condition = &groups[0][0];
        assert_eq!(condition.column, "title");
        assert!(matches!(condition.operator, SqliteFilterOperator::Contains));
        assert!(matches!(&condition.value, SqliteFilterValue::Text(value) if value == "naruto"));

        let groups = parse_sqlite_filter(r#"id >= 5 && status = "completed" || title $ "II""#)
            .expect("parse");
        assert_eq!(groups.len(), 2);
        assert_eq!(groups[0].len(), 2);
        assert_eq!(groups[1].len(), 1);
        assert!(matches!(&groups[0][0].value, SqliteFilterValue::Integer(5)));
        assert!(matches!(&groups[0][1].operator, SqliteFilterOperator::Eq));
        assert!(matches!(
            &groups[1][0].operator,
            SqliteFilterOperator::EndsWith
        ));
    }

    #[test]
    fn filter_value_parsing_covers_types() {
        assert!(matches!(
            parse_sqlite_filter_value("null"),
            SqliteFilterValue::Null
        ));
        assert!(matches!(
            parse_sqlite_filter_value("true"),
            SqliteFilterValue::Bool(true)
        ));
        assert!(matches!(
            parse_sqlite_filter_value("-42"),
            SqliteFilterValue::Integer(-42)
        ));
        assert!(matches!(
            parse_sqlite_filter_value("3.5"),
            SqliteFilterValue::Real(value) if value == 3.5
        ));
        assert!(matches!(
            parse_sqlite_filter_value(r#""a ""quoted"" word""#),
            SqliteFilterValue::Text(value) if value == r#"a "quoted" word"#
        ));
        assert!(matches!(
            parse_sqlite_filter_value("plain text"),
            SqliteFilterValue::Text(value) if value == "plain text"
        ));
    }

    #[test]
    fn filter_expression_detection_and_errors() {
        assert!(sqlite_filter_has_operator(r#"title = "x""#));
        assert!(sqlite_filter_has_operator("rating >= 8"));
        assert!(!sqlite_filter_has_operator("plain text"));
        assert!(parse_sqlite_filter("").is_err());
        assert!(parse_sqlite_filter("title =").is_err());
        assert!(parse_sqlite_filter("title").is_err());
        assert!(parse_sqlite_filter("&& title = \"x\"").is_err());
    }

    #[test]
    fn filter_builds_parameterized_sql_and_whitelists_columns() {
        let columns = vec![
            SqliteColumnInfo {
                name: "title".to_string(),
                data_type: "TEXT".to_string(),
                not_null: false,
                primary_key: false,
            },
            SqliteColumnInfo {
                name: "rating".to_string(),
                data_type: "REAL".to_string(),
                not_null: false,
                primary_key: false,
            },
        ];
        let groups =
            parse_sqlite_filter(r#"title ~ "bor" && rating > 7 || title = null"#).expect("parse");
        let (sql, params) = build_sqlite_filter_where(&groups, &columns).expect("build");
        assert_eq!(params.len(), 2);
        assert!(sql.contains("CAST(\"title\" AS TEXT) LIKE ?"));
        assert!(sql.contains("\"rating\" > ?"));
        assert!(sql.contains("\"title\" IS NULL"));
        assert!(sql.contains("OR"));
        assert!(sql.contains("AND"));

        let invalid = parse_sqlite_filter(r#"unknown_col = "x""#).expect("parse");
        assert!(
            build_sqlite_filter_where(&invalid, &columns).is_err(),
            "unknown column must be rejected"
        );
    }
}
