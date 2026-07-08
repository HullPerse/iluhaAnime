use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};
use tokio::io::AsyncBufReadExt;
use tokio::io::AsyncReadExt;
use tokio::process::Command;

const CACHE_DIR: &str = "iluha_audio_cache";
const SUB_CACHE_DIR: &str = "iluha_sub_cache";

/// Global semaphore limiting concurrent ffmpeg processes to 3.
/// Prevents runaway process explosion from parallel track extractions.
pub(crate) static FFMPEG_SEM: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(3);

pub struct CancelFlag(pub Arc<AtomicBool>);

const FONT_MIMES: &[&str] = &[
    "font/ttf",
    "font/otf",
    "font/woff",
    "font/woff2",
    "application/x-truetype-font",
    "application/x-font-ttf",
    "application/x-font-otf",
    "application/vnd.ms-opentype",
];

const FONT_EXTS: &[&str] = &["ttf", "otf", "woff", "woff2"];

#[derive(Debug, Serialize)]
pub struct SubtitleExtractResult {
    pub subtitle: String,
    pub fonts: Vec<String>,
    pub progress_id: u64,
}

#[derive(Debug, Serialize)]
pub struct AudioExtractResult {
    pub path: String,
    pub progress_id: u64,
}

#[derive(Debug, Serialize)]
pub struct VideoChapter {
    pub start_time: f64,
    pub end_time: f64,
    pub title: String,
}

#[derive(Debug, Serialize)]
pub struct VideoInfo {
    pub chapters: Vec<VideoChapter>,
    pub streams: Vec<VideoStreamInfo>,
}

#[derive(Debug, Serialize)]
pub struct VideoStreamInfo {
    pub index: i32,
    pub codec_type: String,
    pub codec_name: String,
    pub language: Option<String>,
    pub title: Option<String>,
    pub is_default: bool,
    pub is_forced: bool,
    pub is_comment: bool,
    pub bit_rate: Option<u64>,
    pub channels: Option<u32>,
    pub sample_rate: Option<u32>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub file_path: Option<String>,
}

pub(crate) fn ffmpeg_bin_dir(app_handle: &tauri::AppHandle) -> std::path::PathBuf {
    let platform = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    };
    app_handle
        .path()
        .app_data_dir()
        .unwrap_or_default()
        .join("bin")
        .join(platform)
}

pub(crate) fn ffprobe_exe(app_handle: &tauri::AppHandle) -> String {
    let ext = if cfg!(target_os = "windows") {
        ".exe"
    } else {
        ""
    };
    let custom = ffmpeg_bin_dir(app_handle).join(format!("ffprobe{ext}"));
    if custom.exists() {
        custom.to_string_lossy().to_string()
    } else {
        format!("ffprobe{ext}")
    }
}

pub(crate) fn ffmpeg_exe(app_handle: &tauri::AppHandle) -> String {
    let ext = if cfg!(target_os = "windows") {
        ".exe"
    } else {
        ""
    };
    let custom = ffmpeg_bin_dir(app_handle).join(format!("ffmpeg{ext}"));
    if custom.exists() {
        custom.to_string_lossy().to_string()
    } else {
        format!("ffmpeg{ext}")
    }
}

pub(crate) static CACHED_FFMPEG_PATH: OnceLock<String> = OnceLock::new();

pub(crate) fn ffmpeg_exe_static() -> &'static str {
    CACHED_FFMPEG_PATH
        .get()
        .map(|s| s.as_str())
        .unwrap_or("ffmpeg")
}

fn extract_attached_fonts(
    app_handle: &tauri::AppHandle,
    video_path: &str,
) -> Vec<String> {
    // Check font cache first
    let cache = sub_cache_dir(app_handle);
    let fkey = font_cache_key(video_path);
    let font_dir = cache.join(&fkey);
    if font_dir.exists() && font_dir.is_dir() {
        let mut cached = Vec::new();
        if let Ok(entries) = std::fs::read_dir(&font_dir) {
            for entry in entries.flatten() {
                cached.push(entry.path().to_string_lossy().to_string());
            }
        }
        if !cached.is_empty() {
            return cached;
        }
    }

    let probe = match std::process::Command::new(ffprobe_exe(app_handle))
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_streams",
            video_path,
        ])
        .output()
    {
        Ok(o) if o.status.success() => o,
        _ => return vec![],
    };

    #[derive(Deserialize)]
    struct ProbeOutput {
        streams: Vec<ProbeStream>,
    }
    #[derive(Deserialize)]
    struct ProbeStream {
        index: i32,
        codec_type: Option<String>,
        codec_name: Option<String>,
        tags: Option<StreamTags>,
    }
    #[derive(Deserialize)]
    struct StreamTags {
        filename: Option<String>,
        mimetype: Option<String>,
    }

    let parsed: ProbeOutput = match serde_json::from_slice(&probe.stdout) {
        Ok(p) => p,
        _ => return vec![],
    };

    let temp_dir = std::env::temp_dir();
    let mut fonts = vec![];

    let _ = std::fs::create_dir_all(&font_dir);

    for stream in &parsed.streams {
        let codec_type = stream.codec_type.as_deref().unwrap_or("");
        if codec_type != "attachment" {
            continue;
        }

        let mimetype = stream
            .tags
            .as_ref()
            .and_then(|t| t.mimetype.as_deref())
            .unwrap_or("");
        let filename = stream
            .tags
            .as_ref()
            .and_then(|t| t.filename.as_deref())
            .unwrap_or("");

        let is_font = FONT_MIMES.iter().any(|m| mimetype.eq_ignore_ascii_case(m))
            || FONT_EXTS
                .iter()
                .any(|e| filename.ends_with(e))
            || stream
                .codec_name
                .as_deref()
                .map_or(false, |c| FONT_EXTS.iter().any(|e| c.eq_ignore_ascii_case(e)));

        if !is_font {
            continue;
        }

        let output_name = if !filename.is_empty() {
            filename.to_string()
        } else {
            format!("font_{}.ttf", stream.index)
        };
        let cached_path = font_dir.join(&output_name);
        if cached_path.exists() {
            fonts.push(cached_path.to_string_lossy().to_string());
            continue;
        }

        let temp_path = temp_dir.join(&output_name);
        let _ = std::fs::remove_file(&temp_path);

        let result = std::process::Command::new(ffmpeg_exe(app_handle))
            .args([
                "-y",
                "-i",
                video_path,
                "-map",
                &format!("0:{}", stream.index),
                "-c",
                "copy",
                "-f",
                "data",
                &temp_path.to_string_lossy(),
            ])
            .output();

        match result {
            Ok(o) if o.status.success() && temp_path.exists() => {
                let _ = std::fs::copy(&temp_path, &cached_path);
                let _ = std::fs::remove_file(&temp_path);
                fonts.push(cached_path.to_string_lossy().to_string());
            }
            _ => {}
        }
    }

    fonts
}

