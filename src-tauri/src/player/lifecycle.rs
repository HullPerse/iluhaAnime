//! Player window and mpv lifecycle.
//!
//! Creating the window, initializing and destroying its mpv instance, closing
//! it and keeping the hidden prewarm alive are one concern: they all touch the
//! same close-phase state machine. That machine lives on `PlayerHost` (the
//! `begin_close` / `finish_close` methods) and is only driven from here, so a
//! change to teardown has one place to read.

use serde_json::{json, Value};
use tauri::{
    AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    WindowEvent,
};
use tauri_plugin_libmpv::{MpvConfig, MpvExt};

use super::core::PlayerCore;
use super::load::load_stream_media;
use super::options::{observed_properties, sanitize_initial_options, with_structural_options};
use super::session::core;
use super::state::{PlayerHost, PlayerOpenRequest, PlaylistWatch, StreamOpen};
use super::watch;
use super::{PLAYER_ROUTE, PLAYER_WINDOW_LABEL};
use crate::app_db;
use crate::{WINDOW_CHROME_KEY, WINDOW_CHROME_NAMESPACE};

fn clear_player_presence(app: &AppHandle) {
    if let Some(presence) = app.try_state::<crate::discord::DiscordPresence>() {
        presence.clear_player_now();
    }
}

fn install_close_handler(window: &WebviewWindow) {
    let app = window.app_handle().clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            let host = app.state::<PlayerHost>();
            if host.close_is_finished() {
                return;
            }
            api.prevent_close();
            if host.begin_close() {
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Some(window) = handle.get_webview_window(PLAYER_WINDOW_LABEL) {
                        if let Err(error) = player_close_window(handle.clone(), window).await {
                            handle.state::<PlayerHost>().abort_close();
                            tracing::warn!("player window close failed: {error}");
                        }
                    }
                });
            }
        }
        if matches!(event, WindowEvent::Destroyed)
            && app.get_webview_window(PLAYER_WINDOW_LABEL).is_none()
        {
            clear_player_presence(&app);
            let id = app
                .state::<PlayerHost>()
                .instance_id
                .load(std::sync::atomic::Ordering::Acquire);
            let handle = app.clone();
            tauri::async_runtime::spawn(async move {
                let host = handle.state::<PlayerHost>();
                let _window = host.window_operation.lock().await;
                let _operation = host.operation.lock().await;
                if id != 0 && host.instance_id.load(std::sync::atomic::Ordering::Acquire) == id {
                    if let Err(error) =
                        destroy_instance(handle.clone(), PLAYER_WINDOW_LABEL.into()).await
                    {
                        tracing::warn!("player teardown failed: {error}");
                    }
                }
            });
        }
    });
}

fn cached_player_decorations(app: &AppHandle) -> bool {
    app_db::read_cached_payload(app, WINDOW_CHROME_NAMESPACE, WINDOW_CHROME_KEY)
        .ok()
        .flatten()
        .and_then(|payload| serde_json::from_str::<Value>(&payload).ok())
        .and_then(|value| value.get("decorations")?.as_bool())
        .unwrap_or(true)
}

/// Drops the legacy hover-frame/sprite cache. The spritemap pipeline was
/// removed, so frames already on disk would otherwise sit there forever.
fn drop_legacy_hover_cache(app: &AppHandle) {
    let dir = crate::video::thumbnail_cache_dir(app).join("player-hover");
    if dir.is_dir() {
        let _ = std::fs::remove_dir_all(&dir);
    }
}

