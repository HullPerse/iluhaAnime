use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use tauri::{
    AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    WindowEvent,
};
use tauri_plugin_libmpv::{MpvConfig, VideoMarginRatio};

use super::core::{LibmpvCore, PlayerCore};
use super::state::{save_current_watch, PlayerHost, PlayerOpenRequest, PlaylistWatch, StreamOpen};
use super::watch::{self, WatchState};
use super::{PLAYER_ROUTE, PLAYER_WINDOW_LABEL};
use crate::app_db;
use crate::{WINDOW_CHROME_KEY, WINDOW_CHROME_NAMESPACE};

fn cached_player_decorations(app: &AppHandle) -> bool {
    app_db::read_cached_payload(app, WINDOW_CHROME_NAMESPACE, WINDOW_CHROME_KEY)
        .ok()
        .flatten()
        .and_then(|payload| serde_json::from_str::<Value>(&payload).ok())
        .and_then(|value| value.get("decorations")?.as_bool())
        .unwrap_or(true)
}

pub(crate) fn observed_properties() -> Value {
    json!({
        "time-pos": "double",
        "duration": "double",
        "pause": "flag",
        "eof-reached": "flag",
        "speed": "double",
        "volume": "double",
        "mute": "flag",
        "playlist-pos": "int64",
        "playlist-count": "int64",
        "path": "string",
        "paused-for-cache": "flag",
        // Cache counters drive the buffering overlay. Without observing them a
        // stalled stream stops changing time-pos, so no snapshot is emitted and
        // the overlay never appears.
        "cache-buffering-state": "double",
        "cache-speed": "double",
        "demuxer-cache-duration": "double",
        "track-list": "node",
        "chapter-list": "node",
    })
}

pub(crate) fn with_structural_options(options: Value) -> Value {
    let mut map = options.as_object().cloned().unwrap_or_default();
    for (key, value) in [
        ("idle", json!("yes")),
        ("osc", json!("no")),
        ("terminal", json!("no")),
        ("input-default-bindings", json!("no")),
        ("input-vo-keyboard", json!("no")),
        ("vo", json!("gpu-next")),
    ] {
        map.insert(key.to_string(), value);
    }
    Value::Object(map)
}

const ALLOWED_INITIAL_OPTIONS: &[&str] = &[
    "hwdec",
    "volume",
    "mute",
    "keep-open",
    "video-rotate",
    "panscan",
    "video-zoom",
    "brightness",
    "contrast",
    "saturation",
    "hue",
    "sub-font-size",
    "sub-font",
    "sub-color",
    "sub-back-color",
    "sub-use-margins",
    "sub-ass-force-margins",
    "vf",
    "keepaspect",
    "video-aspect-override",
    "video-margin-ratio-top",
    "video-margin-ratio-bottom",
    "video-margin-ratio-left",
    "video-margin-ratio-right",
];

pub(crate) fn sanitize_initial_options(options: Value) -> Value {
    let Some(map) = options.as_object() else {
        return options;
    };
    let mut kept = serde_json::Map::new();
    for (key, value) in map {
        if ALLOWED_INITIAL_OPTIONS.contains(&key.as_str()) {
            kept.insert(key.clone(), value.clone());
        } else {
            tracing::warn!(
                key,
                "player_init: dropping unrecognized mpv option (would hang mpv initialization)"
            );
        }
    }
    Value::Object(kept)
}

fn core(app: &AppHandle) -> LibmpvCore {
    LibmpvCore::new(app.clone())
}

/// Drops the legacy hover-frame/sprite cache. The spritemap pipeline was
/// removed, so frames already on disk would otherwise sit there forever.
fn drop_legacy_hover_cache(app: &AppHandle) {
    let dir = crate::video::thumbnail_cache_dir(app).join("player-hover");
    if dir.is_dir() {
        let _ = std::fs::remove_dir_all(&dir);
    }
}

