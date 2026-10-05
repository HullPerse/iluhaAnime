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
use crate::session::state::SessionHost;

fn observed_properties() -> Value {
    json!({
        "time-pos": "double",
        "duration": "double",
        "pause": "flag",
        "eof-reached": "flag",
        "speed": "double",
        "volume": "double",
        "mute": "flag",
        "playlist-index": "int64",
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
    "brightness",
    "contrast",
    "saturation",
    "hue",
    "gamma",
    "sub-font-size",
    "sub-font",
    "sub-color",
    "sub-back-color",
    "vf",
    "keepaspect",
    "video-aspect-override",
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

fn load_queue(
    app: &AppHandle,
    window: &str,
    files: &[String],
    resume: Option<f64>,
) -> Result<(), String> {
    let Some(first) = files.first() else {
        return Err("no file to play".to_string());
    };
    let backend = core(app);
    backend.set_property("speed", &json!(1.0), window)?;
    let mut args: Vec<Value> = vec![json!(first), json!("replace")];
    if let Some(position) = resume {
        if position > 0.0 {
            args.push(json!(-1));
            args.push(json!(format!("start={position}")));
        }
    }
    tracing::debug!("load_queue: first file {first}");
    match backend.command("loadfile", &args, window) {
        Ok(()) => tracing::debug!("load_queue: loadfile ok"),
        Err(error) => {
            tracing::warn!("load_queue: loadfile failed: {error}");
            return Err(error);
        }
    }
    for file in &files[1..] {
        if let Err(error) =
            backend.command("loadfile", &[json!(file), json!("append-play")], window)
        {
            tracing::warn!("load_queue: append failed for {file}: {error}");
            return Err(error);
        }
    }
    if window == PLAYER_WINDOW_LABEL {
        let host = app.state::<PlayerHost>();
        host.set_current_path(first.clone());
        host.clear_pending_open();
        host.mark_dirty();
    }
    Ok(())
}

/// Manual opens are banned while a Watch Party session runs; only
/// room-driven plan starts may replace the player source, even when the
/// room has not started broadcasting yet.
const fn manual_open_blocked(session_active: bool, room_driven: bool) -> bool {
    session_active && !room_driven
}

#[tauri::command]
pub async fn player_open(
    app: AppHandle,
    session: State<'_, SessionHost>,
    files: Vec<String>,
    resume: Option<f64>,
    room_driven: Option<bool>,
) -> Result<(), String> {
    if files.iter().any(|file| file.is_empty()) {
        return Err("player_open received an empty file path".to_string());
    }
    if manual_open_blocked(session.has_runtime(), room_driven.unwrap_or(false)) {
        return Err("player_open is disabled while a watch party session is active".to_string());
    }
    let request = PlayerOpenRequest { files, resume };

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

    let window = WebviewWindowBuilder::new(
        &app,
        PLAYER_WINDOW_LABEL,
        WebviewUrl::App(PLAYER_ROUTE.into()),
    )
    .title("iluhaAnime")
    .inner_size(1280.0, 720.0)
    .min_inner_size(480.0, 300.0)
    .transparent(true)
    .center()
    .build()
    .map_err(|error| format!("create player window: {error}"))?;
    let destroyed_app = app.clone();
    let _ = window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Destroyed) {
            let backend = LibmpvCore::new(destroyed_app.clone());
            let host = destroyed_app.state::<PlayerHost>();
            host.set_active(false);
            let _ =
                tauri::async_runtime::spawn_blocking(move || backend.destroy(PLAYER_WINDOW_LABEL));
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
) -> Result<(), String> {
    let label = window.label().to_string();
    tracing::debug!("player_load: {} file(s) resume={resume:?}", files.len());
    load_queue(&app, &label, &files, resume)
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

#[tauri::command]
pub async fn player_eof_mode(
    app: AppHandle,
    window: WebviewWindow,
    mode: String,
) -> Result<(), String> {
    let backend = core(&app);
    let label = window.label().to_string();
    let (keep_open, loop_file, loop_playlist) = match mode.as_str() {
        "none" => ("no", "no", "no"),
        "pause" => ("yes", "no", "no"),
        "next" => ("no", "no", "inf"),
        "repeat" => ("no", "inf", "no"),
        other => return Err(format!("unknown end-of-file mode: {other}")),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manual_open_blocked_only_for_non_room_opens_in_a_session() {
        assert!(!manual_open_blocked(false, false));
        assert!(!manual_open_blocked(false, true));
        assert!(!manual_open_blocked(true, true));
        assert!(manual_open_blocked(true, false));
    }
}
