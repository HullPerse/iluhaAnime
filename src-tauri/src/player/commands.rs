use serde::Serialize;
use serde_json::{json, Value};
use tauri::{
    AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    WindowEvent,
};
use tauri_plugin_libmpv::{MpvConfig, VideoMarginRatio};

use super::core::{LibmpvCore, PlayerCore};
use super::state::{save_current_watch, PlayerHost, PlayerOpenRequest};
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

fn observed_properties() -> Value {
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
        "track-list": "node",
        "chapter-list": "node",
    })
}

fn with_structural_options(options: Value) -> Value {
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

fn sanitize_initial_options(options: Value) -> Value {
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
) -> Result<(), String> {
    drop_legacy_hover_cache(&app);
    if files.iter().any(|file| file.is_empty()) {
        return Err("player_open received an empty file path".to_string());
    }
    let request = PlayerOpenRequest {
        files,
        resume,
        start_index,
    };

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
        app.state::<PlayerHost>().set_active(true);
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

#[cfg(test)]
mod tests {
    use super::eof_properties;

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
}
