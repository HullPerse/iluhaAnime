use std::collections::HashSet;
use std::fmt::Write as _;
use std::num::NonZeroU32;
use std::path::Path;

use anyhow::{Context, Result};
use librqbit::limits::LimitsConfig;
use librqbit::{torrent_from_bytes, ByteBufOwned, CloneToOwned};
use librqbit_bencode::bencode_serialize_to_writer;

use super::types::{FileOrder, FilePriority, SessionConfig, TorrentLimits};

pub fn share_ratio(uploaded_bytes: u64, downloaded_bytes: u64) -> f64 {
    if downloaded_bytes == 0 {
        0.0
    } else {
        uploaded_bytes as f64 / downloaded_bytes as f64
    }
}

pub fn to_rqbit_limits(limits: TorrentLimits) -> LimitsConfig {
    LimitsConfig {
        download_bps: limits.download_bps.and_then(NonZeroU32::new),
        upload_bps: limits.upload_bps.and_then(NonZeroU32::new),
    }
}

pub fn is_safe_relative_path(name: &str) -> bool {
    let path = Path::new(name);
    !name.is_empty()
        && !path.is_absolute()
        && path
            .components()
            .all(|component| matches!(component, std::path::Component::Normal(_)))
}

/// The order a torrent's files are shown in, as indices into `names`.
///
/// The list is a tree: at every directory level the files come first, sorted by name, then the
/// sub-folders, sorted by name. Names compare case-insensitively, the way the UI's
/// `localeCompare` sorts them. Sequential mode walks this order, so "the first file" means the
/// first row the user sees and not the first entry of the metainfo, whose order is arbitrary.
pub fn display_order(names: &[String]) -> Vec<usize> {
    /// One path component: `0` for the file itself and `1` for a directory, plus the lowercase
    /// name. Files sort before directories on the same level, which is what the tree view does.
    type Key = (u8, String);

    fn key(name: &str) -> Vec<Key> {
        let parts: Vec<&str> = name
            .split(['/', '\\'])
            .filter(|part| !part.is_empty())
            .collect();
        let last = parts.len().saturating_sub(1);
        parts
            .iter()
            .enumerate()
            .map(|(position, part)| (u8::from(position != last), part.to_lowercase()))
            .collect()
    }

    let mut keyed: Vec<(Vec<Key>, &str, usize)> = names
        .iter()
        .enumerate()
        .map(|(index, name)| (key(name), name.as_str(), index))
        .collect();
    keyed.sort_by(|left, right| left.0.cmp(&right.0).then_with(|| left.1.cmp(right.1)));
    keyed.into_iter().map(|(_, _, index)| index).collect()
}

/// The order files are downloaded in, as indices into `names`.
///
/// `queue` is the arrangement the user made for this torrent, and comes first: whatever is in it
/// is fetched in that order, and only then does the rest follow the global order. Entries that do
/// not name a file - or name one twice - are dropped rather than trusted, because the queue is
/// stored per info hash and outlives any single metainfo.
pub fn download_order(names: &[String], order: FileOrder, queue: &[usize]) -> Vec<usize> {
    let base: Vec<usize> = match order {
        FileOrder::List => display_order(names),
        FileOrder::Torrent => (0..names.len()).collect(),
    };
    if queue.is_empty() {
        return base;
    }
    let mut result: Vec<usize> = Vec::with_capacity(names.len());
    for index in queue.iter().copied() {
        if index < names.len() && !result.contains(&index) {
            result.push(index);
        }
    }
    let rest: Vec<usize> = base
        .into_iter()
        .filter(|index| !result.contains(index))
        .collect();
    result.extend(rest);
    result
}

/// What sequential mode should do for one torrent right now.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SequentialPlan {
    /// Every file the mode may download, in the order the list shows them.
    pub allowed: Vec<usize>,
    /// The file to fetch next: the first incomplete entry of `allowed`. `None` once everything
    /// the user selected is on disk.
    pub target: Option<usize>,
}

