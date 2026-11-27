//! Live player session state and mpv event dispatch.
//!
//! `PlayerHost` owns everything the session needs: the pending open request,
//! the current path, stream identity, the operation locks and the close-phase
//! state machine. The ticker and the mpv event listener live here too because
//! they are the writers of that state; reading a snapshot out of mpv and
//! persisting progress are separate modules (`snapshot.rs`, `watch.rs`).

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicU8, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Listener, Manager};

use super::snapshot::{self, Metrics, PlaybackSnapshot, WatchdogState};
use super::watch;
use super::{
    mpv_event_name, EVENT_CHAPTERS, EVENT_EVENT, EVENT_STATE, EVENT_TRACKS, PLAYER_WINDOW_LABEL,
};

const STATE_INTERVAL: Duration = Duration::from_millis(100);
const WATCH_SAVE_TICKS: u32 = 100;
const METRICS_TICKS: u32 = 10;

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
    /// The `AniList` id the catalog matched, when it had one. The player uses it
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
    /// Soft subtitle tracks the selected source offers. Players add them with
    /// `sub-add` after the media file loads; embedded tracks never appear here.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub subtitles: Vec<crate::stream::anime_lib_models::SubtitleTrack>,
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
    #[serde(default)]
    pub request_id: u64,
    pub files: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resume: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_index: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub watch: Option<PlaylistWatch>,
    /// Watch state the main window already read for the anchor file. The
    /// player consumes it on the first `file-loaded` instead of issuing the
    /// same `player_load_watch` IPC again.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub initial_watch: Option<watch::WatchState>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stream: Option<StreamOpen>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TypedEvent {
    pub kind: String,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

/// The stream-specific mpv options the last request wrote. mpv keeps them on
/// the instance across files, so a quality or voice-over switch only has to
/// rewrite the ones that actually changed.
#[derive(Default)]
pub struct StreamOptions {
    proxy: Option<String>,
    headers: Option<String>,
}

/// Which stream options a request still has to write to mpv.
pub struct StreamWrites {
    pub proxy: bool,
    pub headers: bool,
}

#[derive(Default)]
pub struct PlayerHost {
    pub(super) readiness: super::readiness::Readiness,
    pub operation: tokio::sync::Mutex<()>,
    pub window_operation: tokio::sync::Mutex<()>,
    /// 0 = open, 1 = close in flight, 2 = teardown done. Driven only through
    /// the `begin_close` / `finish_close` methods below.
    close_phase: AtomicU8,
    #[cfg(windows)]
    pub(crate) smtc: Mutex<Option<super::smtc::Session>>,
    #[cfg(windows)]
    pub(crate) smtc_epoch: AtomicU64,
    pub instance_id: AtomicU64,
    pub(crate) loupe_shader_instance: AtomicU64,
    pub request_serial: AtomicU64,
    pub(crate) property_revision: AtomicU64,
    pending_open: Mutex<Option<PlayerOpenRequest>>,
    stream_options: Mutex<StreamOptions>,
    current_path: Mutex<String>,
    pub pending_stream: Mutex<Option<StreamOpen>>,
    pub watch_operation: Mutex<()>,
    /// Watch key of the stream session, when one is playing. `current_path`
    /// carries the media URL for a stream, which must never become a watch key.
    stream_watch_key: Mutex<Option<String>>,
    /// What the active stream is, for the history row the watch save writes.
    stream_identity: Mutex<Option<StreamIdentity>>,
    dirty: AtomicBool,
    active: AtomicBool,
    pub(crate) metrics: Mutex<Metrics>,
    pub(crate) watchdog: Mutex<WatchdogState>,
    pub(crate) last_snapshot: Mutex<Option<PlaybackSnapshot>>,
    pub(crate) latest: Mutex<(PlaybackSnapshot, u64)>,
    pub(crate) zero_streak: Mutex<u32>,
    /// Local readahead from the playback profile. The frontend owns the profile
    /// values, mpv keeps the option on the instance, and a local load has to
    /// reapply it because a stream overwrites the cache policy.
    readahead: Mutex<Option<f64>>,
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

impl PlayerHost {
    /// Close-phase transitions.
    ///
    /// `begin_close` is a compare-and-exchange so two `CloseRequested` events
    /// cannot both start a teardown; `abort_close` hands the window back when a
    /// teardown failed; `finish_close` marks the window safe to destroy.
    pub fn close_is_finished(&self) -> bool {
        self.close_phase.load(Ordering::Acquire) >= 2
    }

