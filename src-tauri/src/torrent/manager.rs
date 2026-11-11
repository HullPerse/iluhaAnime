#![allow(
    clippy::struct_excessive_bools,
    clippy::cast_precision_loss,
    clippy::unused_async,
    clippy::map_unwrap_or
)]

use std::cmp::Reverse;
use std::collections::{HashMap, HashSet};
use std::num::NonZeroU32;
use std::path::{Component, Path, PathBuf};
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
    CreateTorrentOptions, ListenerMode, ListenerOptions, Magnet, PeerConnectionOptions, Session,
    SessionOptions, SessionPersistenceConfig, TorrentStatsState,
};
use serde::{Deserialize, Serialize};
use std::net::{Ipv4Addr, Ipv6Addr};

use super::disk;
use super::geoip::country_code_for_addr;
use super::helpers::{
    build_magnet, canonical_or_raw_tracker, ensure_minimum_free_space, file_at_offset,
    final_file_path, ignored_payload_paths, is_info_hash, is_safe_relative_path,
    is_valid_folder_name, part_file_path, plan_sequential, redact_proxy_url, resolve_payload_path,
    share_ratio, to_rqbit_limits, torrent_proxy_url, validate_session_config, validate_tracker_url,
    with_fallback_trackers, with_fallback_trackers_bytes, with_trackers_bytes, PayloadFile,
    SequentialPlan, FALLBACK_TRACKERS,
};
mod lifecycle;
mod selection;
mod limits;
mod trackers;

use super::registry::TorrentRegistry;
use super::types::{
    CreatedTorrent, DhtStatus, FileOrder, FilePriority, PartialLeftover, PartialLeftoverFile,
    SessionConfig, TorrentCheckResult, TorrentDiagPeer, TorrentDiagnostics, TorrentFileInfo,
    TorrentInfo, TorrentInfoResult, TorrentLimits, TorrentOrigin, TorrentResumeResult,
};
pub const METADATA_SLOTS: usize = 8;

const SEQUENTIAL_PRIORITY_TICK: Duration = Duration::from_secs(1);

const MAX_SEQUENTIAL_PRIORITY_STREAMS: usize = 4;

const PAUSE_SNAPSHOT_SETTLE: Duration = Duration::from_millis(250);

const PAUSE_WATCH_INTERVAL: Duration = Duration::from_secs(3);

/// How long the add path waits for the engine to finish its initial check
/// before it starts the torrent. A slower check is picked up by the tick.
const INITIALIZE_WAIT: Duration = Duration::from_secs(3);

/// How long a torrent has to live with a repair before another one is queued.
/// Re-adding re-checks the whole payload, so the limit keeps a folder that
/// keeps losing files from turning into a re-add loop.
const REPAIR_COOLDOWN: Duration = Duration::from_secs(60);

/// A torrent whose payload disappeared from disk, waiting for the tick to
/// re-add it.
#[derive(Clone)]
struct RepairRequest {
    id: usize,
    was_live: bool,
}

/// Cheap payload existence check backed by one directory listing per parent.
/// The listing is kept for the duration of a reconcile pass, so a folder with
/// many unfinished files costs one `read_dir` instead of one `metadata` per
/// file. Nested payloads are looked up in their own directory; `metadata`
/// still runs before touching a file, because a directory entry can be stale.
/// The common root folder of a torrent, if every payload lives under one.
/// Single-file and flat torrents have no folder to rename.
fn torrent_root_name(handle: &librqbit::ManagedTorrent) -> Option<String> {
    handle
        .with_metadata(|metadata| {
            let mut root: Option<String> = None;
            for file in &metadata.file_infos {
                let mut parts = file.relative_filename.components();
                let Some(Component::Normal(first)) = parts.next() else {
                    return None;
                };
                parts.next()?;
                let first = first.to_str()?;
                if !is_valid_folder_name(first) {
                    return None;
                }
                match &root {
                    Some(root) if root != first => return None,
                    None => root = Some(first.to_string()),
                    _ => {}
                }
            }
            root
        })
        .ok()
        .flatten()
}

fn rename_torrent_folder(from: &Path, to: &Path) -> std::io::Result<()> {
    if from == to {
        return Ok(());
    }
    // Windows treats a case-only rename as a collision. Move through a
    // sibling temp name so `Show` can become `show`.
    if crate::watcher::normalize_key(from) == crate::watcher::normalize_key(to) {
        let name = to
            .file_name()
            .map_or_else(|| "torrent".into(), |name| name.to_string_lossy());
        let temp = to.with_file_name(format!(".{name}.rename-{}.tmp", std::process::id()));
        std::fs::rename(from, &temp)?;
        return match std::fs::rename(&temp, to) {
            Ok(()) => Ok(()),
            Err(error) => {
                let _ = std::fs::rename(&temp, from);
                Err(error)
            }
        };
    }
    std::fs::rename(from, to)
}

