use rusqlite::{params, Transaction};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use unicode_normalization::UnicodeNormalization;

use super::db::{now_seconds, open_database};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnifiedIndexEntryInput {
    pub id: String,
    pub kind: String,
    pub scope: String,
    pub value: String,
    pub subtitle: Option<String>,
    pub metadata: Option<serde_json::Value>,
    #[serde(default)]
    pub bump_use: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningStatRow {
    pub id: String,
    pub kind: String,
    pub scope: String,
    pub value: String,
    pub use_count: i64,
    pub selected_count: i64,
    pub ignored_count: i64,
    pub last_used_at: i64,
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
pub fn normalize_index_text(value: &str) -> String {
    let nfkd: String = value.nfkd().collect();
    let without_marks: String = nfkd
        .chars()
        .filter(|c| {
            let code = *c as u32;
            !(0x0300..=0x036F).contains(&code)
                && !(0x1AB0..=0x1AFF).contains(&code)
                && !(0x1DC0..=0x1DFF).contains(&code)
                && !(0x20D0..=0x20FF).contains(&code)
                && !(0xFE20..=0xFE2F).contains(&code)
        })
        .collect();
    let lower = without_marks.to_lowercase();
    let mut normalized = String::with_capacity(lower.len());
    let mut prev_was_space = true;
    for ch in lower.chars() {
        if ch.is_alphanumeric() {
            normalized.push(ch);
            prev_was_space = false;
        } else if !prev_was_space {
            normalized.push(' ');
            prev_was_space = true;
        }
    }
    let trimmed = normalized.trim();
    trimmed.chars().take(200).collect()
}
pub fn build_fts_match_query(normalized: &str) -> String {
    let tokens: Vec<&str> = normalized.split_whitespace().collect();
    let mut out = String::with_capacity(normalized.len() + 16);
    for (index, token) in tokens.iter().enumerate() {
        if token.chars().count() < 3 {
            continue;
        }
        if !out.is_empty() {
            out.push_str(" AND ");
        }
        out.push('"');
        out.push_str(&token.replace('"', "\"\""));
        out.push('"');
        if index + 1 == tokens.len() {
            out.push('*');
        }
    }
    out
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
    let _write = super::db::lock_app_data_write_timeout(super::db::APP_DATA_WRITE_TIMEOUT)?;
    let connection = open_database(&app)?;
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| format!("unified index transaction: {error}"))?;
    let count = upsert_unified_index_batch(&transaction, &entries, now_seconds())?;
    transaction
        .commit()
        .map_err(|error| format!("unified index commit: {error}"))?;
    Ok(count)
}

pub(crate) fn upsert_unified_index_batch(
    transaction: &Transaction,
    entries: &[UnifiedIndexEntryInput],
    now: i64,
) -> Result<usize, String> {
    {
        let mut statement = transaction
            .prepare(
                "INSERT INTO unified_index
                    (id, kind, scope, value, normalized_value, subtitle, metadata_json,
                     updated_at, use_count, last_used_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9,
                    CASE WHEN ?9 > 0 THEN ?8 ELSE 0 END)
                 ON CONFLICT(id) DO UPDATE SET
                    kind = excluded.kind,
                    scope = excluded.scope,
                    value = excluded.value,
                    normalized_value = excluded.normalized_value,
                    subtitle = excluded.subtitle,
                    metadata_json = excluded.metadata_json,
                    updated_at = excluded.updated_at,
                    use_count = unified_index.use_count + ?9,
                    last_used_at = CASE WHEN ?9 > 0 THEN ?8 ELSE unified_index.last_used_at END",
            )
            .map_err(|error| format!("prepare unified index upsert: {error}"))?;
        for entry in entries {
            let metadata = validate_unified_index_entry(entry)?;
            let normalized = normalize_index_text(&entry.value);
            statement
                .execute(params![
                    entry.id,
                    entry.kind,
                    entry.scope,
                    entry.value,
                    normalized,
                    entry.subtitle,
                    metadata,
                    now,
                    i64::from(entry.bump_use)
                ])
                .map_err(|error| format!("upsert unified index: {error}"))?;
        }
    }
    Ok(entries.len())
}

#[allow(non_snake_case)]
#[tauri::command]
pub fn prune_unified_index_scope(
    app: tauri::AppHandle,
    scope: String,
    keep_ids: Option<Vec<String>>,
    keepIds: Option<Vec<String>>,
) -> Result<usize, String> {
    let keep_ids = keep_ids.or(keepIds).unwrap_or_default();
    if scope.is_empty() || scope.len() > 64 || keep_ids.len() > 50_000 {
        return Err("Unified index scope or keep list is invalid".into());
    }
    let _write = super::db::lock_app_data_write_timeout(super::db::APP_DATA_WRITE_TIMEOUT)?;
    let connection = open_database(&app)?;
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| format!("prune unified index transaction: {error}"))?;
    let keep_set: HashSet<&str> = keep_ids.iter().map(String::as_str).collect();
    let removed = prune_unified_index_scope_inner(&transaction, &scope, &keep_set)?;
    transaction
        .commit()
        .map_err(|error| format!("prune unified index commit: {error}"))?;
    Ok(removed)
}