#[tauri::command]
pub async fn extract_video_subtitle(
    app_handle: tauri::AppHandle,
    path: String,
    stream_index: usize,
    codec_name: Option<String>,
    progress_registry: tauri::State<'_, crate::progress::ProgressRegistry>,
) -> Result<SubtitleExtractResult, String> {
    let progress_id = progress_registry.create();
    let is_ass = codec_name.as_deref() == Some("ass") || codec_name.as_deref() == Some("ssa");
    let ext = if is_ass { "ass" } else { "vtt" };
    let cache = sub_cache_dir(&app_handle);
    let key = sub_cache_key(&path, stream_index);
    let cached = cached_path(&cache, &key, ext);

    // Check persistent cache
    if cached.exists() {
        let fonts = extract_attached_fonts(&app_handle, &path);
        progress_registry.update(progress_id, 100.0);
        return Ok(SubtitleExtractResult {
            subtitle: cached.to_string_lossy().to_string(),
            fonts,
            progress_id,
        });
    }

    let expected_size: u64 = if is_ass { 200_000 } else { 50_000 };

    progress_registry.update(progress_id, 0.0);
    let _ = app_handle.emit("extract-progress", ExtractProgress {
        stream_index: stream_index as i32,
        progress: 0.0,
        size: 0,
        expected_size,
    });

    let temp_dir = std::env::temp_dir();
    let output_path = temp_dir.join(format!("iluha_sub_{}.{}", stream_index, ext));
    let _ = std::fs::remove_file(&output_path);

    let mut args = vec![
        "-y".to_string(),
        "-i".to_string(),
        path.clone(),
        "-map".to_string(),
        format!("0:{}", stream_index),
    ];
    if is_ass {
        args.extend_from_slice(&["-c:s".to_string(), "copy".to_string()]);
    } else {
        args.extend_from_slice(&["-c:s".to_string(), "webvtt".to_string()]);
    }
    args.push(output_path.to_string_lossy().to_string());

    let total_duration = get_video_duration(&app_handle, &path).await.unwrap_or(0.0);
    run_ffmpeg_progress(&app_handle, &args, stream_index, total_duration, expected_size, Some(progress_id), Some(&*progress_registry))
        .await
        .map_err(|stderr| format!("ffmpeg subtitle extract failed: {stderr}"))?;

    // Save to cache
    let _ = std::fs::copy(&output_path, &cached);
    let _ = std::fs::remove_file(&output_path);

    progress_registry.update(progress_id, 100.0);
    let _ = app_handle.emit("extract-progress", ExtractProgress {
        stream_index: stream_index as i32,
        progress: 100.0,
        size: expected_size,
        expected_size,
    });

    let fonts = extract_attached_fonts(&app_handle, &path);

    Ok(SubtitleExtractResult {
        subtitle: cached.to_string_lossy().to_string(),
        fonts,
        progress_id,
    })
}

struct AudioExtractConfig {
    ext: &'static str,
    args: Vec<String>,
}

fn audio_extract_config(codec: &str) -> AudioExtractConfig {
    match codec.to_lowercase().as_str() {
        "aac" => AudioExtractConfig {
            ext: "m4a",
            args: vec!["-threads".into(), "0".into(), "-c:a".into(), "copy".into(), "-f".into(), "mp4".into(), "-movflags".into(), "+faststart".into()],
        },
        "mp3" => AudioExtractConfig {
            ext: "mp3",
            args: vec!["-threads".into(), "0".into(), "-c:a".into(), "copy".into(), "-f".into(), "mp3".into()],
        },
        "flac" => AudioExtractConfig {
            ext: "flac",
            args: vec!["-threads".into(), "0".into(), "-c:a".into(), "copy".into(), "-f".into(), "flac".into()],
        },
        "opus" | "vorbis" => AudioExtractConfig {
            ext: "webm",
            args: vec!["-threads".into(), "0".into(), "-c:a".into(), "copy".into(), "-f".into(), "webm".into()],
        },
        "ac3" | "eac3" | "dts" | "truehd" => AudioExtractConfig {
            ext: "m4a",
            args: vec![
                "-threads".into(), "0".into(),
                "-ac".into(), "2".into(),
                "-c:a".into(), "aac".into(), "-b:a".into(), "256k".into(),
                "-f".into(), "mp4".into(),
            ],
        },
        _ => AudioExtractConfig {
            ext: "m4a",
            args: vec![
                "-threads".into(), "0".into(),
                "-ac".into(), "2".into(),
                "-c:a".into(), "aac".into(), "-b:a".into(), "256k".into(),
                "-f".into(), "mp4".into(),
            ],
        },
    }
}

