use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};

use super::core::PlayerCore;
use super::session::{core, on_player};
use super::state::PlayerHost;
use super::PLAYER_WINDOW_LABEL;

#[derive(Clone, Copy, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupTimings {
    pub window_created_at_ms: Option<f64>,
    pub native_ready_at_ms: Option<f64>,
    pub frontend_ready_at_ms: Option<f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerDiagnostics {
    pub active: bool,
    pub preparation: &'static str,
    pub startup: StartupTimings,
    pub decoder: Option<String>,
    pub hwdec: Option<String>,
    pub video_output: Option<String>,
    pub gpu_context: Option<String>,
    pub audio_output: Option<String>,
}

fn identifier(value: Option<Value>) -> Option<String> {
    let Value::String(value) = value? else {
        return None;
    };
    (!value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"_-.:+ ()".contains(&byte)))
    .then_some(value)
}

fn snapshot(
    active: bool,
    preparation: &'static str,
    startup: StartupTimings,
    mut property: impl FnMut(&str) -> Option<Value>,
) -> PlayerDiagnostics {
    let mut read = |name| active.then(|| identifier(property(name))).flatten();
    PlayerDiagnostics {
        active,
        preparation,
        startup,
        decoder: read("current-tracks/video/decoder"),
        hwdec: read("hwdec-current"),
        video_output: read("current-vo"),
        gpu_context: read("current-gpu-context"),
        audio_output: read("current-ao"),
    }
}

#[tauri::command]
pub async fn player_diagnostics(app: AppHandle) -> Result<PlayerDiagnostics, String> {
    on_player(app, |app| {
        let host = app.state::<PlayerHost>();
        let (preparation, startup) = host.readiness.diagnostics();
        Ok(snapshot(host.is_active(), preparation, startup, |name| {
            core(&app)
                .get_property(name, "string", PLAYER_WINDOW_LABEL)
                .ok()
        }))
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn snapshot_reads_only_fixed_driver_properties_and_preserves_partial_availability() {
        let mut names = Vec::new();
        let report = snapshot(true, "ready", StartupTimings::default(), |name| {
            names.push(name.to_string());
            match name {
                "current-tracks/video/decoder" => Some(json!("h264")),
                "current-vo" => Some(json!("gpu-next")),
                "current-ao" => Some(json!("wasapi")),
                _ => None,
            }
        });
        assert_eq!(
            names,
            [
                "current-tracks/video/decoder",
                "hwdec-current",
                "current-vo",
                "current-gpu-context",
                "current-ao"
            ]
        );
        let value = serde_json::to_value(report).unwrap();
        assert_eq!(value["decoder"], "h264");
        assert_eq!(value["videoOutput"], "gpu-next");
        assert_eq!(value["audioOutput"], "wasapi");
        assert!(value["hwdec"].is_null());
        assert!(value["startup"]["frontendReadyAtMs"].is_null());
        let closed = snapshot(false, "closed", StartupTimings::default(), |_| {
            panic!("inactive player queried mpv")
        });
        assert!(closed.decoder.is_none());
    }

    #[test]
    fn diagnostic_identifiers_reject_paths_urls_metadata_and_oversized_values() {
        for value in [
            json!(null),
            json!(42),
            json!(""),
            json!("C:\\Users\\private"),
            json!("https://cdn/video?token=secret"),
            json!("header=value"),
            json!("x".repeat(129)),
        ] {
            assert!(identifier(Some(value)).is_none());
        }
        assert_eq!(
            identifier(Some(json!("lavc:h264"))),
            Some("lavc:h264".into())
        );
        assert_eq!(
            identifier(Some(json!("d3d11va-copy"))),
            Some("d3d11va-copy".into())
        );
    }
}
