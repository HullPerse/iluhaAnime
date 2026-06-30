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

fn video_extensions_path(app_handle: &tauri::AppHandle) -> std::path::PathBuf {
    let dir = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    dir.join("video_extensions.json")
}

fn load_video_extensions(app_handle: &tauri::AppHandle) -> Vec<String> {
    let path = video_extensions_path(app_handle);
    if let Ok(data) = std::fs::read_to_string(&path) {
        if let Ok(exts) = serde_json::from_str::<Vec<String>>(&data) {
            if !exts.is_empty() {
                return exts;
            }
        }
    }
    vec![
        "mp4".into(), "mkv".into(), "avi".into(), "mov".into(), "webm".into(),
        "flv".into(), "wmv".into(), "m4v".into(), "mpg".into(), "mpeg".into(),
        "ts".into(), "m2ts".into(), "ogv".into(), "3gp".into(),
    ]
}

#[tauri::command]
pub fn set_video_extensions(
    app_handle: tauri::AppHandle,
    extensions: Vec<String>,
) -> Result<(), String> {
    let path = video_extensions_path(&app_handle);
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
pub fn get_video_extensions(app_handle: tauri::AppHandle) -> Vec<String> {
    load_video_extensions(&app_handle)
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
    let video_exts: Vec<String> = load_video_extensions(&app_handle);
    let exts: Vec<&str> = video_exts.iter().map(|s| s.as_str()).collect();
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
