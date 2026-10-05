use serde_json::{json, Value};
use std::io::Write;
use std::time::{Duration, Instant};
use tauri::AppHandle;

use super::core::{LibmpvCore, PlayerCore};
use super::PLAYER_WINDOW_LABEL;

const POLL: Duration = Duration::from_millis(10);
const SEEK_TIMEOUT: Duration = Duration::from_secs(10);
const SWITCH_TIMEOUT: Duration = Duration::from_secs(5);

fn env_timeout(name: &str, default_secs: u64) -> Duration {
    Duration::from_secs(env_u64(name, default_secs))
}

const DROP_KEYS: &[&str] = &[
    "frame-drop-count",
    "drop-frame-count",
    "decoder-frame-drop-count",
];

pub struct BenchConfig {
    pub files: Vec<String>,
    pub hwdec: Vec<String>,
    pub decode_secs: u64,
    pub seeks: u32,
}

impl BenchConfig {
    pub fn from_env() -> Option<Self> {
        std::env::var("ILUHA_BENCH").ok()?;
        Some(Self {
            files: std::env::var("ILUHA_BENCH_FILES")
                .map(|value| split_paths(&value))
                .unwrap_or_default(),
            hwdec: std::env::var("ILUHA_BENCH_HWDEC")
                .map(|value| split_list(&value))
                .unwrap_or_else(|_| vec!["auto-safe".to_string()]),
            decode_secs: env_u64("ILUHA_BENCH_DECODE_SECS", 20),
            seeks: env_u64("ILUHA_BENCH_SEEKS", 8) as u32,
        })
    }
}

fn env_u64(name: &str, fallback: u64) -> u64 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.trim().parse().ok())
        .unwrap_or(fallback)
}

fn split_paths(value: &str) -> Vec<String> {
    value
        .split(['\n', ';'])
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .map(str::to_string)
        .collect()
}

fn split_list(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .map(str::to_string)
        .collect()
}

fn report_dir() -> std::path::PathBuf {
    std::env::temp_dir().join("opencode")
}

fn report_path() -> std::path::PathBuf {
    if let Ok(custom) = std::env::var("ILUHA_BENCH_REPORT") {
        let custom = custom.trim();
        if !custom.is_empty() {
            return std::path::PathBuf::from(custom);
        }
    }
    report_dir().join("iluha_bench.ndjson")
}

fn marker_path() -> std::path::PathBuf {
    if let Ok(custom) = std::env::var("ILUHA_BENCH_MARKER") {
        let custom = custom.trim();
        if !custom.is_empty() {
            return std::path::PathBuf::from(custom);
        }
    }
    report_dir().join("iluha_bench.done")
}

fn append_report(line: &Value) {
    let dir = report_dir();
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(report_path())
    {
        let _ = writeln!(file, "{line}");
    }
}

fn write_marker(status: &str) {
    let dir = report_dir();
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::fs::write(marker_path(), status);
}

fn core(app: &AppHandle) -> LibmpvCore {
    LibmpvCore::new(app.clone())
}

fn num(app: &AppHandle, name: &str) -> Option<f64> {
    core(app)
        .get_property(name, "double", PLAYER_WINDOW_LABEL)
        .ok()
        .and_then(|value| value.as_f64())
}

fn int(app: &AppHandle, name: &str) -> Option<i64> {
    core(app)
        .get_property(name, "int64", PLAYER_WINDOW_LABEL)
        .ok()
        .and_then(|value| value.as_i64())
}

fn flag(app: &AppHandle, name: &str) -> Option<bool> {
    core(app)
        .get_property(name, "flag", PLAYER_WINDOW_LABEL)
        .ok()
        .and_then(|value| value.as_bool())
}

fn text(app: &AppHandle, name: &str) -> Option<String> {
    core(app)
        .get_property(name, "string", PLAYER_WINDOW_LABEL)
        .ok()
        .and_then(|value| value.as_str().map(str::to_string))
}

fn drop_counter(app: &AppHandle) -> Option<(&'static str, i64)> {
    DROP_KEYS
        .iter()
        .find_map(|key| int(app, key).map(|value| (*key, value)))
}

async fn wait_for(app: &AppHandle, probe: fn(&AppHandle) -> bool, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    loop {
        if probe(app) {
            return true;
        }
        if Instant::now() >= deadline {
            return false;
        }
        tokio::time::sleep(POLL).await;
    }
}

fn instance_ready(app: &AppHandle) -> bool {
    flag(app, "idle").is_some()
}

