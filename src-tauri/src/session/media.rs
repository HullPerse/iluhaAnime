//! Media identity helpers (P1): SHA-256 hashing and ffprobe duration.

use std::io::Read;
use std::path::Path;

use sha2::Digest;
use tauri::AppHandle;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use crate::session::protocol::{MediaIdentity, VideoInfo};

/// Read chunk size for hashing (1 MiB).
const HASH_CHUNK_BYTES: usize = 1024 * 1024;

/// Hash a file with SHA-256, reading in 1 MiB chunks.
///
/// `cap` (when `Some`) rejects files whose hashed bytes exceed the cap.
/// Returns the lowercase hex digest.
pub fn sha256_file(path: &Path, cap: Option<u64>) -> Result<String, String> {
    let mut file =
        std::fs::File::open(path).map_err(|e| format!("open {}: {e}", path.display()))?;
    let mut hasher = sha2::Sha256::new();
    let mut chunk = vec![0u8; HASH_CHUNK_BYTES];
    let mut total: u64 = 0;
    loop {
        let read = file
            .read(&mut chunk)
            .map_err(|e| format!("read {}: {e}", path.display()))?;
        if read == 0 {
            break;
        }
        total += read as u64;
        if let Some(limit) = cap {
            if total > limit {
                return Err(format!(
                    "{} exceeds the {limit}-byte hash cap",
                    path.display()
                ));
            }
        }
        hasher.update(&chunk[..read]);
    }
    Ok(hex::encode(hasher.finalize()))
}

/// Probing result: duration plus optional video parameters.
pub struct MediaProbe {
    pub duration: f64,
    pub video: Option<VideoInfo>,
}

/// Probe a media file via the bundled ffprobe.
pub fn probe_media(path: &Path, app: &AppHandle) -> Result<MediaProbe, String> {
    let exe = crate::video::ffprobe_exe(app);
    probe_media_with_exe(path, &exe)
}

