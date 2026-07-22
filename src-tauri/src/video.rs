#![allow(
    clippy::too_many_arguments,
    clippy::too_many_lines,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
)]

use serde::Serialize;
use std::collections::HashMap;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncReadExt};
use tokio::process::Command;

pub static FFMPEG_SEM: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(3);

pub struct CancelFlag(pub Arc<AtomicBool>);

pub struct ActiveChildren(pub Arc<Mutex<Vec<u32>>>);

impl Clone for ActiveChildren {
    fn clone(&self) -> Self {
        Self(self.0.clone())
    }
}

impl ActiveChildren {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(Vec::new())))
    }

    pub fn register(&self, pid: u32) {
        if let Ok(mut guard) = self.0.lock() {
            guard.push(pid);
        }
    }

    pub fn unregister(&self, pid: u32) {
        if let Ok(mut guard) = self.0.lock() {
            guard.retain(|&p| p != pid);
        }
    }

    pub fn kill_all(&self) {
        let pids = self.0.lock().map(|g| g.clone()).unwrap_or_default();
        for pid in pids {
            let _ = kill_pid(pid);
        }
    }
}

fn kill_pid(pid: u32) -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
            .output()
            .map_err(|e| format!("taskkill failed: {e}"))?;
    }
    #[cfg(unix)]
    {
        std::process::Command::new("kill")
            .args(["-9", &pid.to_string()])
            .output()
            .map_err(|e| format!("kill failed: {e}"))?;
    }
    Ok(())
}

