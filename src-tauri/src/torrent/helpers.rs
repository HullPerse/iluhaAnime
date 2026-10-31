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

/// The payload that contains `checked` bytes of the initial check, in torrent
/// order. Padding entries are skipped; an offset inside padding names the next
/// payload, which is what the user sees being checked.
#[must_use]
pub fn file_at_offset<I>(files: I, checked: u64) -> Option<usize>
where
    I: IntoIterator<Item = (usize, u64, bool)>,
{
    let mut start = 0u64;
    let mut current = None;
    for (index, len, padding) in files {
        let end = start.saturating_add(len);
        if !padding {
            if checked < end {
                return Some(index);
            }
            current = Some(index);
        }
        start = end;
    }
    current
}

/// The incomplete twin of a payload path: the engine writes `<name>.part`
/// until the file finishes, then the app renames it to the final name.
#[must_use]
pub fn part_file_path(final_path: &Path) -> std::path::PathBuf {
    let mut name = final_path.as_os_str().to_os_string();
    name.push(".part");
    std::path::PathBuf::from(name)
}

/// The path the payload currently lives at: the `.part` file while it
/// exists, the final name otherwise (finished files and torrents added before
/// `.part` support).
pub fn resolve_payload_path(final_path: &Path) -> std::path::PathBuf {
    let part = part_file_path(final_path);
    if part.is_file() {
        part
    } else {
        final_path.to_path_buf()
    }
}

/// One payload of a torrent, as the watcher needs it.
pub struct PayloadFile<'a> {
    /// The name of the payload inside the save folder.
    pub relative_filename: &'a Path,
    /// The bytes the payload has on disk.
    pub progress: u64,
    /// The length of the payload.
    pub len: u64,
}

