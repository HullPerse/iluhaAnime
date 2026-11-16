//! Persisted playback progress.
//!
//! A watch entry is the position (and the subtitle/audio delays) of whatever is
//! playing, stored in the app cache under the playback key. This module owns
//! both directions and the periodic save that the ticker and the teardown path
//! call; `state.rs` only holds the live snapshot the save reads.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use super::snapshot::{number_property, WATCH_FIELDS};
use super::state::PlayerHost;
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

/// The watch key and state for whatever is playing right now. Reading the
/// position is cheap; writing it is not, so the two are separate.
pub fn current_snapshot(app: &AppHandle) -> Option<(String, WatchState)> {
    let host = app.state::<PlayerHost>();
    let (snapshot, mask) = host.latest_observed();
    if mask & WATCH_FIELDS != WATCH_FIELDS || snapshot.path != host.current_path() {
        return None;
    }
    let path = host
        .stream_watch_key()
        .filter(|key| !key.is_empty())
        .unwrap_or_else(|| host.current_path());
    if path.is_empty() {
        return None;
    }
    let position = snapshot.time_pos;
    if !position.is_finite() || position < 0.0 || snapshot.duration <= 0.0 {
        return None;
    }
    Some((
        path,
        WatchState {
            position,
            duration: snapshot.duration,
            audio_delay: number_property(app, "audio-delay"),
            sub_delay: number_property(app, "sub-delay"),
            updated_at: app_db::now_seconds(),
        },
    ))
}

/// Snapshot the position of whatever is playing and persist it. Called before
/// media is replaced and from the slow ticker.
pub fn save_current(app: &AppHandle) {
    let host = app.state::<PlayerHost>();
    let _watch = host
        .watch_operation
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let Some((path, state)) = current_snapshot(app) else {
        return;
    };
    if let Err(error) = save(app, &path, &state) {
        tracing::debug!("watch position not saved: {error}");
    }
    // The same tick keeps the history row current. A local file has no
    // identity, so this is a stream-only write and a no-op everywhere else.
    let Some(identity) = app.state::<PlayerHost>().stream_identity() else {
        return;
    };
    let entry = crate::app_db::stream_history::StreamHistoryEntry {
        anime_id: identity.anime_id,
        episode_id: identity.episode_id,
        slug: identity.slug,
        title: identity.title,
        cover: identity.cover,
        anilist_id: identity.anilist_id,
        episode_number: identity.episode_number,
        episode_title: identity.episode_title,
        episode_cover: None,
        position: state.position,
        duration: state.duration,
        updated_at: state.updated_at,
    };
    if let Err(error) = crate::app_db::stream_history::record(app, entry) {
        tracing::debug!("stream history not saved: {error}");
    }
}
