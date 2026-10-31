use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
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

// Bitmask of PlaybackSnapshot fields mpv pushes through property-change
// events. Once all of them have been observed at least once, read_snapshot
// can use the cached values instead of issuing one get_property round-trip
// per field per tick.
const OBS_TIME_POS: u64 = 1 << 0;
const OBS_DURATION: u64 = 1 << 1;
const OBS_PAUSE: u64 = 1 << 2;
const OBS_EOF_REACHED: u64 = 1 << 3;
const OBS_SPEED: u64 = 1 << 4;
const OBS_VOLUME: u64 = 1 << 5;
const OBS_MUTED: u64 = 1 << 6;
const OBS_PLAYLIST_INDEX: u64 = 1 << 7;
const OBS_PLAYLIST_COUNT: u64 = 1 << 8;
const OBS_PATH: u64 = 1 << 9;
const OBS_CACHE_BUFFERING_STATE: u64 = 1 << 10;
const OBS_CACHE_SPEED: u64 = 1 << 11;
const OBS_CACHE_DURATION: u64 = 1 << 12;
const OBS_PAUSED_FOR_CACHE: u64 = 1 << 13;
const ALL_CORE_OBSERVED: u64 = OBS_TIME_POS
    | OBS_DURATION
    | OBS_PAUSE
    | OBS_EOF_REACHED
    | OBS_SPEED
    | OBS_VOLUME
    | OBS_MUTED
    | OBS_PLAYLIST_INDEX
    | OBS_PLAYLIST_COUNT
    | OBS_PATH
    | OBS_CACHE_BUFFERING_STATE
    | OBS_CACHE_SPEED
    | OBS_CACHE_DURATION
    | OBS_PAUSED_FOR_CACHE;

/// Cache counters are still polled, but only on the slower metrics tick (or
/// delivered by their own events), never on every playback tick.
const CACHE_FIELDS: u64 =
    OBS_CACHE_BUFFERING_STATE | OBS_CACHE_SPEED | OBS_CACHE_DURATION | OBS_PAUSED_FOR_CACHE;
const CORE_POLLED: u64 = ALL_CORE_OBSERVED & !CACHE_FIELDS;

/// Counters for the real-playback bench (`ILUHA_BENCH`). They cover every
/// `get_property` the player ticker issues and every snapshot it emits.
static PROPERTY_READS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static SNAPSHOTS_EMITTED: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static PROPERTY_EVENTS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static TIME_POS_EVENTS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static DIRTY_TICKS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

pub fn poll_stats() -> (u64, u64, u64, u64, u64) {
    (
        PROPERTY_READS.load(Ordering::Relaxed),
        SNAPSHOTS_EMITTED.load(Ordering::Relaxed),
        PROPERTY_EVENTS.load(Ordering::Relaxed),
        TIME_POS_EVENTS.load(Ordering::Relaxed),
        DIRTY_TICKS.load(Ordering::Relaxed),
    )
}

