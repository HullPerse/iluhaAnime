#![allow(
    linker_messages,
    clippy::needless_pass_by_value,
    clippy::unnecessary_wraps,
    clippy::missing_panics_doc,
    clippy::too_many_lines,
    clippy::large_stack_frames
)]

use std::collections::{HashMap, HashSet};
use std::num::NonZeroU32;
use std::sync::Arc;
use tauri::{Emitter, Manager};

mod anilist;
mod app_db;

#[doc(hidden)]
pub mod benchmark_api {
    pub use crate::anilist::{franchise_query_body, franchise_query_metrics};
}
mod auth;
mod bencode;
mod errors;
mod ffmpeg;
mod file_index;
mod fswatcher;
mod jikan;
mod progress;
mod realcugan;
mod rife;
mod scrapers;
mod shaders;
mod sqlite_browser;
mod tmdb;
mod torrent;
mod user_assets;
mod video;
use file_index::FileEntry;
use torrent::{
    FilePriority, TorrentCheckResult, TorrentFileInfo, TorrentInfo, TorrentInfoResult,
    TorrentLimits, TorrentManager,
};
use video::{ActiveChildren, CancelFlag};

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

pub(crate) struct TorrentBackend {
    cell: tokio::sync::OnceCell<Result<Arc<TorrentManager>, String>>,
    notify: tokio::sync::Notify,
}

async fn backend_manager(
    backend: &tauri::State<'_, TorrentBackend>,
) -> Result<Arc<TorrentManager>, String> {
    tokio::time::timeout(std::time::Duration::from_secs(120), async {
        loop {
            if let Some(ready) = backend.cell.get() {
                return ready.clone();
            }
            backend.notify.notified().await;
        }
    })
    .await
    .map_err(|_| "torrent engine is still starting".to_string())?
}

