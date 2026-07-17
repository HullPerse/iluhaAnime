use std::collections::{HashMap, HashSet};
use std::num::NonZeroU32;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::{Context, Result};
use dashmap::{DashMap, DashSet};
use librqbit::*;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum FilePriority {
    DoNotDownload,
    Normal,
}

#[derive(Serialize, Clone, Debug)]
pub struct TorrentFileInfo {
    pub index: usize,
    pub name: String,
    pub size: u64,
    pub progress_bytes: u64,
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

#[derive(Serialize, Deserialize, Clone)]
pub struct SessionConfig {
    pub fastresume: bool,
    #[serde(rename = "ipv4Only")]
    pub ipv4_only: bool,
    #[serde(rename = "peerConnectTimeout")]
    pub peer_connect_timeout_secs: u64,
    #[serde(rename = "peerReadWriteTimeout")]
    pub peer_read_write_timeout_secs: u64,
    #[serde(rename = "listenPort")]
    pub listen_port: u16,
    #[serde(rename = "enableUpnp")]
    pub enable_upnp: bool,
    #[serde(rename = "disablePersistence")]
    pub disable_persistence: bool,
}

impl Default for SessionConfig {
    fn default() -> Self {
        Self {
            fastresume: true,
            ipv4_only: false,
            peer_connect_timeout_secs: 30,
            peer_read_write_timeout_secs: 30,
            listen_port: 0,
            enable_upnp: false,
            disable_persistence: false,
        }
    }
}

pub struct TorrentManager {
    pub session: Arc<Session>,
    pub save_dirs: DashMap<usize, String>,
    pub save_dirs_path: PathBuf,
    pub sequential_torrents: DashSet<usize>,
    pub file_priorities: DashMap<usize, Vec<FilePriority>>,
    pub pending_selections: DashMap<usize, Vec<usize>>,
    pub session_config: tokio::sync::Mutex<SessionConfig>,
    pub session_dir: PathBuf,
    pub session_config_path: PathBuf,
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
        let save_dirs: HashMap<usize, String> = std::fs::read_to_string(&save_dirs_path)
            .ok()
            .and_then(|json| serde_json::from_str(&json).ok())
            .unwrap_or_default();

        let session_config_path = app_data_dir.join("session_config.json");
        let session_config = std::fs::read_to_string(&session_config_path)
            .ok()
            .and_then(|json| serde_json::from_str::<SessionConfig>(&json).ok())
            .unwrap_or_default();

        let persistence = if session_config.disable_persistence {
            None
        } else {
            Some(SessionPersistenceConfig::Json {
                folder: Some(session_dir.clone()),
            })
        };

        use std::net::{Ipv4Addr, Ipv6Addr};
        let listen_addr: std::net::SocketAddr = if session_config.ipv4_only {
            (Ipv4Addr::UNSPECIFIED, session_config.listen_port).into()
        } else {
            (Ipv6Addr::UNSPECIFIED, session_config.listen_port).into()
        };
        let opts = SessionOptions {
            persistence,
            fastresume: session_config.fastresume,
            ipv4_only: session_config.ipv4_only,
            listen: Some(ListenerOptions {
                listen_addr,
                enable_upnp_port_forwarding: session_config.enable_upnp,
                ipv4_only: session_config.ipv4_only,
                ..Default::default()
            }),
            connect: Some(ConnectionOptions {
                enable_tcp: true,
                peer_opts: Some(PeerConnectionOptions {
                    connect_timeout: Some(std::time::Duration::from_secs(
                        session_config.peer_connect_timeout_secs,
                    )),
                    read_write_timeout: Some(std::time::Duration::from_secs(
                        session_config.peer_read_write_timeout_secs,
                    )),
                    keep_alive_interval: None,
                }),
                ..Default::default()
            }),
            ..Default::default()
        };

        let session = Session::new_with_opts(download_dir, opts)
            .await
            .context("failed to create BitTorrent session")?;

