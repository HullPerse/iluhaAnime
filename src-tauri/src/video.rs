use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};
use tokio::io::AsyncBufReadExt;
use tokio::process::Command;

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

fn extract_attached_fonts(
    app_handle: &tauri::AppHandle,
    video_path: &str,
) -> Vec<String> {
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
        let output_path = temp_dir.join(&output_name);
        let _ = std::fs::remove_file(&output_path);

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
                &output_path.to_string_lossy(),
            ])
            .output();

        match result {
            Ok(o) if o.status.success() && output_path.exists() => {
                fonts.push(output_path.to_string_lossy().to_string());
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
) -> Result<SubtitleExtractResult, String> {
    let temp_dir = std::env::temp_dir();
    let is_ass = codec_name.as_deref() == Some("ass") || codec_name.as_deref() == Some("ssa");
    let ext = if is_ass { "ass" } else { "vtt" };
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

    let output = std::process::Command::new(ffmpeg_exe(&app_handle))
        .args(&args)
        .output()
        .map_err(|e| format!("ffmpeg not found: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg failed: {stderr}"));
    }

    let fonts = extract_attached_fonts(&app_handle, &path);

    Ok(SubtitleExtractResult {
        subtitle: output_path.to_string_lossy().to_string(),
        fonts,
    })
}

