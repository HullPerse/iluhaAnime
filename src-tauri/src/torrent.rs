#![allow(
    clippy::struct_excessive_bools,
    clippy::cast_precision_loss,
    clippy::unused_async,
    clippy::map_unwrap_or
)]

use std::collections::{HashMap, HashSet};
use std::num::NonZeroU32;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;

use anyhow::{Context, Result};
use dashmap::{DashMap, DashSet};
use librqbit::http_api_types::PeerStatsFilter;
use librqbit::limits::LimitsConfig;
use librqbit::{
    create_torrent, torrent_from_bytes, AddTorrent, AddTorrentOptions, AddTorrentResponse,
    ByteBufOwned, CloneToOwned, ConnectionOptions, CreateTorrentOptions, ListenerOptions, Magnet,
    PeerConnectionOptions, Session, SessionOptions, SessionPersistenceConfig,
};
use librqbit_bencode::bencode_serialize_to_writer;
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::net::{Ipv4Addr, Ipv6Addr};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FilePriority {
    DoNotDownload,
    Normal,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct TorrentLimits {
    #[serde(rename = "downloadBps")]
    pub download_bps: Option<u32>,
    #[serde(rename = "uploadBps")]
    pub upload_bps: Option<u32>,
}

#[derive(Serialize, Clone, Debug)]
pub struct TorrentCheckResult {
    pub id: usize,
    pub missing: Vec<String>,
    pub size_mismatch: Vec<String>,
    pub ok: usize,
    pub total: usize,
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
    pub share_ratio: f64,
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

#[derive(Serialize, Deserialize, Default)]
struct TorrentPreferences {
    sequential_torrents: HashSet<usize>,
    file_priorities: HashMap<usize, Vec<FilePriority>>,
}

pub struct TorrentManager {
    pub session: Arc<Session>,
    pub save_dirs: DashMap<usize, String>,
    pub save_dirs_path: PathBuf,
    pub magnet_links: DashMap<usize, String>,
    pub magnet_links_path: PathBuf,
    pub torrent_limits: DashMap<usize, TorrentLimits>,
    pub torrent_limits_path: PathBuf,
    pub sequential_torrents: DashSet<usize>,
    pub file_priorities: DashMap<usize, Vec<FilePriority>>,
    pub pending_selections: DashMap<usize, Vec<usize>>,
    pub session_config: tokio::sync::Mutex<SessionConfig>,
    pub session_dir: PathBuf,
    pub session_config_path: PathBuf,
    pub preferences_path: PathBuf,
    pub limit_locks: DashMap<usize, Arc<tokio::sync::Mutex<()>>>,
    pub peer_counts: DashMap<usize, (Instant, usize)>,
    pub metadata_slots: Arc<tokio::sync::Semaphore>,
}

fn share_ratio(uploaded_bytes: u64, downloaded_bytes: u64) -> f64 {
    if downloaded_bytes == 0 {
        0.0
    } else {
        uploaded_bytes as f64 / downloaded_bytes as f64
    }
}

fn to_rqbit_limits(limits: TorrentLimits) -> LimitsConfig {
    LimitsConfig {
        download_bps: limits.download_bps.and_then(NonZeroU32::new),
        upload_bps: limits.upload_bps.and_then(NonZeroU32::new),
    }
}

fn is_safe_relative_path(name: &str) -> bool {
    let path = Path::new(name);
    !name.is_empty()
        && !path.is_absolute()
        && path
            .components()
            .all(|component| matches!(component, std::path::Component::Normal(_)))
}

const MIN_TORRENT_FREE_SPACE_BYTES: u64 = 128 * 1024 * 1024;

fn existing_parent(path: &Path) -> Option<&Path> {
    let mut current = path;
    while !current.exists() {
        current = current.parent()?;
    }
    Some(current)
}

#[cfg(windows)]
fn available_disk_space(path: &Path) -> Result<u64> {
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "kernel32")]
    extern "system" {
        fn GetDiskFreeSpaceExW(
            directory_name: *const u16,
            free_bytes_available: *mut u64,
            total_number_of_bytes: *mut u64,
            total_number_of_free_bytes: *mut u64,
        ) -> i32;
    }

    let directory = existing_parent(path).context("download directory is unavailable")?;
    let wide: Vec<u16> = directory
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let mut free = 0u64;
    let mut total = 0u64;
    let mut total_free = 0u64;
    let success =
        unsafe { GetDiskFreeSpaceExW(wide.as_ptr(), &raw mut free, &raw mut total, &raw mut total_free) };
    if success == 0 {
        anyhow::bail!("could not determine free disk space");
    }
    Ok(free)
}