/// Plans the next step of sequential mode from one torrent's state.
///
/// `priorities` is the app's per-file selection and wins when it matches the file count;
/// `only_files` is a selection that has not been turned into priorities yet. The session's own
/// `only_files` is deliberately not accepted here: sequential mode narrows it to a single file,
/// so planning from it would see only that file and never move on. `queue` is the order the user
/// arranged in the queue window, empty when they have not touched it.
pub fn plan_sequential(
    names: &[String],
    lengths: &[u64],
    progress: &[u64],
    priorities: Option<&[FilePriority]>,
    only_files: Option<&[usize]>,
    order: FileOrder,
    queue: &[usize],
) -> SequentialPlan {
    let priorities = priorities.filter(|priorities| priorities.len() == names.len());
    let allowed: Vec<usize> = download_order(names, order, queue)
        .into_iter()
        .filter(|index| match (priorities, only_files) {
            (Some(priorities), _) => priorities[*index] != FilePriority::DoNotDownload,
            (None, Some(only_files)) => only_files.contains(index),
            (None, None) => true,
        })
        .collect();
    let target = allowed.iter().copied().find(|index| {
        let length = lengths.get(*index).copied().unwrap_or(0);
        progress.get(*index).copied().unwrap_or(0) < length
    });
    SequentialPlan { allowed, target }
}

pub const MIN_TORRENT_FREE_SPACE_BYTES: u64 = 128 * 1024 * 1024;

pub fn existing_parent(path: &Path) -> Option<&Path> {
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
    let success = unsafe {
        GetDiskFreeSpaceExW(
            wide.as_ptr(),
            &raw mut free,
            &raw mut total,
            &raw mut total_free,
        )
    };
    if success == 0 {
        anyhow::bail!("could not determine free disk space");
    }
    Ok(free)
}

#[cfg(not(windows))]
fn available_disk_space(_path: &Path) -> Result<u64> {
    Ok(u64::MAX)
}

pub fn ensure_minimum_free_space(path: &Path) -> Result<()> {
    let free = available_disk_space(path)?;
    if free < MIN_TORRENT_FREE_SPACE_BYTES {
        anyhow::bail!(
            "not enough free disk space: {free} bytes available, at least {MIN_TORRENT_FREE_SPACE_BYTES} required"
        );
    }
    Ok(())
}

pub const FALLBACK_TRACKERS: &[&str] = &[
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.demonii.com:1337/announce",
    "udp://tracker.openbittorrent.com:6969/announce",
    "udp://exodus.desync.com:6969/announce",
    "udp://explodie.org:6969/announce",
    "https://tracker.tamersunion.org:443/announce",
];

pub fn url_encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len() * 2);
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~') {
            out.push(byte as char);
        } else {
            let _ = write!(out, "%{byte:02X}");
        }
    }
    out
}

pub fn with_fallback_trackers(magnet: &str) -> String {
    let mut result = String::with_capacity(magnet.len() + 512);
    result.push_str(magnet);
    for tracker in FALLBACK_TRACKERS {
        result.push(if result.contains('?') { '&' } else { '?' });
        result.push_str("tr=");
        result.push_str(&url_encode(tracker));
    }
    result
}

