use std::sync::{Mutex, OnceLock};

use fastembed::{EmbeddingModel, InitOptions, TextEmbedding};
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};

static MODEL: OnceLock<Mutex<Option<TextEmbedding>>> = OnceLock::new();

fn model_lock() -> &'static Mutex<Option<TextEmbedding>> {
    MODEL.get_or_init(|| Mutex::new(None))
}

#[derive(Clone, Serialize)]
struct DownloadProgress {
    downloaded: u64,
    total: u64,
    stage: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticHit {
    pub id: String,
    pub score: f32,
}

#[allow(dead_code)]
const FASTEMBED_Q_FILES: &[&str] = &[
    "config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "model.onnx",
    "model.onnx_data",
];
#[allow(dead_code)]
const FASTEMBED_FULL_FILES: &[&str] = &[
    "config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "model.onnx",
];

pub fn init_model(cache_dir: Option<std::path::PathBuf>) -> Result<(), String> {
    let mut guard = model_lock().lock().map_err(|e| format!("embed lock: {e}"))?;
    if guard.is_some() {
        return Ok(());
    }
    let mut options = InitOptions::new(EmbeddingModel::AllMiniLML6V2Q);
    if let Some(dir) = cache_dir {
        options = options.with_cache_dir(dir);
    }
    // Show progress off for desktop
    options = options.with_show_download_progress(false);
    let model = TextEmbedding::try_new(options).map_err(|e| format!("init fastembed: {e}"))?;
    *guard = Some(model);
    Ok(())
}

pub fn is_initialized() -> bool {
    model_lock().lock().map(|g| g.is_some()).unwrap_or(false)
}

#[tauri::command]
pub fn is_fastembed_initialized() -> Result<bool, String> {
    Ok(is_initialized())
}

pub fn embed_batch(texts: Vec<String>) -> Result<Vec<Vec<f32>>, String> {
    let mut guard = model_lock().lock().map_err(|e| format!("embed lock: {e}"))?;
    let model = guard.as_mut().ok_or("fastembed not initialized")?;
    model.embed(texts, None).map_err(|e| format!("embed: {e}"))
}

pub fn embed_one(text: String) -> Result<Vec<f32>, String> {
    let mut batch = embed_batch(vec![text])?;
    batch.pop().ok_or("no embedding".into())
}

pub fn cosine(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let mut dot = 0.0;
    let mut na = 0.0;
    let mut nb = 0.0;
    for (x, y) in a.iter().zip(b.iter()) {
        dot += x * y;
        na += x * x;
        nb += y * y;
    }
    if na == 0.0 || nb == 0.0 {
        return 0.0;
    }
    dot / (na.sqrt() * nb.sqrt())
}

#[allow(dead_code)]
fn fastembed_base_url(source: &str) -> &'static str {
    match source {
        "full" => "https://huggingface.co/qdrant/all-MiniLM-L6-v2-onnx/resolve/main/",
        _ => "https://huggingface.co/qdrant/all-MiniLM-L6-v2-onnx-Q/resolve/main/",
    }
}

#[allow(dead_code)]
fn fastembed_files(source: &str) -> &'static [&'static str] {
    match source {
        "full" => FASTEMBED_FULL_FILES,
        _ => FASTEMBED_Q_FILES,
    }
}

#[tauri::command]
pub fn check_fastembed(app: tauri::AppHandle) -> Result<bool, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map(|p| p.join("fastembed_cache"))
        .map_err(|e| format!("no app data dir: {e}"))?;
    // check if model.onnx exists in cache (hf-hub layout: models--qdrant--all-MiniLM-L6-v2-onnx-Q/snapshots/<hash>/model.onnx)
    // fallback: check if init would succeed without download
    if !dir.exists() {
        return Ok(false);
    }
    // search for model.onnx
    let found = walkdir::WalkDir::new(&dir)
        .into_iter()
        .filter_map(Result::ok)
        .any(|e| e.file_name() == "model.onnx");
    Ok(found)
}

#[tauri::command]
pub async fn remove_fastembed(app: tauri::AppHandle) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map(|p| p.join("fastembed_cache"))
        .map_err(|e| format!("no app data dir: {e}"))?;
    if !dir.exists() {
        return Err("Fastembed not found".into());
    }
    std::fs::remove_dir_all(&dir).map_err(|e| format!("remove fastembed: {e}"))?;
    // clear in-memory model
    if let Ok(mut guard) = model_lock().lock() {
        *guard = None;
    }
    Ok(())
}

