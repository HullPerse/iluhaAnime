//! Debug-only dual-mpv harness (`ILUHA_SYNC_BENCH=1`): player hosts, player-2 guests over loopback iroh.

use std::io::Write;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use super::core::{LibmpvCore, PlayerCore};
use super::{PLAYER_ROUTE, PLAYER_WINDOW_LABEL};

use crate::session::client::{ClientConfig, ClientSession};
use crate::session::host::{HostConfig, HostSession};
use crate::session::sync::{SyncInstructionDto, DRIFT_DEADBAND_MS};
use crate::session::transport;

pub const GUEST_WINDOW_LABEL: &str = "player-2";

const POLL: Duration = Duration::from_millis(20);
const TICK: Duration = Duration::from_millis(100);
const READY_TIMEOUT: Duration = Duration::from_secs(90);
const LOAD_TIMEOUT: Duration = Duration::from_secs(180);
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(20);

const LABELS: [&str; 2] = [PLAYER_WINDOW_LABEL, GUEST_WINDOW_LABEL];

pub struct SyncBenchConfig {
    pub file: String,
    pub secs: u64,
    /// Lead (ms) forced onto the guest before the run, to prove convergence.
    pub lead_ms: f64,
}

impl SyncBenchConfig {
    pub fn from_env() -> Option<Self> {
        std::env::var("ILUHA_SYNC_BENCH").ok()?;
        let raw = std::env::var("ILUHA_SYNC_BENCH_FILES")
            .or_else(|_| std::env::var("ILUHA_BENCH_FILES"))
            .or_else(|_| std::env::var("ILUHA_OPEN_FILE"))
            .ok()?;
        let file = raw
            .split(['\n', ';'])
            .map(str::trim)
            .find(|entry| !entry.is_empty())?
            .to_string();
        Some(Self {
            file,
            secs: env_u64("ILUHA_SYNC_BENCH_SECS", 30).max(1),
            lead_ms: env_f64("ILUHA_SYNC_BENCH_LEAD_MS", 3000.0),
        })
    }
}

fn env_u64(name: &str, fallback: u64) -> u64 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.trim().parse().ok())
        .unwrap_or(fallback)
}

fn env_f64(name: &str, fallback: f64) -> f64 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.trim().parse().ok())
        .unwrap_or(fallback)
}

fn report_dir() -> PathBuf {
    std::env::temp_dir().join("opencode")
}

fn env_path(name: &str, fallback: &str) -> PathBuf {
    if let Ok(custom) = std::env::var(name) {
        let custom = custom.trim();
        if !custom.is_empty() {
            return PathBuf::from(custom);
        }
    }
    report_dir().join(fallback)
}

fn report_path() -> PathBuf {
    env_path("ILUHA_SYNC_BENCH_REPORT", "iluha_sync_bench.ndjson")
}

fn marker_path() -> PathBuf {
    env_path("ILUHA_SYNC_BENCH_MARKER", "iluha_sync_bench.done")
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
    let _ = std::fs::create_dir_all(report_dir());
    let _ = std::fs::write(marker_path(), status);
}

fn core(app: &AppHandle) -> LibmpvCore {
    LibmpvCore::new(app.clone())
}

fn num(app: &AppHandle, label: &str, name: &str) -> Option<f64> {
    core(app)
        .get_property(name, "double", label)
        .ok()
        .and_then(|value| value.as_f64())
}

fn flag(app: &AppHandle, label: &str, name: &str) -> Option<bool> {
    core(app)
        .get_property(name, "flag", label)
        .ok()
        .and_then(|value| value.as_bool())
}

fn text(app: &AppHandle, label: &str, name: &str) -> Option<String> {
    core(app)
        .get_property(name, "string", label)
        .ok()
        .and_then(|value| value.as_str().map(str::to_string))
}