fn load_queue(
    app: &AppHandle,
    window: &str,
    files: &[String],
    resume: Option<f64>,
    start_index: Option<usize>,
) -> Result<(), String> {
    if files.is_empty() {
        return Err("no file to play".to_string());
    }
    let backend = core(app);
    // Playback starts at `start_index`, but the mpv playlist is still built
    // in the given (sorted) order: the start file loads first so the resume
    // `start=` applies to it, then the files before it are inserted at the
    // front in order and the rest appended. Previously the frontend rotated
    // the queue, which reordered the whole playlist (e.g. 9..12 then 1..8).
    let start = start_index.unwrap_or(0).min(files.len() - 1);
    let start_file = &files[start];
    let mut args: Vec<Value> = vec![json!(start_file), json!("replace")];
    if let Some(position) = resume {
        if position > 0.0 {
            args.push(json!(-1));
            args.push(json!(format!("start={position}")));
        }
    }
    tracing::debug!("load_queue: start file {start_file} (index {start})");
    match backend.command("loadfile", &args, window) {
        Ok(()) => tracing::debug!("load_queue: loadfile ok"),
        Err(error) => {
            tracing::warn!("load_queue: loadfile failed: {error}");
            return Err(error);
        }
    }
    for file in &files[start + 1..] {
        if let Err(error) = backend.command("loadfile", &[json!(file), json!("append")], window) {
            tracing::warn!("load_queue: append failed for {file}: {error}");
            return Err(error);
        }
    }
    for (index, file) in files[..start].iter().enumerate() {
        if let Err(error) = backend.command(
            "loadfile",
            &[json!(file), json!("insert-at"), json!(index)],
            window,
        ) {
            tracing::warn!("load_queue: insert failed for {file}: {error}");
            return Err(error);
        }
    }
    if window == PLAYER_WINDOW_LABEL {
        let host = app.state::<PlayerHost>();
        host.set_current_path(start_file.clone());
        host.set_stream_watch_key(None);
        host.clear_pending_open();
        host.mark_dirty();
    }
    Ok(())
}

#[tauri::command]
pub async fn player_open(
    app: AppHandle,
    files: Vec<String>,
    resume: Option<f64>,
    start_index: Option<usize>,
    watch: Option<PlaylistWatch>,
) -> Result<(), String> {
    drop_legacy_hover_cache(&app);
    if files.iter().any(|file| file.is_empty()) {
        return Err("player_open received an empty file path".to_string());
    }
    let request = PlayerOpenRequest {
        files,
        resume,
        start_index,
        watch,
        stream: None,
    };

    let host = app.state::<PlayerHost>();
    if host.is_active() {
        host.set_pending_open(Some(request.clone()));
        app.emit_to(PLAYER_WINDOW_LABEL, "player-open-request", &request)
            .map_err(|error| error.to_string())?;
        if let Some(window) = app.get_webview_window(PLAYER_WINDOW_LABEL) {
            let _ = window.show();
            let _ = window.set_focus();
        }
        return load_queue(
            &app,
            PLAYER_WINDOW_LABEL,
            &request.files,
            resume,
            start_index,
        );
    }

    if app.get_webview_window(PLAYER_WINDOW_LABEL).is_some() {
        let host = app.state::<PlayerHost>();
        host.set_pending_open(Some(request.clone()));
        app.emit_to(PLAYER_WINDOW_LABEL, "player-open-request", &request)
            .map_err(|error| error.to_string())?;
        if let Some(window) = app.get_webview_window(PLAYER_WINDOW_LABEL) {
            let _ = window.show();
            let _ = window.set_focus();
        }
        return Ok(());
    }

    app.state::<PlayerHost>().set_pending_open(Some(request));

    let window = match WebviewWindowBuilder::new(
        &app,
        PLAYER_WINDOW_LABEL,
        WebviewUrl::App(PLAYER_ROUTE.into()),
    )
    .title("iluhaAnime")
    .inner_size(1280.0, 720.0)
    .min_inner_size(480.0, 300.0)
    .decorations(cached_player_decorations(&app))
    .transparent(true)
    .center()
    .build()
    {
        Ok(window) => window,
        Err(error) => {
            app.state::<PlayerHost>().set_pending_open(None);
            return Err(format!("create player window: {error}"));
        }
    };
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            let backend = LibmpvCore::new(app.clone());
            let host = app.state::<PlayerHost>();
            host.set_active(false);
            drop(tauri::async_runtime::spawn_blocking(move || {
                backend.destroy(PLAYER_WINDOW_LABEL)
            }));
        }
    });
    let _ = window.set_focus();
    Ok(())
}

