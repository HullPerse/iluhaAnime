use base64::Engine as _;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::PathBuf;

use super::collection::{
    CollectionItemInput, CollectionItemRow, CustomFieldDefRow, list_collection_items,
    list_custom_field_defs, upsert_collection_item, upsert_custom_field_def,
};
use super::db::{database_path, now_seconds, open_database};
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionExport {
    pub version: u32,
    pub exported_at: i64,
    pub items: Vec<CollectionItemRow>,
    pub custom_field_defs: Vec<CustomFieldDefRow>,
}

#[tauri::command]
pub fn export_collection_data(app: tauri::AppHandle) -> Result<CollectionExport, String> {
    let items = list_collection_items(app.clone())?;
    let custom_field_defs = list_custom_field_defs(app)?;
    Ok(CollectionExport {
        version: 1,
        exported_at: now_seconds(),
        items,
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
        let external_ids = serde_json::from_str::<serde_json::Value>(
            &serde_json::to_string(&item.external_ids)
                .unwrap_or_default()
                .clone(),
        )
        .unwrap_or_default();
        let existing: Option<String> = {
            let anilist = external_ids
                .get("anilist")
                .and_then(serde_json::Value::as_i64);
            let tmdb = external_ids.get("tmdb").and_then(serde_json::Value::as_i64);
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
                params_vec.iter().map(std::convert::AsRef::as_ref).collect();
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
                        sites_to_view: Some(item.sites_to_view.clone()),
                        tv_current_season: item.tv_current_season,
                        tv_current_episode: item.tv_current_episode,
                        details_json: item.details_json.clone(),
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
                        sites_to_view: Some(item.sites_to_view.clone()),
                        tv_current_season: item.tv_current_season,
                        tv_current_episode: item.tv_current_episode,
                        details_json: item.details_json.clone(),
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

#[tauri::command]
pub async fn export_collection_zip(app: tauri::AppHandle, out_path: String) -> Result<(), String> {
    let data = export_collection_data(app.clone())?;
    let assets_db = crate::user_assets::database_path(&app)?;
    let assets_conn = Connection::open(&assets_db).map_err(|e| format!("open assets db: {e}"))?;
    let mut zip = zip::ZipWriter::new(
        std::fs::File::create(&out_path).map_err(|e| format!("create zip file: {e}"))?,
    );
    let opts = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    let json = serde_json::to_string_pretty(&data).map_err(|e| format!("serialize export: {e}"))?;
    zip.start_file("media.json", opts)
        .map_err(|e| format!("zip media.json: {e}"))?;
    zip.write_all(json.as_bytes())
        .map_err(|e| format!("write media.json: {e}"))?;
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
