use std::collections::HashMap;
use std::num::NonZeroU32;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use anyhow::{Context, Result};
use librqbit::*;
use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
pub struct TorrentFileInfo {
    pub index: usize,
    pub name: String,
    pub size: u64,
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
}

pub struct TorrentManager {
    pub session: Arc<Session>,
    pub save_dirs: Mutex<HashMap<usize, String>>,
}

impl TorrentManager {
    pub async fn new(app_data_dir: PathBuf) -> Result<Self> {
        let download_dir = app_data_dir.join("torrents");
        tokio::fs::create_dir_all(&download_dir).await.ok();

        let session_dir = app_data_dir.join("session");
        tokio::fs::create_dir_all(&session_dir).await.ok();

        let opts = SessionOptions {
            persistence: Some(SessionPersistenceConfig::Json {
                folder: Some(session_dir),
            }),
            ..Default::default()
        };

        let session = Session::new_with_opts(download_dir, opts)
            .await
            .context("failed to create BitTorrent session")?;

        Ok(Self {
            session,
            save_dirs: Mutex::new(HashMap::new()),
        })
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
                let speed_bytes = speed_mbps * 1024.0 * 1024.0;

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

                result.push(TorrentInfo {
                    id,
                    name: handle.name().unwrap_or_default(),
                    info_hash: handle.info_hash().as_string(),
                    total_bytes: stats.total_bytes,
                    progress_bytes: stats.progress_bytes,
                    downloaded_bytes: stats.progress_bytes,
                    uploaded_bytes: stats.uploaded_bytes,
                    download_speed: speed_bytes,
                    upload_speed: up_mbps * 1024.0 * 1024.0,
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
        let opts = AddTorrentOptions {
            output_folder: Some(save_dir.clone()),
            overwrite: true,
            only_files,
            sub_folder,
            ..Default::default()
        };
        let response = self
            .session
            .add_torrent(AddTorrent::from_url(magnet), Some(opts))
            .await?;

        match response {
            AddTorrentResponse::Added(id, _) => {
                self.save_dirs.lock().unwrap().insert(id, save_dir);
                Ok(id)
            }
            AddTorrentResponse::AlreadyManaged(id, _) => Ok(id),
            _ => anyhow::bail!("torrent was not added"),
        }
    }

    pub async fn get_torrent_info(
        self: &Arc<Self>,
        magnet: String,
        save_dir: String,
    ) -> Result<TorrentInfoResult, String> {
        let opts = AddTorrentOptions {
            output_folder: Some(save_dir.clone()),
            overwrite: true,
            paused: true,
            ..Default::default()
        };

        let response = self
            .session
            .add_torrent(AddTorrent::from_url(magnet), Some(opts))
            .await
            .map_err(|e| format!("{e:#}"))?;

        let (id, handle) = match response {
            AddTorrentResponse::Added(id, handle) => {
                self.save_dirs.lock().unwrap().insert(id, save_dir.clone());
                (id, handle)
            }
            AddTorrentResponse::AlreadyManaged(id, handle) => (id, handle),
            _ => return Err("torrent was not added".to_string()),
        };

        handle
            .wait_until_initialized()
            .await
            .map_err(|e| format!("failed to get metadata: {e}"))?;

        let name = handle.name().unwrap_or_default();

        let files: Vec<TorrentFileInfo> = handle
            .with_metadata(|m| {
                m.file_infos
                    .iter()
                    .enumerate()
                    .map(|(i, f)| TorrentFileInfo {
                        index: i,
                        name: f.relative_filename.to_string_lossy().to_string(),
                        size: f.len,
                    })
                    .collect()
            })
            .map_err(|e| format!("no metadata: {e}"))?;

        let conflicting_files: Vec<String> = files
            .iter()
            .filter_map(|f| {
                let full_path = std::path::Path::new(&save_dir).join(&f.name);
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
            id,
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
                    return handle.with_metadata(|m| {
                        Some(
                            m.file_infos
                                .iter()
                                .enumerate()
                                .map(|(i, f)| TorrentFileInfo {
                                    index: i,
                                    name: f.relative_filename.to_string_lossy().to_string(),
                                    size: f.len,
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

    pub async fn update_torrent_only_files(
        self: &Arc<Self>,
        id: usize,
        only_files: Vec<usize>,
    ) -> Result<(), String> {
        use std::collections::HashSet;

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

        self.session
            .update_only_files(&handle, &only)
            .await
            .map_err(|e| format!("{e}"))
    }
}
