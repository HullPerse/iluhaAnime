//! Loading media and building the queue.
//!
//! A local file and a stream take different mpv options and a different
//! `loadfile` sequence, but both end in the same session bookkeeping. This
//! module owns that sequence; the window lifecycle only decides when to call it,
//! and `commands.rs` keeps the per-window command surface.

use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, WebviewWindow};

use super::core::PlayerCore;
use super::options::{
    apply_options, header_fields, local_cache_options, mpv_proxy, stream_cache_options,
    SLOW_STREAM_BYTES_PER_SECOND,
};
use super::session::{core, on_player};
use super::state::{PlayerHost, PlayerOpenRequest};
use super::watch;
use super::PLAYER_WINDOW_LABEL;

pub(crate) fn load_queue(
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
    watch::save_current(app);
    backend.set_property("http-header-fields", &json!(""), window)?;
    backend.set_property("http-proxy", &json!(""), window)?;
    app.state::<PlayerHost>().reset_stream_options();
    // A stream leaves its cache profile on the instance, so a local file has
    // to put its own readahead and packet caps back before it loads.
    let readahead = app.state::<PlayerHost>().readahead();
    apply_options(
        &backend,
        &local_cache_options(readahead),
        window,
        "local file",
    )?;
    // Opening a local file must not play the previous/default audio while the
    // frontend restores speed, delays and tracks. mpv keeps the player paused
    // through loadfile; the player window decides when to resume.
    backend
        .set_property("pause", &json!(true), window)
        .map_err(|error| format!("set pause for local load: {error}"))?;
    // Playback starts at `start_index`, but the mpv playlist is still built
    // in the given (sorted) order: the start file loads first so the resume
    // `start=` applies to it, then the files before it are inserted at the
    // front in order and the rest appended. Previously the frontend rotated
    // the queue, which reordered the whole playlist (e.g. 9..12 then 1..8).
    let start = start_index.unwrap_or(0).min(files.len() - 1);
    let start_file = &files[start];
    *app.state::<PlayerHost>()
        .pending_stream
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner) = None;
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
        host.mark_dirty();
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
    request_id: Option<u64>,
) -> Result<(), String> {
    let label = window.label().to_string();
    tracing::debug!(
        "player_load: {} file(s) resume={resume:?} start={start_index:?}",
        files.len()
    );
    on_player(app, move |app| {
        if request_id.is_some_and(|id| {
            id != app
                .state::<PlayerHost>()
                .request_serial
                .load(std::sync::atomic::Ordering::Acquire)
        }) {
            return Ok(());
        }
        load_queue(&app, &label, &files, resume, start_index)?;
        if let Some(id) = request_id {
            app.state::<PlayerHost>().clear_pending_request(id);
        }
        Ok(())
    })
    .await
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
    on_player(app, move |app| {
        let backend = core(&app);
        for file in &files {
            backend.command("loadfile", &[json!(file), json!(mode)], &label)?;
        }
        Ok(())
    })
    .await
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
    on_player(app, move |app| {
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
    })
    .await
}

fn scalar_int(app: &AppHandle, label: &str, name: &str) -> Option<i64> {
    core(app)
        .get_property(name, "int64", label)
        .ok()
        .and_then(|value| value.as_i64())
}

/// Load a stream URL into mpv: set the proxy, `http-header-fields` and the
/// pause state, then `loadfile ... replace` with optional `start=` for resume.
///
/// Shared by the open command and by `player_init`, so a stream that arrived
/// while the window was still initializing is not lost. The pending request is
/// left in place: the window takes it to restore the session identity.
pub(crate) fn load_stream_media(
    app: &AppHandle,
    window: &str,
    request: &PlayerOpenRequest,
) -> Result<(), String> {
    let Some(stream) = &request.stream else {
        return Err("load_stream_media called without stream".to_string());
    };

    let backend = core(app);
    let host = app.state::<PlayerHost>();
    watch::save_current(app);

    // A quality or voice-over switch usually keeps the same route, the same
    // headers and the same cache profile. mpv keeps those options on the
    // instance, so only a changed value is worth an IPC hop.
    let proxy = stream
        .proxy_url
        .as_deref()
        .map(mpv_proxy)
        .unwrap_or_default();
    let header_string = header_fields(&stream.headers);
    if !proxy.is_empty() {
        let parsed = reqwest::Url::parse(&proxy).map_err(|_| "invalid playback proxy URL")?;
        if !["http", "https", "socks4", "socks4a", "socks5", "socks5h"].contains(&parsed.scheme()) {
            return Err("unsupported playback proxy scheme".into());
        }
        let requires_curl = parsed.scheme() != "http" || stream.media_url.starts_with("https://");
        if requires_curl
            && backend
                .get_property("options/curl-enabled", "flag", window)
                .ok()
                .and_then(|value| value.as_bool())
                != Some(true)
        {
            return Err(
                "this mpv build cannot use the selected playback proxy for this media URL".into(),
            );
        }
    }
    let writes = host.stream_option_writes(&proxy, &header_string);

    let applied = (|| -> Result<(), String> {
        // An empty value is a real write: a previous source's route and
        // headers must not leak into a stream that needs none.
        if writes.proxy {
            backend
                .set_property("http-proxy", &json!(proxy), window)
                .map_err(|error| format!("set http-proxy: {error}"))?;
        }
        if writes.headers {
            backend
                .set_property("http-header-fields", &json!(header_string), window)
                .map_err(|error| format!("set http-header-fields: {error}"))?;
        }
        // The cache profile is written on every load. Seven set_property calls
        // cost nothing next to loadfile, and skipping them on an unchanged
        // request is what let a local file inherit the stream's budget.
        let starts_mid_file = request.resume.is_some_and(|position| position > 0.0);
        let slow = host
            .last_stream_speed()
            .is_some_and(|speed| speed < SLOW_STREAM_BYTES_PER_SECOND);
        if let Err(error) = apply_options(
            &backend,
            &stream_cache_options(!starts_mid_file, slow),
            window,
            "stream",
        ) {
            host.reset_stream_options();
            return Err(error);
        }
        // `pause` is set before the file loads: mpv keeps the player paused
        // while it opens, which is what a switch from a paused stream needs.
        backend
            .set_property("pause", &json!(stream.paused), window)
            .map_err(|error| format!("set pause for stream: {error}"))?;
        Ok(())
    })();
    if let Err(error) = applied {
        // A failed write leaves mpv and the cache disagreeing; make the next
        // request write everything again.
        host.reset_stream_options();
        return Err(error);
    }

    let mut args: Vec<Value> = vec![json!(stream.media_url), json!("replace")];
    *host
        .pending_stream
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner) = Some(stream.clone());
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
pub(crate) fn load_stream_queue(
    app: &AppHandle,
    window: &str,
    request: &PlayerOpenRequest,
) -> Result<(), String> {
    load_stream_media(app, window, request)?;

    if window == PLAYER_WINDOW_LABEL {
        let host = app.state::<PlayerHost>();
        host.clear_pending_open();
        host.mark_dirty();
    }
    Ok(())
}
