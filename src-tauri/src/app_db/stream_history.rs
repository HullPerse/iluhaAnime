use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use super::db::{lock_app_data_write_timeout, now_seconds, open_database, APP_DATA_WRITE_TIMEOUT};

/// How many episode rows the history keeps. Older rows are pruned on every
/// write, so the table stays small and every read stays a single index scan.
pub const STREAM_HISTORY_LIMIT: i64 = 500;

/// A finished episode is one whose position reached this share of its length.
pub const WATCHED_RATIO: f64 = 0.9;

const MAX_ID_LEN: usize = 64;
const MAX_TITLE_LEN: usize = 300;
const MAX_URL_LEN: usize = 2048;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamHistoryEntry {
    pub anime_id: String,
    pub slug: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cover: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anilist_id: Option<i64>,
    pub episode_id: String,
    pub episode_number: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub episode_title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub episode_cover: Option<String>,
    pub position: f64,
    pub duration: f64,
    pub updated_at: i64,
}

/// Everything the tab needs to draw one title without asking the network.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamHistoryProgress {
    pub anime_id: String,
    pub slug: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cover: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anilist_id: Option<i64>,
    /// Episodes that reached [`WATCHED_RATIO`].
    pub watched: i64,
    /// The highest episode number the history knows about.
    pub last_episode: i32,
    pub last_position: f64,
    pub last_duration: f64,
    pub updated_at: i64,
}

fn clean_id(value: &str) -> Option<&str> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > MAX_ID_LEN {
        return None;
    }
    Some(trimmed)
}

fn clean_title(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.chars().take(MAX_TITLE_LEN).collect())
}

fn clean_url(value: Option<&String>) -> Option<String> {
    let trimmed = value?.trim();
    if trimmed.is_empty() || trimmed.len() > MAX_URL_LEN {
        return None;
    }
    Some(trimmed.to_string())
}

fn normalized(entry: StreamHistoryEntry) -> Result<StreamHistoryEntry, String> {
    let anime_id = clean_id(&entry.anime_id).ok_or("stream history needs an anime id")?;
    let episode_id = clean_id(&entry.episode_id).ok_or("stream history needs an episode id")?;
    let slug = clean_id(&entry.slug).ok_or("stream history needs a slug")?;
    let title = clean_title(&entry.title).ok_or("stream history needs a title")?;
    if !entry.position.is_finite() || entry.position < 0.0 {
        return Err("stream history position must be a non-negative number".into());
    }
    if !entry.duration.is_finite() || entry.duration < 0.0 {
        return Err("stream history duration must be a non-negative number".into());
    }
    Ok(StreamHistoryEntry {
        anime_id: anime_id.to_string(),
        episode_id: episode_id.to_string(),
        slug: slug.to_string(),
        title,
        cover: clean_url(entry.cover.as_ref()),
        anilist_id: entry.anilist_id.filter(|id| *id > 0),
        episode_number: entry.episode_number.max(0),
        episode_title: entry.episode_title.as_deref().and_then(clean_title),
        episode_cover: clean_url(entry.episode_cover.as_ref()),
        position: entry.position,
        duration: entry.duration,
        updated_at: if entry.updated_at > 0 {
            entry.updated_at
        } else {
            now_seconds()
        },
    })
}