/// Open a stream media URL in the existing libmpv player.
///
/// Sets per-source `http-header-fields` on mpv before loading, then loads the
/// media URL with `loadfile ... replace`. When `resume` is set, seeks to that
/// position via `start=`. Emits `player-open-request` so the frontend can
/// capture session state (position, pause) before the replacement.
#[tauri::command]
pub async fn player_open_stream(app: AppHandle, stream: StreamOpen) -> Result<(), String> {
    drop_legacy_hover_cache(&app);

    // Flush the position of whatever is playing before the file is replaced.
    // The periodic watch save runs every ten seconds; without this a switch
    // made right after the last tick would lose that window on a crash.
    save_current_watch(&app);

    let request = PlayerOpenRequest {
        files: vec![stream.media_url.clone()],
        resume: stream.resume,
        start_index: Some(0),
        watch: None,
        stream: Some(stream.clone()),
    };

    // An open player window always takes the same path: the request is queued,
    // the window is raised, and the stream is loaded. Whether mpv is already
    // initialized is not a reason to leave the player on the previous frame.
    if app.get_webview_window(PLAYER_WINDOW_LABEL).is_some() {
        let host = app.state::<PlayerHost>();
        host.set_pending_open(Some(request.clone()));
        app.emit_to(PLAYER_WINDOW_LABEL, "player-open-request", &request)
            .map_err(|error| error.to_string())?;
        if let Some(window) = app.get_webview_window(PLAYER_WINDOW_LABEL) {
            let _ = window.show();
            let _ = window.set_focus();
        }
        // A window that exists but has not initialized mpv yet cannot take the
        // load here. Leave the request pending: `player_init` loads it once the
        // instance is ready.
        if !host.is_active() {
            return Ok(());
        }
        return load_stream_queue(&app, PLAYER_WINDOW_LABEL, &request);
    }

    app.state::<PlayerHost>().set_pending_open(Some(request));

    let window = match WebviewWindowBuilder::new(
        &app,
        PLAYER_WINDOW_LABEL,
        WebviewUrl::App(PLAYER_ROUTE.into()),
    )
    .title("iluhaAnime")
    .inner_size(1280.0, 720.0)
    .min_inner_size(480.0, 300.0)
    .decorations(cached_player_decorations(&app))
    .transparent(true)
    .center()
    .build()
    {
        Ok(window) => window,
        Err(error) => {
            app.state::<PlayerHost>().set_pending_open(None);
            return Err(format!("create player window: {error}"));
        }
    };
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            let backend = LibmpvCore::new(app.clone());
            let host = app.state::<PlayerHost>();
            host.set_active(false);
            drop(tauri::async_runtime::spawn_blocking(move || {
                backend.destroy(PLAYER_WINDOW_LABEL)
            }));
        }
    });
    let _ = window.set_focus();
    Ok(())
}

/// Build mpv's `http-header-fields` value: `Name: value,Name2: value2`.
///
/// A name or value that could split the option (comma, colon in the name,
/// CR/LF) is dropped instead of injected: the value comes from a remote API.
fn header_fields(headers: &BTreeMap<String, String>) -> String {
    headers
        .iter()
        .filter_map(|(name, value)| {
            let name = name.trim();
            let value = value.trim();
            if name.is_empty() || value.is_empty() {
                return None;
            }
            let bad = |text: &str| text.contains(['\r', '\n', ',']);
            if bad(name) || name.contains(':') || bad(value) {
                return None;
            }
            Some(format!("{name}: {value}"))
        })
        .collect::<Vec<_>>()
        .join(",")
}

/// mpv knows `socks5`/`socks4`, not the remote-DNS spellings reqwest uses.
fn mpv_proxy(url: &str) -> String {
    url.trim()
        .replacen("socks5h://", "socks5://", 1)
        .replacen("socks4a://", "socks4://", 1)
}

/// mpv's cache settings for a stream source.
///
/// The player's profiles are tuned for local files, where one second of
/// readahead is enough; a stream is read over the network and the same setting
/// stalls on every hiccup. Twenty seconds covers a slow CDN, the byte cap keeps
/// a long 4K title from eating the RAM, and the back buffer makes a small jump
/// backwards come from memory instead of a new request.
fn stream_cache_options() -> Value {
    json!({
        "demuxer-readahead-secs": 20.0,
        "demuxer-max-bytes": "256MiB",
        "demuxer-max-back-bytes": "96MiB",
    })
}