pub fn with_fallback_trackers_bytes(bytes: &[u8]) -> Vec<u8> {
    let Ok(torrent) = torrent_from_bytes(bytes) else {
        return bytes.to_vec();
    };
    if torrent.info.data.private {
        return bytes.to_vec();
    }
    let mut owned = torrent.clone_to_owned(None);

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

/// Rewrites the metainfo so its announce list is exactly `trackers`, keeping the info dict (and
/// with it the info hash, the piece layout and every file entry) untouched.
///
/// This is what makes a tracker change an in-memory re-add: the bytes are already in the session,
/// so putting the torrent back needs no peers, cannot fail because the swarm is unreachable and
/// cannot lose the torrent the way a magnet that has to resolve its metadata again can.
/// An empty list is allowed and produces a trackerless torrent, which is what removing the last
/// tracker means.
pub fn with_trackers_bytes(bytes: &[u8], trackers: &[String]) -> Result<Vec<u8>, String> {
    let torrent = torrent_from_bytes(bytes)
        .map_err(|error| format!("Invalid torrent metainfo: {error:#}"))?;
    let mut owned = torrent.clone_to_owned(None);
    owned.announce = trackers
        .first()
        .map(|tracker| ByteBufOwned::from(tracker.as_bytes().to_vec()));
    owned.announce_list = trackers
        .iter()
        .map(|tracker| vec![ByteBufOwned::from(tracker.as_bytes().to_vec())])
        .collect();
    let mut out = Vec::new();
    bencode_serialize_to_writer(owned, &mut out)
        .map_err(|error| format!("Failed to write torrent metainfo: {error:#}"))?;
    Ok(out)
}

const MAX_TRACKER_URL_LEN: usize = 2048;

pub fn validate_tracker_url(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Tracker URL is empty".to_string());
    }
    if trimmed.len() > MAX_TRACKER_URL_LEN {
        return Err("Tracker URL is too long".to_string());
    }
    let parsed = url::Url::parse(trimmed).map_err(|_| "Tracker URL is invalid".to_string())?;
    if !matches!(parsed.scheme(), "udp" | "http" | "https") {
        return Err("Tracker URL must use udp, http, or https".to_string());
    }
    if parsed.host_str().is_none_or(str::is_empty) {
        return Err("Tracker URL must have a host".to_string());
    }
    Ok(parsed.to_string())
}

/// Normalizes a tracker to the exact string librqbit echoes back from
/// ``handle.shared().trackers``, so user input and live trackers compare equal.
/// Returns `None` for anything that does not parse, so callers can keep such an
/// entry instead of dropping a tracker from the set.
pub fn canonical_tracker_url(raw: &str) -> Option<String> {
    validate_tracker_url(raw).ok()
}

pub fn canonical_or_raw_tracker(raw: &str) -> String {
    canonical_tracker_url(raw).unwrap_or_else(|| raw.trim().to_string())
}

const MAX_PROXY_URL_LEN: usize = 512;

/// Prepares a user-entered proxy for the torrent session, or `None` when none is set.
///
/// librqbit parses this value with `SocksProxyConfig::parse`, which accepts the `socks5` scheme
/// only and aborts session creation for anything else, so the `socks5h` form the search clients
/// prefer is normalized here. Peer addresses reach this path as literal IPs, so remote DNS
/// resolution buys nothing for peers and would cost the whole session when rejected.
pub fn torrent_proxy_url(raw: &str) -> Result<Option<String>, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    if trimmed.len() > MAX_PROXY_URL_LEN {
        return Err("Proxy URL is too long".to_string());
    }
    let parsed = url::Url::parse(trimmed).map_err(|_| "Proxy URL is invalid".to_string())?;
    if !matches!(parsed.scheme(), "socks5" | "socks5h") {
        return Err("Proxy URL must use the socks5 or socks5h scheme".to_string());
    }
    if parsed.host_str().is_none_or(str::is_empty) {
        return Err("Proxy URL must have a host".to_string());
    }
    if parsed.port().is_none() {
        return Err("Proxy URL must have a port".to_string());
    }
    let rest = trimmed.split_once("://").map_or(trimmed, |(_, rest)| rest);
    Ok(Some(format!("socks5://{rest}")))
}

/// Rejects a session config that would break session startup, instead of persisting it and
/// discovering the problem on the next launch when `Session::new_with_opts` fails outright.
pub fn validate_session_config(mut config: SessionConfig) -> Result<SessionConfig, String> {
    config.proxy_url = match config.proxy_url.as_deref() {
        Some(raw) => torrent_proxy_url(raw)?,
        None => None,
    };
    Ok(config)
}