fn diagnose(app: &AppHandle, tag: &str) {
    tracing::warn!(
        "bench: {tag} path={:?} idle={:?} media-title={:?} duration={:?} \
         time-pos={:?} playlist-count={:?} hwdec-current={:?}",
        text(app, "path"),
        flag(app, "idle"),
        text(app, "media-title"),
        num(app, "duration"),
        num(app, "time-pos"),
        int(app, "playlist-count"),
        text(app, "hwdec-current"),
    );
}

fn same_path(observed: &str, expected: &str) -> bool {
    let normalize = |value: &str| {
        value
            .trim_start_matches(r"\\?\")
            .replace('/', "\\")
            .to_ascii_lowercase()
    };
    normalize(observed) == normalize(expected)
}

async fn wait_for_path(app: &AppHandle, expected: &str, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    let mut last_observed: Option<String> = None;
    while Instant::now() < deadline {
        last_observed = text(app, "path");
        if let Some(observed) = &last_observed {
            if same_path(observed, expected) {
                return true;
            }
        }
        tokio::time::sleep(POLL).await;
    }
    tracing::warn!(
        "bench: wait_for_path timed out, expected {expected}, observed {last_observed:?}"
    );
    diagnose(app, "wait_for_path");
    false
}

fn percentile(values: &mut [f64], p: f64) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    values.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let index = (((values.len() - 1) as f64) * p).round() as usize;
    values.get(index.min(values.len() - 1)).copied()
}

