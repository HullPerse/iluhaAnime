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
mod progress;
mod scrapers;
mod scanner;
mod stream;
mod thumbnails;
mod tracks;
mod torrent;
mod video;
use torrent::{FilePriority, TorrentFileInfo, TorrentInfo, TorrentInfoResult, TorrentManager};
use video::CancelFlag;

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
fn cleanup_temp_file(path: String) -> Result<(), String> {
    std::fs::remove_file(&path).map_err(|e| format!("{e}"))
}

#[tauri::command]
async fn get_stream_port() -> Result<u16, String> {
    stream::server_port().ok_or_else(|| "stream server not started".to_string())
}

#[tauri::command]
fn shutdown_stream() {
    stream::shutdown();
}

#[tauri::command]
fn get_progress(id: u64, registry: tauri::State<'_, progress::ProgressRegistry>) -> Option<f64> {
    registry.get(id)
}

#[tauri::command]
async fn clear_all_caches(app_handle: tauri::AppHandle) -> Result<(), String> {
    video::clear_audio_cache(app_handle.clone()).await?;
    video::clear_subtitle_cache(app_handle.clone()).await?;
    thumbnails::clear_thumbnail_cache(app_handle.clone())?;
    Ok(())
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

#[tauri::command]
async fn set_file_priority(
    id: usize,
    file_indices: Vec<usize>,
    priority: String,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<(), String> {
    let priority_enum = match priority.as_str() {
        "do_not_download" => FilePriority::DoNotDownload,
        "low" => FilePriority::Low,
        "normal" => FilePriority::Normal,
        "high" => FilePriority::High,
        _ => return Err("Invalid priority. Use: do_not_download, low, normal, high".to_string()),
    };
    manager
        .manager
        .set_file_priority(id, file_indices, priority_enum)
        .await
}

#[tauri::command]
async fn set_sequential_download(
    id: usize,
    enabled: bool,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<(), String> {
    manager.manager.set_sequential_download(id, enabled).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
                    let _ = app.get_webview_window("main")
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

            // Cache ffmpeg path for non-command contexts (stream server, etc.)
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
                handle.manage(TorrentBackend { manager });
                handle.manage(CancelFlag(Arc::new(AtomicBool::new(false))));
                handle.manage(progress::ProgressRegistry::new());
            });

            // Start the local HTTP stream server for file serving with Range support
            tauri::async_runtime::block_on(async {
                let _ = stream::init().await;
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
            video::extract_video_subtitle,
            video::extract_audio_track,
            video::extract_all_audio_tracks,
            video::cleanup_audio_temp_files,
            video::clear_audio_cache,
            video::check_audio_caches,
            video::check_subtitle_caches,
            video::clear_subtitle_cache,
            video::probe_encoders,
            video::convert_external_subtitle,
            video::get_video_info,
            video::upscale_video,
            video::cancel_upscale,
            video::check_gpu_encoders,
            ffmpeg::check_ffprobe,
            ffmpeg::download_ffmpeg,
            ffmpeg::remove_ffmpeg,
            scanner::scan_video_folder,
            scanner::set_video_extensions,
            tracks::scan_folder_for_tracks,
            scanner::get_video_extensions,
            scanner::set_audio_extensions,
            scanner::get_audio_extensions,
            scanner::set_subtitle_extensions,
            scanner::get_subtitle_extensions,
            thumbnails::generate_thumbnails,
            thumbnails::get_thumbnail_cache_info,
            thumbnails::clear_thumbnail_cache,
            thumbnails::delete_thumbnails_for_paths,
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
            anilist::get_anilist_activity,
            start_torrent_download,
            get_torrent_info,
            list_torrents,
            pause_torrent,
            resume_torrent,
            remove_torrent,
            cleanup_temp_file,
            get_stream_port,
            shutdown_stream,
            get_progress,
            clear_all_caches,
            set_global_speed_limits,
            get_running_torrent_files,
            update_torrent_only_files,
            set_file_priority,
            set_sequential_download,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                stream::shutdown();
            }
        });
}