/// Debug hook for A/B measurement: force the old full poll on every tick.
#[cfg(debug_assertions)]
fn poll_every_field() -> bool {
    static POLL_ALL: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *POLL_ALL.get_or_init(|| std::env::var_os("ILUHA_PLAYER_POLL_ALL").is_some())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentWatch {
    pub torrent_id: i64,
    pub save_dir: String,
    pub anchor: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderWatch {
    pub root: String,
    pub anchor: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PlaylistWatch {
    Torrent(TorrentWatch),
    Folder(FolderWatch),
}

/// Stream-specific open request carried alongside (or instead of) local files.
/// A request has either `files` or `stream`, never both.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamOpen {
    pub source_id: String,
    pub source_name: String,
    pub media_id: String,
    pub media_title: String,
    /// The catalog slug, so the history row can reopen the title without a
    /// search. Older callers omit it and the row simply carries no link.
    #[serde(default)]
    pub slug: String,
    pub episode_id: String,
    pub episode_number: i32,
    pub episode_title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cover: Option<String>,
    /// The AniList id the catalog matched, when it had one. The player uses it
    /// for episode previews; nothing plays from it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anilist_id: Option<i64>,
    pub watch_key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resume: Option<f64>,
    /// Request headers the media host needs. A JSON object from the frontend.
    pub headers: BTreeMap<String, String>,
    /// Proxy for mpv's media request; empty means a direct connection.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub proxy_url: Option<String>,
    /// Whether playback was paused when the request was made, so a quality or
    /// voice-over switch does not start a paused stream.
    #[serde(default)]
    pub paused: bool,
    pub quality: String,
    pub variant_id: String,
    pub sources: Vec<StreamVariantSource>,
    /// The episode's voice-over and subtitle rows, handed over by the catalog
    /// window so the player's list is ready without another network request.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub variants: Vec<StreamVariantRow>,
    /// The selected playable media URL.
    pub media_url: String,
}

/// A catalog row carried inside a stream open request. This mirrors the
/// frontend's `StreamVariant` without pulling the provider's client types into
/// the player state.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamVariantRow {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default)]
    pub separate_stream: bool,
    pub player: String,
    #[serde(default)]
    pub source_url: String,
}

/// A single playable media source within a stream open request.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamVariantSource {
    pub url: String,
    pub r#type: String,
    pub quality: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerOpenRequest {
    pub files: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resume: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_index: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub watch: Option<PlaylistWatch>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stream: Option<StreamOpen>,
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
    /// mpv's cache fill status in percent; present only while it buffers.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_buffering_state: Option<f64>,
    /// Bytes per second read from the network into the cache.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_speed: Option<f64>,
    /// Bytes cached ahead of the current position.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_bytes: Option<i64>,
    /// Whether mpv paused playback because the cache ran dry.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub paused_for_cache: Option<bool>,
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

/// The stream-specific mpv options the last request wrote. mpv keeps them on
/// the instance across files, so a quality or voice-over switch only has to
/// rewrite the ones that actually changed.
#[derive(Default)]
pub(crate) struct StreamOptions {
    proxy: Option<String>,
    headers: Option<String>,
    cache: bool,
    paused: Option<bool>,
}

/// Which stream options a request still has to write to mpv.
pub(crate) struct StreamWrites {
    pub proxy: bool,
    pub headers: bool,
    pub cache: bool,
    pub pause: bool,
}

#[derive(Default)]
pub struct PlayerHost {
    pending_open: Mutex<Option<PlayerOpenRequest>>,
    stream_options: Mutex<StreamOptions>,
    current_path: Mutex<String>,
    /// Watch key of the stream session, when one is playing. `current_path`
    /// carries the media URL for a stream, which must never become a watch key.
    stream_watch_key: Mutex<Option<String>>,
    /// What the active stream is, for the history row the watch save writes.
    stream_identity: Mutex<Option<StreamIdentity>>,
    dirty: AtomicBool,
    active: AtomicBool,
    metrics: Mutex<Metrics>,
    watchdog: Mutex<WatchdogState>,
    last_snapshot: Mutex<Option<PlaybackSnapshot>>,
    latest: Mutex<(PlaybackSnapshot, u64)>,
    zero_streak: Mutex<u32>,
}

/// The catalog identity of the stream that is playing. The watch save runs on
/// the ticker with nothing but a position, so the row it writes needs these.
#[derive(Debug, Clone)]
pub struct StreamIdentity {
    pub anime_id: String,
    pub slug: String,
    pub title: String,
    pub cover: Option<String>,
    pub anilist_id: Option<i64>,
    pub episode_id: String,
    pub episode_number: i32,
    pub episode_title: Option<String>,
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

#[derive(Default, Clone, PartialEq)]
pub(crate) struct Metrics {
    fps_render: Option<f64>,
    fps_video: Option<f64>,
    drop_count: Option<i64>,
    cache_duration: Option<f64>,
    cache_bytes: Option<i64>,
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

    pub fn set_stream_watch_key(&self, key: Option<String>) {
        // Every place that drops the stream session drops its identity too, so
        // a local file can never write into the stream's history row.
        let clearing = key.is_none();
        *self
            .stream_watch_key
            .lock()
            .unwrap_or_else(|e| e.into_inner()) = key;
        if clearing {
            self.set_stream_identity(None);
        }
    }

    pub fn stream_watch_key(&self) -> Option<String> {
        self.stream_watch_key
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    pub fn set_stream_identity(&self, identity: Option<StreamIdentity>) {
        *self
            .stream_identity
            .lock()
            .unwrap_or_else(|e| e.into_inner()) = identity;
    }

    pub fn stream_identity(&self) -> Option<StreamIdentity> {
        self.stream_identity
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
        let mut current = self.metrics.lock().unwrap_or_else(|e| e.into_inner());
        if *current != metrics {
            *current = metrics;
            drop(current);
            // Counters such as cache bytes can change while no other mpv
            // property does, so the snapshot has to follow the metrics tick.
            self.mark_dirty();
        }
    }

    pub fn metrics(&self) -> Metrics {
        self.metrics
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    /// Diff a stream request against what mpv already has, and remember the
    /// new values so the next switch can skip them.
    pub(crate) fn stream_option_writes(
        &self,
        proxy: &str,
        headers: &str,
        paused: bool,
    ) -> StreamWrites {
        let mut state = self
            .stream_options
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let writes = StreamWrites {
            proxy: state.proxy.as_deref() != Some(proxy),
            headers: state.headers.as_deref() != Some(headers),
            cache: !state.cache,
            pause: state.paused != Some(paused),
        };
        state.proxy = Some(proxy.to_string());
        state.headers = Some(headers.to_string());
        state.cache = true;
        state.paused = Some(paused);
        writes
    }

    /// Forget what mpv was told, so the next stream writes every option again.
    pub(crate) fn reset_stream_options(&self) {
        *self
            .stream_options
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = StreamOptions::default();
    }

    /// A local file load changes `pause` behind the stream cache's back.
    pub(crate) fn invalidate_stream_pause(&self) {
        self.stream_options
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .paused = None;
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
                DIRTY_TICKS.fetch_add(1, Ordering::Relaxed);
                let snapshot = read_snapshot(&ticker);
                let snapshot = smooth_snapshot(&ticker, snapshot);
                SNAPSHOTS_EMITTED.fetch_add(1, Ordering::Relaxed);
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
            PROPERTY_EVENTS.fetch_add(1, Ordering::Relaxed);
            if event.get("name").and_then(Value::as_str) == Some("time-pos") {
                TIME_POS_EVENTS.fetch_add(1, Ordering::Relaxed);
            }
            if let Some(name) = event.get("name").and_then(Value::as_str) {
                tracing::trace!("player: property-change {name}");
                if let Some(data) = event.get("data") {
                    let mut guard = host
                        .latest
                        .lock()
                        .unwrap_or_else(|error| error.into_inner());
                    let (snapshot, mask) = &mut *guard;
                    apply_observed_property(snapshot, mask, name, data);
                }
                match name {
                    "track-list" => {
                        if let Some(tracks) = event.get("data") {
                            let _ = app.emit_to(PLAYER_WINDOW_LABEL, EVENT_TRACKS, tracks);
                        }
                    }
                    "chapter-list" => {
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
            host.mark_dirty();
        }
        "file-loaded" => {
            if let Some(path) = string_property(app, "path") {
                host.set_current_path(path);
            }
            host.reset_file_state();
            *host
                .latest
                .lock()
                .unwrap_or_else(|error| error.into_inner()) = (PlaybackSnapshot::default(), 0);
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
    PROPERTY_READS.fetch_add(1, Ordering::Relaxed);
    LibmpvCore::new(app.clone())
        .get_property(name, "double", PLAYER_WINDOW_LABEL)
        .ok()
        .and_then(|value| value.as_f64())
}

fn int_property(app: &AppHandle, name: &str) -> Option<i64> {
    PROPERTY_READS.fetch_add(1, Ordering::Relaxed);
    LibmpvCore::new(app.clone())
        .get_property(name, "int64", PLAYER_WINDOW_LABEL)
        .ok()
        .and_then(|value| value.as_i64())
}

fn flag_property(app: &AppHandle, name: &str) -> Option<bool> {
    PROPERTY_READS.fetch_add(1, Ordering::Relaxed);
    LibmpvCore::new(app.clone())
        .get_property(name, "flag", PLAYER_WINDOW_LABEL)
        .ok()
        .and_then(|value| value.as_bool())
}

fn string_property(app: &AppHandle, name: &str) -> Option<String> {
    PROPERTY_READS.fetch_add(1, Ordering::Relaxed);
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

/// Applies one mpv property-change payload to the cached snapshot and returns
/// whether the field was updated. Exposed for benches and tests.
pub fn apply_observed_property(
    snapshot: &mut PlaybackSnapshot,
    mask: &mut u64,
    name: &str,
    data: &Value,
) -> bool {
    match name {
        "time-pos" => {
            if let Some(value) = data.as_f64() {
                snapshot.time_pos = value;
                *mask |= OBS_TIME_POS;
                return true;
            }
        }
        "duration" => {
            if let Some(value) = data.as_f64() {
                snapshot.duration = value;
                *mask |= OBS_DURATION;
                return true;
            }
        }
        "pause" => {
            if let Some(value) = data.as_bool() {
                snapshot.pause = value;
                *mask |= OBS_PAUSE;
                return true;
            }
        }
        "eof-reached" => {
            if let Some(value) = data.as_bool() {
                snapshot.eof_reached = value;
                *mask |= OBS_EOF_REACHED;
                return true;
            }
        }
        "speed" => {
            if let Some(value) = data.as_f64() {
                snapshot.speed = value;
                *mask |= OBS_SPEED;
                return true;
            }
        }
        "volume" => {
            if let Some(value) = data.as_f64() {
                snapshot.volume = value;
                *mask |= OBS_VOLUME;
                return true;
            }
        }
        "mute" => {
            if let Some(value) = data.as_bool() {
                snapshot.muted = value;
                *mask |= OBS_MUTED;
                return true;
            }
        }
        "playlist-pos" => {
            if let Some(value) = data.as_i64() {
                snapshot.playlist_index = value;
                *mask |= OBS_PLAYLIST_INDEX;
                return true;
            }
        }
        "playlist-count" => {
            if let Some(value) = data.as_i64() {
                snapshot.playlist_count = value;
                *mask |= OBS_PLAYLIST_COUNT;
                return true;
            }
        }
        "path" => {
            if let Some(value) = data.as_str() {
                snapshot.path = value.to_string();
                *mask |= OBS_PATH;
                return true;
            }
        }
        "paused-for-cache" => {
            if let Some(value) = data.as_bool() {
                snapshot.paused_for_cache = Some(value);
                *mask |= OBS_PAUSED_FOR_CACHE;
                return true;
            }
        }
        "cache-buffering-state" => {
            if let Some(value) = data.as_f64() {
                snapshot.cache_buffering_state = Some(value.clamp(0.0, 100.0));
                *mask |= OBS_CACHE_BUFFERING_STATE;
                return true;
            }
        }
        "cache-speed" => {
            if let Some(value) = data.as_f64() {
                // Zero means the stream is not downloading: clear the stale
                // value instead of keeping the last positive speed forever.
                snapshot.cache_speed = (value > 0.0).then_some(value);
                *mask |= OBS_CACHE_SPEED;
                return true;
            }
        }
        "demuxer-cache-duration" => {
            if let Some(value) = data.as_f64() {
                snapshot.cache_duration = Some(value);
                *mask |= OBS_CACHE_DURATION;
                return true;
            }
        }
        _ => {}
    }
    false
}

fn read_snapshot(app: &AppHandle) -> PlaybackSnapshot {
    let host = app.state::<PlayerHost>();
    let metrics = host.metrics();
    let (mut snapshot, mask) = {
        let guard = host
            .latest
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        (guard.0.clone(), guard.1)
    };

    // mpv pushes these fields through property-change events. Poll only the
    // ones it has not delivered yet, so a missed initial event does not freeze
    // a field and a healthy tick costs no IPC at all. A failed read leaves its
    // bit unset, so the next tick tries again instead of caching a default.
    let mut observed = mask;
    let missing = CORE_POLLED & !mask;
    // Debug hook for A/B runs: measure the old full-poll cost.
    #[cfg(debug_assertions)]
    let missing = if poll_every_field() {
        CORE_POLLED
    } else {
        missing
    };
    if missing != 0 {
        if missing & OBS_TIME_POS != 0 {
            if let Some(value) = number_property(app, "time-pos") {
                snapshot.time_pos = value;
                observed |= OBS_TIME_POS;
            }
        }
        if missing & OBS_DURATION != 0 {
            if let Some(value) = number_property(app, "duration") {
                snapshot.duration = value;
                observed |= OBS_DURATION;
            }
        }
        if missing & OBS_PAUSE != 0 {
            if let Some(value) = flag_property(app, "pause") {
                snapshot.pause = value;
                observed |= OBS_PAUSE;
            }
        }
        if missing & OBS_EOF_REACHED != 0 {
            if let Some(value) = flag_property(app, "eof-reached") {
                snapshot.eof_reached = value;
                observed |= OBS_EOF_REACHED;
            }
        }
        if missing & OBS_SPEED != 0 {
            if let Some(value) = number_property(app, "speed") {
                snapshot.speed = value;
                observed |= OBS_SPEED;
            }
        }
        if missing & OBS_VOLUME != 0 {
            if let Some(value) = number_property(app, "volume") {
                snapshot.volume = value;
                observed |= OBS_VOLUME;
            }
        }
        if missing & OBS_MUTED != 0 {
            if let Some(value) = flag_property(app, "mute") {
                snapshot.muted = value;
                observed |= OBS_MUTED;
            }
        }
        if missing & OBS_PLAYLIST_INDEX != 0 {
            if let Some(value) = int_property(app, "playlist-pos") {
                snapshot.playlist_index = value;
                observed |= OBS_PLAYLIST_INDEX;
            }
        }
        if missing & OBS_PLAYLIST_COUNT != 0 {
            if let Some(value) = int_property(app, "playlist-count") {
                snapshot.playlist_count = value;
                observed |= OBS_PLAYLIST_COUNT;
            }
        }
        if missing & OBS_PATH != 0 {
            if let Some(value) = string_property(app, "path") {
                snapshot.path = value;
                observed |= OBS_PATH;
            }
        }
        if observed != mask {
            *host
                .latest
                .lock()
                .unwrap_or_else(|error| error.into_inner()) = (snapshot.clone(), observed);
        }
    }

    // Metrics ride a slower tick; cache counters come from there too.
    snapshot.fps_render = metrics.fps_render;
    snapshot.fps_video = metrics.fps_video;
    snapshot.drop_count = metrics.drop_count;
    snapshot.cache_duration = metrics.cache_duration.or(snapshot.cache_duration);
    snapshot.cache_bytes = metrics.cache_bytes.or(snapshot.cache_bytes);
    snapshot.hwdec_current = metrics.hwdec_current;
    snapshot.video_width = metrics.video_width.or(snapshot.video_width);
    snapshot.video_height = metrics.video_height.or(snapshot.video_height);

    snapshot
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
        cache_bytes: int_property(app, "demuxer-cache-state/fw-bytes").filter(|value| *value > 0),
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

/// The watch key and state for whatever is playing right now. Reading the
/// position is cheap; writing it is not, so the two are separate.
pub fn current_watch_snapshot(app: &AppHandle) -> Option<(String, WatchState)> {
    let host = app.state::<PlayerHost>();
    let path = host
        .stream_watch_key()
        .filter(|key| !key.is_empty())
        .unwrap_or_else(|| host.current_path());
    if path.is_empty() {
        return None;
    }
    let position = number_property(app, "time-pos")?;
    Some((
        path,
        WatchState {
            position,
            duration: number_property(app, "duration").unwrap_or_default(),
            audio_delay: number_property(app, "audio-delay"),
            sub_delay: number_property(app, "sub-delay"),
            updated_at: crate::app_db::now_seconds(),
        },
    ))
}

pub fn save_current_watch(app: &AppHandle) {
    let Some((path, state)) = current_watch_snapshot(app) else {
        return;
    };
    if let Err(error) = watch::save(app, &path, &state) {
        tracing::debug!("watch position not saved: {error}");
    }
    // The same tick keeps the history row current. A local file has no
    // identity, so this is a stream-only write and a no-op everywhere else.
    let Some(identity) = app.state::<PlayerHost>().stream_identity() else {
        return;
    };
    let entry = crate::app_db::stream_history::StreamHistoryEntry {
        anime_id: identity.anime_id,
        episode_id: identity.episode_id,
        slug: identity.slug,
        title: identity.title,
        cover: identity.cover,
        anilist_id: identity.anilist_id,
        episode_number: identity.episode_number,
        episode_title: identity.episode_title,
        episode_cover: None,
        position: state.position,
        duration: state.duration,
        updated_at: state.updated_at,
    };
    if let Err(error) = crate::app_db::stream_history::record(app, entry) {
        tracing::debug!("stream history not saved: {error}");
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
    fn cache_speed_event_with_zero_clears_the_stale_value() {
        let mut snapshot = PlaybackSnapshot {
            cache_speed: Some(1024.0),
            ..PlaybackSnapshot::default()
        };
        let mut mask = 0;
        assert!(apply_observed_property(
            &mut snapshot,
            &mut mask,
            "cache-speed",
            &serde_json::json!(0.0)
        ));
        assert_eq!(snapshot.cache_speed, None);
        assert_eq!(mask, OBS_CACHE_SPEED);
    }

    #[test]
    fn null_property_does_not_mark_the_field_observed() {
        let mut snapshot = PlaybackSnapshot::default();
        let mut mask = 0;
        assert!(!apply_observed_property(
            &mut snapshot,
            &mut mask,
            "time-pos",
            &serde_json::Value::Null
        ));
        assert_eq!(mask, 0);
    }

    #[test]
    fn all_observed_bits_cover_every_event_field() {
        let mut snapshot = PlaybackSnapshot::default();
        let mut mask = 0;
        for (name, value) in [
            ("time-pos", serde_json::json!(1.0)),
            ("duration", serde_json::json!(2.0)),
            ("pause", serde_json::json!(false)),
            ("eof-reached", serde_json::json!(false)),
            ("speed", serde_json::json!(1.0)),
            ("volume", serde_json::json!(50.0)),
            ("mute", serde_json::json!(false)),
            ("playlist-pos", serde_json::json!(0)),
            ("playlist-count", serde_json::json!(1)),
            ("path", serde_json::json!("/a.mkv")),
            ("paused-for-cache", serde_json::json!(false)),
            ("cache-buffering-state", serde_json::json!(100.0)),
            ("cache-speed", serde_json::json!(1.0)),
            ("demuxer-cache-duration", serde_json::json!(3.0)),
        ] {
            assert!(apply_observed_property(
                &mut snapshot,
                &mut mask,
                name,
                &value
            ));
        }
        assert_eq!(mask, ALL_CORE_OBSERVED);
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

    #[test]
    fn a_stream_open_accepts_a_header_map_and_a_pause_flag() {
        let value = json!({
            "sourceId": "animelib",
            "sourceName": "AnimeLib",
            "mediaId": "11",
            "mediaTitle": "Naruto",
            "episodeId": "455",
            "episodeNumber": 1,
            "episodeTitle": "Enter Naruto",
            "watchKey": "stream:animelib:11:455",
            "headers": { "Referer": "https://animelib.org/", "Origin": "https://animelib.org" },
            "proxyUrl": "socks5h://127.0.0.1:10808",
            "paused": true,
            "quality": "720p",
            "variantId": "Kodik:32416",
            "sources": [{
                "url": "https://cdn.example/720.m3u8",
                "type": "m3u8",
                "quality": "720",
                "label": "720p"
            }],
            "variants": [{
                "id": "32416",
                "name": "AniDUB",
                "language": "Озвучка",
                "separateStream": true,
                "player": "Kodik",
                "sourceUrl": "//kodikplayer.com/seria/1/hash/720p"
            }],
            "mediaUrl": "https://cdn.example/720.m3u8"
        });

        let stream: StreamOpen = serde_json::from_value(value).expect("stream open parses");
        assert_eq!(
            stream.headers.get("Referer").map(String::as_str),
            Some("https://animelib.org/")
        );
        assert!(stream.paused);
        assert_eq!(
            stream.proxy_url.as_deref(),
            Some("socks5h://127.0.0.1:10808")
        );
        assert_eq!(stream.quality, "720p");
        assert_eq!(stream.sources.len(), 1);
        assert_eq!(stream.variants.len(), 1);
        assert_eq!(stream.variants[0].name, "AniDUB");
        assert!(stream.variants[0].separate_stream);
    }
}
