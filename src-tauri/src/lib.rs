#![allow(
    linker_messages,
    clippy::needless_pass_by_value,
    clippy::unnecessary_wraps,
    clippy::missing_panics_doc,
    clippy::too_many_lines,
    clippy::large_stack_frames
)]

use futures::FutureExt;
use std::collections::{HashMap, HashSet};
use std::num::NonZeroU32;
use std::sync::Arc;
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};

mod anilist;
mod app_db;

#[doc(hidden)]
pub mod benchmark_api {
    pub use crate::anilist::{franchise_query_body, franchise_query_metrics};
}
mod auth;
mod bencode;
mod deeplink;
mod errors;
mod ffmpeg;
mod file_index;
mod fswatcher;
mod host_stats;
mod jikan;
mod progress;
mod realcugan;
mod rife;
mod scrapers;
mod screenshot;
mod shaders;
mod sqlite_browser;
mod tmdb;
mod toast;
mod torrent;
mod user_assets;
mod video;
use file_index::FileEntry;
use torrent::{
    CreatedTorrent, FilePriority, TorrentCheckResult, TorrentDiagnostics, TorrentFileInfo,
    TorrentInfo, TorrentInfoResult, TorrentLimits, TorrentManager, TorrentResumeResult,
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

/// Everything the torrent list renders directly. Pushes are throttled to "changed or
/// heartbeat", so a new user-visible field must be added here as well, otherwise the
/// UI keeps showing a stale value for up to `TORRENT_HEARTBEAT_TICKS` seconds.
#[derive(PartialEq)]
struct TorrentUpdateSignature {
    id: usize,
    state: String,
    progress_bytes: u64,
    download_speed_bits: u64,
    upload_speed_bits: u64,
    peers_connected: usize,
    finished: bool,
    error: Option<String>,
    total_bytes: u64,
    uploaded_bytes: u64,
    sequential_download: bool,
    sequential_file: Option<usize>,
    download_order: Vec<usize>,
    missing_files: bool,
    paused_external_changes: bool,
    paused_changed_files: Vec<String>,
}

const TORRENT_HEARTBEAT_TICKS: u32 = 30;
/// Torrents verified per tick. Small on purpose: one pass costs a `stat` per file, so a library
/// of finished torrents fills in over a few seconds instead of stalling a single tick.
const TORRENT_VERIFY_PER_TICK: usize = 2;

#[derive(Default)]
struct TorrentTickState {
    prev_states: HashMap<usize, (bool, Option<String>)>,
    notified_errors: HashMap<usize, String>,
    cleanup_counter: u32,
    ticks_since_emit: u32,
    first_run: bool,
    last_emitted: Vec<TorrentUpdateSignature>,
}

async fn run_torrent_update_tick(
    app: &tauri::AppHandle,
    manager: &Arc<TorrentManager>,
    state: &mut TorrentTickState,
) {
    // A rewrite (limits or trackers) takes a torrent out of the session for a moment. Skipping
    // the tick means the UI is never told a torrent disappeared, and it is told its file list
    // from before the window instead; the next tick reports as usual once the torrent is back.
    if manager.is_rewriting() {
        return;
    }
    // Fills `missing_files` for torrents nothing has checked yet, before the signature is built
    // below: the flag is user-visible, so a verdict arriving after the emit would be a tick late.
    // One pass costs a `stat` per file, so the whole read stays off the async worker.
    let verifier = Arc::clone(manager);
    let torrents = tokio::task::spawn_blocking(move || {
        let mut torrents = verifier.collect_torrents();
        verifier.verify_pending_missing(&mut torrents, TORRENT_VERIFY_PER_TICK);
        verifier.watch_paused_files(&mut torrents);
        torrents
    })
    .await
    .expect("torrent verification task panicked");
    let signature: Vec<TorrentUpdateSignature> = torrents
        .iter()
        .map(|t| TorrentUpdateSignature {
            id: t.id,
            state: t.state.clone(),
            progress_bytes: t.progress_bytes,
            download_speed_bits: t.download_speed.to_bits(),
            upload_speed_bits: t.upload_speed.to_bits(),
            peers_connected: t.peers_connected,
            finished: t.finished,
            error: t.error.clone(),
            total_bytes: t.total_bytes,
            uploaded_bytes: t.uploaded_bytes,
            sequential_download: t.sequential_download,
            sequential_file: t.sequential_file,
            download_order: t.download_order.clone(),
            missing_files: t.missing_files,
            paused_external_changes: t.paused_external_changes,
            paused_changed_files: t.paused_changed_files.clone(),
        })
        .collect();
    if state.first_run
        || state.ticks_since_emit >= TORRENT_HEARTBEAT_TICKS
        || signature != state.last_emitted
    {
        let _ = app.emit("torrents-update", &torrents);
        state.last_emitted = signature;
        state.ticks_since_emit = 0;
    } else {
        state.ticks_since_emit += 1;
    }

    if state.first_run {
        for t in &torrents {
            state
                .prev_states
                .insert(t.id, (t.finished, t.error.clone()));
        }
        state.first_run = false;
    } else {
        let cfg_state = app.state::<std::sync::Mutex<NotificationConfig>>();
        let cfg = cfg_state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);

        for t in &torrents {
            let prev = state.prev_states.get(&t.id);
            let prev_finished = prev.is_some_and(|(f, _)| *f);

            if cfg.enabled {
                if cfg.on_complete && t.finished && !prev_finished && t.total_bytes > 0 {
                    let _ = app.emit(
                        "show-notification",
                        serde_json::json!({
                            "titleKey": "torrent.notify.complete.title",
                            "body": &t.name,
                            "type": "success",
                            "eventKey": format!(
                                "torrent-complete:{}:{}",
                                t.id, t.info_hash
                            ),
                            "action": {
                                "source": "folder",
                                "path": &t.save_dir,
                            },
                        }),
                    );
                }

                if cfg.on_error {
                    if let Some(error) = t.error.as_deref() {
                        let already_notified = state
                            .notified_errors
                            .get(&t.id)
                            .is_some_and(|last| last == error);
                        if !already_notified {
                            let msg = format!("{}: {}", t.name, error);
                            let _ = app.emit(
                                "show-notification",
                                serde_json::json!({
                                    "titleKey": "torrent.notify.error.title",
                                    "body": &msg,
                                    "type": "error",
                                    "action": {
                                        "source": "folder",
                                        "path": &t.save_dir,
                                    },
                                }),
                            );
                            state.notified_errors.insert(t.id, error.to_string());
                        }
                    }
                }
            }

            state
                .prev_states
                .insert(t.id, (t.finished, t.error.clone()));
        }
    }

    let current_ids: HashSet<usize> = torrents.iter().map(|t| t.id).collect();
    state.prev_states.retain(|id, _| current_ids.contains(id));
    state
        .notified_errors
        .retain(|id, _| current_ids.contains(id));

    manager.advance_sequential_torrents().await;

    state.cleanup_counter += 1;
    if state.cleanup_counter >= 30 {
        state.cleanup_counter = 0;
        let cleaner = Arc::clone(manager);
        // Touches every unselected file, so it runs off the async worker. Best effort: a failed
        // scan must not stop the push loop that feeds the torrent list.
        if let Err(error) =
            tokio::task::spawn_blocking(move || cleaner.cleanup_unselected_files()).await
        {
            tracing::warn!("unselected file cleanup task failed: {error}");
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

/// Starts a download. `sequential` is part of the add on purpose: the priority window on the
/// first file is opened as the torrent goes in, instead of a second later by the tick.
#[tauri::command]
async fn start_torrent_download(
    magnet: String,
    save_dir: String,
    only_files: Option<Vec<usize>>,
    sub_folder: Option<String>,
    sequential: Option<bool>,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<usize, String> {
    backend_manager(&manager)
        .await?
        .add_torrent(
            magnet,
            save_dir,
            only_files,
            sub_folder,
            sequential.unwrap_or(false),
        )
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
    sequential: Option<bool>,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<usize, String> {
    backend_manager(&manager)
        .await?
        .add_torrent_from_bytes(
            file_bytes,
            save_dir,
            only_files,
            sub_folder,
            sequential.unwrap_or(false),
        )
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
    let backend = backend_manager(&manager).await?;
    let mut torrents = backend.collect_torrents();
    // The list has to open with the same paused-edits verdict the tick pushes, otherwise a
    // paused torrent would show no badge until its next tick.
    backend.watch_paused_files(&mut torrents);
    Ok(torrents)
}

/// Builds a `.torrent` out of a folder and seeds it in place. Hashing reads every file once,
/// so a big folder can take a while: the command is expected to be awaited behind a loader.
#[tauri::command]
async fn create_torrent_from_folder(
    source_dir: String,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<CreatedTorrent, String> {
    backend_manager(&manager)
        .await?
        .create_torrent_from_folder(source_dir)
        .await
        .map_err(|e| format!("{e:#}"))
}

/// Copies a previously created metainfo to a path the user picked in a save dialog.
///
/// The source is restricted to the created-torrents cache: without that check this command
/// would be a generic "copy any file anywhere" primitive reachable from the webview.
#[tauri::command]
fn save_created_torrent(from: String, to: String, app: tauri::AppHandle) -> Result<(), String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("could not resolve the app data dir: {error}"))?;
    let cache = app_data
        .join("created_torrents")
        .canonicalize()
        .map_err(|error| format!("there is nothing to save: {error}"))?;
    let source = std::path::Path::new(&from)
        .canonicalize()
        .map_err(|error| format!("the torrent file is gone: {error}"))?;
    if !source.starts_with(&cache) {
        return Err("refusing to copy a file outside the created-torrents cache".to_string());
    }
    std::fs::copy(&source, &to).map_err(|error| format!("could not save the torrent: {error}"))?;
    Ok(())
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
) -> Result<TorrentResumeResult, String> {
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
    backend_manager(&manager).await?.save_session_config(config)
}

/// The port the torrent session bound, so Settings can show what to forward when the configured
/// port is `0` (auto).
#[tauri::command]
async fn torrent_listen_port(
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<Option<u16>, String> {
    Ok(backend_manager(&manager).await?.listen_port())
}

#[tauri::command]
async fn set_torrent_download_order(
    id: usize,
    file_indices: Vec<usize>,
    info_hash: Option<String>,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<(), String> {
    backend_manager(&manager)
        .await?
        .set_torrent_download_order(id, file_indices, info_hash)
        .await
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

/// Re-verifies a paused torrent from disk while keeping it paused - the "Recheck now" action of
/// the external-changes badge.
#[tauri::command]
async fn recheck_paused_torrent(
    id: usize,
    info_hash: Option<String>,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<TorrentResumeResult, String> {
    backend_manager(&manager)
        .await?
        .recheck_paused_torrent(id, info_hash)
        .await
        .map_err(|e| format!("{e:#}"))
}
#[tauri::command]
async fn get_torrent_diagnostics(
    id: usize,
    info_hash: Option<String>,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<TorrentDiagnostics, String> {
    backend_manager(&manager)
        .await?
        .torrent_diagnostics(id, info_hash)
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
async fn add_torrent_tracker(
    id: usize,
    tracker: String,
    info_hash: String,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<(), String> {
    backend_manager(&manager)
        .await?
        .add_torrent_tracker(id, tracker, info_hash)
        .await
}

#[tauri::command]
async fn remove_torrent_tracker(
    id: usize,
    tracker: String,
    info_hash: String,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<(), String> {
    backend_manager(&manager)
        .await?
        .remove_torrent_tracker(id, tracker, info_hash)
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
    app_db::prune_unified_index_scope(app_handle.clone(), "player".into(), Some(keep_ids), None)?;
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

const WINDOW_CHROME_NAMESPACE: &str = "window";
const WINDOW_CHROME_KEY: &str = "chrome";

/// Material the OS paints behind the webview. Window-level rather than per theme: the theme only
/// supplies the tint alpha, so the effect can be switched on its own.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
enum WindowEffect {
    #[default]
    None,
    Acrylic,
    Mica,
    Tabbed,
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct WindowChrome {
    decorations: bool,
    effect: WindowEffect,
    rounded_corners: bool,
}

impl Default for WindowChrome {
    fn default() -> Self {
        Self {
            decorations: true,
            effect: WindowEffect::None,
            rounded_corners: false,
        }
    }
}

#[cfg(windows)]
fn apply_window_corner_preference(window: &tauri::WebviewWindow, rounded: bool) {
    use windows::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DEFAULT, DWMWCP_DONOTROUND,
        DWM_WINDOW_CORNER_PREFERENCE,
    };

    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    let preference = if rounded {
        DWMWCP_DEFAULT
    } else {
        DWMWCP_DONOTROUND
    };
    unsafe {
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            std::ptr::from_ref(&preference).cast(),
            std::mem::size_of::<DWM_WINDOW_CORNER_PREFERENCE>() as u32,
        );
    }
}

#[cfg(not(windows))]
fn apply_window_corner_preference(_window: &tauri::WebviewWindow, _rounded: bool) {}

/// Applies the OS-drawn material. Note that `set_effects` swallows the platform error, so an
/// unsupported Windows build reports success and simply paints nothing.
fn apply_window_effect(window: &tauri::WebviewWindow, effect: WindowEffect) -> Result<(), String> {
    use tauri::window::{Effect, EffectsBuilder};

    let config = match effect {
        WindowEffect::None => None,
        WindowEffect::Acrylic => Some(EffectsBuilder::new().effect(Effect::Acrylic).build()),
        WindowEffect::Mica => Some(EffectsBuilder::new().effect(Effect::Mica).build()),
        WindowEffect::Tabbed => Some(EffectsBuilder::new().effect(Effect::Tabbed).build()),
    };
    window
        .set_effects(config)
        .map_err(|error| format!("set window effect: {error}"))
}

fn apply_window_chrome(window: &tauri::WebviewWindow, chrome: &WindowChrome) -> Result<(), String> {
    window
        .set_decorations(chrome.decorations)
        .map_err(|error| format!("set window decorations: {error}"))?;
    apply_window_corner_preference(window, chrome.rounded_corners);
    apply_window_effect(window, chrome.effect)?;
    Ok(())
}

#[tauri::command]
fn set_window_chrome(
    window: tauri::WebviewWindow,
    decorations: bool,
    effect: WindowEffect,
    rounded_corners: bool,
) -> Result<(), String> {
    let chrome = WindowChrome {
        decorations,
        effect,
        rounded_corners,
    };
    apply_window_chrome(&window, &chrome)?;
    let payload =
        serde_json::to_string(&chrome).map_err(|error| format!("encode window chrome: {error}"))?;
    app_db::put_app_cache(
        window.app_handle().clone(),
        WINDOW_CHROME_NAMESPACE.to_string(),
        WINDOW_CHROME_KEY.to_string(),
        payload,
        None,
    )
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
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            deeplink::handle_second_instance(app, args);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        & !tauri_plugin_window_state::StateFlags::DECORATIONS
                        & !tauri_plugin_window_state::StateFlags::VISIBLE,
                )
                .build(),
        )
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

            let chrome = app_db::read_cached_payload(
                app.handle(),
                WINDOW_CHROME_NAMESPACE,
                WINDOW_CHROME_KEY,
            )
            .ok()
            .flatten()
            .and_then(|payload| serde_json::from_str::<WindowChrome>(&payload).ok())
            .unwrap_or_default();
            if let Some(window) = app.get_webview_window("main") {
                if let Err(error) = apply_window_chrome(&window, &chrome) {
                    tracing::warn!("unable to apply window chrome: {error}");
                }
                let _ = window.show();
                let _ = window.set_focus();
            }

            // The frontend attaches its menu to this icon by id and hides the window
            // on close, so the icon must exist with real pixels before any of that
            // runs: a tray entry without an icon is invisible on Windows and the app
            // cannot be restored. The window icon comes first, the bundled PNG is the
            // fallback when the window has no icon (e.g. `defaultWindowIcon()` is null).
            let tray_icon = app.default_window_icon().cloned().or_else(|| {
                tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png")).ok()
            });
            match tray_icon {
                Some(icon) => {
                    if let Err(error) = TrayIconBuilder::with_id("iluhaanime-tray")
                        .icon(icon)
                        .tooltip("iluhaAnime")
                        .on_tray_icon_event(|tray, event| {
                            let restore = matches!(
                                event,
                                TrayIconEvent::Click {
                                    button: MouseButton::Left,
                                    ..
                                } | TrayIconEvent::DoubleClick {
                                    button: MouseButton::Left,
                                    ..
                                }
                            );
                            if !restore {
                                return;
                            }
                            if let Some(window) = tray.app_handle().get_webview_window("main") {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        })
                        .build(app)
                    {
                        tracing::warn!("unable to create the tray icon: {error}");
                    }
                }
                None => {
                    tracing::warn!("tray icon unavailable: no window icon and bundled icon failed");
                }
            }

            let handle = app.handle().clone();
            handle.manage(std::sync::Mutex::new(NotificationConfig::default()));
            handle.manage(CancelFlag::new());
            handle.manage(ActiveChildren::new());
            handle.manage(progress::StreamRegistry::new());
            handle.manage(std::sync::Mutex::new(fswatcher::FolderWatcher::new()));
            handle.manage(file_index::FileIndexer::new());
            #[cfg(not(debug_assertions))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                if let Err(error) = app.deep_link().register(deeplink::SCHEME) {
                    tracing::warn!("deep-link register failed: {error:#}");
                }
            }
            handle.manage(deeplink::PendingLinks(std::sync::Mutex::new(
                deeplink::extract_deep_link_urls(std::env::args()),
            )));

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
                // Per-torrent limits are not part of the session's own persistence, so a torrent
                // restored from disk starts unlimited even though its dialog shows a limit. The
                // work is a remove/re-add per limited torrent, hence off the startup path.
                let limits_manager = Arc::clone(&mgr_clone);
                tokio::spawn(async move {
                    limits_manager.reapply_stored_limits().await;
                });
                tokio::spawn(async move {
                    let mut tick_state = TorrentTickState {
                        first_run: true,
                        ..Default::default()
                    };
                    loop {
                        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                        let tick = std::panic::AssertUnwindSafe(run_torrent_update_tick(
                            &app_clone,
                            &mgr_clone,
                            &mut tick_state,
                        ));
                        if tick.catch_unwind().await.is_err() {
                            tracing::error!("torrents-update tick panicked, continuing push loop");
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
            anilist::get_spotlight_page,
            anilist::get_anilist_filter_page,
            anilist::search_anilist_by_studio,
            anilist::get_profile_recommendations,
            anilist::get_anime_recommendations,
            anilist::search_anilist_by_tag,
            anilist::search_anilist_by_genre,
            anilist::get_anime_by_id,
            anilist::client::test_anilist_connection,
            jikan::get_anime_stills,
            anilist::get_anilist_profile,
            anilist::get_anilist_following,
            anilist::anilist_login,
            anilist::check_anilist_auth,
            anilist::get_anilist_lists,
            anilist::get_anilist_friend_scores,
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
            anilist::get_character_detail,
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
            app_db::prune_unified_index_scope,
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
            tmdb::tmdb_set_api_key,
            tmdb::check_tmdb_session,
            tmdb::tmdb_logout,
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
            sqlite_browser::get_sqlite_cell_image,
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
            host_stats::get_host_stats,
            scan_video_folder,
            scan_extra_files,
            delete_extra_file,
            start_watching_folders,
            stop_watching_folders,
            set_global_speed_limits,
            get_running_torrent_files,
            save_session_config,
            torrent_listen_port,
            update_torrent_only_files,
            set_torrent_download_order,
            set_file_priority,
            redownload_file,
            set_sequential_download,
            recheck_torrent,
            recheck_paused_torrent,
            get_torrent_diagnostics,
            set_torrent_limits,
            get_torrent_limits,
            add_torrent_tracker,
            remove_torrent_tracker,
            get_torrent_info_from_file,
            start_torrent_download_from_file,
            create_torrent_from_folder,
            save_created_torrent,
            read_file_bytes,
            rebuild_file_index,
            refresh_file_index,
            set_notification_settings,
            toast::show_toast,
            set_window_chrome,
            screenshot::capture_screenshot,
            screenshot::save_screenshot,
            screenshot::copy_screenshot,
            screenshot::discard_screenshot,
            search_file_index,
            deeplink::take_pending_deep_links,
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