        let manager = Self {
            session,
            save_dirs: save_dirs.into_iter().collect(),
            save_dirs_path,
            sequential_torrents: DashSet::new(),
            file_priorities: DashMap::new(),
            pending_selections: DashMap::new(),
            session_config: tokio::sync::Mutex::new(session_config),
            session_dir,
            session_config_path,
        };
        manager.cleanup_unselected_files();
        Ok(manager)
    }

    fn save_save_dirs(&self) {
        let map: HashMap<usize, String> =
            self.save_dirs.iter().map(|r| (*r.key(), r.value().clone())).collect();
        if let Ok(json) = serde_json::to_string(&map) {
            let _ = std::fs::write(&self.save_dirs_path, &json);
        }
    }

    pub fn get_session_config(&self) -> SessionConfig {
        self.session_config.blocking_lock().clone()
    }

    pub fn save_session_config(&self, config: SessionConfig) {
        if let Ok(json) = serde_json::to_string(&config) {
            let _ = std::fs::write(&self.session_config_path, &json);
        }
        *self.session_config.blocking_lock() = config;
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

                let save_dir = self.save_dirs.get(&id).map(|r| r.clone()).unwrap_or_default();
                let sequential_download = self.sequential_torrents.contains(&id);

                result.push(TorrentInfo {
                    id,
                    name: handle.name().unwrap_or_default(),
                    info_hash: handle.info_hash().as_string(),
                    total_bytes: stats.total_bytes,
                    progress_bytes: stats.progress_bytes,
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
        self.add_torrent_inner(
            AddTorrent::from_url(magnet),
            save_dir,
            only_files,
            sub_folder,
            None,
        )
        .await
    }

    pub async fn add_torrent_from_bytes(
        self: &Arc<Self>,
        bytes: Vec<u8>,
        save_dir: String,
        only_files: Option<Vec<usize>>,
        sub_folder: Option<String>,
    ) -> Result<usize> {
        self.add_torrent_inner(
            AddTorrent::from_bytes(bytes),
            save_dir,
            only_files,
            sub_folder,
            None,
        )
        .await
    }

    async fn add_torrent_inner(
        self: &Arc<Self>,
        add_torrent: AddTorrent<'_>,
        save_dir: String,
        only_files: Option<Vec<usize>>,
        sub_folder: Option<String>,
        preferred_id: Option<usize>,
    ) -> Result<usize> {
        let output_folder = sub_folder
            .as_ref()
            .filter(|s| is_safe_path_component(s))
            .map(|s| {
                std::path::Path::new(&save_dir)
                    .join(s)
                    .to_string_lossy()
                    .to_string()
            })
            .unwrap_or_else(|| save_dir.clone());
        let opts = AddTorrentOptions {
            output_folder: Some(output_folder.clone()),
            overwrite: true,
            only_files: only_files.clone(),
            preferred_id,
            ..Default::default()
        };
        let response = self.session.add_torrent(add_torrent, Some(opts)).await?;

        let id = match response {
            AddTorrentResponse::Added(id, _) => {
                self.save_dirs.insert(id, output_folder);
                self.save_save_dirs();
                id
            }
            AddTorrentResponse::AlreadyManaged(id, _) => {
                self.save_dirs.entry(id).or_insert(output_folder);
                self.save_save_dirs();
                id
            }
            _ => anyhow::bail!("torrent was not added"),
        };
        self.cleanup_unselected_files();
        if let Some(ref files) = only_files {
            self.pending_selections.insert(id, files.clone());
        }
        Ok(id)
    }

    pub async fn replace_torrent(
        self: &Arc<Self>,
        id: usize,
        magnet: String,
        only_files: Option<Vec<usize>>,
    ) -> Result<usize, String> {
        let save_dir = self.save_dirs.get(&id).map(|r| r.clone()).unwrap_or_default();
        self.remove_torrent(id, false)
            .await
            .map_err(|e| format!("{e:#}"))?;
        self.add_torrent_inner(
            AddTorrent::from_url(magnet),
            save_dir,
            only_files,
            None,
            Some(id),
        )
        .await
        .map_err(|e| format!("{e:#}"))
    }

    pub async fn redownload_file(
        self: &Arc<Self>,
        id: usize,
        file_index: usize,
        info_hash: String,
    ) -> Result<usize, String> {
        let selected_indices = {
            let files = self.get_running_torrent_files(id)?;
            files
                .iter()
                .filter(|f| f.selected)
                .map(|f| f.index)
                .collect::<Vec<_>>()
        };

        let magnet = format!("magnet:?xt=urn:btih:{}", info_hash);
        let new_id = self
            .replace_torrent(id, magnet, Some(vec![file_index]))
            .await?;

        {
            let set: HashSet<usize> = selected_indices.into_iter().collect();
            let handle_opt = self.session.with_torrents(|iter| {
                for (tid, handle) in iter {
                    if tid == new_id {
                        return Some(handle.clone());
                    }
                }
                None
            });
            if let Some(handle) = handle_opt {
                self.session
                    .update_only_files(&handle, &set)
                    .await
                    .map_err(|e| format!("{e}"))?;
                self.cleanup_unselected_files();
                self.pending_selections.remove(&new_id);
            }
        }

        Ok(new_id)
    }

    pub async fn get_torrent_info(
        self: &Arc<Self>,
        magnet: String,
        save_dir: String,
    ) -> Result<TorrentInfoResult, String> {
        self.get_torrent_info_inner(AddTorrent::from_url(magnet), save_dir)
            .await
    }

    pub async fn get_torrent_info_from_bytes(
        self: &Arc<Self>,
        bytes: Vec<u8>,
        save_dir: String,
    ) -> Result<TorrentInfoResult, String> {
        self.get_torrent_info_inner(AddTorrent::from_bytes(bytes), save_dir)
            .await
    }

    async fn get_torrent_info_inner(
        self: &Arc<Self>,
        add_torrent: AddTorrent<'_>,
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
            .add_torrent(add_torrent, Some(opts))
            .await
            .map_err(|e| format!("{e:#}"))?;

        let list_only = match response {
            AddTorrentResponse::ListOnly(r) => r,
            _ => return Err("unexpected response from add_torrent".to_string()),
        };

        let name = list_only.info.name().unwrap_or_default().to_string();

        let files: Vec<TorrentFileInfo> = list_only
            .info
            .iter_file_details()
            .enumerate()
            .map(|(i, d)| TorrentFileInfo {
                index: i,
                name: format!("{}", d.filename),
                size: d.len,
                progress_bytes: 0,
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
                let full_path = std::path::Path::new(&save_dir)
                    .join(sub_folder)
                    .join(&f.name);
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
        self.save_dirs.remove(&id);
        self.sequential_torrents.remove(&id);
        self.file_priorities.remove(&id);
        self.pending_selections.remove(&id);
        self.save_save_dirs();
        Ok(())
    }

    pub fn start_http_api(self: &Arc<Self>) {
        use librqbit::api::Api;
        use librqbit::http_api::{HttpApi, HttpApiOptions};

        let api = Api::new(self.session.clone(), None, None);
        let http_opts = HttpApiOptions {
            read_only: false,
            basic_auth: None,
            allow_create: true,
            prometheus_handle: None,
        };
        let http_api = HttpApi::new(api, Some(http_opts));
        let addr: std::net::SocketAddr = ([127, 0, 0, 1], 11200).into();
        let listener =
            match librqbit_dualstack_sockets::TcpListener::bind_tcp(addr, Default::default()) {
                Ok(l) => l,
                Err(e) => {
                    eprintln!("error binding HTTP API server: {e}");
                    return;
                }
            };
        tokio::spawn(async move {
            if let Err(e) = http_api.make_http_api_and_run(listener, None).await {
                eprintln!("HTTP API stopped: {e:#}");
            }
        });
    }

    pub async fn create_torrent_from_folder(
        self: &Arc<Self>,
        folder_path: String,
    ) -> Result<String> {
        use std::path::Path;
        let stat = tokio::fs::metadata(&folder_path)
            .await
            .context("path does not exist")?;
        if !stat.is_dir() {
            anyhow::bail!("not a directory");
        }
        let folder = Path::new(&folder_path);
        let name = folder
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let torrent_path = self.session_dir.join(format!("{name}.torrent"));
        let result = create_torrent(
            folder,
            CreateTorrentOptions {
                name: Some(&name),
                ..Default::default()
            },
            &librqbit::spawn_utils::BlockingSpawner::new(1),
        )
        .await
        .context("error creating torrent from folder")?;
        let bytes = result.as_bytes().context("error serializing torrent")?;
        let parent = folder.parent().unwrap_or(folder);
        let add = AddTorrent::from_local_filename(torrent_path.to_str().unwrap())
            .context("error reading torrent file")?;
        tokio::fs::write(&torrent_path, bytes).await.ok();
        let opts = AddTorrentOptions {
            output_folder: Some(parent.to_string_lossy().to_string()),
            overwrite: true,
            ..Default::default()
        };
        let response = self
            .session
            .add_torrent(add, Some(opts))
            .await
            .context("error adding torrent from folder")?;
        match response {
            AddTorrentResponse::Added(id, _) => {
                self.save_dirs.insert(id, parent.to_string_lossy().to_string());
                self.save_save_dirs();
                Ok(torrent_path.to_string_lossy().to_string())
            }
            _ => anyhow::bail!("failed to add torrent from folder"),
        }
    }

    pub fn set_global_limits(
        &self,
        download_bps: Option<NonZeroU32>,
        upload_bps: Option<NonZeroU32>,
    ) {
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
                    return h
                        .with_metadata(|m| {
                            let file_count = m.file_infos.len();

                            if !self.file_priorities.contains_key(&id) {
                                if let Some(selected) = self.pending_selections.remove(&id) {
                                    let mut p = vec![FilePriority::DoNotDownload; file_count];
                                    for &idx in &selected.1 {
                                        if idx < file_count {
                                            p[idx] = FilePriority::Normal;
                                        }
                                    }
                                    self.file_priorities.insert(id, p);
                                } else if let Some(only) = h.only_files() {
                                    let mut p = vec![FilePriority::DoNotDownload; file_count];
                                    for &idx in &only {
                                        if idx < file_count {
                                            p[idx] = FilePriority::Normal;
                                        }
                                    }
                                    self.file_priorities.insert(id, p);
                                } else {
                                    self.file_priorities
                                        .insert(id, vec![FilePriority::Normal; file_count]);
                                }
                            }

                            let prio_list = self
                                .file_priorities
                                .get(&id)
                                .map(|r| r.clone())
                                .unwrap_or(vec![FilePriority::Normal; file_count]);

                            Some(
                                m.file_infos
                                    .iter()
                                    .enumerate()
                                    .map(|(i, f)| {
                                        let progress =
                                            stats.file_progress.get(i).copied().unwrap_or(0);
                                        let completed = f.len > 0 && progress >= f.len;
                                        let selected =
                                            only_files.as_ref().map_or(true, |of| of.contains(&i));
                                        let priority = prio_list
                                            .get(i)
                                            .copied()
                                            .unwrap_or(FilePriority::Normal);
                                        let exists = self
                                            .save_dirs
                                            .get(&id)
                                            .map_or(false, |d| {
                                                Path::new(d.value())
                                                    .join(&f.relative_filename)
                                                    .exists()
                                            });
                                        TorrentFileInfo {
                                            index: i,
                                            name: f.relative_filename.to_string_lossy().to_string(),
                                            size: f.len,
                                            progress_bytes: progress,
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
                let save_dir = self.save_dirs.get(&id).map(|r| r.clone());
                let Some(save_dir) = save_dir else { continue };
                let Some(only_files) = handle.only_files() else {
                    continue;
                };
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
        unsafe {
            SetFileAttributesW(wide.as_ptr(), attrs & !0x2);
        }
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
        {
            let mut entry = self.file_priorities.entry(id).or_default();
            for &idx in &file_indices {
                if idx < entry.len() {
                    entry[idx] = priority.clone();
                }
            }
        }

        if self.sequential_torrents.contains(&id) {
            return Ok(());
        }

        if priority == FilePriority::DoNotDownload || priority == FilePriority::Normal {
            let handle = self
                .session
                .with_torrents(|iter| {
                    for (tid, handle) in iter {
                        if tid == id {
                            return Some(handle.clone());
                        }
                    }
                    None
                })
                .ok_or_else(|| "Torrent not found".to_string())?;

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
                self.session
                    .update_only_files(&handle, &set)
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
                if tid == id {
                    return Some(handle.clone());
                }
            }
            None
        });

        if enabled {
            self.sequential_torrents.insert(id);

            if let Some(ref handle) = handle_opt {
                if handle.is_paused() {
                    self.session
                        .unpause(handle)
                        .await
                        .map_err(|e| format!("{e:#}"))?;
                }
                let _ = handle;
                self.advance_sequential(id).await?;
            }
        } else {
            self.sequential_torrents.remove(&id);

            if let Some(handle) = handle_opt {
                let files_to_restore = self
                    .file_priorities
                    .get(&id)
                    .map(|r| {
                        r.iter()
                            .enumerate()
                            .filter(|(_, &p)| p != FilePriority::DoNotDownload)
                            .map(|(i, _)| i)
                            .collect::<HashSet<usize>>()
                    });

                match files_to_restore {
                    Some(restore_set) if !restore_set.is_empty() => {
                        self.session
                            .update_only_files(&handle, &restore_set)
                            .await
                            .map_err(|e| format!("{e:#}"))?;
                    }
                    _ => {
                        // Fallback: restore all files
                        if let Some(file_count) = handle
                            .with_metadata(|m| Some(m.file_infos.len()))
                            .unwrap_or(None)
                        {
                            let all: HashSet<usize> = (0..file_count).collect();
                            self.session
                                .update_only_files(&handle, &all)
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
        let handle = self
            .session
            .with_torrents(|iter| {
                for (tid, handle) in iter {
                    if tid == id {
                        return Some(handle.clone());
                    }
                }
                None
            })
            .ok_or_else(|| "Torrent not found".to_string())?;

        let stats = handle.stats();
        let file_count = handle
            .with_metadata(|m| Some(m.file_infos.len()))
            .unwrap_or(None)
            .unwrap_or(0);

        if file_count == 0 {
            return Ok(());
        }

        let candidates: Vec<usize> =
            if let Some(prio) = self.file_priorities.get(&id) {
                prio.iter()
                    .enumerate()
                    .filter(|(_, &p)| p != FilePriority::DoNotDownload)
                    .map(|(i, _)| i)
                    .collect()
            } else {
                (0..file_count).collect()
            };

        let first_incomplete = candidates.into_iter().find(|&i| {
            let progress = stats.file_progress.get(i).copied().unwrap_or(0);
            let total = handle
                .with_metadata(|m| m.file_infos.get(i).map(|f| f.len))
                .unwrap_or(None)
                .unwrap_or(0);
            progress < total
        });

        match first_incomplete {
            Some(target) => {
                let only: HashSet<usize> = [target].into_iter().collect();
                self.session
                    .update_only_files(&handle, &only)
                    .await
                    .map_err(|e| format!("{e:#}"))?;
            }
            None => {
                self.sequential_torrents.remove(&id);
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_safe_path_component_rejects_parent_dir() {
        assert!(!is_safe_path_component(".."));
        assert!(!is_safe_path_component("../foo"));
        assert!(!is_safe_path_component("foo/.."));
        assert!(!is_safe_path_component("foo/../../bar"));
    }

    #[test]
    fn is_safe_path_component_accepts_normal_names() {
        assert!(is_safe_path_component("video.mkv"));
        assert!(is_safe_path_component("[Subs] Anime - 01.mkv"));
        assert!(is_safe_path_component("folder with spaces"));
        assert!(is_safe_path_component(""));
    }

    #[test]
    fn is_safe_path_component_accepts_root() {
        assert!(is_safe_path_component("/"));
        assert!(is_safe_path_component("//"));
    }

    #[test]
    fn is_safe_path_component_accepts_nested_safe_paths() {
        assert!(is_safe_path_component("foo/bar"));
    }
}
