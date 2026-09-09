use rusqlite::params;
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
    trimmed.chars().take(256).collect()
}
pub fn build_fts_match_query(normalized: &str) -> String {
    normalized
        .split_whitespace()
        .filter(|token| token.chars().count() >= 3)
        .map(|token| format!("\"{}\"", token.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" AND ")
}
pub fn feedback_score_sql(column_prefix: &str) -> String {
    format!(
        "({p}selected_count * 20 + {p}use_count * 4 - {p}ignored_count * 8) * \
         CASE WHEN {p}last_used_at > strftime('%s', 'now') - 86400 THEN 1.0 \
         WHEN {p}last_used_at > strftime('%s', 'now') - 604800 THEN 0.5 \
         WHEN {p}last_used_at > strftime('%s', 'now') - 2592000 THEN 0.25 \
         ELSE 0.1 END",
        p = column_prefix
    )
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
pub fn clear_unified_index_scope(app: tauri::AppHandle, scope: String) -> Result<usize, String> {
    if scope.is_empty() || scope.len() > 64 {
        return Err("Unified index scope is invalid".into());
    }
    let connection = open_database(&app)?;
    let deleted = connection
        .execute("DELETE FROM unified_index WHERE scope = ?1", params![scope])
        .map_err(|error| format!("clear unified index scope: {error}"))?;
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

    let match_query = build_fts_match_query(&normalized);
    if normalized.chars().count() >= 3 && !match_query.is_empty() {
        let mut statement = connection
            .prepare(&format!(
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
               {} DESC,
               ui.last_used_at DESC, ui.value COLLATE NOCASE
             LIMIT ?5",
                feedback_score_sql("ui.")
            ))
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
        .prepare(&format!(
            "SELECT id, kind, scope, value, subtitle, metadata_json,
                    use_count, selected_count, ignored_count, last_used_at
             FROM unified_index
             WHERE normalized_value LIKE ?1
               AND (?2 IS NULL OR scope = ?2)
             ORDER BY
               CASE WHEN normalized_value = ?3 THEN 0
                    WHEN normalized_value LIKE ?4 THEN 1
                    ELSE 2 END,
               {} DESC,
               last_used_at DESC, value COLLATE NOCASE
             LIMIT ?5",
            feedback_score_sql("")
        ))
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
            "\"tonari\" AND \"totoro\""
        );
        assert_eq!(build_fts_match_query("no"), "");
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
    fn feedback_decay_prefers_fresh_over_stale_counts() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema migration");
        let now = now_seconds();
        let old = now - 60 * 86400;
        for (id, value, use_count, ignored_count, last_used_at) in [
            ("old_star", "probe old star", 50, 0, old),
            ("fresh_riser", "probe fresh riser", 10, 0, now),
            ("zero", "probe zero", 0, 0, 0),
            ("fresh_sinner", "probe fresh sinner", 0, 5, now),
            ("ancient", "probe ancient", 0, 100, old),
        ] {
            connection
                .execute(
                    "INSERT INTO unified_index
                        (id, kind, scope, value, normalized_value, metadata_json,
                         use_count, ignored_count, last_used_at, updated_at)
                     VALUES (?1, 'anime', 'g', ?2, ?2, '{}', ?3, ?4, ?5, ?6)",
                    params![id, value, use_count, ignored_count, last_used_at, now],
                )
                .expect("insert entry");
        }
        let order: Vec<String> = connection
            .prepare(&format!(
                "SELECT id FROM unified_index
                 WHERE normalized_value LIKE '%probe%'
                 ORDER BY CASE WHEN normalized_value = 'probe' THEN 0 ELSE 2 END,
                 {} DESC, last_used_at DESC, value",
                feedback_score_sql("")
            ))
            .expect("prepare order")
            .query_map([], |row| row.get(0))
            .expect("query order")
            .collect::<Result<Vec<_>, _>>()
            .expect("collect order");
        assert_eq!(
            order,
            vec!["fresh_riser", "old_star", "zero", "fresh_sinner", "ancient"]
        );
    }
}
