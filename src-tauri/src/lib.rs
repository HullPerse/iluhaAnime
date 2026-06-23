use std::collections::{HashMap, HashSet};
use std::num::NonZeroU32;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

mod scrapers;
mod auth;
mod bencode;
mod video;
mod torrent;

use torrent::{TorrentFileInfo, TorrentInfo, TorrentInfoResult, TorrentManager};

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

#[tauri::command]
fn get_app_data_path(app_handle: tauri::AppHandle) -> Result<String, String> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create dir: {e}"))?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, &content).map_err(|e| format!("Write error: {e}"))
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Read error: {e}"))
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
fn get_running_torrent_files(
    id: usize,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<Vec<TorrentFileInfo>, String> {
    manager.manager.get_running_torrent_files(id)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let app_data = app.path().app_data_dir().expect("app data dir");
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async {
                let manager = TorrentManager::new(app_data)
                    .await
                    .expect("failed to initialize torrent session");
                let manager = Arc::new(manager);
                let app_clone = handle.clone();
                let mgr_clone = manager.clone();
                tokio::spawn(async move {
                    let mut prev_states: HashMap<usize, (bool, Option<String>)> = HashMap::new();
                    let mut cleanup_counter: u32 = 0;
                    loop {
                        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                        let torrents = mgr_clone.collect_torrents();
                        let _ = app_clone.emit("torrents-update", &torrents);

                        for t in &torrents {
                            let prev = prev_states.get(&t.id);
                            let prev_finished = prev.map(|(f, _)| *f).unwrap_or(false);
                            let prev_error = prev.and_then(|(_, e)| e.clone());

                            if t.finished && !prev_finished && t.total_bytes > 0 {
                                let _ = app_clone
                                    .notification()
                                    .builder()
                                    .title("Загрузка завершена")
                                    .body(&t.name)
                                    .show();
                            }

                            if t.error.is_some() && prev_error.is_none() {
                                let msg =
                                    format!("{}: {}", t.name, t.error.as_deref().unwrap_or(""));
                                let _ = app_clone
                                    .notification()
                                    .builder()
                                    .title("Ошибка загрузки")
                                    .body(&msg)
                                    .show();
                            }

                            prev_states.insert(t.id, (t.finished, t.error.clone()));
                        }

                        let current_ids: HashSet<usize> = torrents.iter().map(|t| t.id).collect();
                        prev_states.retain(|id, _| current_ids.contains(id));

                        cleanup_counter += 1;
                        if cleanup_counter >= 30 {
                            cleanup_counter = 0;
                            mgr_clone.cleanup_unselected_files();
                        }
                    }
                });
                handle.manage(TorrentBackend { manager });
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scrapers::search_erairaws,
            scrapers::search_nyaa,
            scrapers::search_rutracker,
            scrapers::search_nekobt,
            auth::rutracker_login,
            auth::check_rutracker_session,
            auth::rutracker_logout,
            auth::rutracker_get_magnet,
            auth::nekobt_set_api_key,
            auth::check_nekobt_session,
            auth::nekobt_logout,
            video::get_video_chapters,
            video::get_video_streams,
            video::extract_video_subtitle,
            video::remux_video_audio,
            video::scan_external_tracks,
            video::remux_with_external_audio,
            video::convert_external_subtitle,
            video::check_ffprobe,
            video::get_video_info,
            video::download_ffmpeg,
            video::scan_video_folder,
            start_torrent_download,
            get_torrent_info,
            list_torrents,
            pause_torrent,
            resume_torrent,
            remove_torrent,
            get_app_data_path,
            write_text_file,
            read_text_file,
            set_global_speed_limits,
            get_running_torrent_files,
            update_torrent_only_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