    pub fn begin_close(&self) -> bool {
        self.close_phase
            .compare_exchange(0, 1, Ordering::AcqRel, Ordering::Acquire)
            .is_ok()
    }

    pub fn abort_close(&self) {
        self.close_phase.store(0, Ordering::Release);
    }

    pub fn finish_close(&self) {
        self.close_phase.store(2, Ordering::Release);
    }

    pub fn reset_close(&self) {
        self.close_phase.store(0, Ordering::Release);
    }

    pub fn activate_file(&self, path: String) {
        let _watch = self
            .watch_operation
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let stream = self
            .pending_stream
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .take()
            .filter(|stream| stream.media_url == path);
        self.set_current_path(path);
        self.set_stream_watch_key(stream.as_ref().map(|stream| stream.watch_key.clone()));
        self.set_stream_identity(
            stream
                .filter(|stream| !stream.slug.is_empty())
                .map(|stream| StreamIdentity {
                    anime_id: stream.media_id,
                    slug: stream.slug,
                    title: stream.media_title,
                    cover: stream.cover,
                    anilist_id: stream.anilist_id,
                    episode_id: stream.episode_id,
                    episode_number: stream.episode_number,
                    episode_title: Some(stream.episode_title).filter(|value| !value.is_empty()),
                }),
        );
    }
    pub fn set_pending_open(&self, request: Option<PlayerOpenRequest>) {
        *self
            .pending_open
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = request;
    }