fn try_copy_config(codec: &str) -> Option<AudioExtractConfig> {
    match codec.to_lowercase().as_str() {
        "aac" => Some(AudioExtractConfig {
            ext: "m4a",
            args: vec!["-threads".into(), "0".into(), "-c:a".into(), "copy".into(), "-f".into(), "mp4".into(), "-movflags".into(), "+faststart".into()],
        }),
        "mp3" => Some(AudioExtractConfig {
            ext: "mp3",
            args: vec!["-threads".into(), "0".into(), "-c:a".into(), "copy".into(), "-f".into(), "mp3".into()],
        }),
        "flac" => Some(AudioExtractConfig {
            ext: "flac",
            args: vec!["-threads".into(), "0".into(), "-c:a".into(), "copy".into(), "-f".into(), "flac".into()],
        }),
        "opus" | "vorbis" => Some(AudioExtractConfig {
            ext: "webm",
            args: vec!["-threads".into(), "0".into(), "-c:a".into(), "copy".into(), "-f".into(), "webm".into()],
        }),
        // Try native container for AC3/EAC3/DTS/TrueHD — might work on some platforms
        "ac3" | "eac3" | "dts" | "truehd" => Some(AudioExtractConfig {
            ext: "m4a",
            args: vec!["-threads".into(), "0".into(), "-c:a".into(), "copy".into(), "-f".into(), "mp4".into()],
        }),
        _ => None,
    }
}

fn cache_dir(app_handle: &tauri::AppHandle) -> std::path::PathBuf {
    let dir = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("iluha"))
        .join(CACHE_DIR);
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn sub_cache_dir(app_handle: &tauri::AppHandle) -> std::path::PathBuf {
    let dir = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("iluha"))
        .join(SUB_CACHE_DIR);
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn sub_cache_key(video_path: &str, stream_index: usize) -> String {
    cache_key(video_path, stream_index)
}

fn font_cache_key(video_path: &str) -> String {
    use sha1::{Digest, Sha1};
    let mut hasher = Sha1::new();
    hasher.update(video_path.as_bytes());
    hasher.update(b":fonts");
    hex::encode(hasher.finalize())
}

fn cache_key(video_path: &str, stream_index: usize) -> String {
    use sha1::{Digest, Sha1};
    let mut hasher = Sha1::new();
    hasher.update(video_path.as_bytes());
    hasher.update(b":");
    hasher.update(stream_index.to_string().as_bytes());
    hex::encode(hasher.finalize())
}

fn cached_path(cache_dir: &std::path::Path, key: &str, ext: &str) -> std::path::PathBuf {
    cache_dir.join(format!("{}.{}", key, ext))
}

#[tauri::command]
pub async fn probe_encoders(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    static CACHE: OnceLock<Vec<String>> = OnceLock::new();
    if let Some(cached) = CACHE.get() {
        return Ok(cached.clone());
    }

    let output = std::process::Command::new(ffmpeg_exe(&app_handle))
        .args(["-encoders"])
        .output()
        .map_err(|e| format!("ffmpeg not found: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let available: std::collections::HashSet<String> = stdout
        .lines()
        .filter_map(|line| line.split_whitespace().nth(1))
        .map(|s| s.to_string())
        .collect();

    let priority = ["aac_qsv", "aac_at", "libfdk_aac", "aac", "libopus"];
    let mut sorted: Vec<String> = priority
        .iter()
        .filter(|e| available.contains(&e.to_string()))
        .map(|e| e.to_string())
        .collect();

    if sorted.is_empty() {
        sorted.push("aac".into());
    }

    let _ = CACHE.set(sorted.clone());
    Ok(sorted)
}

#[tauri::command]
pub async fn check_audio_caches(
    app_handle: tauri::AppHandle,
    path: String,
    stream_indices: Vec<usize>,
) -> Result<Vec<bool>, String> {
    let cache = cache_dir(&app_handle);
    let results = stream_indices
        .into_iter()
        .map(|idx| {
            let key = cache_key(&path, idx);
            for ext in &["m4a", "webm", "mp3", "flac"] {
                if cached_path(&cache, &key, ext).exists() {
                    return true;
                }
            }
            false
        })
        .collect();
    Ok(results)
}

#[tauri::command]
pub async fn check_subtitle_caches(
    app_handle: tauri::AppHandle,
    path: String,
    stream_indices: Vec<usize>,
) -> Result<Vec<bool>, String> {
    let cache = sub_cache_dir(&app_handle);
    let results = stream_indices
        .into_iter()
        .map(|idx| {
            let key = sub_cache_key(&path, idx);
            for ext in &["ass", "vtt"] {
                if cached_path(&cache, &key, ext).exists() {
                    return true;
                }
            }
            false
        })
        .collect();
    Ok(results)
}

#[tauri::command]
pub async fn clear_subtitle_cache(
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let dir = sub_cache_dir(&app_handle);
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| format!("clear subtitle cache: {e}"))?;
    }
    Ok(())
}