pub(crate) fn prune_unified_index_scope_inner(
    transaction: &Transaction,
    scope: &str,
    keep_ids: &HashSet<&str>,
) -> Result<usize, String> {
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
    {
        let mut delete = transaction
            .prepare("DELETE FROM unified_index WHERE scope = ?1 AND id = ?2")
            .map_err(|error| format!("prepare stale unified index delete: {error}"))?;
        for id in stale_ids {
            if keep_ids.contains(id.as_str()) {
                continue;
            }
            removed += delete
                .execute(params![scope, id])
                .map_err(|error| format!("delete stale unified index entry: {error}"))?;
        }
    }
    Ok(removed)
}

pub(crate) fn delete_unified_index_ids_inner(
    transaction: &Transaction,
    ids: &[String],
) -> Result<usize, String> {
    if ids.is_empty() {
        return Ok(0);
    }
    let mut removed = 0usize;
    {
        let mut delete = transaction
            .prepare("DELETE FROM unified_index WHERE id = ?1")
            .map_err(|error| format!("prepare unified index id delete: {error}"))?;
        for id in ids {
            removed += delete
                .execute(params![id])
                .map_err(|error| format!("delete unified index id: {error}"))?;
        }
    }
    Ok(removed)
}

#[tauri::command]
pub fn clear_unified_index_scope(app: tauri::AppHandle, scope: String) -> Result<usize, String> {
    if scope.is_empty() || scope.len() > 64 {
        return Err("Unified index scope is invalid".into());
    }
    let _write = super::db::lock_app_data_write_timeout(super::db::APP_DATA_WRITE_TIMEOUT)?;
    let connection = open_database(&app)?;
    let deleted = connection
        .execute("DELETE FROM unified_index WHERE scope = ?1", params![scope])
        .map_err(|error| format!("clear unified index scope: {error}"))?;
    Ok(deleted)
}

#[tauri::command]
pub fn delete_unified_index_entry(app: tauri::AppHandle, id: String) -> Result<usize, String> {
    if id.is_empty() || id.len() > 512 {
        return Err("Unified index id is invalid".into());
    }
    let _write = super::db::lock_app_data_write_timeout(super::db::APP_DATA_WRITE_TIMEOUT)?;
    let connection = open_database(&app)?;
    let deleted = connection
        .execute("DELETE FROM unified_index WHERE id = ?1", params![id])
        .map_err(|error| format!("delete unified index entry: {error}"))?;
    Ok(deleted)
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
    let column = action_column(&action)?;
    let _write = super::db::lock_app_data_write_timeout(super::db::APP_DATA_WRITE_TIMEOUT)?;
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

fn action_column(action: &str) -> Result<&'static str, String> {
    match action {
        "use" => Ok("use_count"),
        "select" => Ok("selected_count"),
        "ignore" => Ok("ignored_count"),
        _ => Err("Unknown unified index action".into()),
    }
}

