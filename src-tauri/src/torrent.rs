use std::path::PathBuf;
use std::sync::Arc;

use anyhow::{Context, Result};
use librqbit::*;
use serde::Serialize;

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
}

pub struct TorrentManager {
    pub session: Arc<Session>,
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

        Ok(Self { session })
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
    ) -> Result<usize> {
        let opts = AddTorrentOptions {
            output_folder: Some(save_dir.clone()),
            overwrite: true,
            ..Default::default()
        };
        let response = self
            .session
            .add_torrent(AddTorrent::from_url(magnet), Some(opts))
            .await?;

        match response {
            AddTorrentResponse::Added(id, _) => Ok(id),
            AddTorrentResponse::AlreadyManaged(id, _) => Ok(id),
            _ => anyhow::bail!("torrent was not added"),
        }
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

    pub async fn remove_torrent(self: &Arc<Self>, id: usize) -> Result<()> {
        self.session.delete(id.into(), true).await?;
        Ok(())
    }
}
