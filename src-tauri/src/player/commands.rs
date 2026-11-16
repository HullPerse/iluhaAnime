//! The per-window mpv command surface.
//!
//! Property writes, playlist queries, screenshots and the batch state applied
//! when a file loads. Window/mpv lifecycle lives in `lifecycle.rs`, media
//! loading in `load.rs`, option building in `options.rs`.

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_libmpv::VideoMarginRatio;

use super::core::PlayerCore;
use super::options::eof_properties;
use super::session::{core, on_player};
use super::state::PlayerHost;
use super::watch::{self, WatchState};
use super::PLAYER_WINDOW_LABEL;

/// Grabs the frame mpv is currently showing so an app screenshot can put it
/// back over the blank area the webview capture leaves behind.
pub async fn capture_frame_to(
    window: &WebviewWindow,
    target: &std::path::Path,
) -> Result<(), String> {
    let label = window.label().to_string();
    core(window.app_handle()).command(
        "screenshot-to-file",
        &[json!(target.to_string_lossy())],
        &label,
    )?;
    let mut last_len = 0;
    let mut stable = 0;
    for _ in 0..80 {
        let len = std::fs::metadata(target).map_or(0, |meta| meta.len());
        if len > 0 && len == last_len {
            stable += 1;
            if stable >= 2 {
                return Ok(());
            }
        } else {
            stable = 0;
            last_len = len;
        }
        tokio::time::sleep(std::time::Duration::from_millis(25)).await;
    }
    Err("mpv did not write the video frame".to_string())
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
    core(app).command(
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
    expected_path: Option<String>,
) -> Result<(), String> {
    let label = window.label().to_string();
    super::validation::command(&name, &args)?;
    on_player(app, move |app| {
        if let Some(expected) = expected_path {
            if core(&app).get_property("path", "string", &label)?.as_str()
                != Some(expected.as_str())
            {
                return Ok(());
            }
        }
        if ["playlist-next", "playlist-prev", "playlist-play-index"].contains(&name.as_str()) {
            watch::save_current(&app);
        }
        core(&app).command(&name, &args, &label)
    })
    .await
}

#[tauri::command]
pub async fn player_set_property(
    app: AppHandle,
    window: WebviewWindow,
    name: String,
    value: Value,
) -> Result<(), String> {
    let label = window.label().to_string();
    super::validation::property(&name, &value)?;
    on_player(app, move |app| {
        core(&app).set_property(&name, &value, &label)
    })
    .await
}

/// Apply the playback profile's local readahead.
///
/// The profile is a local-file setting: a stream ignores `demuxer-readahead-secs`
/// because `cache-secs` wins while the network cache is on. Storing the value on
/// the host lets every local load write it back after a stream left its cache
/// profile on the instance.
#[tauri::command]
pub async fn player_set_readahead(
    app: AppHandle,
    window: WebviewWindow,
    seconds: f64,
) -> Result<(), String> {
    let label = window.label().to_string();
    let seconds = seconds.clamp(0.1, 30.0);
    on_player(app, move |app| {
        let backend = core(&app);
        backend.set_property("demuxer-readahead-secs", &json!(seconds), &label)?;
        if label == PLAYER_WINDOW_LABEL {
            app.state::<PlayerHost>().set_readahead(seconds);
        }
        Ok(())
    })
    .await
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
    if !["double", "flag", "int64", "string", "json"].contains(&format.as_str()) {
        return Err("unsupported mpv property format".into());
    }
    on_player(app, move |app| {
        core(&app).get_property(&name, &format, &label)
    })
    .await
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistEntry {
    pub index: i64,
    pub filename: String,
    pub title: String,
}

#[tauri::command]
pub async fn player_playlist_entries(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<Vec<PlaylistEntry>, String> {
    let label = window.label().to_string();
    on_player(app, move |app| {
        parse_playlist_entries(core(&app).get_property("playlist", "json", &label)?)
    })
    .await
}

fn parse_playlist_entries(value: Value) -> Result<Vec<PlaylistEntry>, String> {
    let decoded = match value {
        Value::String(text) => {
            serde_json::from_str(&text).map_err(|error| format!("invalid playlist: {error}"))?
        }
        other => other,
    };
    decoded
        .as_array()
        .ok_or("invalid playlist list".to_string())?
        .iter()
        .enumerate()
        .map(|(index, entry)| {
            let filename = entry
                .get("filename")
                .and_then(Value::as_str)
                .ok_or("playlist entry has no filename")?;
            Ok(PlaylistEntry {
                index: index as i64,
                filename: filename.to_string(),
                title: entry
                    .get("title")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
            })
        })
        .collect()
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
    on_player(app, move |app| {
        core(&app).set_video_margin_ratio(
            VideoMarginRatio {
                left,
                right,
                top,
                bottom,
            },
            &label,
        )
    })
    .await
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

#[tauri::command]
pub async fn player_eof_mode(
    app: AppHandle,
    window: WebviewWindow,
    mode: String,
) -> Result<(), String> {
    let label = window.label().to_string();
    let Some((keep_open, loop_file, loop_playlist)) = eof_properties(&mode) else {
        return Err(format!("unknown end-of-file mode: {mode}"));
    };
    tracing::debug!("player_eof_mode: {mode}");
    on_player(app, move |app| {
        let backend = core(&app);
        backend.set_property("keep-open", &json!(keep_open), &label)?;
        backend.set_property("loop-file", &json!(loop_file), &label)?;
        backend.set_property("loop-playlist", &json!(loop_playlist), &label)?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn player_save_watch(
    app: AppHandle,
    path: String,
    state: WatchState,
) -> Result<(), String> {
    on_player(app, move |app| watch::save(&app, &path, &state)).await
}

#[tauri::command]
pub async fn player_load_watch(app: AppHandle, path: String) -> Option<WatchState> {
    tauri::async_runtime::spawn_blocking(move || watch::load(&app, &path))
        .await
        .ok()
        .flatten()
}

/// Applies the whole per-file playback state in one IPC roundtrip instead of
/// 4-5 sequential property commands (speed, delays, persisted tracks).
#[tauri::command]
pub async fn player_apply_file_state(
    app: AppHandle,
    window: WebviewWindow,
    speed: f64,
    sub_delay: f64,
    audio_delay: f64,
    audio_track: Option<i64>,
    subtitle_track: Option<Value>,
    expected_path: Option<String>,
) -> Result<(), String> {
    let label = window.label().to_string();
    on_player(app, move |app| {
        let backend = core(&app);
        if let Some(expected) = expected_path {
            if backend.get_property("path", "string", &label)?.as_str() != Some(expected.as_str()) {
                return Ok(());
            }
        }
        backend.set_property("speed", &json!(speed), &label)?;
        backend.set_property("sub-delay", &json!(sub_delay), &label)?;
        backend.set_property("audio-delay", &json!(audio_delay), &label)?;
        if let Some(id) = audio_track {
            backend.set_property("aid", &json!(id.to_string()), &label)?;
        }
        if let Some(id) = subtitle_track {
            if id != json!("no") && id.as_i64().is_none() {
                return Err("invalid subtitle track".into());
            }
            let selected = id
                .as_str()
                .map(str::to_string)
                .unwrap_or_else(|| id.to_string());
            backend.set_property("sid", &json!(selected), &label)?;
        }
        Ok(())
    })
    .await
}

/// Applies only persisted track choices. Timing is applied before seek, while
/// tracks wait for sidecar files to be added, so this is a second small IPC
/// instead of switching tracks live during the seek.
#[tauri::command]
pub async fn player_apply_file_tracks(
    app: AppHandle,
    window: WebviewWindow,
    audio_track: Option<i64>,
    subtitle_track: Option<Value>,
    expected_path: Option<String>,
) -> Result<(), String> {
    let label = window.label().to_string();
    on_player(app, move |app| {
        let backend = core(&app);
        if let Some(expected) = expected_path {
            if backend.get_property("path", "string", &label)?.as_str() != Some(expected.as_str()) {
                return Ok(());
            }
        }
        if let Some(id) = audio_track {
            backend.set_property("aid", &json!(id.to_string()), &label)?;
        }
        if let Some(id) = subtitle_track {
            if id != json!("no") && id.as_i64().is_none() {
                return Err("invalid subtitle track".into());
            }
            let selected = id
                .as_str()
                .map(str::to_string)
                .unwrap_or_else(|| id.to_string());
            backend.set_property("sid", &json!(selected), &label)?;
        }
        Ok(())
    })
    .await
}

#[allow(dead_code)]
#[tauri::command]
pub async fn player_apply_batch(
    app: AppHandle,
    window: WebviewWindow,
    properties: Vec<(String, Value)>,
) -> Result<(), String> {
    let label = window.label().to_string();
    for (name, value) in &properties {
        super::validation::property(name, value)?;
    }
    on_player(app, move |app| {
        let backend = core(&app);
        let results: Vec<Result<(), String>> = properties
            .into_iter()
            .map(|(name, value)| backend.set_property(&name, &value, &label))
            .collect();

        let mut failed: Vec<String> = Vec::new();
        for (i, result) in results.into_iter().enumerate() {
            if let Err(error) = result {
                failed.push(format!("{i}: {error}"));
            }
        }

        if !failed.is_empty() {
            return Err(format!("player_apply_batch: {}", failed.join(", ")));
        }

        Ok(())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::super::state::{PlayerOpenRequest, PlaylistWatch, TorrentWatch};

    #[test]
    fn playlist_json_preserves_order_titles_and_rejects_malformed_rows() {
        let entries = super::parse_playlist_entries(
            serde_json::json!([{ "filename": "a.mkv", "title": "A" }, { "filename": "b.mkv" }]),
        )
        .unwrap();
        assert_eq!(entries[0].filename, "a.mkv");
        assert_eq!(entries[1].index, 1);
        assert_eq!(entries[1].title, "");
        assert!(super::parse_playlist_entries(serde_json::json!([{}])).is_err());
        assert!(super::parse_playlist_entries(serde_json::json!("not-json")).is_err());
    }

    #[test]
    fn open_request_watch_roundtrips_as_camel_case() {
        let request = PlayerOpenRequest {
            request_id: 1,
            files: vec!["C:/T/ep1.mkv".to_string()],
            resume: None,
            start_index: Some(0),
            watch: Some(PlaylistWatch::Torrent(TorrentWatch {
                torrent_id: 7,
                save_dir: "C:/T".to_string(),
                anchor: "C:/T/ep1.mkv".to_string(),
            })),
            initial_watch: None,
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
