//! Talking to the libmpv backend of this window.
//!
//! Commands, loading and window lifecycle all need the same two things: a
//! backend bound to the current app handle, and a way to run one blocking player
//! task at a time. Keeping them here means `commands.rs`, `load.rs` and
//! `lifecycle.rs` depend on this module instead of on each other.

use tauri::{AppHandle, Manager};

use super::core::LibmpvCore;
use super::state::PlayerHost;

pub(crate) fn core(app: &AppHandle) -> LibmpvCore {
    LibmpvCore::new(app.clone())
}

pub(crate) async fn on_player<T: Send + 'static>(
    app: AppHandle,
    task: impl FnOnce(AppHandle) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    let host = app.state::<PlayerHost>();
    let _operation = host.operation.lock().await;
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || task(handle))
        .await
        .map_err(|error| format!("player task failed: {error}"))?
}