/// Records feedback for every entry whose normalized value matches. History
/// entries stay scope-isolated (they belong to a single search surface);
/// anime and local entries are shared across scopes.
pub(crate) fn record_value_action_inner(
    connection: &rusqlite::Connection,
    normalized: &str,
    scope: Option<&str>,
    column: &str,
    now: i64,
) -> Result<usize, String> {
    connection
        .execute(
            &format!(
                "UPDATE unified_index
                 SET {column} = {column} + 1, last_used_at = ?1, updated_at = ?1
                 WHERE normalized_value = ?2
                   AND (?3 IS NULL OR kind <> 'history' OR scope = ?3)"
            ),
            params![now, normalized, scope],
        )
        .map_err(|error| format!("record unified index value action: {error}"))
}

#[tauri::command]
pub fn record_unified_index_value_action(
    app: tauri::AppHandle,
    value: String,
    action: String,
    scope: Option<String>,
) -> Result<usize, String> {
    if value.chars().count() > 512 {
        return Err("Unified index value is invalid".into());
    }
    let column = action_column(&action)?;
    let normalized = normalize_index_text(&value);
    if normalized.is_empty() {
        return Ok(0);
    }
    let _write = super::db::lock_app_data_write_timeout(super::db::APP_DATA_WRITE_TIMEOUT)?;
    let connection = open_database(&app)?;
    record_value_action_inner(
        &connection,
        &normalized,
        scope.as_deref(),
        column,
        now_seconds(),
    )
}