fn apply_encoder(mut args: Vec<String>, encoder: Option<&str>) -> Vec<String> {
    if let Some(enc) = encoder {
        let lower = enc.to_lowercase();
        for i in 0..args.len() {
            if args[i] == "-c:a" && i + 1 < args.len() {
                args[i + 1] = lower.clone();
                break;
            }
        }
    }
    args
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExtractProgress {
    stream_index: i32,
    progress: f64,
    size: u64,
    expected_size: u64,
}

async fn run_ffmpeg_progress(
    app_handle: &tauri::AppHandle,
    args: &[String],
    stream_index: usize,
    total_duration: f64,
    expected_size: u64,
    progress_id: Option<u64>,
    registry: Option<&crate::progress::ProgressRegistry>,
) -> Result<(), String> {
    // Acquire semaphore permit — limits concurrent ffmpeg processes globally
    let _permit = FFMPEG_SEM
        .acquire()
        .await
        .map_err(|_| "semaphore closed".to_string())?;

    let mut final_args = vec![
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
    ];
    final_args.extend_from_slice(args);

    let mut cmd = tokio::process::Command::new(ffmpeg_exe(app_handle));
    cmd.args(&final_args);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("ffmpeg not found: {e}"))?;

    // Drain stderr concurrently to prevent pipe blocking
    let stderr_handle = child.stderr.take().ok_or("no stderr")?;
    let stderr_task = tokio::spawn(async move {
        let mut buf = String::new();
        tokio::io::BufReader::new(stderr_handle)
            .read_to_string(&mut buf)
            .await
            .unwrap_or_default();
        buf
    });

    let stdout = child.stdout.take().ok_or("no stdout")?;
    let mut reader = tokio::io::BufReader::new(stdout);
    let mut line = String::new();
    let mut last_size: u64 = 0;

    loop {
        line.clear();
        let n = reader
            .read_line(&mut line)
            .await
            .map_err(|e| format!("read ffmpeg output: {e}"))?;
        if n == 0 {
            break;
        }

        let mut emit = false;
        let mut pct = 0.0;

        // Primary: out_time_us (raw microseconds, always parseable)
        if let Some(s) = line.trim().strip_prefix("out_time_us=") {
            if let Some(us) = s.trim().parse::<u64>().ok() {
                let current = us as f64 / 1_000_000.0;
                if total_duration > 0.0 {
                    pct = (current / total_duration * 100.0).min(100.0);
                    emit = true;
                }
            }
        } else if let Some(s) = line.trim().strip_prefix("out_time=") {
            // Fallback: formatted time string
            if let Some(current) = parse_ffmpeg_time(s) {
                if total_duration > 0.0 {
                    pct = (current / total_duration * 100.0).min(100.0);
                    emit = true;
                }
            }
        } else if let Some(s) = line.trim().strip_prefix("size=") {
            last_size = s.trim().parse::<u64>().unwrap_or(0);
            if expected_size > 0 {
                pct = (last_size as f64 / expected_size as f64 * 100.0).min(100.0);
                emit = true;
            }
        }

        if emit {
            // Update the progress registry for polling-based UIs
            if let (Some(pid), Some(reg)) = (progress_id, registry) {
                reg.update(pid, pct);
            }
            // Emit event for real-time UIs (track selector modal)
            let _ = app_handle.emit("extract-progress", ExtractProgress {
                stream_index: stream_index as i32,
                progress: pct,
                size: last_size,
                expected_size,
            });
        }
    }

    let status = child.wait().await.map_err(|e| format!("wait ffmpeg: {e}"))?;
    let stderr = stderr_task.await.unwrap_or_default();

    if !status.success() {
        return Err(stderr);
    }

    Ok(())
}