fn dir_has_entry(cache: &mut HashMap<PathBuf, HashSet<std::ffi::OsString>>, path: &Path) -> bool {
    let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    else {
        return false;
    };
    let Some(name) = path.file_name() else {
        return false;
    };
    cache
        .entry(parent.to_path_buf())
        .or_insert_with(|| {
            std::fs::read_dir(parent)
                .map(|entries| {
                    entries
                        .filter_map(std::result::Result::ok)
                        .map(|entry| entry.file_name())
                        .collect()
                })
                .unwrap_or_default()
        })
        .contains(name)
}

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

/// The `<name>.part` rename state of one torrent.
#[derive(Default)]
struct PartFinalizeState {
    /// Per file: the rename already happened, or the file needs no rename.
    done: Vec<bool>,
    /// The torrent was finished on the previous pass.
    was_finished: bool,
}

pub struct RewriteGuard<'a>(&'a std::sync::atomic::AtomicUsize);

impl Drop for RewriteGuard<'_> {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
}

pub struct TorrentManager {
    pub session: Arc<Session>,
    pub registry: TorrentRegistry,
    pub sequential_torrents: DashSet<String>,
    pub sequential_streams: DashMap<usize, (usize, tokio::task::JoinHandle<()>)>,
    pub file_priorities: DashMap<String, Vec<FilePriority>>,
    pub download_order: DashMap<String, Vec<usize>>,
    pub pending_selections: DashMap<usize, Vec<usize>>,
    /// Torrents the user asked to start while the engine was still running
    /// its initial check.
    pending_starts: DashSet<usize>,
    pub session_config_path: PathBuf,
    /// The proxy the running session was built with, redacted for display.
    pub active_proxy: Option<String>,
    pub file_order: std::sync::RwLock<FileOrder>,
    pub preferences_path: PathBuf,
    pub created_dir: PathBuf,
    pub limit_locks: DashMap<usize, Arc<tokio::sync::Mutex<()>>>,
    pub peer_counts: DashMap<usize, (Instant, usize)>,
    pub missing_files: DashMap<usize, bool>,
    file_snapshots: DashMap<String, Vec<FileStamp>>,
    file_watch_cache: DashMap<String, (Instant, Vec<String>)>,
    /// Per info hash: the state of the `<name>.part` renames.
    part_finalize: DashMap<String, PartFinalizeState>,
    rewrite_ghosts: DashMap<String, TorrentInfo>,
    hidden_files: DashMap<usize, HashSet<usize>>,
    /// Per torrent: the payloads that live in the `.part` twin and need no
    /// hidden attribute.
    part_twins: DashMap<usize, HashSet<usize>>,
    /// Payloads that vanished from disk, keyed by info hash.
    repair_requests: DashMap<String, RepairRequest>,
    /// When a repair last ran for an info hash, for the cooldown.
    last_repair: DashMap<String, Instant>,
    sparse_cache: DashMap<String, bool>,
    #[cfg(test)]
    pub peer_hints: std::sync::Mutex<Vec<std::net::SocketAddr>>,
    pub rewrites_in_flight: std::sync::atomic::AtomicUsize,
    pub files_cache: DashMap<usize, Vec<TorrentFileInfo>>,
    pub metadata_slots: Arc<tokio::sync::Semaphore>,
}
const fn session_listener_mode(proxy_active: bool) -> ListenerMode {
    if proxy_active {
        ListenerMode::TcpOnly
    } else {
        ListenerMode::TcpAndUtp
    }
}

impl TorrentManager {
    pub async fn new(app_data_dir: PathBuf) -> Result<Self> {
        Self::new_internal(app_data_dir, true).await
    }

    #[cfg(test)]
    pub async fn new_test(app_data_dir: PathBuf) -> Result<Self> {
        Self::new_internal(app_data_dir, false).await
    }

