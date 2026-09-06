#![allow(
    clippy::too_many_arguments,
    clippy::too_many_lines,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    clippy::cast_precision_loss
)]

use base64::Engine as _;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncReadExt};
use tokio::process::Command;
use tokio_util::sync::CancellationToken;

pub static FFMPEG_SEM: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(3);

struct CancellationState {
    next_id: AtomicU64,
    tokens: Mutex<HashMap<u64, CancellationToken>>,
}

#[derive(Clone)]
pub struct CancelFlag(Arc<CancellationState>);

impl CancelFlag {
    pub fn new() -> Self {
        Self(Arc::new(CancellationState {
            next_id: AtomicU64::new(1),
            tokens: Mutex::new(HashMap::new()),
        }))
    }

    pub fn begin(&self) -> CancellationGuard {
        let id = self.0.next_id.fetch_add(1, Ordering::Relaxed);
        let token = CancellationToken::new();
        self.0
            .tokens
            .lock()
            .expect("cancel state poisoned")
            .insert(id, token.clone());
        CancellationGuard {
            id,
            token,
            state: self.0.clone(),
        }
    }

    pub fn cancel(&self) {
        if let Ok(tokens) = self.0.tokens.lock() {
            for token in tokens.values() {
                token.cancel();
            }
        }
    }
}

pub struct CancellationGuard {
    id: u64,
    token: CancellationToken,
    state: Arc<CancellationState>,
}

impl CancellationGuard {
    pub fn is_cancelled(&self) -> bool {
        self.token.is_cancelled()
    }
}

impl Drop for CancellationGuard {
    fn drop(&mut self) {
        if let Ok(mut tokens) = self.state.tokens.lock() {
            tokens.remove(&self.id);
        }
    }
}

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
        let pids = self
            .0
            .lock()
            .map(|mut guard| std::mem::take(&mut *guard))
            .unwrap_or_default();
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

fn encoder_pix_fmt(codec: &str) -> &'static str {
    if codec == "hevc10" {
        "yuv420p10le"
    } else {
        "yuv420p"
    }
}

fn build_encoder_args(gpu_backend: &str, quality: &str, codec: &str) -> Vec<String> {
    let (_preset, crf) = match quality {
        "ultrafast" => ("ultrafast", "28"),
        "fast" => ("fast", "23"),
        "slow" => ("slow", "18"),
        _ => ("veryslow", "16"),
    };
    let hevc = codec == "hevc" || codec == "hevc10";
    let pix_10bit = (codec == "hevc10").then_some("p010le");

    match gpu_backend {
        "nvenc" => {
            let nvenc_preset = match quality {
                "ultrafast" => "p1",
                "fast" => "p4",
                "slow" => "p6",
                _ => "p7",
            };
            let mut args = vec![
                "-c:v".to_string(),
                (if hevc { "hevc_nvenc" } else { "h264_nvenc" }).to_string(),
                "-preset".to_string(),
                nvenc_preset.to_string(),
                "-cq".to_string(),
                crf.to_string(),
            ];
            if let Some(pix) = pix_10bit {
                args.push("-pix_fmt".to_string());
                args.push(pix.to_string());
            }
            args
        }
        "amf" => {
            let amf_quality = match quality {
                "ultrafast" | "fast" => "speed",
                _ => "quality",
            };
            let mut args = vec![
                "-c:v".to_string(),
                (if hevc { "hevc_amf" } else { "h264_amf" }).to_string(),
                "-quality".to_string(),
                amf_quality.to_string(),
                "-qp_i".to_string(),
                crf.to_string(),
                "-qp_p".to_string(),
                crf.to_string(),
            ];
            if let Some(pix) = pix_10bit {
                args.push("-pix_fmt".to_string());
                args.push(pix.to_string());
            }
            args
        }
        "qsv" => {
            let mut args = vec![
                "-c:v".to_string(),
                (if hevc { "hevc_qsv" } else { "h264_qsv" }).to_string(),
                "-global_quality".to_string(),
                crf.to_string(),
            ];
            if let Some(pix) = pix_10bit {
                args.push("-pix_fmt".to_string());
                args.push(pix.to_string());
            }
            args
        }
        _ => {
            let preset = match quality {
                "ultrafast" => "ultrafast",
                "fast" => "fast",
                "slow" => "slow",
                _ => "veryslow",
            };
            vec![
                "-c:v".to_string(),
                (if hevc { "libx265" } else { "libx264" }).to_string(),
                "-preset".to_string(),
                preset.to_string(),
                "-crf".to_string(),
                crf.to_string(),
            ]
        }
    }
}