#[tauri::command]
pub async fn extract_audio_track(
    app_handle: tauri::AppHandle,
    path: String,
    stream_index: usize,
    codec_name: String,
    force_transcode: Option<bool>,
    encoder: Option<String>,
    progress_registry: tauri::State<'_, crate::progress::ProgressRegistry>,
) -> Result<AudioExtractResult, String> {
    let progress_id = progress_registry.create();
    let cache = cache_dir(&app_handle);
    let key = cache_key(&path, stream_index);

    // 1. Check persistent cache
    for ext in &["m4a", "webm", "mp3", "flac"] {
        let cached = cached_path(&cache, &key, ext);
        if cached.exists() {
            progress_registry.update(progress_id, 100.0);
            return Ok(AudioExtractResult {
                path: cached.to_string_lossy().to_string(),
                progress_id,
            });
        }
    }

    // Get total duration for progress tracking
    let total_duration = get_video_duration(&app_handle, &path).await.unwrap_or(0.0);
    let expected_size = probe_expected_audio_size(&app_handle, &path, stream_index).await;

    progress_registry.update(progress_id, 0.0);
    let _ = app_handle.emit("extract-progress", ExtractProgress {
        stream_index: stream_index as i32,
        progress: 0.0,
        size: 0,
        expected_size,
    });

    let temp_dir = std::env::temp_dir();

    // 2. Try native copy (unless force_transcode)
    if !force_transcode.unwrap_or(false) {
        if let Some(cfg) = try_copy_config(&codec_name) {
            let out = temp_dir.join(format!("iluha_audio_{}.{}", stream_index, cfg.ext));
            let _ = std::fs::remove_file(&out);

            let mut args: Vec<String> = vec!["-y".into()];
            args.push("-i".into());
            args.push(path.clone());
            args.push("-map".into());
            args.push(format!("0:{}", stream_index));
            args.extend(cfg.args);
            args.push(out.to_string_lossy().to_string());

            let result = run_ffmpeg_progress(&app_handle, &args, stream_index, total_duration, expected_size, Some(progress_id), Some(&*progress_registry)).await;

            if result.is_ok() {
                // Copy succeeded — save to cache
                progress_registry.update(progress_id, 100.0);
                let _ = app_handle.emit("extract-progress", ExtractProgress {
                    stream_index: stream_index as i32,
                    progress: 100.0,
                    size: expected_size,
                    expected_size,
                });
                let cached = cached_path(&cache, &key, cfg.ext);
                let _ = std::fs::copy(&out, &cached);
                let _ = std::fs::remove_file(&out);
                return Ok(AudioExtractResult {
                    path: cached.to_string_lossy().to_string(),
                    progress_id,
                });
            }
            // Copy failed — fall through to transcode
        }
    }

    // 3. Transcode
    let cfg = audio_extract_config(&codec_name);
    let out = temp_dir.join(format!("iluha_audio_{}.{}", stream_index, cfg.ext));
    let _ = std::fs::remove_file(&out);

    let mut args: Vec<String> = vec!["-y".into()];
    args.push("-i".into());
    args.push(path);
    args.push("-map".into());
    args.push(format!("0:{}", stream_index));
    args.extend(cfg.args);
    args = apply_encoder(args, encoder.as_deref());
    args.push(out.to_string_lossy().to_string());

    run_ffmpeg_progress(&app_handle, &args, stream_index, total_duration, expected_size, Some(progress_id), Some(&*progress_registry))
        .await
        .map_err(|stderr| format!("ffmpeg audio extract failed: {stderr}"))?;

    progress_registry.update(progress_id, 100.0);
    let _ = app_handle.emit("extract-progress", ExtractProgress {
        stream_index: stream_index as i32,
        progress: 100.0,
        size: expected_size,
        expected_size,
    });

    // Save to cache, return cache path
    let cached = cached_path(&cache, &key, cfg.ext);
    let _ = std::fs::copy(&out, &cached);
    let _ = std::fs::remove_file(&out);

    Ok(AudioExtractResult {
        path: cached.to_string_lossy().to_string(),
        progress_id,
    })
}

#[tauri::command]
pub async fn clear_audio_cache(
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let dir = cache_dir(&app_handle);
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| format!("clear cache: {e}"))?;
    }
    Ok(())
}

#[derive(serde::Deserialize, Clone)]
pub struct TrackToExtract {
    pub stream_index: usize,
    pub codec_name: String,
}

#[derive(serde::Serialize)]
pub struct AudioTrackResult {
    pub stream_index: usize,
    pub path: String,
}

#[tauri::command]
pub async fn extract_all_audio_tracks(
    app_handle: tauri::AppHandle,
    path: String,
    tracks: Vec<TrackToExtract>,
) -> Result<Vec<AudioTrackResult>, String> {
    let temp_dir = std::env::temp_dir();

    let mut args = vec!["-y".to_string(), "-threads".to_string(), "0".to_string(), "-i".to_string(), path];
    let mut output_paths = Vec::new();

    for track in &tracks {
        let cfg = audio_extract_config(&track.codec_name);
        let output_path = temp_dir.join(format!("iluha_audio_{}.{}", track.stream_index, cfg.ext));
        let _ = std::fs::remove_file(&output_path);

        args.push("-map".to_string());
        args.push(format!("0:{}", track.stream_index));
        args.extend(cfg.args);
        args.push(output_path.to_string_lossy().to_string());

        output_paths.push(output_path);
    }

    let _permit = FFMPEG_SEM
        .acquire()
        .await
        .map_err(|_| "semaphore closed".to_string())?;
    let output = std::process::Command::new(ffmpeg_exe(&app_handle))
        .args(&args)
        .output()
        .map_err(|e| format!("ffmpeg not found: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg audio extract failed: {stderr}"));
    }

    let results = tracks
        .into_iter()
        .zip(output_paths)
        .map(|(track, path)| AudioTrackResult {
            stream_index: track.stream_index,
            path: path.to_string_lossy().to_string(),
        })
        .collect();
    Ok(results)
}

#[tauri::command]
pub async fn cleanup_audio_temp_files(
    paths: Vec<String>,
) -> Result<(), String> {
    for p in &paths {
        let _ = std::fs::remove_file(p);
    }
    Ok(())
}