fn round1(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

async fn seek_relative(app: &AppHandle, seconds: f64) -> Option<f64> {
    let before = num(app, "time-pos")?;
    let start = Instant::now();
    core(app)
        .command("seek", &[json!(seconds)], PLAYER_WINDOW_LABEL)
        .ok()?;
    let deadline = start + SEEK_TIMEOUT;
    while Instant::now() < deadline {
        if let Some(now) = num(app, "time-pos") {
            let moved_forward = seconds > 0.0 && now > before + 0.5;
            let moved_backward = seconds < 0.0 && now < before - 0.5;
            if moved_forward || moved_backward {
                return Some(start.elapsed().as_secs_f64() * 1000.0);
            }
        }
        tokio::time::sleep(POLL).await;
    }
    None
}

async fn measure_seeks(app: &AppHandle, direction: f64, count: u32) -> Value {
    let delta = 30.0 * direction;
    let mut samples: Vec<f64> = Vec::new();
    for _ in 0..count {
        if let Some(ms) = seek_relative(app, delta).await {
            samples.push(ms);
        }
        tokio::time::sleep(Duration::from_millis(120)).await;
    }
    let p50 = percentile(&mut samples, 0.5);
    let p95 = percentile(&mut samples, 0.95);
    let max = samples.iter().copied().reduce(f64::max);
    json!({
        "n": samples.len(),
        "p50": p50.map(round1),
        "p95": p95.map(round1),
        "max": max.map(round1),
    })
}

fn track_ids(app: &AppHandle, kind: &str) -> Vec<(usize, i64)> {
    let Some(count) = int(app, "track-list/count") else {
        return Vec::new();
    };
    let mut ids = Vec::new();
    for index in 0..count {
        if text(app, &format!("track-list/{index}/type")).as_deref() != Some(kind) {
            continue;
        }
        if let Some(id) = int(app, &format!("track-list/{index}/id")) {
            ids.push((index as usize, id));
        }
    }
    ids
}

async fn switch_track(app: &AppHandle, property: &str, index: usize, id: i64) -> Option<f64> {
    let start = Instant::now();
    core(app)
        .set_property(property, &json!(id.to_string()), PLAYER_WINDOW_LABEL)
        .ok()?;
    let deadline = start + SWITCH_TIMEOUT;
    let selected_key = format!("track-list/{index}/selected");
    while Instant::now() < deadline {
        if flag(app, &selected_key) == Some(true) {
            return Some(start.elapsed().as_secs_f64() * 1000.0);
        }
        tokio::time::sleep(POLL).await;
    }
    None
}

async fn measure_switch(app: &AppHandle, property: &str, kind: &str) -> Value {
    let ids = track_ids(app, kind);
    if ids.len() < 2 {
        return json!({ "available": ids.len(), "ms": null });
    }
    let mut samples: Vec<f64> = Vec::new();
    for (index, id) in [ids[1], ids[0]] {
        if let Some(ms) = switch_track(app, property, index, id).await {
            samples.push(ms);
        }
    }
    json!({
        "available": ids.len(),
        "ms": percentile(&mut samples, 0.5).map(round1),
    })
}

fn average(values: &[f64]) -> Option<f64> {
    if values.is_empty() {
        return None;
    }
    Some(values.iter().sum::<f64>() / values.len() as f64)
}

pub async fn run(app: AppHandle, config: BenchConfig, trigger_start: Instant) {
    let ready_timeout = env_timeout("ILUHA_BENCH_READY_SECS", 60);
    let load_timeout = env_timeout("ILUHA_BENCH_LOAD_SECS", 180);
    if !wait_for(&app, instance_ready, ready_timeout).await {
        tracing::warn!("bench: mpv instance never became ready");
        write_marker("failed: instance");
        return;
    }
    tracing::debug!("bench: instance ready, arming sweep");
    let _ = core(&app).set_property("mute", &json!(true), PLAYER_WINDOW_LABEL);

    let Some(first) = config.files.first().cloned() else {
        tracing::warn!("bench: no files to measure");
        write_marker("failed: no files");
        return;
    };
    let startup_ms = wait_for_path(&app, &first, load_timeout)
        .await
        .then(|| round1(trigger_start.elapsed().as_secs_f64() * 1000.0));
    if startup_ms.is_none() {
        tracing::warn!("bench: first file never became ready through the frontend");
    }

    tracing::debug!(
        "bench: sweep start files={} hwdec={:?}",
        config.files.len(),
        config.hwdec
    );
    for hwdec in &config.hwdec {
        for file in &config.files {
            let line = run_one(&app, file, hwdec, &config, startup_ms).await;
            append_report(&line);
            tracing::info!("bench {hwdec} {file}");
        }
    }

    write_marker("done");
    tracing::info!("bench: report written to {}", report_path().display());
}

async fn run_one(
    app: &AppHandle,
    file: &str,
    hwdec: &str,
    config: &BenchConfig,
    startup_ms: Option<f64>,
) -> Value {
    tracing::debug!("bench: run_one start file={file} hwdec={hwdec}");
    let _ = core(app).set_property("hwdec", &json!(hwdec), PLAYER_WINDOW_LABEL);
    let load_start = Instant::now();
    let load_result = core(app).command(
        "loadfile",
        &[json!(file), json!("replace")],
        PLAYER_WINDOW_LABEL,
    );
    if let Err(error) = &load_result {
        tracing::warn!("bench: loadfile command failed: {error}");
    }
    tracing::debug!("bench: run_one loadfile ok={}", load_result.is_ok());
    let loaded = wait_for_path(app, file, env_timeout("ILUHA_BENCH_LOAD_SECS", 180)).await;
    if !loaded {
        tracing::warn!("bench: file never became ready after loadfile");
    }
    let open_ms = loaded.then(|| round1(load_start.elapsed().as_secs_f64() * 1000.0));
    let _ = core(app).set_property("pause", &json!(false), PLAYER_WINDOW_LABEL);

    tracing::debug!(
        "bench: run_one decode window start secs={}",
        config.decode_secs
    );
    let mut render_fps: Vec<f64> = Vec::new();
    let mut cache_min = f64::MAX;
    let ticks = config.decode_secs * 4;
    for _ in 0..ticks {
        tokio::time::sleep(Duration::from_millis(250)).await;
        if let Some(value) = num(app, "estimated-vf-fps").filter(|value| *value > 0.0) {
            render_fps.push(value);
        }
        if let Some(value) = num(app, "demuxer-cache-duration") {
            cache_min = cache_min.min(value);
        }
    }
    tracing::debug!("bench: run_one decode window done, reading drop counters");
    let drop_before = drop_counter(app);
    let cache_min = (cache_min != f64::MAX).then(|| round1(cache_min));

    tracing::debug!("bench: run_one seeks start");
    let seek_forward = measure_seeks(app, 1.0, config.seeks).await;
    let seek_backward = measure_seeks(app, -1.0, config.seeks).await;
    tracing::debug!("bench: run_one switches start");
    let audio_switch = measure_switch(app, "aid", "audio").await;
    let sub_switch = measure_switch(app, "sid", "sub").await;

    tracing::debug!("bench: run_one done file={file}");
    json!({
        "file": file,
        "hwdecRequested": hwdec,
        "hwdecCurrent": text(app, "hwdec-current"),
        "width": int(app, "width"),
        "height": int(app, "height"),
        "duration": num(app, "duration").map(round1),
        "startupMs": startup_ms,
        "openMs": open_ms,
        "decodeSecs": config.decode_secs,
        "fpsRender": average(&render_fps).map(round1),
        "fpsVideo": num(app, "fps").map(round1),
        "fpsSamples": render_fps.len(),
        "cacheMin": cache_min,
        "dropKey": drop_before.map(|(key, _)| key),
        "dropBefore": drop_before.map(|(_, value)| value),
        "dropAfter": drop_counter(app).map(|(_, value)| value),
        "seekForward": seek_forward,
        "seekBackward": seek_backward,
        "audioSwitch": audio_switch,
        "subSwitch": sub_switch,
    })
}