#[tauri::command]
pub async fn remux_video_audio(
    app_handle: tauri::AppHandle,
    path: String,
    stream_index: usize,
    audio_delay_ms: Option<i64>,
) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let output_path = temp_dir.join(format!("iluha_audio_{}.mkv", stream_index));

    let _ = std::fs::remove_file(&output_path);

    let delay = audio_delay_ms.unwrap_or(0);
    let mut args: Vec<String> = vec!["-y".to_string()];

    if delay != 0 {
        let secs = delay as f64 / 1000.0;
        args.push("-i".to_string());
        args.push(path.clone());
        args.push("-itsoffset".to_string());
        args.push(format!("{secs}"));
        args.push("-i".to_string());
        args.push(path.clone());
    } else {
        args.push("-i".to_string());
        args.push(path);
    }
    args.push("-map".to_string());
    args.push("0:v".to_string());
    if delay != 0 {
        args.push("-map".to_string());
        args.push("1:a".to_string());
    } else {
        args.push("-map".to_string());
        args.push(format!("0:{}", stream_index));
    }
    args.push("-c".to_string());
    args.push("copy".to_string());
    args.push("-map_metadata".to_string());
    args.push("0".to_string());
    args.push(output_path.to_string_lossy().to_string());

    let output = std::process::Command::new(ffmpeg_exe(&app_handle))
        .args(&args)
        .output()
        .map_err(|e| format!("ffmpeg not found: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg remux failed: {stderr}"));
    }

    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn remux_with_external_audio(
    app_handle: tauri::AppHandle,
    video_path: String,
    audio_path: String,
    audio_delay_ms: Option<i64>,
) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let output_path = temp_dir.join("iluha_ext_audio.mkv");
    let _ = std::fs::remove_file(&output_path);

    let delay = audio_delay_ms.unwrap_or(0);
    let mut args: Vec<String> = vec![
        "-y".to_string(),
        "-i".to_string(),
        video_path,
    ];
    if delay != 0 {
        let secs = delay as f64 / 1000.0;
        args.push("-itsoffset".to_string());
        args.push(format!("{secs}"));
    }
    args.push("-i".to_string());
    args.push(audio_path);
    args.extend_from_slice(&[
        "-map".to_string(),
        "0:v".to_string(),
        "-map".to_string(),
        "1:a".to_string(),
        "-c".to_string(),
        "copy".to_string(),
        "-map_metadata".to_string(),
        "0".to_string(),
        output_path.to_string_lossy().to_string(),
    ]);

    let output = std::process::Command::new(ffmpeg_exe(&app_handle))
        .args(&args)
        .output()
        .map_err(|e| format!("ffmpeg not found: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg remux failed: {stderr}"));
    }

    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn convert_external_subtitle(
    app_handle: tauri::AppHandle,
    path: String,
    codec_name: Option<String>,
) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let is_ass = codec_name.as_deref() == Some("ass")
        || codec_name.as_deref() == Some("ssa")
        || path.ends_with(".ass")
        || path.ends_with(".ssa");
    let ext = if is_ass { "ass" } else { "vtt" };
    let output_path = temp_dir.join(format!("iluha_ext_sub.{}", ext));
    let _ = std::fs::remove_file(&output_path);

    let mut args = vec!["-y".to_string(), "-i".to_string(), path.clone()];
    if is_ass {
        args.extend_from_slice(&["-c:s".to_string(), "copy".to_string()]);
    } else {
        args.extend_from_slice(&["-c:s".to_string(), "webvtt".to_string()]);
    }
    args.push(output_path.to_string_lossy().to_string());

    let output = std::process::Command::new(ffmpeg_exe(&app_handle))
        .args(&args)
        .output()
        .map_err(|e| format!("ffmpeg not found: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg subtitle convert failed: {stderr}"));
    }

    Ok(output_path.to_string_lossy().to_string())
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
    }

    #[derive(serde::Deserialize)]
    struct FfprobeStreamTags {
        language: Option<String>,
        title: Option<String>,
    }

    #[derive(serde::Deserialize)]
    struct FfprobeDisposition {
        default: Option<i32>,
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

    let mut streams: Vec<VideoStreamInfo> = parsed
        .streams
        .into_iter()
        .map(|s| {
            let is_default = s
                .disposition
                .and_then(|d| d.default)
                .map(|v| v == 1)
                .unwrap_or(false);
            VideoStreamInfo {
                index: s.index,
                codec_type: s.codec_type,
                codec_name: s.codec_name.unwrap_or_default(),
                language: s.tags.as_ref().and_then(|t| t.language.clone()),
                title: s.tags.as_ref().and_then(|t| t.title.clone()),
                is_default,
                file_path: None,
            }
        })
        .collect();

    let video_path = std::path::Path::new(&path);
    if let (Some(parent), Some(stem)) = (video_path.parent(), video_path.file_stem()) {
        let stem = stem.to_string_lossy().to_lowercase();
        let sub_exts = ["ass", "ssa", "srt", "vtt", "sup", "idx", "sub", "pgs"];
        let audio_exts = ["mka", "aac", "mp3", "ac3", "dts", "flac", "opus", "ogg", "wav", "eac3"];

        let mut ext_idx = -1i32;
        let entries = match std::fs::read_dir(parent) {
            Ok(e) => e,
            Err(_) => return Ok(VideoInfo { chapters, streams }),
        };
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_dir() {
                continue;
            }
            let file_stem = match entry_path.file_stem().and_then(|s| s.to_str()) {
                Some(s) => s.to_lowercase(),
                None => continue,
            };
            if file_stem != stem
                && !file_stem.starts_with(&format!("{}.", stem))
                && !file_stem.starts_with(&format!("{} - ", stem))
            {
                continue;
            }
            let ext = match entry_path.extension().and_then(|e| e.to_str()) {
                Some(e) => e.to_lowercase(),
                None => continue,
            };
            let codec_type = if sub_exts.contains(&ext.as_str()) {
                "subtitle"
            } else if audio_exts.contains(&ext.as_str()) {
                "audio"
            } else {
                continue;
            };
            let label = entry_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            streams.push(VideoStreamInfo {
                index: ext_idx,
                codec_type: codec_type.to_string(),
                codec_name: ext,
                language: None,
                title: Some(label),
                is_default: false,
                file_path: Some(entry_path.to_string_lossy().to_string()),
            });
            ext_idx -= 1;
        }
    }

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
) -> Result<String, String> {
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
        let _ = app_for_ffmpeg.emit(
            "upscale-progress",
            UpscaleProgress {
                current: 0.0,
                total: *dur_for_ffmpeg.lock().unwrap(),
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
        let _ = app_for_ffmpeg.emit(
            "upscale-progress",
            UpscaleProgress {
                current: final_total,
                total: final_total,
                stage: "done".into(),
                speed: 0.0,
            },
        );

        Ok(out_for_ffmpeg)
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