#[tauri::command]
pub async fn convert_external_subtitle(
    app_handle: tauri::AppHandle,
    path: String,
    codec_name: Option<String>,
) -> Result<String, String> {
    let is_ass = codec_name.as_deref() == Some("ass")
        || codec_name.as_deref() == Some("ssa")
        || path.ends_with(".ass")
        || path.ends_with(".ssa");
    let ext = if is_ass { "ass" } else { "vtt" };
    let cache = sub_cache_dir(&app_handle);
    use sha1::{Digest, Sha1};
    let mut hasher = Sha1::new();
    hasher.update(path.as_bytes());
    let key = hex::encode(hasher.finalize());
    let cached = cached_path(&cache, &key, ext);

    // Check persistent cache
    if cached.exists() {
        return Ok(cached.to_string_lossy().to_string());
    }

    let temp_dir = std::env::temp_dir();
    let output_path = temp_dir.join(format!("iluha_ext_sub_{}.{}", &key[..8], ext));
    let _ = std::fs::remove_file(&output_path);

    let mut args = vec!["-y".to_string(), "-i".to_string(), path.clone()];
    if is_ass {
        args.extend_from_slice(&["-c:s".to_string(), "copy".to_string()]);
    } else {
        args.extend_from_slice(&["-c:s".to_string(), "webvtt".to_string()]);
    }
    args.push(output_path.to_string_lossy().to_string());

    let _permit = FFMPEG_SEM
        .acquire()
        .await
        .map_err(|_| "semaphore closed".to_string())?;
    let output = std::process::Command::new(ffmpeg_exe(&app_handle))
        .args(&args)
        .output()
        .map_err(|e| format!("ffmpeg not found: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg subtitle convert failed: {stderr}"));
    }

    // Save to cache
    let _ = std::fs::copy(&output_path, &cached);
    let _ = std::fs::remove_file(&output_path);

    Ok(cached.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn get_video_info(
    app_handle: tauri::AppHandle,
    path: String,
) -> Result<VideoInfo, String> {
    let output = std::process::Command::new(ffprobe_exe(&app_handle))
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_chapters",
            "-show_streams",
            &path,
        ])
        .output()
        .map_err(|e| format!("ffprobe not found: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe failed: {stderr}"));
    }

    #[derive(serde::Deserialize)]
    struct FfprobeOutput {
        chapters: Option<Vec<FfprobeChapter>>,
        streams: Vec<FfprobeStream>,
    }

    #[derive(serde::Deserialize)]
    struct FfprobeChapter {
        start_time: Option<String>,
        end_time: Option<String>,
        tags: Option<FfprobeChapterTags>,
    }

    #[derive(serde::Deserialize)]
    struct FfprobeChapterTags {
        title: Option<String>,
    }

    #[derive(serde::Deserialize)]
    struct FfprobeStream {
        index: i32,
        codec_type: String,
        codec_name: Option<String>,
        tags: Option<FfprobeStreamTags>,
        disposition: Option<FfprobeDisposition>,
        bit_rate: Option<String>,
        channels: Option<i32>,
        sample_rate: Option<String>,
        width: Option<i32>,
        height: Option<i32>,
    }

    #[derive(serde::Deserialize)]
    struct FfprobeStreamTags {
        language: Option<String>,
        title: Option<String>,
    }

    #[derive(serde::Deserialize)]
    struct FfprobeDisposition {
        default: Option<i32>,
        forced: Option<i32>,
        comment: Option<i32>,
    }

    let parsed: FfprobeOutput =
        serde_json::from_slice(&output.stdout).map_err(|e| format!("parse ffprobe: {e}"))?;

    let chapters = parsed
        .chapters
        .unwrap_or_default()
        .into_iter()
        .filter_map(|c| {
            let start = c.start_time?.parse::<f64>().ok()?;
            let end = c.end_time?.parse::<f64>().ok()?;
            Some(VideoChapter {
                start_time: start,
                end_time: end,
                title: c.tags.and_then(|t| t.title).unwrap_or_default(),
            })
        })
        .collect();

    let streams: Vec<VideoStreamInfo> = parsed
        .streams
        .into_iter()
        .map(|s| {
            let is_default = s
                .disposition
                .as_ref()
                .and_then(|d| d.default)
                .map(|v| v == 1)
                .unwrap_or(false);
            let is_forced = s
                .disposition
                .as_ref()
                .and_then(|d| d.forced)
                .map(|v| v == 1)
                .unwrap_or(false);
            let is_comment = s
                .disposition
                .as_ref()
                .and_then(|d| d.comment)
                .map(|v| v == 1)
                .unwrap_or(false);
            let bit_rate = s.bit_rate.as_ref().and_then(|b| b.parse::<u64>().ok());
            let channels = s.channels.map(|c| c as u32);
            let sample_rate = s.sample_rate.as_ref().and_then(|r| r.parse::<u32>().ok());
            let width = s.width.map(|w| w as u32);
            let height = s.height.map(|h| h as u32);
            VideoStreamInfo {
                index: s.index,
                codec_type: s.codec_type,
                codec_name: s.codec_name.unwrap_or_default(),
                language: s.tags.as_ref().and_then(|t| t.language.clone()),
                title: s.tags.as_ref().and_then(|t| t.title.clone()),
                is_default,
                is_forced,
                is_comment,
                bit_rate,
                channels,
                sample_rate,
                width,
                height,
                file_path: None,
            }
        })
        .collect();

    Ok(VideoInfo { chapters, streams })
}

#[derive(Clone, Serialize)]
struct UpscaleProgress {
    current: f64,
    total: f64,
    stage: String,
    speed: f64,
}

fn parse_ffmpeg_time(s: &str) -> Option<f64> {
    let parts: Vec<&str> = s.trim().split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    let h: f64 = parts[0].parse().ok()?;
    let m: f64 = parts[1].parse().ok()?;
    let sec: f64 = parts[2].parse().ok()?;
    Some(h * 3600.0 + m * 60.0 + sec)
}

