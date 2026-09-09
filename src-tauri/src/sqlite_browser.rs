use rusqlite::{
    types::{Value, ValueRef},
    Connection, OptionalExtension,
};

use base64::Engine as _;

use std::collections::HashSet;
use tauri::Manager;

use crate::{anilist, app_db, auth, user_assets};

const MAX_SQLITE_CELL_TEXT_BYTES: usize = 16 * 1024;
const MAX_SQLITE_SEARCH_CHARS: usize = 200;
const MAX_SQLITE_QUERY_ROWS: usize = 1_000;

#[tauri::command]
pub async fn reset_sqlite_data(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?;
    let mut removed = Vec::new();
    let databases = [
        (
            "AniList franchise cache",
            app_dir.join("franchise_relations_cache.sqlite3"),
        ),
        ("Uploaded user images", app_dir.join("user_assets.sqlite3")),
    ];
    for account in [
        "anilist.access_token",
        "rutracker.cookies",
        "rutracker.user_agent",
        "nekobt.api_key",
        "erai-raws.cookies",
    ] {
        auth::delete_secret(account);
    }
    removed.push("Tracker credentials".to_string());
    for file in [
        "anilist_token.txt",
        "rutracker_cookies.json",
        "nekobt_key.json",
        "torrent_limits.json",
        "session_config.json",
    ] {
        match std::fs::remove_file(app_dir.join(file)) {
            Ok(()) => removed.push(file.to_string()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("remove {file}: {error}")),
        }
    }
    match std::fs::remove_dir_all(app_dir.join("session")) {
        Ok(()) => removed.push("session".to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(format!("remove session dir: {error}")),
    }
    match std::fs::remove_dir_all(app_dir.join("images")) {
        Ok(()) => removed.push("Stored image files".to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(format!("remove images dir: {error}")),
    }
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
pub struct SqliteDatabaseInfo {
    id: String,
    label: String,
    file_name: String,
    available: bool,
    size_bytes: u64,
    tables: Vec<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SqliteColumnInfo {
    name: String,
    data_type: String,
    not_null: bool,
    primary_key: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SqliteTableInfo {
    name: String,
    row_count: u64,
    columns: Vec<SqliteColumnInfo>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SqliteRowsPage {
    database: String,
    table: String,
    columns: Vec<String>,
    rows: Vec<Vec<serde_json::Value>>,
    total: u64,
    page: u32,
    page_size: u32,
}

fn sqlite_database_spec(database: &str) -> Option<(&'static str, &'static str)> {
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

fn sqlite_database_path(
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

fn open_sqlite_browser_database_read_only(
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
            | ("user_assets", "user_images" | "dither_images")
            | (
                "app_data",
                "cache_entries" | "unified_index" | "collection_items"
            )
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
pub async fn list_sqlite_databases(
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
pub async fn get_sqlite_tables(
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
            Self::Bool(value) => Value::Integer(i64::from(*value)),
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
    if first == last && matches!(first, Some('"' | '\'')) {
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
pub async fn get_sqlite_rows(
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
        let offset = u64::from(page - 1) * u64::from(page_size);
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
                    .map_or(column_names.first().map_or("rowid", String::as_str), |column| column.name.as_str()),
            )?,
        };
        let order_direction = match order_direction.as_deref() {
            Some("desc" | "DESC") => "DESC",
            _ => "ASC",
        };
        let mut all_params = where_params;
        all_params.push(Value::Integer(i64::from(page_size)));
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
pub async fn delete_sqlite_row(
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
        let params = keys
            .iter()
            .map(std::string::String::as_str)
            .collect::<Vec<_>>();
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
pub async fn delete_sqlite_rows(
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
            let params = row_keys
                .iter()
                .map(std::string::String::as_str)
                .collect::<Vec<_>>();
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
pub async fn write_sqlite_export(path: String, content: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        std::fs::write(&path, content).map_err(|error| format!("write export: {error}"))
    })
    .await
    .map_err(|error| format!("SQLite export task failed: {error}"))?
    .map_err(|error| format!("SQLite export: {error}"))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SqliteBackupInfo {
    name: String,
    size_bytes: u64,
    modified_ms: i64,
}

fn sqlite_backup_stamp(now_secs: u64) -> String {
    let days = (now_secs / 86_400) as i64;
    let clock = now_secs % 86_400;
    let shifted = days + 719_468;
    let era = if shifted >= 0 {
        shifted
    } else {
        shifted - 146_096
    } / 146_097;
    let day_of_era = (shifted - era * 146_097).cast_unsigned();
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era as i64 + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_part = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_part + 2) / 5 + 1;
    let month = if month_part < 10 {
        month_part + 3
    } else {
        month_part - 9
    };
    let full_year = if month <= 2 { year + 1 } else { year };
    format!(
        "{full_year:04}{month:02}{day:02}-{:02}{:02}{:02}",
        clock / 3600,
        (clock % 3600) / 60,
        clock % 60
    )
}

fn is_safe_backup_name(name: &str, stem: &str) -> bool {
    let Some(rest) = name.strip_prefix(stem) else {
        return false;
    };
    let Some(rest) = rest.strip_prefix('-') else {
        return false;
    };
    let Some(stamp) = rest.strip_suffix(".bak") else {
        return false;
    };
    stamp.len() == 15
        && stamp.bytes().enumerate().all(|(index, byte)| {
            if index == 8 {
                byte == b'-'
            } else {
                byte.is_ascii_digit()
            }
        })
}

fn sqlite_file_modified_ms(path: &std::path::Path) -> i64 {
    std::fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|age| age.as_millis().min(i64::MAX as u128) as i64)
        .unwrap_or_default()
}

fn sqlite_backup_info(dir: &std::path::Path, name: &str) -> Result<SqliteBackupInfo, String> {
    let path = dir.join(name);
    let size_bytes = std::fs::metadata(&path)
        .map_err(|error| format!("backup metadata: {error}"))?
        .len();
    Ok(SqliteBackupInfo {
        name: name.to_string(),
        size_bytes,
        modified_ms: sqlite_file_modified_ms(&path),
    })
}

fn checkpoint_sqlite_file(path: &std::path::Path) -> Result<(), String> {
    let connection = Connection::open(path).map_err(|error| format!("open database: {error}"))?;
    connection
        .busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|error| format!("busy timeout: {error}"))?;
    connection
        .pragma_update(None, "wal_checkpoint", "TRUNCATE")
        .map_err(|error| format!("checkpoint: {error}"))?;
    Ok(())
}

fn copy_sqlite_backup(
    app_handle: &tauri::AppHandle,
    database: &str,
    keep: usize,
) -> Result<SqliteBackupInfo, String> {
    let path = sqlite_database_path(app_handle, database)?;
    if !path.is_file() {
        return Err("SQLite database does not exist yet".to_string());
    }
    checkpoint_sqlite_file(&path)?;
    let dir = path
        .parent()
        .ok_or_else(|| "Database has no parent directory".to_string())?;
    let stem = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .ok_or_else(|| "Database file name is not readable".to_string())?;
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| format!("clock: {error}"))?
        .as_secs();
    let name = format!("{stem}-{}.bak", sqlite_backup_stamp(now_secs));
    std::fs::copy(&path, dir.join(&name)).map_err(|error| format!("copy backup: {error}"))?;
    prune_sqlite_backups(dir, stem, keep);
    sqlite_backup_info(dir, &name)
}

fn prune_sqlite_backups(dir: &std::path::Path, stem: &str, keep: usize) {
    let mut names: Vec<String> = std::fs::read_dir(dir)
        .ok()
        .map(|entries| {
            entries
                .filter_map(Result::ok)
                .filter_map(|entry| entry.file_name().into_string().ok())
                .filter(|name| is_safe_backup_name(name, stem))
                .collect()
        })
        .unwrap_or_default();
    names.sort();
    names.reverse();
    for stale in names.into_iter().skip(keep.max(1)) {
        let _ = std::fs::remove_file(dir.join(stale));
    }
}

#[tauri::command]
pub async fn backup_sqlite_database(
    app_handle: tauri::AppHandle,
    database: String,
    keep: u32,
) -> Result<SqliteBackupInfo, String> {
    tokio::task::spawn_blocking(move || {
        copy_sqlite_backup(&app_handle, &database, keep.clamp(1, 20) as usize)
    })
    .await
    .map_err(|error| format!("SQLite backup task failed: {error}"))?
    .map_err(|error| format!("SQLite backup: {error}"))
}

#[tauri::command]
pub async fn list_sqlite_backups(
    app_handle: tauri::AppHandle,
    database: String,
) -> Result<Vec<SqliteBackupInfo>, String> {
    tokio::task::spawn_blocking(move || {
        let path = sqlite_database_path(&app_handle, &database)?;
        let dir = path
            .parent()
            .ok_or_else(|| "Database has no parent directory".to_string())?;
        let stem = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .ok_or_else(|| "Database file name is not readable".to_string())?;
        let mut names: Vec<String> = std::fs::read_dir(dir)
            .map_err(|error| format!("read database dir: {error}"))?
            .filter_map(Result::ok)
            .filter_map(|entry| entry.file_name().into_string().ok())
            .filter(|name| is_safe_backup_name(name, stem))
            .collect();
        names.sort();
        names.reverse();
        names
            .iter()
            .map(|name| sqlite_backup_info(dir, name))
            .collect::<Result<Vec<_>, _>>()
    })
    .await
    .map_err(|error| format!("SQLite backup list task failed: {error}"))?
    .map_err(|error| format!("SQLite backup list: {error}"))
}

#[tauri::command]
pub async fn restore_sqlite_backup(
    app_handle: tauri::AppHandle,
    database: String,
    name: String,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let path = sqlite_database_path(&app_handle, &database)?;
        let dir = path
            .parent()
            .ok_or_else(|| "Database has no parent directory".to_string())?;
        let stem = path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .ok_or_else(|| "Database file name is not readable".to_string())?;
        if !is_safe_backup_name(&name, stem) {
            return Err("Unknown backup file".to_string());
        }
        let source = dir.join(&name);
        if !source.is_file() {
            return Err("Backup file no longer exists".to_string());
        }
        copy_sqlite_backup(&app_handle, &database, 10)?;
        std::fs::copy(&source, &path).map_err(|error| format!("restore backup: {error}"))?;
        if database == "franchise" {
            anilist::clear_franchise_cache_memory();
        }
        Ok(())
    })
    .await
    .map_err(|error| format!("SQLite restore task failed: {error}"))?
    .map_err(|error| format!("SQLite restore: {error}"))
}

#[tauri::command]
pub async fn vacuum_sqlite_database(
    app_handle: tauri::AppHandle,
    database: String,
) -> Result<SqliteBackupInfo, String> {
    tokio::task::spawn_blocking(move || -> Result<SqliteBackupInfo, String> {
        let safety = copy_sqlite_backup(&app_handle, &database, 10)?;
        let connection = open_sqlite_browser_database(&app_handle, &database)?;
        connection
            .execute_batch("VACUUM;")
            .map_err(|error| format!("vacuum: {error}"))?;
        Ok(safety)
    })
    .await
    .map_err(|error| format!("SQLite vacuum task failed: {error}"))?
    .map_err(|error| format!("SQLite vacuum: {error}"))
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
pub async fn update_sqlite_cell(
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
pub async fn run_sqlite_query(
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
        if !matches!(first_keyword.as_deref(), Some("SELECT" | "EXPLAIN")) {
            return Err("Only SELECT and EXPLAIN queries are allowed".to_string());
        }
        let connection = open_sqlite_browser_database_read_only(&app_handle, &database)?;
        let mut statement = connection
            .prepare(trimmed)
            .map_err(|error| format!("query prepare: {error}"))?;
        let column_names = statement
            .column_names()
            .iter()
            .map(std::string::ToString::to_string)
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
pub async fn get_sqlite_cell(
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
        let params = keys
            .iter()
            .map(std::string::String::as_str)
            .collect::<Vec<_>>();
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
pub async fn get_sqlite_cell_blob(
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
        let params = keys
            .iter()
            .map(std::string::String::as_str)
            .collect::<Vec<_>>();
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
        assert!(allowed_sqlite_table("user_assets", "dither_images"));
        assert!(allowed_sqlite_table("app_data", "cache_entries"));
        assert!(allowed_sqlite_table("app_data", "collection_items"));
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
    fn backup_stamp_formats_utc_date() {
        assert_eq!(sqlite_backup_stamp(1_788_568_200), "20260905-003000");
        assert_eq!(sqlite_backup_stamp(0), "19700101-000000");
    }

    #[test]
    fn backup_names_accept_only_own_stamps() {
        assert!(is_safe_backup_name(
            "app_data-20260905-003000.bak",
            "app_data"
        ));
        assert!(!is_safe_backup_name("app_data.sqlite3.bak", "app_data"));
        assert!(!is_safe_backup_name(
            "app_data-20260905-003000.bak",
            "franchise"
        ));
        assert!(!is_safe_backup_name(
            "../app_data-20260905-003000.bak",
            "app_data"
        ));
        assert!(!is_safe_backup_name(
            "app_data-20260905-003000.sqlite3",
            "app_data"
        ));
        assert!(!is_safe_backup_name("app_data-2026-09-05.bak", "app_data"));
    }

    #[test]
    fn composite_primary_key_delete_requires_all_parts() {
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
