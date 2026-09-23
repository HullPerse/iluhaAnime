use serde::{Deserialize, Serialize};
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FilePriority {
    DoNotDownload,
    Normal,
}

/// The order files are listed in, which is also the order sequential mode downloads them in:
/// the two have to be read off the same setting, otherwise the mode starts on a file the user
/// does not see first.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FileOrder {
    /// As the file tree shows them: by name, files before sub-folders.
    #[default]
    List,
    /// As they sit in the torrent, which is what every other client downloads in.
    Torrent,
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

/// What a resume turned out to be. The files are snapshotted when a torrent is paused, so a
/// resume can tell "nothing happened" from "another client wrote to these files meanwhile": the
/// first unpauses straight away, the second re-verifies the torrent from disk first.
#[derive(Serialize, Clone, Debug)]
pub struct TorrentResumeResult {
    /// The torrent's id after the resume. Re-verifying removes and re-adds the torrent, which
    /// normally hands back the same id, but the field carries the real one either way.
    pub id: usize,
    /// True when the files changed while the torrent was paused and it was therefore re-verified
    /// from disk instead of just unpaused.
    pub rechecked: bool,
    /// Present when `rechecked` is true: what the filesystem pass found on disk.
    pub check: Option<TorrentCheckResult>,
}

#[derive(Serialize, Clone, Debug)]
pub struct TorrentDiagPeer {
    pub addr: String,
    pub state: String,
    pub client_name: Option<String>,
    pub conn_kind: Option<String>,
    /// ISO 3166-1 alpha-2, `None` for private and unknown addresses.
    pub country: Option<String>,
    pub down_bytes: u64,
    pub up_bytes: u64,
    pub errors: u32,
}

#[derive(Serialize, Clone, Debug)]
pub struct TorrentDiagnostics {
    pub id: usize,
    pub peers: Vec<TorrentDiagPeer>,
    pub trackers: Vec<String>,
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
pub struct CreatedTorrent {
    pub id: usize,
    pub name: String,
    pub info_hash: String,
    /// Path of the metainfo copy kept in the app data dir, ready to be copied wherever the
    /// user wants when they press "Save .torrent".
    pub torrent_path: String,
    /// How many files went into the torrent, so the UI can say what was shared.
    pub file_count: usize,
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
    /// The file sequential mode is pushing to the front right now, if any. The mode keeps every
    /// selected file in the download and only makes this one jump the picker's queue, so the UI
    /// shows it as the current step instead of as the only file left selected.
    pub sequential_file: Option<usize>,
    /// The order the user arranged the selected files in, if they arranged any. Sequential mode
    /// fetches these before the rest, so the queue window can show the list as it will run.
    pub download_order: Vec<usize>,
    /// Files the last filesystem check could not find on disk. Refreshed by `recheck_torrent`
    /// and by the background verification pass, so the UI can tell "files are gone" apart
    /// from "the tracker died".
    pub missing_files: bool,
    /// True while a paused torrent's files no longer match the snapshot taken at pause, i.e.
    /// another client wrote to them. Refreshed by the paused watcher on each tick, so the UI can
    /// warn before the user resumes and a re-verification is triggered.
    pub paused_external_changes: bool,
    /// The files behind [`TorrentInfo::paused_external_changes`], named by the same watcher pass.
    /// Empty when the flag is false.
    pub paused_changed_files: Vec<String>,
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
    /// SOCKS5 proxy for peer connections and HTTP(S) tracker requests. `default` keeps session
    /// files written before this field existed loadable; without it serde rejects the whole
    /// config and every other session setting silently resets to its default.
    #[serde(default, rename = "proxyUrl")]
    pub proxy_url: Option<String>,
    /// Which order files are listed and downloaded in.
    #[serde(default, rename = "fileOrder")]
    pub file_order: FileOrder,
}

impl Default for SessionConfig {
    fn default() -> Self {
        Self {
            fastresume: true,
            ipv4_only: false,
            peer_connect_timeout_secs: 10,
            peer_read_write_timeout_secs: 30,
            listen_port: 0,
            enable_upnp: true,
            disable_persistence: false,
            proxy_url: None,
            file_order: FileOrder::default(),
        }
    }
}