async fn get_video_duration(app_handle: &tauri::AppHandle, path: &str) -> Result<f64, String> {
    let output = Command::new(ffprobe_exe(app_handle))
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "csv=p=0",
            path,
        ])
        .output()
        .await
        .map_err(|e| format!("ffprobe not found: {e}"))?;

    if !output.status.success() {
        return Err("ffprobe failed".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .trim()
        .parse::<f64>()
        .map_err(|_| "parse duration failed".to_string())
}

async fn probe_expected_audio_size(app_handle: &tauri::AppHandle, path: &str, stream_index: usize) -> u64 {
    let output = Command::new(ffprobe_exe(app_handle))
        .args([
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_entries",
            &format!("stream=bit_rate:format=duration"),
            "-select_streams",
            &format!("a:{}", stream_index),
            path,
        ])
        .output()
        .await;
    let output = match output {
        Ok(o) if o.status.success() => o,
        _ => return 0,
    };
    #[derive(Deserialize)]
    struct Probe {
        streams: Vec<StreamInfo>,
        format: FormatInfo,
    }
    #[derive(Deserialize)]
    struct StreamInfo {
        bit_rate: Option<String>,
    }
    #[derive(Deserialize)]
    struct FormatInfo {
        duration: Option<String>,
    }
    let parsed: Probe = match serde_json::from_slice(&output.stdout) {
        Ok(p) => p,
        _ => return 0,
    };
    let bit_rate: u64 = parsed.streams.first()
        .and_then(|s| s.bit_rate.as_ref())
        .and_then(|b| b.parse().ok())
        .unwrap_or(128_000); // fallback to 128kbps
    let duration: f64 = parsed.format.duration
        .as_ref()
        .and_then(|d| d.parse().ok())
        .unwrap_or(0.0);
    if duration <= 0.0 { return 0; }
    (bit_rate as f64 * duration / 8.0) as u64
}

fn build_encoder_args(
    gpu_backend: &str,
    quality: &str,
) -> Vec<String> {
    let (_preset, crf) = match quality {
        "ultrafast" => ("ultrafast", "28"),
        "fast" => ("fast", "23"),
        "slow" => ("slow", "18"),
        _ => ("veryslow", "16"),
    };

    match gpu_backend {
        "nvenc" => {
            let nvenc_preset = match quality {
                "ultrafast" => "p1",
                "fast" => "p4",
                "slow" => "p6",
                _ => "p7",
            };
            vec![
                "-c:v".into(),
                "h264_nvenc".into(),
                "-preset".into(),
                nvenc_preset.into(),
                "-cq".into(),
                crf.into(),
            ]
        }
        "amf" => {
            let amf_quality = match quality {
                "ultrafast" | "fast" => "speed",
                _ => "quality",
            };
            vec![
                "-c:v".into(),
                "h264_amf".into(),
                "-quality".into(),
                amf_quality.into(),
                "-qp_i".into(),
                crf.into(),
                "-qp_p".into(),
                crf.into(),
            ]
        }
        "qsv" => {
            vec![
                "-c:v".into(),
                "h264_qsv".into(),
                "-global_quality".into(),
                crf.into(),
            ]
        }
        _ => {
            let preset = match quality {
                "ultrafast" => "ultrafast",
                "fast" => "fast",
                "slow" => "slow",
                _ => "veryslow",
            };
            vec![
                "-c:v".into(),
                "libx264".into(),
                "-preset".into(),
                preset.into(),
                "-crf".into(),
                crf.into(),
            ]
        }
    }
}

#[tauri::command]
pub async fn upscale_video(
    app_handle: tauri::AppHandle,
    input_path: String,
    output_path: String,
    width: u32,
    height: u32,
    target_fps: Option<u32>,
    interpolate: bool,
    quality: String,
    gpu_backend: String,
    cancel_flag: tauri::State<'_, CancelFlag>,
    progress_registry: tauri::State<'_, crate::progress::ProgressRegistry>,
) -> Result<(String, u64), String> {
    let progress_id = progress_registry.create();
    progress_registry.update(progress_id, 0.0);
    let reg_for_task = (*progress_registry).clone();
    let pid_for_task = progress_id;
    let mut filters = Vec::new();
    if width > 0 && height > 0 {
        filters.push(format!("scale={}:{}:flags=lanczos", width, height));
    }
    if let Some(fps) = target_fps {
        if interpolate {
            filters.push(format!("minterpolate=fps={}", fps));
        } else {
            filters.push(format!("fps={}", fps));
        }
    }
    let vf = if filters.is_empty() {
        String::new()
    } else {
        filters.join(",")
    };

    let encoder_args = build_encoder_args(&gpu_backend, &quality);

    cancel_flag.0.store(false, Ordering::SeqCst);
    let cancel = cancel_flag.0.clone();

        // emit initializing immediately with total=0
    progress_registry.update(progress_id, 0.0);
    let _ = app_handle.emit(
        "upscale-progress",
        UpscaleProgress {
            current: 0.0,
            total: 0.0,
            stage: "initializing".into(),
            speed: 0.0,
        },
    );

    let duration = Arc::new(Mutex::new(0.0f64));

    // spawn ffprobe concurrently
    let app_for_probe = app_handle.clone();
    let dur_for_probe = duration.clone();
    let path_for_probe = input_path.clone();

    let probe = tokio::spawn(async move {
        match get_video_duration(&app_for_probe, &path_for_probe).await {
            Ok(d) => {
                *dur_for_probe.lock().unwrap() = d;
                let _ = app_for_probe.emit(
                    "upscale-progress",
                    UpscaleProgress {
                        current: 0.0,
                        total: d,
                        stage: "initializing".into(),
                        speed: 0.0,
                    },
                );
            }
            Err(_) => {}
        }
    });

    // spawn ffmpeg immediately
    let app_for_ffmpeg = app_handle.clone();
    let dur_for_ffmpeg = duration.clone();
    let out_for_ffmpeg = output_path.clone();

    let encode = tokio::spawn(async move {
        // Acquire semaphore permit for this ffmpeg process
        let _permit = match FFMPEG_SEM.acquire().await {
            Ok(p) => p,
            Err(_) => return Err("semaphore closed".to_string()),
        };

        let mut cmd = Command::new(ffmpeg_exe(&app_for_ffmpeg));
        cmd.arg("-y");

        // GPU decoding via hwaccel auto always helps
        cmd.args(["-hwaccel", "auto"]);

        cmd.arg("-i").arg(&input_path);

        if !vf.is_empty() {
            cmd.arg("-vf").arg(&vf);
        }

        for a in &encoder_args {
            cmd.arg(a);
        }

        cmd.args(["-c:a", "copy"])
            .args(["-progress", "pipe:1", "-nostats"])
            .arg(&out_for_ffmpeg)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| format!("ffmpeg not found: {e}"))?;

        // emit "started" as soon as ffmpeg is running
        let total_at_start = *dur_for_ffmpeg.lock().unwrap();
        reg_for_task.update(pid_for_task, 0.0);
        let _ = app_for_ffmpeg.emit(
            "upscale-progress",
            UpscaleProgress {
                current: 0.0,
                total: total_at_start,
                stage: "started".into(),
                speed: 0.0,
            },
        );

        let stdout = child.stdout.take().ok_or("no stdout")?;
        let reader = tokio::io::BufReader::new(stdout);
        let mut lines = reader.lines();
        let mut speed = 0.0f64;

        while let Some(line) = lines
            .next_line()
            .await
            .map_err(|e| format!("read ffmpeg output: {e}"))?
        {
            if cancel.load(Ordering::SeqCst) {
                let _ = child.kill().await;
                let _ = std::fs::remove_file(&out_for_ffmpeg);
                return Err("Операция отменена".to_string());
            }

            if let Some(time_str) = line.strip_prefix("out_time=") {
                if let Some(current) = parse_ffmpeg_time(time_str) {
                    let total = *dur_for_ffmpeg.lock().unwrap();
                    if total > 0.0 {
                        reg_for_task.update(pid_for_task, (current / total * 100.0).min(100.0));
                    }
                    let _ = app_for_ffmpeg.emit(
                        "upscale-progress",
                        UpscaleProgress {
                            current,
                            total,
                            stage: "encoding".into(),
                            speed,
                        },
                    );
                }
            }

            if let Some(speed_str) = line.strip_prefix("speed=") {
                speed = speed_str.trim_end_matches('x').parse().unwrap_or(0.0);
            }

            if line == "progress=end" {
                break;
            }
        }

        let stderr_handle = child.stderr.take();

        let status = child
            .wait()
            .await
            .map_err(|e| format!("wait ffmpeg: {e}"))?;

        let stderr = match stderr_handle {
            Some(handle) => {
                use tokio::io::AsyncReadExt;
                let mut buf = String::new();
                tokio::io::BufReader::new(handle)
                    .read_to_string(&mut buf)
                    .await
                    .unwrap_or_default();
                buf
            }
            None => String::new(),
        };

        if !status.success() {
            return Err(format!("ffmpeg завершился с ошибкой: {stderr}"));
        }

        let final_total = *dur_for_ffmpeg.lock().unwrap();
        reg_for_task.update(pid_for_task, 100.0);
        let _ = app_for_ffmpeg.emit(
            "upscale-progress",
            UpscaleProgress {
                current: final_total,
                total: final_total,
                stage: "done".into(),
                speed: 0.0,
            },
        );

        Ok((out_for_ffmpeg, pid_for_task))
    });

    let (_, encode_result) = tokio::join!(probe, encode);

    encode_result.map_err(|e| format!("encode task: {e}"))?
}

