use std::collections::{HashMap, HashSet};
use std::num::NonZeroU32;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use anyhow::{Context, Result};
use librqbit::*;
use serde::{Deserialize, Serialize};

type SaveDirsMap = HashMap<usize, String>;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum FilePriority {
    DoNotDownload,
    Low,
    Normal,
    High,
}

#[derive(Serialize, Clone, Debug)]
pub struct TorrentFileInfo {
    pub index: usize,
    pub name: String,
    pub size: u64,
    pub completed: bool,
    pub selected: bool,
    pub priority: FilePriority,
    pub exists: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct TorrentInfoResult {
    pub id: usize,
    pub name: String,
    pub files: Vec<TorrentFileInfo>,
    pub conflicting_files: Vec<String>,
    pub has_common_folder: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct TorrentInfo {
    pub id: usize,
    pub name: String,
    pub info_hash: String,
    pub total_bytes: u64,
    pub progress_bytes: u64,
    pub downloaded_bytes: u64,
    pub uploaded_bytes: u64,
    pub download_speed: f64,
    pub upload_speed: f64,
    pub peers_connected: usize,
    pub progress: f64,
    pub state: String,
    pub eta_secs: Option<f64>,
    pub finished: bool,
    pub error: Option<String>,
    pub save_dir: String,
    pub sequential_download: bool,
}

pub struct TorrentManager {
    pub session: Arc<Session>,
    pub save_dirs: Mutex<SaveDirsMap>,
    pub save_dirs_path: PathBuf,
    pub sequential_torrents: Mutex<HashSet<usize>>,
    pub file_priorities: Mutex<HashMap<usize, Vec<FilePriority>>>,
    pub pending_selections: Mutex<HashMap<usize, Vec<usize>>>,
}

fn is_safe_path_component(name: &str) -> bool {
    !std::path::Path::new(name)
        .components()
        .any(|c| c == std::path::Component::ParentDir)
}

impl TorrentManager {
    pub async fn new(app_data_dir: PathBuf) -> Result<Self> {
        let download_dir = app_data_dir.join("torrents");
        tokio::fs::create_dir_all(&download_dir).await.ok();

        let session_dir = app_data_dir.join("session");
        tokio::fs::create_dir_all(&session_dir).await.ok();

        let save_dirs_path = app_data_dir.join("save_dirs.json");
        let save_dirs = std::fs::read_to_string(&save_dirs_path)
            .ok()
            .and_then(|json| serde_json::from_str::<SaveDirsMap>(&json).ok())
            .unwrap_or_default();

        let opts = SessionOptions {
            persistence: Some(SessionPersistenceConfig::Json {
                folder: Some(session_dir),
            }),
            ..Default::default()
        };

        let session = Session::new_with_opts(download_dir, opts)
            .await
            .context("failed to create BitTorrent session")?;

        let manager = Self {
            session,
            save_dirs: Mutex::new(save_dirs),
            save_dirs_path,
            sequential_torrents: Mutex::new(HashSet::new()),
            file_priorities: Mutex::new(HashMap::new()),
            pending_selections: Mutex::new(HashMap::new()),
        };
        manager.cleanup_unselected_files();
        Ok(manager)
    }

    fn save_save_dirs(&self) {
        let map = self.save_dirs.lock().unwrap();
        if let Ok(json) = serde_json::to_string(&*map) {
            let _ = std::fs::write(&self.save_dirs_path, &json);
        }
    }

    pub fn collect_torrents(&self) -> Vec<TorrentInfo> {
        self.session.with_torrents(|iter| {
            let mut result = Vec::new();
            for (id, handle) in iter {
                let stats = handle.stats();
                let speed_mbps = stats
                    .live
                    .as_ref()
                    .map(|l| l.download_speed.mbps)
                    .unwrap_or(0.0);
                let speed_bytes = speed_mbps * 125000.0;

                let up_mbps = stats
                    .live
                    .as_ref()
                    .map(|l| l.upload_speed.mbps)
                    .unwrap_or(0.0);

                let remaining = stats.total_bytes.saturating_sub(stats.progress_bytes);
                let eta = if speed_mbps > 0.0 && remaining > 0 {
                    Some(remaining as f64 / speed_bytes)
                } else {
                    None
                };

                let save_dir = self.save_dirs.lock().unwrap().get(&id).cloned().unwrap_or_default();
                let sequential_download = self.sequential_torrents.lock().unwrap().contains(&id);

                result.push(TorrentInfo {
                    id,
                    name: handle.name().unwrap_or_default(),
                    info_hash: handle.info_hash().as_string(),
                    total_bytes: stats.total_bytes,
                    progress_bytes: stats.progress_bytes,
                    downloaded_bytes: stats.progress_bytes,
                    uploaded_bytes: stats.uploaded_bytes,
                    download_speed: speed_bytes,
                    upload_speed: up_mbps * 125000.0,
                    peers_connected: 0,
                    save_dir,
                    progress: if stats.total_bytes > 0 {
                        stats.progress_bytes as f64 / stats.total_bytes as f64
                    } else {
                        0.0
                    },
                    state: format!("{}", stats.state),
                    eta_secs: eta,
                    finished: stats.finished,
                    error: stats.error,
                    sequential_download,
                });
            }
            result
        })
    }

    pub async fn add_torrent(
        self: &Arc<Self>,
        magnet: String,
        save_dir: String,
        only_files: Option<Vec<usize>>,
        sub_folder: Option<String>,
    ) -> Result<usize> {
        let output_folder = sub_folder
            .as_ref()
            .filter(|s| is_safe_path_component(s))
            .map(|s| std::path::Path::new(&save_dir).join(s).to_string_lossy().to_string())
            .unwrap_or_else(|| save_dir.clone());
        let opts = AddTorrentOptions {
            output_folder: Some(output_folder.clone()),
            overwrite: true,
            only_files: only_files.clone(),
            ..Default::default()
        };
        let response = self
            .session
            .add_torrent(AddTorrent::from_url(magnet), Some(opts))
            .await?;

        let id = match response {
            AddTorrentResponse::Added(id, _) => {
                self.save_dirs.lock().unwrap().insert(id, output_folder);
                self.save_save_dirs();
                id
            }
            AddTorrentResponse::AlreadyManaged(id, _) => {
                self.save_dirs.lock().unwrap().entry(id).or_insert(output_folder);
                self.save_save_dirs();
                id
            }
            _ => anyhow::bail!("torrent was not added"),
        };
        self.cleanup_unselected_files();
        if let Some(ref files) = only_files {
            self.pending_selections.lock().unwrap().insert(id, files.clone());
        }
        Ok(id)
    }

    pub async fn get_torrent_info(
        self: &Arc<Self>,
        magnet: String,
        save_dir: String,
    ) -> Result<TorrentInfoResult, String> {
        let opts = AddTorrentOptions {
            output_folder: Some(save_dir.clone()),
            overwrite: true,
            list_only: true,
            ..Default::default()
        };

        let response = self
            .session
            .add_torrent(AddTorrent::from_url(magnet), Some(opts))
            .await
            .map_err(|e| format!("{e:#}"))?;

        let list_only = match response {
            AddTorrentResponse::ListOnly(r) => r,
            _ => return Err("unexpected response from add_torrent".to_string()),
        };

        let name = list_only
            .info
            .name
            .as_ref()
            .and_then(|n| std::str::from_utf8(n.as_ref()).ok())
            .map(|s| s.to_owned())
            .unwrap_or_default();

        let files: Vec<TorrentFileInfo> = list_only
            .info
            .iter_file_details()
            .map_err(|e| format!("error reading file info: {e}"))?
            .enumerate()
            .map(|(i, d)| TorrentFileInfo {
                index: i,
                name: d.filename.to_string().unwrap_or_else(|_| format!("file_{i}")),
                size: d.len,
                completed: false,
                selected: true,
                priority: FilePriority::Normal,
                exists: false,
            })
            .collect();

        let sub_folder = &name;
        let conflicting_files: Vec<String> = files
            .iter()
            .filter_map(|f| {
                if !is_safe_path_component(sub_folder) || !is_safe_path_component(&f.name) {
                    return None;
                }
                let full_path = std::path::Path::new(&save_dir).join(sub_folder).join(&f.name);
                if full_path.exists() {
                    Some(f.name.clone())
                } else {
                    None
                }
            })
            .collect();

        let has_common_folder = if files.len() > 1 {
            let first_prefix = files[0]
                .name
                .split(|c| c == '/' || c == '\\')
                .next()
                .map(|s| s.to_string())
                .filter(|s| !s.is_empty());
            first_prefix.map_or(false, |prefix| {
                files.iter().all(|f| {
                    f.name == prefix
                        || f.name.starts_with(&format!("{}/", prefix))
                        || f.name.starts_with(&format!("{}\\", prefix))
                })
            })
        } else {
            false
        };

        Ok(TorrentInfoResult {
            id: 0,
            name,
            files,
            conflicting_files,
            has_common_folder,
        })
    }

    pub async fn pause_torrent(self: &Arc<Self>, id: usize) -> Result<()> {
        self.session.with_torrents(|iter| {
            for (tid, handle) in iter {
                if tid == id {
                    let h = handle.clone();
                    let session = self.session.clone();
                    tokio::spawn(async move {
                        let _ = session.pause(&h).await;
                    });
                    return;
                }
            }
        });
        Ok(())
    }

    pub async fn resume_torrent(self: &Arc<Self>, id: usize) -> Result<()> {
        self.session.with_torrents(|iter| {
            for (tid, handle) in iter {
                if tid == id {
                    let h = handle.clone();
                    let session = self.session.clone();
                    tokio::spawn(async move {
                        let _ = session.unpause(&h).await;
                    });
                    return;
                }
            }
        });
        Ok(())
    }

    pub async fn remove_torrent(self: &Arc<Self>, id: usize, delete_files: bool) -> Result<()> {
        self.session.delete(id.into(), delete_files).await?;
        self.save_dirs.lock().unwrap().remove(&id);
        self.sequential_torrents.lock().unwrap().remove(&id);
        self.file_priorities.lock().unwrap().remove(&id);
        self.pending_selections.lock().unwrap().remove(&id);
        self.save_save_dirs();
        Ok(())
    }

    pub fn set_global_limits(&self, download_bps: Option<NonZeroU32>, upload_bps: Option<NonZeroU32>) {
        self.session.ratelimits.set_download_bps(download_bps);
        self.session.ratelimits.set_upload_bps(upload_bps);
    }

    pub fn get_running_torrent_files(&self, id: usize) -> Result<Vec<TorrentFileInfo>, String> {
        let result = self.session.with_torrents(|iter| {
            for (tid, handle) in iter {
                if tid == id {
                    let h = handle.clone();
                    let stats = h.stats();
                    let only_files = h.only_files();
                    return h.with_metadata(|m| {
                        let file_count = m.file_infos.len();

                        // Initialize file priorities lazily from pending selection or handle.only_files()
                        {
                            let mut priorities = self.file_priorities.lock().unwrap();
                            if !priorities.contains_key(&id) {
                                let pending = self.pending_selections.lock().unwrap().remove(&id);
                                if let Some(selected) = pending {
                                    let mut p = vec![FilePriority::DoNotDownload; file_count];
                                    for &idx in &selected {
                                        if idx < file_count {
                                            p[idx] = FilePriority::Normal;
                                        }
                                    }
                                    priorities.insert(id, p);
                                } else if let Some(only) = h.only_files() {
                                    let mut p = vec![FilePriority::DoNotDownload; file_count];
                                    for &idx in &only {
                                        if idx < file_count {
                                            p[idx] = FilePriority::Normal;
                                        }
                                    }
                                    priorities.insert(id, p);
                                } else {
                                    priorities.insert(id, vec![FilePriority::Normal; file_count]);
                                }
                            }
                        }

                        let priorities = self.file_priorities.lock().unwrap();
                        let prio_list = priorities.get(&id).cloned().unwrap_or(vec![FilePriority::Normal; file_count]);

                        Some(
                            m.file_infos
                                .iter()
                                .enumerate()
                                .map(|(i, f)| {
                                    let progress = stats.file_progress.get(i).copied().unwrap_or(0);
                                    let completed = f.len > 0 && progress >= f.len;
                                    let selected = only_files.as_ref().map_or(true, |of| of.contains(&i));
                                    let priority = prio_list.get(i).copied().unwrap_or(FilePriority::Normal);
                                    let exists = {
                                        let dir = self.save_dirs.lock().unwrap().get(&id).cloned();
                                        dir.map_or(false, |d| Path::new(&d).join(&f.relative_filename).exists())
                                    };
                                    TorrentFileInfo {
                                        index: i,
                                        name: f.relative_filename.to_string_lossy().to_string(),
                                        size: f.len,
                                        completed,
                                        selected,
                                        priority,
                                        exists,
                                    }
                                })
                                .collect::<Vec<_>>(),
                        )
                    })
                    .unwrap_or(None);
                }
            }
            None
        });
        result.ok_or_else(|| "torrent not found or no metadata".to_string())
    }

    pub fn cleanup_unselected_files(&self) {
        self.session.with_torrents(|iter| {
            for (id, handle) in iter {
                let save_dir = match self.save_dirs.lock() {
                    Ok(g) => g.get(&id).cloned(),
                    Err(_) => continue,
                };
                let Some(save_dir) = save_dir else { continue };
                let Some(only_files) = handle.only_files() else { continue };
                let stats = handle.stats();

                let _ = handle.with_metadata(|m| {
                    for (i, file) in m.file_infos.iter().enumerate() {
                        if file
                            .relative_filename
                            .components()
                            .any(|c| matches!(c, std::path::Component::ParentDir))
                        {
                            continue;
                        }
                        let full_path = Path::new(&save_dir).join(&file.relative_filename);
                        let selected = only_files.contains(&i);

                        if selected {
                            unhide_file(&full_path);
                        } else if stats.file_progress.get(i).copied().unwrap_or(0) == 0 {
                            let _ = std::fs::File::create(&full_path);
                            hide_file(&full_path);
                        }
                    }
                });
            }
        });
    }
}

#[cfg(windows)]
fn hide_file(path: &Path) {
    use std::os::windows::ffi::OsStrExt;
    let wide: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let _ = unsafe { SetFileAttributesW(wide.as_ptr(), 0x2) };
}

#[cfg(windows)]
fn unhide_file(path: &Path) {
    use std::os::windows::ffi::OsStrExt;
    let wide: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let attrs = unsafe { GetFileAttributesW(wide.as_ptr()) };
    if attrs != u32::MAX {
        unsafe { SetFileAttributesW(wide.as_ptr(), attrs & !0x2); }
    }
}

#[cfg(not(windows))]
fn hide_file(_path: &Path) {}

#[cfg(not(windows))]
fn unhide_file(_path: &Path) {}

#[cfg(windows)]
extern "system" {
    fn GetFileAttributesW(lpFileName: *const u16) -> u32;
    fn SetFileAttributesW(lpFileName: *const u16, dwFileAttributes: u32) -> i32;
}

impl TorrentManager {
    pub async fn update_torrent_only_files(
        self: &Arc<Self>,
        id: usize,
        only_files: Vec<usize>,
    ) -> Result<(), String> {
        let handle_opt = self.session.with_torrents(|iter| {
            for (tid, handle) in iter {
                if tid == id {
                    return Some(handle.clone());
                }
            }
            None
        });

        let handle = handle_opt.ok_or_else(|| "torrent not found".to_string())?;
        let only: HashSet<usize> = only_files.into_iter().collect();

        let result = self
            .session
            .update_only_files(&handle, &only)
            .await
            .map_err(|e| format!("{e}"));
        if result.is_ok() {
            self.cleanup_unselected_files();
        }
        result
    }

    pub async fn set_file_priority(
        self: &Arc<Self>,
        id: usize,
        file_indices: Vec<usize>,
        priority: FilePriority,
    ) -> Result<(), String> {
        // Update local priorities
        {
            let mut priorities = self.file_priorities.lock().unwrap();
            let entry = priorities.entry(id).or_default();
            for &idx in &file_indices {
                if idx < entry.len() {
                    entry[idx] = priority.clone();
                }
            }
        }

        // For sequential torrents, only update the priority map (advance_sequential handles the rest)
        if self.sequential_torrents.lock().unwrap().contains(&id) {
            return Ok(());
        }

        // For DoNotDownload / Normal, update only_files in the backend
        if priority == FilePriority::DoNotDownload || priority == FilePriority::Normal {
            let handle = self.session.with_torrents(|iter| {
                for (tid, handle) in iter {
                    if tid == id { return Some(handle.clone()); }
                }
                None
            }).ok_or_else(|| "Torrent not found".to_string())?;

            let only = handle.only_files().unwrap_or_default();
            let mut new_only = only.clone();

            if priority == FilePriority::DoNotDownload {
                for idx in &file_indices {
                    new_only.retain(|&i| i != *idx);
                }
            } else {
                for idx in &file_indices {
                    if !new_only.contains(idx) {
                        new_only.push(*idx);
                    }
                }
            }

            if new_only != only {
                let set: HashSet<usize> = new_only.into_iter().collect();
                self.session.update_only_files(&handle, &set)
                    .await
                    .map_err(|e| format!("{e:#}"))?;
                self.cleanup_unselected_files();
            }
        }

        Ok(())
    }

    pub async fn set_sequential_download(&self, id: usize, enabled: bool) -> Result<(), String> {
        let handle_opt = self.session.with_torrents(|iter| {
            for (tid, handle) in iter {
                if tid == id { return Some(handle.clone()); }
            }
            None
        });

        if enabled {
            self.sequential_torrents.lock().unwrap().insert(id);

            // Resume the torrent if it's paused
            if let Some(ref handle) = handle_opt {
                if handle.is_paused() {
                    self.session.unpause(handle).await.map_err(|e| format!("{e:#}"))?;
                }
                // Immediately restrict to the first incomplete non-DoNotDownload file
                let _ = handle;
                self.advance_sequential(id).await?;
            }
        } else {
            self.sequential_torrents.lock().unwrap().remove(&id);

            // Restore non-DoNotDownload files based on priorities
            if let Some(handle) = handle_opt {
                let files_to_restore = {
                    let priorities = self.file_priorities.lock().unwrap();
                    priorities.get(&id).map(|list| {
                        list.iter().enumerate()
                            .filter(|(_, &p)| p != FilePriority::DoNotDownload)
                            .map(|(i, _)| i)
                            .collect::<HashSet<usize>>()
                    })
                };

                match files_to_restore {
                    Some(restore_set) if !restore_set.is_empty() => {
                        self.session.update_only_files(&handle, &restore_set)
                            .await
                            .map_err(|e| format!("{e:#}"))?;
                    }
                    _ => {
                        // Fallback: restore all files
                        if let Some(file_count) = handle.with_metadata(|m| Some(m.file_infos.len())).unwrap_or(None) {
                            let all: HashSet<usize> = (0..file_count).collect();
                            self.session.update_only_files(&handle, &all)
                                .await
                                .map_err(|e| format!("{e:#}"))?;
                        }
                    }
                }
            }
        }
        Ok(())
    }

    pub async fn advance_sequential(&self, id: usize) -> Result<(), String> {
        let handle = self.session.with_torrents(|iter| {
            for (tid, handle) in iter {
                if tid == id { return Some(handle.clone()); }
            }
            None
        }).ok_or_else(|| "Torrent not found".to_string())?;

        let stats = handle.stats();
        let file_count = handle.with_metadata(|m| {
            Some(m.file_infos.len())
        }).unwrap_or(None).unwrap_or(0);

        if file_count == 0 { return Ok(()); }

        // Build candidate list: only files not set to DoNotDownload
        let candidates: Vec<usize> = {
            let priorities = self.file_priorities.lock().unwrap();
            if let Some(list) = priorities.get(&id) {
                list.iter().enumerate()
                    .filter(|(_, &p)| p != FilePriority::DoNotDownload)
                    .map(|(i, _)| i)
                    .collect()
            } else {
                (0..file_count).collect()
            }
        };

        let first_incomplete = candidates.into_iter().find(|&i| {
            let progress = stats.file_progress.get(i).copied().unwrap_or(0);
            let total = handle.with_metadata(|m| {
                m.file_infos.get(i).map(|f| f.len)
            }).unwrap_or(None).unwrap_or(0);
            progress < total
        });

        match first_incomplete {
            Some(target) => {
                let only: HashSet<usize> = [target].into_iter().collect();
                self.session.update_only_files(&handle, &only)
                    .await
                    .map_err(|e| format!("{e:#}"))?;
            }
            None => {
                self.sequential_torrents.lock().unwrap().remove(&id);
            }
        }

        Ok(())
    }
}