/// Whether a string is a 20-byte info hash in hex, the shape every per-torrent setting is keyed
/// by.
pub fn is_info_hash(value: &str) -> bool {
    value.len() == 40 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

pub fn build_magnet(
    info_hash: &str,
    trackers: &[String],
    name: Option<&str>,
) -> Result<String, String> {
    let hash = info_hash.trim().to_lowercase();
    if !is_info_hash(&hash) {
        return Err("Invalid info hash".to_string());
    }
    let mut out = format!("magnet:?xt=urn:btih:{hash}");
    out.reserve(name.map_or(0, str::len) + trackers.len() * 64);
    if let Some(name) = name.map(str::trim).filter(|name| !name.is_empty()) {
        out.push_str("&dn=");
        out.push_str(&url_encode(name));
    }
    for tracker in trackers {
        out.push_str("&tr=");
        out.push_str(&url_encode(tracker));
    }
    Ok(out)
}

#[cfg(test)]
mod tracker_tests {
    use super::{
        build_magnet, canonical_or_raw_tracker, canonical_tracker_url, display_order,
        download_order, plan_sequential, torrent_proxy_url, validate_session_config,
        validate_tracker_url, SequentialPlan,
    };
    use crate::torrent::{FileOrder, FilePriority, SessionConfig};

    fn names(entries: &[&str]) -> Vec<String> {
        entries.iter().map(|entry| (*entry).to_string()).collect()
    }

    #[test]
    fn display_order_walks_the_tree_the_way_the_file_list_does() {
        let order = display_order(&names(&[
            "Show/Episode 02.mkv",
            "Show/Episode 01.mkv",
            "Show/Extras/Interview.mkv",
            "cover.jpg",
        ]));
        // Root files first, then the folder's own files by name, then its sub-folders.
        assert_eq!(order, vec![3, 1, 0, 2]);
    }

    #[test]
    fn display_order_folds_case_and_ignores_the_metainfo_order() {
        assert_eq!(
            display_order(&names(&["Ep 10.mkv", "ep 2.mkv", "EP 1.mkv"])),
            vec![2, 0, 1]
        );
        assert_eq!(display_order(&names(&["b.mkv", "A.mkv"])), vec![1, 0]);
    }

    #[test]
    fn plan_sequential_picks_the_first_file_by_name_not_by_index() {
        // Metainfo order is scrambled: the sixth episode sits at index 0.
        let names = names(&["Show - 06.mkv", "Show - 01.mkv", "Show - 02.mkv"]);
        let lengths = vec![10, 10, 10];
        let progress = vec![0, 0, 0];
        let plan = plan_sequential(
            &names,
            &lengths,
            &progress,
            None,
            None,
            FileOrder::List,
            &[],
        );
        assert_eq!(plan.allowed, vec![1, 2, 0]);
        assert_eq!(
            plan.target,
            Some(1),
            "the first episode, not the first index"
        );
    }

    #[test]
    fn plan_sequential_honours_the_chosen_file_order() {
        let names = names(&["Show - 06.mkv", "Show - 01.mkv", "Show - 02.mkv"]);
        let lengths = vec![10, 10, 10];
        let progress = vec![0, 0, 0];
        // Torrent order is what the other clients call sequential: the torrent's own file order.
        let plan = plan_sequential(
            &names,
            &lengths,
            &progress,
            None,
            None,
            FileOrder::Torrent,
            &[],
        );
        assert_eq!(plan.allowed, vec![0, 1, 2]);
        assert_eq!(plan.target, Some(0));
    }

    #[test]
    fn plan_sequential_respects_the_file_selection() {
        let names = names(&["Show - 06.mkv", "Show - 01.mkv", "Show - 02.mkv"]);
        let lengths = vec![10, 10, 10];
        let progress = vec![0, 0, 0];

        let priorities = vec![
            FilePriority::DoNotDownload,
            FilePriority::Normal,
            FilePriority::Normal,
        ];
        let plan = plan_sequential(
            &names,
            &lengths,
            &progress,
            Some(&priorities),
            None,
            FileOrder::List,
            &[],
        );
        assert_eq!(plan.allowed, vec![1, 2]);
        assert_eq!(plan.target, Some(1));

        // A selection that has not been turned into priorities yet must work just as well, and
        // must never pick a file the user left out.
        let pending = vec![2usize];
        let plan = plan_sequential(
            &names,
            &lengths,
            &progress,
            None,
            Some(&pending),
            FileOrder::List,
            &[],
        );
        assert_eq!(plan.allowed, vec![2]);
        assert_eq!(plan.target, Some(2));

        // Priorities from a different file count are stale and must not filter anything out.
        let stale = vec![FilePriority::DoNotDownload];
        let plan = plan_sequential(
            &names,
            &lengths,
            &progress,
            Some(&stale),
            None,
            FileOrder::List,
            &[],
        );
        assert_eq!(plan.allowed, vec![1, 2, 0]);
        assert_eq!(plan.target, Some(1));
    }

    #[test]
    fn plan_sequential_moves_on_as_files_complete() {
        let names = names(&["Show - 01.mkv", "Show - 02.mkv"]);
        let lengths = vec![10, 10];

        let plan = plan_sequential(&names, &lengths, &[10, 0], None, None, FileOrder::List, &[]);
        assert_eq!(plan.target, Some(1));

        let plan = plan_sequential(
            &names,
            &lengths,
            &[10, 10],
            None,
            None,
            FileOrder::List,
            &[],
        );
        assert_eq!(
            plan,
            SequentialPlan {
                allowed: vec![0, 1],
                target: None
            }
        );
    }

    #[test]
    fn plan_sequential_follows_the_queue_the_user_arranged() {
        // Names sort to 1, 2, 0, which is what the torrent would use on its own.
        let names = names(&["Show - 06.mkv", "Show - 01.mkv", "Show - 02.mkv"]);
        let lengths = vec![10, 10, 10];
        let progress = vec![0, 0, 0];

        let plan = plan_sequential(
            &names,
            &lengths,
            &progress,
            None,
            None,
            FileOrder::List,
            &[0, 2],
        );
        assert_eq!(
            plan.allowed,
            vec![0, 2, 1],
            "queued files first, the rest after"
        );
        assert_eq!(plan.target, Some(0));

        // A file that is not in the queue still follows it instead of being dropped.
        let plan = plan_sequential(
            &names,
            &lengths,
            &progress,
            None,
            None,
            FileOrder::List,
            &[2],
        );
        assert_eq!(plan.allowed, vec![2, 1, 0]);
    }

    #[test]
    fn plan_sequential_ignores_a_queue_entry_that_names_no_file() {
        let names = names(&["Show - 01.mkv", "Show - 02.mkv"]);
        let lengths = vec![10, 10];
        let progress = vec![0, 0];
        // Stale indices from a metainfo that changed, and a repeat.
        let plan = plan_sequential(
            &names,
            &lengths,
            &progress,
            None,
            None,
            FileOrder::List,
            &[7, 1, 1],
        );
        assert_eq!(plan.allowed, vec![1, 0]);
    }

    #[test]
    fn an_empty_queue_leaves_the_global_order_alone() {
        let names = names(&["Show - 06.mkv", "Show - 01.mkv"]);
        assert_eq!(download_order(&names, FileOrder::List, &[]), vec![1, 0]);
        assert_eq!(download_order(&names, FileOrder::Torrent, &[]), vec![0, 1]);
        // Same list, now with an arrangement: it wins outright.
        assert_eq!(download_order(&names, FileOrder::List, &[0]), vec![0, 1]);
    }

    #[test]
    fn accepts_udp_and_http_trackers() {
        assert_eq!(
            validate_tracker_url("udp://explodie.org:6969/announce"),
            Ok("udp://explodie.org:6969/announce".to_string())
        );
        assert_eq!(
            validate_tracker_url("  https://tracker.tamersunion.org:443/announce  "),
            Ok("https://tracker.tamersunion.org/announce".to_string())
        );
    }

    #[test]
    fn rejects_bad_tracker_urls() {
        assert!(validate_tracker_url("").is_err());
        assert!(validate_tracker_url("ftp://example.com/announce").is_err());
        assert!(validate_tracker_url("not a url").is_err());
        assert!(validate_tracker_url("udp://:6969/announce").is_err());
        assert!(validate_tracker_url(&"u".repeat(3000)).is_err());
    }

    #[test]
    fn builds_magnet_with_encoded_trackers() {
        let magnet = build_magnet(
            "ABCDEF1234567890ABCDEF1234567890ABCDEF12",
            &["udp://explodie.org:6969/announce".to_string()],
            None,
        )
        .expect("magnet");
        assert!(magnet.starts_with("magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12"));
        assert!(magnet.contains("&tr=udp%3A%2F%2Fexplodie.org%3A6969%2Fannounce"));
        assert!(!magnet.contains("&dn="));
    }

    #[test]
    fn builds_magnet_with_display_name() {
        let magnet = build_magnet(
            "ABCDEF1234567890ABCDEF1234567890ABCDEF12",
            &[],
            Some("Show 01"),
        )
        .expect("magnet");
        assert!(magnet.contains("&dn=Show%2001"));
        let blank = build_magnet("ABCDEF1234567890ABCDEF1234567890ABCDEF12", &[], Some("   "))
            .expect("magnet");
        assert!(!blank.contains("&dn="));
    }

    #[test]
    fn canonicalizes_trackers_the_way_the_session_reports_them() {
        assert_eq!(
            canonical_tracker_url("  HTTPS://tracker.tamersunion.org:443/announce  "),
            Some("https://tracker.tamersunion.org/announce".to_string())
        );
        assert_eq!(canonical_tracker_url("ftp://example.com/announce"), None);
        assert_eq!(
            canonical_or_raw_tracker("magnet:"),
            "magnet:".to_string(),
            "unparseable live trackers must survive a rewrite"
        );
    }

    #[test]
    fn rejects_bad_info_hashes() {
        assert!(build_magnet("abc", &[], None).is_err());
        assert!(build_magnet("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz", &[], None).is_err());
        assert!(build_magnet("", &[], None).is_err());
    }

    #[test]
    fn torrent_proxy_url_normalizes_to_the_scheme_librqbit_accepts() {
        assert_eq!(
            torrent_proxy_url("socks5://127.0.0.1:10808").unwrap(),
            Some("socks5://127.0.0.1:10808".to_string())
        );
        assert_eq!(
            torrent_proxy_url("  socks5h://user:pass@127.0.0.1:10808  ").unwrap(),
            Some("socks5://user:pass@127.0.0.1:10808".to_string())
        );
        assert_eq!(torrent_proxy_url("   ").unwrap(), None);
    }

    #[test]
    fn torrent_proxy_url_rejects_what_librqbit_would_abort_on() {
        assert!(torrent_proxy_url("http://127.0.0.1:7890").is_err());
        assert!(torrent_proxy_url("127.0.0.1:10808").is_err());
        assert!(torrent_proxy_url("socks5://127.0.0.1").is_err());
        assert!(torrent_proxy_url("socks5://").is_err());
    }

    #[test]
    fn validate_session_config_stores_the_normalized_proxy_only() {
        let config = SessionConfig {
            proxy_url: Some("socks5h://127.0.0.1:10808".to_string()),
            ..SessionConfig::default()
        };
        assert_eq!(
            validate_session_config(config).unwrap().proxy_url,
            Some("socks5://127.0.0.1:10808".to_string())
        );

        let broken = SessionConfig {
            proxy_url: Some("http://127.0.0.1:7890".to_string()),
            ..SessionConfig::default()
        };
        assert!(validate_session_config(broken).is_err());
    }

    #[test]
    fn session_config_without_a_proxy_field_still_loads() {
        let legacy = r#"{"fastresume":true,"ipv4Only":false,"peerConnectTimeout":30,"peerReadWriteTimeout":30,"listenPort":0,"enableUpnp":false,"disablePersistence":false}"#;
        let parsed: SessionConfig = serde_json::from_str(legacy).unwrap();
        assert_eq!(parsed.proxy_url, None);
        assert_eq!(parsed.peer_connect_timeout_secs, 30);
        assert_eq!(
            parsed.file_order,
            FileOrder::List,
            "a config without the field keeps the list order"
        );
    }
}
