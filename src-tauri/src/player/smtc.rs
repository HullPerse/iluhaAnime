//! The open file owns the Windows media surface, including while paused.
use super::{
    core::PlayerCore,
    session::{core, on_player},
    snapshot::PlaybackSnapshot,
    state::PlayerHost,
    PLAYER_WINDOW_LABEL,
};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager};
use windows::Foundation::TypedEventHandler;
use windows::Media::{
    MediaPlaybackStatus, MediaPlaybackType, SystemMediaTransportControls,
    SystemMediaTransportControlsButton, SystemMediaTransportControlsButtonPressedEventArgs,
};
use windows::Win32::System::WinRT::ISystemMediaTransportControlsInterop;
use windows_core::HSTRING;

pub struct Session {
    controls: SystemMediaTransportControls,
    token: i64,
}
impl Drop for Session {
    fn drop(&mut self) {
        let _ = self.controls.SetIsEnabled(false);
        let _ = self.controls.RemoveButtonPressed(self.token);
        if let Ok(display) = self.controls.DisplayUpdater() {
            let _ = display.ClearAll();
        }
    }
}
pub fn close(app: &AppHandle) {
    app.state::<PlayerHost>()
        .smtc_epoch
        .fetch_add(1, Ordering::AcqRel);
    app.state::<PlayerHost>()
        .smtc
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .take();
}
pub fn open(app: &AppHandle) {
    close(app);
    if let Err(error) = create(app) {
        tracing::warn!("player SMTC initialization failed: {error}");
    }
}
fn create(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let window = app
        .get_webview_window(PLAYER_WINDOW_LABEL)
        .ok_or("player window missing")?;
    let factory: ISystemMediaTransportControlsInterop = windows_core::factory::<
        SystemMediaTransportControls,
        ISystemMediaTransportControlsInterop,
    >()?;
    // The HWND belongs to the application's top-level player window.
    let controls: SystemMediaTransportControls = unsafe { factory.GetForWindow(window.hwnd()?)? };
    let host = app.state::<PlayerHost>();
    let instance = host.instance_id.load(Ordering::Acquire);
    let epoch = host.smtc_epoch.load(Ordering::Acquire);
    let handle = app.clone();
    let token = controls.ButtonPressed(&TypedEventHandler::<
        SystemMediaTransportControls,
        SystemMediaTransportControlsButtonPressedEventArgs,
    >::new(move |_, args| {
        let button = args
            .as_ref()
            .ok_or_else(|| {
                windows_core::Error::from_hresult(windows::Win32::Foundation::E_POINTER)
            })?
            .Button()?;
        let handle = handle.clone();
        tauri::async_runtime::spawn(async move {
            let result = on_player(handle, move |app| {
                let host = app.state::<PlayerHost>();
                if !is_current(&host, instance, epoch) {
                    return Ok(());
                }
                let backend = core(&app);
                match button {
                    SystemMediaTransportControlsButton::Play => backend.set_property(
                        "pause",
                        &serde_json::json!(false),
                        PLAYER_WINDOW_LABEL,
                    ),
                    SystemMediaTransportControlsButton::Pause => {
                        backend.set_property("pause", &serde_json::json!(true), PLAYER_WINDOW_LABEL)
                    }
                    SystemMediaTransportControlsButton::Next
                    | SystemMediaTransportControlsButton::Previous => {
                        super::watch::save_current(&app);
                        backend.command(
                            if button == SystemMediaTransportControlsButton::Next {
                                "playlist-next"
                            } else {
                                "playlist-prev"
                            },
                            &[],
                            PLAYER_WINDOW_LABEL,
                        )
                    }
                    _ => Ok(()),
                }
            })
            .await;
            if let Err(error) = result {
                tracing::warn!("player SMTC action failed: {error}");
            }
        });
        Ok(())
    }))?;
    let session = Session { controls, token };
    session.controls.SetIsPlayEnabled(true)?;
    session.controls.SetIsPauseEnabled(true)?;
    let display = session.controls.DisplayUpdater()?;
    display.SetType(MediaPlaybackType::Video)?;
    let video = display.VideoProperties()?;
    let title = host.stream_identity().map_or_else(
        || {
            std::path::Path::new(&host.current_path())
                .file_name()
                .map_or_else(String::new, |name| name.to_string_lossy().into_owned())
        },
        |identity| format!("{} - {}", identity.title, identity.episode_number),
    );
    video.SetTitle(&HSTRING::from(title))?;
    display.Update()?;
    session.controls.SetIsEnabled(true)?;
    *host
        .smtc
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner) = Some(session);
    Ok(())
}
pub fn update(app: &AppHandle, state: &PlaybackSnapshot) {
    let host = app.state::<PlayerHost>();
    let guard = host
        .smtc
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    if let Some(session) = guard.as_ref() {
        let status = if state.pause {
            MediaPlaybackStatus::Paused
        } else {
            MediaPlaybackStatus::Playing
        };
        let _ = session.controls.SetPlaybackStatus(status);
        let _ = session
            .controls
            .SetIsNextEnabled(state.playlist_index + 1 < state.playlist_count);
        let _ = session
            .controls
            .SetIsPreviousEnabled(state.playlist_index > 0);
    }
}

fn is_current(host: &PlayerHost, instance: u64, epoch: u64) -> bool {
    instance != 0
        && host.instance_id.load(Ordering::Acquire) == instance
        && host.smtc_epoch.load(Ordering::Acquire) == epoch
        && !host.close_is_finished()
        && !host.current_path().is_empty()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn callbacks_require_the_current_file_and_instance() {
        let host = PlayerHost::default();
        host.instance_id.store(3, Ordering::Release);
        host.set_current_path("episode.mkv".into());
        assert!(is_current(&host, 3, 0));
        assert!(!is_current(&host, 0, 0));
        assert!(!is_current(&host, 2, 0));
        host.smtc_epoch.fetch_add(1, Ordering::AcqRel);
        assert!(!is_current(&host, 3, 0));
        assert!(is_current(&host, 3, 1));
        host.finish_close();
        assert!(!is_current(&host, 3, 1));
    }
}