#[tauri::command]
pub async fn download_fastembed(
    app: tauri::AppHandle,
    source: Option<String>,
) -> Result<String, String> {
    let src_owned = source.as_deref().unwrap_or("q").to_string();
    let dir = app
        .path()
        .app_data_dir()
        .map(|p| p.join("fastembed_cache"))
        .map_err(|e| format!("no app data dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("create dir: {e}"))?;

    if check_fastembed(app.clone())? {
        return Ok(dir.to_string_lossy().to_string());
    }

    // emit smooth progress while init downloads model (like ffmpeg)
    let app_clone = app.clone();
    let progress_handle = tokio::spawn(async move {
        let mut pct = 0u64;
        while pct < 90 {
            tokio::time::sleep(std::time::Duration::from_millis(250)).await;
            pct += 7;
            if pct > 90 {
                pct = 90;
            }
            let _ = app_clone.emit(
                "fastembed-download-progress",
                DownloadProgress {
                    downloaded: pct,
                    total: 100,
                    stage: "downloading".into(),
                },
            );
        }
    });

    let dir_clone = dir.clone();
    let src_for_init = src_owned.clone();
    // choose model based on source
    let init_res: Result<(), String> =
        tokio::task::spawn_blocking(move || -> Result<(), String> {
            let mut guard = model_lock().lock().map_err(|e| format!("embed lock: {e}"))?;
            if guard.is_some() {
                return Ok(());
            }
            let model = if src_for_init == "full" {
                EmbeddingModel::AllMiniLML6V2
            } else {
                EmbeddingModel::AllMiniLML6V2Q
            };
            let mut options = InitOptions::new(model);
            options = options.with_cache_dir(dir_clone);
            options = options.with_show_download_progress(false);
            let m = TextEmbedding::try_new(options).map_err(|e| format!("init fastembed: {e}"))?;
            *guard = Some(m);
            Ok(())
        })
        .await
        .map_err(|e| format!("init join: {e}"))?;

    progress_handle.abort();

    let _ = app.emit(
        "fastembed-download-progress",
        DownloadProgress {
            downloaded: 100,
            total: 100,
            stage: "extracting".into(),
        },
    );

    init_res?;

    let _ = app.emit(
        "fastembed-download-progress",
        DownloadProgress {
            downloaded: 100,
            total: 100,
            stage: "done".into(),
        },
    );

    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn init_fastembed(app: tauri::AppHandle) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map(|p| p.join("fastembed_cache"))
        .ok();
    if let Some(ref d) = dir {
        let _ = std::fs::create_dir_all(d);
    }
    init_model(dir)
}

#[tauri::command]
pub fn embed_text(app: tauri::AppHandle, text: String) -> Result<Vec<f32>, String> {
    // lazy init
    if !is_initialized() {
        let dir = app
            .path()
            .app_data_dir()
            .map(|p| p.join("fastembed_cache"))
            .ok();
        let _ = init_model(dir);
    }
    embed_one(text)
}

#[tauri::command]
pub fn upsert_embedding(app: tauri::AppHandle, id: String, text: String) -> Result<(), String> {
    if !is_initialized() {
        let dir = app
            .path()
            .app_data_dir()
            .map(|p| p.join("fastembed_cache"))
            .ok();
        init_model(dir)?;
    }
    let emb = embed_one(text)?;
    crate::app_db::upsert_unified_index_embedding(&app, id, emb)
}

#[tauri::command]
pub fn search_semantic(
    app: tauri::AppHandle,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<crate::app_db::UnifiedIndexEntry>, String> {
    if !is_initialized() {
        let dir = app
            .path()
            .app_data_dir()
            .map(|p| p.join("fastembed_cache"))
            .ok();
        // try init, if fails return empty
        if init_model(dir).is_err() {
            return Ok(Vec::new());
        }
    }
    let query_emb = embed_one(query)?;
    let all = crate::app_db::get_all_embeddings(&app)?;
    let mut scored: Vec<(String, f32)> = all
        .into_iter()
        .map(|(id, emb)| {
            let s = cosine(&query_emb, &emb);
            (id, s)
        })
        .filter(|(_, s)| *s > 0.3)
        .collect();
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let lim = limit.unwrap_or(8).clamp(1, 20) as usize;
    scored.truncate(lim);
    if scored.is_empty() {
        return Ok(Vec::new());
    }
    let ids: Vec<String> = scored.iter().map(|(id, _)| id.clone()).collect();
    let scores: std::collections::HashMap<String, f32> = scored.into_iter().collect();
    let connection = crate::app_db::open_database(&app)?;
    let mut out = Vec::new();
    for id in ids {
        let entry = connection
            .query_row(
                "SELECT id, kind, scope, value, subtitle, metadata_json, use_count, selected_count, ignored_count, last_used_at
                 FROM unified_index WHERE id = ?1",
                rusqlite::params![id],
                |row| {
                    let metadata_text: String = row.get(5)?;
                    Ok(crate::app_db::UnifiedIndexEntry {
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
                },
            )
            .ok();
        if let Some(mut e) = entry {
            // boost with semantic score
            if let Some(s) = scores.get(&e.id) {
                // store semantic score in use_count? no, just return as is, frontend will recompute
                // we abuse last_used_at? better to just return and frontend will blend
                // For now, we set use_count to semantic*100 for sorting hint
                e.use_count = (*s * 100.0) as i64;
            }
            out.push(e);
        }
    }
    Ok(out)
}
