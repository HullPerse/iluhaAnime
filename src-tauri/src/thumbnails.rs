use serde::Serialize;
use sha1::Digest;

use super::video;

fn path_hash(path: &str) -> String {
    let mut hasher = sha1::Sha1::new();
    hasher.update(path.as_bytes());
    hex::encode(hasher.finalize())
}

#[derive(Serialize)]
pub struct CacheInfo {
    pub size_bytes: u64,
    pub path_count: u32,
}

#[tauri::command]
pub fn get_thumbnail_cache_info(app_handle: tauri::AppHandle) -> Result<CacheInfo, String> {
    let thumbs_root = video::ffmpeg_bin_dir(&app_handle).join("thumbs");
    if !thumbs_root.exists() {
        return Ok(CacheInfo { size_bytes: 0, path_count: 0 });
    }
    let mut size_bytes = 0u64;
    let mut path_count = 0u32;
    for entry in std::fs::read_dir(&thumbs_root).map_err(|e| format!("read cache dir: {e}"))? {
        let entry = entry.map_err(|e| format!("entry: {e}"))?;
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        path_count += 1;
        for file in std::fs::read_dir(entry.path()).map_err(|e| format!("read dir: {e}"))? {
            let file = file.map_err(|e| format!("file: {e}"))?;
            size_bytes += file.metadata().map(|m| m.len()).unwrap_or(0);
        }
    }
    Ok(CacheInfo { size_bytes, path_count })
}

#[tauri::command]
pub fn clear_thumbnail_cache(app_handle: tauri::AppHandle) -> Result<(), String> {
    let thumbs_root = video::ffmpeg_bin_dir(&app_handle).join("thumbs");
    if thumbs_root.exists() {
        std::fs::remove_dir_all(&thumbs_root).map_err(|e| format!("clear cache: {e}"))?;
    }
    std::fs::create_dir_all(&thumbs_root).map_err(|e| format!("create cache dir: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn delete_thumbnails_for_paths(app_handle: tauri::AppHandle, paths: Vec<String>) -> Result<(), String> {
    let thumbs_root = video::ffmpeg_bin_dir(&app_handle).join("thumbs");
    if !thumbs_root.exists() {
        return Ok(());
    }
    for p in &paths {
        let dir = thumbs_root.join(path_hash(p));
        if dir.exists() {
            std::fs::remove_dir_all(&dir).map_err(|e| format!("delete thumbnail {p}: {e}"))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn generate_thumbnails(
    app_handle: tauri::AppHandle,
    video_path: String,
    interval: f64,
) -> Result<Vec<String>, String> {
    let ffmpeg = video::ffmpeg_exe(&app_handle);
    let thumbs_root = video::ffmpeg_bin_dir(&app_handle).join("thumbs");
    let out_dir = thumbs_root.join(path_hash(&video_path));

    for entry in std::fs::read_dir(&out_dir)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(|e| e.ok())
    {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with("thumb_") {
            let _ = std::fs::remove_file(entry.path());
        }
    }

    if out_dir.exists() {
        let mut existing: Vec<String> = Vec::new();
        let mut entries: Vec<_> = std::fs::read_dir(&out_dir)
            .map_err(|e| format!("read thumbs dir: {e}"))?
            .filter_map(|e| e.ok())
            .collect();
        entries.sort_by_key(|e| e.file_name());
        for entry in &entries {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with("thumb_") {
                existing.push(entry.path().to_string_lossy().to_string());
            }
        }
        if !existing.is_empty() {
            return Ok(existing);
        }
    }

    std::fs::create_dir_all(&out_dir).map_err(|e| format!("create thumbs dir: {e}"))?;

    let status = std::process::Command::new(&ffmpeg)
        .args([
            "-hwaccel",
            "auto",
            "-skip_frame",
            "nokey",
            "-i",
            &video_path,
            "-vf",
            &format!("fps=1/{interval},scale=160:-2"),
            "-q:v",
            "20",
        ])
        .arg(out_dir.join("thumb_%04d.jpg").to_string_lossy().to_string())
        .output()
        .map_err(|e| format!("ffmpeg thumbnails: {e}"))?;

    if !status.status.success() {
        let stderr = String::from_utf8_lossy(&status.stderr);
        let _ = std::fs::remove_dir_all(&out_dir);
        return Err(format!("ffmpeg thumbnails failed: {stderr}"));
    }

    let mut thumb_paths: Vec<String> = Vec::new();
    let mut entries: Vec<_> = std::fs::read_dir(&out_dir)
        .map_err(|e| format!("read thumbs dir: {e}"))?
        .filter_map(|e| e.ok())
        .collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in &entries {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with("thumb_") {
            thumb_paths.push(entry.path().to_string_lossy().to_string());
        }
    }

    Ok(thumb_paths)
}