async fn wait_until<F>(mut probe: F, timeout: Duration) -> bool
where
    F: FnMut() -> bool,
{
    let deadline = Instant::now() + timeout;
    loop {
        if probe() {
            return true;
        }
        if Instant::now() >= deadline {
            return false;
        }
        tokio::time::sleep(POLL).await;
    }
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

fn ensure_window(app: &AppHandle, label: &str) -> Result<(), String> {
    if app.get_webview_window(label).is_some() {
        return Ok(());
    }
    WebviewWindowBuilder::new(app, label, WebviewUrl::App(PLAYER_ROUTE.into()))
        .title("iluhaAnime")
        .inner_size(960.0, 540.0)
        .min_inner_size(320.0, 200.0)
        .transparent(true)
        .build()
        .map_err(|error| format!("create {label} window: {error}"))?;
    Ok(())
}

/// Failures stamp marker file; `ILUHA_SYNC_BENCH_EXIT` exits after report.
pub async fn run(app: AppHandle, config: SyncBenchConfig) {
    match execute(&app, &config).await {
        Ok(()) => {
            write_marker("done");
            tracing::info!("sync-bench: report written to {}", report_path().display());
        }
        Err(error) => {
            tracing::warn!("sync-bench: {error}");
            write_marker(&format!("failed: {error}"));
        }
    }
    // Close guest window; its overlay never receives player-state.
    if let Some(window) = app.get_webview_window(GUEST_WINDOW_LABEL) {
        let _ = window.close();
    }
    if std::env::var("ILUHA_SYNC_BENCH_EXIT").is_ok() {
        tracing::info!("sync-bench: exiting app after report");
        app.exit(0);
    }
}

async fn execute(app: &AppHandle, config: &SyncBenchConfig) -> Result<(), String> {
    for label in LABELS {
        ensure_window(app, label)?;
    }
    // The frontend of each window initializes its own mpv instance.
    for label in LABELS {
        if !wait_until(|| flag(app, label, "idle").is_some(), READY_TIMEOUT).await {
            return Err(format!("mpv instance for {label} never became ready"));
        }
    }
    for label in LABELS {
        let backend = core(app);
        let _ = backend.set_property("pause", &json!(true), label);
        let _ = backend.set_property("speed", &json!(1.0), label);
        backend
            .command("loadfile", &[json!(config.file), json!("replace")], label)
            .map_err(|error| format!("loadfile on {label} failed: {error}"))?;
    }
    for label in LABELS {
        let expected = config.file.clone();
        let loaded = wait_until(
            || text(app, label, "path").is_some_and(|observed| same_path(&observed, &expected)),
            LOAD_TIMEOUT,
        )
        .await;
        if !loaded {
            return Err(format!("{label} never loaded {}", config.file));
        }
    }

    let host_endpoint = transport::bind_offline_endpoint().await?;
    let host = HostSession::bind(HostConfig::generate("SyncBench Host".into()), host_endpoint);
    let ticket = host.ticket();
    let guest_endpoint = transport::bind_offline_endpoint().await?;
    let client = ClientSession::connect_with(
        ClientConfig {
            host_addr: transport::loopback_addr(host.endpoint()),
            token: ticket.token,
            peer_id: "sync-bench-guest".into(),
            display_name: "SyncBench Guest".into(),
            anilist_user_id: None,
            app_version: env!("CARGO_PKG_VERSION").into(),
        },
        guest_endpoint,
    );
    if !wait_until(|| client.session_id().is_some(), HANDSHAKE_TIMEOUT).await {
        client.leave().await;
        host.stop().await;
        return Err("guest never completed the handshake".into());
    }
    // Let a couple of clock pings land before the first evaluation.
    tokio::time::sleep(Duration::from_millis(2500)).await;

    for label in LABELS {
        let _ = core(app).set_property("pause", &json!(false), label);
    }
    // Force the guest ahead so the engine has real drift to remove.
    let guest_now = num(app, GUEST_WINDOW_LABEL, "time-pos").unwrap_or(0.0);
    let lead_target = (guest_now + config.lead_ms / 1000.0).max(0.0);
    let _ = core(app).command(
        "seek",
        &[json!(lead_target), json!("absolute+exact")],
        GUEST_WINDOW_LABEL,
    );

    let summary = measure(app, &host, &client, config).await;
    append_report(&summary);

    client.leave().await;
    host.stop().await;
    Ok(())
}

async fn measure(
    app: &AppHandle,
    host: &HostSession,
    client: &ClientSession,
    config: &SyncBenchConfig,
) -> Value {
    let start = Instant::now();
    let deadline = start + Duration::from_secs(config.secs);
    let mut drifts: Vec<f64> = Vec::new();
    let mut rate_commands = 0u32;
    let mut seek_commands = 0u32;
    let mut first_seek_ms: Option<f64> = None;
    let mut last_rtt = 0.0;
    let mut last_lag = "Poor".to_string();

    while Instant::now() < deadline {
        tokio::time::sleep(TICK).await;

        let host_pos = num(app, PLAYER_WINDOW_LABEL, "time-pos").unwrap_or(0.0);
        let host_paused = flag(app, PLAYER_WINDOW_LABEL, "pause").unwrap_or(false);
        let host_rate = num(app, PLAYER_WINDOW_LABEL, "speed").unwrap_or(1.0);
        host.publish_position(config.file.clone(), host_pos, !host_paused, host_rate);

        let guest_pos = num(app, GUEST_WINDOW_LABEL, "time-pos").unwrap_or(0.0);
        let sample = client.sample_sync(guest_pos, Some(config.file.clone()));
        if let Some(instruction) = sample.instruction {
            match instruction {
                SyncInstructionDto::SetRate { rate } => {
                    let _ = core(app).set_property("speed", &json!(rate), GUEST_WINDOW_LABEL);
                    rate_commands += 1;
                }
                SyncInstructionDto::Seek { position } => {
                    let _ = core(app).command(
                        "seek",
                        &[json!(position), json!("absolute+exact")],
                        GUEST_WINDOW_LABEL,
                    );
                    // Confirm restart to leave latched awaiting_restart (P9 fix).
                    client.mark_restarted();
                    seek_commands += 1;
                    first_seek_ms.get_or_insert_with(|| elapsed_ms(start));
                }
            }
        }
        drifts.push(sample.drift_ms);
        last_rtt = sample.rtt_ms;
        last_lag = format!("{:?}", sample.lag);
        append_report(&json!({
            "tMs": elapsed_ms(start),
            "driftMs": round1(sample.drift_ms),
            "rttMs": round1(sample.rtt_ms),
            "correction": sample.correction,
            "lag": last_lag,
            "haveSnapshot": sample.have_snapshot,
            "awaitingRestart": sample.awaiting_restart,
        }));
    }

    let (max_abs, mean_abs) = summarize_drift(&drifts);
    let converged = max_abs <= DRIFT_DEADBAND_MS;
    json!({
        "file": config.file,
        "secs": config.secs,
        "leadMs": config.lead_ms,
        "samples": drifts.len(),
        "maxAbsDriftMs": round1(max_abs),
        "meanAbsDriftMs": round1(mean_abs),
        "deadbandMs": DRIFT_DEADBAND_MS,
        "converged": converged,
        "rateCommands": rate_commands,
        "seekCommands": seek_commands,
        "firstSeekMs": first_seek_ms.map(round1),
        "finalRttMs": round1(last_rtt),
        "finalLag": last_lag,
    })
}

fn elapsed_ms(start: Instant) -> f64 {
    round1(start.elapsed().as_secs_f64() * 1000.0)
}

/// (max, mean) absolute drift over steady-state tail.
fn summarize_drift(drifts: &[f64]) -> (f64, f64) {
    let tail = &drifts[drifts.len() / 2..];
    if tail.is_empty() {
        return (0.0, 0.0);
    }
    let max = tail.iter().fold(0.0_f64, |acc, value| acc.max(value.abs()));
    let mean = tail.iter().map(|value| value.abs()).sum::<f64>() / tail.len() as f64;
    (max, mean)
}

fn round1(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn summarize_uses_only_the_steady_state_tail() {
        let drifts = vec![3000.0, 2500.0, 100.0, -50.0, 20.0, -30.0];
        let (max, mean) = summarize_drift(&drifts);
        assert!((max - 50.0).abs() < 1e-9, "got {max}");
        assert!((mean - 100.0 / 3.0).abs() < 1e-9, "got {mean}");
    }

    #[test]
    fn summarize_of_empty_is_zero() {
        let (max, mean) = summarize_drift(&[]);
        assert!(max.abs() < f64::EPSILON);
        assert!(mean.abs() < f64::EPSILON);
    }
}
