//! Native toasts that report their click back to the webview.
//!
//! `tauri-plugin-notification` cannot: its `onAction` API is mobile-only and desktop
//! `sendNotification` never surfaces a click. Toasts therefore go through
//! `tauri-winrt-notification`, which keeps the activation handler on the notification object and
//! lets us emit `notification-activated` with the action the caller attached.

use serde::{Deserialize, Serialize};
use tauri::Emitter;

pub const ACTIVATED_EVENT: &str = "notification-activated";

/// What a toast click should lead to. Mirrors `NotificationTarget` on the TypeScript side.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "source", rename_all = "lowercase")]
pub enum ToastAction {
    Anilist { id: u32 },
    Folder { path: String },
}

#[cfg(windows)]
#[tauri::command]
pub fn show_toast(
    app: tauri::AppHandle,
    title: String,
    body: Option<String>,
    action: Option<ToastAction>,
) -> Result<(), String> {
    use tauri_winrt_notification::{Duration, Toast};

    let mut toast = Toast::new(&toast_app_id(&app))
        .title(&title)
        .duration(Duration::Short);
    if let Some(body) = body.as_deref().filter(|text| !text.is_empty()) {
        toast = toast.text1(body);
    }
    if let Some(action) = action {
        toast = toast.on_activated(move |_| {
            let _ = app.emit(ACTIVATED_EVENT, action.clone());
            Ok(())
        });
    }
    toast.show().map_err(|error| error.to_string())
}

/// The `AppUserModelID` the toast is attributed to. Dev builds run from `target/<profile>`, where
/// the notification plugin also skips its identifier, so the toast falls back to the id the crate
/// offers for unpackaged apps.
#[cfg(windows)]
fn toast_app_id(app: &tauri::AppHandle) -> String {
    use tauri_winrt_notification::Toast;

    let in_target = std::env::current_exe()
        .ok()
        .and_then(|exe| {
            exe.parent()
                .and_then(std::path::Path::parent)
                .map(std::path::Path::to_path_buf)
        })
        .and_then(|dir| dir.file_name().map(std::ffi::OsString::from))
        .is_some_and(|name| name.eq_ignore_ascii_case("target"));
    if in_target {
        Toast::POWERSHELL_APP_ID.to_string()
    } else {
        app.config().identifier.clone()
    }
}

/// The app ships for Windows only; this keeps the crate building elsewhere.
#[cfg(not(windows))]
#[tauri::command]
pub fn show_toast(
    _app: tauri::AppHandle,
    _title: String,
    _body: Option<String>,
    _action: Option<ToastAction>,
) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The frontend, the `show-notification` payload and this enum all speak the same shape.
    #[test]
    fn action_matches_the_frontend_shape() {
        let anilist = serde_json::to_string(&ToastAction::Anilist { id: 21 }).unwrap();
        assert_eq!(anilist, r#"{"source":"anilist","id":21}"#);

        let folder = serde_json::to_string(&ToastAction::Folder {
            path: r"D:\Anime".to_string(),
        })
        .unwrap();
        assert_eq!(folder, r#"{"source":"folder","path":"D:\\Anime"}"#);
    }

    #[test]
    fn action_round_trips_from_the_frontend_payload() {
        let action: ToastAction =
            serde_json::from_str(r#"{"source":"folder","path":"D:\\Anime"}"#).unwrap();
        assert!(matches!(action, ToastAction::Folder { path } if path == r"D:\Anime"));
        assert!(serde_json::from_str::<ToastAction>(r#"{"source":"nope"}"#).is_err());
    }
}