pub(crate) fn list_learning_stats_inner(
    connection: &rusqlite::Connection,
    cutoff: i64,
) -> Result<Vec<LearningStatRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, kind, scope, normalized_value, use_count, selected_count,
                    ignored_count, last_used_at
             FROM unified_index
             WHERE (use_count + selected_count + ignored_count) > 0
               AND last_used_at >= ?1
             ORDER BY last_used_at DESC, id
             LIMIT 50000",
        )
        .map_err(|error| format!("prepare learning stats: {error}"))?;
    let rows = statement
        .query_map(params![cutoff], |row| {
            Ok(LearningStatRow {
                id: row.get(0)?,
                kind: row.get(1)?,
                scope: row.get(2)?,
                value: row.get(3)?,
                use_count: row.get(4)?,
                selected_count: row.get(5)?,
                ignored_count: row.get(6)?,
                last_used_at: row.get(7)?,
            })
        })
        .map_err(|error| format!("read learning stats: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("collect learning stats: {error}"))
}

#[tauri::command]
pub fn list_learning_stats(
    app: tauri::AppHandle,
    ttl_days: Option<i64>,
) -> Result<Vec<LearningStatRow>, String> {
    let days = ttl_days.unwrap_or(90).clamp(1, 3650);
    let cutoff = now_seconds() - days * 86_400;
    let connection = open_database(&app)?;
    list_learning_stats_inner(&connection, cutoff)
}

#[tauri::command]
pub fn search_unified_index(
    app: tauri::AppHandle,
    query: String,
    scope: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<UnifiedIndexEntry>, String> {
    let limit = limit.unwrap_or(20).clamp(1, 100);
    let connection = open_database(&app)?;
    search_unified_index_inner(&connection, &query, scope.as_deref(), limit)
}

pub(crate) fn search_unified_index_inner(
    connection: &rusqlite::Connection,
    query: &str,
    scope: Option<&str>,
    limit: u32,
) -> Result<Vec<UnifiedIndexEntry>, String> {
    let normalized = normalize_index_text(query);
    if normalized.is_empty() {
        return Ok(Vec::new());
    }
    let limit = limit.clamp(1, 100);
    let prefix = format!("{normalized}%");

    // Recall only: exact/prefix tiers first, then BM25. Feedback weights are
    // applied in `src/lib/ranking` so one model owns the final order.
    let match_query = build_fts_match_query(&normalized);
    if normalized.chars().count() >= 3 && !match_query.is_empty() {
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
               ui.value COLLATE NOCASE
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
               value COLLATE NOCASE
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
pub fn optimize_unified_index(app: tauri::AppHandle) -> Result<(), String> {
    let _write = super::db::lock_app_data_write_timeout(super::db::APP_DATA_WRITE_TIMEOUT)?;
    let connection = open_database(&app)?;
    connection
        .execute(
            "INSERT INTO unified_index_fts(unified_index_fts) VALUES('optimize')",
            [],
        )
        .map_err(|error| format!("optimize unified index: {error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::super::schema::initialize_schema;
    use super::*;
    use rusqlite::{params, Connection};

    fn path_is_in_scope(path: &str, scopes: &[String]) -> bool {
        let path = std::path::Path::new(path);
        scopes
            .iter()
            .map(std::path::Path::new)
            .any(|scope| path.starts_with(scope))
    }
    #[test]
    fn unified_index_normalizes_and_orders_entries() {
        assert_eq!(normalize_index_text("  Frieren   S02  "), "frieren s02");
        assert_eq!(normalize_index_text("ЖЁсткий  Тест"), "жесткии тест");
        assert_eq!(normalize_index_text(&"a".repeat(300)).chars().count(), 200);
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
            "\"sa\u{00f8}\" AND \"\"\"x\"\"\""
        );
    }

    #[test]
    fn fts_match_query_drops_sub_trigram_tokens() {
        assert_eq!(
            build_fts_match_query("tonari no totoro"),
            "\"tonari\" AND \"totoro\"*"
        );
        assert_eq!(build_fts_match_query("no"), "");
    }

    #[test]
    fn fts_match_query_prefixes_last_token() {
        assert_eq!(build_fts_match_query("frie"), "\"frie\"*");
        assert_eq!(build_fts_match_query("frieren"), "\"frieren\"*");
    }

    #[test]
    fn unified_index_fts_finds_x_no_y_titles() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema migration");
        connection
            .execute(
                "INSERT INTO unified_index
                    (id, kind, scope, value, normalized_value, metadata_json, updated_at)
                 VALUES ('1', 'anime', 'g', 'Tonari no Totoro', 'tonari no totoro', '{}', 0)",
                [],
            )
            .expect("insert entry");
        let match_query = build_fts_match_query("tonari no totoro");
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
    #[test]
    fn normalized_value_index_covers_feedback_updates() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema migration");
        let count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master
                 WHERE type = 'index' AND name = 'idx_unified_index_normalized'",
                [],
                |row| row.get(0),
            )
            .expect("read index list");
        assert_eq!(count, 1);
        let plan: String = connection
            .query_row(
                "EXPLAIN QUERY PLAN
                 UPDATE unified_index SET selected_count = selected_count + 1
                 WHERE normalized_value = 'frieren'",
                [],
                |row| row.get(3),
            )
            .expect("read query plan");
        assert!(
            plan.contains("idx_unified_index_normalized"),
            "feedback update must use the normalized value index, plan was {plan}"
        );
    }

    #[test]
    fn learning_stats_skip_zero_counters_and_stale_rows() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema migration");
        let now = now_seconds();
        let old = now - 120 * 86400;
        for (id, kind, scope, use_count, selected_count, ignored_count, last_used_at) in [
            ("fresh", "history", "anilist", 3, 1, 0, now),
            ("stale", "history", "anilist", 9, 0, 0, old),
            ("zero", "anime", "anilist", 0, 0, 0, now),
            ("ignored", "anime", "anilist", 0, 0, 2, now),
        ] {
            connection
                .execute(
                    "INSERT INTO unified_index
                        (id, kind, scope, value, normalized_value, metadata_json,
                         use_count, selected_count, ignored_count, last_used_at, updated_at)
                     VALUES (?1, ?2, ?3, ?1, ?1, '{}', ?4, ?5, ?6, ?7, ?7)",
                    params![
                        id,
                        kind,
                        scope,
                        use_count,
                        selected_count,
                        ignored_count,
                        last_used_at
                    ],
                )
                .expect("insert learning fixture");
        }
        let cutoff = now - 90 * 86400;
        let rows = list_learning_stats_inner(&connection, cutoff).expect("learning stats");
        let ids: Vec<&str> = rows.iter().map(|row| row.id.as_str()).collect();
        assert_eq!(ids, vec!["fresh", "ignored"]);
    }

    #[test]
    fn value_action_updates_shared_rows_and_scopes_history() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema migration");
        let now = now_seconds();
        for (id, kind, scope, normalized) in [
            ("anime:1", "anime", "anilist", "frieren"),
            ("anime:1:alias", "anime_alias", "anilist", "frieren"),
            ("history:anilist:frieren", "history", "anilist", "frieren"),
            ("history:torrent:frieren", "history", "torrent", "frieren"),
        ] {
            connection
                .execute(
                    "INSERT INTO unified_index
                        (id, kind, scope, value, normalized_value, metadata_json, updated_at)
                     VALUES (?1, ?2, ?3, 'Frieren', ?4, '{}', ?5)",
                    params![id, kind, scope, normalized, now],
                )
                .expect("insert value action fixture");
        }
        let updated = record_value_action_inner(
            &connection,
            "frieren",
            Some("anilist"),
            "selected_count",
            now,
        )
        .expect("record value action");
        assert_eq!(updated, 3);
        let counts: Vec<(String, i64)> = connection
            .prepare("SELECT id, selected_count FROM unified_index ORDER BY id")
            .expect("prepare counts")
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .expect("query counts")
            .collect::<Result<Vec<_>, _>>()
            .expect("collect counts");
        assert_eq!(
            counts,
            vec![
                ("anime:1".to_string(), 1),
                ("anime:1:alias".to_string(), 1),
                ("history:anilist:frieren".to_string(), 1),
                ("history:torrent:frieren".to_string(), 0),
            ]
        );
    }

    #[test]
    fn upsert_bumps_use_count_only_when_requested() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema migration");
        let now = now_seconds();
        let entry = |bump_use: bool| UnifiedIndexEntryInput {
            id: "history:anilist:frieren".into(),
            kind: "history".into(),
            scope: "anilist".into(),
            value: "frieren".into(),
            subtitle: None,
            metadata: None,
            bump_use,
        };
        let transaction = connection
            .unchecked_transaction()
            .expect("upsert transaction");
        upsert_unified_index_batch(&transaction, &[entry(true)], now).expect("first upsert");
        upsert_unified_index_batch(&transaction, &[entry(true)], now).expect("second upsert");
        upsert_unified_index_batch(&transaction, &[entry(false)], now).expect("plain upsert");
        transaction.commit().expect("commit upserts");
        let (use_count, last_used_at): (i64, i64) = connection
            .query_row(
                "SELECT use_count, last_used_at FROM unified_index WHERE id = ?1",
                params!["history:anilist:frieren"],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read counters");
        assert_eq!(use_count, 2);
        assert_eq!(last_used_at, now);
    }

    /// Reproduces the production `upsert unified index: database is locked`
    /// failure. Every Tauri command opens its own connection to the single
    /// `app_data.sqlite3` file, and SQLite allows only one writer at a time.
    /// A second writer busy-waits up to `busy_timeout` (5 s in production via
    /// `initialize_schema`) and then fails with SQLITE_BUSY while another
    /// connection still holds its write transaction (long prune, FTS
    /// `optimize`, or an overlapping `rebuild_file_index`).
    #[test]
    fn concurrent_writer_reports_database_is_locked_after_busy_timeout() {
        use std::sync::mpsc::channel;
        use std::time::Duration;

        let path = std::env::temp_dir().join(format!(
            "iluha-index-lock-test-{}.sqlite3",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&path);

        let open = || {
            let connection = Connection::open(&path).expect("open temp database");
            initialize_schema(&connection).expect("schema migration");
            connection
        };
        let holder = open();
        let contender = open();

        holder
            .execute_batch("BEGIN IMMEDIATE")
            .expect("holder begins write txn");
        holder
            .execute(
                "INSERT INTO unified_index
                    (id, kind, scope, value, normalized_value, metadata_json, updated_at)
                 VALUES ('holder', 'local_file', 'player', 'Holder', 'holder', '{}', 0)",
                [],
            )
            .expect("holder insert");

        let (release_tx, release_rx) = channel::<()>();
        let handle = std::thread::spawn(move || {
            release_rx.recv().expect("release signal");
            holder.execute_batch("COMMIT").expect("holder commit");
        });

        contender
            .busy_timeout(Duration::from_millis(100))
            .expect("short busy timeout");
        let error = contender
            .execute(
                "INSERT INTO unified_index
                    (id, kind, scope, value, normalized_value, metadata_json, updated_at)
                 VALUES ('contender', 'local_file', 'player', 'Contender', 'contender', '{}', 0)",
                [],
            )
            .expect_err("contender must hit the held write lock");
        let message = error.to_string();
        assert!(
            message.contains("database is locked"),
            "unexpected error message: {message}"
        );
        let is_busy = matches!(
            error,
            rusqlite::Error::SqliteFailure(ref failure, _)
                if failure.code == rusqlite::ErrorCode::DatabaseBusy
        );
        assert!(is_busy, "expected SQLITE_BUSY, got: {error:?}");

        release_tx.send(()).expect("send release");
        handle.join().expect("holder thread");
        contender
            .execute(
                "INSERT INTO unified_index
                    (id, kind, scope, value, normalized_value, metadata_json, updated_at)
                 VALUES ('contender', 'local_file', 'player', 'Contender', 'contender', '{}', 0)",
                [],
            )
            .expect("retry after release succeeds");

        drop(contender);
        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_file(path.with_extension("sqlite3-wal"));
        let _ = std::fs::remove_file(path.with_extension("sqlite3-shm"));
    }

    #[test]
    fn prune_keeps_listed_ids_and_removes_only_stale_scope_rows() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema migration");
        let transaction = connection
            .unchecked_transaction()
            .expect("prune test transaction");
        for (id, scope) in [
            ("keep-a", "player"),
            ("keep-b", "player"),
            ("stale", "player"),
            ("other-scope", "anilist"),
        ] {
            transaction
                .execute(
                    "INSERT INTO unified_index
                        (id, kind, scope, value, normalized_value, metadata_json, updated_at)
                     VALUES (?1, 'local_file', ?2, ?3, ?3, '{}', 0)",
                    params![id, scope, id],
                )
                .expect("insert prune fixture");
        }
        let keep: HashSet<&str> = ["keep-a", "keep-b"].into_iter().collect();
        let removed =
            prune_unified_index_scope_inner(&transaction, "player", &keep).expect("prune scope");
        assert_eq!(removed, 1);
        transaction.commit().expect("commit prune");
        let remaining: Vec<String> = connection
            .prepare("SELECT id FROM unified_index ORDER BY id")
            .expect("prepare remaining")
            .query_map([], |row| row.get(0))
            .expect("query remaining")
            .collect::<Result<Vec<_>, _>>()
            .expect("collect remaining");
        assert_eq!(remaining, vec!["keep-a", "keep-b", "other-scope"]);
    }
}