#[tauri::command]
async fn start_torrent_download(
    magnet: String,
    save_dir: String,
    only_files: Option<Vec<usize>>,
    sub_folder: Option<String>,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<usize, String> {
    backend_manager(&manager)
        .await?
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
    backend_manager(&manager)
        .await?
        .get_torrent_info(magnet, save_dir)
        .await
}

#[tauri::command]
async fn start_torrent_download_from_file(
    file_bytes: Vec<u8>,
    save_dir: String,
    only_files: Option<Vec<usize>>,
    sub_folder: Option<String>,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<usize, String> {
    backend_manager(&manager)
        .await?
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
    backend_manager(&manager)
        .await?
        .get_torrent_info_from_bytes(file_bytes, save_dir)
        .await
}

#[tauri::command]
async fn list_torrents(
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<Vec<TorrentInfo>, String> {
    Ok(backend_manager(&manager).await?.collect_torrents())
}

#[tauri::command]
async fn pause_torrent(
    id: usize,
    info_hash: Option<String>,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<(), String> {
    backend_manager(&manager)
        .await?
        .pause_torrent(id, info_hash)
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn resume_torrent(
    id: usize,
    info_hash: Option<String>,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<(), String> {
    backend_manager(&manager)
        .await?
        .resume_torrent(id, info_hash)
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn remove_torrent(
    id: usize,
    delete_files: bool,
    info_hash: Option<String>,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<(), String> {
    backend_manager(&manager)
        .await?
        .remove_torrent(id, delete_files, info_hash)
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
    let file_path = std::path::Path::new(&path);
    let is_torrent = file_path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("torrent"));
    if !is_torrent {
        return Err("Ожидался файл с расширением .torrent".to_string());
    }

    const MAX_TORRENT_BYTES: u64 = 64 * 1024 * 1024;
    let metadata = tokio::fs::metadata(file_path)
        .await
        .map_err(|e| format!("metadata: {e:#}"))?;
    if !metadata.is_file() {
        return Err("Указанный путь не является файлом".to_string());
    }
    if metadata.len() > MAX_TORRENT_BYTES {
        return Err("Файл торрента слишком большой".to_string());
    }

    tokio::fs::read(file_path)
        .await
        .map_err(|e| format!("read: {e:#}"))
}

#[tauri::command]
fn list_system_fonts() -> Result<Vec<String>, String> {
    #[cfg(windows)]
    {
        use std::collections::HashSet;
        use windows::Win32::Foundation::LPARAM;
        use windows::Win32::Graphics::Gdi::{
            EnumFontFamiliesExW, GetDC, ReleaseDC, DEFAULT_CHARSET, LOGFONTW, TEXTMETRICW,
        };

        unsafe extern "system" fn collect_family(
            lplf: *const LOGFONTW,
            _lptm: *const TEXTMETRICW,
            _font_type: u32,
            lparam: LPARAM,
        ) -> i32 {
            let set = &mut *(lparam.0 as *mut HashSet<String>);
            if !lplf.is_null() {
                let lf = &*lplf;
                let len = lf
                    .lfFaceName
                    .iter()
                    .position(|&c| c == 0)
                    .unwrap_or(lf.lfFaceName.len());
                let name = String::from_utf16_lossy(&lf.lfFaceName[..len]);
                let name = name.trim();
                if !name.is_empty() {
                    set.insert(name.to_string());
                }
            }
            1
        }

        let mut families: HashSet<String> = HashSet::new();
        let hdc = unsafe { GetDC(None) };
        if !hdc.is_invalid() {
            let mut logfont: LOGFONTW = Default::default();
            logfont.lfCharSet = DEFAULT_CHARSET;
            let set_ptr = &mut families as *mut HashSet<String>;
            unsafe {
                EnumFontFamiliesExW(
                    hdc,
                    &logfont,
                    Some(collect_family),
                    LPARAM(set_ptr as isize),
                    0,
                );
                ReleaseDC(None, hdc);
            }
        }

        for hive in [
            winreg::enums::HKEY_LOCAL_MACHINE,
            winreg::enums::HKEY_CURRENT_USER,
        ] {
            let root = winreg::RegKey::predef(hive);
            if let Ok(fonts_key) =
                root.open_subkey("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts")
            {
                for (name, _) in fonts_key.enum_values().filter_map(Result::ok) {
                    let family = name.split(" (").next().unwrap_or(&name).trim().to_string();
                    if !family.is_empty() {
                        families.insert(family);
                    }
                }
            }
        }

        let mut list: Vec<String> = families.into_iter().collect();
        list.sort_by_key(|a| a.to_lowercase());
        Ok(list)
    }
    #[cfg(not(windows))]
    {
        Ok(vec![
            "Arial".to_string(),
            "Segoe UI".to_string(),
            "MS Sans Serif".to_string(),
        ])
    }
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

        for entry in walkdir::WalkDir::new(&path_clone).follow_links(false) {
            let entry = entry.map_err(|e| format!("walkdir error: {e}"))?;

            if entry.file_type().is_dir() {
                continue;
            }

            walked += 1;

            if walked.is_multiple_of(100) {
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
async fn delete_extra_file(path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let p = std::path::Path::new(&path);
        let file_name = p
            .file_name()
            .ok_or_else(|| "invalid path".to_string())?
            .to_string_lossy()
            .to_string();
        if !file_name.contains("_upscaled") && !file_name.contains("_converted") {
            return Err("not an extra file".to_string());
        }
        let canonical = std::fs::canonicalize(&path).map_err(|e| format!("{e}"))?;
        std::fs::remove_file(&canonical).map_err(|e| format!("{e:#}"))
    })
    .await
    .map_err(|e| format!("delete task failed: {e}"))?
}

#[tauri::command]
async fn scan_extra_files(path: String) -> Result<Vec<VideoFileEntry>, String> {
    let entries = tokio::task::spawn_blocking(move || -> Result<Vec<VideoFileEntry>, String> {
        let mut entries = Vec::new();
        for entry in walkdir::WalkDir::new(&path).follow_links(false) {
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
            let lower = name.to_lowercase();
            if !lower.contains("_upscaled") && !lower.contains("_converted") {
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
async fn set_global_speed_limits(
    download_bps: Option<u32>,
    upload_bps: Option<u32>,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<(), String> {
    backend_manager(&manager).await?.set_global_limits(
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
    backend_manager(&manager)
        .await?
        .get_running_torrent_files(id)
}

#[tauri::command]
async fn save_session_config(
    config: torrent::SessionConfig,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<(), String> {
    backend_manager(&manager).await?.save_session_config(config);
    Ok(())
}

#[tauri::command]
async fn update_torrent_only_files(
    id: usize,
    only_files: Vec<usize>,
    info_hash: Option<String>,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<(), String> {
    backend_manager(&manager)
        .await?
        .update_torrent_only_files(id, only_files, info_hash)
        .await
}

#[tauri::command]
async fn set_file_priority(
    id: usize,
    file_indices: Vec<usize>,
    priority: String,
    info_hash: Option<String>,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<(), String> {
    let priority_enum = match priority.as_str() {
        "do_not_download" => FilePriority::DoNotDownload,
        "normal" => FilePriority::Normal,
        _ => return Err("Invalid priority. Use: do_not_download, normal".to_string()),
    };
    backend_manager(&manager)
        .await?
        .set_file_priority(id, file_indices, priority_enum, info_hash)
        .await
}

#[tauri::command]
async fn redownload_file(
    id: usize,
    file_index: usize,
    info_hash: String,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<usize, String> {
    backend_manager(&manager)
        .await?
        .redownload_file(id, file_index, info_hash)
        .await
}

#[tauri::command]
async fn start_watching_folders(
    watcher: tauri::State<'_, std::sync::Mutex<fswatcher::FolderWatcher>>,
    app_handle: tauri::AppHandle,
    folders: Vec<String>,
) -> Result<(), String> {
    watcher
        .lock()
        .map_err(|e| format!("lock: {e}"))?
        .start(app_handle, folders)
}

#[tauri::command]
async fn stop_watching_folders(
    watcher: tauri::State<'_, std::sync::Mutex<fswatcher::FolderWatcher>>,
) -> Result<(), String> {
    watcher.lock().map_err(|e| format!("lock: {e}"))?.stop();
    Ok(())
}

#[tauri::command]
async fn set_sequential_download(
    id: usize,
    enabled: bool,
    info_hash: Option<String>,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<(), String> {
    backend_manager(&manager)
        .await?
        .set_sequential_download(id, enabled, info_hash)
        .await
}

#[tauri::command]
async fn recheck_torrent(
    id: usize,
    info_hash: Option<String>,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<TorrentCheckResult, String> {
    backend_manager(&manager)
        .await?
        .recheck_torrent(id, info_hash)
}

#[tauri::command]
async fn set_torrent_limits(
    id: usize,
    limits: TorrentLimits,
    info_hash: Option<String>,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<(), String> {
    backend_manager(&manager)
        .await?
        .set_torrent_limits(id, limits, info_hash)
        .await
}

#[tauri::command]
async fn get_torrent_limits(
    id: usize,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<TorrentLimits, String> {
    Ok(backend_manager(&manager).await?.get_torrent_limits(id))
}

async fn persist_file_index(
    app_handle: &tauri::AppHandle,
    indexer: &file_index::FileIndexer,
) -> Result<(), String> {
    let entries = indexer.snapshot().await;
    let unified_entries: Vec<_> = entries
        .into_iter()
        .map(|entry| app_db::UnifiedIndexEntryInput {
            id: format!("local:{}", entry.path),
            kind: "local_file".to_string(),
            scope: "player".to_string(),
            value: entry.name,
            subtitle: Some(entry.path),
            metadata: Some(serde_json::json!({ "size": entry.size })),
        })
        .collect();
    let keep_ids = unified_entries
        .iter()
        .map(|entry| entry.id.clone())
        .collect();
    for batch in unified_entries.chunks(5_000) {
        app_db::upsert_unified_index(app_handle.clone(), batch.to_vec())?;
    }
    app_db::prune_unified_index_scope(app_handle.clone(), "player".into(), keep_ids)?;
    Ok(())
}

#[tauri::command]
async fn rebuild_file_index(
    app_handle: tauri::AppHandle,
    paths: Vec<String>,
    extensions: Vec<String>,
    indexer: tauri::State<'_, file_index::FileIndexer>,
) -> Result<(), String> {
    indexer.rebuild(paths, extensions).await?;
    persist_file_index(&app_handle, &indexer).await
}

#[tauri::command]
async fn refresh_file_index(
    app_handle: tauri::AppHandle,
    paths: Vec<String>,
    extensions: Vec<String>,
    indexer: tauri::State<'_, file_index::FileIndexer>,
) -> Result<(), String> {
    indexer.refresh(paths, extensions).await?;
    persist_file_index(&app_handle, &indexer).await
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
    drop(c);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("iluhaanime=info,tauri=warn"));
    if let Err(error) = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(false)
        .compact()
        .try_init()
    {
        eprintln!("unable to initialize tracing subscriber: {error}");
    }
    tracing::info!("starting iluhaAnime backend");

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
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

            let app_data = app.path().app_data_dir().unwrap_or_else(|e| {
                eprintln!("Failed to get app data dir: {e}");
                std::path::PathBuf::from(".")
            });
            if let Err(error) = app_db::open_database(app.handle()) {
                tracing::error!("unable to initialize shared app database: {error}");
            }
            let handle = app.handle().clone();
            handle.manage(std::sync::Mutex::new(NotificationConfig::default()));
            handle.manage(CancelFlag::new());
            handle.manage(ActiveChildren::new());
            handle.manage(progress::StreamRegistry::new());
            handle.manage(std::sync::Mutex::new(fswatcher::FolderWatcher::new()));
            handle.manage(file_index::FileIndexer::new());

            handle.manage(TorrentBackend {
                cell: tokio::sync::OnceCell::new(),
                notify: tokio::sync::Notify::new(),
            });
            tauri::async_runtime::spawn(async move {
                let manager =
                    match TorrentManager::new(app_data).await {
                        Ok(m) => Arc::new(m),
                        Err(e) => {
                            let _ = handle.emit("show-notification", serde_json::json!({
                        "title": "Критическая ошибка",
                        "body": format!("Не удалось инициализировать торрент-сессию: {e}"),
                        "type": "error",
                    }));
                            handle
                                .state::<TorrentBackend>()
                                .cell
                                .set(Err(format!("{e:#}")))
                                .ok();
                            handle.state::<TorrentBackend>().notify.notify_one();
                            return;
                        }
                    };
                let app_clone = handle.clone();
                let mgr_clone = manager.clone();
                handle.state::<TorrentBackend>().cell.set(Ok(manager)).ok();
                handle.state::<TorrentBackend>().notify.notify_one();
                tokio::spawn(async move {
                    let mut prev_states: HashMap<usize, (bool, Option<String>)> = HashMap::new();
                    let mut notified_errors: HashMap<usize, String> = HashMap::new();
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
                            let cfg = cfg_state
                                .lock()
                                .unwrap_or_else(std::sync::PoisonError::into_inner);

                            for t in &torrents {
                                let prev = prev_states.get(&t.id);
                                let prev_finished = prev.is_some_and(|(f, _)| *f);

                                if cfg.enabled {
                                    if cfg.on_complete
                                        && t.finished
                                        && !prev_finished
                                        && t.total_bytes > 0
                                    {
                                        let _ = app_clone.emit(
                                            "show-notification",
                                            serde_json::json!({
                                                "title": "Загрузка завершена",
                                                "body": &t.name,
                                                "type": "success",
                                                "eventKey": format!(
                                                    "torrent-complete:{}:{}",
                                                    t.id, t.info_hash
                                                ),
                                            }),
                                        );
                                    }

                                    if cfg.on_error {
                                        if let Some(error) = t.error.as_deref() {
                                            let already_notified = notified_errors
                                                .get(&t.id)
                                                .is_some_and(|last| last == error);
                                            if !already_notified {
                                                let msg = format!("{}: {}", t.name, error);
                                                let _ = app_clone.emit(
                                                    "show-notification",
                                                    serde_json::json!({
                                                        "title": "Ошибка загрузки",
                                                        "body": &msg,
                                                        "type": "error",
                                                    }),
                                                );
                                                notified_errors.insert(t.id, error.to_string());
                                            }
                                        }
                                    }
                                }

                                prev_states.insert(t.id, (t.finished, t.error.clone()));
                            }
                        }

                        let current_ids: HashSet<usize> = torrents.iter().map(|t| t.id).collect();
                        prev_states.retain(|id, _| current_ids.contains(id));
                        notified_errors.retain(|id, _| current_ids.contains(id));

                        {
                            let ids: Vec<usize> = mgr_clone
                                .sequential_torrents
                                .iter()
                                .map(|r| *r.key())
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
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scrapers::search_erairaws,
            scrapers::search_nyaa,
            scrapers::search_sukebei,
            scrapers::search_rutracker,
            scrapers::search_nekobt,
            scrapers::get_torrent_details,
            scrapers::clients::fetch_torrent_bytes,
            auth::rutracker_login,
            auth::rutracker_set_cookies,
            auth::rutracker_webview_login,
            auth::rutracker_finish_webview_login,
            auth::check_rutracker_session,
            auth::rutracker_logout,
            auth::rutracker_get_torrent_bytes,
            auth::rutracker_get_magnet,
            auth::erai_webview_login,
            auth::erai_finish_webview_login,
            auth::erai_open_page,
            auth::check_erai_session,
            auth::erai_logout,
            auth::nekobt_set_api_key,
            auth::check_nekobt_session,
            auth::nekobt_logout,
            video::upscale_video,
            video::preview_upscale_frames,
            video::suggest_upscale_preset,
            video::estimate_upscale_time,
            realcugan::check_realcugan,
            realcugan::download_realcugan,
            realcugan::remove_realcugan,
            rife::check_rife,
            rife::download_rife,
            rife::remove_rife,
            video::convert_video,
            video::cancel_upscale,
            video::check_gpu_encoders,
            shaders::list_anime4k_shaders,
            shaders::default_anime4k_shaders,
            ffmpeg::check_ffprobe,
            ffmpeg::download_ffmpeg,
            ffmpeg::remove_ffmpeg,
            anilist::search_anilist,
            anilist::search_anilist_by_studio,
            anilist::get_profile_recommendations,
            anilist::get_anime_recommendations,
            anilist::search_anilist_by_tag,
            anilist::search_anilist_by_genre,
            anilist::get_anime_by_id,
            anilist::client::test_anilist_connection,
            jikan::get_anime_stills,
            anilist::get_anilist_profile,
            anilist::anilist_login,
            anilist::check_anilist_auth,
            anilist::get_anilist_lists,
            anilist::anilist_logout,
            anilist::save_anilist_entry,
            anilist::toggle_favourite,
            anilist::get_favourites,
            anilist::get_favourite_people,
            anilist::toggle_favourite_staff,
            anilist::toggle_favourite_character,
            anilist::get_anime_characters,
            anilist::get_anime_staff,
            anilist::get_staff_characters,
            anilist::get_character_media,
            anilist::get_anilist_activity,
            anilist::get_anime_franchise,
            anilist::prefetch_anime_relations,
            anilist::cancel_anime_prefetch,
            anilist::sync_franchise_to_index,
            user_assets::import_user_image,
            user_assets::import_dither_image,
            user_assets::download_remote_image,
            user_assets::fetch_remote_image,
            user_assets::list_user_images,
            user_assets::get_remote_images_stats,
            user_assets::clear_remote_image_cache,
            user_assets::list_dither_image_meta,
            user_assets::get_user_image,
            user_assets::get_dither_images,
            user_assets::get_dither_image,
            user_assets::update_dither_image_data,
            user_assets::delete_dither_image,
            user_assets::delete_user_image,
            app_db::get_app_cache,
            app_db::put_app_cache,
            app_db::delete_app_cache,
            app_db::upsert_unified_index,
            app_db::clear_unified_index_scope,
            app_db::optimize_unified_index,
            app_db::record_unified_index_action,
            app_db::search_unified_index,
            app_db::list_collection_statuses,
            app_db::upsert_collection_status,
            app_db::delete_collection_status,
            app_db::list_collection_items,
            app_db::upsert_collection_item,
            app_db::import_collection_items_batch,
            app_db::patch_collection_item,
            app_db::delete_collection_item,
            app_db::list_custom_field_defs,
            app_db::upsert_custom_field_def,
            app_db::delete_custom_field_def,
            app_db::export_collection_data,
            app_db::export_collection_zip,
            app_db::import_collection_data,
            tmdb::search_tmdb,
            tmdb::get_tmdb_details,
            tmdb::get_tmdb_media,
            tmdb::get_tmdb_rate_limit,
            tmdb::test_tmdb_connection,
            scrapers::test_source_connection,
            sqlite_browser::reset_sqlite_data,
            sqlite_browser::list_sqlite_databases,
            sqlite_browser::get_sqlite_tables,
            sqlite_browser::get_sqlite_rows,
            sqlite_browser::delete_sqlite_row,
            sqlite_browser::delete_sqlite_rows,
            sqlite_browser::write_sqlite_export,
            sqlite_browser::update_sqlite_cell,
            sqlite_browser::get_sqlite_cell,
            sqlite_browser::get_sqlite_cell_blob,
            sqlite_browser::run_sqlite_query,
            sqlite_browser::backup_sqlite_database,
            sqlite_browser::list_sqlite_backups,
            sqlite_browser::restore_sqlite_backup,
            sqlite_browser::vacuum_sqlite_database,
            start_torrent_download,
            get_torrent_info,
            list_torrents,
            pause_torrent,
            resume_torrent,
            remove_torrent,
            list_system_fonts,
            scan_video_folder,
            scan_extra_files,
            delete_extra_file,
            start_watching_folders,
            stop_watching_folders,
            set_global_speed_limits,
            get_running_torrent_files,
            save_session_config,
            update_torrent_only_files,
            set_file_priority,
            redownload_file,
            set_sequential_download,
            recheck_torrent,
            set_torrent_limits,
            get_torrent_limits,
            get_torrent_info_from_file,
            start_torrent_download_from_file,
            read_file_bytes,
            rebuild_file_index,
            refresh_file_index,
            set_notification_settings,
            search_file_index,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                tracing::info!("shutting down iluhaAnime backend");
                let cancel = app_handle.state::<CancelFlag>();
                cancel.cancel();
                let children = app_handle.state::<ActiveChildren>();
                children.kill_all();
            }
        });
}