    #[allow(clippy::too_many_lines)]
    async fn new_internal(app_data_dir: PathBuf, enable_dht: bool) -> Result<Self> {
        let download_dir = app_data_dir.join("torrents");
        tokio::fs::create_dir_all(&download_dir).await.ok();

        let session_dir = app_data_dir.join("session");
        tokio::fs::create_dir_all(&session_dir).await.ok();

        let created_dir = app_data_dir.join("created_torrents");
        tokio::fs::create_dir_all(&created_dir).await.ok();

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
        let proxy_active = proxy_url.is_some();
        let active_proxy = proxy_url.as_deref().map(redact_proxy_url);
        let mut opts = SessionOptions {
            persistence,
            fastresume: session_config.fastresume,
            ipv4_only: session_config.ipv4_only,
            listen: Some(ListenerOptions {
                mode: session_listener_mode(proxy_active),
                listen_addr,
                enable_upnp_port_forwarding: session_config.enable_upnp && !proxy_active,
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
        if !enable_dht || !session_config.dht_enabled || proxy_active {
            opts.dht = None;
        }

        let session = Session::new_with_opts(download_dir, opts)
            .await
            .context("failed to create BitTorrent session")?;

        let manager = Self {
            session,
            registry: TorrentRegistry::load(&app_data_dir),
            sequential_torrents: preferences.sequential_torrents.into_iter().collect(),
            sequential_streams: DashMap::new(),
            file_priorities: preferences.file_priorities.into_iter().collect(),
            download_order: preferences.download_order.into_iter().collect(),
            pending_selections: DashMap::new(),
            pending_starts: DashSet::new(),
            file_order: std::sync::RwLock::new(session_config.file_order),
            session_config_path,
            active_proxy,
            preferences_path,
            created_dir,
            limit_locks: DashMap::new(),
            peer_counts: DashMap::new(),
            missing_files: DashMap::new(),
            file_snapshots: DashMap::new(),
            file_watch_cache: DashMap::new(),
            part_finalize: DashMap::new(),
            rewrite_ghosts: DashMap::new(),
            hidden_files: DashMap::new(),
            part_twins: DashMap::new(),
            repair_requests: DashMap::new(),
            last_repair: DashMap::new(),
            sparse_cache: DashMap::new(),
            #[cfg(test)]
            peer_hints: std::sync::Mutex::new(Vec::new()),
            rewrites_in_flight: std::sync::atomic::AtomicUsize::new(0),
            files_cache: DashMap::new(),
            metadata_slots: Arc::new(tokio::sync::Semaphore::new(METADATA_SLOTS)),
        };
        manager.reconcile_file_visibility();
        manager.prune_partial_leftovers();
        manager.sweep_stale_hidden();
        manager.prune_created_torrents();
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
        self.registry.magnet_links
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

    fn torrent_is_initializing(&self, id: usize) -> bool {
        self.session
            .with_torrents(|iter| {
                for (torrent_id, handle) in iter {
                    if torrent_id == id {
                        return Some(matches!(
                            handle.stats().state,
                            TorrentStatsState::Initializing { .. }
                        ));
                    }
                }
                None
            })
            .unwrap_or(false)
    }

    async fn wait_for_settled(&self, id: usize) {
        for _ in 0..200 {
            if !self.torrent_is_initializing(id) {
                return;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
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
        *crate::sync_utils::read_or_recover(&self.file_order, "torrent file order")
    }

    fn set_file_order(&self, order: FileOrder) {
        *crate::sync_utils::write_or_recover(&self.file_order, "torrent file order") = order;
    }

    pub fn listen_port(&self) -> Option<u16> {
        self.session.listen_addr().map(|addr| addr.port())
    }

    #[allow(clippy::too_many_lines)]
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
                    .registry.save_dirs
                    .get(&id)
                    .map(|r| r.clone())
                    .unwrap_or_default();
                let info_hash = handle.info_hash().as_string();
                let sequential_download = self.sequential_torrents.contains(&info_hash);
                let sequential_file = self.sequential_streams.get(&id).map(|holder| holder.0);
                let download_order = self
                    .download_order
                    .get(&info_hash)
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
                let disk_sparse = self.sparse_capable(&save_dir);
                let checking = matches!(stats.state, TorrentStatsState::Initializing { .. })
                    && stats.total_bytes > 0
                    && stats.progress_bytes > 0;
                let checking_file = if checking {
                    checked_payload_name(handle, stats.progress_bytes)
                } else {
                    None
                };

                result.push(TorrentInfo {
                    id,
                    name: self
                        .registry.aliases
                        .get(&info_hash)
                        .map(|alias| alias.clone())
                        .unwrap_or_else(|| handle.name().unwrap_or_default()),
                    info_hash,
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
                    external_changes: false,
                    external_changed_files: Vec::new(),
                    checking_file,
                    disk_sparse,
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
            true,
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
            true,
            None,
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
            .add_torrent_inner(
                AddTorrent::from_bytes(with_fallback_trackers_bytes(&bytes)),
                save_dir,
                None,
                Some(name.clone()),
                None,
                None,
                LimitsConfig::default(),
                true,
                false,
                false,
                false,
                None,
            )
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
        self.prune_created_torrents();

        Ok(CreatedTorrent {
            id,
            name,
            info_hash,
            torrent_path: torrent_path.to_string_lossy().to_string(),
            file_count,
        })
    }

    // The add path is shared by magnets, bytes, rewrites and restores; each
    // flag is a distinct caller decision, and splitting them into a struct
    // would only move the argument list.
    #[allow(clippy::too_many_arguments)]
    #[allow(clippy::fn_params_excessive_bools)]
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
        prefer_part_files: bool,
        root_name: Option<String>,
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
        let fresh_add = preferred_id.is_none();
        let opts = AddTorrentOptions {
            output_folder: Some(output_folder.clone()),
            overwrite: true,
            // A fresh add parks the download in the `.part` twins, so a file
            // with the final name is only replaced once the new one is
            // complete. A restore, a rewrite or a seed keeps opening what is
            // on disk.
            prefer_part_files,
            only_files: only_files.clone(),
            preferred_id,
            ratelimits,
            root_name: root_name.clone(),
            paused: paused || fresh_add,
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
        let added = matches!(&response, AddTorrentResponse::Added(..));

        let id = match response {
            AddTorrentResponse::Added(id, _) => {
                self.registry.save_dirs.insert(id, output_folder);
                self.registry.save_save_dirs();
                self.missing_files.remove(&id);
                if let Some(m) = magnet {
                    self.registry.magnet_links.insert(id, m);
                    self.registry.save_magnet_links();
                }
                id
            }
            AddTorrentResponse::AlreadyManaged(id, _) => {
                self.registry.save_dirs.entry(id).or_insert(output_folder);
                self.registry.save_save_dirs();
                if let Some(m) = magnet {
                    self.registry.magnet_links.entry(id).or_insert(m);
                    self.registry.save_magnet_links();
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

        self.reconcile_file_visibility();
        if let (Some(ref files), Some(handle), Some(key)) = (&only_files, &handle, &key) {
            self.pending_selections.insert(id, files.clone());
            self.materialize_priorities(handle, key, files);
        }

        if fresh_add && added {
            if let Some(handle) = &handle {
                if !paused {
                    // The engine drops an unpause that arrives while its
                    // initial check is still running, so the torrent has to
                    // be initialized before it can start.
                    let _ = tokio::time::timeout(INITIALIZE_WAIT, handle.wait_until_initialized())
                        .await;
                }
                // The initial check creates the `.part` twins; hide them now
                // instead of leaving them in the folder until the next
                // reconcile tick.
                self.reconcile_torrent(id);
                if !paused && !self.start_torrent(id, handle).await {
                    // A slow check is picked up by the tick.
                    self.pending_starts.insert(id);
                }
            }
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

    /// Start a torrent. The engine drops an unpause that arrives while its
    /// initial check is still running, so the caller has to try again later.
    /// Returns false when the torrent is not ready to start yet.
    async fn start_torrent(&self, id: usize, handle: &Arc<librqbit::ManagedTorrent>) -> bool {
        if matches!(handle.stats().state, TorrentStatsState::Initializing { .. }) {
            return false;
        }
        if let Err(error) = self.session.unpause(handle).await {
            tracing::warn!("could not start torrent {id}: {error:#}");
            return false;
        }
        true
    }

    /// Start the torrents whose initial check was still running when the
    /// user asked for them.
    pub async fn start_pending_torrents(&self) {
        if self.pending_starts.is_empty() {
            return;
        }
        let pending: Vec<usize> = self.pending_starts.iter().map(|id| *id).collect();
        for id in pending {
            let Some(handle) = self.torrent_handle(id) else {
                self.pending_starts.remove(&id);
                continue;
            };
            if self.start_torrent(id, &handle).await {
                self.pending_starts.remove(&id);
            }
        }
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
            self.registry.torrent_limits.insert(info_hash.to_string(), limits);
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
        self.registry.save_torrent_limits();
        self.save_preferences();
    }

    #[allow(clippy::too_many_arguments)]
    async fn replace_torrent(
        self: &Arc<Self>,
        id: usize,
        source: TorrentSource,
        rollback: TorrentSource,
        magnet: String,
        only_files: Option<Vec<usize>>,
        expected_hash: Option<&str>,
        inject_fallback: bool,
        prefer_part_files: bool,
    ) -> Result<usize, String> {
        self.verify_torrent(id, expected_hash)?;
        let save_dir = self
            .registry.save_dirs
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
            .registry.magnet_links
            .get(&id)
            .map(|r| r.clone())
            .unwrap_or_else(|| magnet.clone());
        let cached_files = self.files_cache.get(&id).map(|r| r.clone());
        let root_name = self.registry.root_names.get(&info_hash).map(|entry| entry.clone());
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
                prefer_part_files,
                root_name.clone(),
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
                        prefer_part_files,
                        root_name,
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
            .registry.magnet_links
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
                false,
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
                self.reconcile_file_visibility();
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

    const METADATA_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(120);

    async fn get_torrent_info_inner(
        self: &Arc<Self>,
        add_torrent: AddTorrent<'_>,
        save_dir: String,
    ) -> Result<TorrentInfoResult, String> {
        self.get_torrent_info_inner_with_timeout(add_torrent, save_dir, Self::METADATA_TIMEOUT)
            .await
    }

    #[allow(clippy::too_many_lines)]
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
                                            on_disk_bytes: 0,
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
                on_disk_bytes: 0,
                completed: false,
                selected: true,
                priority: FilePriority::Normal,
                exists: false,
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

        let conflicting_files: Vec<String> = files
            .iter()
            .filter_map(|f| {
                let full_path = final_file_path(
                    std::path::Path::new(&save_dir),
                    &name,
                    has_common_folder,
                    &f.name,
                )?;
                full_path.exists().then(|| f.name.clone())
            })
            .collect();

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









    pub async fn pause_for_disk_full(&self, id: usize) -> bool {
        let Some(handle) = self.torrent_handle(id) else {
            return false;
        };
        if handle.is_paused() {
            return false;
        }
        self.session.pause(&handle).await.is_ok()
    }

    pub async fn pause_torrent(
        self: &Arc<Self>,
        id: usize,
        info_hash: Option<String>,
    ) -> Result<()> {
        // A torrent the user paused must not be started by the pending list.
        self.pending_starts.remove(&id);
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
        let before = self.file_snapshots.get(&key).map(|entry| entry.clone());
        let after = before.as_ref().and_then(|_| self.file_stamps(id));
        let changed_files = match (&before, &after) {
            (Some(before), Some(after)) => Self::changed_file_names(before, after),
            _ => Vec::new(),
        };
        let changed = !changed_files.is_empty();
        if !changed {
            self.file_snapshots.remove(&key);
            self.file_watch_cache.remove(&key);
            self.session.unpause(&handle).await?;
            self.detect_missing_payload(id);
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
        self.file_snapshots.remove(&key);
        self.file_watch_cache.remove(&key);
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
        // The re-added torrent is still initializing (async checksum and
        // file setup); snapshotting before it settles captures mid-init
        // lengths and mtimes that the next watch would flag as external.
        self.wait_for_settled(new_id).await;
        // The first finalize pass renames the completed `.part` twins. Run it
        // before the snapshot, so the baseline describes the settled folder
        // rather than the pre-finalize one.
        if let Some(handle) = self.torrent_handle(new_id) {
            if let Some(save_dir) = self.registry.save_dirs.get(&new_id).map(|entry| entry.clone()) {
                let stats = handle.stats();
                self.finalize_part_files(&key, &handle, &stats, &save_dir);
            }
        }
        self.snapshot_torrent_files(new_id);
        Ok(TorrentResumeResult {
            id: new_id,
            rechecked: true,
            check,
        })
    }

    #[allow(clippy::too_many_lines)]
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
        let save_dir = self.registry.save_dirs.get(&id).map(|entry| entry.clone());
        let rewriting = self.is_rewriting();
        if rewriting {
            if let Some(key) = &key {
                self.capture_rewrite_ghost(id, key);
            }
        }
        let leftover = if delete_files {
            None
        } else {
            let handle = self.torrent_handle(id);
            // A completed torrent can still be holding a `.part` twin when the
            // user removes it between the last piece and the tick that renames
            // it. Finalize first, so removal sees the final name; a rename
            // blocked by an outside handle is still recorded below.
            if let (Some(handle), Some(key), Some(save_dir)) =
                (&handle, key.as_deref(), save_dir.as_deref())
            {
                let stats = handle.stats();
                self.finalize_part_files(key, handle, &stats, save_dir);
            }
            let name = self
                .registry.aliases
                .get(key.as_deref().unwrap_or_default())
                .map(|entry| entry.clone())
                .or_else(|| handle.as_ref().and_then(|handle| handle.name()))
                .unwrap_or_default();
            match (key.as_deref(), save_dir.as_deref()) {
                (Some(key), Some(save_dir)) if !save_dir.is_empty() && !name.is_empty() => {
                    self.partial_leftover_for(id, key, save_dir, &name)
                }
                _ => None,
            }
        };
        // Empty engine placeholders carry no data and never enter the leftover
        // record, so "keep files" would otherwise leave hidden 0-byte junk.
        let placeholders = if delete_files {
            Vec::new()
        } else {
            self.empty_placeholder_paths(id, save_dir.as_deref())
        };
        let leftover_is_none = leftover.is_none();
        self.session.delete(id.into(), delete_files).await?;
        let mut hidden_changed = false;
        if let Some(key) = &key {
            if let Some(leftover) = leftover {
                self.registry.partial_leftovers.insert(key.clone(), leftover);
            } else if delete_files {
                self.registry.partial_leftovers.remove(key);
            }
            self.registry.save_partial_leftovers();
            // Completed files become visible; only recorded partials stay
            // hidden, so a later re-add or the sweep can still find them. With
            // delete_files the engine removed the payload, and this call just
            // drops the registry and reveals anything a lock kept alive.
            let keep = if !delete_files && !leftover_is_none {
                self.leftover_paths(key)
            } else {
                Vec::new()
            };
            hidden_changed |= self.reveal_hidden_paths(key, &keep);
        }
        for path in &placeholders {
            if std::fs::remove_file(path).is_ok() {
                if let Some(key) = &key {
                    hidden_changed |= self.forget_hidden_path(key, &path.to_string_lossy());
                }
                if let Some(dir) = save_dir.as_deref() {
                    remove_empty_parents(path, Path::new(dir));
                }
            }
        }
        self.registry.save_dirs.remove(&id);
        self.registry.magnet_links.remove(&id);
        if let Some(key) = key {
            self.sequential_torrents.remove(&key);
            self.file_priorities.remove(&key);
            self.download_order.remove(&key);
            self.registry.torrent_limits.remove(&key);
            self.file_snapshots.remove(&key);
            self.file_watch_cache.remove(&key);
            self.part_finalize.remove(&key);
            self.repair_requests.remove(&key);
            self.last_repair.remove(&key);
            if !rewriting {
                self.registry.aliases.remove(&key);
                self.registry.root_names.remove(&key);
                self.rewrite_ghosts.remove(&key);
            }
        }
        self.stop_priority_stream(id);
        self.pending_selections.remove(&id);
        self.pending_starts.remove(&id);
        self.limit_locks.remove(&id);
        self.peer_counts.remove(&id);
        self.missing_files.remove(&id);
        self.files_cache.remove(&id);
        self.hidden_files.remove(&id);
        self.part_twins.remove(&id);
        if hidden_changed {
            self.registry.save_hidden_paths();
        }
        let persisted = Arc::clone(self);
        tokio::task::spawn_blocking(move || {
            persisted.registry.save_save_dirs();
            persisted.registry.save_magnet_links();
            persisted.registry.save_torrent_limits();
            persisted.registry.save_aliases();
            persisted.registry.save_root_names();
            persisted.registry.save_torrent_sources();
            persisted.save_preferences();
        });
        Ok(())
    }

    pub fn set_torrent_source(
        &self,
        id: usize,
        info_hash: Option<&str>,
        source: String,
        url: String,
    ) -> Result<(), String> {
        self.verify_torrent(id, info_hash)?;
        let key = self
            .torrent_info_hash(id)
            .or_else(|| info_hash.map(str::to_string))
            .ok_or_else(|| "torrent not found".to_string())?;
        let source = source.trim().chars().take(32).collect::<String>();
        let url = url.trim().chars().take(2048).collect::<String>();
        if source.is_empty() || url.is_empty() {
            return Err("torrent source is empty".to_string());
        }
        self.registry.torrent_sources
            .insert(key, TorrentOrigin { source, url });
        self.registry.save_torrent_sources();
        Ok(())
    }

    pub fn get_torrent_source(
        &self,
        id: usize,
        info_hash: Option<&str>,
    ) -> Result<Option<TorrentOrigin>, String> {
        self.verify_torrent(id, info_hash)?;
        let key = self
            .torrent_info_hash(id)
            .or_else(|| info_hash.map(str::to_string))
            .ok_or_else(|| "torrent not found".to_string())?;
        Ok(self.registry.torrent_sources.get(&key).map(|r| r.value().clone()))
    }

    fn store_alias(&self, key: &str, alias: Option<String>) {
        match alias {
            Some(name) => {
                self.registry.aliases.insert(key.to_string(), name);
            }
            None => {
                self.registry.aliases.remove(key);
            }
        }
        self.registry.save_aliases();
    }

    fn store_root_name(&self, key: &str, root_name: Option<String>) {
        match root_name {
            Some(name) => {
                self.registry.root_names.insert(key.to_string(), name);
            }
            None => {
                self.registry.root_names.remove(key);
            }
        }
        self.registry.save_root_names();
    }

    /// Rename the torrent's common root folder and keep the display alias in
    /// sync. The engine has already opened storage by the old path, so the
    /// torrent is paused, detached, moved, and re-added with a root override.
    #[allow(clippy::too_many_lines)]
    pub async fn rename_torrent(
        self: &Arc<Self>,
        id: usize,
        info_hash: Option<&str>,
        alias: Option<String>,
    ) -> Result<(), String> {
        self.verify_torrent(id, info_hash)?;
        let key = self
            .torrent_info_hash(id)
            .or_else(|| info_hash.map(str::to_string))
            .ok_or_else(|| "torrent not found".to_string())?;
        let alias = alias.map(|name| name.trim().chars().take(200).collect::<String>());
        let alias = alias.filter(|name| !name.is_empty());
        let Some(handle) = self.torrent_handle(id) else {
            return Err("torrent not found".to_string());
        };
        let Some(current_root) = torrent_root_name(&handle) else {
            // Single-file and flat torrents have no folder of their own.
            self.store_alias(&key, alias);
            self.store_root_name(&key, None);
            return Ok(());
        };
        let native_root = handle.name().filter(|name| is_valid_folder_name(name));
        let target_root = if let Some(name) = alias.as_deref() {
            if !is_valid_folder_name(name) {
                return Err(
                    "torrent name cannot be used as a folder name; remove slashes and reserved characters"
                        .to_string(),
                );
            }
            name.to_string()
        } else {
            let Some(name) = native_root.as_ref() else {
                self.store_alias(&key, None);
                self.store_root_name(&key, None);
                return Ok(());
            };
            name.clone()
        };
        let root_override = match native_root.as_deref() {
            Some(native) if native == target_root => None,
            _ => Some(target_root.clone()),
        };

        if current_root == target_root {
            self.store_alias(&key, alias);
            self.store_root_name(&key, root_override);
            return Ok(());
        }

        let save_dir = self
            .registry.save_dirs
            .get(&id)
            .map(|entry| entry.clone())
            .filter(|dir| !dir.is_empty())
            .ok_or_else(|| "torrent save directory is unavailable".to_string())?;
        let source = self
            .torrent_source(id)
            .ok_or_else(|| "torrent metainfo is unavailable, try again".to_string())?;
        let limits = self.get_torrent_limits(id);
        let sequential = self.sequential_torrents.contains(&key);
        let priorities = self.file_priorities.get(&key).map(|entry| entry.clone());
        let order = self.download_order.get(&key).map(|entry| entry.clone());
        let was_paused = self.torrent_is_paused(id);
        let magnet = self.registry.magnet_links.get(&id).map(|entry| entry.clone());
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
        let cached_files = self.files_cache.get(&id).map(|entry| entry.clone());
        let previous_root = self.registry.root_names.get(&key).map(|entry| entry.clone());

        let old_path = Path::new(&save_dir).join(&current_root);
        let new_path = Path::new(&save_dir).join(&target_root);
        if new_path.exists()
            && crate::watcher::normalize_key(&old_path) != crate::watcher::normalize_key(&new_path)
        {
            return Err("a folder with this name already exists".to_string());
        }
        if old_path.exists() && !old_path.is_dir() {
            return Err("the torrent root path is not a folder".to_string());
        }

        let lock = self
            .limit_locks
            .entry(id)
            .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
            .clone();
        let _guard = lock.lock().await;

        if !was_paused {
            if let Err(error) = self.session.pause(&handle).await {
                return Err(format!("unable to pause the torrent: {error:#}"));
            }
        }

        let _rewriting = self.rewrite_guard();
        if let Err(error) = self.session.delete(id.into(), false).await {
            if !was_paused {
                if let Some(handle) = self.torrent_handle(id) {
                    let _ = self.session.unpause(&handle).await;
                }
            }
            return Err(format!("unable to detach the torrent: {error:#}"));
        }
        self.cleanup_detached_torrent(id, &key);

        let moved = if old_path.exists() {
            if let Err(error) = rename_torrent_folder(&old_path, &new_path) {
                let restore = self
                    .readd_renamed_torrent(
                        id,
                        &source,
                        &save_dir,
                        selected_files.as_deref(),
                        magnet.as_deref(),
                        limits,
                        was_paused,
                        previous_root.clone(),
                    )
                    .await;
                if let Some(files) = &cached_files {
                    self.files_cache.insert(id, files.clone());
                }
                return match restore {
                    Ok(()) => Err(format!(
                        "unable to rename the torrent folder, restored it as it was: {error}"
                    )),
                    Err(restore_error) => Err(format!(
                        "unable to rename the torrent folder ({error}) and restoring it failed too: {restore_error}"
                    )),
                };
            }
            true
        } else {
            false
        };

        let added = self
            .readd_renamed_torrent(
                id,
                &source,
                &save_dir,
                selected_files.as_deref(),
                magnet.as_deref(),
                limits,
                was_paused,
                root_override.clone(),
            )
            .await;

        match added {
            Ok(()) => {
                if let Some(files) = cached_files {
                    self.files_cache.insert(id, files);
                }
                self.save_torrent_state(&key, limits, sequential, priorities, order);
                self.snapshot_torrent_files(id);
                self.store_alias(&key, alias);
                self.store_root_name(&key, root_override);
                self.registry.save_save_dirs();
                self.registry.save_magnet_links();
                Ok(())
            }
            Err(error) => {
                if moved {
                    let _ = rename_torrent_folder(&new_path, &old_path);
                }
                let restore = self
                    .readd_renamed_torrent(
                        id,
                        &source,
                        &save_dir,
                        selected_files.as_deref(),
                        magnet.as_deref(),
                        limits,
                        was_paused,
                        previous_root,
                    )
                    .await;
                if let Some(files) = &cached_files {
                    self.files_cache.insert(id, files.clone());
                }
                match restore {
                    Ok(()) => Err(format!(
                        "unable to rename the torrent, restored it as it was: {error}"
                    )),
                    Err(restore_error) => Err(format!(
                        "unable to rename the torrent ({error}) and restoring it failed too: {restore_error}"
                    )),
                }
            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    async fn readd_renamed_torrent(
        self: &Arc<Self>,
        id: usize,
        source: &TorrentSource,
        save_dir: &str,
        selected_files: Option<&[usize]>,
        magnet: Option<&str>,
        limits: TorrentLimits,
        was_paused: bool,
        root_name: Option<String>,
    ) -> Result<(), String> {
        self.add_torrent_inner(
            source.to_add_torrent(true),
            save_dir.to_string(),
            selected_files.map(<[usize]>::to_vec),
            None,
            Some(id),
            magnet.map(str::to_string),
            to_rqbit_limits(limits),
            true,
            false,
            was_paused,
            false,
            root_name,
        )
        .await
        .map(|_| ())
        .map_err(|error| format!("{error:#}"))
    }

    fn cleanup_detached_torrent(&self, id: usize, key: &str) {
        self.stop_priority_stream(id);
        self.pending_selections.remove(&id);
        self.pending_starts.remove(&id);
        self.peer_counts.remove(&id);
        self.missing_files.remove(&id);
        self.files_cache.remove(&id);
        self.hidden_files.remove(&id);
        self.part_twins.remove(&id);
        self.registry.save_dirs.remove(&id);
        self.registry.magnet_links.remove(&id);
        self.file_snapshots.remove(key);
        self.file_watch_cache.remove(key);
        self.part_finalize.remove(key);
        self.repair_requests.remove(key);
        self.last_repair.remove(key);
        self.registry.save_save_dirs();
        self.registry.save_magnet_links();
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


    pub fn dht_status(&self) -> Option<DhtStatus> {
        let stats = self.session.get_dht()?.stats();
        Some(DhtStatus {
            nodes_v4: stats.routing_table_size,
            nodes_v6: stats.routing_table_size_v6,
            pending: stats.outstanding_requests,
        })
    }

    #[allow(clippy::too_many_lines)]
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
                                        let full_path = self.registry.save_dirs.get(&id).map(|d| {
                                            resolve_payload_path(
                                                &Path::new(d.value()).join(&f.relative_filename),
                                            )
                                        });
                                        let exists = full_path.as_deref().is_some_and(|path| {
                                            std::fs::metadata(path)
                                                .is_ok_and(|m| m.is_file() && m.len() > 0)
                                        });
                                        let on_disk_bytes = full_path
                                            .as_deref()
                                            .and_then(disk::allocated_bytes)
                                            .unwrap_or(0);
                                        TorrentFileInfo {
                                            index: i,
                                            name: f.relative_filename.to_string_lossy().to_string(),
                                            size: f.len,
                                            progress_bytes: progress,
                                            on_disk_bytes,
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























}

/// The payload the initial check is hashing at `checked` bytes, as the user
/// sees it: the path inside the save folder.
fn checked_payload_name(handle: &librqbit::ManagedTorrent, checked: u64) -> Option<String> {
    handle
        .with_metadata(|metadata| {
            let index = file_at_offset(
                metadata
                    .file_infos
                    .iter()
                    .enumerate()
                    .map(|(index, file)| (index, file.len, file.attrs.padding)),
                checked,
            )?;
            let file = metadata.file_infos.get(index)?;
            Some(file.relative_filename.to_string_lossy().to_string())
        })
        .ok()
        .flatten()
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or_default()
}

fn remove_empty_parents(path: &Path, stop: &Path) {
    let mut current = path.parent();
    while let Some(parent) = current {
        if parent == stop || !parent.starts_with(stop) {
            return;
        }
        if std::fs::remove_dir(parent).is_err() {
            return;
        }
        current = parent.parent();
    }
}


#[cfg(test)]
mod tests;