#[tauri::command]
pub async fn player_open(
    app: AppHandle,
    files: Vec<String>,
    resume: Option<f64>,
    start_index: Option<usize>,
    watch: Option<PlaylistWatch>,
    initial_watch: Option<watch::WatchState>,
) -> Result<(), String> {
    let window_owner = app.clone();
    let window_host = window_owner.state::<PlayerHost>();
    let _window_operation = window_host.window_operation.lock().await;
    window_host.reset_close();
    drop_legacy_hover_cache(&app);
    if files.is_empty() || files.iter().any(std::string::String::is_empty) {
        return Err("player_open received an empty file path".to_string());
    }
    let request = PlayerOpenRequest {
        request_id: window_host
            .request_serial
            .fetch_add(1, std::sync::atomic::Ordering::AcqRel)
            + 1,
        files,
        resume,
        start_index,
        watch,
        initial_watch,
        stream: None,
    };

    // Show the window before the request reaches the frontend. A prewarmed
    // window is hidden, and WebView2 throttles a hidden renderer: the event
    // sat in the queue until the window was shown, which made the first click
    // take hundreds of milliseconds longer than the load itself.
    let host = app.state::<PlayerHost>();
    let raise = |app: &AppHandle| {
        if let Some(window) = app.get_webview_window(PLAYER_WINDOW_LABEL) {
            let _ = window.show();
            let _ = window.set_focus();
        }
    };
    if host.is_active() {
        host.set_pending_open(Some(request.clone()));
        raise(&app);
        app.emit_to(PLAYER_WINDOW_LABEL, "player-open-request", &request)
            .map_err(|error| error.to_string())?;
        // The window owns the load: its `player-open-request` handler calls
        // `player_load`, which is the call that carries the request's resume
        // position and watch state. Loading here as well made every file
        // change a double `loadfile`.
        return Ok(());
    }

    if app.get_webview_window(PLAYER_WINDOW_LABEL).is_some() {
        host.set_pending_open(Some(request.clone()));
        raise(&app);
        app.emit_to(PLAYER_WINDOW_LABEL, "player-open-request", &request)
            .map_err(|error| error.to_string())?;
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
    install_close_handler(&window);
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
    super::validation::stream(&stream)?;
    let window_owner = app.clone();
    let window_host = window_owner.state::<PlayerHost>();
    let _window_operation = window_host.window_operation.lock().await;
    window_host.reset_close();
    drop_legacy_hover_cache(&app);

    let request = PlayerOpenRequest {
        request_id: window_host
            .request_serial
            .fetch_add(1, std::sync::atomic::Ordering::AcqRel)
            + 1,
        files: vec![stream.media_url.clone()],
        resume: stream.resume,
        start_index: Some(0),
        watch: None,
        initial_watch: None,
        stream: Some(stream),
    };

    // An open player window always takes the same path: the request is queued,
    // the window is raised, and the stream is loaded. Whether mpv is already
    // initialized is not a reason to leave the player on the previous frame.
    if app.get_webview_window(PLAYER_WINDOW_LABEL).is_some() {
        let host = app.state::<PlayerHost>();
        host.set_pending_open(Some(request.clone()));
        // Raise first: a hidden prewarmed window has a throttled renderer, and
        // the frontend has to see the request to paint the new session.
        if let Some(window) = app.get_webview_window(PLAYER_WINDOW_LABEL) {
            let _ = window.show();
            let _ = window.set_focus();
        }
        app.emit_to(PLAYER_WINDOW_LABEL, "player-open-request", &request)
            .map_err(|error| error.to_string())?;
        // A window that exists but has not initialized mpv yet cannot take the
        // load here. Leave the request pending: `player_init` loads it once the
        // instance is ready.
        if !host.is_active() {
            return Ok(());
        }
        return super::session::on_player(app.clone(), move |app| {
            super::load::load_stream_queue(&app, PLAYER_WINDOW_LABEL, &request)
        })
        .await;
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
    install_close_handler(&window);
    let _ = window.set_focus();
    Ok(())
}

#[tauri::command]
pub fn player_take_pending_open(host: State<'_, PlayerHost>) -> Option<PlayerOpenRequest> {
    let request = host.take_pending_open();
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
    let host = app.state::<PlayerHost>();
    let _operation = host.operation.lock().await;
    initialize_player(app.clone(), window, initial_options).await
}

async fn initialize_player(
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
    let init_label = label.clone();
    let joined = tauri::async_runtime::spawn_blocking(move || {
        // `init` is idempotent in the plugin: when this window already owns an
        // instance it returns without creating a second handle. Do not destroy
        // it first: `destroy` drops the map entry immediately and frees the
        // native handle afterwards, so a concurrent `player_init` (StrictMode
        // mounts the effect twice) could re-create the instance while the
        // other call is between destroy and init. Any property write in that
        // gap failed with "mpv instance for window label ... not found".
        tracing::debug!("player_init: ensuring mpv instance for {init_label}");
        backend.init(config, &init_label)
    })
    .await;
    match joined {
        Ok(Ok(ready)) => tracing::debug!("player_init: instance ready label={ready}"),
        Ok(Err(error)) => {
            tracing::warn!("player_init: mpv init failed: {error}");
            return Err(error);
        }
        Err(error) => return Err(format!("player init task failed: {error}")),
    }

    if label == PLAYER_WINDOW_LABEL {
        let host = app.state::<PlayerHost>();
        host.instance_id.store(
            app.mpv().instance_id(&label).unwrap_or(0),
            std::sync::atomic::Ordering::Release,
        );
        // A fresh instance has none of the previous stream's options.
        host.reset_stream_options();
        host.set_active(true);
        // A stream opened before mpv was ready is waiting in the pending
        // request. Load it now and keep the request, so the window can still
        // take it and restore the session identity.
        if let Some(request) = host.pending_open() {
            if request.stream.is_some() {
                let handle = app.clone();
                tauri::async_runtime::spawn_blocking(move || {
                    load_stream_media(&handle, PLAYER_WINDOW_LABEL, &request)
                })
                .await
                .map_err(|error| error.to_string())??;
            }
        }
    }
    Ok(label)
}

#[tauri::command]
pub async fn player_destroy(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    let host = app.state::<PlayerHost>();
    let _operation = host.operation.lock().await;
    let label = window.label().to_string();
    tracing::debug!("player_destroy: tearing down mpv instance for {label}");
    if label == PLAYER_WINDOW_LABEL {
        let handle = app.clone();
        tauri::async_runtime::spawn_blocking(move || watch::save_current(&handle))
            .await
            .map_err(|error| error.to_string())?;
        app.state::<PlayerHost>().set_active(false);
    }
    let result = destroy_instance(app.clone(), label).await;
    match &result {
        Ok(()) => tracing::debug!("player_destroy: instance torn down"),
        Err(error) => tracing::warn!("player_destroy: instance teardown failed: {error}"),
    }
    result
}

/// Rebuilds this window's player subsystem without restarting the app: a hung
/// or wedged mpv instance is torn down and created again with the same initial
/// options a fresh mount would pass.
#[tauri::command]
pub async fn player_restart(
    app: AppHandle,
    window: WebviewWindow,
    initial_options: Value,
) -> Result<String, String> {
    let host = app.state::<PlayerHost>();
    let _operation = host.operation.lock().await;
    let label = window.label().to_string();
    tracing::debug!("player_restart: rebuilding mpv instance for {label}");
    if let Err(error) = destroy_instance(app.clone(), label).await {
        tracing::debug!("player_restart: previous instance was already gone: {error}");
    }
    initialize_player(app.clone(), window, initial_options).await
}

async fn destroy_instance(app: AppHandle, label: String) -> Result<(), String> {
    if label == PLAYER_WINDOW_LABEL {
        let host = app.state::<PlayerHost>();
        host.instance_id
            .store(0, std::sync::atomic::Ordering::Release);
        host.set_active(false);
    }
    let backend = core(&app);
    let reset = label == PLAYER_WINDOW_LABEL;
    tauri::async_runtime::spawn_blocking(move || backend.destroy(&label))
        .await
        .map_err(|error| format!("player destroy task failed: {error}"))??;
    if reset {
        app.state::<PlayerHost>().reset_native_state();
    }
    Ok(())
}

#[tauri::command]
pub async fn player_close_window(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    let host = app.state::<PlayerHost>();
    let _window_operation = host.window_operation.lock().await;
    let _operation = host.operation.lock().await;
    let label = window.label().to_string();
    if label == PLAYER_WINDOW_LABEL {
        let handle = app.clone();
        tauri::async_runtime::spawn_blocking(move || watch::save_current(&handle))
            .await
            .map_err(|error| error.to_string())?;
        app.state::<PlayerHost>().set_active(false);
    }
    let handle = app.get_webview_window(&label);
    destroy_instance(app.clone(), label).await?;
    host.finish_close();
    if let Some(window) = handle {
        return window.close().map_err(|error| error.to_string());
    }
    Ok(())
}

/// Build the hidden player window ahead of the click that needs it.
///
/// The app warms it once at startup, but the window is gone after the user
/// closes the player, and the next stream would then pay for a cold `WebView` and
/// a cold mpv. The catalog calls this when a title modal opens, so that window
/// is back before the episode click arrives. Calling it again while the window
/// exists is a no-op.
#[tauri::command]
pub async fn player_prewarm(app: AppHandle) -> Result<(), String> {
    prewarm_player(app).await
}

/// Whether the hidden player window may be destroyed to give its memory back.
///
/// A visible window is in use, a pending open is about to load into it, and a
/// loaded `path` means media is open in it. Anything else is an idle prewarm
/// with nothing to lose. Split from the command so the policy is testable
/// without a running app.
fn prewarm_is_releasable(visible: bool, pending_open: bool, loaded_path: &str) -> bool {
    !visible && !pending_open && loaded_path.is_empty()
}

/// Destroy the hidden prewarmed player window when it holds no session.
///
/// Returns whether a window was closed. The frontend calls this when it leaves
/// the player tab: the prewarm keeps playback fast while the user browses
/// files, and the ~160 MB renderer goes away as soon as they are elsewhere.
#[tauri::command]
pub async fn player_release_prewarm(app: AppHandle) -> Result<bool, String> {
    let host = app.state::<PlayerHost>();
    let _window_operation = host.window_operation.lock().await;
    let _operation = host.operation.lock().await;
    let Some(window) = app.get_webview_window(PLAYER_WINDOW_LABEL) else {
        return Ok(false);
    };
    let visible = window.is_visible().unwrap_or(false);
    let pending_open = app.state::<PlayerHost>().pending_open().is_some();
    // The host's `current_path` outlives the window that played it, so the
    // live mpv property is the truth here. A window whose mpv is still starting
    // has no path either, which is exactly when releasing is safe.
    let loaded_path = core(&app)
        .get_property("path", "string", PLAYER_WINDOW_LABEL)
        .ok()
        .and_then(|value| value.as_str().map(str::to_string))
        .unwrap_or_default();
    if !prewarm_is_releasable(visible, pending_open, &loaded_path) {
        return Ok(false);
    }
    tracing::info!("releasing idle player prewarm");
    app.state::<PlayerHost>().set_active(false);
    destroy_instance(app.clone(), PLAYER_WINDOW_LABEL.to_string()).await?;
    host.finish_close();
    window.close().map_err(|error| error.to_string())?;
    Ok(true)
}

pub(crate) async fn prewarm_player(app: AppHandle) -> Result<(), String> {
    let window_owner = app.clone();
    let host = window_owner.state::<PlayerHost>();
    let _window_operation = host.window_operation.lock().await;
    let label = PLAYER_WINDOW_LABEL.to_string();

    if app.get_webview_window(&label).is_some() {
        return Ok(());
    }
    host.reset_close();

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

    install_close_handler(&window);

    // The window's own `player_init` creates mpv with the stored volume,
    // hwdec and video options. Initializing it here with an empty option set
    // raced that call: whichever init won decided the first file's volume, and
    // the empty one played at mpv's default 100% while the UI showed the
    // stored value. The hidden window still loads the player route, so mpv is
    // warmed by the frontend init that carries the real options.
    tracing::info!("player prewarm complete");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::prewarm_is_releasable;

    #[test]
    fn an_idle_prewarm_is_released_but_a_live_player_is_not() {
        // Hidden, nothing pending, nothing loaded: the prewarmed renderer can
        // go and the next player tab entry warms it again.
        assert!(prewarm_is_releasable(false, false, ""));
        // Shown to the user, about to load, or already playing: keep it.
        assert!(!prewarm_is_releasable(true, false, ""));
        assert!(!prewarm_is_releasable(false, true, ""));
        assert!(!prewarm_is_releasable(false, false, "D:/Anime/ep01.mkv"));
        assert!(!prewarm_is_releasable(true, true, "https://cdn/ep01.mp4"));
    }
}
