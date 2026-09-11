use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use super::db::{now_millis, open_database};

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
    pub release_date: Option<String>,
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
    #[serde(default = "default_sites_to_view")]
    pub sites_to_view: serde_json::Value,
    #[serde(default)]
    pub tv_current_season: Option<i64>,
    #[serde(default)]
    pub tv_current_episode: Option<i64>,
    #[serde(default)]
    pub details_json: Option<serde_json::Value>,
}

const fn default_sites_to_view() -> serde_json::Value {
    serde_json::Value::Array(vec![])
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
    pub release_date: Option<String>,
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
    pub sites_to_view: Option<serde_json::Value>,
    pub tv_current_season: Option<i64>,
    pub tv_current_episode: Option<i64>,
    pub details_json: Option<serde_json::Value>,
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

const CORE_COLLECTION_STATUS_IDS: [&str; 7] = [
    "favorites",
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
                i64::from(is_core)
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
                    added_at, updated_at, sites_to_view, tv_current_season, tv_current_episode, details_json,
                    release_date
             FROM collection_items ORDER BY updated_at DESC",
        )
        .map_err(|e| format!("list collection items: {e}"))?;
    let rows = statement
        .query_map([], |row| {
            let alt_titles: String = row.get(2)?;
            let genres: String = row.get(13)?;
            let external_ids: String = row.get(20)?;
            let custom_fields: String = row.get(21)?;
            let sites_to_view: String = row.get(30).unwrap_or_else(|_| "[]".to_string());
            let details_json: Option<String> = row.get(33).ok().flatten();
            let release_date: Option<String> = row.get(34).ok().flatten();
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
                sites_to_view: serde_json::from_str(&sites_to_view)
                    .unwrap_or(serde_json::Value::Array(vec![])),
                tv_current_season: row.get(31)?,
                tv_current_episode: row.get(32)?,
                details_json: details_json
                    .as_deref()
                    .and_then(|s| serde_json::from_str(s).ok()),
                release_date,
            })
        })
        .map_err(|e| format!("list collection items query: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("read collection items: {e}"))
}

fn insert_collection_item_connection(
    connection: &Connection,
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
    let sites_to_view = item.sites_to_view.as_ref().map_or_else(
        || "[]".to_string(),
        |v| serde_json::to_string(v).unwrap_or_else(|_| "[]".to_string()),
    );
    {
        let parsed: serde_json::Value =
            serde_json::from_str(&sites_to_view).unwrap_or(serde_json::Value::Array(vec![]));
        if let Some(arr) = parsed.as_array() {
            if arr.len() > 3 {
                return Err("sitesToView exceeds 3 entries".into());
            }
            for entry in arr {
                if let Some(url) = entry.get("url").and_then(|v| v.as_str()) {
                    if url.len() > 2048 {
                        return Err("sitesToView url too long".into());
                    }
                    let lower = url.to_lowercase();
                    if lower.starts_with("javascript:") || lower.starts_with("data:") {
                        return Err("sitesToView url scheme not allowed".into());
                    }
                }
            }
        }
    }
    let details_json = item
        .details_json
        .as_ref()
        .map(|v| serde_json::to_string(v).unwrap_or_default());
    if let Some(s) = item.tv_current_season {
        if !(1..=100).contains(&s) {
            return Err("tvCurrentSeason out of range".into());
        }
    }
    if let Some(e) = item.tv_current_episode {
        if !(1..=500).contains(&e) {
            return Err("tvCurrentEpisode out of range".into());
        }
    }
    connection
        .execute(
            "INSERT INTO collection_items (
                id, title, alt_titles_json, type, status, progress_value, progress_total,
                progress_unit, duration_minutes, rating, priority, is_favorite, year,
                release_date, genres_json, studio, description, notes, cover_url, cover_blob_id,
                thumb_blob_id, external_ids_json, custom_fields_json, local_path, local_kind,
                started_at, finished_at, last_watched_at, rewatch_count, added_at, updated_at,
                sites_to_view, tv_current_season, tv_current_episode, details_json
             ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18,
                ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?33, ?34, ?35
             )
             ON CONFLICT(id) DO UPDATE SET
                title = excluded.title, alt_titles_json = excluded.alt_titles_json,
                type = excluded.type, status = excluded.status,
                progress_value = excluded.progress_value, progress_total = excluded.progress_total,
                progress_unit = excluded.progress_unit, duration_minutes = excluded.duration_minutes,
                rating = excluded.rating, priority = excluded.priority,
                is_favorite = excluded.is_favorite, year = excluded.year,
                release_date = excluded.release_date,
                genres_json = excluded.genres_json, studio = excluded.studio,
                description = excluded.description, notes = excluded.notes,
                cover_url = excluded.cover_url, cover_blob_id = excluded.cover_blob_id,
                thumb_blob_id = excluded.thumb_blob_id, external_ids_json = excluded.external_ids_json,
                custom_fields_json = excluded.custom_fields_json, local_path = excluded.local_path,
                local_kind = excluded.local_kind, started_at = excluded.started_at,
                finished_at = excluded.finished_at, last_watched_at = excluded.last_watched_at,
                rewatch_count = excluded.rewatch_count, updated_at = excluded.updated_at,
                sites_to_view = excluded.sites_to_view, tv_current_season = excluded.tv_current_season,
                tv_current_episode = excluded.tv_current_episode, details_json = excluded.details_json",
            params![
                item.id, item.title, alt_titles, item.r#type, item.status, item.progress_value,
                item.progress_total, item.progress_unit, item.duration_minutes, item.rating,
                item.priority, i64::from(item.is_favorite), item.year, item.release_date,
                genres, item.studio,
                item.description, item.notes, item.cover_url, item.cover_blob_id,
                item.thumb_blob_id, external_ids, custom_fields, item.local_path,
                item.local_kind, item.started_at, item.finished_at, item.last_watched_at,
                item.rewatch_count, item.added_at, item.updated_at, sites_to_view,
                item.tv_current_season, item.tv_current_episode, details_json
            ],
        )
        .map_err(|e| format!("upsert collection item: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn upsert_collection_item(
    app: tauri::AppHandle,
    item: CollectionItemInput,
) -> Result<(), String> {
    let connection = open_database(&app)?;
    insert_collection_item_connection(&connection, item)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportBatchOutcome {
    pub imported: usize,
    pub failed: Vec<ImportBatchFailure>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportBatchFailure {
    pub index: usize,
    pub error: String,
}

fn import_collection_items_batch_connection(
    connection: &Connection,
    items: Vec<CollectionItemInput>,
) -> Result<ImportBatchOutcome, String> {
    let transaction = connection
        .unchecked_transaction()
        .map_err(|e| format!("begin import batch: {e}"))?;
    let mut outcome = ImportBatchOutcome {
        imported: 0,
        failed: Vec::new(),
    };
    for (index, item) in items.into_iter().enumerate() {
        if let Err(error) = insert_collection_item_connection(&transaction, item) {
            outcome.failed.push(ImportBatchFailure { index, error });
        } else {
            outcome.imported += 1;
        }
    }
    transaction
        .commit()
        .map_err(|e| format!("commit import batch: {e}"))?;
    Ok(outcome)
}

#[tauri::command]
pub fn import_collection_items_batch(
    app: tauri::AppHandle,
    items: Vec<CollectionItemInput>,
) -> Result<ImportBatchOutcome, String> {
    let connection = open_database(&app)?;
    import_collection_items_batch_connection(&connection, items)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionItemPatch {
    pub title: Option<String>,
    pub alt_titles: Option<serde_json::Value>,
    pub r#type: Option<String>,
    pub status: Option<String>,
    pub progress_value: Option<i64>,
    #[serde(default, deserialize_with = "deserialize_some")]
    pub progress_total: Option<Option<i64>>,
    pub progress_unit: Option<String>,
    #[serde(default, deserialize_with = "deserialize_some")]
    pub duration_minutes: Option<Option<i64>>,
    #[serde(default, deserialize_with = "deserialize_some")]
    pub rating: Option<Option<i64>>,
    pub priority: Option<String>,
    pub is_favorite: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_some")]
    pub year: Option<Option<i64>>,
    #[serde(default, deserialize_with = "deserialize_some")]
    pub release_date: Option<Option<String>>,
    pub genres: Option<serde_json::Value>,
    #[serde(default, deserialize_with = "deserialize_some")]
    pub studio: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_some")]
    pub description: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_some")]
    pub notes: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_some")]
    pub cover_url: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_some")]
    pub cover_blob_id: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_some")]
    pub thumb_blob_id: Option<Option<String>>,
    pub external_ids: Option<serde_json::Value>,
    pub custom_fields: Option<serde_json::Value>,
    #[serde(default, deserialize_with = "deserialize_some")]
    pub local_path: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_some")]
    pub local_kind: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_some")]
    pub started_at: Option<Option<i64>>,
    #[serde(default, deserialize_with = "deserialize_some")]
    pub finished_at: Option<Option<i64>>,
    #[serde(default, deserialize_with = "deserialize_some")]
    pub last_watched_at: Option<Option<i64>>,
    pub rewatch_count: Option<i64>,
    #[serde(default, deserialize_with = "deserialize_some")]
    pub sites_to_view: Option<Option<serde_json::Value>>,
    #[serde(default, deserialize_with = "deserialize_some")]
    pub tv_current_season: Option<Option<i64>>,
    #[serde(default, deserialize_with = "deserialize_some")]
    pub tv_current_episode: Option<Option<i64>>,
    #[serde(default, deserialize_with = "deserialize_some")]
    pub details_json: Option<Option<serde_json::Value>>,
    #[serde(default)]
    pub touch_updated: Option<bool>,
}

fn deserialize_some<'de, T, D>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    T: serde::Deserialize<'de>,
    D: serde::Deserializer<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}

fn patch_collection_item_connection(
    connection: &Connection,
    id: &str,
    patch: &CollectionItemPatch,
) -> Result<(), String> {
    validate_collection_text(id, 128, "id")?;
    if let Some(title) = &patch.title {
        validate_collection_text(title, 512, "title")?;
    }
    if let Some(Some(s)) = patch.tv_current_season {
        if !(1..=100).contains(&s) {
            return Err("tvCurrentSeason out of range".into());
        }
    }
    if let Some(Some(e)) = patch.tv_current_episode {
        if !(1..=500).contains(&e) {
            return Err("tvCurrentEpisode out of range".into());
        }
    }
    let sites_to_view: Option<Option<String>> = match &patch.sites_to_view {
        Some(Some(value)) => {
            let serialized = serde_json::to_string(value)
                .map_err(|e| format!("serialize sites_to_view: {e}"))?;
            let parsed: serde_json::Value = serde_json::from_str(&serialized)
                .map_err(|e| format!("sites_to_view must be valid JSON: {e}"))?;
            if let Some(arr) = parsed.as_array() {
                if arr.len() > 3 {
                    return Err("sitesToView exceeds 3 entries".into());
                }
                for entry in arr {
                    if let Some(url) = entry.get("url").and_then(|v| v.as_str()) {
                        if url.len() > 2048 {
                            return Err("sitesToView url too long".into());
                        }
                        let lower = url.to_lowercase();
                        if lower.starts_with("javascript:") || lower.starts_with("data:") {
                            return Err("sitesToView url scheme not allowed".into());
                        }
                    }
                }
            }
            Some(Some(serialized))
        }
        Some(None) => Some(None),
        None => None,
    };

    let exists: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM collection_items WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| format!("check collection item: {e}"))?;
    if exists == 0 {
        return Err("collection item not found".into());
    }

    let now = now_millis();
    let mut sets: Vec<&str> = Vec::new();
    let mut params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    macro_rules! set {
        ($column:literal, $value:expr) => {{
            sets.push($column);
            params_vec.push(Box::new($value));
        }};
    }
    if let Some(v) = &patch.title {
        set!("title = ?", v);
    }
    if let Some(v) = &patch.alt_titles {
        let serialized =
            serde_json::to_string(v).map_err(|e| format!("serialize alt_titles: {e}"))?;
        set!("alt_titles_json = ?", serialized);
    }
    if let Some(v) = &patch.r#type {
        set!("type = ?", v);
    }
    if let Some(v) = &patch.status {
        set!("status = ?", v);
    }
    if let Some(v) = patch.progress_value {
        set!("progress_value = ?", v);
    }
    if let Some(Some(v)) = patch.progress_total {
        set!("progress_total = ?", v);
    } else if let Some(None) = patch.progress_total {
        sets.push("progress_total = NULL");
    }
    if let Some(v) = &patch.progress_unit {
        set!("progress_unit = ?", v);
    }
    if let Some(Some(v)) = patch.duration_minutes {
        set!("duration_minutes = ?", v);
    } else if let Some(None) = patch.duration_minutes {
        sets.push("duration_minutes = NULL");
    }
    if let Some(Some(v)) = patch.rating {
        set!("rating = ?", v);
    } else if let Some(None) = patch.rating {
        sets.push("rating = NULL");
    }
    if let Some(v) = &patch.priority {
        set!("priority = ?", v);
    }
    if let Some(v) = patch.is_favorite {
        set!("is_favorite = ?", i64::from(v));
    }
    if let Some(Some(v)) = patch.year {
        set!("year = ?", v);
    } else if let Some(None) = patch.year {
        sets.push("year = NULL");
    }
    if let Some(Some(v)) = &patch.release_date {
        set!("release_date = ?", v);
    } else if let Some(None) = &patch.release_date {
        sets.push("release_date = NULL");
    }
    if let Some(v) = &patch.genres {
        let serialized = serde_json::to_string(v).map_err(|e| format!("serialize genres: {e}"))?;
        set!("genres_json = ?", serialized);
    }
    if let Some(Some(v)) = &patch.studio {
        set!("studio = ?", v);
    } else if let Some(None) = &patch.studio {
        sets.push("studio = NULL");
    }
    if let Some(Some(v)) = &patch.description {
        set!("description = ?", v);
    } else if let Some(None) = &patch.description {
        sets.push("description = NULL");
    }
    if let Some(Some(v)) = &patch.notes {
        set!("notes = ?", v);
    } else if let Some(None) = &patch.notes {
        sets.push("notes = NULL");
    }
    if let Some(Some(v)) = &patch.cover_url {
        set!("cover_url = ?", v);
    } else if let Some(None) = &patch.cover_url {
        sets.push("cover_url = NULL");
    }
    if let Some(Some(v)) = &patch.cover_blob_id {
        set!("cover_blob_id = ?", v);
    } else if let Some(None) = &patch.cover_blob_id {
        sets.push("cover_blob_id = NULL");
    }
    if let Some(Some(v)) = &patch.thumb_blob_id {
        set!("thumb_blob_id = ?", v);
    } else if let Some(None) = &patch.thumb_blob_id {
        sets.push("thumb_blob_id = NULL");
    }
    if let Some(v) = &patch.external_ids {
        let serialized =
            serde_json::to_string(v).map_err(|e| format!("serialize external_ids: {e}"))?;
        set!("external_ids_json = ?", serialized);
    }
    if let Some(v) = &patch.custom_fields {
        let serialized =
            serde_json::to_string(v).map_err(|e| format!("serialize custom_fields: {e}"))?;
        set!("custom_fields_json = ?", serialized);
    }
    if let Some(Some(v)) = &patch.local_path {
        set!("local_path = ?", v);
    } else if let Some(None) = &patch.local_path {
        sets.push("local_path = NULL");
    }
    if let Some(Some(v)) = &patch.local_kind {
        set!("local_kind = ?", v);
    } else if let Some(None) = &patch.local_kind {
        sets.push("local_kind = NULL");
    }
    if let Some(Some(v)) = patch.started_at {
        set!("started_at = ?", v);
    } else if let Some(None) = patch.started_at {
        sets.push("started_at = NULL");
    }
    if let Some(Some(v)) = patch.finished_at {
        set!("finished_at = ?", v);
    } else if let Some(None) = patch.finished_at {
        sets.push("finished_at = NULL");
    }
    if let Some(Some(v)) = patch.last_watched_at {
        set!("last_watched_at = ?", v);
    } else if let Some(None) = patch.last_watched_at {
        sets.push("last_watched_at = NULL");
    }
    if let Some(v) = patch.rewatch_count {
        set!("rewatch_count = ?", v);
    }
    if let Some(Some(serialized)) = &sites_to_view {
        set!("sites_to_view = ?", serialized);
    } else if let Some(None) = &sites_to_view {
        sets.push("sites_to_view = NULL");
    }
    if let Some(Some(v)) = patch.tv_current_season {
        set!("tv_current_season = ?", v);
    } else if let Some(None) = patch.tv_current_season {
        sets.push("tv_current_season = NULL");
    }
    if let Some(Some(v)) = patch.tv_current_episode {
        set!("tv_current_episode = ?", v);
    } else if let Some(None) = patch.tv_current_episode {
        sets.push("tv_current_episode = NULL");
    }
    if let Some(Some(v)) = &patch.details_json {
        let serialized =
            serde_json::to_string(v).map_err(|e| format!("serialize details_json: {e}"))?;
        set!("details_json = ?", serialized);
    } else if let Some(None) = &patch.details_json {
        sets.push("details_json = NULL");
    }

    if sets.is_empty() {
        return Ok(());
    }
    if patch.touch_updated != Some(false) {
        sets.push("updated_at = ?");
        params_vec.push(Box::new(now));
    }
    params_vec.push(Box::new(id.to_string()));

    let sql = format!(
        "UPDATE collection_items SET {} WHERE id = ?",
        sets.join(", ")
    );
    let params_ref: Vec<&dyn rusqlite::types::ToSql> =
        params_vec.iter().map(AsRef::as_ref).collect();
    connection
        .execute(&sql, params_ref.as_slice())
        .map_err(|e| format!("patch collection item: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn patch_collection_item(
    app: tauri::AppHandle,
    id: String,
    patch: CollectionItemPatch,
) -> Result<(), String> {
    let connection = open_database(&app)?;
    patch_collection_item_connection(&connection, &id, &patch)
}

#[tauri::command]
pub fn delete_collection_item(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let connection = open_database(&app)?;
    connection
        .execute("DELETE FROM collection_items WHERE id = ?1", params![&id])
        .map_err(|e| format!("delete collection item: {e}"))?;
    Ok(())
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

#[cfg(test)]
mod tests {
    use super::super::db::now_seconds;
    use super::super::schema::initialize_schema;
    use super::super::unified_index::build_fts_match_query;
    use super::*;
    use rusqlite::Connection;
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
    fn patch_collection_item_updates_only_given_fields_and_keeps_fts_in_sync() {
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

        let patch = CollectionItemPatch {
            title: None,
            alt_titles: None,
            r#type: None,
            status: Some("watching".into()),
            progress_value: Some(7),
            progress_total: None,
            progress_unit: None,
            duration_minutes: None,
            rating: None,
            priority: None,
            is_favorite: Some(true),
            year: None,
            release_date: None,
            genres: None,
            studio: None,
            description: None,
            notes: None,
            cover_url: None,
            cover_blob_id: None,
            thumb_blob_id: None,
            external_ids: None,
            custom_fields: None,
            local_path: None,
            local_kind: None,
            started_at: None,
            finished_at: None,
            last_watched_at: None,
            rewatch_count: None,
            sites_to_view: None,
            tv_current_season: None,
            tv_current_episode: None,
            details_json: None,
            touch_updated: None,
        };
        patch_collection_item_connection(&connection, "item_1", &patch)
            .expect("patch collection item");

        let (status, progress, favorite, title, added_at): (
            String,
            i64,
            i64,
            String,
            i64,
        ) = connection
            .query_row(
                "SELECT status, progress_value, is_favorite, title, added_at FROM collection_items WHERE id = 'item_1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .expect("read patched row");
        assert_eq!(status, "watching");
        assert_eq!(progress, 7);
        assert_eq!(favorite, 1);
        assert_eq!(title, "Serial Experiments Lain");
        assert_eq!(added_at, 1000);
        let match_query = build_fts_match_query("lain");
        let fts_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM collection_items_fts WHERE collection_items_fts MATCH ?1",
                params![match_query],
                |row| row.get(0),
            )
            .expect("fts count");
        assert_eq!(fts_count, 1);
    }

    #[test]
    fn patch_collection_item_sets_release_date_without_touching_updated_at() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema migration");
        connection
            .execute(
                "INSERT INTO collection_items
                    (id, title, type, status, progress_unit, priority, added_at, updated_at)
                 VALUES ('item_1', 'X', 'anime', 'planned', 'episodes', 'normal', 1000, 2000)",
                [],
            )
            .expect("insert item");
        let patch = CollectionItemPatch {
            title: None,
            alt_titles: None,
            r#type: None,
            status: None,
            progress_value: None,
            progress_total: None,
            progress_unit: None,
            duration_minutes: None,
            rating: None,
            priority: None,
            is_favorite: None,
            year: None,
            release_date: Some(Some("2024-01-15".to_string())),
            genres: None,
            studio: None,
            description: None,
            notes: None,
            cover_url: None,
            cover_blob_id: None,
            thumb_blob_id: None,
            external_ids: None,
            custom_fields: None,
            local_path: None,
            local_kind: None,
            started_at: None,
            finished_at: None,
            last_watched_at: None,
            rewatch_count: None,
            sites_to_view: None,
            tv_current_season: None,
            tv_current_episode: None,
            details_json: None,
            touch_updated: Some(false),
        };
        patch_collection_item_connection(&connection, "item_1", &patch)
            .expect("patch collection item");
        let (release_date, updated_at): (Option<String>, i64) = connection
            .query_row(
                "SELECT release_date, updated_at FROM collection_items WHERE id = 'item_1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read patched row");
        assert_eq!(release_date.as_deref(), Some("2024-01-15"));
        assert_eq!(updated_at, 2000);
    }

    #[test]
    fn patch_collection_item_rejects_missing_item_and_invalid_ranges() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema migration");
        let base = CollectionItemPatch {
            title: None,
            alt_titles: None,
            r#type: None,
            status: None,
            progress_value: None,
            progress_total: None,
            progress_unit: None,
            duration_minutes: None,
            rating: None,
            priority: None,
            is_favorite: None,
            year: None,
            release_date: None,
            genres: None,
            studio: None,
            description: None,
            notes: None,
            cover_url: None,
            cover_blob_id: None,
            thumb_blob_id: None,
            external_ids: None,
            custom_fields: None,
            local_path: None,
            local_kind: None,
            started_at: None,
            finished_at: None,
            last_watched_at: None,
            rewatch_count: None,
            sites_to_view: None,
            tv_current_season: None,
            tv_current_episode: None,
            details_json: None,
            touch_updated: None,
        };

        let mut missing = base.clone();
        missing.status = Some("watching".into());
        let error = patch_collection_item_connection(&connection, "nope", &missing)
            .expect_err("missing item must error");
        assert_eq!(error, "collection item not found");

        let mut bad_season = base.clone();
        bad_season.tv_current_season = Some(Some(0));
        let error = patch_collection_item_connection(&connection, "x", &bad_season)
            .expect_err("season 0 must error");
        assert_eq!(error, "tvCurrentSeason out of range");

        let mut bad_episode = base.clone();
        bad_episode.tv_current_episode = Some(Some(501));
        let error = patch_collection_item_connection(&connection, "x", &bad_episode)
            .expect_err("episode 501 must error");
        assert_eq!(error, "tvCurrentEpisode out of range");

        let mut bad_sites = base.clone();
        bad_sites.sites_to_view = Some(Some(serde_json::json!([
            {"url": "javascript:alert(1)"}
        ])));
        let error = patch_collection_item_connection(&connection, "x", &bad_sites)
            .expect_err("javascript url must error");
        assert_eq!(error, "sitesToView url scheme not allowed");
    }

    #[test]
    fn patch_serde_maps_null_to_clear_and_absent_to_skip() {
        let patch: CollectionItemPatch =
            serde_json::from_str(r#"{"studio": null, "year": 2000, "rating": null}"#)
                .expect("deserialize patch");
        assert_eq!(patch.studio, Some(None));
        assert_eq!(patch.rating, Some(None));
        assert_eq!(patch.year, Some(Some(2000)));
        assert_eq!(patch.title, None);
        assert_eq!(patch.started_at, None);
        assert_eq!(patch.tv_current_season, None);

        let empty: CollectionItemPatch = serde_json::from_str("{}").expect("empty patch");
        assert_eq!(empty.studio, None);
        assert_eq!(empty.title, None);
    }

    #[test]
    fn patch_collection_item_clears_nullable_columns_to_null() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema migration");
        connection
            .execute(
                "INSERT INTO collection_items (
                    id, title, alt_titles_json, type, status, progress_value, progress_total,
                    progress_unit, duration_minutes, rating, priority, is_favorite, year,
                    genres_json, studio, description, notes, cover_url, cover_blob_id,
                    thumb_blob_id, external_ids_json, custom_fields_json, local_path, local_kind,
                    started_at, finished_at, last_watched_at, rewatch_count, added_at, updated_at,
                    sites_to_view, tv_current_season, tv_current_episode, details_json
                 ) VALUES (
                    'item_clear', 'Serial Experiments Lain', '[]', 'anime', 'completed', 13, 13,
                    'episodes', 23, 10, 'normal', 0, 1998, '[\"Drama\"]', 'TV Tokyo', 'desc',
                    'note', 'https://example.com/cover.jpg', NULL, NULL, '{\"anilist\":339}', '{}',
                    'C:/Anime/Lain', 'folder', 100, 200, 300, 0, 1000, 1000,
                    '[{\"url\":\"https://site\"}]', 2, 24, '{\"seasons\":[]}'
                 )",
                [],
            )
            .expect("insert item");

        let patch: CollectionItemPatch = serde_json::from_str(
            r#"{"studio": null, "description": null, "startedAt": null,
                "tvCurrentSeason": null, "rating": null, "year": 2001}"#,
        )
        .expect("deserialize clear patch");
        patch_collection_item_connection(&connection, "item_clear", &patch)
            .expect("patch collection item");

        let (studio, description, started_at, tv_season, rating, year, title, updated_at): (
            Option<String>,
            Option<String>,
            Option<i64>,
            Option<i64>,
            Option<i64>,
            Option<i64>,
            String,
            i64,
        ) = connection
            .query_row(
                "SELECT studio, description, started_at, tv_current_season, rating, year,
                            title, updated_at FROM collection_items WHERE id = 'item_clear'",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                        row.get(6)?,
                        row.get(7)?,
                    ))
                },
            )
            .expect("read cleared row");
        assert_eq!(studio, None);
        assert_eq!(description, None);
        assert_eq!(started_at, None);
        assert_eq!(tv_season, None);
        assert_eq!(rating, None);
        assert_eq!(year, Some(2001));
        assert_eq!(title, "Serial Experiments Lain");
        assert!(updated_at > 1000);
        let match_query = build_fts_match_query("lain");
        let fts_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM collection_items_fts WHERE collection_items_fts MATCH ?1",
                params![match_query],
                |row| row.get(0),
            )
            .expect("fts count");
        assert_eq!(fts_count, 1);
    }

    #[test]
    fn patch_writes_updated_at_in_milliseconds_like_the_frontend() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema migration");
        let stored_ms: i64 = 1_750_000_000_000;
        connection
            .execute(
                "INSERT INTO collection_items (
                    id, title, alt_titles_json, type, status, progress_value, progress_total,
                    progress_unit, duration_minutes, rating, priority, is_favorite, year,
                    genres_json, studio, description, notes, cover_url, cover_blob_id,
                    thumb_blob_id, external_ids_json, custom_fields_json, local_path, local_kind,
                    started_at, finished_at, last_watched_at, rewatch_count, added_at, updated_at
                 ) VALUES (
                    'item_ms', 'Serial Experiments Lain', '[]', 'anime', 'completed', 13, 13,
                    'episodes', 23, 10, 'normal', 0, 1998, '[\"Drama\"]', 'TV Tokyo', NULL, NULL,
                    NULL, NULL, NULL, '{\"anilist\":339}', '{}', NULL, NULL, NULL, NULL, NULL,
                    0, 1000, ?1
                 )",
                params![stored_ms],
            )
            .expect("insert item");

        let patch = CollectionItemPatch {
            title: None,
            alt_titles: None,
            r#type: None,
            status: Some("watching".into()),
            progress_value: None,
            progress_total: None,
            progress_unit: None,
            duration_minutes: None,
            rating: None,
            priority: None,
            is_favorite: None,
            year: None,
            release_date: None,
            genres: None,
            studio: None,
            description: None,
            notes: None,
            cover_url: None,
            cover_blob_id: None,
            thumb_blob_id: None,
            external_ids: None,
            custom_fields: None,
            local_path: None,
            local_kind: None,
            started_at: None,
            finished_at: None,
            last_watched_at: None,
            rewatch_count: None,
            sites_to_view: None,
            tv_current_season: None,
            tv_current_episode: None,
            details_json: None,
            touch_updated: None,
        };
        patch_collection_item_connection(&connection, "item_ms", &patch)
            .expect("patch collection item");

        let updated_at: i64 = connection
            .query_row(
                "SELECT updated_at FROM collection_items WHERE id = 'item_ms'",
                [],
                |row| row.get(0),
            )
            .expect("read updated_at");
        assert!(
            updated_at > stored_ms,
            "updated_at stayed in ms: {updated_at}"
        );
    }
    fn sample_item_input(id: &str, title: &str) -> CollectionItemInput {
        let now = now_seconds();
        CollectionItemInput {
            id: id.into(),
            title: title.into(),
            alt_titles: serde_json::json!([]),
            r#type: "anime".into(),
            status: "completed".into(),
            progress_value: 13,
            progress_total: Some(13),
            progress_unit: "episodes".into(),
            duration_minutes: Some(23),
            rating: Some(9),
            priority: "normal".into(),
            is_favorite: false,
            year: Some(1998),
            release_date: None,
            genres: serde_json::json!(["Drama"]),
            studio: Some("Studio".into()),
            description: Some("desc".into()),
            notes: None,
            cover_url: None,
            cover_blob_id: None,
            thumb_blob_id: None,
            external_ids: serde_json::json!({}),
            custom_fields: serde_json::json!({}),
            local_path: None,
            local_kind: None,
            started_at: None,
            finished_at: None,
            last_watched_at: None,
            rewatch_count: 0,
            added_at: now,
            updated_at: now,
            sites_to_view: None,
            tv_current_season: None,
            tv_current_episode: None,
            details_json: None,
        }
    }

    #[test]
    fn batch_import_inserts_every_row_in_one_call_and_keeps_fts_in_sync() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema migration");
        let items = vec![
            sample_item_input("batch_1", "Serial Experiments Lain"),
            sample_item_input("batch_2", "Frieren"),
            sample_item_input("batch_3", "Mushishi"),
        ];
        let outcome = import_collection_items_batch_connection(&connection, items)
            .expect("batch import must succeed");
        assert_eq!(outcome.imported, 3);
        assert!(outcome.failed.is_empty());
        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM collection_items", [], |row| {
                row.get(0)
            })
            .expect("row count");
        assert_eq!(count, 3);
        let match_query = build_fts_match_query("lain");
        let fts_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM collection_items_fts WHERE collection_items_fts MATCH ?1",
                params![match_query],
                |row| row.get(0),
            )
            .expect("fts count");
        assert_eq!(fts_count, 1);
    }

    #[test]
    fn batch_import_reports_invalid_rows_and_keeps_valid_ones() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema migration");
        let mut bad = sample_item_input("bad", "x");
        bad.title = "x".repeat(600);
        let items = vec![
            sample_item_input("ok_1", "Serial Experiments Lain"),
            bad,
            sample_item_input("ok_2", "Frieren"),
        ];
        let outcome = import_collection_items_batch_connection(&connection, items)
            .expect("batch import must succeed");
        assert_eq!(outcome.imported, 2);
        assert_eq!(outcome.failed.len(), 1);
        assert_eq!(outcome.failed[0].index, 1);
        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM collection_items", [], |row| {
                row.get(0)
            })
            .expect("row count");
        assert_eq!(count, 2);
    }

    #[test]
    fn batch_import_updates_existing_ids_without_duplicating() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema migration");
        let first = vec![sample_item_input("same", "First")];
        import_collection_items_batch_connection(&connection, first).expect("first import");
        let second = vec![sample_item_input("same", "Second")];
        let outcome =
            import_collection_items_batch_connection(&connection, second).expect("second import");
        assert_eq!(outcome.imported, 1);
        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM collection_items", [], |row| {
                row.get(0)
            })
            .expect("row count");
        assert_eq!(count, 1);
        let title: String = connection
            .query_row(
                "SELECT title FROM collection_items WHERE id = 'same'",
                [],
                |row| row.get(0),
            )
            .expect("read title");
        assert_eq!(title, "Second");
    }
}