async fn validate_input_file(app_handle: &tauri::AppHandle, path: &str) -> Result<f64, String> {
    let meta = std::fs::metadata(path).map_err(|_| {
        "Файл не найден. Возможно, он был удалён, перемещён или ещё не докачан.".to_string()
    })?;
    if !meta.is_file() {
        return Err("Указанный путь не является файлом.".to_string());
    }
    if meta.len() == 0 {
        return Err("Файл пуст (0 байт). Возможно, загрузка не завершена.".to_string());
    }
    get_video_duration(app_handle, path).await.map_err(|e| {
        if e.contains("ffprobe not found") {
            format!("ffprobe не найден: {e}")
        } else {
            "Файл не является валидным видео. Возможно, загрузка не завершена или файл повреждён."
                .to_string()
        }
    })
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

async fn resolve_upscale_target(
    app_handle: &tauri::AppHandle,
    input_path: &str,
    width: u32,
    height: u32,
) -> Result<(u32, u32, u32, u32), String> {
    if width > 0 && height > 0 {
        let (iw, ih) = get_video_dimensions(app_handle, input_path)
            .await
            .unwrap_or((0, 0));
        Ok((width, height, iw, ih))
    } else {
        let (iw, ih) = get_video_dimensions(app_handle, input_path)
            .await
            .map_err(|_| {
                "Не удалось определить размер видео. Файл повреждён или ещё не докачан.".to_string()
            })?;
        Ok((iw * 2, ih * 2, iw, ih))
    }
}
fn build_anime4k_filter(
    shader_chain: &[String],
    target_w: u32,
    target_h: u32,
    input_w: u32,
    input_h: u32,
    temporal_denoise: bool,
) -> String {
    let mut chain: Vec<String> = shader_chain.to_vec();
    let ratio = if input_w > 0 && input_h > 0 {
        (f64::from(target_w) / f64::from(input_w)).max(f64::from(target_h) / f64::from(input_h))
    } else {
        0.0
    };
    let cascade = ratio > 2.05
        && chain
            .iter()
            .any(|f| crate::shaders::is_upscale_file(f) && f.contains("_x2"));
    if cascade {
        if let Some(pos) = chain
            .iter()
            .position(|f| crate::shaders::is_upscale_file(f))
        {
            let dup = chain[pos].clone();
            chain.insert(pos + 1, dup);
        }
    }
    let target_pos = if cascade {
        chain
            .iter()
            .rposition(|f| crate::shaders::is_upscale_file(f))
    } else {
        chain.len().checked_sub(1)
    };
    let has_target = target_w > 0 && target_h > 0;
    let chain_vf = chain
        .iter()
        .enumerate()
        .map(|(i, filename)| {
            if Some(i) == target_pos && has_target {
                format!(
                    "libplacebo=custom_shader_path={filename}:w={target_w}:h={target_h}:deband=true"
                )
            } else {
                format!("libplacebo=custom_shader_path={filename}")
            }
        })
        .collect::<Vec<_>>()
        .join(",");
    if temporal_denoise {
        format!("atadenoise,{chain_vf}")
    } else {
        chain_vf
    }
}

#[derive(Clone, Serialize)]
pub struct PreviewFrame {
    pub timestamp: f64,
    pub before: String,
    pub after: String,
}

fn preview_timestamps(duration: f64, count: usize) -> Vec<f64> {
    if count == 0 || duration <= 0.0 {
        return Vec::new();
    }
    let n = count as f64;
    (0..count)
        .map(|i| duration * (0.05 + 0.9 * (i as f64 + 0.5) / n))
        .collect()
}

async fn extract_preview_frame(
    app_handle: &tauri::AppHandle,
    input_path: &str,
    timestamp: f64,
    vf: &str,
    out_path: &std::path::Path,
) -> Result<(), String> {
    let mut c = Command::new(ffmpeg_exe(app_handle));
    c.args(["-y", "-ss", &timestamp.to_string()]);
    c.arg("-i").arg(input_path);
    c.args(["-vf", vf, "-frames:v", "1"]);
    c.arg(out_path);
    #[cfg(windows)]
    c.creation_flags(0x0800_0000);
    let output = c
        .output()
        .await
        .map_err(|e| format!("preview ffmpeg: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let tail: String = stderr
            .chars()
            .rev()
            .take(1500)
            .collect::<String>()
            .chars()
            .rev()
            .collect();
        return Err(format!("preview failed: {tail}"));
    }
    Ok(())
}

#[tauri::command]
pub async fn preview_upscale_frames(
    app_handle: tauri::AppHandle,
    input_path: String,
    width: u32,
    height: u32,
    selected_shaders: Option<Vec<String>>,
    temporal_denoise: Option<bool>,
) -> Result<Vec<PreviewFrame>, String> {
    const COUNT: usize = 5;
    const TRANSPORT_W: u32 = 960;
    let duration = validate_input_file(&app_handle, &input_path).await?;
    let (target_w, target_h, input_w, input_h) =
        resolve_upscale_target(&app_handle, &input_path, width, height).await?;
    if target_w == 0 || target_h == 0 {
        return Err("Не удалось определить целевой размер.".to_string());
    }
    let selected = selected_shaders.unwrap_or_else(crate::shaders::default_selection);
    let shader_chain = crate::shaders::build_shader_chain(&selected)?;
    let shader_dir = crate::shaders::shader_dir(&app_handle)
        .ok_or_else(|| "Anime4K шейдеры не найдены. Переустановите приложение.".to_string())?;
    for filename in &shader_chain {
        if !shader_dir.join(filename).exists() {
            return Err(format!("Anime4K шейдер не найден: {filename}"));
        }
    }
    let temporal_denoise = temporal_denoise.unwrap_or(false);
    let chain_vf = build_anime4k_filter(
        &shader_chain,
        target_w,
        target_h,
        input_w,
        input_h,
        temporal_denoise,
    );
    let transport = if target_w > TRANSPORT_W {
        format!(",scale={TRANSPORT_W}:-2")
    } else {
        String::new()
    };
    let before_vf = format!("scale={target_w}:{target_h}:flags=lanczos{transport},format=yuv420p");
    let after_vf = format!("{chain_vf}{transport},format=yuv420p");
    let _permit = FFMPEG_SEM
        .acquire()
        .await
        .map_err(|_| "semaphore closed".to_string())?;
    let dir = std::env::temp_dir().join(format!(
        "iluha-preview-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| d.as_millis())
    ));
    std::fs::create_dir_all(&dir).map_err(|e| format!("preview temp: {e}"))?;
    let cleanup_dir = || {
        let _ = std::fs::remove_dir_all(&dir);
    };
    let stamps = preview_timestamps(duration, COUNT);
    for (idx, stamp) in stamps.iter().enumerate() {
        let still = dir.join(format!("still_{}.png", idx + 1));
        if let Err(e) =
            extract_preview_frame(&app_handle, &input_path, *stamp, "null", &still).await
        {
            cleanup_dir();
            return Err(e);
        }
    }
    let mut fc_parts = Vec::new();
    for idx in 0..COUNT {
        fc_parts.push(format!(
            "[{idx}:v]{before_vf}[b{idx}];[{idx}:v]{after_vf}[a{idx}]"
        ));
    }
    let mut c = Command::new(ffmpeg_exe(&app_handle));
    c.args(["-y", "-init_hw_device", "vulkan"]);
    for idx in 0..COUNT {
        c.arg("-i").arg(dir.join(format!("still_{}.png", idx + 1)));
    }
    c.arg("-filter_complex").arg(fc_parts.join(";"));
    for idx in 0..COUNT {
        c.arg("-map")
            .arg(format!("[b{idx}]"))
            .arg(dir.join(format!("before_{}.png", idx + 1)));
        c.arg("-map")
            .arg(format!("[a{idx}]"))
            .arg(dir.join(format!("after_{}.png", idx + 1)));
    }
    #[cfg(windows)]
    c.creation_flags(0x0800_0000);
    let output = c
        .current_dir(&shader_dir)
        .output()
        .await
        .map_err(|e| format!("preview ffmpeg: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let tail: String = stderr
            .chars()
            .rev()
            .take(1500)
            .collect::<String>()
            .chars()
            .rev()
            .collect();
        cleanup_dir();
        return Err(format!("preview failed: {tail}"));
    }
    let mut frames = Vec::new();
    for (idx, stamp) in stamps.iter().enumerate() {
        let before_path = dir.join(format!("before_{}.png", idx + 1));
        let after_path = dir.join(format!("after_{}.png", idx + 1));
        let before_bytes = std::fs::read(&before_path).map_err(|e| format!("preview read: {e}"))?;
        let after_bytes = std::fs::read(&after_path).map_err(|e| format!("preview read: {e}"))?;
        frames.push(PreviewFrame {
            timestamp: *stamp,
            before: format!(
                "data:image/png;base64,{}",
                base64::engine::general_purpose::STANDARD.encode(before_bytes)
            ),
            after: format!(
                "data:image/png;base64,{}",
                base64::engine::general_purpose::STANDARD.encode(after_bytes)
            ),
        });
    }
    cleanup_dir();
    if frames.is_empty() {
        return Err("Не удалось извлечь кадры.".to_string());
    }
    Ok(frames)
}

#[derive(Clone, Serialize)]
pub struct UpscaleSuggestion {
    pub preset: String,
    pub reason: String,
    pub noisy: bool,
    pub entropy: f64,
}

const NOISY_ENTROPY_THRESHOLD: f64 = 0.90;

const fn suggest_preset_for(_width: u32, height: u32, noisy: bool) -> (&'static str, &'static str) {
    if height == 0 {
        ("balanced", "unknown")
    } else if height <= 480 {
        ("denoise", "lowres")
    } else if height <= 720 {
        if noisy {
            ("denoise", "noisy")
        } else {
            ("clean", "medium")
        }
    } else if noisy {
        ("balanced", "noisy")
    } else {
        ("lightning", "clean")
    }
}

async fn sample_entropy(
    app_handle: &tauri::AppHandle,
    input_path: &str,
    start: f64,
) -> Result<(f64, u32), String> {
    let mut c = Command::new(ffmpeg_exe(app_handle));
    c.args([
        "-y",
        "-ss",
        &start.max(0.0).to_string(),
        "-i",
        input_path,
        "-frames:v",
        "20",
        "-vf",
        "entropy,metadata=print",
        "-f",
        "null",
        "-",
    ]);
    #[cfg(windows)]
    c.creation_flags(0x0800_0000);
    let output = c
        .output()
        .await
        .map_err(|e| format!("ffmpeg entropy: {e}"))?;
    if !output.status.success() {
        return Err("entropy probe failed".to_string());
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    let mut sum = 0.0f64;
    let mut count = 0u32;
    for line in stderr.lines() {
        if let Some(pos) = line.find("normalized_entropy.normal.Y=") {
            if let Ok(v) = line[pos + 28..].trim().parse::<f64>() {
                sum += v;
                count += 1;
            }
        }
    }
    Ok((sum, count))
}

async fn measure_entropy(
    app_handle: &tauri::AppHandle,
    input_path: &str,
    duration: f64,
) -> Result<f64, String> {
    let mut sum = 0.0f64;
    let mut count = 0u32;
    for frac in [0.1, 0.5, 0.9] {
        let (s, c) = sample_entropy(app_handle, input_path, duration * frac).await?;
        sum += s;
        count += c;
    }
    if count == 0 {
        return Err("entropy parse failed".to_string());
    }
    Ok(sum / f64::from(count))
}

#[tauri::command]
pub async fn suggest_upscale_preset(
    app_handle: tauri::AppHandle,
    input_path: String,
) -> Result<UpscaleSuggestion, String> {
    let duration = validate_input_file(&app_handle, &input_path).await?;
    let (width, height) = get_video_dimensions(&app_handle, &input_path).await?;
    let entropy = measure_entropy(&app_handle, &input_path, duration).await?;
    let noisy = entropy >= NOISY_ENTROPY_THRESHOLD;
    let (preset, reason) = suggest_preset_for(width, height, noisy);
    Ok(UpscaleSuggestion {
        preset: preset.to_string(),
        reason: reason.to_string(),
        noisy,
        entropy,
    })
}

#[derive(Clone, Serialize)]
pub struct UpscaleEstimate {
    pub seconds: f64,
    pub out_frames: u64,
    pub out_width: u32,
    pub out_height: u32,
}

const SHADER_BASE_MPXS: f64 = 1057.0;
const REALCUGAN_MPXS: f64 = 25.7;
const RIFE_INTERP_FPS: f64 = 30.0;
const EXTRACT_RT_MULT: f64 = 16.0;

fn encoder_mpxs(gpu_backend: &str, quality: &str, codec: &str) -> f64 {
    let nvenc = match quality {
        "ultrafast" => 1350.0,
        "fast" => 1200.0,
        "slow" => 1000.0,
        _ => 800.0,
    };
    let x264 = match quality {
        "ultrafast" => 1215.0,
        "fast" => 800.0,
        "slow" => 400.0,
        _ => 150.0,
    };
    let base = match gpu_backend {
        "nvenc" => nvenc,
        "amf" | "qsv" => nvenc * 0.8,
        _ => x264,
    };
    if codec == "hevc10" {
        base * 0.45
    } else {
        base
    }
}

#[allow(clippy::too_many_arguments)]
fn estimate_seconds(
    duration: f64,
    out_fps: f64,
    target_w: u32,
    target_h: u32,
    input_w: u32,
    input_h: u32,
    selected: &[String],
    temporal_denoise: bool,
    gpu_backend: &str,
    quality: &str,
    codec: &str,
    upscaler: Option<&str>,
    interpolate: bool,
    rife_ready: bool,
) -> UpscaleEstimate {
    let out_frames = (duration * out_fps).round().max(1.0) as u64;
    let out_mpx = out_frames as f64 * f64::from(target_w) * f64::from(target_h) / 1_000_000.0;
    let ratio = if input_w > 0 && input_h > 0 {
        (f64::from(target_w) / f64::from(input_w)).max(f64::from(target_h) / f64::from(input_h))
    } else {
        0.0
    };
    let mut penalty = 1.0;
    let mut upscale_factor = 1.0;
    for id in selected {
        let factor = crate::shaders::speed_factor(id).unwrap_or(1.0);
        if crate::shaders::is_2x_upscale_id(id) {
            upscale_factor = factor;
        }
        penalty *= factor;
    }
    if temporal_denoise {
        penalty *= 0.97;
    }
    if ratio > 2.05 && upscale_factor < 1.0 {
        penalty *= upscale_factor;
    }
    let interp_seconds = if interpolate && rife_ready {
        duration * out_fps / RIFE_INTERP_FPS + duration / EXTRACT_RT_MULT
    } else if interpolate {
        0.5 * out_mpx / (SHADER_BASE_MPXS * penalty).max(1.0)
    } else {
        0.0
    };
    let seconds = if upscaler == Some("realcugan") {
        duration / EXTRACT_RT_MULT
            + out_mpx / REALCUGAN_MPXS
            + out_mpx / encoder_mpxs(gpu_backend, quality, codec).max(1.0)
            + interp_seconds
    } else {
        let shader = if upscaler.is_some() {
            out_mpx / (SHADER_BASE_MPXS * penalty).max(1.0)
        } else {
            0.0
        };
        let encode = out_mpx / encoder_mpxs(gpu_backend, quality, codec).max(1.0);
        shader.max(encode) + interp_seconds
    };
    UpscaleEstimate {
        seconds: seconds.max(1.0),
        out_frames,
        out_width: target_w,
        out_height: target_h,
    }
}

#[tauri::command]
pub async fn estimate_upscale_time(
    app_handle: tauri::AppHandle,
    input_path: String,
    width: u32,
    height: u32,
    target_fps: Option<u32>,
    interpolate: bool,
    quality: String,
    gpu_backend: String,
    video_codec: Option<String>,
    ai_upscaler: Option<String>,
    selected_shaders: Option<Vec<String>>,
    temporal_denoise: Option<bool>,
) -> Result<UpscaleEstimate, String> {
    let duration = validate_input_file(&app_handle, &input_path).await?;
    let (target_w, target_h, input_w, input_h) =
        resolve_upscale_target(&app_handle, &input_path, width, height).await?;
    if target_w == 0 || target_h == 0 {
        return Err("Не удалось определить целевой размер.".to_string());
    }
    let src_fps = get_frame_rate(&app_handle, &input_path)
        .await
        .unwrap_or(24.0);
    let out_fps = target_fps.map_or(src_fps, f64::from);
    let selected = selected_shaders.unwrap_or_else(crate::shaders::default_selection);
    let rife = interpolate && target_fps == Some(60) && crate::rife::rife_ready(&app_handle);
    Ok(estimate_seconds(
        duration,
        out_fps,
        target_w,
        target_h,
        input_w,
        input_h,
        &selected,
        temporal_denoise.unwrap_or(false),
        &gpu_backend,
        &quality,
        video_codec.as_deref().unwrap_or("h264"),
        ai_upscaler.as_deref(),
        interpolate,
        rife,
    ))
}

fn parse_frame_rate(s: &str) -> Option<f64> {
    let s = s.trim();
    if let Some((num, den)) = s.split_once('/') {
        let n: f64 = num.trim().parse().ok()?;
        let d: f64 = den.trim().parse().ok()?;
        if d > 0.0 && n > 0.0 {
            Some(n / d)
        } else {
            None
        }
    } else {
        s.parse::<f64>().ok().filter(|f| *f > 0.0)
    }
}

async fn get_frame_rate(app_handle: &tauri::AppHandle, path: &str) -> Result<f64, String> {
    let output = {
        let mut c = Command::new(ffprobe_exe(app_handle));
        c.args([
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=r_frame_rate",
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
    parse_frame_rate(stdout.trim()).ok_or_else(|| format!("parse fps failed: {stdout:?}"))
}

async fn run_ffmpeg_progress(
    app_handle: &tauri::AppHandle,
    mut cmd: Command,
    duration: f64,
    stage: &str,
    sender: &tokio::sync::watch::Sender<f64>,
    cancel: &CancellationGuard,
    out_path: &str,
) -> Result<(), String> {
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000);
    let mut child = cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("ffmpeg spawn: {e}"))?;
    let child_pid = child.id().ok_or("no child pid")?;
    let children = app_handle.state::<ActiveChildren>();
    children.register(child_pid);
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr_handle = child.stderr.take();
    let mut lines = tokio::io::BufReader::new(stdout).lines();
    let mut speed = 0.0f64;
    while let Some(line) = lines
        .next_line()
        .await
        .map_err(|e| format!("read progress: {e}"))?
    {
        if cancel.is_cancelled() {
            children.unregister(child_pid);
            let _ = child.kill().await;
            let _ = std::fs::remove_file(out_path);
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
                        stage: stage.into(),
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
    let mut stderr = String::new();
    if let Some(handle) = stderr_handle {
        tokio::io::BufReader::new(handle)
            .read_to_string(&mut stderr)
            .await
            .unwrap_or_default();
    }
    children.unregister(child_pid);
    if !status.success() {
        let tail: String = stderr
            .chars()
            .rev()
            .take(1500)
            .collect::<String>()
            .chars()
            .rev()
            .collect();
        return Err(format!("ffmpeg {stage} failed: {tail}"));
    }
    Ok(())
}

async fn rife_interpolate_frames(
    app_handle: &tauri::AppHandle,
    input_path: &str,
    work: &std::path::Path,
    duration: f64,
    target_fps: u32,
    sender: &tokio::sync::watch::Sender<f64>,
    cancel: &CancellationGuard,
) -> Result<(std::path::PathBuf, f64), String> {
    let in_dir = work.join("rife_in");
    let out_dir = work.join("rife_out");
    std::fs::create_dir_all(&in_dir).map_err(|e| format!("rife temp: {e}"))?;
    std::fs::create_dir_all(&out_dir).map_err(|e| format!("rife temp: {e}"))?;
    let mut extract = Command::new(ffmpeg_exe(app_handle));
    extract.args(["-y", "-i", input_path, "-map", "0:v:0", "-q:v", "2"]);
    extract.arg(in_dir.join("f_%05d.jpg"));
    extract.args(["-progress", "pipe:1", "-nostats"]);
    run_ffmpeg_progress(
        app_handle,
        extract,
        duration,
        "extracting",
        sender,
        cancel,
        "__frames__",
    )
    .await?;
    let target = crate::rife::rife_target_count(duration, target_fps);
    let mut rc = Command::new(crate::rife::rife_exe(app_handle));
    rc.arg("-i")
        .arg(&in_dir)
        .arg("-o")
        .arg(&out_dir)
        .arg("-m")
        .arg("rife-v4.6")
        .arg("-n")
        .arg(target.to_string())
        .arg("-f")
        .arg("f_%05d.jpg")
        .current_dir(crate::rife::rife_bin_dir(app_handle));
    #[cfg(windows)]
    rc.creation_flags(0x0800_0000);
    let mut child = rc
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("rife spawn: {e}"))?;
    let child_pid = child.id().ok_or("no child pid")?;
    let children = app_handle.state::<ActiveChildren>();
    children.register(child_pid);
    let stderr_handle = child.stderr.take();
    let mut tick = tokio::time::interval(std::time::Duration::from_secs(2));
    loop {
        if cancel.is_cancelled() {
            children.unregister(child_pid);
            let _ = child.kill().await;
            return Err("Операция отменена".to_string());
        }
        if let Some(status) = child.try_wait().map_err(|e| format!("rife wait: {e}"))? {
            children.unregister(child_pid);
            if !status.success() {
                let mut stderr = String::new();
                if let Some(handle) = stderr_handle {
                    tokio::io::BufReader::new(handle)
                        .read_to_string(&mut stderr)
                        .await
                        .unwrap_or_default();
                }
                return Err(format!("rife failed: {stderr}"));
            }
            break;
        }
        let done = std::fs::read_dir(&out_dir).map_or(0, |rd| rd.filter_map(Result::ok).count());
        let current = ((done as f64 / f64::from(target_fps)).min(duration)).max(0.0);
        let _ = sender.send((current / duration * 100.0).min(100.0));
        let _ = app_handle.emit(
            "upscale-progress",
            UpscaleProgress {
                current,
                total: duration,
                stage: "interpolating".into(),
                speed: 0.0,
            },
        );
        tick.tick().await;
    }
    Ok((out_dir, f64::from(target_fps)))
}

async fn realcugan_upscale(
    app_handle: &tauri::AppHandle,
    input_path: &str,
    output_path: &str,
    width: u32,
    height: u32,
    target_fps: Option<u32>,
    interpolate: bool,
    quality: &str,
    gpu_backend: &str,
    video_codec: &str,
    duration: f64,
    sender: &tokio::sync::watch::Sender<f64>,
    cancel: &CancellationGuard,
) -> Result<(), String> {
    let _permit = FFMPEG_SEM
        .acquire()
        .await
        .map_err(|_| "semaphore closed".to_string())?;
    let (target_w, target_h, _iw, _ih) =
        resolve_upscale_target(app_handle, input_path, width, height).await?;
    if target_w == 0 || target_h == 0 {
        return Err("Не удалось определить целевой размер.".to_string());
    }
    let exe = crate::realcugan::realcugan_exe(app_handle);
    if !std::path::Path::new(&exe).exists() {
        return Err("RealCUGAN не загружен. Скачайте его в панели апскейла.".to_string());
    }
    let models = crate::realcugan::realcugan_models_dir(app_handle);
    if !models.exists() {
        return Err("Модели RealCUGAN не найдены. Скачайте их заново.".to_string());
    }
    let work = std::env::temp_dir().join(format!(
        "iluha-realcugan-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| d.as_millis())
    ));
    let in_dir = work.join("in");
    let out_dir = work.join("out");
    std::fs::create_dir_all(&in_dir).map_err(|e| format!("preview temp: {e}"))?;
    std::fs::create_dir_all(&out_dir).map_err(|e| format!("preview temp: {e}"))?;
    let cleanup = || {
        let _ = std::fs::remove_dir_all(&work);
    };
    let use_rife = interpolate && target_fps == Some(60) && crate::rife::rife_ready(app_handle);
    let (frames_dir, fps) = if use_rife {
        rife_interpolate_frames(app_handle, input_path, &work, duration, 60, sender, cancel)
            .await
            .inspect_err(|_| cleanup())?
    } else {
        let probed = get_frame_rate(app_handle, input_path).await?;
        let mut extract = Command::new(ffmpeg_exe(app_handle));
        extract.args(["-y", "-i", input_path, "-map", "0:v:0", "-q:v", "2"]);
        extract.arg(in_dir.join("f_%05d.jpg"));
        extract.args(["-progress", "pipe:1", "-nostats"]);
        if let Err(e) = run_ffmpeg_progress(
            app_handle,
            extract,
            duration,
            "extracting",
            sender,
            cancel,
            "__frames__",
        )
        .await
        {
            cleanup();
            return Err(e);
        }
        let total_frames =
            std::fs::read_dir(&in_dir).map_or(0, |rd| rd.filter_map(Result::ok).count());
        if total_frames == 0 {
            cleanup();
            return Err("Не удалось извлечь кадры.".to_string());
        }
        (in_dir.clone(), probed)
    };
    let denoise = crate::realcugan::denoise_level(quality);
    let mut rc = Command::new(&exe);
    rc.arg("-i")
        .arg(&frames_dir)
        .arg("-o")
        .arg(&out_dir)
        .arg("-n")
        .arg(denoise.to_string())
        .arg("-s")
        .arg("2")
        .arg("-m")
        .arg("models-se")
        .arg("-f")
        .arg("jpg")
        .arg("-g")
        .arg("0")
        .current_dir(crate::realcugan::realcugan_bin_dir(app_handle));
    #[cfg(windows)]
    rc.creation_flags(0x0800_0000);
    let mut child = rc
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("realcugan spawn: {e}"))?;
    let child_pid = child.id().ok_or("no child pid")?;
    let children = app_handle.state::<ActiveChildren>();
    children.register(child_pid);
    let stderr_handle = child.stderr.take();
    let mut tick = tokio::time::interval(std::time::Duration::from_secs(2));
    loop {
        if cancel.is_cancelled() {
            children.unregister(child_pid);
            let _ = child.kill().await;
            let _ = std::fs::remove_file(output_path);
            cleanup();
            return Err("Операция отменена".to_string());
        }
        if let Some(status) = child
            .try_wait()
            .map_err(|e| format!("realcugan wait: {e}"))?
        {
            children.unregister(child_pid);
            if !status.success() {
                let mut stderr = String::new();
                if let Some(handle) = stderr_handle {
                    tokio::io::BufReader::new(handle)
                        .read_to_string(&mut stderr)
                        .await
                        .unwrap_or_default();
                }
                cleanup();
                return Err(format!("realcugan failed: {stderr}"));
            }
            break;
        }
        let done = std::fs::read_dir(&out_dir).map_or(0, |rd| rd.filter_map(Result::ok).count());
        let current = ((done as f64 / fps).min(duration)).max(0.0);
        let _ = sender.send((current / duration * 100.0).min(100.0));
        let _ = app_handle.emit(
            "upscale-progress",
            UpscaleProgress {
                current,
                total: duration,
                stage: "upscaling".into(),
                speed: 0.0,
            },
        );
        tick.tick().await;
    }
    let mut encode = Command::new(ffmpeg_exe(app_handle));
    encode.args(["-y", "-framerate", &fps.to_string()]);
    encode.arg("-i").arg(out_dir.join("f_%05d.jpg"));
    encode.arg("-i").arg(input_path);
    encode.args(["-map", "0:v:0", "-map", "1:a?", "-map", "1:s?"]);
    let fps_part = match target_fps {
        Some(target) if interpolate => format!("minterpolate=fps={target},"),
        Some(target) => format!("fps={target},"),
        None => String::new(),
    };
    let vf = format!(
        "{fps_part}scale={target_w}:{target_h}:flags=lanczos,format={}",
        encoder_pix_fmt(video_codec)
    );
    encode.args(["-vf", &vf]);
    for arg in build_encoder_args(gpu_backend, quality, video_codec) {
        encode.arg(arg);
    }
    encode
        .args([
            "-c:a",
            "copy",
            "-c:s",
            "copy",
            "-shortest",
            "-progress",
            "pipe:1",
            "-nostats",
        ])
        .arg(output_path);
    let result = run_ffmpeg_progress(
        app_handle,
        encode,
        duration,
        "encoding",
        sender,
        cancel,
        output_path,
    )
    .await;
    cleanup();
    result
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
    video_codec: Option<String>,
    ai_upscaler: Option<String>,
    selected_shaders: Option<Vec<String>>,
    temporal_denoise: Option<bool>,
    cancel_flag: tauri::State<'_, CancelFlag>,
    registry: tauri::State<'_, crate::progress::StreamRegistry>,
) -> Result<(String, u64), String> {
    let (progress_id, sender) = registry.create();
    let _progress_registration = registry.registration(progress_id);
    let pid_for_task = progress_id;

    let cancel = cancel_flag.begin();
    let video_codec: &str = video_codec.as_deref().unwrap_or("h264");
    let temporal_denoise = temporal_denoise.unwrap_or(false);

    let duration = validate_input_file(&app_handle, &input_path).await?;

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

    let _ = app_handle.emit(
        "upscale-progress",
        UpscaleProgress {
            current: 0.0,
            total: duration,
            stage: "initializing".into(),
            speed: 0.0,
        },
    );

    if ai_upscaler.as_deref() == Some("realcugan") {
        realcugan_upscale(
            &app_handle,
            &input_path,
            &output_path,
            width,
            height,
            target_fps,
            interpolate,
            &quality,
            &gpu_backend,
            video_codec,
            duration,
            &sender,
            &cancel,
        )
        .await?;
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

    if ai_upscaler.is_some() {
        let (target_w, target_h, input_w, input_h) =
            resolve_upscale_target(&app_handle, &input_path, width, height).await?;

        let selected = selected_shaders.unwrap_or_else(crate::shaders::default_selection);
        let shader_chain = crate::shaders::build_shader_chain(&selected)?;

        let shader_dir = crate::shaders::shader_dir(&app_handle)
            .ok_or_else(|| "Anime4K шейдеры не найдены. Переустановите приложение.".to_string())?;

        for filename in &shader_chain {
            if !shader_dir.join(filename).exists() {
                return Err(format!("Anime4K шейдер не найден: {filename}"));
            }
        }

        let use_rife =
            interpolate && target_fps == Some(60) && crate::rife::rife_ready(&app_handle);
        let rife_work: Option<std::path::PathBuf> = if use_rife {
            let wd = std::env::temp_dir().join(format!(
                "iluha-rife-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_or(0, |d| d.as_millis())
            ));
            std::fs::create_dir_all(&wd).map_err(|e| format!("rife temp: {e}"))?;
            Some(wd)
        } else {
            None
        };
        let rife_cleanup = |wd: &Option<std::path::PathBuf>| {
            if let Some(dir) = wd {
                let _ = std::fs::remove_dir_all(dir);
            }
        };
        let rife_frames: Option<std::path::PathBuf> = if let Some(wd) = &rife_work {
            match rife_interpolate_frames(
                &app_handle,
                &input_path,
                wd,
                duration,
                60,
                &sender,
                &cancel,
            )
            .await
            {
                Ok((dir, _)) => Some(dir),
                Err(e) => {
                    rife_cleanup(&rife_work);
                    return Err(e);
                }
            }
        } else {
            None
        };

        let mut vf_parts: Vec<String> = vec![build_anime4k_filter(
            &shader_chain,
            target_w,
            target_h,
            input_w,
            input_h,
            temporal_denoise,
        )];

        vf_parts.push(format!("format={}", encoder_pix_fmt(video_codec)));
        let mut vf = vf_parts.join(",");

        if let Some(fps) = target_fps {
            if rife_frames.is_none() {
                if interpolate {
                    vf = format!("minterpolate=fps={fps},{vf}");
                } else {
                    vf = format!("fps={fps},{vf}");
                }
            }
        }

        let mut args = vec![
            "-y".to_string(),
            "-init_hw_device".to_string(),
            "vulkan".to_string(),
        ];
        if let Some(frames) = &rife_frames {
            args.push("-framerate".to_string());
            args.push("60".to_string());
            args.push("-i".to_string());
            args.push(frames.join("f_%05d.jpg").to_string_lossy().to_string());
            args.push("-i".to_string());
            args.push(input_path.clone());
            args.push("-map".to_string());
            args.push("0:v:0".to_string());
            args.push("-map".to_string());
            args.push("1:a?".to_string());
            args.push("-map".to_string());
            args.push("1:s?".to_string());
        } else {
            args.push("-i".to_string());
            args.push(input_path.clone());
        }
        args.push("-vf".to_string());
        args.push(vf);
        args.push("-c:a".to_string());
        args.push("copy".to_string());
        args.push("-c:s".to_string());
        args.push("copy".to_string());
        args.extend(build_encoder_args(&gpu_backend, &quality, video_codec));
        args.push("-progress".to_string());
        args.push("pipe:1".to_string());
        args.push("-nostats".to_string());
        args.push(output_path.clone());

        let _permit_encode = FFMPEG_SEM
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
            if cancel.is_cancelled() {
                children.unregister(child_pid);
                let _ = child.kill().await;
                let _ = std::fs::remove_file(&output_path);
                rife_cleanup(&rife_work);
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

        if cancel.is_cancelled() {
            children.unregister(child_pid);
            let _ = std::fs::remove_file(&output_path);
            rife_cleanup(&rife_work);
            return Err("Операция отменена".to_string());
        }

        if !status.success() {
            children.unregister(child_pid);
            let cmd_line = format!("ffmpeg {}", args.join(" "));
            rife_cleanup(&rife_work);
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

        rife_cleanup(&rife_work);
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
        filters.join(",") + &format!(",format={}", encoder_pix_fmt(video_codec))
    };

    let encoder_args = build_encoder_args(&gpu_backend, &quality, video_codec);

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
            if cancel.is_cancelled() {
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
    let output = {
        let mut command = Command::new(ffmpeg);
        command.args(["-hide_banner", "-encoders"]);
        #[cfg(windows)]
        command.creation_flags(0x0800_0000);
        command.output().await
    };
    let output = match output {
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
    let cancel = cancel_flag.begin();

    let _ = app_handle.emit(
        "upscale-progress",
        UpscaleProgress {
            current: 0.0,
            total: 100.0,
            stage: "initializing".into(),
            speed: 0.0,
        },
    );

    let duration = validate_input_file(&app_handle, &input_path).await?;
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
        if cancel.is_cancelled() {
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
    cancel_flag.cancel();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preview_timestamps_spread_across_duration() {
        let stamps = preview_timestamps(100.0, 5);
        assert_eq!(stamps.len(), 5);
        assert!(stamps[0] > 5.0 && stamps[4] < 95.0);
        assert!(stamps.windows(2).all(|w| w[0] < w[1]));
    }

    #[test]
    fn preview_timestamps_reject_empty_input() {
        assert!(preview_timestamps(0.0, 5).is_empty());
        assert!(preview_timestamps(100.0, 0).is_empty());
    }

    #[test]
    fn anime4k_filter_prepends_temporal_denoise() {
        let chain = vec!["Anime4K_Upscale_CNN_x2_S.glsl".to_string()];
        let plain = build_anime4k_filter(&chain, 3840, 2160, 1920, 1080, false);
        let denoised = build_anime4k_filter(&chain, 3840, 2160, 1920, 1080, true);
        assert!(!plain.starts_with("atadenoise"));
        assert!(denoised.starts_with("atadenoise,"));
        assert!(denoised.ends_with(&plain));
    }

    #[test]
    fn suggest_preset_for_routes_by_size_and_noise() {
        assert_eq!(
            suggest_preset_for(1920, 1080, false),
            ("lightning", "clean")
        );
        assert_eq!(suggest_preset_for(1920, 1080, true), ("balanced", "noisy"));
        assert_eq!(suggest_preset_for(1280, 720, false), ("clean", "medium"));
        assert_eq!(suggest_preset_for(1280, 720, true), ("denoise", "noisy"));
        assert_eq!(suggest_preset_for(640, 480, false), ("denoise", "lowres"));
        assert_eq!(suggest_preset_for(0, 0, false), ("balanced", "unknown"));
    }

    fn seg_est(
        selected: &[&str],
        quality: &str,
        codec: &str,
        upscaler: Option<&str>,
    ) -> UpscaleEstimate {
        estimate_seconds(
            122.0,
            24.0,
            3840,
            2160,
            1920,
            1080,
            &selected.iter().map(|s| s.to_string()).collect::<Vec<_>>(),
            false,
            "nvenc",
            quality,
            codec,
            upscaler,
            false,
            false,
        )
    }

    #[test]
    fn estimate_matches_bench_lightning() {
        let est = seg_est(
            &["clamp", "upscale_cnn_x2_s"],
            "ultrafast",
            "h264",
            Some("anime4k"),
        );
        assert!((18.0..30.0).contains(&est.seconds), "got {}", est.seconds);
    }

    #[test]
    fn estimate_matches_bench_lanczos() {
        let est = seg_est(&[], "ultrafast", "h264", None);
        assert!((14.0..26.0).contains(&est.seconds), "got {}", est.seconds);
    }

    #[test]
    fn estimate_bounds_bench_max() {
        let est = seg_est(
            &[
                "clamp",
                "denoise_bilateral_median",
                "deblur_dog",
                "restore_cnn_soft_vl",
                "upscale_denoise_cnn_x2_vl",
                "thin_hq",
                "darken_hq",
            ],
            "veryslow",
            "h264",
            Some("anime4k"),
        );
        assert!((80.0..200.0).contains(&est.seconds), "got {}", est.seconds);
    }

    #[test]
    fn estimate_bounds_realcugan() {
        let est = seg_est(&[], "slow", "h264", Some("realcugan"));
        assert!(
            (700.0..1300.0).contains(&est.seconds),
            "got {}",
            est.seconds
        );
    }

    #[test]
    fn parse_frame_rate_handles_ratios_and_plain() {
        assert_eq!(parse_frame_rate("24/1"), Some(24.0));
        assert!((parse_frame_rate("30000/1001").unwrap() - 29.97).abs() < 0.01);
        assert_eq!(parse_frame_rate("25"), Some(25.0));
        assert_eq!(parse_frame_rate("0/0"), None);
        assert_eq!(parse_frame_rate("nope"), None);
    }

    #[test]
    fn cancellation_tokens_are_independent_and_cleaned_up() {
        let flag = CancelFlag::new();
        let first = flag.begin();
        let second = flag.begin();

        first.token.cancel();
        assert!(first.is_cancelled());
        assert!(!second.is_cancelled());

        drop(first);
        flag.cancel();
        assert!(second.is_cancelled());
        drop(second);

        let next = flag.begin();
        assert!(!next.is_cancelled());
    }

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