#[tauri::command]
pub async fn check_gpu_encoders(app_handle: tauri::AppHandle) -> Vec<String> {
    let mut available = vec!["cpu".to_string()];

    let ffmpeg = ffmpeg_exe(&app_handle);
    let output = match std::process::Command::new(&ffmpeg)
        .args(["-hide_banner", "-encoders"])
        .output()
    {
        Ok(o) if o.status.success() => o,
        _ => return available,
    };

    let stdout = String::from_utf8_lossy(&output.stdout);

    if stdout.contains("nvenc") {
        available.push("nvenc".into());
    }
    if stdout.contains("amf") {
        available.push("amf".into());
    }
    if stdout.contains("qsv") {
        available.push("qsv".into());
    }

    available
}

#[tauri::command]
pub async fn cancel_upscale(
    cancel_flag: tauri::State<'_, CancelFlag>,
) -> Result<(), String> {
    cancel_flag.0.store(true, Ordering::SeqCst);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_ffmpeg_time_parses_valid() {
        assert_eq!(parse_ffmpeg_time("01:30:00.000"), Some(5400.0));
        assert_eq!(parse_ffmpeg_time("00:05:30.500"), Some(330.5));
        assert_eq!(parse_ffmpeg_time("00:00:00.000"), Some(0.0));
    }

    #[test]
    fn parse_ffmpeg_time_returns_none_for_invalid() {
        assert_eq!(parse_ffmpeg_time(""), None);
        assert_eq!(parse_ffmpeg_time("not a time"), None);
        assert_eq!(parse_ffmpeg_time("01:00"), None);
        assert_eq!(parse_ffmpeg_time("01:00:00:00"), None);
    }

    #[test]
    fn parse_ffmpeg_time_trims_whitespace() {
        assert_eq!(parse_ffmpeg_time("  00:01:00  "), Some(60.0));
    }

    #[test]
    fn parse_ffmpeg_time_handles_large_values() {
        let result = parse_ffmpeg_time("100:00:00.000");
        assert!(result.is_some());
        assert!((result.unwrap() - 360000.0).abs() < 0.001);
    }
}
