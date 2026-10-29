use tauri::State;

use super::{DiscordActivity, DiscordPresence, PresenceSource};

#[tauri::command]
pub async fn discord_presence_configure(
    enabled: bool,
    presence: State<'_, DiscordPresence>,
) -> Result<(), String> {
    presence.configure(enabled).await
}

#[tauri::command]
pub async fn discord_presence_set(
    source: PresenceSource,
    activity: DiscordActivity,
    presence: State<'_, DiscordPresence>,
) -> Result<(), String> {
    presence.set(source, activity).await
}

#[tauri::command]
pub async fn discord_presence_clear(
    source: PresenceSource,
    presence: State<'_, DiscordPresence>,
) -> Result<(), String> {
    presence.clear(source).await
}