#[cfg(not(windows))]
fn available_disk_space(_path: &Path) -> Result<u64> {
    Ok(u64::MAX)
}

fn ensure_minimum_free_space(path: &Path) -> Result<()> {
    let free = available_disk_space(path)?;
    if free < MIN_TORRENT_FREE_SPACE_BYTES {
        anyhow::bail!(
            "not enough free disk space: {free} bytes available, at least {MIN_TORRENT_FREE_SPACE_BYTES} required"
        );
    }
    Ok(())
}

const FALLBACK_TRACKERS: &[&str] = &[
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.demonii.com:1337/announce",
    "udp://tracker.openbittorrent.com:6969/announce",
    "udp://exodus.desync.com:6969/announce",
    "udp://explodie.org:6969/announce",
    "https://tracker.tamersunion.org:443/announce",
];

fn url_encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len() * 2);
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~') {
            out.push(byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

fn with_fallback_trackers(magnet: &str) -> String {
    let mut result = magnet.to_string();
    for tracker in FALLBACK_TRACKERS {
        result.push(if result.contains('?') { '&' } else { '?' });
        result.push_str("tr=");
        result.push_str(&url_encode(tracker));
    }
    result
}

fn with_fallback_trackers_bytes(bytes: &[u8]) -> Vec<u8> {
    let Ok(torrent) = torrent_from_bytes(bytes) else {
        return bytes.to_vec();
    };
    if torrent.info.data.private {
        return bytes.to_vec();
    }
    let mut owned = torrent.clone_to_owned(None);

    // Collect every announce the torrent already carries. librqbit's
    // iter_announce prefers "announce-list" over "announce", so the original
    // announce must be folded in, otherwise injecting a list would shadow it.
    let mut trackers: Vec<Vec<u8>> = if owned.announce_list.is_empty() {
        owned
            .announce
            .iter()
            .map(|announce| announce.as_ref().to_vec())
            .collect()
    } else {
        owned
            .announce_list
            .iter()
            .flatten()
            .map(|tracker| tracker.as_ref().to_vec())
            .collect()
    };
    let original_len = trackers.len();
    let mut seen: HashSet<Vec<u8>> = trackers.iter().cloned().collect();
    for tracker in FALLBACK_TRACKERS {
        let tracker = tracker.as_bytes().to_vec();
        if seen.insert(tracker.clone()) {
            trackers.push(tracker);
        }
    }
    if trackers.len() == original_len {
        return bytes.to_vec();
    }
    owned.announce_list = trackers
        .into_iter()
        .map(|tracker| vec![ByteBufOwned::from(tracker)])
        .collect();
    let mut out = Vec::new();
    if bencode_serialize_to_writer(owned, &mut out).is_err() {
        return bytes.to_vec();
    }
    out
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

        let torrent_limits_path = app_data_dir.join("torrent_limits.json");
        let torrent_limits: HashMap<usize, TorrentLimits> =
            std::fs::read_to_string(&torrent_limits_path)
                .ok()
                .and_then(|json| serde_json::from_str(&json).ok())
                .unwrap_or_default();

        let session_config_path = app_data_dir.join("session_config.json");
        let session_config = std::fs::read_to_string(&session_config_path)
            .ok()
            .and_then(|json| serde_json::from_str::<SessionConfig>(&json).ok())
            .unwrap_or_default();

        let preferences_path = app_data_dir.join("torrent_preferences.json");
        let preferences = std::fs::read_to_string(&preferences_path)
            .ok()
            .and_then(|json| serde_json::from_str::<TorrentPreferences>(&json).ok())
            .unwrap_or_default();

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
            torrent_limits: torrent_limits.into_iter().collect(),
            torrent_limits_path,
            sequential_torrents: preferences.sequential_torrents.into_iter().collect(),
            file_priorities: preferences.file_priorities.into_iter().collect(),
            pending_selections: DashMap::new(),
            session_config: tokio::sync::Mutex::new(session_config),
            session_dir,
            session_config_path,
            preferences_path,
            limit_locks: DashMap::new(),
            peer_counts: DashMap::new(),
            metadata_slots: Arc::new(tokio::sync::Semaphore::new(3)),
        };
        manager.cleanup_unselected_files();
        Ok(manager)
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

    fn save_torrent_limits(&self) {
        let map: HashMap<usize, TorrentLimits> = self
            .torrent_limits
            .iter()
            .map(|r| (*r.key(), *r.value()))
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
                .map(|entry| *entry.key())
                .collect(),
            file_priorities: self
                .file_priorities
                .iter()
                .map(|entry| (*entry.key(), entry.value().clone()))
                .collect(),
        };
        if let Ok(json) = serde_json::to_string(&preferences) {
            let _ = std::fs::write(&self.preferences_path, json);
        }
    }

    pub fn get_torrent_limits(&self, id: usize) -> TorrentLimits {
        self.torrent_limits
            .get(&id)
            .map(|r| *r.value())
            .unwrap_or_default()
    }

    pub async fn set_torrent_limits(
        self: &Arc<Self>,
        id: usize,
        limits: TorrentLimits,
    ) -> Result<(), String> {
        let lock = self
            .limit_locks
            .entry(id)
            .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
            .clone();
        let _guard = lock.lock().await;
        let previous_limits = self.get_torrent_limits(id);
        let magnet = self
            .magnet_links
            .get(&id)
            .map(|entry| entry.clone())
            .ok_or_else(|| "Per-torrent limits require a magnet-backed torrent".to_string())?;
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
        let was_paused = self
            .session
            .with_torrents(|iter| {
                for (torrent_id, handle) in iter {
                    if torrent_id == id {
                        return Some(handle.is_paused());
                    }
                }
                None
            })
            .unwrap_or(false);

        if limits == TorrentLimits::default() {
            self.torrent_limits.remove(&id);
        } else {
            self.torrent_limits.insert(id, limits);
        }
        self.save_torrent_limits();

        if let Err(error) = self.session.delete(id.into(), false).await {
            if previous_limits == TorrentLimits::default() {
                self.torrent_limits.remove(&id);
            } else {
                self.torrent_limits.insert(id, previous_limits);
            }
            self.save_torrent_limits();
            return Err(format!("unable to reconfigure torrent: {error:#}"));
        }
        self.save_save_dirs();
        self.save_magnet_links();

        let result = self
            .add_torrent_inner(
                AddTorrent::from_url(magnet.clone()),
                save_dir.clone(),
                selected_files.clone(),
                None,
                Some(id),
                Some(magnet.clone()),
                to_rqbit_limits(limits),
            )
            .await
            .map_err(|error| format!("unable to reconfigure torrent: {error:#}"));

        if result.is_err() {
            if previous_limits == TorrentLimits::default() {
                self.torrent_limits.remove(&id);
            } else {
                self.torrent_limits.insert(id, previous_limits);
            }
            self.save_torrent_limits();
            let _ = self
                .add_torrent_inner(
                    AddTorrent::from_url(magnet),
                    save_dir,
                    selected_files,
                    None,
                    Some(id),
                    None,
                    to_rqbit_limits(previous_limits),
                )
                .await;
        }

        if result.is_ok() && was_paused {
            self.pause_torrent(id)
                .await
                .map_err(|error| format!("torrent restored but could not pause it: {error:#}"))?;
        }
        if result.is_ok() {
            if self.sequential_torrents.contains(&id) {
                self.advance_sequential(id).await?;
            }
            self.save_preferences();
        }
        result.map(|_| ())
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
                let sequential_download = self.sequential_torrents.contains(&id);

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
                    name: handle.name().unwrap_or_default(),
                    info_hash: handle.info_hash().as_string(),
                    total_bytes: stats.total_bytes,
                    progress_bytes: stats.progress_bytes,
                    uploaded_bytes: stats.uploaded_bytes,
                    share_ratio: share_ratio(stats.uploaded_bytes, downloaded_bytes),
                    download_speed: speed_bytes,
                    upload_speed: up_mbps * 125_000.0,
                    peers_connected,
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
    ) -> Result<usize> {
        self.add_torrent_inner(
            AddTorrent::from_url(magnet.clone()),
            save_dir,
            only_files,
            sub_folder,
            None,
            Some(magnet),
            LimitsConfig::default(),
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
        let add_torrent = AddTorrent::from_bytes(with_fallback_trackers_bytes(&bytes));
        self.add_torrent_inner(
            add_torrent,
            save_dir,
            only_files,
            sub_folder,
            None,
            None,
            LimitsConfig::default(),
        )
        .await
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
    ) -> Result<usize> {
        ensure_minimum_free_space(Path::new(&save_dir))?;

        if let AddTorrent::Url(url) = &add_torrent {
            if url.starts_with("magnet:") {
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

        if let Some(ref files) = only_files {
            let set: HashSet<usize> = files.iter().copied().collect();
            if let Some(handle) = self.session.with_torrents(|iter| {
                for (tid, h) in iter {
                    if tid == id {
                        return Some(h.clone());
                    }
                }
                None
            }) {
                let _ = self.session.update_only_files(&handle, &set).await;
            }
        }

        self.cleanup_unselected_files();
        if let Some(ref files) = only_files {
            self.pending_selections.insert(id, files.clone());
        }
        Ok(id)
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

    pub async fn replace_torrent(
        self: &Arc<Self>,
        id: usize,
        magnet: String,
        only_files: Option<Vec<usize>>,
    ) -> Result<usize, String> {
        let save_dir = self
            .save_dirs
            .get(&id)
            .map(|r| r.clone())
            .unwrap_or_default();
        self.remove_torrent(id, false)
            .await
            .map_err(|e| format!("{e:#}"))?;
        let limits = to_rqbit_limits(self.get_torrent_limits(id));
        self.add_torrent_inner(
            AddTorrent::from_url(magnet.clone()),
            save_dir,
            only_files,
            None,
            Some(id),
            Some(magnet),
            limits,
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

        let magnet = self
            .magnet_links
            .get(&id)
            .map(|r| r.clone())
            .unwrap_or_else(|| format!("magnet:?xt=urn:btih:{info_hash}"));
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

    /// Magnet-backed torrents have to fetch metadata from peers before the
    /// file list can be shown. librqbit waits indefinitely for that, so bound
    /// it here: otherwise the file-picker modal spins forever when the swarm
    /// or the announce tracker is unreachable.
    const METADATA_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

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
        // Fast path: the magnet is already in the session, so its file list
        // is known without waiting on the network. Re-opening the picker for
        // a torrent that is already downloading must be instant.
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

    pub async fn pause_torrent(self: &Arc<Self>, id: usize) -> Result<()> {
        if let Some(handle) = self.session.with_torrents(|iter| {
            for (tid, handle) in iter {
                if tid == id {
                    return Some(handle.clone());
                }
            }
            None
        }) {
            self.session.pause(&handle).await?;
        }
        Ok(())
    }

    pub async fn resume_torrent(self: &Arc<Self>, id: usize) -> Result<()> {
        if let Some(handle) = self.session.with_torrents(|iter| {
            for (tid, handle) in iter {
                if tid == id {
                    return Some(handle.clone());
                }
            }
            None
        }) {
            self.session.unpause(&handle).await?;
        }
        Ok(())
    }

    pub async fn remove_torrent(self: &Arc<Self>, id: usize, delete_files: bool) -> Result<()> {
        self.session.delete(id.into(), delete_files).await?;
        self.save_dirs.remove(&id);
        self.magnet_links.remove(&id);
        self.torrent_limits.remove(&id);
        self.sequential_torrents.remove(&id);
        self.file_priorities.remove(&id);
        self.pending_selections.remove(&id);
        self.limit_locks.remove(&id);
        self.peer_counts.remove(&id);
        self.save_save_dirs();
        self.save_magnet_links();
        self.save_torrent_limits();
        self.save_preferences();
        Ok(())
    }

    pub fn start_http_api(self: &Arc<Self>) {
        use librqbit::api::Api;
        use librqbit::http_api::{HttpApi, HttpApiOptions};

        let api = Api::new(self.session.clone(), None, None);

        let token_seed = {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
                .to_le_bytes();
            let pid = std::process::id().to_le_bytes();
            let mut seed = Vec::with_capacity(16);
            seed.extend_from_slice(&now);
            seed.extend_from_slice(&pid);
            seed
        };
        let token = hex::encode(Sha1::digest(&token_seed));

        let http_opts = HttpApiOptions {
            read_only: false,
            basic_auth: Some(("iluha".into(), token)),
            allow_create: true,
            max_upload_body_size: None,
        };
        let http_api = HttpApi::new(api, Some(http_opts));
        let addr: std::net::SocketAddr = ([127, 0, 0, 1], 0).into();
        let listener = match librqbit_dualstack_sockets::TcpListener::bind_tcp(
            addr,
            librqbit_dualstack_sockets::BindOpts::default(),
        ) {
            Ok(l) => l,
            Err(e) => {
                eprintln!("error binding HTTP API server: {e}");
                return;
            }
        };
        let bound_port = listener.bind_addr().port();
        eprintln!("HTTP API listening on http://127.0.0.1:{bound_port} (user: iluha)");
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
        let add = AddTorrent::from_local_filename(
            torrent_path
                .to_str()
                .context("torrent path not valid utf-8")?,
        )
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
                self.save_dirs
                    .insert(id, parent.to_string_lossy().to_string());
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
                            } else if let Some(selected) = self.pending_selections.remove(&id) {
                                let mut p = vec![FilePriority::DoNotDownload; file_count];
                                for &idx in &selected.1 {
                                    if idx < file_count {
                                        p[idx] = FilePriority::Normal;
                                    }
                                }
                                self.file_priorities.insert(id, p);
                            } else if let Some(mut priorities) = self.file_priorities.get_mut(&id) {
                                priorities.resize(file_count, FilePriority::Normal);
                            }

                            let prio_list = self
                                .file_priorities
                                .get(&id)
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
                        if !is_safe_relative_path(&file.relative_filename.to_string_lossy()) {
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
                    entry[idx] = priority;
                }
            }
        }
        self.save_preferences();

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
            self.save_preferences();

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
            self.save_preferences();

            if let Some(handle) = handle_opt {
                let files_to_restore = self.file_priorities.get(&id).map(|r| {
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

        let candidates: Vec<usize> = self.file_priorities.get(&id).map_or_else(
            || (0..file_count).collect(),
            |prio| {
                prio.iter()
                    .enumerate()
                    .filter(|(_, &p)| p != FilePriority::DoNotDownload)
                    .map(|(i, _)| i)
                    .collect()
            },
        );

        let first_incomplete = candidates.into_iter().find(|&i| {
            let progress = stats.file_progress.get(i).copied().unwrap_or(0);
            let total = handle
                .with_metadata(|m| m.file_infos.get(i).map(|f| f.len))
                .unwrap_or(None)
                .unwrap_or(0);
            progress < total
        });

        if let Some(target) = first_incomplete {
            let only: HashSet<usize> = std::iter::once(target).collect();
            self.session
                .update_only_files(&handle, &only)
                .await
                .map_err(|e| format!("{e:#}"))?;
        } else {
            self.sequential_torrents.remove(&id);
            self.save_preferences();
        }

        Ok(())
    }

    pub fn recheck_torrent(&self, id: usize) -> Result<TorrentCheckResult, String> {
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
        result.ok_or_else(|| "torrent not found or no metadata".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
        let preferences = TorrentPreferences {
            sequential_torrents: HashSet::from([7]),
            file_priorities: HashMap::from([(
                7,
                vec![FilePriority::Normal, FilePriority::DoNotDownload],
            )]),
        };
        let json = serde_json::to_string(&preferences).expect("preferences serialize");
        let restored: TorrentPreferences =
            serde_json::from_str(&json).expect("preferences deserialize");
        assert!(restored.sequential_torrents.contains(&7));
        assert_eq!(
            restored.file_priorities.get(&7),
            Some(&vec![FilePriority::Normal, FilePriority::DoNotDownload])
        );
    }

    #[test]
    fn with_fallback_trackers_encodes_and_appends() {
        let magnet = "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567";
        let augmented = with_fallback_trackers(magnet);
        assert!(augmented.starts_with(magnet));
        assert!(augmented.contains("tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce"));
        // A magnet that already has a tracker keeps it and gets the extras.
        let with_tr = format!("{magnet}&tr=http%3A%2F%2Fbt.example%2Fann");
        let augmented_tr = with_fallback_trackers(&with_tr);
        assert!(augmented_tr.contains("tr=http%3A%2F%2Fbt.example%2Fann"));
        assert!(augmented_tr.contains("tracker.opentrackr.org"));
        // The infohash is untouched, so cached metadata still matches.
        assert!(augmented_tr.contains(magnet));
    }

    /// A tiny single-file torrent with a known infohash, built by hand so the
    /// test does not depend on network access.
    fn minimal_torrent_bytes() -> Vec<u8> {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"d4:infod6:lengthi5e4:name4:file");
        bytes.extend_from_slice(b"12:piece lengthi32768e6:pieces20:");
        bytes.extend_from_slice(&[0u8; 20]);
        bytes.extend_from_slice(b"e8:announce13:udp://trackere");
        bytes
    }

    /// Fallback trackers must be injected into .torrent bytes the same way
    /// magnets get them, while the original announce stays reachable and the
    /// infohash (derived from the "info" dict) is preserved.
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

    /// Private torrents must keep their announce-only tracker, and unparseable
    /// bytes must pass through untouched.
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

    /// Once a magnet's infohash is already managed by the session, re-opening
    /// the picker must return its file list from memory instead of waiting on
    /// the network again.
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
            .add_torrent_from_bytes(bytes.clone(), save_dir.clone(), None, None)
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

    /// A magnet whose infohash exists nowhere must not hang the metadata
    /// fetch forever: the caller-bound timeout has to fire and surface an
    /// error instead of blocking the file-picker modal indefinitely.
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

        // Random 40-hex infohash: no tracker, no DHT entry, no peers.
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

    /// Starting a download for a magnet whose metadata cannot resolve must
    /// time out instead of leaving the Download action spinning forever.
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

    /// Build a real multi-file torrent on disk so the session has genuine
    /// metadata to initialize against.
    fn create_test_torrent(files: &[(&str, Vec<u8>)]) -> (Vec<u8>, PathBuf) {
        let dir = std::env::temp_dir().join(format!(
            "iluha-torrent-src-{}-{}",
            std::process::id(),
            files.len()
        ));
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

    /// A torrent file added through the picker must initialize to the live
    /// state and expose its file list, otherwise it shows as "initializing"
    /// and never downloads anything.
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
        let (torrent_bytes, source_dir) =
            create_test_torrent(&[("one.bin", content_a), ("nested/two.bin", content_b)]);

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
            .add_torrent_from_bytes(torrent_bytes.clone(), save_dir.clone(), None, None)
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
            .add_torrent_from_bytes(torrent_bytes, save_dir, Some(vec![one_index]), None)
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
}
