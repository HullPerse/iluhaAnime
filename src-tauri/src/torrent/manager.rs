#![allow(
    clippy::struct_excessive_bools,
    clippy::cast_precision_loss,
    clippy::unused_async,
    clippy::map_unwrap_or
)]

use std::collections::{HashMap, HashSet};
use std::num::NonZeroU32;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use dashmap::{DashMap, DashSet};
use librqbit::http_api_types::PeerStatsFilter;
use librqbit::limits::LimitsConfig;
use librqbit::spawn_utils::BlockingSpawner;
use librqbit::{
    create_torrent, AddTorrent, AddTorrentOptions, AddTorrentResponse, ConnectionOptions,
    CreateTorrentOptions, ListenerOptions, Magnet, PeerConnectionOptions, Session, SessionOptions,
    SessionPersistenceConfig, TorrentStatsState,
};
use serde::{Deserialize, Serialize};
use std::net::{Ipv4Addr, Ipv6Addr};

use super::geoip::country_code_for_addr;
use super::helpers::{
    build_magnet, canonical_or_raw_tracker, ensure_minimum_free_space, is_info_hash,
    is_safe_relative_path, plan_sequential, share_ratio, to_rqbit_limits, torrent_proxy_url,
    validate_session_config, validate_tracker_url, with_fallback_trackers,
    with_fallback_trackers_bytes, with_trackers_bytes, SequentialPlan, FALLBACK_TRACKERS,
};
use super::types::{
    CreatedTorrent, DhtStatus, FileOrder, FilePriority, SessionConfig, TorrentCheckResult,
    TorrentDiagPeer, TorrentDiagnostics, TorrentFileInfo, TorrentInfo, TorrentInfoResult,
    TorrentLimits, TorrentResumeResult,
};
pub const METADATA_SLOTS: usize = 8;

const SEQUENTIAL_PRIORITY_TICK: Duration = Duration::from_secs(1);

const MAX_SEQUENTIAL_PRIORITY_STREAMS: usize = 4;

const PAUSE_SNAPSHOT_SETTLE: Duration = Duration::from_millis(250);

const PAUSE_WATCH_INTERVAL: Duration = Duration::from_secs(3);

#[derive(Serialize, Deserialize, Default)]
struct TorrentPreferences {
    sequential_torrents: HashSet<String>,
    file_priorities: HashMap<String, Vec<FilePriority>>,
    #[serde(default)]
    download_order: HashMap<String, Vec<usize>>,
}

#[derive(Clone)]
enum TorrentSource {
    Bytes(Vec<u8>),
    Magnet(String),
}

impl TorrentSource {
    fn to_add_torrent(&self, inject_fallback: bool) -> AddTorrent<'static> {
        match self {
            Self::Bytes(bytes) if inject_fallback => {
                AddTorrent::from_bytes(with_fallback_trackers_bytes(bytes))
            }
            Self::Bytes(bytes) => AddTorrent::from_bytes(bytes.clone()),
            Self::Magnet(magnet) => AddTorrent::from_url(magnet.clone()),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct FileStamp {
    name: String,
    expected_len: u64,
    on_disk_len: Option<u64>,
    mtime_secs: Option<i64>,
}

pub struct RewriteGuard<'a>(&'a std::sync::atomic::AtomicUsize);

impl Drop for RewriteGuard<'_> {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
}

pub struct TorrentManager {
    pub session: Arc<Session>,
    pub save_dirs: DashMap<usize, String>,
    pub save_dirs_path: PathBuf,
    pub magnet_links: DashMap<usize, String>,
    pub magnet_links_path: PathBuf,
    pub aliases: DashMap<String, String>,
    pub aliases_path: PathBuf,
    pub torrent_limits: DashMap<String, TorrentLimits>,
    pub torrent_limits_path: PathBuf,
    pub sequential_torrents: DashSet<String>,
    pub sequential_streams: DashMap<usize, (usize, tokio::task::JoinHandle<()>)>,
    pub file_priorities: DashMap<String, Vec<FilePriority>>,
    pub download_order: DashMap<String, Vec<usize>>,
    pub pending_selections: DashMap<usize, Vec<usize>>,
    pub session_config_path: PathBuf,
    pub file_order: std::sync::RwLock<FileOrder>,
    pub preferences_path: PathBuf,
    pub created_dir: PathBuf,
    pub limit_locks: DashMap<usize, Arc<tokio::sync::Mutex<()>>>,
    pub peer_counts: DashMap<usize, (Instant, usize)>,
    pub missing_files: DashMap<usize, bool>,
    pause_snapshots: DashMap<String, Vec<FileStamp>>,
    pause_changes: DashMap<String, (Instant, Vec<String>)>,
    rewrite_ghosts: DashMap<String, TorrentInfo>,
    #[cfg(test)]
    pub peer_hints: std::sync::Mutex<Vec<std::net::SocketAddr>>,
    pub rewrites_in_flight: std::sync::atomic::AtomicUsize,
    pub files_cache: DashMap<usize, Vec<TorrentFileInfo>>,
    pub metadata_slots: Arc<tokio::sync::Semaphore>,
}
impl TorrentManager {
    pub async fn new(app_data_dir: PathBuf) -> Result<Self> {
        Self::new_internal(app_data_dir, true).await
    }

    #[cfg(test)]
    pub async fn new_test(app_data_dir: PathBuf) -> Result<Self> {
        Self::new_internal(app_data_dir, false).await
    }

