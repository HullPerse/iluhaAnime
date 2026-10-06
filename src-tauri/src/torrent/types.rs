use serde::{Deserialize, Serialize};
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FilePriority {
    DoNotDownload,
    Normal,
}

/// List order = sequential download order (single setting, or mode starts on unseen file).
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

/// Resume outcome; snapshot at pause distinguishes unpause from re-verify.
#[derive(Serialize, Clone, Debug)]
pub struct TorrentResumeResult {
    /// Torrent id after resume (re-verify may re-add).
    pub id: usize,
    /// True when paused files changed, so torrent was re-verified.
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
    /// Cached metainfo copy for "Save .torrent".
    pub torrent_path: String,
    /// File count for UI share message.
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
    /// Current sequential file (queue jump, not sole selection).
    pub sequential_file: Option<usize>,
    /// User-arranged fetch order for queue window.
    pub download_order: Vec<usize>,
    /// Missing on disk (recheck/background pass; UI distinguishes from tracker failure).
    pub missing_files: bool,
    /// Paused files changed externally (watcher verdict for resume warning).
    pub paused_external_changes: bool,
    /// Files behind `paused_external_changes`; empty when flag is false.
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
    /// SOCKS5 proxy; default keeps pre-field session files loadable.
    #[serde(default, rename = "proxyUrl")]
    pub proxy_url: Option<String>,
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