/// The paths the watcher ignores for the payloads that are not finished.
///
/// The final name and the `.part` twin of every unfinished file are dropped,
/// so piece writes never trigger a folder rescan.
#[must_use]
pub fn ignored_payload_paths(save_dir: &str, payloads: &[PayloadFile<'_>]) -> Vec<String> {
    let mut files = Vec::with_capacity(payloads.len().saturating_mul(2));
    for payload in payloads {
        if payload.progress >= payload.len {
            continue;
        }
        if !is_safe_relative_path(&payload.relative_filename.to_string_lossy()) {
            continue;
        }
        let full_path = Path::new(save_dir).join(payload.relative_filename);
        // New downloads write the `.part` twin and older ones the final
        // name; ignoring both keeps piece writes from triggering rescans
        // without a filesystem call.
        files.push(full_path.to_string_lossy().to_string());
        files.push(part_file_path(&full_path).to_string_lossy().to_string());
    }
    files
}

pub fn display_order(names: &[String]) -> Vec<usize> {
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SequentialPlan {
    pub allowed: Vec<usize>,
    pub target: Option<usize>,
}

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
    ensure_free_space_for(path, 0)
}

/// Refuses a download when the volume cannot hold `required_bytes` on top of
/// the fixed floor. Callers pass the selected payload size from the picker.
pub fn ensure_free_space_for(path: &Path, required_bytes: u64) -> Result<()> {
    let free = available_disk_space(path)?;
    let needed = required_bytes.saturating_add(MIN_TORRENT_FREE_SPACE_BYTES);
    if free < needed {
        anyhow::bail!(
            "not enough free disk space: {} available, {} required",
            human_bytes(free),
            human_bytes(needed)
        );
    }
    Ok(())
}

fn human_bytes(bytes: u64) -> String {
    const MB: f64 = 1024.0 * 1024.0;
    const GB: f64 = MB * 1024.0;
    #[allow(clippy::cast_precision_loss)]
    let value = bytes as f64;
    if value >= GB {
        format!("{:.1} GB", value / GB)
    } else {
        format!("{:.0} MB", value / MB)
    }
}

/// The path librqbit writes a file to. Multi-file torrents already carry their
/// root folder in every relative name, so only single-file and flat torrents
/// get the app's own sub-folder.
pub fn final_file_path(
    save_dir: &Path,
    torrent_name: &str,
    has_common_folder: bool,
    file_name: &str,
) -> Option<std::path::PathBuf> {
    if !is_safe_relative_path(file_name) {
        return None;
    }
    if has_common_folder {
        return Some(save_dir.join(file_name));
    }
    if !is_safe_relative_path(torrent_name) {
        return None;
    }
    Some(save_dir.join(torrent_name).join(file_name))
}

pub const FALLBACK_TRACKERS: &[&str] = &[
    "http://bt2.t-ru.org/ann",
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.demonii.com:1337/announce",
    "udp://exodus.desync.com:6969/announce",
    "udp://explodie.org:6969/announce",
    "https://tracker.ducks.party:443/announce",
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
    // Magnets may already carry a fallback in raw or encoded form (either
    // hex case); announcing the same tracker twice only doubles announces.
    let lowered = magnet.to_lowercase();
    for tracker in FALLBACK_TRACKERS {
        if lowered.contains(&tracker.to_lowercase())
            || lowered.contains(&url_encode(tracker).to_lowercase())
        {
            continue;
        }
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

pub fn canonical_tracker_url(raw: &str) -> Option<String> {
    validate_tracker_url(raw).ok()
}

pub fn canonical_or_raw_tracker(raw: &str) -> String {
    canonical_tracker_url(raw).unwrap_or_else(|| raw.trim().to_string())
}

const MAX_PROXY_URL_LEN: usize = 512;

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

pub fn validate_session_config(mut config: SessionConfig) -> Result<SessionConfig, String> {
    config.proxy_url = match config.proxy_url.as_deref() {
        Some(raw) => torrent_proxy_url(raw)?,
        None => None,
    };
    Ok(config)
}

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
        validate_tracker_url, with_fallback_trackers, SequentialPlan, FALLBACK_TRACKERS,
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
    fn fallback_trackers_skip_duplicates_in_any_encoding() {
        let base = "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567";
        let full = with_fallback_trackers(base);
        assert_eq!(full.matches("&tr=").count(), FALLBACK_TRACKERS.len());
        assert_eq!(with_fallback_trackers(&full), full);
        let raw = format!("{base}&tr=udp://tracker.opentrackr.org:1337/announce");
        let deduped = with_fallback_trackers(&raw);
        assert_eq!(deduped.matches("&tr=").count(), FALLBACK_TRACKERS.len());
        assert_eq!(deduped.matches("opentrackr.org").count(), 1);
        let lower = format!("{base}&tr=udp%3a%2f%2ftracker.opentrackr.org%3a1337%2fannounce");
        let deduped_lower = with_fallback_trackers(&lower);
        assert_eq!(
            deduped_lower.matches("&tr=").count(),
            FALLBACK_TRACKERS.len()
        );
        assert_eq!(deduped_lower.matches("opentrackr.org").count(), 1);
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

#[cfg(test)]
mod incomplete_file_tests {
    use super::{
        final_file_path, human_bytes, is_safe_relative_path, part_file_path, resolve_payload_path,
    };
    use std::path::{Path, PathBuf};

    #[test]
    fn payload_paths_resolve_to_the_file_the_engine_uses() {
        let dir = std::env::temp_dir().join(format!("iluha-part-resolve-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create temp dir");
        let final_path = dir.join("Episode 01.mkv");
        let part_path = part_file_path(&final_path);

        assert_eq!(part_path, dir.join("Episode 01.mkv.part"));
        assert_eq!(
            resolve_payload_path(&final_path),
            final_path,
            "without a .part twin the payload is the final name"
        );

        std::fs::write(&part_path, b"partial").expect("write partial");
        assert_eq!(
            resolve_payload_path(&final_path),
            part_path,
            "an existing .part twin wins while the file is incomplete"
        );

        std::fs::write(&final_path, b"complete").expect("write final");
        std::fs::remove_file(&part_path).expect("finalization renames");
        assert_eq!(
            resolve_payload_path(&final_path),
            final_path,
            "after the rename the final name is the payload"
        );

        assert!(
            is_safe_relative_path("Show/Episode 01.mkv.part"),
            "a leftover record may name a .part file"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn free_space_sizes_are_human_readable() {
        assert_eq!(human_bytes(128 * 1024 * 1024), "128 MB");
        assert_eq!(human_bytes(3 * 1024 * 1024 * 1024), "3.0 GB");
        assert_eq!(human_bytes(0), "0 MB");
    }

    #[test]
    fn common_folder_torrents_are_written_under_the_save_dir() {
        assert_eq!(
            final_file_path(
                Path::new("D:/Anime"),
                "Show S01",
                true,
                "Show S01/Episode 01.mkv"
            ),
            Some(PathBuf::from("D:/Anime/Show S01/Episode 01.mkv"))
        );
    }

    #[test]
    fn flat_torrents_get_the_app_owned_sub_folder() {
        assert_eq!(
            final_file_path(
                Path::new("D:/Anime"),
                "Episode 01.mkv",
                false,
                "Episode 01.mkv"
            ),
            Some(PathBuf::from("D:/Anime/Episode 01.mkv/Episode 01.mkv"))
        );
    }

    #[test]
    fn unsafe_names_never_produce_a_path() {
        assert_eq!(
            final_file_path(Path::new("D:/Anime"), "Show", true, "../escape.mkv"),
            None
        );
        assert_eq!(
            final_file_path(Path::new("D:/Anime"), "../escape", false, "file.mkv"),
            None
        );
        assert!(is_safe_relative_path("Show/file.mkv"));
    }
}

#[cfg(test)]
mod offset_tests {
    use super::file_at_offset;

    #[test]
    fn file_at_offset_skips_padding_and_names_the_current_payload() {
        let files = [(0usize, 100u64, false), (1, 50, true), (2, 200, false)];
        assert_eq!(file_at_offset(files, 0), Some(0));
        assert_eq!(file_at_offset(files, 99), Some(0));
        assert_eq!(file_at_offset(files, 100), Some(2));
        assert_eq!(file_at_offset(files, 149), Some(2));
        assert_eq!(file_at_offset(files, 150), Some(2));
        assert_eq!(file_at_offset(files, 299), Some(2));
        assert_eq!(file_at_offset(files, 999), Some(2));
        assert_eq!(file_at_offset(std::iter::empty(), 0), None);
    }
}