    async fn new_internal(app_data_dir: PathBuf, enable_dht: bool) -> Result<Self> {
        let download_dir = app_data_dir.join("torrents");
        tokio::fs::create_dir_all(&download_dir).await.ok();

        let session_dir = app_data_dir.join("session");
        tokio::fs::create_dir_all(&session_dir).await.ok();

        let created_dir = app_data_dir.join("created_torrents");
        tokio::fs::create_dir_all(&created_dir).await.ok();

        let save_dirs_path = app_data_dir.join("save_dirs.json");
        let save_dirs: HashMap<usize, String> = std::fs::read_to_string(&save_dirs_path)
            .ok()
            .and_then(|json| serde_json::from_str(&json).ok())
            .unwrap_or_default();

        let magnet_links_path = app_data_dir.join("magnet_links.json");
        let magnet_links: HashMap<usize, String> = std::fs::read_to_string(&magnet_links_path)
            .ok()
            .and_then(|json| serde_json::from_str(&json).ok())
            .unwrap_or_default();

        let aliases_path = app_data_dir.join("torrent_aliases.json");
        let aliases: HashMap<String, String> = std::fs::read_to_string(&aliases_path)
            .ok()
            .and_then(|json| serde_json::from_str::<HashMap<String, String>>(&json).ok())
            .unwrap_or_default()
            .into_iter()
            .filter(|(key, value)| is_info_hash(key) && !value.trim().is_empty())
            .collect();

        let torrent_limits_path = app_data_dir.join("torrent_limits.json");
        let torrent_limits: HashMap<String, TorrentLimits> =
            std::fs::read_to_string(&torrent_limits_path)
                .ok()
                .and_then(|json| serde_json::from_str::<HashMap<String, TorrentLimits>>(&json).ok())
                .unwrap_or_default()
                .into_iter()
                .filter(|(key, _)| is_info_hash(key))
                .collect();

        let session_config_path = app_data_dir.join("session_config.json");
        let session_config = std::fs::read_to_string(&session_config_path)
            .ok()
            .and_then(|json| serde_json::from_str::<SessionConfig>(&json).ok())
            .unwrap_or_default();

        let preferences_path = app_data_dir.join("torrent_preferences.json");
        let mut preferences = std::fs::read_to_string(&preferences_path)
            .ok()
            .and_then(|json| serde_json::from_str::<TorrentPreferences>(&json).ok())
            .unwrap_or_default();
        preferences
            .sequential_torrents
            .retain(|key| is_info_hash(key));
        preferences
            .file_priorities
            .retain(|key, _| is_info_hash(key));
        preferences
            .download_order
            .retain(|key, _| is_info_hash(key));

        let persistence = if session_config.disable_persistence {
            None
        } else {
            Some(SessionPersistenceConfig::Json {
                folder: Some(session_dir.clone()),
            })
        };

        let listen_addr: std::net::SocketAddr = if session_config.ipv4_only {
            (Ipv4Addr::UNSPECIFIED, session_config.listen_port).into()
        } else {
            (Ipv6Addr::UNSPECIFIED, session_config.listen_port).into()
        };
        let proxy_url = session_config.proxy_url.as_deref().and_then(|raw| {
            torrent_proxy_url(raw).unwrap_or_else(|error| {
                tracing::warn!("ignoring torrent session proxy: {error}");
                None
            })
        });
        let mut opts = SessionOptions {
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
                proxy_url,
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
            }),
            ..Default::default()
        };
        if !enable_dht {
            opts.dht = None;
        }

        let session = Session::new_with_opts(download_dir, opts)
            .await
            .context("failed to create BitTorrent session")?;

        let manager = Self {
            session,
            save_dirs: save_dirs.into_iter().collect(),
            save_dirs_path,
            magnet_links: magnet_links.into_iter().collect(),
            magnet_links_path,
            aliases: aliases.into_iter().collect(),
            aliases_path,
            torrent_limits: torrent_limits.into_iter().collect(),
            torrent_limits_path,
            sequential_torrents: preferences.sequential_torrents.into_iter().collect(),
            sequential_streams: DashMap::new(),
            file_priorities: preferences.file_priorities.into_iter().collect(),
            download_order: preferences.download_order.into_iter().collect(),
            pending_selections: DashMap::new(),
            file_order: std::sync::RwLock::new(session_config.file_order),
            session_config_path,
            preferences_path,
            created_dir,
            limit_locks: DashMap::new(),
            peer_counts: DashMap::new(),
            missing_files: DashMap::new(),
            pause_snapshots: DashMap::new(),
            pause_changes: DashMap::new(),
            rewrite_ghosts: DashMap::new(),
            #[cfg(test)]
            peer_hints: std::sync::Mutex::new(Vec::new()),
            rewrites_in_flight: std::sync::atomic::AtomicUsize::new(0),
            files_cache: DashMap::new(),
            metadata_slots: Arc::new(tokio::sync::Semaphore::new(METADATA_SLOTS)),
        };
        manager.cleanup_unselected_files();
        Ok(manager)
    }

    fn torrent_handle(&self, id: usize) -> Option<Arc<librqbit::ManagedTorrent>> {
        self.session.with_torrents(|iter| {
            for (tid, handle) in iter {
                if tid == id {
                    return Some(Arc::clone(handle));
                }
            }
            None
        })
    }

    #[cfg(test)]
    fn test_peer_hints(&self) -> Option<Vec<std::net::SocketAddr>> {
        let hints = self
            .peer_hints
            .lock()
            .map(|hints| hints.clone())
            .unwrap_or_default();
        (!hints.is_empty()).then_some(hints)
    }

    fn torrent_info_hash(&self, id: usize) -> Option<String> {
        self.torrent_handle(id)
            .map(|handle| handle.info_hash().as_string())
    }

    fn is_sequential(&self, id: usize) -> bool {
        self.torrent_info_hash(id)
            .is_some_and(|key| self.sequential_torrents.contains(&key))
    }

    fn live_metainfo_bytes(&self, id: usize) -> Option<Vec<u8>> {
        self.torrent_handle(id).and_then(|handle| {
            handle
                .metadata
                .load_full()
                .map(|metadata| metadata.torrent_bytes.to_vec())
        })
    }

    fn torrent_source(&self, id: usize) -> Option<TorrentSource> {
        if let Some(bytes) = self.live_metainfo_bytes(id) {
            return Some(TorrentSource::Bytes(bytes));
        }
        self.magnet_links
            .get(&id)
            .map(|entry| TorrentSource::Magnet(entry.clone()))
    }

    fn tracker_source(
        &self,
        id: usize,
        info_hash: &str,
        name: Option<&str>,
        trackers: &[String],
    ) -> TorrentSource {
        if let Some(bytes) = self.live_metainfo_bytes(id) {
            if let Ok(rewritten) = with_trackers_bytes(&bytes, trackers) {
                return TorrentSource::Bytes(rewritten);
            }
        }
        build_magnet(info_hash, trackers, name)
            .map(TorrentSource::Magnet)
            .unwrap_or_else(|_| TorrentSource::Magnet(format!("magnet:?xt=urn:btih:{info_hash}")))
    }

    fn rewrite_guard(&self) -> RewriteGuard<'_> {
        self.rewrites_in_flight.fetch_add(1, Ordering::SeqCst);
        RewriteGuard(&self.rewrites_in_flight)
    }

    pub fn is_rewriting(&self) -> bool {
        self.rewrites_in_flight.load(Ordering::SeqCst) > 0
    }

    fn capture_rewrite_ghost(&self, id: usize, key: &str) {
        if let Some(ghost) = self
            .collect_torrents()
            .into_iter()
            .find(|torrent| torrent.id == id)
        {
            self.rewrite_ghosts.insert(key.to_string(), ghost);
        }
    }

    fn clear_rewrite_ghost(&self, key: &str) {
        self.rewrite_ghosts.remove(key);
    }

    fn save_save_dirs(&self) {
        let map: HashMap<usize, String> = self
            .save_dirs
            .iter()
            .map(|r| (*r.key(), r.value().clone()))
            .collect();
        if let Ok(json) = serde_json::to_string(&map) {
            let _ = std::fs::write(&self.save_dirs_path, &json);
        }
    }

    fn save_magnet_links(&self) {
        let map: HashMap<usize, String> = self
            .magnet_links
            .iter()
            .map(|r| (*r.key(), r.value().clone()))
            .collect();
        if let Ok(json) = serde_json::to_string(&map) {
            let _ = std::fs::write(&self.magnet_links_path, &json);
        }
    }

    fn save_aliases(&self) {
        let map: HashMap<String, String> = self
            .aliases
            .iter()
            .map(|r| (r.key().clone(), r.value().clone()))
            .collect();
        if let Ok(json) = serde_json::to_string(&map) {
            let _ = std::fs::write(&self.aliases_path, &json);
        }
    }

    fn save_torrent_limits(&self) {
        let map: HashMap<String, TorrentLimits> = self
            .torrent_limits
            .iter()
            .map(|r| (r.key().clone(), *r.value()))
            .collect();
        if let Ok(json) = serde_json::to_string(&map) {
            let _ = std::fs::write(&self.torrent_limits_path, &json);
        }
    }

    fn save_preferences(&self) {
        let preferences = TorrentPreferences {
            sequential_torrents: self
                .sequential_torrents
                .iter()
                .map(|entry| entry.key().clone())
                .collect(),
            file_priorities: self
                .file_priorities
                .iter()
                .map(|entry| (entry.key().clone(), entry.value().clone()))
                .collect(),
            download_order: self
                .download_order
                .iter()
                .map(|entry| (entry.key().clone(), entry.value().clone()))
                .collect(),
        };
        if let Ok(json) = serde_json::to_string(&preferences) {
            let _ = std::fs::write(&self.preferences_path, json);
        }
    }

    pub fn get_torrent_limits(&self, id: usize) -> TorrentLimits {
        self.torrent_info_hash(id)
            .and_then(|key| self.get_torrent_limits_by_key(&key))
            .unwrap_or_default()
    }

    fn get_torrent_limits_by_key(&self, key: &str) -> Option<TorrentLimits> {
        self.torrent_limits.get(key).map(|entry| *entry.value())
    }

    fn torrent_is_paused(&self, id: usize) -> bool {
        self.session
            .with_torrents(|iter| {
                for (torrent_id, handle) in iter {
                    if torrent_id == id {
                        return Some(handle.is_paused());
                    }
                }
                None
            })
            .unwrap_or(false)
    }

    pub async fn set_torrent_limits(
        self: &Arc<Self>,
        id: usize,
        limits: TorrentLimits,
        info_hash: Option<String>,
    ) -> Result<(), String> {
        let lock = self
            .limit_locks
            .entry(id)
            .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
            .clone();
        let _guard = lock.lock().await;
        self.verify_torrent(id, info_hash.as_deref())?;
        let previous_limits = self.get_torrent_limits(id);
        let source = self
            .torrent_source(id)
            .ok_or_else(|| "torrent metainfo is unavailable, try again".to_string())?;
        let key = self
            .torrent_info_hash(id)
            .ok_or_else(|| "Torrent not found".to_string())?;
        let magnet = self.magnet_links.get(&id).map(|entry| entry.clone());
        let save_dir = self
            .save_dirs
            .get(&id)
            .map(|entry| entry.clone())
            .ok_or_else(|| "Torrent save directory is unavailable".to_string())?;
        let selected_files = self
            .get_running_torrent_files(id)
            .ok()
            .map(|files| {
                files
                    .into_iter()
                    .filter(|file| file.selected)
                    .map(|file| file.index)
                    .collect::<Vec<_>>()
            })
            .filter(|files: &Vec<usize>| !files.is_empty());
        let was_paused = self.torrent_is_paused(id);

        if limits == TorrentLimits::default() {
            self.torrent_limits.remove(&key);
        } else {
            self.torrent_limits.insert(key.clone(), limits);
        }
        self.save_torrent_limits();

        let _rewriting = self.rewrite_guard();
        self.capture_rewrite_ghost(id, &key);
        if let Err(error) = self.session.delete(id.into(), false).await {
            self.clear_rewrite_ghost(&key);
            if previous_limits == TorrentLimits::default() {
                self.torrent_limits.remove(&key);
            } else {
                self.torrent_limits.insert(key.clone(), previous_limits);
            }
            self.save_torrent_limits();
            return Err(format!("unable to reconfigure torrent: {error:#}"));
        }
        self.save_save_dirs();
        self.save_magnet_links();

        let result = self
            .add_torrent_inner(
                source.to_add_torrent(true),
                save_dir.clone(),
                selected_files.clone(),
                None,
                Some(id),
                magnet.clone(),
                to_rqbit_limits(limits),
                true,
                false,
                was_paused,
            )
            .await
            .map_err(|error| format!("unable to reconfigure torrent: {error:#}"));
        self.clear_rewrite_ghost(&key);

        if result.is_err() {
            if previous_limits == TorrentLimits::default() {
                self.torrent_limits.remove(&key);
            } else {
                self.torrent_limits.insert(key.clone(), previous_limits);
            }
            self.save_torrent_limits();
            if let Err(restore_error) = self
                .add_torrent_inner(
                    source.to_add_torrent(true),
                    save_dir,
                    selected_files,
                    None,
                    Some(id),
                    magnet,
                    to_rqbit_limits(previous_limits),
                    true,
                    false,
                    was_paused,
                )
                .await
            {
                return Err(format!(
                    "torrent reconfigure failed and the torrent is gone: {restore_error:#}"
                ));
            }
        }

        if result.is_ok() {
            if self.is_sequential(id) {
                self.advance_sequential(id).await?;
            }
            self.save_preferences();
        }
        result.map(|_| ())
    }

    pub fn save_session_config(&self, config: SessionConfig) -> Result<(), String> {
        let config = validate_session_config(config)?;
        let json =
            serde_json::to_string(&config).map_err(|error| format!("Invalid config: {error}"))?;
        std::fs::write(&self.session_config_path, &json)
            .map_err(|error| format!("Failed to save session config: {error}"))?;
        let previous = self.file_order();
        if previous != config.file_order {
            self.set_file_order(config.file_order);
        }
        Ok(())
    }

    fn file_order(&self) -> FileOrder {
        *self
            .file_order
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    fn set_file_order(&self, order: FileOrder) {
        *self
            .file_order
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = order;
    }

    pub fn listen_port(&self) -> Option<u16> {
        self.session.listen_addr().map(|addr| addr.port())
    }

    pub fn collect_torrents(&self) -> Vec<TorrentInfo> {
        self.session.with_torrents(|iter| {
            let mut result = Vec::new();
            for (id, handle) in iter {
                let stats = handle.stats();
                let speed_mbps = stats.live.as_ref().map_or(0.0, |l| l.download_speed.mbps);
                let speed_bytes = speed_mbps * 125_000.0;

                let up_mbps = stats.live.as_ref().map_or(0.0, |l| l.upload_speed.mbps);
                let downloaded_bytes = handle
                    .live()
                    .map_or(stats.progress_bytes, |live| live.get_downloaded_bytes());

                let remaining = stats.total_bytes.saturating_sub(stats.progress_bytes);
                let eta = if speed_mbps > 0.0 && remaining > 0 {
                    Some(remaining as f64 / speed_bytes)
                } else {
                    None
                };

                let save_dir = self
                    .save_dirs
                    .get(&id)
                    .map(|r| r.clone())
                    .unwrap_or_default();
                let sequential_download = self
                    .sequential_torrents
                    .contains(&handle.info_hash().as_string());
                let sequential_file = self.sequential_streams.get(&id).map(|holder| holder.0);
                let download_order = self
                    .download_order
                    .get(&handle.info_hash().as_string())
                    .map(|entry| entry.clone())
                    .unwrap_or_default();

                let peers_connected = self
                    .peer_counts
                    .get(&id)
                    .filter(|entry| entry.value().0.elapsed().as_secs() < 3)
                    .map_or_else(
                        || {
                            let count = handle
                                .live()
                                .map(|l| {
                                    l.per_peer_stats_snapshot(PeerStatsFilter::default())
                                        .peers
                                        .len()
                                })
                                .unwrap_or(0);
                            self.peer_counts.insert(id, (Instant::now(), count));
                            count
                        },
                        |entry| entry.value().1,
                    );

                result.push(TorrentInfo {
                    id,
                    name: self
                        .aliases
                        .get(&handle.info_hash().as_string())
                        .map(|alias| alias.clone())
                        .unwrap_or_else(|| handle.name().unwrap_or_default()),
                    info_hash: handle.info_hash().as_string(),
                    total_bytes: stats.total_bytes,
                    progress_bytes: stats.progress_bytes,
                    uploaded_bytes: stats.uploaded_bytes,
                    share_ratio: share_ratio(stats.uploaded_bytes, downloaded_bytes),
                    download_speed: speed_bytes,
                    upload_speed: up_mbps * 125_000.0,
                    peers_connected,
                    save_dir,
                    sequential_file,
                    download_order,
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
                    missing_files: self
                        .missing_files
                        .get(&id)
                        .is_some_and(|entry| *entry.value()),
                    paused_external_changes: false,
                    paused_changed_files: Vec::new(),
                });
            }
            if self.is_rewriting() {
                let hashes: Vec<String> = self
                    .rewrite_ghosts
                    .iter()
                    .map(|entry| entry.key().clone())
                    .collect();
                for hash in hashes {
                    let Some(ghost) = self.rewrite_ghosts.get(&hash).map(|entry| entry.clone())
                    else {
                        continue;
                    };
                    match result.iter_mut().find(|torrent| torrent.info_hash == hash) {
                        Some(slot) => *slot = ghost,
                        None => result.push(ghost),
                    }
                }
            }
            result.sort_by_key(|torrent| torrent.id);
            result
        })
    }

    pub async fn add_torrent(
        self: &Arc<Self>,
        magnet: String,
        save_dir: String,
        only_files: Option<Vec<usize>>,
        sub_folder: Option<String>,
        sequential: bool,
    ) -> Result<usize> {
        self.add_torrent_inner(
            AddTorrent::from_url(magnet.clone()),
            save_dir,
            only_files,
            sub_folder,
            None,
            Some(magnet),
            LimitsConfig::default(),
            true,
            sequential,
            false,
        )
        .await
    }

    pub async fn add_torrent_from_bytes(
        self: &Arc<Self>,
        bytes: Vec<u8>,
        save_dir: String,
        only_files: Option<Vec<usize>>,
        sub_folder: Option<String>,
        sequential: bool,
    ) -> Result<usize> {
        let add_torrent = AddTorrent::from_bytes(with_fallback_trackers_bytes(&bytes));
        self.add_torrent_inner(
            add_torrent,
            save_dir,
            only_files,
            sub_folder,
            None,
            None,
            LimitsConfig::default(),
            true,
            sequential,
            false,
        )
        .await
    }

    pub async fn create_torrent_from_folder(
        self: &Arc<Self>,
        source_dir: String,
    ) -> Result<CreatedTorrent> {
        let source = PathBuf::from(&source_dir);
        if !source.is_dir() {
            anyhow::bail!("select the folder that holds the files to share");
        }
        let name = source
            .file_name()
            .with_context(|| format!("the selected folder has no name: {}", source.display()))?
            .to_string_lossy()
            .to_string();
        let save_dir = source
            .parent()
            .with_context(|| format!("the selected folder has no parent: {}", source.display()))?
            .to_string_lossy()
            .to_string();

        let mut file_count: usize = 0;
        for entry in jwalk::WalkDir::new(&source) {
            let Ok(entry) = entry else { continue };
            if entry.file_type().is_file() {
                file_count += 1;
            }
        }
        if file_count == 0 {
            anyhow::bail!("the folder has no files to share");
        }

        let options = CreateTorrentOptions {
            trackers: FALLBACK_TRACKERS
                .iter()
                .map(|tracker| (*tracker).to_string())
                .collect(),
            ..Default::default()
        };
        let created = create_torrent(&source, options, &BlockingSpawner::new(1)).await?;
        let bytes = created.as_bytes()?.to_vec();
        let info_hash = created.info_hash().as_string();

        let id = self
            .add_torrent_from_bytes(bytes.clone(), save_dir, None, Some(name.clone()), false)
            .await?;

        let torrent_path = self.created_dir.join(format!("{info_hash}.torrent"));
        tokio::fs::write(&torrent_path, &bytes)
            .await
            .with_context(|| {
                format!(
                    "could not store the created torrent at {}",
                    torrent_path.display()
                )
            })?;

        Ok(CreatedTorrent {
            id,
            name,
            info_hash,
            torrent_path: torrent_path.to_string_lossy().to_string(),
            file_count,
        })
    }

    async fn add_torrent_inner(
        self: &Arc<Self>,
        mut add_torrent: AddTorrent<'_>,
        save_dir: String,
        only_files: Option<Vec<usize>>,
        sub_folder: Option<String>,
        preferred_id: Option<usize>,
        magnet: Option<String>,
        ratelimits: LimitsConfig,
        inject_fallback: bool,
        sequential: bool,
        paused: bool,
    ) -> Result<usize> {
        ensure_minimum_free_space(Path::new(&save_dir))?;

        if let AddTorrent::Url(url) = &add_torrent {
            if url.starts_with("magnet:") && inject_fallback {
                add_torrent = AddTorrent::Url(with_fallback_trackers(url).into());
            }
        }

        let output_folder = sub_folder
            .as_ref()
            .filter(|s| is_safe_relative_path(s))
            .map_or_else(
                || save_dir.clone(),
                |s| {
                    std::path::Path::new(&save_dir)
                        .join(s)
                        .to_string_lossy()
                        .to_string()
                },
            );
        let opts = AddTorrentOptions {
            output_folder: Some(output_folder.clone()),
            overwrite: true,
            only_files: only_files.clone(),
            preferred_id,
            ratelimits,
            paused,
            #[cfg(test)]
            initial_peers: self.test_peer_hints(),
            ..Default::default()
        };
        let response = match &add_torrent {
            AddTorrent::Url(url) if url.starts_with("magnet:") => {
                self.add_torrent_with_timeout(add_torrent, opts, Self::METADATA_TIMEOUT)
                    .await?
            }
            _ => self.session.add_torrent(add_torrent, Some(opts)).await?,
        };

        let id = match response {
            AddTorrentResponse::Added(id, _) => {
                self.save_dirs.insert(id, output_folder);
                self.save_save_dirs();
                self.missing_files.remove(&id);
                if let Some(m) = magnet {
                    self.magnet_links.insert(id, m);
                    self.save_magnet_links();
                }
                id
            }
            AddTorrentResponse::AlreadyManaged(id, _) => {
                self.save_dirs.entry(id).or_insert(output_folder);
                self.save_save_dirs();
                if let Some(m) = magnet {
                    self.magnet_links.entry(id).or_insert(m);
                    self.save_magnet_links();
                }
                id
            }
            AddTorrentResponse::ListOnly(_) => anyhow::bail!("torrent was not added"),
        };
        self.stop_priority_stream(id);

        let handle = self.torrent_handle(id);
        let key = handle.as_ref().map(|handle| handle.info_hash().as_string());
        if let (Some(ref files), Some(handle)) = (&only_files, &handle) {
            let set: HashSet<usize> = files.iter().copied().collect();
            let _ = self.session.update_only_files(handle, &set).await;
        }

        self.cleanup_unselected_files();
        if let (Some(ref files), Some(handle), Some(key)) = (&only_files, &handle, &key) {
            self.pending_selections.insert(id, files.clone());
            self.materialize_priorities(handle, key, files);
        }

        if sequential {
            if let Some(key) = &key {
                self.sequential_torrents.insert(key.clone());
                self.save_preferences();
            }
            if let Err(error) = self.advance_sequential(id).await {
                tracing::warn!("sequential start for torrent {id} deferred: {error}");
            }
        }
        Ok(id)
    }

    fn materialize_priorities(
        &self,
        handle: &Arc<librqbit::ManagedTorrent>,
        key: &str,
        selected: &[usize],
    ) {
        let Some(file_count) = handle
            .with_metadata(|metadata| metadata.file_infos.len())
            .ok()
        else {
            return;
        };
        if self.file_priorities.contains_key(key) {
            return;
        }
        let mut priorities = vec![FilePriority::DoNotDownload; file_count];
        for index in selected {
            if *index < file_count {
                priorities[*index] = FilePriority::Normal;
            }
        }
        self.file_priorities.insert(key.to_string(), priorities);
        self.save_preferences();
    }

    async fn add_torrent_with_timeout(
        self: &Arc<Self>,
        add_torrent: AddTorrent<'_>,
        opts: AddTorrentOptions,
        timeout: std::time::Duration,
    ) -> Result<AddTorrentResponse> {
        let _permit = self
            .metadata_slots
            .acquire()
            .await
            .map_err(|_| anyhow::anyhow!("torrent metadata resource manager is closed"))?;
        tokio::time::timeout(timeout, self.session.add_torrent(add_torrent, Some(opts)))
            .await
            .map_err(|_| {
                anyhow::anyhow!(
                    "Timed out while resolving magnet metadata: no reachable peers or trackers"
                )
            })?
    }

    fn save_torrent_state(
        &self,
        info_hash: &str,
        limits: TorrentLimits,
        sequential: bool,
        priorities: Option<Vec<FilePriority>>,
        order: Option<Vec<usize>>,
    ) {
        if limits != TorrentLimits::default() {
            self.torrent_limits.insert(info_hash.to_string(), limits);
        }
        if sequential {
            self.sequential_torrents.insert(info_hash.to_string());
        }
        if let Some(priorities) = priorities {
            self.file_priorities
                .insert(info_hash.to_string(), priorities);
        }
        if let Some(order) = order {
            self.download_order.insert(info_hash.to_string(), order);
        }
        self.save_torrent_limits();
        self.save_preferences();
    }

    async fn replace_torrent(
        self: &Arc<Self>,
        id: usize,
        source: TorrentSource,
        rollback: TorrentSource,
        magnet: String,
        only_files: Option<Vec<usize>>,
        expected_hash: Option<&str>,
        inject_fallback: bool,
    ) -> Result<usize, String> {
        self.verify_torrent(id, expected_hash)?;
        let save_dir = self
            .save_dirs
            .get(&id)
            .map(|r| r.clone())
            .unwrap_or_default();
        let limits = self.get_torrent_limits(id);
        let info_hash = self
            .torrent_info_hash(id)
            .ok_or_else(|| "torrent not found".to_string())?;
        let sequential = self.sequential_torrents.contains(&info_hash);
        let priorities = self.file_priorities.get(&info_hash).map(|r| r.clone());
        let order = self.download_order.get(&info_hash).map(|r| r.clone());
        let was_paused = self.torrent_is_paused(id);
        let rollback_magnet = self
            .magnet_links
            .get(&id)
            .map(|r| r.clone())
            .unwrap_or_else(|| magnet.clone());
        let cached_files = self.files_cache.get(&id).map(|r| r.clone());
        let _rewriting = self.rewrite_guard();
        self.remove_torrent(id, false, None)
            .await
            .map_err(|e| format!("{e:#}"))?;
        if let Some(files) = cached_files {
            self.files_cache.insert(id, files);
        }
        let added = self
            .add_torrent_inner(
                source.to_add_torrent(inject_fallback),
                save_dir.clone(),
                only_files.clone(),
                None,
                Some(id),
                Some(magnet),
                to_rqbit_limits(limits),
                inject_fallback,
                false,
                was_paused,
            )
            .await;
        self.clear_rewrite_ghost(&info_hash);
        match added {
            Ok(new_id) => {
                self.save_torrent_state(&info_hash, limits, sequential, priorities, order);
                Ok(new_id)
            }
            Err(error) => {
                let message = format!("{error:#}");
                let rollback = self
                    .add_torrent_inner(
                        rollback.to_add_torrent(inject_fallback),
                        save_dir,
                        only_files,
                        None,
                        Some(id),
                        Some(rollback_magnet),
                        to_rqbit_limits(limits),
                        true,
                        false,
                        was_paused,
                    )
                    .await;
                self.save_torrent_state(&info_hash, limits, sequential, priorities, order);
                match rollback {
                    Ok(_) => Err(format!(
                        "unable to rewrite the torrent, restored it as it was: {message}"
                    )),
                    Err(rollback_error) => Err(format!(
                        "unable to rewrite the torrent ({message}) and restoring it failed too: {rollback_error:#}"
                    )),
                }
            }
        }
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

        let magnet = self
            .magnet_links
            .get(&id)
            .map(|r| r.clone())
            .unwrap_or_else(|| format!("magnet:?xt=urn:btih:{info_hash}"));
        let source = self
            .torrent_source(id)
            .unwrap_or_else(|| TorrentSource::Magnet(magnet.clone()));
        let new_id = self
            .replace_torrent(
                id,
                source.clone(),
                source,
                magnet,
                Some(vec![file_index]),
                Some(info_hash.as_str()),
                true,
            )
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

    fn live_trackers(&self, id: usize) -> Result<Vec<String>, String> {
        let found = self.session.with_torrents(|iter| {
            for (tid, handle) in iter {
                if tid != id {
                    continue;
                }
                let mut trackers: Vec<String> = handle
                    .shared()
                    .trackers
                    .iter()
                    .map(|tracker| canonical_or_raw_tracker(tracker.as_ref()))
                    .collect();
                trackers.sort();
                trackers.dedup();
                return Some(trackers);
            }
            None
        });
        found.ok_or_else(|| "Torrent not found".to_string())
    }

    async fn apply_tracker_set(
        self: &Arc<Self>,
        id: usize,
        info_hash: &str,
        trackers: &[String],
    ) -> Result<(), String> {
        self.verify_torrent(id, Some(info_hash))?;
        let name = self
            .collect_torrents()
            .into_iter()
            .find(|torrent| torrent.id == id)
            .map(|torrent| torrent.name);
        let mut merged: Vec<String> = trackers.to_vec();
        if !merged.is_empty() {
            let mut known: std::collections::HashSet<String> = merged
                .iter()
                .map(|tracker| canonical_or_raw_tracker(tracker))
                .collect();
            for fallback in FALLBACK_TRACKERS {
                let canonical = canonical_or_raw_tracker(fallback);
                if known.insert(canonical.clone()) {
                    merged.push(canonical);
                }
            }
        }
        let magnet = build_magnet(info_hash, &merged, name.as_deref())?;
        let source = self.tracker_source(id, info_hash, name.as_deref(), &merged);
        let rollback = self
            .torrent_source(id)
            .unwrap_or_else(|| TorrentSource::Magnet(magnet.clone()));
        let selected: Vec<usize> = self
            .get_running_torrent_files(id)?
            .iter()
            .filter(|file| file.selected)
            .map(|file| file.index)
            .collect();
        self.replace_torrent(
            id,
            source,
            rollback,
            magnet,
            Some(selected),
            Some(info_hash),
            false,
        )
        .await?;
        self.pending_selections.remove(&id);
        Ok(())
    }

    pub async fn add_torrent_tracker(
        self: &Arc<Self>,
        id: usize,
        tracker: String,
        info_hash: String,
    ) -> Result<(), String> {
        self.verify_torrent(id, Some(info_hash.as_str()))?;
        let canonical = validate_tracker_url(&tracker)?;
        let mut trackers = self.live_trackers(id)?;
        if trackers.iter().any(|existing| existing == &canonical) {
            return Ok(());
        }
        trackers.push(canonical);
        trackers.sort();
        self.apply_tracker_set(id, &info_hash, &trackers).await
    }

    pub async fn remove_torrent_tracker(
        self: &Arc<Self>,
        id: usize,
        tracker: String,
        info_hash: String,
    ) -> Result<(), String> {
        self.verify_torrent(id, Some(info_hash.as_str()))?;
        let canonical = validate_tracker_url(&tracker)?;
        let mut trackers = self.live_trackers(id)?;
        let before = trackers.len();
        trackers.retain(|existing| existing != &canonical);
        if trackers.len() == before {
            return Err("Tracker not found on this torrent".to_string());
        }
        self.apply_tracker_set(id, &info_hash, &trackers).await
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

    const METADATA_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(120);

    async fn get_torrent_info_inner(
        self: &Arc<Self>,
        add_torrent: AddTorrent<'_>,
        save_dir: String,
    ) -> Result<TorrentInfoResult, String> {
        self.get_torrent_info_inner_with_timeout(add_torrent, save_dir, Self::METADATA_TIMEOUT)
            .await
    }

    async fn get_torrent_info_inner_with_timeout(
        self: &Arc<Self>,
        add_torrent: AddTorrent<'_>,
        save_dir: String,
        timeout: std::time::Duration,
    ) -> Result<TorrentInfoResult, String> {
        if let AddTorrent::Url(url) = &add_torrent {
            if let Ok(magnet) = Magnet::parse(url) {
                if let Some(info_hash) = magnet.as_id20() {
                    if let Some(result) = self.session.with_torrents(|iter| {
                        for (_, handle) in iter {
                            if handle.info_hash() != info_hash {
                                continue;
                            }
                            return handle
                                .with_metadata(|m| {
                                    let files: Vec<TorrentFileInfo> = m
                                        .file_infos
                                        .iter()
                                        .enumerate()
                                        .map(|(i, f)| TorrentFileInfo {
                                            index: i,
                                            name: f.relative_filename.to_string_lossy().to_string(),
                                            size: f.len,
                                            progress_bytes: 0,
                                            completed: false,
                                            selected: true,
                                            priority: FilePriority::Normal,
                                            exists: false,
                                        })
                                        .collect();
                                    let name = m.info.name().unwrap_or_default().to_string();
                                    Some(TorrentInfoResult {
                                        id: 0,
                                        name,
                                        files,
                                        conflicting_files: Vec::new(),
                                        has_common_folder: false,
                                    })
                                })
                                .unwrap_or(None);
                        }
                        None
                    }) {
                        return Ok(result);
                    }
                }
            }
        }

        let add_torrent = match &add_torrent {
            AddTorrent::Url(url) if url.starts_with("magnet:") => {
                AddTorrent::Url(with_fallback_trackers(url).into())
            }
            _ => add_torrent,
        };
        let opts = AddTorrentOptions {
            output_folder: Some(save_dir.clone()),
            overwrite: true,
            list_only: true,
            ..Default::default()
        };

        let _permit = self
            .metadata_slots
            .acquire()
            .await
            .map_err(|_| "torrent metadata resource manager is closed".to_string())?;
        let response =
            tokio::time::timeout(timeout, self.session.add_torrent(add_torrent, Some(opts)))
                .await
                .map_err(|_| {
                    "Timed out while fetching torrent metadata: no reachable peers or trackers"
                        .to_string()
                })?
                .map_err(|e| format!("{e:#}"))?;

        let AddTorrentResponse::ListOnly(list_only) = response else {
            return Err("unexpected response from add_torrent".to_string());
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
                if !is_safe_relative_path(sub_folder) || !is_safe_relative_path(&f.name) {
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
                .split(['/', '\\'])
                .next()
                .map(std::string::ToString::to_string)
                .filter(|s| !s.is_empty());
            first_prefix.is_some_and(|prefix| {
                files.iter().all(|f| {
                    f.name == prefix
                        || f.name.starts_with(&format!("{prefix}/"))
                        || f.name.starts_with(&format!("{prefix}\\"))
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

    fn verify_torrent(&self, id: usize, expected_hash: Option<&str>) -> Result<(), String> {
        let actual = self
            .session
            .with_torrents(|iter| {
                for (tid, handle) in iter {
                    if tid == id {
                        return Some(handle.info_hash().as_string());
                    }
                }
                None
            })
            .ok_or_else(|| "torrent not found".to_string())?;
        if let Some(expected) = expected_hash {
            if actual != expected {
                return Err("torrent list is stale, refresh and retry".to_string());
            }
        }
        Ok(())
    }

    fn file_stamps(&self, id: usize) -> Option<Vec<FileStamp>> {
        let save_dir = self.save_dirs.get(&id).map(|r| r.clone())?;
        let handle = self.torrent_handle(id)?;
        handle
            .with_metadata(|metadata| {
                metadata
                    .file_infos
                    .iter()
                    .filter(|file| is_safe_relative_path(&file.relative_filename.to_string_lossy()))
                    .map(|file| {
                        let full_path = Path::new(&save_dir).join(&file.relative_filename);
                        let meta = std::fs::metadata(&full_path).ok().filter(|m| m.is_file());
                        FileStamp {
                            name: file.relative_filename.to_string_lossy().to_string(),
                            expected_len: file.len,
                            on_disk_len: meta.as_ref().map(|m| m.len()),
                            mtime_secs: meta
                                .as_ref()
                                .and_then(|m| m.modified().ok())
                                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                .map(|d| d.as_secs() as i64),
                        }
                    })
                    .collect()
            })
            .ok()
    }

    fn snapshot_torrent_files(&self, id: usize) {
        let Some(key) = self.torrent_info_hash(id) else {
            return;
        };
        if let Some(stamps) = self.file_stamps(id) {
            self.pause_snapshots.insert(key.clone(), stamps);
            self.pause_changes.remove(&key);
        }
    }

    pub fn watch_paused_files(&self, torrents: &mut [TorrentInfo]) {
        for torrent in torrents.iter_mut() {
            let changed = self.paused_files_changed(torrent.id);
            torrent.paused_changed_files = changed.clone();
            torrent.paused_external_changes = !changed.is_empty();
        }
    }

    fn paused_files_changed(&self, id: usize) -> Vec<String> {
        let Some(handle) = self.torrent_handle(id) else {
            return Vec::new();
        };
        if !handle.is_paused() {
            return Vec::new();
        }
        let key = handle.info_hash().as_string();
        let Some(snapshot) = self.pause_snapshots.get(&key).map(|entry| entry.clone()) else {
            return Vec::new();
        };
        if let Some(entry) = self.pause_changes.get(&key) {
            let (checked_at, changed) = entry.value().clone();
            if checked_at.elapsed() < PAUSE_WATCH_INTERVAL {
                return changed;
            }
        }
        let changed = self
            .file_stamps(id)
            .map(|stamps| Self::changed_file_names(&snapshot, &stamps))
            .unwrap_or_default();
        self.pause_changes
            .insert(key, (Instant::now(), changed.clone()));
        changed
    }

    fn changed_file_names(before: &[FileStamp], after: &[FileStamp]) -> Vec<String> {
        if before.len() != after.len() {
            return Vec::new();
        }
        before
            .iter()
            .zip(after)
            .filter(|(a, b)| {
                a.name != b.name || a.on_disk_len != b.on_disk_len || a.mtime_secs != b.mtime_secs
            })
            .map(|(a, _)| a.name.clone())
            .collect()
    }

    fn check_from_stamps(id: usize, stamps: &[FileStamp]) -> TorrentCheckResult {
        let mut missing = Vec::new();
        let mut size_mismatch = Vec::new();
        let mut ok = 0usize;
        for stamp in stamps {
            match stamp.on_disk_len {
                None => missing.push(stamp.name.clone()),
                Some(len) if len == stamp.expected_len => ok += 1,
                Some(_) => size_mismatch.push(stamp.name.clone()),
            }
        }
        TorrentCheckResult {
            id,
            missing,
            size_mismatch,
            ok,
            total: stamps.len(),
        }
    }

    async fn reverify_from_disk(
        self: &Arc<Self>,
        id: usize,
        info_hash: &str,
    ) -> Result<usize, String> {
        let selected = self
            .get_running_torrent_files(id)
            .ok()
            .map(|files| {
                files
                    .into_iter()
                    .filter(|file| file.selected)
                    .map(|file| file.index)
                    .collect::<Vec<_>>()
            })
            .filter(|files| !files.is_empty());
        let source = self
            .torrent_source(id)
            .ok_or_else(|| "the torrent metainfo is unavailable, try again".to_string())?;
        let magnet = self
            .magnet_links
            .get(&id)
            .map(|entry| entry.clone())
            .unwrap_or_else(|| format!("magnet:?xt=urn:btih:{info_hash}"));
        self.replace_torrent(
            id,
            source.clone(),
            source,
            magnet,
            selected,
            Some(info_hash),
            true,
        )
        .await
    }

    pub async fn pause_torrent(
        self: &Arc<Self>,
        id: usize,
        info_hash: Option<String>,
    ) -> Result<()> {
        self.verify_torrent(id, info_hash.as_deref())
            .map_err(|e| anyhow::anyhow!(e))?;
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
            .ok_or_else(|| anyhow::anyhow!("torrent not found"))?;
        if handle.is_paused() {
            return Ok(());
        }
        self.session.pause(&handle).await?;
        tokio::time::sleep(PAUSE_SNAPSHOT_SETTLE).await;
        self.snapshot_torrent_files(id);
        Ok(())
    }

    pub async fn resume_torrent(
        self: &Arc<Self>,
        id: usize,
        info_hash: Option<String>,
    ) -> Result<TorrentResumeResult> {
        self.verify_torrent(id, info_hash.as_deref())
            .map_err(|e| anyhow::anyhow!(e))?;
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
            .ok_or_else(|| anyhow::anyhow!("torrent not found"))?;
        if handle.live().is_some() {
            return Ok(TorrentResumeResult {
                id,
                rechecked: false,
                check: None,
            });
        }
        let key = handle.info_hash().as_string();
        let before = self.pause_snapshots.get(&key).map(|entry| entry.clone());
        let after = before.as_ref().and_then(|_| self.file_stamps(id));
        let changed_files = match (&before, &after) {
            (Some(before), Some(after)) => Self::changed_file_names(before, after),
            _ => Vec::new(),
        };
        let changed = !changed_files.is_empty();
        if !changed {
            self.pause_snapshots.remove(&key);
            self.pause_changes.remove(&key);
            self.session.unpause(&handle).await?;
            return Ok(TorrentResumeResult {
                id,
                rechecked: false,
                check: None,
            });
        }
        let check = after
            .as_ref()
            .map(|stamps| Self::check_from_stamps(id, stamps));
        let new_id = self
            .reverify_from_disk(id, &key)
            .await
            .map_err(|error| anyhow::anyhow!(error))?;
        if let Some(check) = &check {
            self.missing_files.insert(new_id, !check.missing.is_empty());
        }
        self.pause_snapshots.remove(&key);
        self.pause_changes.remove(&key);
        let handle = self
            .torrent_handle(new_id)
            .ok_or_else(|| anyhow::anyhow!("torrent not found after re-verifying"))?;
        self.session.unpause(&handle).await?;
        Ok(TorrentResumeResult {
            id: new_id,
            rechecked: true,
            check,
        })
    }

    pub async fn recheck_paused_torrent(
        self: &Arc<Self>,
        id: usize,
        info_hash: Option<String>,
    ) -> Result<TorrentResumeResult> {
        self.verify_torrent(id, info_hash.as_deref())
            .map_err(|error| anyhow::anyhow!(error))?;
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
            .ok_or_else(|| anyhow::anyhow!("torrent not found"))?;
        if !handle.is_paused() {
            anyhow::bail!("pause the torrent before rechecking its files");
        }
        let key = handle.info_hash().as_string();
        let check = self
            .file_stamps(id)
            .map(|stamps| Self::check_from_stamps(id, &stamps));
        let new_id = self
            .reverify_from_disk(id, &key)
            .await
            .map_err(|error| anyhow::anyhow!(error))?;
        if let Some(check) = &check {
            self.missing_files.insert(new_id, !check.missing.is_empty());
        }
        self.snapshot_torrent_files(new_id);
        Ok(TorrentResumeResult {
            id: new_id,
            rechecked: true,
            check,
        })
    }

    pub async fn remove_torrent(
        self: &Arc<Self>,
        id: usize,
        delete_files: bool,
        info_hash: Option<String>,
    ) -> Result<()> {
        let exists = self.session.with_torrents(|iter| {
            for (tid, _) in iter {
                if tid == id {
                    return true;
                }
            }
            false
        });
        if !exists {
            return Ok(());
        }
        self.verify_torrent(id, info_hash.as_deref())
            .map_err(|e| anyhow::anyhow!(e))?;
        let lock = self.limit_locks.get(&id).map(|entry| entry.clone());
        let _guard = match lock {
            Some(lock) => Some(lock.lock_owned().await),
            None => None,
        };
        let key = self.torrent_info_hash(id);
        let rewriting = self.is_rewriting();
        if rewriting {
            if let Some(key) = &key {
                self.capture_rewrite_ghost(id, key);
            }
        }
        self.session.delete(id.into(), delete_files).await?;
        self.save_dirs.remove(&id);
        self.magnet_links.remove(&id);
        if let Some(key) = key {
            self.sequential_torrents.remove(&key);
            self.file_priorities.remove(&key);
            self.download_order.remove(&key);
            self.torrent_limits.remove(&key);
            self.aliases.remove(&key);
            self.pause_snapshots.remove(&key);
            self.pause_changes.remove(&key);
            if !rewriting {
                self.rewrite_ghosts.remove(&key);
            }
        }
        self.stop_priority_stream(id);
        self.pending_selections.remove(&id);
        self.limit_locks.remove(&id);
        self.peer_counts.remove(&id);
        self.missing_files.remove(&id);
        self.files_cache.remove(&id);
        let persisted = Arc::clone(self);
        tokio::task::spawn_blocking(move || {
            persisted.save_save_dirs();
            persisted.save_magnet_links();
            persisted.save_torrent_limits();
            persisted.save_aliases();
            persisted.save_preferences();
        });
        Ok(())
    }

    pub fn set_torrent_alias(
        &self,
        id: usize,
        info_hash: Option<&str>,
        alias: Option<String>,
    ) -> Result<(), String> {
        self.verify_torrent(id, info_hash)?;
        let key = self
            .torrent_info_hash(id)
            .or_else(|| info_hash.map(str::to_string))
            .ok_or_else(|| "torrent not found".to_string())?;
        match alias.map(|name| name.trim().chars().take(200).collect::<String>()) {
            Some(name) if !name.is_empty() => {
                self.aliases.insert(key, name);
            }
            _ => {
                self.aliases.remove(&key);
            }
        }
        self.save_aliases();
        Ok(())
    }

    pub fn export_torrent_file(
        &self,
        id: usize,
        info_hash: Option<&str>,
        out_path: String,
    ) -> Result<String, String> {
        self.verify_torrent(id, info_hash)?;
        let handle = self
            .torrent_handle(id)
            .ok_or_else(|| "torrent not found".to_string())?;
        let bytes = handle
            .with_metadata(|meta| meta.torrent_bytes.clone())
            .map_err(|error| format!("{error:#}"))?;
        if bytes.is_empty() {
            return Err("no torrent file stored for magnet downloads".to_string());
        }
        std::fs::write(&out_path, &bytes).map_err(|error| format!("export torrent: {error}"))?;
        Ok(out_path)
    }

    pub fn set_global_limits(
        &self,
        download_bps: Option<NonZeroU32>,
        upload_bps: Option<NonZeroU32>,
    ) {
        self.session.ratelimits.set_download_bps(download_bps);
        self.session.ratelimits.set_upload_bps(upload_bps);
    }

    pub fn dht_status(&self) -> Option<DhtStatus> {
        let stats = self.session.get_dht()?.stats();
        Some(DhtStatus {
            nodes_v4: stats.routing_table_size,
            nodes_v6: stats.routing_table_size_v6,
            pending: stats.outstanding_requests,
        })
    }

    pub fn get_running_torrent_files(&self, id: usize) -> Result<Vec<TorrentFileInfo>, String> {
        let result = self.session.with_torrents(|iter| {
            for (tid, handle) in iter {
                if tid == id {
                    let h = handle.clone();
                    let stats = h.stats();
                    let only_files = h.only_files();
                    let key = h.info_hash().as_string();
                    return h
                        .with_metadata(|m| {
                            let file_count = m.file_infos.len();

                            if !self.file_priorities.contains_key(&key) {
                                if let Some(selected) = self.pending_selections.remove(&id) {
                                    let mut p = vec![FilePriority::DoNotDownload; file_count];
                                    for &idx in &selected.1 {
                                        if idx < file_count {
                                            p[idx] = FilePriority::Normal;
                                        }
                                    }
                                    self.file_priorities.insert(key.clone(), p);
                                } else if let Some(only) = h
                                    .only_files()
                                    .filter(|_| !self.sequential_torrents.contains(&key))
                                {
                                    let mut p = vec![FilePriority::DoNotDownload; file_count];
                                    for &idx in &only {
                                        if idx < file_count {
                                            p[idx] = FilePriority::Normal;
                                        }
                                    }
                                    self.file_priorities.insert(key.clone(), p);
                                } else {
                                    self.file_priorities.insert(
                                        key.clone(),
                                        vec![FilePriority::Normal; file_count],
                                    );
                                }
                            } else if let Some(selected) = self.pending_selections.remove(&id) {
                                let mut p = vec![FilePriority::DoNotDownload; file_count];
                                for &idx in &selected.1 {
                                    if idx < file_count {
                                        p[idx] = FilePriority::Normal;
                                    }
                                }
                                self.file_priorities.insert(key.clone(), p);
                            } else if let Some(mut priorities) = self.file_priorities.get_mut(&key)
                            {
                                priorities.resize(file_count, FilePriority::Normal);
                            }

                            let prio_list = self
                                .file_priorities
                                .get(&key)
                                .map(|r| r.clone())
                                .unwrap_or_else(|| vec![FilePriority::Normal; file_count]);

                            Some(
                                m.file_infos
                                    .iter()
                                    .enumerate()
                                    .map(|(i, f)| {
                                        let progress =
                                            stats.file_progress.get(i).copied().unwrap_or(0);
                                        let completed = f.len > 0 && progress >= f.len;
                                        let selected =
                                            only_files.as_ref().is_none_or(|of| of.contains(&i));
                                        let priority = prio_list
                                            .get(i)
                                            .copied()
                                            .unwrap_or(FilePriority::Normal);
                                        let exists = self.save_dirs.get(&id).is_some_and(|d| {
                                            let full =
                                                Path::new(d.value()).join(&f.relative_filename);
                                            std::fs::metadata(&full)
                                                .is_ok_and(|m| m.is_file() && m.len() > 0)
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
        if let Some(files) = result {
            self.files_cache.insert(id, files.clone());
            Ok(files)
        } else {
            if self.is_rewriting() {
                if let Some(cached) = self.files_cache.get(&id) {
                    return Ok(cached.clone());
                }
                return Err("torrent not found or no metadata".to_string());
            }
            self.files_cache.remove(&id);
            Err("torrent not found or no metadata".to_string())
        }
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
                        if !is_safe_relative_path(&file.relative_filename.to_string_lossy()) {
                            continue;
                        }
                        let full_path = Path::new(&save_dir).join(&file.relative_filename);
                        let selected = only_files.contains(&i);
                        if selected {
                            unhide_file(&full_path);
                        } else if stats.file_progress.get(i).copied().unwrap_or(0) == 0
                            && std::fs::metadata(&full_path).is_err()
                        {
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
        info_hash: Option<String>,
    ) -> Result<(), String> {
        self.verify_torrent(id, info_hash.as_deref())?;
        let handle_opt = self.session.with_torrents(|iter| {
            for (tid, handle) in iter {
                if tid == id {
                    return Some(handle.clone());
                }
            }
            None
        });

        let handle = handle_opt.ok_or_else(|| "torrent not found".to_string())?;
        let key = handle.info_hash().as_string();
        let only: HashSet<usize> = only_files.iter().copied().collect();

        let result = self
            .session
            .update_only_files(&handle, &only)
            .await
            .map_err(|e| format!("{e}"));
        if result.is_ok() {
            self.file_priorities.remove(&key);
            self.materialize_priorities(&handle, &key, &only_files);
            self.cleanup_unselected_files();
        }
        result
    }

    pub async fn set_file_priority(
        self: &Arc<Self>,
        id: usize,
        file_indices: Vec<usize>,
        priority: FilePriority,
        info_hash: Option<String>,
    ) -> Result<(), String> {
        self.verify_torrent(id, info_hash.as_deref())?;
        let key = self
            .torrent_info_hash(id)
            .ok_or_else(|| "Torrent not found".to_string())?;
        {
            let mut entry = self.file_priorities.entry(key.clone()).or_default();
            for &idx in &file_indices {
                if idx < entry.len() {
                    entry[idx] = priority;
                }
            }
        }
        self.save_preferences();

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

            let file_count = handle.stats().file_progress.len();
            let only: Vec<usize> = handle
                .only_files()
                .unwrap_or_else(|| (0..file_count).collect());
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

    pub async fn set_sequential_download(
        self: &Arc<Self>,
        id: usize,
        enabled: bool,
        info_hash: Option<String>,
    ) -> Result<(), String> {
        self.verify_torrent(id, info_hash.as_deref())?;
        let handle = self
            .torrent_handle(id)
            .ok_or_else(|| "Torrent not found".to_string())?;
        let key = handle.info_hash().as_string();

        if enabled {
            self.sequential_torrents.insert(key);
            self.save_preferences();
            self.advance_sequential(id).await?;
        } else {
            self.sequential_torrents.remove(&key);
            self.save_preferences();
            self.stop_priority_stream(id);
            if let Some(plan) = self.sequential_plan(id, &handle) {
                self.sync_session_selection(
                    &handle,
                    &plan.allowed,
                    handle.stats().file_progress.len(),
                )
                .await?;
            }
        }
        Ok(())
    }

    pub async fn set_torrent_download_order(
        self: &Arc<Self>,
        id: usize,
        file_indices: Vec<usize>,
        info_hash: Option<String>,
    ) -> Result<(), String> {
        self.verify_torrent(id, info_hash.as_deref())?;
        let handle = self
            .torrent_handle(id)
            .ok_or_else(|| "Torrent not found".to_string())?;
        let key = handle.info_hash().as_string();
        let file_count = handle
            .with_metadata(|metadata| metadata.file_infos.len())
            .ok();
        let mut queue: Vec<usize> = Vec::with_capacity(file_indices.len());
        for index in file_indices {
            if queue.contains(&index) || file_count.is_some_and(|count| index >= count) {
                continue;
            }
            queue.push(index);
        }

        if queue.is_empty() {
            self.download_order.remove(&key);
        } else {
            self.download_order.insert(key, queue);
        }
        self.save_preferences();

        if self.is_sequential(id) {
            self.advance_sequential(id).await?;
        }
        Ok(())
    }

    fn sequential_plan(
        &self,
        id: usize,
        handle: &Arc<librqbit::ManagedTorrent>,
    ) -> Option<SequentialPlan> {
        let files: Vec<(String, u64)> = handle
            .with_metadata(|metadata| {
                metadata
                    .file_infos
                    .iter()
                    .map(|file| {
                        (
                            file.relative_filename.to_string_lossy().to_string(),
                            file.len,
                        )
                    })
                    .collect()
            })
            .ok()?;
        if files.is_empty() {
            return None;
        }
        let names: Vec<String> = files.iter().map(|(name, _)| name.clone()).collect();
        let lengths: Vec<u64> = files.iter().map(|(_, length)| *length).collect();
        let key = handle.info_hash().as_string();
        let priorities = self.file_priorities.get(&key).map(|entry| entry.clone());
        let pending = self.pending_selections.get(&id).map(|entry| entry.clone());
        let queue = self.download_order.get(&key).map(|entry| entry.clone());
        Some(plan_sequential(
            &names,
            &lengths,
            &handle.stats().file_progress,
            priorities.as_deref(),
            pending.as_deref(),
            self.file_order(),
            queue.as_deref().unwrap_or_default(),
        ))
    }

    async fn sync_session_selection(
        &self,
        handle: &Arc<librqbit::ManagedTorrent>,
        allowed: &[usize],
        file_count: usize,
    ) -> Result<(), String> {
        let expected: HashSet<usize> = allowed.iter().copied().collect();
        let selected: HashSet<usize> = handle.only_files().map_or_else(
            || (0..file_count).collect(),
            |files| files.into_iter().collect(),
        );
        if selected == expected {
            return Ok(());
        }
        self.session
            .update_only_files(handle, &expected)
            .await
            .map_err(|error| format!("{error:#}"))
    }

    pub async fn advance_sequential(self: &Arc<Self>, id: usize) -> Result<(), String> {
        let handle = self
            .torrent_handle(id)
            .ok_or_else(|| "Torrent not found".to_string())?;

        let stats = handle.stats();
        if matches!(stats.state, TorrentStatsState::Initializing { .. }) {
            return Ok(());
        }

        let Some(plan) = self.sequential_plan(id, &handle) else {
            return Ok(());
        };
        self.sync_session_selection(&handle, &plan.allowed, stats.file_progress.len())
            .await?;

        match plan.target {
            Some(target) if !self.torrent_is_paused(id) => {
                self.hold_priority_stream(id, target, &handle);
            }
            Some(_) => self.stop_priority_stream(id),
            None => {
                self.stop_priority_stream(id);
            }
        }
        Ok(())
    }

    fn hold_priority_stream(
        self: &Arc<Self>,
        id: usize,
        file_id: usize,
        handle: &Arc<librqbit::ManagedTorrent>,
    ) {
        if let Some(current) = self.sequential_streams.get(&id) {
            if current.0 == file_id && !current.1.is_finished() {
                return;
            }
        }
        self.stop_priority_stream(id);

        let manager = Arc::clone(self);
        let handle = Arc::clone(handle);
        let task = tokio::spawn(async move {
            let mut stream = match handle.clone().stream(file_id).await {
                Ok(stream) => stream,
                Err(error) => {
                    tracing::warn!(
                        "sequential mode could not prioritize file {file_id} of torrent {id}: \
                         {error:#}"
                    );
                    return;
                }
            };
            loop {
                let progress = handle
                    .stats()
                    .file_progress
                    .get(file_id)
                    .copied()
                    .unwrap_or(0);
                let seek =
                    tokio::io::AsyncSeekExt::seek(&mut stream, std::io::SeekFrom::Start(progress));
                if seek.await.is_err() {
                    return;
                }
                tokio::time::sleep(SEQUENTIAL_PRIORITY_TICK).await;
                if !manager.is_sequential(id) || manager.torrent_handle(id).is_none() {
                    return;
                }
            }
        });
        self.sequential_streams.insert(id, (file_id, task));
    }

    fn stop_priority_stream(&self, id: usize) {
        if let Some((_, (_, task))) = self.sequential_streams.remove(&id) {
            task.abort();
        }
    }

    pub async fn reapply_stored_limits(self: &Arc<Self>) {
        for (id, key, limits) in self.stored_limits() {
            if let Err(error) = self.set_torrent_limits(id, limits, Some(key.clone())).await {
                tracing::warn!("could not restore the limits of torrent {id}: {error}");
            }
        }
    }

    fn stored_limits(&self) -> Vec<(usize, String, TorrentLimits)> {
        self.session
            .with_torrents(|iter| {
                iter.map(|(id, handle)| (id, handle.info_hash().as_string()))
                    .collect::<Vec<_>>()
            })
            .into_iter()
            .filter_map(|(id, key)| {
                let limits = self.get_torrent_limits_by_key(&key)?;
                (limits != TorrentLimits::default()).then_some((id, key, limits))
            })
            .collect()
    }

    pub async fn advance_sequential_torrents(self: &Arc<Self>) {
        let sequential: Vec<usize> = self
            .session
            .with_torrents(|iter| {
                iter.map(|(id, handle)| (id, handle.info_hash().as_string()))
                    .collect::<Vec<_>>()
            })
            .into_iter()
            .filter(|(_, key)| self.sequential_torrents.contains(key))
            .map(|(id, _)| id)
            .collect();
        let mut sequential = sequential;
        sequential.sort_unstable();
        for id in sequential.iter().skip(MAX_SEQUENTIAL_PRIORITY_STREAMS) {
            self.stop_priority_stream(*id);
        }
        for id in sequential.into_iter().take(MAX_SEQUENTIAL_PRIORITY_STREAMS) {
            if let Err(error) = self.advance_sequential(id).await {
                tracing::warn!("sequential download step failed for torrent {id}: {error}");
            }
        }
    }

    pub fn recheck_torrent(
        &self,
        id: usize,
        info_hash: Option<String>,
    ) -> Result<TorrentCheckResult, String> {
        self.verify_torrent(id, info_hash.as_deref())?;
        let save_dir = self
            .save_dirs
            .get(&id)
            .map(|r| r.clone())
            .unwrap_or_default();
        if save_dir.is_empty() {
            return Err("torrent not found".to_string());
        }
        let result = self.session.with_torrents(|iter| {
            for (tid, handle) in iter {
                if tid == id {
                    let h = handle.clone();
                    return h
                        .with_metadata(|m| {
                            let mut missing = Vec::new();
                            let mut size_mismatch = Vec::new();
                            let mut ok = 0usize;
                            let mut total = 0usize;
                            for f in &m.file_infos {
                                if !is_safe_relative_path(&f.relative_filename.to_string_lossy()) {
                                    continue;
                                }
                                total += 1;
                                let full_path = Path::new(&save_dir).join(&f.relative_filename);
                                match std::fs::metadata(&full_path) {
                                    Ok(meta) if meta.is_file() && meta.len() == f.len => ok += 1,
                                    Ok(meta) if meta.is_file() => {
                                        size_mismatch.push(
                                            f.relative_filename.to_string_lossy().to_string(),
                                        );
                                    }
                                    _ => {
                                        missing.push(
                                            f.relative_filename.to_string_lossy().to_string(),
                                        );
                                    }
                                }
                            }
                            Some(TorrentCheckResult {
                                id,
                                missing,
                                size_mismatch,
                                ok,
                                total,
                            })
                        })
                        .unwrap_or(None);
                }
            }
            None
        });
        let check = result.ok_or_else(|| "torrent not found or no metadata".to_string())?;
        self.missing_files.insert(id, !check.missing.is_empty());
        Ok(check)
    }

    pub fn verify_pending_missing(&self, torrents: &mut [TorrentInfo], limit: usize) {
        let mut checked = 0;
        for candidate in torrents
            .iter_mut()
            .filter(|torrent| torrent.finished || torrent.error.is_some())
        {
            if checked >= limit {
                break;
            }
            if self.missing_files.contains_key(&candidate.id) {
                continue;
            }
            checked += 1;
            let verdict = self
                .recheck_torrent(candidate.id, Some(candidate.info_hash.clone()))
                .map(|result| !result.missing.is_empty());
            let missing = verdict.unwrap_or(false);
            self.missing_files.insert(candidate.id, missing);
            candidate.missing_files = missing;
        }
    }

    pub fn torrent_diagnostics(
        &self,
        id: usize,
        info_hash: Option<String>,
    ) -> Result<TorrentDiagnostics, String> {
        self.verify_torrent(id, info_hash.as_deref())?;
        let found = self.session.with_torrents(|iter| {
            for (tid, handle) in iter {
                if tid != id {
                    continue;
                }
                let mut peers: Vec<TorrentDiagPeer> = handle
                    .live()
                    .map(|live| {
                        live.per_peer_stats_snapshot(PeerStatsFilter::default())
                            .peers
                            .into_iter()
                            .map(|(addr, stats)| TorrentDiagPeer {
                                country: country_code_for_addr(&addr).map(ToString::to_string),
                                addr,
                                state: stats.state.to_string(),
                                client_name: stats.client_name,
                                conn_kind: stats.conn_kind.map(|kind| kind.to_string()),
                                down_bytes: stats.counters.fetched_bytes,
                                up_bytes: stats.counters.uploaded_bytes,
                                errors: stats.counters.errors,
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                peers.sort_by_key(|peer| std::cmp::Reverse(peer.down_bytes));
                peers.truncate(100);
                let mut trackers: Vec<String> = handle
                    .shared()
                    .trackers
                    .iter()
                    .map(ToString::to_string)
                    .collect();
                trackers.sort();
                return Some(TorrentDiagnostics {
                    id,
                    peers,
                    trackers,
                });
            }
            None
        });
        found.ok_or_else(|| "Torrent not found".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::super::helpers::{
        is_safe_relative_path, with_fallback_trackers, with_fallback_trackers_bytes,
    };
    use super::super::types::FilePriority;
    use super::*;
    use librqbit::{create_torrent, torrent_from_bytes, CreateTorrentOptions};
    #[tokio::test(flavor = "multi_thread")]
    async fn diagnostics_rejects_unknown_id() {
        let dir = std::env::temp_dir().join(format!("iluha-diag-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create temp dir");
        let manager = TorrentManager::new_test(dir).await.expect("manager");
        let error = manager
            .torrent_diagnostics(999, None)
            .expect_err("unknown id");
        assert_eq!(error, "torrent not found");
    }
    #[test]
    fn is_safe_relative_path_rejects_absolute_and_traversal_paths() {
        assert!(!is_safe_relative_path(""));
        assert!(!is_safe_relative_path("/tmp/video.mkv"));
        assert!(!is_safe_relative_path("../video.mkv"));
        assert!(!is_safe_relative_path("folder/../video.mkv"));
    }

    #[test]
    fn is_safe_relative_path_accepts_normal_nested_paths() {
        assert!(is_safe_relative_path("Season 1/video.mkv"));
    }

    #[test]
    fn share_ratio_is_safe_for_zero_downloads() {
        assert_eq!(share_ratio(100, 0), 0.0);
        assert_eq!(share_ratio(500, 1000), 0.5);
        assert_eq!(share_ratio(2500, 1000), 2.5);
    }

    #[test]
    fn torrent_preferences_round_trip_through_json() {
        let hash = "0123456789abcdef0123456789abcdef01234567".to_string();
        let preferences = TorrentPreferences {
            sequential_torrents: HashSet::from([hash.clone()]),
            file_priorities: HashMap::from([(
                hash.clone(),
                vec![FilePriority::Normal, FilePriority::DoNotDownload],
            )]),
            download_order: HashMap::from([(hash.clone(), vec![2, 0])]),
        };
        let json = serde_json::to_string(&preferences).expect("preferences serialize");
        let restored: TorrentPreferences =
            serde_json::from_str(&json).expect("preferences deserialize");
        assert!(restored.sequential_torrents.contains(&hash));
        assert_eq!(
            restored.file_priorities.get(&hash),
            Some(&vec![FilePriority::Normal, FilePriority::DoNotDownload])
        );
        assert_eq!(restored.download_order.get(&hash), Some(&vec![2, 0]));
    }

    #[test]
    fn a_preferences_file_without_a_queue_still_loads() {
        let json = r#"{"sequential_torrents":["0123456789abcdef0123456789abcdef01234567"],"file_priorities":{}}"#;
        let restored: TorrentPreferences =
            serde_json::from_str(json).expect("preferences deserialize");
        assert!(restored.download_order.is_empty());
        assert_eq!(restored.sequential_torrents.len(), 1);
    }

    #[test]
    fn preferences_keyed_by_id_like_values_are_ignored() {
        let legacy = r#"{"sequential_torrents":[0,3],"file_priorities":{"3":["normal"]}}"#;
        let parsed: Result<TorrentPreferences, _> = serde_json::from_str(legacy);
        assert!(parsed.is_err(), "an id-keyed list must not silently load");
    }

    #[test]
    fn with_fallback_trackers_encodes_and_appends() {
        let magnet = "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567";
        let augmented = with_fallback_trackers(magnet);
        assert!(augmented.starts_with(magnet));
        assert!(augmented.contains("tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce"));
        let with_tr = format!("{magnet}&tr=http%3A%2F%2Fbt.example%2Fann");
        let augmented_tr = with_fallback_trackers(&with_tr);
        assert!(augmented_tr.contains("tr=http%3A%2F%2Fbt.example%2Fann"));
        assert!(augmented_tr.contains("tracker.opentrackr.org"));
        assert!(augmented_tr.contains(magnet));
    }

    fn minimal_torrent_bytes() -> Vec<u8> {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"d4:infod6:lengthi5e4:name4:file");
        bytes.extend_from_slice(b"12:piece lengthi32768e6:pieces20:");
        bytes.extend_from_slice(&[0u8; 20]);
        bytes.extend_from_slice(b"e8:announce13:udp://trackere");
        bytes
    }

    #[test]
    fn torrent_bytes_get_fallback_trackers_and_keep_infohash() {
        let bytes = minimal_torrent_bytes();
        let augmented = with_fallback_trackers_bytes(&bytes);

        let parsed = torrent_from_bytes(&augmented).expect("augmented torrent parses");
        let trackers: HashSet<Vec<u8>> = parsed
            .announce_list
            .iter()
            .flatten()
            .map(|tracker| tracker.as_ref().to_vec())
            .collect();
        assert!(trackers.contains(b"udp://tracker".as_slice()));
        assert!(trackers.contains(b"udp://tracker.opentrackr.org:1337/announce".as_slice()));
        assert_eq!(
            crate::bencode::extract_info_hash(&augmented).expect("infohash"),
            crate::bencode::extract_info_hash(&bytes).expect("infohash")
        );
    }

    #[test]
    fn private_and_malformed_torrent_bytes_are_left_untouched() {
        let mut private = Vec::new();
        private.extend_from_slice(b"d4:infod6:lengthi5e4:name4:file");
        private.extend_from_slice(b"12:piece lengthi32768e6:pieces20:");
        private.extend_from_slice(&[0u8; 20]);
        private.extend_from_slice(b"7:privatei1ee8:announce13:udp://trackere");

        assert_eq!(with_fallback_trackers_bytes(&private), private);
        assert_eq!(
            with_fallback_trackers_bytes(b"not a torrent"),
            b"not a torrent".to_vec()
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn already_managed_magnet_returns_files_instantly() {
        let dir = std::env::temp_dir().join(format!("iluha-meta-fast-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create temp dir");

        let manager = Arc::new(
            TorrentManager::new_test(dir.clone())
                .await
                .expect("session starts"),
        );
        let bytes = minimal_torrent_bytes();
        let save_dir = dir.to_string_lossy().to_string();
        manager
            .add_torrent_from_bytes(bytes.clone(), save_dir.clone(), None, None, false)
            .await
            .expect("add torrent");

        let info_hash = crate::bencode::extract_info_hash(&bytes).expect("infohash");
        let magnet = format!("magnet:?xt=urn:btih:{info_hash}&dn=file");

        let start = std::time::Instant::now();
        let result = manager
            .get_torrent_info(magnet, save_dir)
            .await
            .expect("fast path returns the file list");
        let elapsed = start.elapsed();
        assert!(
            elapsed.as_secs() < 2,
            "fast path must not hit the network, took {elapsed:?}"
        );
        assert_eq!(result.name, "file");
        assert_eq!(result.files.len(), 1);
        assert_eq!(result.files[0].name, "file");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn metadata_resolution_times_out_without_peers() {
        let dir = std::env::temp_dir().join(format!("iluha-meta-timeout-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create temp dir");

        let manager = Arc::new(
            TorrentManager::new_test(dir.clone())
                .await
                .expect("session starts"),
        );

        let magnet = format!(
            "magnet:?xt=urn:btih:{}&dn=no-such-torrent",
            "0123456789abcdef0123456789abcdef01234567"
        );
        let save_dir = dir.to_string_lossy().to_string();

        let result = tokio::time::timeout(
            std::time::Duration::from_secs(45),
            manager.get_torrent_info_inner_with_timeout(
                AddTorrent::from_url(magnet),
                save_dir,
                std::time::Duration::from_secs(10),
            ),
        )
        .await
        .expect("the bounded fetch must return within the hard bound");

        assert!(result.is_err(), "expected a timeout error, got {result:?}");
        let error = result.unwrap_err();
        assert!(error.contains("Timed out"), "unexpected error: {error}");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn magnet_download_start_times_out_without_peers() {
        let dir = std::env::temp_dir().join(format!("iluha-add-timeout-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create temp dir");

        let manager = Arc::new(
            TorrentManager::new_test(dir.clone())
                .await
                .expect("session starts"),
        );

        let magnet = format!(
            "magnet:?xt=urn:btih:{}&dn=no-such-torrent",
            "0123456789abcdef0123456789abcdef01234567"
        );
        let opts = AddTorrentOptions {
            output_folder: Some(dir.to_string_lossy().to_string()),
            overwrite: true,
            ..Default::default()
        };

        let result = tokio::time::timeout(
            std::time::Duration::from_secs(45),
            manager.add_torrent_with_timeout(
                AddTorrent::from_url(magnet),
                opts,
                std::time::Duration::from_secs(10),
            ),
        )
        .await
        .expect("the bounded add must return within the hard bound");

        let error = result.err().expect("expected a timeout error");
        let error = format!("{error:#}");
        assert!(error.contains("Timed out"), "unexpected error: {error}");

        let _ = std::fs::remove_dir_all(&dir);
    }

    fn test_info(id: usize, finished: bool, error: Option<&str>) -> TorrentInfo {
        TorrentInfo {
            id,
            name: format!("Torrent {id}"),
            info_hash: format!("hash-{id}"),
            total_bytes: 1000,
            progress_bytes: 0,
            uploaded_bytes: 0,
            share_ratio: 0.0,
            download_speed: 0.0,
            upload_speed: 0.0,
            peers_connected: 0,
            progress: 0.0,
            state: "live".to_string(),
            eta_secs: None,
            finished,
            error: error.map(str::to_string),
            save_dir: "/dl".to_string(),
            sequential_download: false,
            sequential_file: None,
            download_order: Vec::new(),
            missing_files: false,
            paused_external_changes: false,
            paused_changed_files: Vec::new(),
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn verify_pending_missing_skips_downloading_torrents_and_respects_the_limit() {
        let dir = std::env::temp_dir().join(format!("iluha-verify-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create temp dir");
        let manager = Arc::new(
            TorrentManager::new_test(dir.clone())
                .await
                .expect("session starts"),
        );

        let mut torrents = vec![
            test_info(1, false, None),
            test_info(2, true, None),
            test_info(3, true, None),
        ];
        manager.verify_pending_missing(&mut torrents, 1);

        assert!(
            !manager.missing_files.contains_key(&1),
            "an unfinished torrent is never checked: everything it still has to fetch would read as missing"
        );
        assert!(manager.missing_files.contains_key(&2));
        assert!(!manager.missing_files.contains_key(&3));
        assert!(!torrents[1].missing_files);
        assert!(!torrents[2].missing_files);

        manager.verify_pending_missing(&mut torrents, 5);
        assert!(
            manager.missing_files.contains_key(&3),
            "the next call picks up the rest"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    fn create_test_torrent(label: &str, files: &[(&str, Vec<u8>)]) -> (Vec<u8>, PathBuf) {
        let dir =
            std::env::temp_dir().join(format!("iluha-torrent-src-{}-{label}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create source dir");
        for (name, content) in files {
            let path = dir.join(name);
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent).expect("create nested dir");
            }
            std::fs::write(&path, content).expect("write source file");
        }
        let spawner = librqbit::spawn_utils::BlockingSpawner::new(1);
        let result = tokio::task::block_in_place(|| {
            futures::executor::block_on(create_torrent(
                &dir,
                CreateTorrentOptions {
                    piece_length: Some(16 * 1024),
                    ..Default::default()
                },
                &spawner,
            ))
        })
        .expect("create torrent");
        (result.as_bytes().expect("serialize torrent").to_vec(), dir)
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn create_torrent_from_folder_refuses_a_file_or_an_empty_folder() {
        let dir = std::env::temp_dir().join(format!("iluha-create-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create temp dir");
        let manager = Arc::new(
            TorrentManager::new_test(dir.clone())
                .await
                .expect("session starts"),
        );

        let file = dir.join("movie.mkv");
        std::fs::write(&file, b"not a folder").expect("write file");
        let error = manager
            .create_torrent_from_folder(file.to_string_lossy().to_string())
            .await
            .expect_err("a single file is not a shareable folder");
        assert!(error.to_string().contains("folder"), "got: {error}");

        let empty = dir.join("Empty");
        std::fs::create_dir_all(&empty).expect("create empty dir");
        let error = manager
            .create_torrent_from_folder(empty.to_string_lossy().to_string())
            .await
            .expect_err("a folder with no files can never be seeded");
        assert!(error.to_string().contains("no files"), "got: {error}");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn create_torrent_from_folder_seeds_the_folder_in_place() {
        let dir = std::env::temp_dir().join(format!("iluha-seed-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let source = dir.join("Show");
        std::fs::create_dir_all(source.join("nested")).expect("create source dir");
        std::fs::write(source.join("one.bin"), b"first").expect("write file");
        std::fs::write(source.join("nested").join("two.bin"), b"second")
            .expect("write nested file");

        let manager = Arc::new(
            TorrentManager::new_test(dir.clone())
                .await
                .expect("session starts"),
        );
        let created = manager
            .create_torrent_from_folder(source.to_string_lossy().to_string())
            .await
            .expect("the folder becomes a seeded torrent");

        assert_eq!(created.name, "Show");
        assert_eq!(created.file_count, 2);
        assert_eq!(
            created.info_hash.len(),
            40,
            "an info hash is 20 bytes of hex"
        );

        let stored = std::fs::read(&created.torrent_path).expect("the metainfo copy is on disk");
        let parsed = torrent_from_bytes(&stored).expect("the stored copy parses");
        assert_eq!(parsed.info_hash.as_string(), created.info_hash);

        let seeded_from = manager
            .save_dirs
            .get(&created.id)
            .map(|saved| saved.value().clone())
            .expect("the created torrent is in the session");
        assert_eq!(
            seeded_from,
            source.to_string_lossy().to_string(),
            "seeding has to read the folder itself, not its parent"
        );

        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(20);
        let mut info = None;
        while tokio::time::Instant::now() < deadline {
            info = manager
                .collect_torrents()
                .into_iter()
                .find(|torrent| torrent.id == created.id);
            if info.as_ref().is_some_and(|torrent| torrent.finished) {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        }
        let info = info.expect("the created torrent shows up in the list");
        assert_eq!(info.name, "Show");
        assert_eq!(info.info_hash, created.info_hash);
        assert!(
            info.finished,
            "the files on disk have to be the payload, not something to download"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn torrent_file_add_reaches_live_state_with_file_list() {
        let dir = std::env::temp_dir().join(format!("iluha-torrent-add-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create temp dir");

        #[allow(clippy::cast_sign_loss)]
        let content_a: Vec<u8> = (0..40 * 1024).map(|i| (i % 251) as u8).collect();
        #[allow(clippy::cast_sign_loss)]
        let content_b: Vec<u8> = (0..16 * 1024).map(|i| (i * 7 % 251) as u8).collect();
        let nested_name = Path::new("nested")
            .join("two.bin")
            .to_string_lossy()
            .to_string();
        let (torrent_bytes, source_dir) = create_test_torrent(
            "list",
            &[("one.bin", content_a), ("nested/two.bin", content_b)],
        );

        let manager = Arc::new(
            TorrentManager::new_test(dir.clone())
                .await
                .expect("session starts"),
        );
        let save_dir = dir.join("downloads").to_string_lossy().to_string();

        let info = manager
            .get_torrent_info_from_bytes(torrent_bytes.clone(), save_dir.clone())
            .await
            .expect("picker shows the file list for a torrent file");
        assert_eq!(info.files.len(), 2);
        let names: HashSet<&str> = info.files.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(names.len(), 2);
        assert!(names.contains("one.bin"));
        assert!(names.contains(nested_name.as_str()));
        let one_index = info
            .files
            .iter()
            .find(|f| f.name == "one.bin")
            .expect("one.bin present")
            .index;
        let two_index = info
            .files
            .iter()
            .find(|f| f.name == nested_name)
            .expect("nested/two.bin present")
            .index;

        let id = manager
            .add_torrent_from_bytes(torrent_bytes.clone(), save_dir.clone(), None, None, false)
            .await
            .expect("torrent file adds");

        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(20);
        let mut state = String::new();
        while tokio::time::Instant::now() < deadline {
            state = manager
                .collect_torrents()
                .into_iter()
                .find(|t| t.id == id)
                .map(|t| t.state)
                .unwrap_or_default();
            if state == "live" {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        }
        assert_eq!(state, "live", "torrent must leave initializing and go live");

        let files = manager
            .get_running_torrent_files(id)
            .expect("running torrent exposes its file list");
        assert_eq!(files.len(), 2);
        assert!(files.iter().all(|f| f.selected));
        assert!(files.iter().all(|f| f.priority == FilePriority::Normal));

        let id2 = manager
            .add_torrent_from_bytes(torrent_bytes, save_dir, Some(vec![one_index]), None, false)
            .await
            .expect("re-add with a subset updates the selection");
        assert_eq!(id2, id);
        let files = manager
            .get_running_torrent_files(id)
            .expect("running torrent exposes its updated file list");
        let one = files
            .iter()
            .find(|f| f.index == one_index)
            .expect("one.bin");
        let two = files
            .iter()
            .find(|f| f.index == two_index)
            .expect("nested/two.bin");
        assert!(one.selected);
        assert_eq!(one.priority, FilePriority::Normal);
        assert!(!two.selected);
        assert_eq!(two.priority, FilePriority::DoNotDownload);

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&source_dir);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn sequential_add_starts_with_the_first_file_the_list_shows() {
        let dir = std::env::temp_dir().join(format!("iluha-sequential-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create temp dir");

        #[allow(clippy::cast_sign_loss)]
        let content_a: Vec<u8> = (0..40 * 1024).map(|i| (i % 251) as u8).collect();
        #[allow(clippy::cast_sign_loss)]
        let content_b: Vec<u8> = (0..40 * 1024).map(|i| (i * 13 % 251) as u8).collect();
        let (torrent_bytes, source_dir) = create_test_torrent(
            "sequential",
            &[("Show - 02.mkv", content_a), ("Show - 01.mkv", content_b)],
        );

        let manager = Arc::new(
            TorrentManager::new_test(dir.clone())
                .await
                .expect("session starts"),
        );
        let save_dir = dir.join("downloads").to_string_lossy().to_string();

        let info = manager
            .get_torrent_info_from_bytes(torrent_bytes.clone(), save_dir.clone())
            .await
            .expect("file list");
        let first_index = info
            .files
            .iter()
            .find(|f| f.name == "Show - 01.mkv")
            .expect("Show - 01.mkv present")
            .index;

        let id = manager
            .add_torrent_from_bytes(torrent_bytes, save_dir, None, None, true)
            .await
            .expect("sequential add");

        for _ in 0..200 {
            let initializing = manager.torrent_handle(id).is_some_and(|handle| {
                matches!(handle.stats().state, TorrentStatsState::Initializing { .. })
            });
            if !initializing {
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        manager.advance_sequential_torrents().await;

        let files = manager
            .get_running_torrent_files(id)
            .expect("running torrent exposes its file list");
        assert!(
            files.iter().all(|file| file.selected),
            "sequential mode is a nudge, not a selection: nothing the user picked is dropped \
             from the download, so no file is ever cancelled by it"
        );
        assert_eq!(
            manager.sequential_streams.get(&id).map(|holder| holder.0),
            Some(first_index),
            "the priority window opens on the first row the list shows, not the first index"
        );
        let hash = manager
            .collect_torrents()
            .into_iter()
            .find(|torrent| torrent.id == id)
            .expect("the torrent shows up in the list")
            .info_hash;
        assert!(
            manager.sequential_torrents.contains(&hash),
            "the mode is remembered by info hash, not by the session id"
        );
        assert!(
            !manager.torrent_is_paused(id),
            "the mode orders the download, it does not pause the torrent"
        );
        let listed = manager
            .collect_torrents()
            .into_iter()
            .find(|torrent| torrent.id == id)
            .expect("the torrent shows up in the list");
        assert!(listed.sequential_download);
        assert_eq!(
            listed.sequential_file,
            Some(first_index),
            "the list carries the file the mode is fetching first, which is what the UI marks"
        );
        assert_eq!(
            manager
                .file_priorities
                .get(&hash)
                .map(|entry| entry.iter().filter(|p| **p == FilePriority::Normal).count()),
            Some(2),
            "the mode must not turn the user's selection into a single file"
        );

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&source_dir);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn the_download_order_is_keyed_by_info_hash_and_moves_the_window() {
        let dir = std::env::temp_dir().join(format!("iluha-queue-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create temp dir");

        #[allow(clippy::cast_sign_loss)]
        let content: Vec<u8> = (0..40 * 1024).map(|i| (i % 251) as u8).collect();
        let (torrent_bytes, source_dir) = create_test_torrent(
            "queue",
            &[
                ("Show - 02.mkv", content.clone()),
                ("Show - 01.mkv", content.clone()),
                ("Show - 03.mkv", content),
            ],
        );

        let manager = Arc::new(
            TorrentManager::new_test(dir.clone())
                .await
                .expect("session starts"),
        );
        let save_dir = dir.join("downloads").to_string_lossy().to_string();
        let id = manager
            .add_torrent_from_bytes(torrent_bytes, save_dir, None, None, true)
            .await
            .expect("sequential add");
        wait_for_download_state(&manager, id).await;
        manager.advance_sequential_torrents().await;

        let files = manager.get_running_torrent_files(id).expect("file list");
        let index_of = |name: &str| {
            files
                .iter()
                .find(|file| file.name == name)
                .expect("file present")
                .index
        };
        let (first, second, third) = (
            index_of("Show - 01.mkv"),
            index_of("Show - 02.mkv"),
            index_of("Show - 03.mkv"),
        );
        let hash = manager
            .collect_torrents()
            .into_iter()
            .find(|torrent| torrent.id == id)
            .expect("torrent listed")
            .info_hash;

        assert_ne!(
            first, third,
            "the queue has to move the window for this test to prove anything"
        );
        assert_eq!(
            manager.sequential_streams.get(&id).map(|entry| entry.0),
            Some(first),
            "without an arrangement the mode takes the first row of the list"
        );

        manager
            .set_torrent_download_order(id, vec![third, 999, third], Some(hash.clone()))
            .await
            .expect("order saved");
        assert_eq!(
            manager.download_order.get(&hash).map(|entry| entry.clone()),
            Some(vec![third]),
            "the queue is stored under the info hash, cleaned of what cannot be fetched"
        );
        assert_eq!(
            manager.sequential_streams.get(&id).map(|entry| entry.0),
            Some(third),
            "the window moves to the queued file before the next tick"
        );
        assert_eq!(
            manager
                .collect_torrents()
                .into_iter()
                .find(|torrent| torrent.id == id)
                .expect("torrent listed")
                .download_order,
            vec![third],
            "the list carries the queue so the UI can show it"
        );

        assert_eq!(
            files.iter().filter(|file| file.selected).count(),
            3,
            "arranging the queue does not drop anything from the download"
        );
        assert_eq!(
            manager
                .sequential_plan(id, &manager.torrent_handle(id).expect("handle"))
                .expect("plan")
                .allowed,
            vec![third, first, second],
            "the queue comes first, the rest follows in the order the list shows"
        );

        manager
            .set_torrent_download_order(id, Vec::new(), Some(hash.clone()))
            .await
            .expect("order cleared");
        assert!(
            manager.download_order.get(&hash).is_none(),
            "an empty queue is cleared instead of stored"
        );
        assert_eq!(
            manager.sequential_streams.get(&id).map(|entry| entry.0),
            Some(first),
            "clearing it hands the torrent back to the global file order"
        );

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&source_dir);
    }

    async fn wait_for_download_state(manager: &Arc<TorrentManager>, id: usize) {
        for _ in 0..200 {
            let initializing = manager.torrent_handle(id).is_some_and(|handle| {
                matches!(handle.stats().state, TorrentStatsState::Initializing { .. })
            });
            if !initializing {
                return;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn switching_the_mode_off_only_closes_the_window() {
        let dir = std::env::temp_dir().join(format!("iluha-seq-off-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create temp dir");

        #[allow(clippy::cast_sign_loss)]
        let content: Vec<u8> = (0..20 * 1024).map(|i| (i % 251) as u8).collect();
        let (torrent_bytes, source_dir) = create_test_torrent(
            "seq-off",
            &[("one.bin", content.clone()), ("two.bin", content)],
        );

        let manager = Arc::new(
            TorrentManager::new_test(dir.clone())
                .await
                .expect("session starts"),
        );
        let save_dir = dir.join("downloads").to_string_lossy().to_string();
        let id = manager
            .add_torrent_from_bytes(torrent_bytes, save_dir, None, None, false)
            .await
            .expect("torrent adds");
        wait_for_download_state(&manager, id).await;

        manager
            .set_sequential_download(id, true, None)
            .await
            .expect("mode on");
        assert!(manager.sequential_streams.contains_key(&id));

        manager
            .set_sequential_download(id, false, None)
            .await
            .expect("mode off");
        assert!(
            !manager.sequential_streams.contains_key(&id),
            "the priority window is closed when the mode goes off"
        );
        assert!(
            manager
                .get_running_torrent_files(id)
                .expect("file list")
                .iter()
                .all(|file| file.selected),
            "and the selection is still the user's own"
        );

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&source_dir);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn marking_a_file_downloaded_keeps_the_other_selected_files() {
        let dir = std::env::temp_dir().join(format!("iluha-seq-prio-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create temp dir");

        #[allow(clippy::cast_sign_loss)]
        let content: Vec<u8> = (0..20 * 1024).map(|i| (i % 251) as u8).collect();
        let (torrent_bytes, source_dir) = create_test_torrent(
            "seq-prio",
            &[("one.bin", content.clone()), ("two.bin", content)],
        );

        let manager = Arc::new(
            TorrentManager::new_test(dir.clone())
                .await
                .expect("session starts"),
        );
        let save_dir = dir.join("downloads").to_string_lossy().to_string();
        let id = manager
            .add_torrent_from_bytes(torrent_bytes, save_dir, None, None, false)
            .await
            .expect("torrent adds");
        wait_for_download_state(&manager, id).await;

        manager
            .set_file_priority(id, vec![0], FilePriority::Normal, None)
            .await
            .expect("priority accepted");
        assert!(
            manager
                .get_running_torrent_files(id)
                .expect("file list")
                .iter()
                .all(|file| file.selected),
            "allowing a file must not drop the files that were already allowed"
        );

        manager
            .set_file_priority(id, vec![0], FilePriority::DoNotDownload, None)
            .await
            .expect("priority accepted");
        let files = manager.get_running_torrent_files(id).expect("file list");
        assert_eq!(
            files
                .iter()
                .filter(|file| file.selected)
                .map(|file| file.index)
                .collect::<Vec<_>>(),
            vec![1],
            "turning one file off leaves the other ones on"
        );

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&source_dir);
    }

    async fn first_file_to_finish(
        manager: &Arc<TorrentManager>,
        id: usize,
        timeout: Duration,
    ) -> Option<usize> {
        let deadline = Instant::now() + timeout;
        while Instant::now() < deadline {
            let files = manager
                .get_running_torrent_files(id)
                .expect("the torrent keeps its file list while it downloads");
            let finished: Vec<usize> = files
                .iter()
                .filter(|file| file.completed)
                .map(|file| file.index)
                .collect();
            match finished.as_slice() {
                [index] => return Some(*index),
                [] => {}
                _ => return None,
            }
            tokio::time::sleep(Duration::from_millis(2)).await;
        }
        None
    }

    fn swarm_fixture(label: &str) -> (Vec<u8>, PathBuf, String, String) {
        const FILE_BYTES: usize = 4 * 1024 * 1024;
        #[allow(clippy::cast_sign_loss)]
        let content_a: Vec<u8> = (0..FILE_BYTES).map(|i| (i % 251) as u8).collect();
        #[allow(clippy::cast_sign_loss)]
        let content_b: Vec<u8> = (0..FILE_BYTES).map(|i| (i * 7 % 251) as u8).collect();
        let nested = Path::new("Season 02")
            .join("Show - 02.mkv")
            .to_string_lossy()
            .to_string();
        let (bytes, source_dir) = create_test_torrent(
            label,
            &[
                ("Show - 01.mkv", content_a),
                ("Season 02/Show - 02.mkv", content_b),
            ],
        );
        (bytes, source_dir, "Show - 01.mkv".to_string(), nested)
    }

    async fn start_local_seeder(
        dir: &Path,
        torrent_bytes: &[u8],
        source_dir: &Path,
    ) -> (Arc<Session>, std::net::SocketAddr) {
        let seeder = Session::new_with_opts(
            dir.join("seeder"),
            SessionOptions {
                dht: None,
                listen: Some(ListenerOptions {
                    listen_addr: (Ipv4Addr::LOCALHOST, 0).into(),
                    ..Default::default()
                }),
                disable_local_service_discovery: true,
                ..Default::default()
            },
        )
        .await
        .expect("seeder session starts");
        let addr = seeder.listen_addr().expect("seeder listens somewhere");
        seeder
            .add_torrent(
                AddTorrent::from_bytes(torrent_bytes.to_vec()),
                Some(AddTorrentOptions {
                    output_folder: Some(source_dir.to_string_lossy().to_string()),
                    overwrite: true,
                    ..Default::default()
                }),
            )
            .await
            .expect("seeder adds the torrent");
        let holds_the_files = || {
            seeder.with_torrents(|iter| {
                for (_, handle) in iter {
                    if handle.stats().finished {
                        return true;
                    }
                }
                false
            })
        };
        let deadline = Instant::now() + Duration::from_secs(30);
        while Instant::now() < deadline && !holds_the_files() {
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        assert!(
            holds_the_files(),
            "the seeder has to hash the folder it already holds before it can serve anything"
        );
        (seeder, addr)
    }

    async fn download_from_local_seeder(
        manager: &Arc<TorrentManager>,
        torrent_bytes: Vec<u8>,
        dir: &Path,
        seeder_addr: std::net::SocketAddr,
        sequential: bool,
    ) -> usize {
        manager
            .peer_hints
            .lock()
            .expect("peer hints")
            .push(seeder_addr);
        let save_dir = dir.join("downloads").to_string_lossy().to_string();
        let id = manager
            .add_torrent_from_bytes(torrent_bytes, save_dir, None, None, sequential)
            .await
            .expect("torrent adds");
        wait_for_download_state(manager, id).await;
        if sequential {
            manager.advance_sequential_torrents().await;
        }
        id
    }

    fn swarm_file_indices(
        files: &[crate::torrent::types::TorrentFileInfo],
        root: &str,
        nested: &str,
    ) -> (usize, usize) {
        (
            files
                .iter()
                .find(|file| file.name == root)
                .expect("the root file is in the list")
                .index,
            files
                .iter()
                .find(|file| file.name == nested)
                .expect("the nested file is in the list")
                .index,
        )
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn sequential_mode_finishes_the_first_row_before_the_library_order() {
        let dir = std::env::temp_dir().join(format!("iluha-swarm-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create temp dir");

        let (torrent_bytes, source_dir, root, nested) = swarm_fixture("swarm");
        let (_seeder, seeder_addr) = start_local_seeder(&dir, &torrent_bytes, &source_dir).await;
        let manager = Arc::new(
            TorrentManager::new_test(dir.join("leech"))
                .await
                .expect("session starts"),
        );
        let id = download_from_local_seeder(&manager, torrent_bytes, &dir, seeder_addr, true).await;

        let files = manager.get_running_torrent_files(id).expect("file list");
        let (target, other) = swarm_file_indices(&files, &root, &nested);
        assert_eq!(
            manager.sequential_streams.get(&id).map(|holder| holder.0),
            Some(target),
            "the mode has to be pointed at the root file before the download starts"
        );
        assert_eq!(
            first_file_to_finish(&manager, id, Duration::from_secs(90)).await,
            Some(target),
            "sequential mode has to finish the first row of the list; the library's own name \
             order takes the nested file instead (that one is index: {other})"
        );

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&source_dir);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn without_the_mode_the_library_takes_the_nested_file_first() {
        let dir = std::env::temp_dir().join(format!("iluha-swarm-order-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create temp dir");

        let (torrent_bytes, source_dir, root, nested) = swarm_fixture("swarm-order");
        let (_seeder, seeder_addr) = start_local_seeder(&dir, &torrent_bytes, &source_dir).await;
        let manager = Arc::new(
            TorrentManager::new_test(dir.join("leech"))
                .await
                .expect("session starts"),
        );
        let id =
            download_from_local_seeder(&manager, torrent_bytes, &dir, seeder_addr, false).await;

        let files = manager.get_running_torrent_files(id).expect("file list");
        let (target, other) = swarm_file_indices(&files, &root, &nested);
        assert!(
            manager.sequential_streams.get(&id).is_none(),
            "with the mode off nothing is prioritized"
        );
        assert_eq!(
            first_file_to_finish(&manager, id, Duration::from_secs(90)).await,
            Some(other),
            "the library queues files by name, so the nested one lands first - which is what the \
             sequential test is measured against (the root file is index: {target})"
        );

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&source_dir);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_real_swarm_flags_external_edits_and_reverifies_on_resume() {
        let dir = std::env::temp_dir().join(format!("iluha-swarm-paused-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create temp dir");

        let (torrent_bytes, source_dir, _root, _nested) = swarm_fixture("swarm-paused");
        let (_seeder, seeder_addr) = start_local_seeder(&dir, &torrent_bytes, &source_dir).await;
        let manager = Arc::new(
            TorrentManager::new_test(dir.join("leech"))
                .await
                .expect("session starts"),
        );
        let id =
            download_from_local_seeder(&manager, torrent_bytes, &dir, seeder_addr, false).await;

        let deadline = Instant::now() + Duration::from_secs(90);
        let is_finished = |manager: &Arc<TorrentManager>| {
            manager
                .collect_torrents()
                .iter()
                .any(|torrent| torrent.id == id && torrent.finished)
        };
        while Instant::now() < deadline && !is_finished(&manager) {
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
        assert!(
            is_finished(&manager),
            "the leecher has to hold every byte before it is paused"
        );

        manager.pause_torrent(id, None).await.expect("pause");
        let save_dir = dir.join("downloads");
        let files = manager.get_running_torrent_files(id).expect("file list");
        assert_eq!(files.len(), 2);
        for file in &files {
            std::fs::write(
                save_dir.join(&file.name),
                &vec![0u8; file.size as usize / 2],
            )
            .expect("external write");
        }
        let key = manager.torrent_info_hash(id).expect("info hash");
        manager.pause_changes.remove(&key);

        let mut torrents = manager.collect_torrents();
        manager.watch_paused_files(&mut torrents);
        assert!(
            torrents
                .iter()
                .find(|torrent| torrent.id == id)
                .expect("the torrent is listed")
                .paused_external_changes,
            "the badge has to flag the external writer while the torrent is still paused"
        );

        let result = manager.resume_torrent(id, None).await.expect("resume");
        assert!(
            result.rechecked,
            "resuming after the external writer has to re-verify from disk"
        );
        let check = result.check.expect("the pass reports what it saw");
        assert_eq!(check.total, 2);
        assert!(
            !check.size_mismatch.is_empty(),
            "the shortened files have to show up as a size mismatch"
        );

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&source_dir);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_selection_left_narrow_by_the_old_mode_is_repaired() {
        let dir = std::env::temp_dir().join(format!("iluha-seq-repair-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create temp dir");

        #[allow(clippy::cast_sign_loss)]
        let content: Vec<u8> = (0..20 * 1024).map(|i| (i % 251) as u8).collect();
        let (torrent_bytes, source_dir) = create_test_torrent(
            "seq-repair",
            &[("one.bin", content.clone()), ("two.bin", content)],
        );

        let manager = Arc::new(
            TorrentManager::new_test(dir.clone())
                .await
                .expect("session starts"),
        );
        let save_dir = dir.join("downloads").to_string_lossy().to_string();
        let id = manager
            .add_torrent_from_bytes(torrent_bytes, save_dir, None, None, false)
            .await
            .expect("torrent adds");
        wait_for_download_state(&manager, id).await;

        let handle = manager.torrent_handle(id).expect("handle");
        let hash = handle.info_hash().as_string();
        manager
            .file_priorities
            .insert(hash.clone(), vec![FilePriority::Normal; 2]);
        manager.sequential_torrents.insert(hash);
        manager
            .session
            .update_only_files(&handle, &HashSet::from([0]))
            .await
            .expect("narrow the session");
        assert_eq!(handle.only_files().map(|files| files.len()), Some(1));

        manager.advance_sequential_torrents().await;

        assert!(
            manager
                .get_running_torrent_files(id)
                .expect("file list")
                .iter()
                .all(|file| file.selected),
            "the session goes back to what the user actually picked"
        );

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&source_dir);
    }

    fn download_limit(bytes_per_second: u32) -> TorrentLimits {
        TorrentLimits {
            download_bps: Some(bytes_per_second),
            upload_bps: None,
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn per_torrent_limits_are_keyed_by_info_hash() {
        let dir = std::env::temp_dir().join(format!("iluha-limits-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create temp dir");

        #[allow(clippy::cast_sign_loss)]
        let content: Vec<u8> = (0..20 * 1024).map(|i| (i % 251) as u8).collect();
        let (torrent_bytes, source_dir) = create_test_torrent("limits", &[("one.bin", content)]);

        let manager = Arc::new(
            TorrentManager::new_test(dir.clone())
                .await
                .expect("session starts"),
        );
        let save_dir = dir.join("downloads").to_string_lossy().to_string();
        let id = manager
            .add_torrent_from_bytes(torrent_bytes, save_dir, None, None, false)
            .await
            .expect("torrent adds");
        let hash = manager
            .collect_torrents()
            .into_iter()
            .find(|torrent| torrent.id == id)
            .expect("the torrent shows up in the list")
            .info_hash;

        let limits = download_limit(64 * 1024);
        manager
            .set_torrent_limits(id, limits, Some(hash.clone()))
            .await
            .expect("limits apply to a file-backed torrent");

        assert_eq!(manager.get_torrent_limits(id), limits);
        assert_eq!(
            manager
                .torrent_limits
                .get(&hash)
                .map(|entry| *entry.value()),
            Some(limits)
        );
        assert!(
            manager
                .collect_torrents()
                .iter()
                .any(|torrent| torrent.id == id),
            "the rewrite must leave the torrent in the session"
        );
        assert_eq!(
            manager.stored_limits(),
            vec![(id, hash, limits)],
            "this is what a restart re-applies"
        );

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&source_dir);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn limits_under_a_foreign_key_never_apply() {
        let dir = std::env::temp_dir().join(format!("iluha-limits-stale-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create temp dir");

        #[allow(clippy::cast_sign_loss)]
        let content: Vec<u8> = (0..20 * 1024).map(|i| (i * 5 % 251) as u8).collect();
        let (torrent_bytes, source_dir) =
            create_test_torrent("limits-stale", &[("one.bin", content)]);

        let manager = Arc::new(
            TorrentManager::new_test(dir.clone())
                .await
                .expect("session starts"),
        );
        manager
            .torrent_limits
            .insert("deadbeef".to_string(), download_limit(32 * 1024));

        let save_dir = dir.join("downloads").to_string_lossy().to_string();
        let id = manager
            .add_torrent_from_bytes(torrent_bytes, save_dir, None, None, false)
            .await
            .expect("torrent adds");

        assert_eq!(manager.get_torrent_limits(id), TorrentLimits::default());
        assert!(
            manager.stored_limits().is_empty(),
            "another torrent's limit is not this torrent's limit"
        );

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&source_dir);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_tracker_edit_rewrites_from_the_metainfo_and_keeps_the_torrent() {
        let dir = std::env::temp_dir().join(format!("iluha-trackers-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create temp dir");

        #[allow(clippy::cast_sign_loss)]
        let content: Vec<u8> = (0..20 * 1024).map(|i| (i % 251) as u8).collect();
        let (torrent_bytes, source_dir) = create_test_torrent(
            "trackers",
            &[("one.bin", content.clone()), ("two.bin", content)],
        );

        let manager = Arc::new(
            TorrentManager::new_test(dir.clone())
                .await
                .expect("session starts"),
        );
        let save_dir = dir.join("downloads").to_string_lossy().to_string();
        let id = manager
            .add_torrent_from_bytes(torrent_bytes, save_dir, None, None, false)
            .await
            .expect("torrent adds");
        let hash = manager
            .collect_torrents()
            .into_iter()
            .find(|torrent| torrent.id == id)
            .expect("the torrent shows up in the list")
            .info_hash;

        let tracker = "udp://tracker.example.com:1337/announce".to_string();
        let before = manager
            .live_trackers(id)
            .expect("live trackers before the edit");
        let source =
            manager.tracker_source(id, &hash, Some("trackers"), std::slice::from_ref(&tracker));
        assert!(
            matches!(source, TorrentSource::Bytes(_)),
            "a tracker edit must go back in from the metainfo the session already holds, so it \
             needs no peers and cannot lose the torrent"
        );

        let mut expected = before.clone();
        expected.push(tracker.clone());
        expected.sort();
        manager
            .add_torrent_tracker(id, tracker.clone(), hash.clone())
            .await
            .expect("tracker added");

        assert_eq!(
            manager.live_trackers(id).expect("live trackers"),
            expected,
            "the edit lands: the new tracker is announced, and nothing else is added or lost"
        );
        let files = manager
            .get_running_torrent_files(id)
            .expect("the rewritten torrent still exposes its files");
        assert_eq!(files.len(), 2);
        assert!(
            manager
                .collect_torrents()
                .iter()
                .any(|torrent| torrent.id == id && torrent.info_hash == hash),
            "the rewrite must leave the same torrent in the session"
        );

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&source_dir);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn the_file_list_survives_a_rewrite_window() {
        let dir = std::env::temp_dir().join(format!("iluha-window-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create temp dir");

        #[allow(clippy::cast_sign_loss)]
        let content: Vec<u8> = (0..20 * 1024).map(|i| (i % 251) as u8).collect();
        let (torrent_bytes, source_dir) = create_test_torrent(
            "window",
            &[("one.bin", content.clone()), ("two.bin", content)],
        );

        let manager = Arc::new(
            TorrentManager::new_test(dir.clone())
                .await
                .expect("session starts"),
        );
        let save_dir = dir.join("downloads").to_string_lossy().to_string();
        let id = manager
            .add_torrent_from_bytes(torrent_bytes, save_dir, None, None, false)
            .await
            .expect("torrent adds");
        manager
            .get_running_torrent_files(id)
            .expect("the list is read and cached");

        let window = manager.rewrite_guard();
        manager
            .session
            .delete(id.into(), false)
            .await
            .expect("delete");
        assert!(
            manager
                .get_running_torrent_files(id)
                .is_ok_and(|files| files.len() == 2),
            "while a rewrite is open the UI is served the list it had, not a gap"
        );

        drop(window);
        assert!(
            manager.get_running_torrent_files(id).is_err(),
            "outside a rewrite a missing torrent is reported as missing"
        );
        assert!(
            !manager.files_cache.contains_key(&id),
            "and its cached list goes with it, so a reused id cannot inherit it"
        );

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&source_dir);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_rewrite_serves_the_old_row_until_the_new_torrent_is_back() {
        let dir = std::env::temp_dir().join(format!("iluha-ghost-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create temp dir");

        #[allow(clippy::cast_sign_loss)]
        let content: Vec<u8> = (0..20 * 1024).map(|i| (i % 251) as u8).collect();
        let (torrent_bytes, source_dir) = create_test_torrent(
            "ghost",
            &[("one.bin", content.clone()), ("two.bin", content)],
        );

        let manager = Arc::new(
            TorrentManager::new_test(dir.clone())
                .await
                .expect("session starts"),
        );
        let save_dir = dir.join("downloads").to_string_lossy().to_string();
        let id = manager
            .add_torrent_from_bytes(torrent_bytes.clone(), save_dir.clone(), None, None, false)
            .await
            .expect("torrent adds");
        let name = manager
            .collect_torrents()
            .into_iter()
            .find(|torrent| torrent.id == id)
            .expect("the row is there")
            .name;

        let window = manager.rewrite_guard();
        let key = manager.torrent_info_hash(id).expect("info hash");
        manager.capture_rewrite_ghost(id, &key);
        manager
            .session
            .delete(id.into(), false)
            .await
            .expect("delete");

        let during_gap = manager.collect_torrents();
        assert_eq!(
            during_gap
                .iter()
                .filter(|torrent| torrent.info_hash == key)
                .count(),
            1,
            "one torrent is always exactly one row"
        );
        let ghost = during_gap
            .iter()
            .find(|torrent| torrent.info_hash == key)
            .expect("the row does not blink out");
        assert_eq!(ghost.id, id);
        assert_eq!(ghost.name, name, "the stand-in keeps the data the user had");

        let new_id = manager
            .add_torrent_from_bytes(torrent_bytes, save_dir, None, None, false)
            .await
            .expect("re-add");
        let swapped = manager.collect_torrents();
        assert_eq!(
            swapped
                .iter()
                .filter(|torrent| torrent.info_hash == key)
                .count(),
            1,
            "the old and the new row are never on screen together"
        );
        assert_eq!(
            swapped
                .iter()
                .find(|torrent| torrent.info_hash == key)
                .expect("row")
                .id,
            id,
            "the stand-in hides the rewritten torrent until it is cleared"
        );

        manager.clear_rewrite_ghost(&key);
        let after = manager.collect_torrents();
        assert_eq!(
            after
                .iter()
                .find(|torrent| torrent.info_hash == key)
                .expect("row")
                .id,
            new_id,
            "clearing the stand-in reveals the rewritten torrent"
        );
        drop(window);

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&source_dir);
    }

    fn stamp(name: &str, expected_len: u64, on_disk: Option<(u64, i64)>) -> FileStamp {
        FileStamp {
            name: name.to_string(),
            expected_len,
            on_disk_len: on_disk.map(|(len, _)| len),
            mtime_secs: on_disk.map(|(_, mtime)| mtime),
        }
    }

    #[test]
    fn changed_file_names_name_exactly_the_moved_files() {
        let base = vec![
            stamp("one.bin", 10, Some((10, 1000))),
            stamp("two.bin", 20, None),
        ];
        assert!(
            TorrentManager::changed_file_names(&base, &base.clone()).is_empty(),
            "an untouched pause names nothing"
        );

        let mut appeared = base.clone();
        appeared[1] = stamp("two.bin", 20, Some((20, 2000)));
        assert_eq!(
            TorrentManager::changed_file_names(&base, &appeared),
            vec!["two.bin"],
            "a file that showed up is named, and only it"
        );

        let mut touched = base.clone();
        touched[0] = stamp("one.bin", 10, Some((10, 1500)));
        assert_eq!(
            TorrentManager::changed_file_names(&base, &touched),
            vec!["one.bin"],
            "a rewrite that keeps the size is still named"
        );

        let mut both = base.clone();
        both[0] = stamp("one.bin", 10, Some((10, 1500)));
        both[1] = stamp("two.bin", 20, Some((20, 2000)));
        assert_eq!(
            TorrentManager::changed_file_names(&base, &both).len(),
            2,
            "both moved files are named"
        );

        assert!(
            TorrentManager::changed_file_names(&base, &base[..1]).is_empty(),
            "a different number of files can only mean a different metainfo, and no file is named"
        );
    }

    #[test]
    fn check_from_stamps_sorts_files_into_missing_size_and_ok() {
        let stamps = vec![
            stamp("ok.bin", 5, Some((5, 1))),
            stamp("gone.bin", 5, None),
            stamp("short.bin", 5, Some((3, 1))),
        ];
        let check = TorrentManager::check_from_stamps(7, &stamps);
        assert_eq!(check.id, 7);
        assert_eq!(check.ok, 1, "only the file that matches its size is ok");
        assert_eq!(check.total, 3);
        assert_eq!(check.missing, vec!["gone.bin".to_string()]);
        assert_eq!(check.size_mismatch, vec!["short.bin".to_string()]);
    }

    async fn paused_fixture(
        dir: &Path,
        label: &str,
        content: &[u8],
    ) -> (Arc<TorrentManager>, PathBuf, PathBuf, usize) {
        let (torrent_bytes, source_dir) = create_test_torrent(
            label,
            &[("one.bin", content.to_vec()), ("two.bin", content.to_vec())],
        );
        let manager = Arc::new(
            TorrentManager::new_test(dir.to_path_buf())
                .await
                .expect("session starts"),
        );
        let save_dir = dir.join("downloads");
        std::fs::create_dir_all(&save_dir).expect("create save dir");
        let id = manager
            .add_torrent_from_bytes(
                torrent_bytes,
                save_dir.to_string_lossy().to_string(),
                None,
                None,
                false,
            )
            .await
            .expect("torrent adds");
        wait_for_download_state(&manager, id).await;
        manager.pause_torrent(id, None).await.expect("pause");
        (manager, save_dir, source_dir, id)
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn resume_without_external_changes_unpauses_without_a_recheck() {
        let dir = std::env::temp_dir().join(format!("iluha-resume-clean-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let content: Vec<u8> = (0..20 * 1024).map(|i| (i % 251) as u8).collect();
        let (manager, _save_dir, source_dir, id) =
            paused_fixture(&dir, "resume-clean", &content).await;

        let result = manager.resume_torrent(id, None).await.expect("resume");
        assert!(
            !result.rechecked,
            "nothing touched the files, so the resume is a plain unpause"
        );
        assert!(result.check.is_none());

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&source_dir);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn the_paused_watcher_raises_the_badge_before_resume() {
        let dir = std::env::temp_dir().join(format!("iluha-paused-watch-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let content: Vec<u8> = (0..20 * 1024).map(|i| (i % 251) as u8).collect();
        let (manager, save_dir, source_dir, id) =
            paused_fixture(&dir, "paused-watch", &content).await;

        let mut torrents = manager.collect_torrents();
        manager.watch_paused_files(&mut torrents);
        let watched = torrents
            .iter()
            .find(|t| t.id == id)
            .expect("the torrent is listed");
        assert!(
            !watched.paused_external_changes,
            "a freshly paused torrent is clean"
        );

        let files = manager.get_running_torrent_files(id).expect("file list");
        for file in &files {
            std::fs::write(save_dir.join(&file.name), &content[..content.len() - 1024])
                .expect("external write");
        }
        let key = manager.torrent_info_hash(id).expect("info hash");
        manager.pause_changes.remove(&key);

        let mut torrents = manager.collect_torrents();
        manager.watch_paused_files(&mut torrents);
        let watched = torrents
            .iter()
            .find(|t| t.id == id)
            .expect("the torrent is listed");
        assert!(
            watched.paused_external_changes,
            "an outside edit has to raise the badge while the torrent is still paused"
        );
        assert_eq!(
            watched.paused_changed_files,
            files.iter().map(|f| f.name.clone()).collect::<Vec<_>>(),
            "the badge names exactly the files that moved"
        );

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&source_dir);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn recheck_from_the_badge_reverifies_and_stays_paused() {
        let dir = std::env::temp_dir().join(format!("iluha-recheck-paused-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let content: Vec<u8> = (0..20 * 1024).map(|i| (i % 251) as u8).collect();
        let (manager, save_dir, source_dir, id) =
            paused_fixture(&dir, "recheck-paused", &content).await;

        let files = manager.get_running_torrent_files(id).expect("file list");
        for file in &files {
            std::fs::write(save_dir.join(&file.name), &content[..content.len() - 1024])
                .expect("external write");
        }

        let result = manager
            .recheck_paused_torrent(id, None)
            .await
            .expect("recheck");
        assert!(
            result.rechecked,
            "the badge action has to re-verify from disk"
        );
        let check = result.check.expect("the pass reports what it saw");
        assert_eq!(check.size_mismatch.len(), 2);
        assert!(
            manager.torrent_is_paused(result.id),
            "rechecking from the badge must leave the torrent paused"
        );

        let mut torrents = manager.collect_torrents();
        manager.watch_paused_files(&mut torrents);
        assert!(
            !torrents
                .iter()
                .find(|t| t.id == result.id)
                .expect("the torrent is listed")
                .paused_external_changes
        );

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&source_dir);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn resume_after_external_writes_reverifies_from_disk() {
        let dir =
            std::env::temp_dir().join(format!("iluha-resume-external-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let content: Vec<u8> = (0..20 * 1024).map(|i| (i % 251) as u8).collect();
        let (manager, save_dir, source_dir, id) =
            paused_fixture(&dir, "resume-external", &content).await;

        let files = manager.get_running_torrent_files(id).expect("file list");
        assert_eq!(files.len(), 2);
        for (position, file) in files.iter().enumerate() {
            let shortened = &content[..content.len() - (position + 1) * 1024];
            std::fs::write(save_dir.join(&file.name), shortened).expect("external write");
        }

        let result = manager.resume_torrent(id, None).await.expect("resume");
        assert!(
            result.rechecked,
            "files that changed while paused must trigger a re-verify, not a blind unpause"
        );
        let check = result.check.expect("a recheck reports what it saw on disk");
        assert_eq!(check.total, 2);
        assert_eq!(
            check.ok, 0,
            "neither file matches its expected size anymore"
        );
        assert!(check.missing.is_empty());
        assert_eq!(check.size_mismatch.len(), 2);

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&source_dir);
    }
}
