#![allow(linker_messages)]

use std::collections::{HashMap, HashSet};
use std::num::NonZeroU32;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_single_instance;

mod anilist;
mod auth;
mod bencode;
mod ffmpeg;
mod file_index;
mod fs_utils;
mod fswatcher;
mod progress;
mod scrapers;
mod shaders;
mod torrent;
mod video;
use file_index::FileEntry;
use torrent::{FilePriority, TorrentFileInfo, TorrentInfo, TorrentInfoResult, TorrentManager};
use video::CancelFlag;

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

struct TorrentBackend {
    manager: Arc<TorrentManager>,
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
    std::fs::read(&path).map_err(|e| format!("{e:#}"))
}

#[tauri::command]
fn get_file_size(path: String) -> Result<u64, String> {
    std::fs::metadata(&path)
        .map(|m| m.len())
        .map_err(|e| format!("{e:#}"))
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

        for entry in walkdir::WalkDir::new(&path_clone).follow_links(true) {
            let entry = entry.map_err(|e| format!("walkdir error: {e}"))?;

            if entry.file_type().is_dir() {
                continue;
            }

            walked += 1;

            if walked % 100 == 0 {
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
async fn scan_upscaled_files(path: String) -> Result<Vec<VideoFileEntry>, String> {
    let entries = tokio::task::spawn_blocking(move || -> Result<Vec<VideoFileEntry>, String> {
        let mut entries = Vec::new();
        for entry in walkdir::WalkDir::new(&path).follow_links(true) {
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
            if !name.to_lowercase().contains("_upscaled") {
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
    let mut w = watcher.lock().map_err(|e| format!("lock: {e}"))?;
    w.start(app_handle, folders)
}

#[tauri::command]
async fn stop_watching_folders(
    watcher: tauri::State<'_, std::sync::Mutex<fswatcher::FolderWatcher>>,
) -> Result<(), String> {
    let mut w = watcher.lock().map_err(|e| format!("lock: {e}"))?;
    w.stop();
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
async fn rebuild_file_index(
    paths: Vec<String>,
    extensions: Vec<String>,
    indexer: tauri::State<'_, file_index::FileIndexer>,
) -> Result<(), String> {
    indexer.rebuild(paths, extensions).await
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
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            let _ = app
                .get_webview_window("main")
                .expect("no main window")
                .set_focus();
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            // Clean up orphaned temp files from previous runs
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

            let app_data = app.path().app_data_dir().expect("app data dir");
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async {
                let manager = TorrentManager::new(app_data)
                    .await
                    .expect("failed to initialize torrent session");
                let manager = Arc::new(manager);
                manager.start_http_api();
                let app_clone = handle.clone();
                let mgr_clone = manager.clone();
                tokio::spawn(async move {
                    let mut prev_states: HashMap<usize, (bool, Option<String>)> = HashMap::new();
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
                            let cfg = cfg_state.lock().unwrap_or_else(|e| e.into_inner());

                            for t in &torrents {
                                let prev = prev_states.get(&t.id);
                                let prev_finished = prev.map(|(f, _)| *f).unwrap_or(false);
                                let prev_error = prev.and_then(|(_, e)| e.clone());

                                if cfg.enabled {
                                    if cfg.on_complete
                                        && t.finished
                                        && !prev_finished
                                        && t.total_bytes > 0
                                    {
                                        let _ = app_clone
                                            .notification()
                                            .builder()
                                            .title("Загрузка завершена")
                                            .body(&t.name)
                                            .show();
                                        let _ = app_clone.emit(
                                            "show-notification",
                                            serde_json::json!({
                                                "title": "Загрузка завершена",
                                                "body": &t.name,
                                                "type": "success",
                                            }),
                                        );
                                    }

                                    if cfg.on_error && t.error.is_some() && prev_error.is_none() {
                                        let msg = format!(
                                            "{}: {}",
                                            t.name,
                                            t.error.as_deref().unwrap_or("")
                                        );
                                        let _ = app_clone
                                            .notification()
                                            .builder()
                                            .title("Ошибка загрузки")
                                            .body(&msg)
                                            .show();
                                        let _ = app_clone.emit(
                                            "show-notification",
                                            serde_json::json!({
                                                "title": "Ошибка загрузки",
                                                "body": &msg,
                                                "type": "error",
                                            }),
                                        );
                                    }
                                }

                                prev_states.insert(t.id, (t.finished, t.error.clone()));
                            }
                        }

                        let current_ids: HashSet<usize> = torrents.iter().map(|t| t.id).collect();
                        prev_states.retain(|id, _| current_ids.contains(id));

                        {
                            let ids: Vec<usize> = mgr_clone
                                .sequential_torrents
                                .lock()
                                .unwrap()
                                .iter()
                                .copied()
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
                handle.manage(std::sync::Mutex::new(NotificationConfig::default()));
                handle.manage(TorrentBackend { manager });
                handle.manage(CancelFlag(Arc::new(AtomicBool::new(false))));
                handle.manage(progress::StreamRegistry::new());
                handle.manage(std::sync::Mutex::new(fswatcher::FolderWatcher::new()));
                handle.manage(file_index::FileIndexer::new());
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scrapers::search_erairaws,
            scrapers::search_nyaa,
            scrapers::search_sukebei,
            scrapers::search_rutracker,
            scrapers::search_nekobt,
            auth::rutracker_login,
            auth::check_rutracker_session,
            auth::rutracker_logout,
            auth::rutracker_get_magnet,
            auth::nekobt_set_api_key,
            auth::check_nekobt_session,
            auth::nekobt_logout,
            video::upscale_video,
            video::cancel_upscale,
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
            start_torrent_download,
            get_torrent_info,
            list_torrents,
            pause_torrent,
            resume_torrent,
            remove_torrent,
            scan_video_folder,
            scan_upscaled_files,
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
            get_torrent_info_from_file,
            start_torrent_download_from_file,
            read_file_bytes,
            get_file_size,
            rebuild_file_index,
            set_notification_settings,
            search_file_index,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {});
}