/// Upsert one episode row and drop the oldest rows past the limit.
///
/// The upsert keeps a known title or cover when the caller sends none: the
/// player opens a stream with the catalog's data, but a bare position update
/// from the ticking save must never blank the row.
pub fn record(app: &AppHandle, entry: StreamHistoryEntry) -> Result<(), String> {
    let entry = normalized(entry)?;
    let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
    let connection = open_database(app)?;
    connection
        .execute(
            "INSERT INTO stream_history (
                anime_id, episode_id, slug, title, cover, anilist_id,
                episode_number, episode_title, episode_cover,
                position, duration, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
             ON CONFLICT(anime_id, episode_id) DO UPDATE SET
                slug = excluded.slug,
                title = excluded.title,
                cover = COALESCE(excluded.cover, stream_history.cover),
                anilist_id = COALESCE(excluded.anilist_id, stream_history.anilist_id),
                episode_number = excluded.episode_number,
                episode_title = COALESCE(excluded.episode_title, stream_history.episode_title),
                episode_cover = COALESCE(excluded.episode_cover, stream_history.episode_cover),
                position = excluded.position,
                duration = excluded.duration,
                updated_at = excluded.updated_at",
            params![
                entry.anime_id,
                entry.episode_id,
                entry.slug,
                entry.title,
                entry.cover,
                entry.anilist_id,
                entry.episode_number,
                entry.episode_title,
                entry.episode_cover,
                entry.position,
                entry.duration,
                entry.updated_at,
            ],
        )
        .map_err(|error| format!("write stream history: {error}"))?;
    connection
        .execute(
            "DELETE FROM stream_history WHERE rowid NOT IN (
                SELECT rowid FROM stream_history ORDER BY updated_at DESC LIMIT ?1
            )",
            params![STREAM_HISTORY_LIMIT],
        )
        .map_err(|error| format!("prune stream history: {error}"))?;
    Ok(())
}

fn read_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<StreamHistoryEntry> {
    Ok(StreamHistoryEntry {
        anime_id: row.get(0)?,
        episode_id: row.get(1)?,
        slug: row.get(2)?,
        title: row.get(3)?,
        cover: row.get(4)?,
        anilist_id: row.get(5)?,
        episode_number: row.get(6)?,
        episode_title: row.get(7)?,
        episode_cover: row.get(8)?,
        position: row.get(9)?,
        duration: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

const ENTRY_COLUMNS: &str = "anime_id, episode_id, slug, title, cover, anilist_id,
    episode_number, episode_title, episode_cover, position, duration, updated_at";

/// The most recently watched episodes, newest first. One query, one index.
pub fn recent(app: &AppHandle, limit: i64) -> Result<Vec<StreamHistoryEntry>, String> {
    recent_in(&open_database(app)?, limit)
}

/// Connection-level form, shared by the command and the benchmark fixture.
pub fn recent_in(
    connection: &rusqlite::Connection,
    limit: i64,
) -> Result<Vec<StreamHistoryEntry>, String> {
    let limit = limit.clamp(1, 200);
    let mut statement = connection
        .prepare(&format!(
            "SELECT {ENTRY_COLUMNS} FROM stream_history ORDER BY updated_at DESC LIMIT ?1"
        ))
        .map_err(|error| format!("read stream history: {error}"))?;
    let rows = statement
        .query_map(params![limit], read_entry)
        .map_err(|error| format!("read stream history: {error}"))?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| format!("read stream history: {error}"))
}

/// Every remembered episode of one title, by episode number.
pub fn for_anime(app: &AppHandle, anime_id: &str) -> Result<Vec<StreamHistoryEntry>, String> {
    for_anime_in(&open_database(app)?, anime_id)
}

/// Connection-level form, shared by the command and the benchmark fixture.
pub fn for_anime_in(
    connection: &rusqlite::Connection,
    anime_id: &str,
) -> Result<Vec<StreamHistoryEntry>, String> {
    let anime_id = clean_id(anime_id).ok_or("stream history needs an anime id")?;
    let mut statement = connection
        .prepare(&format!(
            "SELECT {ENTRY_COLUMNS} FROM stream_history
             WHERE anime_id = ?1 ORDER BY episode_number ASC"
        ))
        .map_err(|error| format!("read stream history: {error}"))?;
    let rows = statement
        .query_map(params![anime_id], read_entry)
        .map_err(|error| format!("read stream history: {error}"))?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| format!("read stream history: {error}"))
}

/// The newest row of one title, which is the episode "continue" points at.
/// Connection-level form, shared by the command and the benchmark fixture.
pub fn last_for_anime_in(
    connection: &rusqlite::Connection,
    anime_id: &str,
) -> Result<Option<StreamHistoryEntry>, String> {
    let anime_id = clean_id(anime_id).ok_or("stream history needs an anime id")?;
    connection
        .query_row(
            &format!(
                "SELECT {ENTRY_COLUMNS} FROM stream_history
                 WHERE anime_id = ?1 ORDER BY updated_at DESC LIMIT 1"
            ),
            params![anime_id],
            read_entry,
        )
        .optional()
        .map_err(|error| format!("read stream history: {error}"))
}

/// Watched count and the newest row of one title, for a hover badge.
pub fn progress(app: &AppHandle, anime_id: &str) -> Result<Option<StreamHistoryProgress>, String> {
    progress_in(&open_database(app)?, anime_id)
}

/// Connection-level form, shared by the command and the benchmark fixture.
pub fn progress_in(
    connection: &rusqlite::Connection,
    anime_id: &str,
) -> Result<Option<StreamHistoryProgress>, String> {
    let Some(last) = last_for_anime_in(connection, anime_id)? else {
        return Ok(None);
    };
    let watched: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM stream_history
             WHERE anime_id = ?1 AND duration > 0 AND position > 0
               AND CAST(position AS REAL) / duration >= ?2",
            params![anime_id, WATCHED_RATIO],
            |row| row.get(0),
        )
        .map_err(|error| format!("read stream history: {error}"))?;
    Ok(Some(StreamHistoryProgress {
        anime_id: last.anime_id,
        slug: last.slug,
        title: last.title,
        cover: last.cover,
        anilist_id: last.anilist_id,
        watched,
        last_episode: last.episode_number,
        last_position: last.position,
        last_duration: last.duration,
        updated_at: last.updated_at,
    }))
}

