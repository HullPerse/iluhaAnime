use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncReadExt};
use tokio::process::Command;

pub(crate) static FFMPEG_SEM: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(3);

pub struct CancelFlag(pub Arc<AtomicBool>);

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

pub fn ffmpeg_exe(app_handle: &tauri::AppHandle) -> String {
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

static VIDEO_DURATION_CACHE: OnceLock<Mutex<HashMap<String, f64>>> = OnceLock::new();

async fn get_video_duration(app_handle: &tauri::AppHandle, path: &str) -> Result<f64, String> {
    if let Some(cache) = VIDEO_DURATION_CACHE.get() {
        if let Ok(map) = cache.lock() {
            if let Some(&d) = map.get(path) {
                return Ok(d);
            }
        }
    }
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
    let duration = stdout
        .trim()
        .parse::<f64>()
        .map_err(|_| "parse duration failed".to_string())?;

    if let Ok(mut map) = VIDEO_DURATION_CACHE.get_or_init(|| Mutex::new(HashMap::new())).lock() {
        map.insert(path.to_string(), duration);
    }
    Ok(duration)
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

async fn run_ai_tool(
    app_handle: &tauri::AppHandle,
    tool_id: &str,
    frames_dir: &str,
    output_dir: &str,
    scale: u32,
) -> Result<(), String> {
    let tool_path = crate::tools::tool_exec_path(app_handle, tool_id)
        .ok_or_else(|| format!("{tool_id} not installed. Download it in Settings → AI Tools"))?;

    let status = tokio::process::Command::new(&tool_path)
        .arg("-i")
        .arg(frames_dir)
        .arg("-o")
        .arg(output_dir)
        .arg("-s")
        .arg(scale.to_string())
        .arg("-m")
        .arg("realesr-animevideov3")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .await
        .map_err(|e| format!("run {tool_id}: {e}"))?;

    if !status.success() {
        return Err(format!("{tool_id} failed"));
    }
    Ok(())
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
    ai_upscaler: Option<String>,
    _ai_denoise: Option<u32>,
    cancel_flag: tauri::State<'_, CancelFlag>,
    registry: tauri::State<'_, crate::progress::StreamRegistry>,
) -> Result<(String, u64), String> {
    let (progress_id, sender) = registry.create();
    let pid_for_task = progress_id;

    cancel_flag.0.store(false, Ordering::SeqCst);
    let cancel = cancel_flag.0.clone();

    let _ = sender.send(0.0);
    let _ = app_handle.emit(
        "upscale-progress",
        UpscaleProgress {
            current: 0.0,
            total: 0.0,
            stage: "initializing".into(),
            speed: 0.0,
        },
    );

    let duration = get_video_duration(&app_handle, &input_path).await.unwrap_or(0.0);
    let _ = app_handle.emit(
        "upscale-progress",
        UpscaleProgress {
            current: 0.0,
            total: duration,
            stage: "initializing".into(),
            speed: 0.0,
        },
    );

    // AI pipeline: extract keyframes → AI upscale → re-encode
    if let Some(ref ai_tool) = ai_upscaler {
        let temp_dir = std::env::temp_dir().join(format!("iluha_ai_{}", std::process::id()));
        let frames_dir = temp_dir.join("frames");
        let upscaled_dir = temp_dir.join("upscaled");
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&frames_dir).map_err(|e| format!("create frames dir: {e}"))?;
        std::fs::create_dir_all(&upscaled_dir).map_err(|e| format!("create output dir: {e}"))?;

        let _ = sender.send(5.0);
        let _ = app_handle.emit(
            "upscale-progress",
            UpscaleProgress {
                current: 0.0,
                total: duration,
                stage: "extracting_frames".into(),
                speed: 0.0,
            },
        );

        // Step 1: extract keyframes
        let _permit_extract = FFMPEG_SEM.acquire().await.map_err(|_| "semaphore".to_string())?;
        let extract_status = Command::new(ffmpeg_exe(&app_handle))
            .args([
                "-y", "-i", &input_path,
                "-vf", "select='eq(pict_type,I)'",
                "-vsync", "vfr",
                "-frame_pts", "1",
                "-q:v", "2",
            ])
            .arg(frames_dir.join("frame_%08d.jpg").to_string_lossy().to_string())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .await
            .map_err(|e| format!("extract frames: {e}"))?;
        drop(_permit_extract);

        if cancel.load(Ordering::SeqCst) {
            let _ = std::fs::remove_dir_all(&temp_dir);
            return Err("Операция отменена".to_string());
        }

        if !extract_status.success() {
            let _ = std::fs::remove_dir_all(&temp_dir);
            return Err("Failed to extract frames".to_string());
        }

        // Count extracted frames for progress
        let frame_count = std::fs::read_dir(&frames_dir)
            .map(|e| e.flatten().count())
            .unwrap_or(0);
        if frame_count == 0 {
            let _ = std::fs::remove_dir_all(&temp_dir);
            return Err("No keyframes found in video".to_string());
        }

        let _ = sender.send(20.0);
        let _ = app_handle.emit(
            "upscale-progress",
            UpscaleProgress {
                current: 0.0,
                total: frame_count as f64,
                stage: "ai_upscaling".into(),
                speed: 0.0,
            },
        );

        // Step 2: run AI upscaler
        let app_for_ai = app_handle.clone();
        let frames_dir_c = frames_dir.clone();
        let upscaled_dir_c = upscaled_dir.clone();
        let ai_tool_c = ai_tool.clone();
        let scale = if width > 0 && height > 0 {
            let src_w = 1920u32;
            let scale_factor = (width.max(height) as f64 / src_w as f64).max(1.0).round() as u32;
            scale_factor.clamp(2, 4)
        } else {
            2
        };

        let _ = sender.send(25.0);
        run_ai_tool(&app_for_ai, &ai_tool_c, &frames_dir_c.to_string_lossy(), &upscaled_dir_c.to_string_lossy(), scale).await?;

        if cancel.load(Ordering::SeqCst) {
            let _ = std::fs::remove_dir_all(&temp_dir);
            return Err("Операция отменена".to_string());
        }

        let _ = sender.send(80.0);
        let _ = app_handle.emit(
            "upscale-progress",
            UpscaleProgress {
                current: 0.0,
                total: duration,
                stage: "encoding".into(),
                speed: 0.0,
            },
        );

        // Step 3: re-encode with AI upscaled frames
        let _permit_encode = FFMPEG_SEM
            .acquire()
            .await
            .map_err(|_| "semaphore closed".to_string())?;

        let encoder_args = build_encoder_args(&gpu_backend, &quality);

        let mut encode_args = vec![
            "-y".to_string(),
            "-framerate".to_string(),
            target_fps.map(|f| f.to_string()).unwrap_or_else(|| format!("{}", duration.max(1.0))),
            "-i".to_string(),
            upscaled_dir.join("frame_%08d.jpg").to_string_lossy().to_string(),
            "-i".to_string(),
            input_path.clone(),
            "-map".to_string(),
            "0:v".to_string(),
            "-map".to_string(),
            "1:a?".to_string(),
            "-c:a".to_string(),
            "copy".to_string(),
        ];
        encode_args.extend(encoder_args);
        encode_args.push(output_path.clone());

        let encode_cmd = Command::new(ffmpeg_exe(&app_handle))
            .args(&encode_args)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .await
            .map_err(|e| format!("ffmpeg encode: {e}"))?;

        if !encode_cmd.success() {
            let _ = std::fs::remove_dir_all(&temp_dir);
            return Err("Encoding failed".to_string());
        }

        let _ = std::fs::remove_dir_all(&temp_dir);
        let _ = sender.send(100.0);
        let _ = app_handle.emit(
            "upscale-progress",
            UpscaleProgress {
                current: duration,
                total: duration,
                stage: "done".into(),
                speed: 0.0,
            },
        );

        return Ok((output_path, pid_for_task));
    }

    // Standard ffmpeg upscale path
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

    let sender_for_task = sender.clone();
    let _ = sender.send(0.0);
    let _ = app_handle.emit(
        "upscale-progress",
        UpscaleProgress {
            current: 0.0,
            total: duration,
            stage: "encoding".into(),
            speed: 0.0,
        },
    );

    let app_for_ffmpeg = app_handle.clone();
    let out_for_ffmpeg = output_path.clone();

    let encode = tokio::spawn(async move {
        let _permit = match FFMPEG_SEM.acquire().await {
            Ok(p) => p,
            Err(_) => return Err("semaphore closed".to_string()),
        };

        let mut cmd = Command::new(ffmpeg_exe(&app_for_ffmpeg));
        cmd.arg("-y");
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

        let total_at_start = duration;
        let _ = sender_for_task.send(0.0);
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
                    let total = duration;
                    if total > 0.0 {
                        let _ = sender_for_task.send((current / total * 100.0).min(100.0));
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

        let final_total = duration;
        let _ = sender_for_task.send(100.0);
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

    encode.await.map_err(|e| format!("encode task: {e}"))?
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
