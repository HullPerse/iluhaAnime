use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Listener, Manager};

use super::core::{LibmpvCore, PlayerCore};
use super::watch::{self, WatchState};
use super::{
    mpv_event_name, EVENT_CHAPTERS, EVENT_EVENT, EVENT_STATE, EVENT_TRACKS, PLAYER_WINDOW_LABEL,
};

const STATE_INTERVAL: Duration = Duration::from_millis(100);
const WATCH_SAVE_TICKS: u32 = 100;
const METRICS_TICKS: u32 = 10;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerOpenRequest {
    pub files: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resume: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_index: Option<usize>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackSnapshot {
    pub time_pos: f64,
    pub duration: f64,
    pub pause: bool,
    pub eof_reached: bool,
    pub speed: f64,
    pub volume: f64,
    pub muted: bool,
    pub playlist_index: i64,
    pub playlist_count: i64,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fps_render: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fps_video: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drop_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_duration: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hwdec_current: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video_width: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video_height: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TypedEvent {
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

#[derive(Default)]
pub struct PlayerHost {
    pending_open: Mutex<Option<PlayerOpenRequest>>,
    current_path: Mutex<String>,
    dirty: AtomicBool,
    active: AtomicBool,
    metrics: Mutex<Metrics>,
    watchdog: Mutex<WatchdogState>,
    last_snapshot: Mutex<Option<PlaybackSnapshot>>,
    zero_streak: Mutex<u32>,
}

#[derive(Default, Clone)]
pub(crate) struct WatchdogState {
    previous_drops: Option<i64>,
    warned: bool,
}

const WATCHDOG_DROP_RATIO: f64 = 0.02;
const WATCHDOG_TICKS: u32 = 50;
const WATCHDOG_WINDOW_SECS: f64 = 5.0;
const WATCHDOG_MIN_DROPS: i64 = 3;

#[derive(Default, Clone)]
pub(crate) struct Metrics {
    fps_render: Option<f64>,
    fps_video: Option<f64>,
    drop_count: Option<i64>,
    cache_duration: Option<f64>,
    hwdec_current: Option<String>,
    video_width: Option<i64>,
    video_height: Option<i64>,
}

impl PlayerHost {
    pub fn set_pending_open(&self, request: Option<PlayerOpenRequest>) {
        *self.pending_open.lock().unwrap_or_else(|e| e.into_inner()) = request;
    }

    pub fn pending_open(&self) -> Option<PlayerOpenRequest> {
        self.pending_open
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    pub fn clear_pending_open(&self) {
        *self.pending_open.lock().unwrap_or_else(|e| e.into_inner()) = None;
    }

    pub fn set_current_path(&self, path: String) {
        *self.current_path.lock().unwrap_or_else(|e| e.into_inner()) = path;
    }

    pub fn current_path(&self) -> String {
        self.current_path
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    pub fn mark_dirty(&self) {
        self.dirty.store(true, Ordering::Relaxed);
    }

    pub fn set_active(&self, active: bool) {
        self.active.store(active, Ordering::Relaxed);
    }

    pub fn is_active(&self) -> bool {
        self.active.load(Ordering::Relaxed)
    }

    pub fn set_metrics(&self, metrics: Metrics) {
        *self.metrics.lock().unwrap_or_else(|e| e.into_inner()) = metrics;
    }

    pub fn metrics(&self) -> Metrics {
        self.metrics
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    pub fn reset_file_state(&self) {
        *self.metrics.lock().unwrap_or_else(|e| e.into_inner()) = Metrics::default();
        *self.watchdog.lock().unwrap_or_else(|e| e.into_inner()) = WatchdogState::default();
    }
}

pub fn attach(app: &AppHandle) {
    let emitter = app.clone();
    app.listen_any(mpv_event_name(), move |event| {
        let Ok(payload) = serde_json::from_str::<Value>(event.payload()) else {
            return;
        };
        handle_mpv_event(&emitter, payload);
    });

    let ticker = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut ticks: u32 = 0;
        loop {
            tokio::time::sleep(STATE_INTERVAL).await;
            let host = ticker.state::<PlayerHost>();
            if !host.is_active() {
                continue;
            }
            if ticks % METRICS_TICKS == 0 {
                host.set_metrics(read_metrics(&ticker));
            }
            if ticks % WATCHDOG_TICKS == 0 {
                watchdog_tick(&ticker);
            }
            if host.dirty.swap(false, Ordering::Relaxed) {
                let snapshot = read_snapshot(&ticker);
                let snapshot = smooth_snapshot(&ticker, snapshot);
                let _ = ticker.emit_to(PLAYER_WINDOW_LABEL, EVENT_STATE, &snapshot);
            }
            ticks = ticks.wrapping_add(1);
            if ticks % WATCH_SAVE_TICKS == 0 {
                save_current_watch(&ticker);
            }
        }
    });
}

fn handle_mpv_event(app: &AppHandle, event: Value) {
    let name = event
        .get("event")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let host = app.state::<PlayerHost>();

    match name.as_str() {
        "property-change" => {
            host.mark_dirty();
            match event.get("name").and_then(Value::as_str) {
                Some("track-list") => {
                    if let Some(tracks) = event.get("data") {
                        let _ = app.emit_to(PLAYER_WINDOW_LABEL, EVENT_TRACKS, tracks);
                    }
                }
                Some("chapter-list") => {
                    if let Some(chapters) = event.get("data") {
                        tracing::debug!(
                            "player: chapter-list updated ({} entries)",
                            chapters.as_array().map_or(0, Vec::len)
                        );
                        let _ = app.emit_to(PLAYER_WINDOW_LABEL, EVENT_CHAPTERS, chapters);
                    }
                }
                _ => {}
            }
        }
        "file-loaded" => {
            if let Some(path) = string_property(app, "path") {
                host.set_current_path(path);
            }
            host.reset_file_state();
            host.mark_dirty();
            emit_typed(app, "file-loaded", None, None);
        }
        "end-file" => {
            host.mark_dirty();
            save_current_watch(app);
            let reason = event
                .get("reason")
                .and_then(Value::as_str)
                .map(str::to_string);
            emit_typed(app, "end-file", reason, None);
        }
        "video-reconfig" | "audio-reconfig" => {
            emit_typed(app, &name, None, event.get("params").cloned());
        }
        "shutdown" => {
            host.set_active(false);
            emit_typed(app, "shutdown", None, None);
        }
        "idle" | "seek" | "playback-restart" | "error" => emit_typed(app, &name, None, None),
        _ => {}
    }
}

fn emit_typed(app: &AppHandle, kind: &str, reason: Option<String>, data: Option<Value>) {
    let payload = TypedEvent {
        kind: kind.to_string(),
        reason,
        data,
    };
    if let Err(error) = app.emit_to(PLAYER_WINDOW_LABEL, EVENT_EVENT, &payload) {
        tracing::debug!("player event not delivered: {error}");
    }
}

fn number_property(app: &AppHandle, name: &str) -> Option<f64> {
    LibmpvCore::new(app.clone())
        .get_property(name, "double", PLAYER_WINDOW_LABEL)
        .ok()
        .and_then(|value| value.as_f64())
}

fn int_property(app: &AppHandle, name: &str) -> Option<i64> {
    LibmpvCore::new(app.clone())
        .get_property(name, "int64", PLAYER_WINDOW_LABEL)
        .ok()
        .and_then(|value| value.as_i64())
}

fn flag_property(app: &AppHandle, name: &str) -> Option<bool> {
    LibmpvCore::new(app.clone())
        .get_property(name, "flag", PLAYER_WINDOW_LABEL)
        .ok()
        .and_then(|value| value.as_bool())
}

fn string_property(app: &AppHandle, name: &str) -> Option<String> {
    LibmpvCore::new(app.clone())
        .get_property(name, "string", PLAYER_WINDOW_LABEL)
        .ok()
        .and_then(|value| value.as_str().map(str::to_string))
}

/// Masks a single anomalous sample: mpv property reads can transiently fail
/// mid-playback (seek rebuffer, demuxer reset) and `read_snapshot` turns
/// failures into zeros, which the timeline then shows as a jump to 0:00 and
/// back. When the path is unchanged and the previous sample was sane, the
/// zero is almost certainly such a glitch, so the previous value is
/// re-emitted. Multi-tick runs are handled by `smooth_with_streak`, which
/// calls this per tick against the last emitted baseline.
fn smooth_snapshot_sample(
    previous: Option<&PlaybackSnapshot>,
    next: PlaybackSnapshot,
) -> PlaybackSnapshot {
    let Some(previous) = previous else {
        return next;
    };
    if next.path != previous.path {
        return next;
    }
    let mut fixed = next;
    if fixed.time_pos == 0.0 && previous.time_pos > 1.0 {
        fixed.time_pos = previous.time_pos;
    }
    if fixed.duration == 0.0 && previous.duration > 0.0 {
        fixed.duration = previous.duration;
    }
    if fixed.playlist_index < 0 && previous.playlist_index >= 0 {
        fixed.playlist_index = previous.playlist_index;
    }
    if fixed.playlist_count == 0 && previous.playlist_count > 0 {
        fixed.playlist_count = previous.playlist_count;
    }
    fixed
}

/// How many consecutive zero-position samples stay masked while the last
/// emitted position was sane. Covers multi-tick zero runs from seek
/// rebuffers and demuxer resets; a genuine return to zero (restart, replay)
/// converges right after the budget is exhausted.
const MAX_MASKED_ZEROS: u32 = 3;

fn smooth_with_streak(
    previous: Option<&PlaybackSnapshot>,
    streak: u32,
    next: PlaybackSnapshot,
) -> (PlaybackSnapshot, u32) {
    let time_glitch = match previous {
        Some(prev) => next.path == prev.path && next.time_pos == 0.0 && prev.time_pos > 1.0,
        None => false,
    };
    if time_glitch && streak < MAX_MASKED_ZEROS {
        (smooth_snapshot_sample(previous, next), streak + 1)
    } else if time_glitch {
        (next, streak)
    } else {
        (smooth_snapshot_sample(previous, next), 0)
    }
}

fn smooth_snapshot(app: &AppHandle, next: PlaybackSnapshot) -> PlaybackSnapshot {
    let host = app.state::<PlayerHost>();
    let mut last = host
        .last_snapshot
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let mut streak = host
        .zero_streak
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    // Baseline is the last EMITTED sample (not raw): consecutive zeros stay
    // glitches until the streak budget runs out, then converge.
    let (emitted, updated) = smooth_with_streak(last.as_ref(), *streak, next);
    *streak = updated;
    drop(streak);
    *last = Some(emitted.clone());
    emitted
}

fn read_snapshot(app: &AppHandle) -> PlaybackSnapshot {
    let metrics = app.state::<PlayerHost>().metrics();
    PlaybackSnapshot {
        time_pos: number_property(app, "time-pos").unwrap_or_default(),
        duration: number_property(app, "duration").unwrap_or_default(),
        pause: flag_property(app, "pause").unwrap_or(true),
        eof_reached: flag_property(app, "eof-reached").unwrap_or(false),
        speed: number_property(app, "speed").unwrap_or(1.0),
        volume: number_property(app, "volume").unwrap_or_default(),
        muted: flag_property(app, "mute").unwrap_or(false),
        playlist_index: int_property(app, "playlist-pos").unwrap_or(-1),
        playlist_count: int_property(app, "playlist-count").unwrap_or_default(),
        path: string_property(app, "path").unwrap_or_default(),
        fps_render: metrics.fps_render,
        fps_video: metrics.fps_video,
        drop_count: metrics.drop_count,
        cache_duration: metrics.cache_duration,
        hwdec_current: metrics.hwdec_current,
        video_width: metrics.video_width,
        video_height: metrics.video_height,
    }
}

const DROP_KEYS: &[&str] = &[
    "frame-drop-count",
    "drop-frame-count",
    "decoder-frame-drop-count",
];

fn read_metrics(app: &AppHandle) -> Metrics {
    let drop_count = DROP_KEYS.iter().find_map(|key| int_property(app, key));
    Metrics {
        fps_render: number_property(app, "estimated-vf-fps").filter(|value| *value > 0.0),
        fps_video: number_property(app, "fps").filter(|value| *value > 0.0),
        drop_count,
        cache_duration: number_property(app, "demuxer-cache-duration"),
        hwdec_current: string_property(app, "hwdec-current"),
        video_width: int_property(app, "width").filter(|value| *value > 0),
        video_height: int_property(app, "height").filter(|value| *value > 0),
    }
}

fn watchdog_tick(app: &AppHandle) {
    let host = app.state::<PlayerHost>();
    let metrics = host.metrics();
    let Some(current) = metrics.drop_count else {
        return;
    };
    let fps = metrics.fps_video.or(metrics.fps_render).unwrap_or_default();
    let mut state = host.watchdog.lock().unwrap_or_else(|e| e.into_inner());
    let previous = state.previous_drops.replace(current);
    let Some(previous) = previous else {
        return;
    };
    let delta = current - previous;
    if delta < 0 {
        state.warned = false;
        return;
    }
    if state.warned || delta < WATCHDOG_MIN_DROPS || fps <= 0.0 {
        return;
    }
    let expected = fps * WATCHDOG_WINDOW_SECS;
    if expected <= 0.0 {
        return;
    }
    let ratio = delta as f64 / expected;
    if ratio > WATCHDOG_DROP_RATIO {
        state.warned = true;
        drop(state);
        emit_typed(
            app,
            "dropped-frames",
            None,
            Some(json!({
                "drops": delta,
                "expectedFrames": expected.round() as i64,
                "ratio": ratio,
                "fps": fps,
            })),
        );
    }
}

pub fn save_current_watch(app: &AppHandle) {
    let host = app.state::<PlayerHost>();
    let path = host.current_path();
    if path.is_empty() {
        return;
    }
    let Some(position) = number_property(app, "time-pos") else {
        return;
    };
    let state = WatchState {
        position,
        duration: number_property(app, "duration").unwrap_or_default(),
        audio_delay: number_property(app, "audio-delay"),
        sub_delay: number_property(app, "sub-delay"),
        updated_at: crate::app_db::now_seconds(),
    };
    if let Err(error) = watch::save(app, &path, &state) {
        tracing::debug!("watch position not saved: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot(
        path: &str,
        time_pos: f64,
        duration: f64,
        playlist_index: i64,
        playlist_count: i64,
    ) -> PlaybackSnapshot {
        PlaybackSnapshot {
            path: path.into(),
            time_pos,
            duration,
            playlist_index,
            playlist_count,
            ..Default::default()
        }
    }

    #[test]
    fn first_sample_passes_through_untouched() {
        let next = snapshot("/a.mkv", 0.0, 0.0, -1, 0);
        let out = smooth_snapshot_sample(None, next);
        assert_eq!(out.time_pos, 0.0);
        assert_eq!(out.playlist_index, -1);
    }

    #[test]
    fn path_change_passes_zeros_through() {
        let prev = snapshot("/a.mkv", 600.0, 1400.0, 0, 3);
        let next = snapshot("/b.mkv", 0.0, 0.0, -1, 0);
        let out = smooth_snapshot_sample(Some(&prev), next);
        assert_eq!(out.time_pos, 0.0);
        assert_eq!(out.duration, 0.0);
        assert_eq!(out.playlist_index, -1);
    }

    #[test]
    fn single_glitch_sample_reemits_previous_values() {
        let prev = snapshot("/a.mkv", 600.0, 1400.0, 2, 3);
        let glitch = snapshot("/a.mkv", 0.0, 0.0, -1, 0);
        let out = smooth_snapshot_sample(Some(&prev), glitch);
        assert_eq!(out.time_pos, 600.0);
        assert_eq!(out.duration, 1400.0);
        assert_eq!(out.playlist_index, 2);
        assert_eq!(out.playlist_count, 3);
    }

    #[test]
    fn genuine_zeros_are_not_masked() {
        let prev = snapshot("/a.mkv", 0.0, 0.0, 0, 1);
        let next = snapshot("/a.mkv", 0.0, 0.0, 0, 1);
        let out = smooth_snapshot_sample(Some(&prev), next);
        assert_eq!(out.time_pos, 0.0);
        assert_eq!(out.playlist_index, 0);
    }

    #[test]
    fn small_nonzero_positions_pass_through() {
        let prev = snapshot("/a.mkv", 600.0, 1400.0, 0, 1);
        let next = snapshot("/a.mkv", 0.5, 1400.0, 0, 1);
        let out = smooth_snapshot_sample(Some(&prev), next);
        assert_eq!(out.time_pos, 0.5);
    }

    #[test]
    fn restart_converges_on_the_second_zero() {
        // The single-sample helper masks exactly one zero: the raw zero
        // becomes the next baseline, so a second zero passes through.
        let playing = snapshot("/a.mkv", 600.0, 1400.0, 0, 1);
        let raw_zero = snapshot("/a.mkv", 0.0, 1400.0, 0, 1);
        let first = smooth_snapshot_sample(Some(&playing), raw_zero.clone());
        assert_eq!(first.time_pos, 600.0);
        let second = smooth_snapshot_sample(Some(&raw_zero), raw_zero.clone());
        assert_eq!(second.time_pos, 0.0);
    }

    #[test]
    fn consecutive_zeros_stay_masked_up_to_budget() {
        let playing = snapshot("/a.mkv", 600.0, 1400.0, 0, 1);
        let raw_zero = snapshot("/a.mkv", 0.0, 1400.0, 0, 1);
        let (first, streak) = smooth_with_streak(Some(&playing), 0, raw_zero.clone());
        assert_eq!(first.time_pos, 600.0);
        assert_eq!(streak, 1);
        let (second, streak) = smooth_with_streak(Some(&first), streak, raw_zero.clone());
        assert_eq!(second.time_pos, 600.0);
        assert_eq!(streak, 2);
        let (third, streak) = smooth_with_streak(Some(&second), streak, raw_zero.clone());
        assert_eq!(third.time_pos, 600.0);
        assert_eq!(streak, 3);
    }

    #[test]
    fn genuine_restart_converges_after_budget() {
        let playing = snapshot("/a.mkv", 600.0, 1400.0, 0, 1);
        let raw_zero = snapshot("/a.mkv", 0.0, 1400.0, 0, 1);
        let (mut previous, mut streak) = (playing, 0);
        for _ in 0..3 {
            let (out, next_streak) = smooth_with_streak(Some(&previous), streak, raw_zero.clone());
            assert_eq!(out.time_pos, 600.0);
            previous = out;
            streak = next_streak;
        }
        let (converged, _) = smooth_with_streak(Some(&previous), streak, raw_zero);
        assert_eq!(converged.time_pos, 0.0);
    }

    #[test]
    fn sane_sample_resets_zero_streak() {
        let playing = snapshot("/a.mkv", 600.0, 1400.0, 0, 1);
        let raw_zero = snapshot("/a.mkv", 0.0, 1400.0, 0, 1);
        let (masked, streak) = smooth_with_streak(Some(&playing), 0, raw_zero);
        assert_eq!(streak, 1);
        let resumed = snapshot("/a.mkv", 600.4, 1400.0, 0, 1);
        let (out, streak) = smooth_with_streak(Some(&masked), streak, resumed);
        assert_eq!(out.time_pos, 600.4);
        assert_eq!(streak, 0);
    }
}
