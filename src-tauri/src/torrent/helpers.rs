use std::collections::HashSet;
use std::num::NonZeroU32;
use std::path::Path;

use anyhow::{Context, Result};
use librqbit::limits::LimitsConfig;
use librqbit::{torrent_from_bytes, ByteBufOwned, CloneToOwned};
use librqbit_bencode::bencode_serialize_to_writer;

use super::types::TorrentLimits;

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
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

pub fn with_fallback_trackers(magnet: &str) -> String {
    let mut result = magnet.to_string();
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
