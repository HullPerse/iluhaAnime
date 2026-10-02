use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::app_db;

const WATCH_NAMESPACE: &str = "player";
const WATCH_KEY_PREFIX: &str = "watch:";
const MAX_KEY_LEN: usize = 512;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchState {
    pub position: f64,
    pub duration: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub audio_delay: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sub_delay: Option<f64>,
    pub updated_at: i64,
}

fn watch_key(path: &str) -> String {
    format!("{WATCH_KEY_PREFIX}{path}")
}

pub fn save(app: &AppHandle, path: &str, state: &WatchState) -> Result<(), String> {
    if path.is_empty() {
        return Err("watch position needs a file path".to_string());
    }
    let key = watch_key(path);
    if key.len() > MAX_KEY_LEN {
        return Err("watch position key is too long".to_string());
    }
    let payload = serde_json::to_string(state).map_err(|error| error.to_string())?;
    app_db::put_app_cache(app.clone(), WATCH_NAMESPACE.to_string(), key, payload, None)
}

pub fn load(app: &AppHandle, path: &str) -> Option<WatchState> {
    let key = watch_key(path);
    if key.len() > MAX_KEY_LEN {
        return None;
    }
    let payload = app_db::read_cached_payload(app, WATCH_NAMESPACE, &key).ok()??;
    serde_json::from_str(&payload).ok()
}