pub fn clear(app: &AppHandle) -> Result<(), String> {
    let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
    let connection = open_database(app)?;
    connection
        .execute("DELETE FROM stream_history", [])
        .map_err(|error| format!("clear stream history: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn stream_history_record(app: AppHandle, entry: StreamHistoryEntry) -> Result<(), String> {
    record(&app, entry)
}

#[tauri::command]
pub fn stream_history_recent(
    app: AppHandle,
    limit: Option<i64>,
) -> Result<Vec<StreamHistoryEntry>, String> {
    recent(&app, limit.unwrap_or(50))
}

#[tauri::command]
pub fn stream_history_for_anime(
    app: AppHandle,
    anime_id: String,
) -> Result<Vec<StreamHistoryEntry>, String> {
    for_anime(&app, &anime_id)
}

#[tauri::command]
pub fn stream_history_progress(
    app: AppHandle,
    anime_id: String,
) -> Result<Option<StreamHistoryProgress>, String> {
    progress(&app, &anime_id)
}

#[tauri::command]
pub fn stream_history_clear(app: AppHandle) -> Result<(), String> {
    clear(&app)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(position: f64, duration: f64) -> StreamHistoryEntry {
        StreamHistoryEntry {
            anime_id: "21371".into(),
            slug: "21371--sousou-no-frieren-anime".into(),
            title: "Sousou no Frieren".into(),
            cover: Some("https://cdn/cover.jpg".into()),
            anilist_id: Some(154587),
            episode_id: "9001".into(),
            episode_number: 3,
            episode_title: Some("Killing Magic".into()),
            episode_cover: None,
            position,
            duration,
            updated_at: 100,
        }
    }

    #[test]
    fn entries_are_normalized_and_guarded() {
        let ok = normalized(entry(10.0, 1440.0)).expect("entry is valid");
        assert_eq!(ok.anime_id, "21371");
        assert_eq!(ok.updated_at, 100);

        let mut blank = entry(10.0, 1440.0);
        blank.title = "   ".into();
        assert!(normalized(blank).is_err());

        let mut negative = entry(-1.0, 1440.0);
        negative.position = -1.0;
        assert!(normalized(negative).is_err());

        let mut huge = entry(10.0, 1440.0);
        huge.anime_id = "x".repeat(MAX_ID_LEN + 1);
        assert!(normalized(huge).is_err());
    }

    #[test]
    fn a_position_only_update_keeps_the_known_title() {
        let mut stale = entry(5.0, 1440.0);
        stale.title = "Sousou no Frieren".into();
        stale.updated_at = 200;
        let clean = normalized(stale).expect("entry is valid");
        assert_eq!(clean.title, "Sousou no Frieren");
        assert_eq!(clean.episode_number, 3);
    }
}
