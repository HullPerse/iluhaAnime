use serde::Serialize;
use tauri::{Emitter, Manager};

#[derive(Debug, Serialize)]
pub struct VideoFileEntry {
    pub path: String,
    pub name: String,
    pub size: u64,
}

#[derive(Clone, Serialize)]
struct FolderScanProgress {
    path: String,
    current: usize,
    total: usize,
    stage: String,
}

fn extensions_path(app_handle: &tauri::AppHandle, name: &str) -> std::path::PathBuf {
    let dir = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    dir.join(format!("{name}_extensions.json"))
}

fn load_extensions(app_handle: &tauri::AppHandle, name: &str) -> Vec<String> {
    let path = extensions_path(app_handle, name);
    if let Ok(data) = std::fs::read_to_string(&path) {
        if let Ok(exts) = serde_json::from_str::<Vec<String>>(&data) {
            if !exts.is_empty() {
                return exts;
            }
        }
    }
    Vec::new()
}

fn default_video_extensions() -> Vec<String> {
    vec![
        "mp4".into(), "mkv".into(), "avi".into(), "mov".into(), "webm".into(),
        "flv".into(), "wmv".into(), "m4v".into(), "mpg".into(), "mpeg".into(),
        "ts".into(), "m2ts".into(), "ogv".into(), "3gp".into(),
    ]
}

fn default_audio_extensions() -> Vec<String> {
    vec![
        "mp3".into(), "flac".into(), "aac".into(), "ogg".into(), "wav".into(),
        "opus".into(), "m4a".into(), "wma".into(),
    ]
}

fn default_subtitle_extensions() -> Vec<String> {
    vec![
        "srt".into(), "ass".into(), "ssa".into(), "vtt".into(),
        "sub".into(), "idx".into(), "sup".into(), "pgs".into(),
    ]
}

fn load_video_extensions(app_handle: &tauri::AppHandle) -> Vec<String> {
    let exts = load_extensions(app_handle, "video");
    if exts.is_empty() { default_video_extensions() } else { exts }
}

fn load_audio_extensions(app_handle: &tauri::AppHandle) -> Vec<String> {
    let exts = load_extensions(app_handle, "audio");
    if exts.is_empty() { default_audio_extensions() } else { exts }
}

fn load_subtitle_extensions(app_handle: &tauri::AppHandle) -> Vec<String> {
    let exts = load_extensions(app_handle, "subtitle");
    if exts.is_empty() { default_subtitle_extensions() } else { exts }
}

fn save_extensions(app_handle: &tauri::AppHandle, name: &str, extensions: Vec<String>) -> Result<(), String> {
    let path = extensions_path(app_handle, name);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("{e}"))?;
    }
    let clean: Vec<String> = extensions
        .into_iter()
        .map(|e| e.trim().to_lowercase())
        .filter(|e| !e.is_empty())
        .collect();
    let data = serde_json::to_string(&clean).map_err(|e| format!("{e}"))?;
    std::fs::write(&path, data).map_err(|e| format!("{e}"))
}

#[tauri::command]
pub fn set_video_extensions(
    app_handle: tauri::AppHandle,
    extensions: Vec<String>,
) -> Result<(), String> {
    save_extensions(&app_handle, "video", extensions)
}

#[tauri::command]
pub fn get_video_extensions(app_handle: tauri::AppHandle) -> Vec<String> {
    load_video_extensions(&app_handle)
}

#[tauri::command]
pub fn set_audio_extensions(
    app_handle: tauri::AppHandle,
    extensions: Vec<String>,
) -> Result<(), String> {
    save_extensions(&app_handle, "audio", extensions)
}

#[tauri::command]
pub fn get_audio_extensions(app_handle: tauri::AppHandle) -> Vec<String> {
    load_audio_extensions(&app_handle)
}

#[tauri::command]
pub fn set_subtitle_extensions(
    app_handle: tauri::AppHandle,
    extensions: Vec<String>,
) -> Result<(), String> {
    save_extensions(&app_handle, "subtitle", extensions)
}

#[tauri::command]
pub fn get_subtitle_extensions(app_handle: tauri::AppHandle) -> Vec<String> {
    load_subtitle_extensions(&app_handle)
}

fn count_video_files(root: &std::path::Path, exts: &[&str]) -> usize {
    let mut count = 0;
    let mut stack: Vec<std::path::PathBuf> = vec![root.to_path_buf()];

    while let Some(dir) = stack.pop() {
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    stack.push(p);
                } else if let Some(e) = p.extension().and_then(|e| e.to_str()) {
                    if exts.contains(&e.to_lowercase().as_str()) {
                        count += 1;
                    }
                }
            }
        }
    }

    count
}

#[tauri::command]
pub async fn scan_video_folder(
    app_handle: tauri::AppHandle,
    path: String,
) -> Result<Vec<VideoFileEntry>, String> {
    let mut media_exts: Vec<String> = load_video_extensions(&app_handle);
    media_exts.extend(load_audio_extensions(&app_handle));
    media_exts.extend(load_subtitle_extensions(&app_handle));
    let exts: Vec<&str> = media_exts.iter().map(|s| s.as_str()).collect();
    let root = std::path::Path::new(&path);
    if !root.is_dir() {
        return Err("Not a directory".to_string());
    }

    let _ = app_handle.emit(
        "folder-scan-progress",
        FolderScanProgress {
            path: path.clone(),
            current: 0,
            total: 0,
            stage: "counting".into(),
        },
    );

    let total = count_video_files(root, &exts);

    let _ = app_handle.emit(
        "folder-scan-progress",
        FolderScanProgress {
            path: path.clone(),
            current: 0,
            total,
            stage: "scanning".into(),
        },
    );

    let mut files: Vec<VideoFileEntry> = Vec::with_capacity(total);
    let mut stack: Vec<std::path::PathBuf> = vec![root.to_path_buf()];
    let mut current = 0usize;

    while let Some(dir) = stack.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_dir() {
                stack.push(entry_path);
                continue;
            }
            let ext = entry_path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_lowercase())
                .unwrap_or_default();
            if !exts.contains(&ext.as_str()) {
                continue;
            }
            let path = entry_path.to_string_lossy().to_string();
            let name = entry_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            let size = match entry.metadata() {
                Ok(m) => m.len(),
                Err(_) => 0,
            };

            files.push(VideoFileEntry {
                path: path.clone(),
                name,
                size,
            });
            current += 1;
            if current % 5 == 0 || current == total {
                let _ = app_handle.emit(
                    "folder-scan-progress",
                    FolderScanProgress {
                        path: path.clone(),
                        current,
                        total,
                        stage: "scanning".into(),
                    },
                );
            }
        }
    }

    let _ = app_handle.emit(
        "folder-scan-progress",
        FolderScanProgress {
            path: path.clone(),
            current: total,
            total,
            stage: "done".into(),
        },
    );

    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(files)
}