/// Load a stream URL into mpv: set the proxy, `http-header-fields` and the
/// pause state, then `loadfile ... replace` with optional `start=` for resume.
///
/// Shared by the open command and by `player_init`, so a stream that arrived
/// while the window was still initializing is not lost. The pending request is
/// left in place: the window takes it to restore the session identity.
fn load_stream_media(
    app: &AppHandle,
    window: &str,
    request: &PlayerOpenRequest,
) -> Result<(), String> {
    let Some(stream) = &request.stream else {
        return Err("load_stream_media called without stream".to_string());
    };

    let backend = core(app);

    // Always write both options, including empty values: a previous source's
    // route and headers must not leak into a stream that needs none.
    let proxy = stream
        .proxy_url
        .as_deref()
        .map(mpv_proxy)
        .unwrap_or_default();
    backend
        .set_property("http-proxy", &json!(proxy), window)
        .map_err(|error| format!("set http-proxy: {error}"))?;

    let header_string = header_fields(&stream.headers);
    backend
        .set_property("http-header-fields", &json!(header_string), window)
        .map_err(|error| format!("set http-header-fields: {error}"))?;

    // A deeper cache than the profile sets: the stream is not on disk.
    if let Some(options) = stream_cache_options().as_object() {
        for (name, value) in options {
            backend
                .set_property(name, value, window)
                .map_err(|error| format!("set {name} for stream: {error}"))?;
        }
    }

    // `pause` is set before the file loads: mpv keeps the player paused while
    // it opens, which is what a quality switch from a paused stream needs.
    backend
        .set_property("pause", &json!(stream.paused), window)
        .map_err(|error| format!("set pause for stream: {error}"))?;

    let mut args: Vec<Value> = vec![json!(stream.media_url), json!("replace")];
    if let Some(position) = request.resume {
        if position > 0.0 {
            args.push(json!(-1));
            args.push(json!(format!("start={position}")));
        }
    }

    backend
        .command("loadfile", &args, window)
        .map_err(|error| format!("loadfile stream: {error}"))?;

    Ok(())
}

/// Load a stream and make it the player's current session.
fn load_stream_queue(
    app: &AppHandle,
    window: &str,
    request: &PlayerOpenRequest,
) -> Result<(), String> {
    load_stream_media(app, window, request)?;

    if window == PLAYER_WINDOW_LABEL {
        let host = app.state::<PlayerHost>();
        if let Some(stream) = &request.stream {
            host.set_current_path(stream.media_url.clone());
            host.set_stream_watch_key(Some(stream.watch_key.clone()));
        }
        host.clear_pending_open();
        host.mark_dirty();
    }
    Ok(())
}

#[tauri::command]
pub fn player_take_pending_open(host: State<'_, PlayerHost>) -> Option<PlayerOpenRequest> {
    let request = host.pending_open();
    tracing::debug!(
        "player_take_pending_open: {:?}",
        request.as_ref().map(|request| request.files.len())
    );
    request
}

#[tauri::command]
pub async fn player_init(
    app: AppHandle,
    window: WebviewWindow,
    initial_options: Value,
) -> Result<String, String> {
    let label = window.label().to_string();
    let config: MpvConfig = serde_json::from_value(json!({
        "initialOptions": with_structural_options(sanitize_initial_options(initial_options)),
        "observedProperties": observed_properties(),
    }))
    .map_err(|error| format!("invalid player options: {error}"))?;

    let backend = core(&app);
    tracing::debug!("player_init: creating mpv instance for {label}");
    let init_label = label.clone();
    let joined =
        tauri::async_runtime::spawn_blocking(move || backend.init(config, &init_label)).await;
    match joined {
        Ok(Ok(ready)) => tracing::debug!("player_init: instance ready label={ready}"),
        Ok(Err(error)) => {
            tracing::warn!("player_init: mpv init failed: {error}");
            return Err(error);
        }
        Err(error) => return Err(format!("player init task failed: {error}")),
    };

    if label == PLAYER_WINDOW_LABEL {
        let host = app.state::<PlayerHost>();
        host.set_active(true);
        // A stream opened before mpv was ready is waiting in the pending
        // request. Load it now and keep the request, so the window can still
        // take it and restore the session identity.
        if let Some(request) = host.pending_open() {
            if request.stream.is_some() {
                load_stream_media(&app, PLAYER_WINDOW_LABEL, &request)?;
            }
        }
    }
    Ok(label)
}