/// Probe a media file with an explicit ffprobe executable.
///
/// Testable seam: unit tests pass a stub script instead of the real binary.
pub fn probe_media_with_exe(path: &Path, ffprobe: &str) -> Result<MediaProbe, String> {
    let mut cmd = std::process::Command::new(ffprobe);
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000);
    let output = cmd
        .arg("-v")
        .arg("quiet")
        .arg("-print_format")
        .arg("json")
        .arg("-show_format")
        .arg("-show_streams")
        .arg(path)
        .output()
        .map_err(|e| format!("ffprobe spawn failed: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "ffprobe exited with {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    parse_probe_json(&String::from_utf8_lossy(&output.stdout))
}

/// Parse ffprobe JSON output into a duration plus optional video parameters.
pub fn parse_probe_json(text: &str) -> Result<MediaProbe, String> {
    let value: serde_json::Value =
        serde_json::from_str(text).map_err(|e| format!("ffprobe returned invalid JSON: {e}"))?;
    let duration = value
        .get("format")
        .and_then(|format| format.get("duration"))
        .and_then(|duration| match duration {
            serde_json::Value::String(text) => text.parse::<f64>().ok(),
            other => other.as_f64(),
        })
        .ok_or_else(|| "ffprobe returned no duration".to_string())?;
    let video = value
        .get("streams")
        .and_then(|streams| streams.as_array())
        .and_then(|streams| {
            streams
                .iter()
                .find(|s| s.get("codec_type").and_then(|c| c.as_str()) == Some("video"))
        })
        .map(|stream| VideoInfo {
            codec: stream
                .get("codec_name")
                .and_then(|c| c.as_str())
                .unwrap_or_default()
                .to_string(),
            width: stream.get("width").and_then(|w| w.as_u64()).unwrap_or(0) as u32,
            height: stream.get("height").and_then(|h| h.as_u64()).unwrap_or(0) as u32,
            fps: parse_fps(stream.get("r_frame_rate").and_then(|r| r.as_str())),
            bitrate: stream
                .get("bit_rate")
                .and_then(|b| b.as_str())
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(0),
        });
    Ok(MediaProbe { duration, video })
}

/// Parse an ffprobe frame rate such as `30000/1001` into frames per second.
fn parse_fps(raw: Option<&str>) -> f64 {
    let Some(raw) = raw else { return 0.0 };
    if let Some((num, den)) = raw.split_once('/') {
        let num = num.parse::<f64>().unwrap_or(0.0);
        let den = den.parse::<f64>().unwrap_or(0.0);
        return if den == 0.0 { 0.0 } else { num / den };
    }
    raw.parse::<f64>().unwrap_or(0.0)
}

/// Find the exact local copy of `identity` inside `folder` (D5).
///
/// Walks the folder and hashes only files whose byte length equals the
/// identity's size: an exact-hash match must have the same length, so the size
/// prefilter avoids hashing the whole tree. Returns the first exact match.
///
/// A duration-only ("compatible") match is deliberately not returned — the
/// ready gate counts only verified, hash-exact copies, so steering the guest
/// toward the host torrent is the right move when the bytes differ.
pub fn find_folder_match(
    identity: &MediaIdentity,
    folder: &Path,
) -> Result<Option<String>, String> {
    if !folder.is_dir() {
        return Err(format!("not a folder: {}", folder.display()));
    }
    for entry in walkdir::WalkDir::new(folder).follow_links(false) {
        let entry = entry.map_err(|e| format!("walk {}: {e}", folder.display()))?;
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let Ok(metadata) = std::fs::metadata(path) else {
            continue;
        };
        if metadata.len() != identity.size {
            continue;
        }
        if sha256_file(path, None)? == identity.sha256 {
            return Ok(Some(path.to_string_lossy().into_owned()));
        }
    }
    Ok(None)
}

/// Build a media identity: SHA-256, size, and ffprobe duration.
///
/// A probe failure propagates — no fake `0.0` duration is ever used.
pub fn build_identity(
    path: &Path,
    cap: Option<u64>,
    app: &AppHandle,
) -> Result<MediaIdentity, String> {
    let sha256 = sha256_file(path, cap)?;
    let size = std::fs::metadata(path)
        .map_err(|e| format!("stat {}: {e}", path.display()))?
        .len();
    let probe = probe_media(path, app)?;
    Ok(MediaIdentity {
        sha256,
        size,
        duration: probe.duration,
        video: probe.video,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write_temp(name: &str, bytes: &[u8]) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(name);
        let mut file = std::fs::File::create(&path).expect("temp file must be created");
        file.write_all(bytes).expect("temp file must be written");
        path
    }

    fn identity_for(path: &std::path::Path, duration: f64) -> MediaIdentity {
        MediaIdentity {
            sha256: sha256_file(path, None).expect("must hash"),
            size: 3,
            duration,
            video: None,
        }
    }

    #[test]
    fn sha256_of_empty_file_matches_known_digest() {
        let path = write_temp("iluha_session_empty.bin", b"");
        let digest = sha256_file(&path, None).expect("must hash");
        assert_eq!(
            digest,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn sha256_of_abc_matches_known_digest() {
        let path = write_temp("iluha_session_abc.bin", b"abc");
        let digest = sha256_file(&path, None).expect("must hash");
        assert_eq!(
            digest,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn sha256_cap_rejects_after_limit() {
        let path = write_temp("iluha_session_cap.bin", b"abcdef");
        let error = sha256_file(&path, Some(4)).expect_err("must exceed cap");
        assert!(error.contains("hash cap"), "got {error}");
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn parse_probe_json_reads_duration_and_video() {
        let text = r#"{"format":{"duration":"123.5"},"streams":[{"codec_type":"video","codec_name":"h264","width":1920,"height":1080,"r_frame_rate":"24000/1001","bit_rate":"5000000"}]}"#;
        let probe = parse_probe_json(text).expect("must parse");
        assert!(
            (probe.duration - 123.5).abs() < 1e-9,
            "got {}",
            probe.duration
        );
        let video = probe.video.expect("video must be present");
        assert_eq!(video.codec, "h264");
        assert_eq!((video.width, video.height), (1920, 1080));
        assert!(
            (video.fps - 24000.0 / 1001.0).abs() < 1e-9,
            "got {}",
            video.fps
        );
        assert_eq!(video.bitrate, 5_000_000);
    }

    #[test]
    fn parse_probe_json_allows_a_file_without_video() {
        let probe = parse_probe_json(r#"{"format":{"duration":10}}"#).expect("must parse");
        assert!((probe.duration - 10.0).abs() < 1e-9);
        assert!(probe.video.is_none());
    }

    fn unique_suffix() -> u128 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |elapsed| elapsed.as_nanos())
    }

    #[test]
    fn find_folder_match_finds_a_nested_exact_copy() {
        let dir = std::env::temp_dir().join(format!("iluha_session_folder_{}", unique_suffix()));
        let nested = dir.join("Season 01");
        std::fs::create_dir_all(&nested).expect("dir must be created");
        let target = nested.join("episode.bin");
        std::fs::write(&target, b"abc").expect("file must be written");
        let identity = identity_for(&target, 10.0);
        let found = find_folder_match(&identity, &dir).expect("must search");
        assert_eq!(found.as_deref(), Some(target.to_string_lossy().as_ref()));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn find_folder_match_skips_wrong_size_and_content() {
        let dir = std::env::temp_dir().join(format!("iluha_session_nomatch_{}", unique_suffix()));
        std::fs::create_dir_all(&dir).expect("dir must be created");
        // Same size, different bytes: the size prefilter lets it through but the hash rejects it.
        std::fs::write(dir.join("decoy.bin"), b"xyz").expect("file must be written");
        let identity = MediaIdentity {
            sha256: "0".repeat(64),
            size: 3,
            duration: 10.0,
            video: None,
        };
        assert_eq!(
            find_folder_match(&identity, &dir).expect("must search"),
            None
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn find_folder_match_rejects_a_non_folder() {
        let file = write_temp("iluha_session_not_a_folder.bin", b"abc");
        let identity = identity_for(&file, 10.0);
        let error = find_folder_match(&identity, &file).expect_err("must reject a file");
        assert!(error.contains("not a folder"), "got {error}");
        std::fs::remove_file(&file).ok();
    }
}