    pub fn pending_open(&self) -> Option<PlayerOpenRequest> {
        self.pending_open
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    pub fn take_pending_open(&self) -> Option<PlayerOpenRequest> {
        self.pending_open
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .take()
    }

    pub fn clear_pending_request(&self, id: u64) {
        let mut pending = self
            .pending_open
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if pending
            .as_ref()
            .is_some_and(|request| request.request_id == id)
        {
            *pending = None;
        }
    }

    pub fn reset_native_state(&self) {
        self.activate_file(String::new());
        self.reset_file_state();
        *self
            .latest
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = (PlaybackSnapshot::default(), 0);
        *self
            .last_snapshot
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = None;
        *self
            .zero_streak
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = 0;
        self.property_revision.fetch_add(1, Ordering::Release);
    }

    pub fn clear_pending_open(&self) {
        *self
            .pending_open
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = None;
    }

    pub fn set_current_path(&self, path: String) {
        *self
            .current_path
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = path;
    }

    pub fn current_path(&self) -> String {
        self.current_path
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    pub fn set_stream_watch_key(&self, key: Option<String>) {
        // Every place that drops the stream session drops its identity too, so
        // a local file can never write into the stream's history row.
        let clearing = key.is_none();
        *self
            .stream_watch_key
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = key;
        if clearing {
            self.set_stream_identity(None);
        }
    }

    pub fn stream_watch_key(&self) -> Option<String> {
        self.stream_watch_key
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    pub fn set_stream_identity(&self, identity: Option<StreamIdentity>) {
        *self
            .stream_identity
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = identity;
    }

    pub fn stream_identity(&self) -> Option<StreamIdentity> {
        self.stream_identity
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
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
        let mut current = self
            .metrics
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
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
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    /// The last snapshot mpv pushed, with the mask of fields observed so far.
    /// The watch saver needs both: a position is only worth persisting once
    /// path and duration have arrived too.
    pub(crate) fn latest_observed(&self) -> (PlaybackSnapshot, u64) {
        self.latest
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }

    /// The download speed observed for the file that is still playing.
    ///
    /// The metrics are cleared on `file-loaded`, so during a switch this is the
    /// previous stream's speed: exactly what the next cache profile needs before
    /// the new file has any metrics of its own.
    pub(crate) fn last_stream_speed(&self) -> Option<f64> {
        self.latest
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .0
            .cache_speed
    }

    /// Diff a stream request against what mpv already has, and remember the
    /// new values so the next switch can skip them.
    pub(crate) fn stream_option_writes(&self, proxy: &str, headers: &str) -> StreamWrites {
        let mut state = self
            .stream_options
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let writes = StreamWrites {
            proxy: state.proxy.as_deref() != Some(proxy),
            headers: state.headers.as_deref() != Some(headers),
        };
        state.proxy = Some(proxy.to_string());
        state.headers = Some(headers.to_string());
        writes
    }

    /// The local readahead the playback profile asked for. mpv cannot tell the
    /// stream profile apart from the local one, so this is remembered here and
    /// written back on every local load.
    pub fn set_readahead(&self, seconds: f64) {
        *self
            .readahead
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = Some(seconds);
    }

    pub fn readahead(&self) -> f64 {
        self.readahead
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .unwrap_or(1.0)
    }

    /// Forget what mpv was told, so the next stream writes every option again.
    pub(crate) fn reset_stream_options(&self) {
        *self
            .stream_options
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = StreamOptions::default();
    }

    pub fn reset_file_state(&self) {
        *self
            .metrics
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = Metrics::default();
        *self
            .watchdog
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = WatchdogState::default();
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
            let Ok(_operation) = host.operation.try_lock() else {
                continue;
            };
            let handle = ticker.clone();
            let tick = ticks;
            let _ = tauri::async_runtime::spawn_blocking(move || player_tick(&handle, tick)).await;
            ticks = ticks.wrapping_add(1);
        }
    });
}

fn player_tick(ticker: &AppHandle, ticks: u32) {
    let host = ticker.state::<PlayerHost>();
    if ticks.is_multiple_of(METRICS_TICKS) {
        host.set_metrics(snapshot::read_metrics(ticker));
    }
    if ticks.is_multiple_of(snapshot::WATCHDOG_TICKS) {
        snapshot::watchdog_tick(ticker);
    }
    if host.dirty.swap(false, Ordering::Relaxed) {
        #[cfg(debug_assertions)]
        snapshot::note_dirty_tick();
        let next = snapshot::read_snapshot(ticker);
        let emitted = snapshot::smooth_snapshot(ticker, next);
        #[cfg(windows)]
        super::smtc::update(ticker, &emitted);
        #[cfg(debug_assertions)]
        snapshot::note_snapshot_emitted();
        let _ = ticker.emit_to(PLAYER_WINDOW_LABEL, EVENT_STATE, &emitted);
    }
    if ticks.wrapping_add(1).is_multiple_of(WATCH_SAVE_TICKS) {
        watch::save_current(ticker);
    }
}

fn handle_mpv_event(app: &AppHandle, event: Value) {
    let host = app.state::<PlayerHost>();
    if event.get("_instanceId").and_then(Value::as_u64)
        != Some(host.instance_id.load(Ordering::Acquire))
    {
        return;
    }
    let name = event
        .get("event")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let host = app.state::<PlayerHost>();

    match name.as_str() {
        "property-change" => {
            #[cfg(debug_assertions)]
            snapshot::note_property_event(
                event.get("name").and_then(Value::as_str) == Some("time-pos"),
            );
            if let Some(name) = event.get("name").and_then(Value::as_str) {
                tracing::trace!("player: property-change {name}");
                if let Some(data) = event.get("data") {
                    let mut guard = host
                        .latest
                        .lock()
                        .unwrap_or_else(std::sync::PoisonError::into_inner);
                    let (cached, mask) = &mut *guard;
                    snapshot::apply_observed_property(cached, mask, name, data);
                    host.property_revision.fetch_add(1, Ordering::Release);
                }
                match name {
                    "audio-device-list" => {
                        if let Some(devices) = event.get("data") {
                            super::audio::reconcile(app, devices);
                        }
                    }
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
            if let Some(path) = snapshot::string_property(app, "path") {
                host.activate_file(path);
            }
            #[cfg(windows)]
            super::smtc::open(app);
            host.reset_file_state();
            *host
                .latest
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner) =
                (PlaybackSnapshot::default(), 0);
            host.property_revision.fetch_add(1, Ordering::Release);
            host.mark_dirty();
            emit_typed(app, "file-loaded", None, None);
        }
        "end-file" => {
            host.mark_dirty();
            let reason = event
                .get("reason")
                .and_then(Value::as_str)
                .map(str::to_string);
            #[cfg(windows)]
            if reason.as_deref() != Some("eof") {
                super::smtc::close(app);
            }
            if reason.as_deref() == Some("eof") {
                watch::save_current(app);
            }
            emit_typed(app, "end-file", reason, event.get("file_error").cloned());
        }
        "video-reconfig" | "audio-reconfig" => {
            emit_typed(app, &name, None, event.get("params").cloned());
        }
        "shutdown" => {
            #[cfg(windows)]
            super::smtc::close(app);
            host.set_active(false);
            emit_typed(app, "shutdown", None, None);
        }
        "idle" => {
            #[cfg(windows)]
            super::smtc::close(app);
            emit_typed(app, &name, None, None);
        }
        "seek" | "playback-restart" | "error" => emit_typed(app, &name, None, None),
        _ => {}
    }
}

pub(crate) fn emit_typed(app: &AppHandle, kind: &str, reason: Option<String>, data: Option<Value>) {
    let payload = TypedEvent {
        kind: kind.to_string(),
        path: app.state::<PlayerHost>().current_path(),
        reason,
        data,
    };
    if let Err(error) = app.emit_to(PLAYER_WINDOW_LABEL, EVENT_EVENT, &payload) {
        tracing::debug!("player event not delivered: {error}");
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    #[test]
    fn obsolete_loads_cannot_consume_a_newer_pending_request() {
        let host = super::PlayerHost::default();
        let request =
            serde_json::from_value(serde_json::json!({ "requestId": 9, "files": ["a.mkv"] }))
                .unwrap();
        host.set_pending_open(Some(request));
        host.clear_pending_request(8);
        assert_eq!(host.pending_open().unwrap().request_id, 9);
        assert_eq!(host.take_pending_open().unwrap().request_id, 9);
        assert!(host.take_pending_open().is_none());
    }

    #[test]
    fn a_file_without_stream_metadata_cannot_reuse_the_previous_history_identity() {
        let host = super::PlayerHost::default();
        let stream = serde_json::from_value(serde_json::json!({
            "sourceId": "s", "sourceName": "S", "mediaId": "1", "mediaTitle": "T", "slug": "title", "episodeId": "1", "episodeNumber": 1, "episodeTitle": "", "watchKey": "stream:1", "headers": {}, "quality": "720p", "variantId": "v", "sources": [], "mediaUrl": "https://example.com/one"
        })).unwrap();
        *host.pending_stream.lock().unwrap() = Some(stream);
        host.activate_file("https://example.com/one".into());
        assert_eq!(host.stream_identity().unwrap().episode_id, "1");
        host.activate_file("local.mkv".into());
        assert!(host.stream_identity().is_none());
        assert!(host.stream_watch_key().is_none());
        host.reset_native_state();
        assert!(host.current_path().is_empty());
    }

    use super::*;

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

    #[test]
    fn a_second_close_cannot_start_a_second_teardown() {
        let host = PlayerHost::default();
        assert!(host.begin_close());
        // A second `CloseRequested` for the same window must not run teardown
        // again while the first one is still in flight.
        assert!(!host.begin_close());
        assert!(!host.close_is_finished());
    }

    #[test]
    fn a_failed_close_hands_the_window_back() {
        let host = PlayerHost::default();
        assert!(host.begin_close());
        host.abort_close();
        assert!(!host.close_is_finished());
        assert!(host.begin_close(), "abort must allow a retry");
    }

    #[test]
    fn a_finished_close_blocks_a_second_teardown() {
        let host = PlayerHost::default();
        assert!(host.begin_close());
        host.finish_close();
        assert!(host.close_is_finished());
        assert!(!host.begin_close());
    }

    #[test]
    fn releasing_an_idle_prewarm_closes_without_a_begin() {
        // `player_release_prewarm` destroys the idle instance and closes the
        // window without going through `CloseRequested`, so it only calls
        // `finish_close`. The destroyed-window handler must then see the
        // finished phase and let the close pass instead of a second teardown.
        let host = PlayerHost::default();
        host.finish_close();
        assert!(host.close_is_finished());
        assert!(!host.begin_close());
    }

    #[test]
    fn a_stream_open_carries_soft_subtitles() {
        let value = json!({
            "sourceId": "allanime",
            "sourceName": "AllAnime",
            "mediaId": "allanime:abc",
            "mediaTitle": "Frieren",
            "episodeId": "allanime:abc|1",
            "episodeNumber": 1,
            "episodeTitle": "",
            "watchKey": "stream:allanime:abc:1",
            "headers": {},
            "quality": "1080p",
            "variantId": "AllAnime:sub:Default",
            "sources": [],
            "subtitles": [{
                "id": "allanime-sub-0",
                "url": "https://cdn.example/en.vtt",
                "language": "English",
                "isDefault": true,
                "headers": { "Referer": "https://youtu-chan.com/" }
            }],
            "mediaUrl": "https://cdn.example/master.m3u8"
        });

        let stream: StreamOpen = serde_json::from_value(value).expect("stream open parses");
        assert_eq!(stream.subtitles.len(), 1);
        assert!(stream.subtitles[0].is_default);
        assert_eq!(stream.subtitles[0].language, "English");
    }

    #[test]
    fn opening_the_player_again_rearms_the_close_phase() {
        // The window label is reused across opens, so a closed window must not
        // keep the next one from being closed.
        let host = PlayerHost::default();
        host.finish_close();
        host.reset_close();
        assert!(!host.close_is_finished());
        assert!(host.begin_close());
    }
}