#[tauri::command]
pub async fn player_destroy(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    let label = window.label().to_string();
    tracing::debug!("player_destroy: tearing down mpv instance for {label}");
    if label == PLAYER_WINDOW_LABEL {
        save_current_watch(&app);
        app.state::<PlayerHost>().set_active(false);
    }
    let result = destroy_instance(app, label).await;
    match &result {
        Ok(()) => tracing::debug!("player_destroy: instance torn down"),
        Err(error) => tracing::warn!("player_destroy: instance teardown failed: {error}"),
    }
    result
}

async fn destroy_instance(app: AppHandle, label: String) -> Result<(), String> {
    let backend = core(&app);
    tauri::async_runtime::spawn_blocking(move || backend.destroy(&label))
        .await
        .map_err(|error| format!("player destroy task failed: {error}"))?
}

#[tauri::command]
pub async fn player_close_window(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    let label = window.label().to_string();
    if label == PLAYER_WINDOW_LABEL {
        save_current_watch(&app);
        app.state::<PlayerHost>().set_active(false);
    }
    let handle = app.get_webview_window(&label);
    destroy_instance(app, label).await?;
    if let Some(window) = handle {
        return window.close().map_err(|error| error.to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn player_load(
    app: AppHandle,
    window: WebviewWindow,
    files: Vec<String>,
    resume: Option<f64>,
    start_index: Option<usize>,
) -> Result<(), String> {
    let label = window.label().to_string();
    tracing::debug!(
        "player_load: {} file(s) resume={resume:?} start={start_index:?}",
        files.len()
    );
    load_queue(&app, &label, &files, resume, start_index)
}

#[tauri::command]
pub async fn player_append_files(
    app: AppHandle,
    window: WebviewWindow,
    files: Vec<String>,
    mode: String,
) -> Result<(), String> {
    if mode != "append" && mode != "append-play" {
        return Err(format!("unknown append mode: {mode}"));
    }
    let label = window.label().to_string();
    let backend = core(&app);
    for file in &files {
        if let Err(error) = backend.command("loadfile", &[json!(file), json!(mode)], &label) {
            return Err(error);
        }
    }
    Ok(())
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistInsert {
    pub path: String,
    pub index: usize,
}

#[tauri::command]
pub async fn player_insert_files(
    app: AppHandle,
    window: WebviewWindow,
    items: Vec<PlaylistInsert>,
) -> Result<(), String> {
    let label = window.label().to_string();
    if label != PLAYER_WINDOW_LABEL {
        return Err("playlist inserts only work in the player window".to_string());
    }
    let backend = core(&app);
    for item in &items {
        if item.path.is_empty() {
            return Err("player_insert_files received an empty file path".to_string());
        }
        backend.command("loadfile", &[json!(item.path), json!("append")], &label)?;
        // Move straight after appending: playlist-move keeps the entry count,
        // so no intermediate playlist-count sample can expose the tail slot.
        let count = scalar_int(&app, &label, "playlist-count").unwrap_or(0);
        let from = count - 1;
        if from < 0 {
            return Err(format!("playlist is empty after appending {}", item.path));
        }
        backend.command("playlist-move", &[json!(from), json!(item.index)], &label)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn player_save_frame(
    window: WebviewWindow,
) -> Result<crate::screenshot::SavedScreenshot, String> {
    let label = window.label().to_string();
    if label != PLAYER_WINDOW_LABEL {
        return Err("clean frames only work in the player window".to_string());
    }
    let dir = std::path::PathBuf::from(crate::screenshot::default_dir(&window));
    if !dir.is_dir() {
        return Err("the pictures folder is missing".to_string());
    }
    let target = crate::screenshot::resolve_target(&dir, "iluhaAnime_screenshot", "png");
    let app = window.app_handle();
    core(&app).command(
        "screenshot-to-file",
        &[json!(target.to_string_lossy())],
        &label,
    )?;
    let target_clone = target.clone();
    let (width, height) = tokio::task::spawn_blocking(move || -> Result<(u32, u32), String> {
        let img =
            image::open(&target_clone).map_err(|error| format!("read the clean frame: {error}"))?;
        use image::GenericImageView;
        Ok(img.dimensions())
    })
    .await
    .map_err(|error| format!("frame task failed: {error}"))??;
    Ok(crate::screenshot::SavedScreenshot {
        path: target.to_string_lossy().to_string(),
        width,
        height,
    })
}

#[tauri::command]
pub async fn player_command(
    app: AppHandle,
    window: WebviewWindow,
    name: String,
    args: Vec<Value>,
) -> Result<(), String> {
    let label = window.label().to_string();
    core(&app).command(&name, &args, &label)
}

#[tauri::command]
pub async fn player_set_property(
    app: AppHandle,
    window: WebviewWindow,
    name: String,
    value: Value,
) -> Result<(), String> {
    let label = window.label().to_string();
    core(&app).set_property(&name, &value, &label)
}

#[tauri::command]
pub async fn player_get_property(
    app: AppHandle,
    window: WebviewWindow,
    name: String,
    format: String,
) -> Result<Value, String> {
    if format == "node" {
        return Err("node property format is disabled: it crashes the bundled wrapper".to_string());
    }
    let label = window.label().to_string();
    core(&app).get_property(&name, &format, &label)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistEntry {
    pub index: i64,
    pub filename: String,
    pub title: String,
}

fn scalar_int(app: &AppHandle, label: &str, name: &str) -> Option<i64> {
    core(app)
        .get_property(name, "int64", label)
        .ok()
        .and_then(|value| value.as_i64())
}

fn scalar_string(app: &AppHandle, label: &str, name: &str) -> Option<String> {
    core(app)
        .get_property(name, "string", label)
        .ok()
        .and_then(|value| value.as_str().map(str::to_string))
}

#[tauri::command]
pub async fn player_playlist_entries(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<Vec<PlaylistEntry>, String> {
    let label = window.label().to_string();
    let count = scalar_int(&app, &label, "playlist-count").unwrap_or(0);
    if count <= 0 {
        return Ok(Vec::new());
    }
    let mut entries = Vec::with_capacity(count as usize);
    for index in 0..count {
        let filename =
            scalar_string(&app, &label, &format!("playlist/{index}/filename")).unwrap_or_default();
        let title =
            scalar_string(&app, &label, &format!("playlist/{index}/title")).unwrap_or_default();
        entries.push(PlaylistEntry {
            index,
            filename,
            title,
        });
    }
    Ok(entries)
}

#[tauri::command]
pub async fn player_set_video_margin_ratio(
    app: AppHandle,
    window: WebviewWindow,
    left: Option<f64>,
    right: Option<f64>,
    top: Option<f64>,
    bottom: Option<f64>,
) -> Result<(), String> {
    let label = window.label().to_string();
    core(&app).set_video_margin_ratio(
        VideoMarginRatio {
            left,
            right,
            top,
            bottom,
        },
        &label,
    )
}

/// Absolute path of a bundled player shader, in the forward-slash form mpv
/// expects on Windows.
#[tauri::command]
pub fn player_shader_path(app: AppHandle, id: String) -> Result<String, String> {
    let filename = crate::shaders::player_shader_file(&id)
        .ok_or_else(|| format!("unknown player shader: {id}"))?;
    let dir = crate::shaders::shader_dir(&app)
        .ok_or_else(|| "player shader directory is unavailable".to_string())?;
    let path = dir.join(filename);
    if !path.is_file() {
        return Err(format!("player shader is missing: {}", path.display()));
    }
    Ok(path.to_string_lossy().replace('\\', "/"))
}

/// Maps an end-of-file mode onto mpv properties.
/// `none` stops after the current file (`keep-open=always` pauses on the last
/// frame and never auto-advances, the Finished screen covers it).
/// `pause` plays through the playlist and pauses on the last frame of the
/// last file. `next` plays through and idles at the end. `repeat` loops
/// the current file.
fn eof_properties(mode: &str) -> Option<(&'static str, &'static str, &'static str)> {
    match mode {
        "none" => Some(("always", "no", "no")),
        "pause" => Some(("yes", "no", "no")),
        "next" => Some(("no", "no", "no")),
        "repeat" => Some(("no", "inf", "no")),
        _ => None,
    }
}

#[tauri::command]
pub async fn player_eof_mode(
    app: AppHandle,
    window: WebviewWindow,
    mode: String,
) -> Result<(), String> {
    let backend = core(&app);
    let label = window.label().to_string();
    let Some((keep_open, loop_file, loop_playlist)) = eof_properties(&mode) else {
        return Err(format!("unknown end-of-file mode: {mode}"));
    };
    tracing::debug!("player_eof_mode: {mode}");
    backend.set_property("keep-open", &json!(keep_open), &label)?;
    backend.set_property("loop-file", &json!(loop_file), &label)?;
    backend.set_property("loop-playlist", &json!(loop_playlist), &label)?;
    Ok(())
}

#[tauri::command]
pub fn player_save_watch(app: AppHandle, path: String, state: WatchState) -> Result<(), String> {
    watch::save(&app, &path, &state)
}

#[tauri::command]
pub fn player_load_watch(app: AppHandle, path: String) -> Option<WatchState> {
    watch::load(&app, &path)
}

/// Applies the whole per-file playback state in one IPC roundtrip instead of
/// 4-5 sequential property commands (speed, delays, persisted tracks).
#[tauri::command]
pub fn player_apply_file_state(
    app: AppHandle,
    window: WebviewWindow,
    speed: f64,
    sub_delay: f64,
    audio_delay: f64,
    audio_track: Option<i64>,
    subtitle_track: Option<i64>,
) -> Result<(), String> {
    let backend = core(&app);
    let label = window.label().to_string();
    backend.set_property("speed", &json!(speed), &label)?;
    backend.set_property("sub-delay", &json!(sub_delay), &label)?;
    backend.set_property("audio-delay", &json!(audio_delay), &label)?;
    if let Some(id) = audio_track {
        backend.set_property("aid", &json!(id.to_string()), &label)?;
    }
    if let Some(id) = subtitle_track {
        backend.set_property("sid", &json!(id.to_string()), &label)?;
    }
    Ok(())
}

/// Build the hidden player window ahead of the click that needs it.
///
/// The app warms it once at startup, but the window is gone after the user
/// closes the player, and the next stream would then pay for a cold WebView and
/// a cold mpv. The catalog calls this when a title modal opens, so that window
/// is back before the episode click arrives. Calling it again while the window
/// exists is a no-op.
#[tauri::command]
pub async fn player_prewarm(app: AppHandle) -> Result<(), String> {
    prewarm_player(app).await
}

pub async fn prewarm_player(app: AppHandle) -> Result<(), String> {
    let label = PLAYER_WINDOW_LABEL.to_string();

    if app.get_webview_window(&label).is_some() {
        return Ok(());
    }

    let window = match WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(PLAYER_ROUTE.into()))
        .title("iluhaAnime")
        .inner_size(1280.0, 720.0)
        .min_inner_size(480.0, 300.0)
        .decorations(false)
        .transparent(true)
        .visible(false)
        .center()
        .build()
    {
        Ok(window) => window,
        Err(error) => return Err(format!("prewarm create window: {error}")),
    };

    let _ = window.set_focus();

    let app_for_event = app.clone();
    let label_for_event = label.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            let backend = LibmpvCore::new(app_for_event.clone());
            let host = app_for_event.state::<PlayerHost>();
            host.set_active(false);
            let label_for_destroy = label_for_event.clone();
            drop(tauri::async_runtime::spawn_blocking(move || {
                backend.destroy(&label_for_destroy)
            }));
        }
    });

    // The window's own `player_init` creates mpv with the stored volume,
    // hwdec and video options. Initializing it here with an empty option set
    // raced that call: whichever init won decided the first file's volume, and
    // the empty one played at mpv's default 100% while the UI showed the
    // stored value. The hidden window still loads the player route, so mpv is
    // warmed by the frontend init that carries the real options.
    tracing::info!("player prewarm complete");
    Ok(())
}

#[allow(dead_code)]
#[tauri::command]
pub async fn player_apply_batch(
    app: AppHandle,
    window: WebviewWindow,
    properties: Vec<(String, Value)>,
) -> Result<(), String> {
    let label = window.label().to_string();
    let backend = core(&app);
    let results: Vec<Result<(), String>> = properties
        .into_iter()
        .map(|(name, value)| backend.set_property(&name, &value, &label))
        .collect();

    let mut failed: Vec<String> = Vec::new();
    for (i, result) in results.into_iter().enumerate() {
        if let Err(error) = result {
            failed.push(format!("{}: {}", i, error));
        }
    }

    if !failed.is_empty() {
        return Err(format!("player_apply_batch: {}", failed.join(", ")));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        eof_properties, header_fields, mpv_proxy, observed_properties, stream_cache_options,
        PlayerOpenRequest, PlaylistWatch,
    };
    use std::collections::BTreeMap;

    #[test]
    fn mpv_proxy_uses_the_scheme_mpv_understands() {
        assert_eq!(
            mpv_proxy("socks5h://127.0.0.1:10808"),
            "socks5://127.0.0.1:10808"
        );
        assert_eq!(
            mpv_proxy("socks4a://127.0.0.1:1080"),
            "socks4://127.0.0.1:1080"
        );
        assert_eq!(
            mpv_proxy(" http://127.0.0.1:7890 "),
            "http://127.0.0.1:7890"
        );
        assert_eq!(mpv_proxy(""), "");
    }

    #[test]
    fn buffering_properties_are_observed_so_a_stalled_stream_still_reports() {
        let properties = observed_properties();
        assert_eq!(properties["paused-for-cache"], "flag");
        assert_eq!(properties["cache-buffering-state"], "double");
        assert_eq!(properties["cache-speed"], "double");
        assert_eq!(properties["demuxer-cache-duration"], "double");
    }

    #[test]
    fn streams_get_a_deeper_cache_than_local_files() {
        let options = stream_cache_options();
        let readahead = options["demuxer-readahead-secs"]
            .as_f64()
            .expect("readahead is a number");
        // The profiles give a local file one second; a stream needs more than a
        // hiccup's worth.
        assert!(readahead >= 10.0);
        assert_eq!(options["demuxer-max-bytes"], "256MiB");
        assert_eq!(options["demuxer-max-back-bytes"], "96MiB");
    }

    #[test]
    fn headers_are_comma_joined_without_extra_spaces() {
        let mut headers = BTreeMap::new();
        headers.insert("Referer".to_string(), "https://anilib.me/ru/".to_string());
        headers.insert("User-Agent".to_string(), "Test/1".to_string());
        assert_eq!(
            header_fields(&headers),
            "Referer: https://anilib.me/ru/,User-Agent: Test/1"
        );
    }

    #[test]
    fn headers_that_could_split_the_option_are_dropped() {
        let mut headers = BTreeMap::new();
        headers.insert("Bad,Name".to_string(), "x".to_string());
        headers.insert("X-Injected".to_string(), "a\r\nY: b".to_string());
        headers.insert("Empty".to_string(), "  ".to_string());
        headers.insert("Good".to_string(), "https://cdn.example/a.m3u8".to_string());
        assert_eq!(header_fields(&headers), "Good: https://cdn.example/a.m3u8");
    }

    #[test]
    fn no_headers_produce_the_empty_value_that_clears_mpv() {
        assert_eq!(header_fields(&BTreeMap::new()), "");
    }

    #[test]
    fn eof_modes_map_to_mpv_keep_open_and_loop_properties() {
        assert_eq!(eof_properties("none"), Some(("always", "no", "no")));
        assert_eq!(eof_properties("pause"), Some(("yes", "no", "no")));
        assert_eq!(eof_properties("next"), Some(("no", "no", "no")));
        assert_eq!(eof_properties("repeat"), Some(("no", "inf", "no")));
    }

    #[test]
    fn unknown_eof_mode_maps_to_nothing() {
        assert_eq!(eof_properties("loop-everything"), None);
        assert_eq!(eof_properties(""), None);
    }

    #[test]
    fn open_request_watch_roundtrips_as_camel_case() {
        use super::super::state::TorrentWatch;
        let request = PlayerOpenRequest {
            files: vec!["C:/T/ep1.mkv".to_string()],
            resume: None,
            start_index: Some(0),
            watch: Some(PlaylistWatch::Torrent(TorrentWatch {
                torrent_id: 7,
                save_dir: "C:/T".to_string(),
                anchor: "C:/T/ep1.mkv".to_string(),
            })),
            stream: None,
        };
        let json = serde_json::to_value(&request).expect("request serializes");
        assert_eq!(json["watch"]["kind"], "torrent");
        assert_eq!(json["watch"]["torrentId"], 7);
        assert_eq!(json["watch"]["saveDir"], "C:/T");
        assert_eq!(json["watch"]["anchor"], "C:/T/ep1.mkv");
        let back: PlayerOpenRequest = serde_json::from_value(json).expect("request deserializes");
        assert!(matches!(back.watch, Some(PlaylistWatch::Torrent(_))));
    }

    #[test]
    fn open_request_without_watch_deserializes() {
        let back: PlayerOpenRequest =
            serde_json::from_str(r#"{"files":["a.mkv"]}"#).expect("request deserializes");
        assert!(back.watch.is_none());
        assert!(back.resume.is_none());
        assert!(back.start_index.is_none());
    }
}