pub fn ffmpeg_bin_dir(app_handle: &tauri::AppHandle) -> std::path::PathBuf {
    let platform = if cfg!(target_os = "windows") {
        "windows"
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

pub fn ffprobe_exe(app_handle: &tauri::AppHandle) -> String {
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

pub static CACHED_FFMPEG_PATH: OnceLock<String> = OnceLock::new();

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
    Some(m.mul_add(60.0, h * 3600.0) + sec)
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
    let output = {
        let mut c = Command::new(ffprobe_exe(app_handle));
        c.args([
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "csv=p=0",
            path,
        ]);
        #[cfg(windows)]
        c.creation_flags(0x0800_0000);
        c.output()
    }
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

    if let Ok(mut map) = VIDEO_DURATION_CACHE
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
    {
        map.insert(path.to_string(), duration);
    }
    Ok(duration)
}

fn build_encoder_args(gpu_backend: &str, quality: &str) -> Vec<String> {
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

async fn get_video_dimensions(
    app_handle: &tauri::AppHandle,
    path: &str,
) -> Result<(u32, u32), String> {
    let output = {
        let mut c = Command::new(ffprobe_exe(app_handle));
        c.args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "csv=p=0",
            path,
        ]);
        #[cfg(windows)]
        c.creation_flags(0x0800_0000);
        c.output()
    }
    .await
    .map_err(|e| format!("ffprobe not found: {e}"))?;

    if !output.status.success() {
        return Err("ffprobe failed".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let clean = stdout.trim();
    let parts: Vec<&str> = clean.split(',').collect();
    if parts.len() < 2 {
        return Err(format!("parse dimensions failed: {clean:?}"));
    }
    let w: u32 = parts[0]
        .trim()
        .parse()
        .map_err(|_| format!("parse width failed: {:?}", parts[0]))?;
    let h: u32 = parts[1]
        .trim()
        .parse()
        .map_err(|_| format!("parse height failed: {:?}", parts[1]))?;
    Ok((w, h))
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
    selected_shaders: Option<Vec<String>>,
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

    let duration = get_video_duration(&app_handle, &input_path)
        .await
        .unwrap_or(0.0);
    let _ = app_handle.emit(
        "upscale-progress",
        UpscaleProgress {
            current: 0.0,
            total: duration,
            stage: "initializing".into(),
            speed: 0.0,
        },
    );

    if ai_upscaler.is_some() {
        let (target_w, target_h) = if width > 0 && height > 0 {
            (width, height)
        } else {
            match get_video_dimensions(&app_handle, &input_path).await {
                Ok((iw, ih)) => (iw * 2, ih * 2),
                Err(_) => (0, 0),
            }
        };

        let selected = selected_shaders.unwrap_or_else(crate::shaders::default_selection);
        let shader_chain = crate::shaders::build_shader_chain(&selected)?;

        let shader_dir = crate::shaders::shader_dir(&app_handle)
            .ok_or_else(|| "Anime4K шейдеры не найдены. Переустановите приложение.".to_string())?;

        for filename in &shader_chain {
            if !shader_dir.join(filename).exists() {
                return Err(format!("Anime4K шейдер не найден: {filename}"));
            }
        }

        let mut vf_parts: Vec<String> = Vec::new();

        for (i, filename) in shader_chain.iter().enumerate() {
            let is_last = i == shader_chain.len() - 1;
            let has_target = target_w > 0 && target_h > 0;

            if is_last && has_target {
                vf_parts.push(format!(
                    "libplacebo=custom_shader_path={filename}:w={target_w}:h={target_h}"
                ));
            } else {
                vf_parts.push(format!("libplacebo=custom_shader_path={filename}"));
            }
        }

        vf_parts.push("format=yuv420p".to_string());
        let mut vf = vf_parts.join(",");

        if let Some(fps) = target_fps {
            if interpolate {
                vf = format!("minterpolate=fps={fps},{vf}");
            } else {
                vf = format!("fps={fps},{vf}");
            }
        }

        let mut args = vec![
            "-y".to_string(),
            "-init_hw_device".to_string(),
            "vulkan".to_string(),
            "-i".to_string(),
            input_path.clone(),
            "-vf".to_string(),
            vf,
            "-c:a".to_string(),
            "copy".to_string(),
            "-c:s".to_string(),
            "copy".to_string(),
        ];
        args.extend(build_encoder_args(&gpu_backend, &quality));
        args.push("-progress".to_string());
        args.push("pipe:1".to_string());
        args.push("-nostats".to_string());
        args.push(output_path.clone());

        let permit_encode = FFMPEG_SEM
            .acquire()
            .await
            .map_err(|_| "semaphore closed".to_string())?;

        let mut child = {
            let mut c = Command::new(ffmpeg_exe(&app_handle));
            c.args(&args)
                .current_dir(&shader_dir)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped());
            #[cfg(windows)]
            c.creation_flags(0x0800_0000);
            c.spawn().map_err(|e| format!("ffmpeg anime4k: {e}"))?
        };
        let child_pid = child.id().ok_or("no child pid")?;
        let children = app_handle.state::<ActiveChildren>();
        children.register(child_pid);
        drop(permit_encode);

        let child_stdout = child.stdout.take().ok_or("no stdout")?;
        let child_stderr = child.stderr.take();

        let reader = tokio::io::BufReader::new(child_stdout);
        let mut lines = reader.lines();
        let mut speed = 0.0f64;

        while let Some(line) = lines
            .next_line()
            .await
            .map_err(|e| format!("read progress: {e}"))?
        {
            if cancel.load(Ordering::SeqCst) {
                children.unregister(child_pid);
                let _ = child.kill().await;
                let _ = std::fs::remove_file(&output_path);
                return Err("Операция отменена".to_string());
            }

            if let Some(time_str) = line.strip_prefix("out_time=") {
                if let Some(current) = parse_ffmpeg_time(time_str) {
                    let _ = sender.send((current / duration * 100.0).min(100.0));
                    let _ = app_handle.emit(
                        "upscale-progress",
                        UpscaleProgress {
                            current,
                            total: duration,
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

        let status = child
            .wait()
            .await
            .map_err(|e| format!("wait ffmpeg: {e}"))?;

        let stderr = match child_stderr {
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

        if cancel.load(Ordering::SeqCst) {
            children.unregister(child_pid);
            let _ = std::fs::remove_file(&output_path);
            return Err("Операция отменена".to_string());
        }

        if !status.success() {
            children.unregister(child_pid);
            let cmd_line = format!("ffmpeg {}", args.join(" "));
            return Err(format!(
                "Anime4K encoding failed:\n{stderr}\n\nffmpeg command:\n{cmd_line}"
            ));
        }

        children.unregister(child_pid);

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

    let mut filters = Vec::new();
    if width > 0 && height > 0 {
        filters.push(format!("scale={width}:{height}:flags=lanczos"));
    }
    if let Some(fps) = target_fps {
        if interpolate {
            filters.push(format!("minterpolate=fps={fps}"));
        } else {
            filters.push(format!("fps={fps}"));
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
        let Ok(_permit) = FFMPEG_SEM.acquire().await else {
            return Err("semaphore closed".to_string());
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
        #[cfg(windows)]
        cmd.creation_flags(0x0800_0000);

        let mut child = cmd.spawn().map_err(|e| format!("ffmpeg not found: {e}"))?;
        let child_pid = child.id().ok_or("no child pid")?;
        let children = app_for_ffmpeg.state::<ActiveChildren>();
        children.register(child_pid);

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
                children.unregister(child_pid);
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
            children.unregister(child_pid);
            return Err(format!("ffmpeg завершился с ошибкой: {stderr}"));
        }

        children.unregister(child_pid);

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
    let res = {
        let mut c = std::process::Command::new(&ffmpeg);
        c.args(["-hide_banner", "-encoders"]);
        #[cfg(windows)]
        c.creation_flags(0x0800_0000);
        c.output()
    };
    let output = match res {
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
pub async fn convert_video(
    app_handle: tauri::AppHandle,
    input_path: String,
    output_path: String,
    target_format: String,
    copy_streams: bool,
    cancel_flag: tauri::State<'_, CancelFlag>,
) -> Result<(String, u64), String> {
    cancel_flag.0.store(false, Ordering::SeqCst);
    let cancel = cancel_flag.0.clone();

    let _ = app_handle.emit(
        "upscale-progress",
        UpscaleProgress {
            current: 0.0,
            total: 100.0,
            stage: "initializing".into(),
            speed: 0.0,
        },
    );

    let duration = get_video_duration(&app_handle, &input_path)
        .await
        .unwrap_or(0.0);
    let _ = app_handle.emit(
        "upscale-progress",
        UpscaleProgress {
            current: 0.0,
            total: duration,
            stage: "encoding".into(),
            speed: 0.0,
        },
    );

    let _permit = FFMPEG_SEM
        .acquire()
        .await
        .map_err(|_| "semaphore closed".to_string())?;

    let mut cmd = Command::new(ffmpeg_exe(&app_handle));
    cmd.arg("-y").arg("-i").arg(&input_path);

    if copy_streams {
        cmd.args(["-c", "copy"]);
    } else {
        match target_format.as_str() {
            "webm" => {
                cmd.args(["-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0"]);
                cmd.args(["-c:a", "libopus"]);
            }
            "avi" => {
                cmd.args(["-c:v", "mpeg4", "-q:v", "5"]);
                cmd.args(["-c:a", "mp3", "-b:a", "192k"]);
            }
            "ts" => {
                cmd.args(["-c:v", "mpeg2video", "-q:v", "5"]);
                cmd.args(["-c:a", "mp2"]);
            }
            _ => {
                cmd.args(["-c:v", "libx264", "-preset", "fast", "-crf", "23"]);
                cmd.args(["-c:a", "aac", "-b:a", "128k"]);
            }
        }
    }

    cmd.arg(&output_path)
        .args(["-progress", "pipe:1", "-nostats"])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000);

    let mut child = cmd.spawn().map_err(|e| format!("ffmpeg convert: {e}"))?;
    let child_pid = child.id().ok_or("no child pid")?;
    let children = app_handle.state::<ActiveChildren>();
    children.register(child_pid);

    let stdout = child.stdout.take().ok_or("no stdout")?;
    let reader = tokio::io::BufReader::new(stdout);
    let mut lines = reader.lines();
    let mut speed = 0.0f64;

    while let Some(line) = lines
        .next_line()
        .await
        .map_err(|e| format!("read progress: {e}"))?
    {
        if cancel.load(Ordering::SeqCst) {
            children.unregister(child_pid);
            let _ = child.kill().await;
            let _ = std::fs::remove_file(&output_path);
            return Err("Операция отменена".to_string());
        }

        if let Some(time_str) = line.strip_prefix("out_time=") {
            if let Some(current) = parse_ffmpeg_time(time_str) {
                let _ = app_handle.emit(
                    "upscale-progress",
                    UpscaleProgress {
                        current,
                        total: duration,
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

    let status = child
        .wait()
        .await
        .map_err(|e| format!("wait ffmpeg: {e}"))?;

    if !status.success() {
        children.unregister(child_pid);
        return Err("Конвертация не удалась".to_string());
    }

    children.unregister(child_pid);

    let _ = app_handle.emit(
        "upscale-progress",
        UpscaleProgress {
            current: duration,
            total: duration,
            stage: "done".into(),
            speed: 0.0,
        },
    );

    Ok((output_path, 0))
}

#[tauri::command]
pub async fn cancel_upscale(cancel_flag: tauri::State<'_, CancelFlag>) -> Result<(), String> {
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
