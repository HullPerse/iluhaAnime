use std::collections::{HashMap, HashSet};

use rusqlite::{params, Connection, OptionalExtension};

use crate::app_db::cards::{
    get_meta, insert_pack, upsert_meta, CardMetaRow, CardPackRow, LOCAL_USER_ID,
};
use crate::app_db::db::now_seconds;
use crate::cards::config::CARD_PACK_SIZE;
use crate::cards::rarity::score_for;
use crate::cards::types::{CardKind, CardPackContentsState};

use super::pool::{self, Candidate, PoolEntry};
use super::types::{
    DailyAnswer, DailyBootstrap, DailyFrameView, DailyFramesView, DailyGameState, DailyHintView,
    DailyHistoryItem, DailyHistoryMode, DailyMode, DailyModeView, DailyOpView, DailyResultView,
};

fn db_error(context: &str, error: rusqlite::Error) -> String {
    format!("{context}: {error}")
}

fn source_index(value: i64) -> usize {
    usize::try_from(value.max(0)).unwrap_or(0)
}

/// A daily win must stay preparable when AniList is unavailable. Seed a
/// deliberately stale metadata row from the pool entry; a later refresh can
/// replace it with the cover, while preparation still gets a title and score.
fn fallback_answer_meta(entry: &PoolEntry) -> CardMetaRow {
    let popularity = u32::try_from(entry.popularity.max(0)).unwrap_or(u32::MAX);
    let title = entry.title.trim();
    CardMetaRow {
        kind: CardKind::Anime,
        entity_id: entry.media_id,
        title: if title.is_empty() {
            format!("Anime {}", entry.media_id)
        } else {
            title.to_string()
        },
        image_url: None,
        score: Some(score_for(CardKind::Anime, 0, popularity).round() as i64),
        popularity: Some(i64::from(popularity)),
        favourites: Some(0),
        collection_anime_id: None,
        collection_manga_id: None,
        collection_title: None,
        collection_cover_url: None,
        collage_json: None,
        fetched_at: 0,
        preferred_image_url: None,
        collage_expected: None,
    }
}

pub struct StoredGame {
    pub entry: PoolEntry,
    pub state: DailyGameState,
    pub seed: u64,
    pub attempts: u32,
    pub guesses: Vec<i64>,
    pub sources: Vec<String>,
    pub theme_type: String,
    pub clip_path: String,
    pub start_fraction: f64,
}

fn insert_game(connection: &Connection, day: &str, candidate: &Candidate) -> Result<(), String> {
    let payload = serde_json::to_string(candidate.entry)
        .map_err(|error| format!("serialize daily candidate: {error}"))?;
    connection
        .execute(
            "INSERT OR IGNORE INTO daily_games (
                day, mode, media_id, mal_id, difficulty, seed, payload_json, state
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending')",
            params![
                day,
                candidate.mode.as_str(),
                candidate.entry.media_id,
                candidate.entry.mal_id,
                candidate.entry.tier.as_str(),
                candidate.seed as i64,
                payload,
            ],
        )
        .map_err(|error| db_error("insert daily game", error))?;
    Ok(())
}

pub fn ensure_games(connection: &Connection, day: &str) -> Result<(), String> {
    let frames = pool::pick(day, DailyMode::Frames, None)?;
    insert_game(connection, day, &frames)?;
    let stored_frames: Option<i64> = connection
        .query_row(
            "SELECT media_id FROM daily_games WHERE day = ?1 AND mode = 'frames'",
            [day],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| db_error("read daily frames game", error))?;
    let op = pool::pick(day, DailyMode::Op, stored_frames)?;
    insert_game(connection, day, &op)?;
    let mut excluded = vec![op.entry.media_id];
    if let Some(frames_id) = stored_frames {
        excluded.push(frames_id);
    }
    let audio = pool::pick_avoiding(day, DailyMode::Audio, &excluded)?;
    insert_game(connection, day, &audio)?;
    Ok(())
}

pub fn load_game(
    connection: &Connection,
    day: &str,
    mode: DailyMode,
) -> Result<StoredGame, String> {
    let (
        state,
        payload,
        seed,
        attempts,
        guesses_json,
        sources_json,
        theme_type,
        clip_path,
        start_fraction,
    ): (
        String,
        String,
        i64,
        u32,
        String,
        String,
        String,
        String,
        f64,
    ) = connection
        .query_row(
            "SELECT state, payload_json, seed, attempts, guesses_json, sources_json,
                    theme_type, clip_path, clip_start
               FROM daily_games WHERE day = ?1 AND mode = ?2",
            params![day, mode.as_str()],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                    row.get(8)?,
                ))
            },
        )
        .map_err(|error| db_error("read daily game", error))?;
    let entry: PoolEntry =
        serde_json::from_str(&payload).map_err(|error| format!("parse daily payload: {error}"))?;
    let guesses: Vec<i64> = serde_json::from_str(&guesses_json)
        .map_err(|error| format!("parse daily guesses: {error}"))?;
    let sources: Vec<String> = serde_json::from_str(&sources_json)
        .map_err(|error| format!("parse daily sources: {error}"))?;
    Ok(StoredGame {
        entry,
        state: DailyGameState::parse(&state)?,
        seed: seed as u64,
        attempts,
        guesses,
        sources,
        theme_type,
        clip_path,
        start_fraction,
    })
}

pub fn load_frames(
    connection: &Connection,
    day: &str,
    mode: DailyMode,
    limit: u32,
) -> Result<Vec<DailyFrameView>, String> {
    let mut statement = connection
        .prepare(
            "SELECT slot, image_path, hint_kind, hint_value
               FROM daily_game_frames
              WHERE day = ?1 AND mode = ?2 AND image_path <> ''
              ORDER BY slot ASC
              LIMIT ?3",
        )
        .map_err(|error| db_error("prepare daily frames", error))?;
    let rows = statement
        .query_map(params![day, mode.as_str(), limit], |row| {
            Ok(DailyFrameView {
                slot: row.get(0)?,
                data_url: row.get(1)?,
                hint_kind: row.get(2)?,
                hint_value: row.get(3)?,
            })
        })
        .map_err(|error| db_error("query daily frames", error))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| db_error("collect daily frames", error))
}

pub fn load_frame(
    connection: &Connection,
    day: &str,
    mode: DailyMode,
    slot: u32,
) -> Result<Option<(DailyFrameView, usize)>, String> {
    connection
        .query_row(
            "SELECT slot, image_path, hint_kind, hint_value, source_index
               FROM daily_game_frames
              WHERE day = ?1 AND mode = ?2 AND slot = ?3 AND image_path <> ''",
            params![day, mode.as_str(), slot],
            |row| {
                Ok((
                    DailyFrameView {
                        slot: row.get(0)?,
                        data_url: row.get(1)?,
                        hint_kind: row.get(2)?,
                        hint_value: row.get(3)?,
                    },
                    source_index(row.get::<_, i64>(4)?),
                ))
            },
        )
        .optional()
        .map_err(|error| db_error("read daily frame", error))
}

pub fn load_frame_hint(
    connection: &Connection,
    day: &str,
    mode: DailyMode,
    slot: u32,
) -> Result<(String, String), String> {
    connection
        .query_row(
            "SELECT hint_kind, hint_value FROM daily_game_frames
              WHERE day = ?1 AND mode = ?2 AND slot = ?3",
            params![day, mode.as_str(), slot],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|error| db_error("read daily frame hint", error))?
        .ok_or_else(|| format!("daily frame hint is missing for slot {slot}"))
}

pub fn load_source_indexes(
    connection: &Connection,
    day: &str,
    mode: DailyMode,
) -> Result<HashSet<usize>, String> {
    let mut statement = connection
        .prepare(
            "SELECT source_index FROM daily_game_frames
              WHERE day = ?1 AND mode = ?2 AND source_index >= 0",
        )
        .map_err(|error| db_error("prepare daily source indexes", error))?;
    let rows = statement
        .query_map(params![day, mode.as_str()], |row| row.get::<_, i64>(0))
        .map_err(|error| db_error("query daily source indexes", error))?;
    let mut used = HashSet::new();
    for row in rows {
        used.insert(source_index(
            row.map_err(|error| db_error("collect daily source index", error))?,
        ));
    }
    Ok(used)
}

pub fn answer(entry: &PoolEntry) -> DailyAnswer {
    DailyAnswer {
        media_id: entry.media_id,
        title: entry.title.clone(),
        year: entry.year,
        format: entry.format.clone(),
        episodes: entry.episodes,
        genres: entry.genres.clone(),
        studio: entry.studio.clone(),
        score: entry.score,
        source: entry.source.clone(),
    }
}

pub fn result_view(
    connection: &Connection,
    day: &str,
    mode: DailyMode,
    entry: &PoolEntry,
) -> Result<Option<DailyResultView>, String> {
    let row: Option<(bool, u32, Option<String>)> = connection
        .query_row(
            "SELECT won, attempts, reward_pack_id FROM daily_results
              WHERE day = ?1 AND mode = ?2",
            params![day, mode.as_str()],
            |row| Ok((row.get::<_, i64>(0)? != 0, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(|error| db_error("read daily result", error))?;
    Ok(row.map(|(won, attempts, reward_pack_id)| DailyResultView {
        won,
        attempts,
        answer: answer(entry),
        reward_pack_id,
    }))
}

pub fn frames_view(
    connection: &Connection,
    day: &str,
    mode: DailyMode,
    entry: &PoolEntry,
    attempts: u32,
    max_attempts: u32,
) -> Result<DailyFramesView, String> {
    let result = result_view(connection, day, mode, entry)?;
    let revealed = if result.is_some() {
        attempts.clamp(1, max_attempts)
    } else {
        (attempts + 1).min(max_attempts)
    };
    let frames = load_frames(connection, day, mode, revealed)?;
    Ok(DailyFramesView {
        day: day.to_owned(),
        mode,
        attempts,
        max_attempts,
        revealed,
        frames,
        result,
    })
}

pub fn save_prepared_frame(
    connection: &Connection,
    day: &str,
    mode: DailyMode,
    entry: &PoolEntry,
    sources: &[String],
    hints: &[(String, String)],
    frame: &DailyFrameView,
    source_index: usize,
) -> Result<(), String> {
    let payload = serde_json::to_string(entry)
        .map_err(|error| format!("serialize daily candidate: {error}"))?;
    let sources_json = serde_json::to_string(sources)
        .map_err(|error| format!("serialize daily sources: {error}"))?;
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| db_error("daily frames transaction", error))?;
    transaction
        .execute(
            "UPDATE daily_games
                SET media_id = ?3, mal_id = ?4, difficulty = ?5, payload_json = ?6,
                    sources_json = ?7, state = 'ready', error = NULL, prepared_at = ?8,
                    attempts = 0, guesses_json = '[]'
              WHERE day = ?1 AND mode = ?2",
            params![
                day,
                mode.as_str(),
                entry.media_id,
                entry.mal_id,
                entry.tier.as_str(),
                payload,
                sources_json,
                now_seconds(),
            ],
        )
        .map_err(|error| db_error("mark daily game ready", error))?;
    transaction
        .execute(
            "DELETE FROM daily_game_frames WHERE day = ?1 AND mode = ?2",
            params![day, mode.as_str()],
        )
        .map_err(|error| db_error("clear daily frames", error))?;
    for (slot, (hint_kind, hint_value)) in hints.iter().enumerate() {
        let slot = slot as u32;
        let image_path = if slot == frame.slot {
            frame.data_url.as_str()
        } else {
            ""
        };
        let index = if slot == frame.slot {
            source_index as i64
        } else {
            -1
        };
        transaction
            .execute(
                "INSERT INTO daily_game_frames
                    (day, mode, slot, image_path, hint_kind, hint_value, source_index)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    day,
                    mode.as_str(),
                    slot,
                    image_path,
                    hint_kind,
                    hint_value,
                    index,
                ],
            )
            .map_err(|error| db_error("insert daily frame plan", error))?;
    }
    transaction
        .commit()
        .map_err(|error| db_error("commit daily frames", error))?;
    Ok(())
}

pub fn set_failure(
    connection: &Connection,
    day: &str,
    mode: DailyMode,
    error: &str,
) -> Result<(), String> {
    connection
        .execute(
            "UPDATE daily_games SET state = 'failed', error = ?3
              WHERE day = ?1 AND mode = ?2",
            params![day, mode.as_str(), error],
        )
        .map_err(|error| db_error("mark daily game failed", error))?;
    Ok(())
}

pub fn save_progress_with_frame(
    connection: &Connection,
    day: &str,
    mode: DailyMode,
    attempts: u32,
    guesses: &[i64],
    frame: &DailyFrameView,
    source_index: usize,
) -> Result<(), String> {
    let guesses_json =
        serde_json::to_string(guesses).map_err(|error| format!("serialize guesses: {error}"))?;
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| db_error("daily progress transaction", error))?;
    transaction
        .execute(
            "UPDATE daily_games SET attempts = ?3, guesses_json = ?4
              WHERE day = ?1 AND mode = ?2",
            params![day, mode.as_str(), attempts, guesses_json],
        )
        .map_err(|error| db_error("save daily progress", error))?;
    transaction
        .execute(
            "INSERT INTO daily_game_frames
                (day, mode, slot, image_path, hint_kind, hint_value, source_index)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(day, mode, slot) DO UPDATE SET
                image_path = excluded.image_path,
                hint_kind = excluded.hint_kind,
                hint_value = excluded.hint_value,
                source_index = excluded.source_index",
            params![
                day,
                mode.as_str(),
                frame.slot,
                frame.data_url,
                frame.hint_kind,
                frame.hint_value,
                source_index as i64,
            ],
        )
        .map_err(|error| db_error("save daily frame", error))?;
    transaction
        .commit()
        .map_err(|error| db_error("commit daily progress", error))?;
    Ok(())
}

/// Stores one frame without touching attempts or guesses. Used by the reveal
/// screen to fill the slots that a win skipped over.
pub fn save_revealed_frame(
    connection: &Connection,
    day: &str,
    mode: DailyMode,
    frame: &DailyFrameView,
    source_index: usize,
) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO daily_game_frames
                (day, mode, slot, image_path, hint_kind, hint_value, source_index)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(day, mode, slot) DO UPDATE SET
                image_path = excluded.image_path,
                hint_kind = excluded.hint_kind,
                hint_value = excluded.hint_value,
                source_index = excluded.source_index",
            params![
                day,
                mode.as_str(),
                frame.slot,
                frame.data_url.as_str(),
                frame.hint_kind.as_str(),
                frame.hint_value.as_str(),
                source_index as i64,
            ],
        )
        .map_err(|error| db_error("save revealed daily frame", error))?;
    Ok(())
}

/// Stores the resolved OP/ED challenge. The clip is already an opaque local
/// file, so only its path is kept here; hints replace the frame plan rows.
#[allow(clippy::too_many_arguments)]
pub fn save_prepared_op(
    connection: &Connection,
    day: &str,
    mode: DailyMode,
    entry: &PoolEntry,
    theme_type: &str,
    theme_title: &str,
    clip_path: &str,
    start_fraction: f64,
    hints: &[(String, String)],
) -> Result<(), String> {
    let payload = serde_json::to_string(entry)
        .map_err(|error| format!("serialize daily candidate: {error}"))?;
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| db_error("daily op transaction", error))?;
    transaction
        .execute(
            "UPDATE daily_games
                SET media_id = ?3, mal_id = ?4, difficulty = ?5, payload_json = ?6,
                    theme_type = ?7, theme_title = ?8, clip_path = ?9, clip_start = ?10,
                    state = 'ready', error = NULL, prepared_at = ?11,
                    attempts = 0, guesses_json = '[]'
              WHERE day = ?1 AND mode = ?2",
            params![
                day,
                mode.as_str(),
                entry.media_id,
                entry.mal_id,
                entry.tier.as_str(),
                payload,
                theme_type,
                theme_title,
                clip_path,
                start_fraction,
                now_seconds(),
            ],
        )
        .map_err(|error| db_error("mark daily op ready", error))?;
    transaction
        .execute(
            "DELETE FROM daily_game_frames WHERE day = ?1 AND mode = ?2",
            params![day, mode.as_str()],
        )
        .map_err(|error| db_error("clear daily op hints", error))?;
    for (slot, (hint_kind, hint_value)) in hints.iter().enumerate() {
        transaction
            .execute(
                "INSERT INTO daily_game_frames
                    (day, mode, slot, image_path, hint_kind, hint_value, source_index)
                 VALUES (?1, ?2, ?3, '', ?4, ?5, -1)",
                params![day, mode.as_str(), slot as u32, hint_kind, hint_value],
            )
            .map_err(|error| db_error("insert daily op hint", error))?;
    }
    transaction
        .commit()
        .map_err(|error| db_error("commit daily op preparation", error))?;
    Ok(())
}

pub fn load_hints(
    connection: &Connection,
    day: &str,
    mode: DailyMode,
    limit: u32,
) -> Result<Vec<DailyHintView>, String> {
    let mut statement = connection
        .prepare(
            "SELECT slot, hint_kind, hint_value
               FROM daily_game_frames
              WHERE day = ?1 AND mode = ?2 AND image_path = ''
              ORDER BY slot ASC
              LIMIT ?3",
        )
        .map_err(|error| db_error("prepare daily op hints", error))?;
    let rows = statement
        .query_map(params![day, mode.as_str(), limit], |row| {
            Ok(DailyHintView {
                slot: row.get(0)?,
                hint_kind: row.get(1)?,
                hint_value: row.get(2)?,
            })
        })
        .map_err(|error| db_error("query daily op hints", error))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| db_error("collect daily op hints", error))
}

pub fn save_op_progress(
    connection: &Connection,
    day: &str,
    mode: DailyMode,
    attempts: u32,
    guesses: &[i64],
) -> Result<(), String> {
    let guesses_json =
        serde_json::to_string(guesses).map_err(|error| format!("serialize guesses: {error}"))?;
    connection
        .execute(
            "UPDATE daily_games SET attempts = ?3, guesses_json = ?4
              WHERE day = ?1 AND mode = ?2",
            params![day, mode.as_str(), attempts, guesses_json],
        )
        .map_err(|error| db_error("save daily op progress", error))?;
    Ok(())
}

pub fn op_view(
    connection: &Connection,
    day: &str,
    mode: DailyMode,
    game: &StoredGame,
    attempts: u32,
    max_attempts: u32,
) -> Result<DailyOpView, String> {
    let result = result_view(connection, day, mode, &game.entry)?;
    let revealed = if result.is_some() {
        attempts.clamp(1, max_attempts)
    } else {
        (attempts + 1).min(max_attempts)
    };
    let hints = load_hints(connection, day, mode, attempts.min(max_attempts))?;
    let full = super::themes::full_clip_path(&game.clip_path);
    let full_path = if !full.is_empty() && std::path::Path::new(&full).is_file() {
        full
    } else {
        String::new()
    };
    Ok(DailyOpView {
        day: day.to_owned(),
        mode,
        attempts,
        max_attempts,
        revealed,
        clip_path: game.clip_path.clone(),
        full_path,
        start_fraction: game.start_fraction,
        theme_type: game.theme_type.clone(),
        hints,
        result,
    })
}

/// The result and its pack are one transaction. A repeated finish finds the
/// existing result and inserts nothing, so a refresh cannot mint a second pack.
pub fn finish_guess(
    connection: &Connection,
    day: &str,
    mode: DailyMode,
    won: bool,
    attempts: u32,
    guesses: &[i64],
    entry: &PoolEntry,
) -> Result<Option<String>, String> {
    let guesses_json =
        serde_json::to_string(guesses).map_err(|error| format!("serialize guesses: {error}"))?;
    let pack_id = if won {
        Some(format!("daily-{day}-{}", mode.as_str()))
    } else {
        None
    };
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| db_error("daily result transaction", error))?;
    let changed = transaction
        .execute(
            "INSERT OR IGNORE INTO daily_results
                (day, mode, won, attempts, guesses_json, reward_pack_id, played_at, title)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                day,
                mode.as_str(),
                if won { 1i64 } else { 0i64 },
                attempts,
                guesses_json,
                pack_id,
                now_seconds(),
                entry.title.as_str(),
            ],
        )
        .map_err(|error| db_error("insert daily result", error))?;
    if changed == 0 {
        let stored: Option<String> = transaction
            .query_row(
                "SELECT reward_pack_id FROM daily_results WHERE day = ?1 AND mode = ?2",
                params![day, mode.as_str()],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| db_error("read repeated daily reward", error))?
            .flatten();
        transaction
            .commit()
            .map_err(|error| db_error("commit repeated daily result", error))?;
        return Ok(stored);
    }
    transaction
        .execute(
            "UPDATE daily_games SET attempts = ?3, guesses_json = ?4
              WHERE day = ?1 AND mode = ?2",
            params![day, mode.as_str(), attempts, guesses_json],
        )
        .map_err(|error| db_error("update daily attempts", error))?;
    if let Some(pack_id) = &pack_id {
        insert_pack(
            &transaction,
            LOCAL_USER_ID,
            &CardPackRow {
                id: pack_id.clone(),
                source: "daily".into(),
                pack_kind: "default".into(),
                media_id: Some(entry.media_id),
                media_kind: None,
                seed: (entry.media_id as i64) ^ (attempts as i64) ^ 0x005D_A11E,
                size: CARD_PACK_SIZE as i64,
                created_at: now_seconds(),
                opened_at: None,
                contents_state: CardPackContentsState::Pending,
                claimed_at: None,
                chosen_slot: None,
            },
        )?;
        if get_meta(&transaction, CardKind::Anime, entry.media_id)?.is_none() {
            upsert_meta(&transaction, &fallback_answer_meta(entry))?;
        }
    }
    transaction
        .commit()
        .map_err(|error| db_error("commit daily result", error))?;
    Ok(pack_id)
}

/// The last finished days, newest first, optionally without one `(day, mode)`
/// pair — the result currently on screen. The title falls back to the cached
/// anime metadata for results written before the title column existed.
pub fn history(
    connection: &Connection,
    limit: u32,
    exclude: Option<(&str, DailyHistoryMode)>,
) -> Result<Vec<DailyHistoryItem>, String> {
    let (exclude_day, exclude_mode) = match exclude {
        Some((day, mode)) => (Some(day), Some(mode.as_str())),
        None => (None, None),
    };
    let mut statement = connection
        .prepare(
            "SELECT r.day, r.mode, r.won, r.attempts, r.played_at, g.media_id,
                    COALESCE(NULLIF(r.title, ''), m.title, '')
               FROM daily_results r
               LEFT JOIN daily_games g ON g.day = r.day AND g.mode = r.mode
               LEFT JOIN card_meta m ON m.kind = 'anime' AND m.entity_id = g.media_id
              WHERE (?1 IS NULL OR r.day != ?1 OR r.mode != ?2)
              ORDER BY r.day DESC, r.mode ASC
              LIMIT ?3",
        )
        .map_err(|error| db_error("prepare daily history", error))?;
    let rows = statement
        .query_map(
            params![exclude_day, exclude_mode, i64::from(limit)],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)? != 0,
                    row.get::<_, u32>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, Option<i64>>(5)?,
                    row.get::<_, String>(6)?,
                ))
            },
        )
        .map_err(|error| db_error("query daily history", error))?;
    let mut items = Vec::new();
    for row in rows {
        let (day, mode, won, attempts, played_at, media_id, title) =
            row.map_err(|error| db_error("read daily history", error))?;
        let mode = DailyHistoryMode::parse(&mode)?;
        items.push(DailyHistoryItem {
            day,
            mode,
            won,
            attempts,
            max_attempts: mode.max_attempts(),
            media_id,
            title,
            played_at,
        });
    }
    for (day, correct, won) in super::characters::finished_scores(connection, limit)? {
        if exclude.is_some_and(|(excluded_day, excluded_mode)| {
            excluded_mode == DailyHistoryMode::Characters && excluded_day == day
        }) {
            continue;
        }
        items.push(DailyHistoryItem {
            day,
            mode: DailyHistoryMode::Characters,
            won,
            attempts: correct as u32,
            max_attempts: DailyHistoryMode::Characters.max_attempts(),
            media_id: None,
            title: String::new(),
            played_at: 0,
        });
    }
    items.sort_by(|left, right| {
        right
            .day
            .cmp(&left.day)
            .then_with(|| left.mode.as_str().cmp(right.mode.as_str()))
    });
    items.truncate(limit as usize);
    Ok(items)
}

/// Test-only reset: clears every daily game, its frames and results, plus
/// unopened reward packs. Opened packs stay so the album history is intact.
pub fn reset(connection: &Connection) -> Result<(), String> {
    super::characters::ensure_table(connection)?;
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| db_error("daily reset transaction", error))?;
    transaction
        .execute(
            "DELETE FROM card_pack_cards
              WHERE pack_id IN (
                  SELECT id FROM card_packs WHERE source = 'daily' AND opened_at IS NULL
              )",
            [],
        )
        .map_err(|error| db_error("clear daily pack contents", error))?;
    transaction
        .execute(
            "DELETE FROM card_packs WHERE source = 'daily' AND opened_at IS NULL",
            [],
        )
        .map_err(|error| db_error("clear daily packs", error))?;
    transaction
        .execute("DELETE FROM daily_game_frames", [])
        .map_err(|error| db_error("clear daily frames", error))?;
    transaction
        .execute("DELETE FROM daily_results", [])
        .map_err(|error| db_error("clear daily results", error))?;
    transaction
        .execute("DELETE FROM daily_games", [])
        .map_err(|error| db_error("clear daily games", error))?;
    transaction
        .execute("DELETE FROM daily_characters", [])
        .map_err(|error| db_error("clear daily characters", error))?;
    transaction
        .commit()
        .map_err(|error| db_error("commit daily reset", error))?;
    Ok(())
}

pub fn streak(connection: &Connection, day: &str) -> i64 {
    if super::characters::ensure_table(connection).is_err() {
        return 0;
    }
    let Ok(mut statement) =
        connection.prepare("SELECT day FROM daily_results UNION SELECT day FROM daily_characters WHERE finished=1 OR reward_pack_id IS NOT NULL ORDER BY day DESC LIMIT 400")
    else {
        return 0;
    };
    let Ok(rows) = statement.query_map([], |row| row.get::<_, String>(0)) else {
        return 0;
    };
    let Ok(today_played) = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM daily_results WHERE day = ?1 UNION SELECT 1 FROM daily_characters WHERE day=?1 AND (finished=1 OR reward_pack_id IS NOT NULL))",
        [day],
        |row| row.get::<_, bool>(0),
    ) else {
        return 0;
    };
    let mut expected = if today_played {
        day.to_owned()
    } else {
        let Some(previous) = super::seed::previous_day(day) else {
            return 0;
        };
        previous
    };
    let mut count = 0;
    for stored in rows.flatten() {
        if stored == expected {
            count += 1;
            let Some(previous) = super::seed::previous_day(&expected) else {
                break;
            };
            expected = previous;
        } else if stored < expected {
            break;
        }
    }
    count
}

/// Old rows may still carry an error from before the source messages became
/// generic. Keep the stored detail for logs but never return it to the
/// renderer when it names the answer.
fn sanitized_error(error: Option<String>, entry: &PoolEntry) -> Option<String> {
    error.map(|message| {
        if message.contains(entry.title.as_str()) {
            "daily source is unavailable".to_string()
        } else {
            message
        }
    })
}

pub fn bootstrap(connection: &Connection, day: &str) -> Result<DailyBootstrap, String> {
    let mut game_statement = connection
        .prepare(
            "SELECT mode, state, error, payload_json, attempts
               FROM daily_games WHERE day = ?1",
        )
        .map_err(|error| db_error("prepare daily games", error))?;
    let mut game_rows = game_statement
        .query([day])
        .map_err(|error| db_error("query daily games", error))?;
    let mut games: HashMap<String, (DailyGameState, Option<String>, String, u32)> = HashMap::new();
    while let Some(row) = game_rows
        .next()
        .map_err(|error| db_error("read daily game", error))?
    {
        let mode: String = row
            .get(0)
            .map_err(|error| db_error("read daily mode", error))?;
        let state: String = row
            .get(1)
            .map_err(|error| db_error("read daily state", error))?;
        let error: Option<String> = row
            .get(2)
            .map_err(|error| db_error("read daily error", error))?;
        let payload: String = row
            .get(3)
            .map_err(|error| db_error("read daily payload", error))?;
        let attempts: u32 = row
            .get(4)
            .map_err(|error| db_error("read daily attempts", error))?;
        games.insert(
            mode,
            (DailyGameState::parse(&state)?, error, payload, attempts),
        );
    }

    let mut result_statement = connection
        .prepare("SELECT mode, won, attempts, reward_pack_id FROM daily_results WHERE day = ?1")
        .map_err(|error| db_error("prepare daily results", error))?;
    let mut result_rows = result_statement
        .query([day])
        .map_err(|error| db_error("query daily results", error))?;
    let mut results: HashMap<String, (bool, u32, Option<String>)> = HashMap::new();
    while let Some(row) = result_rows
        .next()
        .map_err(|error| db_error("read daily result", error))?
    {
        let mode: String = row
            .get(0)
            .map_err(|error| db_error("read daily result mode", error))?;
        let won: i64 = row
            .get(1)
            .map_err(|error| db_error("read daily won", error))?;
        let attempts: u32 = row
            .get(2)
            .map_err(|error| db_error("read daily attempts", error))?;
        let reward_pack_id: Option<String> = row
            .get(3)
            .map_err(|error| db_error("read daily reward", error))?;
        results.insert(mode, (won != 0, attempts, reward_pack_id));
    }

    let mut modes = Vec::with_capacity(DailyMode::ALL.len());
    for mode in DailyMode::ALL {
        let key = mode.as_str();
        let (state, error, payload, attempts) = games
            .remove(key)
            .ok_or_else(|| format!("daily game row is missing for {key}"))?;
        let entry: PoolEntry = serde_json::from_str(&payload)
            .map_err(|error| format!("parse daily payload: {error}"))?;
        let result = results
            .remove(key)
            .map(|(won, result_attempts, reward_pack_id)| DailyResultView {
                won,
                attempts: result_attempts,
                answer: answer(&entry),
                reward_pack_id,
            });
        modes.push(DailyModeView {
            mode,
            state,
            attempts,
            max_attempts: mode.max_attempts(),
            error: sanitized_error(error, &entry),
            result,
        });
    }

    Ok(DailyBootstrap {
        day: day.to_owned(),
        modes,
        streak: streak(connection, day),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_db::schema::initialize_schema;

    fn memory_db() -> Connection {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema migration");
        connection
    }

    #[test]
    fn ensure_games_is_idempotent_and_creates_three_modes() {
        let connection = memory_db();
        ensure_games(&connection, "2026-11-14").expect("first ensure");
        ensure_games(&connection, "2026-11-14").expect("second ensure");
        let count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM daily_games WHERE day = '2026-11-14'",
                [],
                |row| row.get(0),
            )
            .expect("count daily games");
        assert_eq!(count, 3);
        let bootstrap = bootstrap(&connection, "2026-11-14").expect("bootstrap");
        assert_eq!(bootstrap.modes.len(), 3);
        assert!(bootstrap
            .modes
            .iter()
            .all(|mode| mode.state == DailyGameState::Pending));
        assert!(bootstrap.modes.iter().all(|mode| mode.result.is_none()));
    }

    #[test]
    fn the_modes_do_not_share_the_same_answer() {
        let connection = memory_db();
        ensure_games(&connection, "2026-11-14").expect("ensure");
        let mut statement = connection
            .prepare("SELECT media_id FROM daily_games WHERE day = '2026-11-14'")
            .expect("prepare ids");
        let ids: Vec<i64> = statement
            .query_map([], |row| row.get(0))
            .expect("query ids")
            .map(|row| row.expect("media id"))
            .collect();
        assert_eq!(ids.len(), 3);
        assert_ne!(ids[0], ids[1]);
        assert_ne!(ids[1], ids[2]);
        assert_ne!(ids[0], ids[2]);
    }

    #[test]
    fn op_preparation_saves_hints_and_resets_progress() {
        let connection = memory_db();
        ensure_games(&connection, "2026-11-14").expect("ensure");
        let game = load_game(&connection, "2026-11-14", DailyMode::Op).expect("game");
        let hints = vec![
            ("year".to_string(), "2013".to_string()),
            ("studio".to_string(), "Wit Studio".to_string()),
        ];
        save_prepared_op(
            &connection,
            "2026-11-14",
            DailyMode::Op,
            &game.entry,
            "OP",
            "Guren no Yumiya",
            "/tmp/daily-clip.webm",
            0.42,
            &hints,
        )
        .expect("save prepared op");

        let stored = load_game(&connection, "2026-11-14", DailyMode::Op).expect("stored game");
        assert_eq!(stored.state, DailyGameState::Ready);
        assert_eq!(stored.theme_type, "OP");
        let stored_title: String = connection
            .query_row(
                "SELECT theme_title FROM daily_games WHERE day = ?1 AND mode = ?2",
                params!["2026-11-14", DailyMode::Op.as_str()],
                |row| row.get(0),
            )
            .expect("stored theme title");
        assert_eq!(stored_title, "Guren no Yumiya");
        assert_eq!(stored.clip_path, "/tmp/daily-clip.webm");
        assert!((stored.start_fraction - 0.42).abs() < f64::EPSILON);

        save_op_progress(&connection, "2026-11-14", DailyMode::Op, 2, &[7, 8])
            .expect("save op progress");
        let view =
            op_view(&connection, "2026-11-14", DailyMode::Op, &stored, 2, 5).expect("op view");
        assert_eq!(view.revealed, 3);
        assert_eq!(view.hints.len(), 2);
        assert_eq!(view.hints[0].hint_value, "2013");
    }

    #[test]
    fn lazy_frames_save_one_ready_slot_and_keep_the_plan() {
        let connection = memory_db();
        ensure_games(&connection, "2026-11-14").expect("ensure");
        let game = load_game(&connection, "2026-11-14", DailyMode::Frames).expect("game");
        let sources: Vec<String> = (0..6)
            .map(|index| format!("https://example.test/{index}.jpg"))
            .collect();
        let hints: Vec<(String, String)> = (0..6)
            .map(|slot| ("year".to_string(), (2010 + slot).to_string()))
            .collect();
        let first = DailyFrameView {
            slot: 0,
            data_url: "data:image/jpeg;base64,AA".into(),
            hint_kind: hints[0].0.clone(),
            hint_value: hints[0].1.clone(),
        };
        save_prepared_frame(
            &connection,
            "2026-11-14",
            DailyMode::Frames,
            &game.entry,
            &sources,
            &hints,
            &first,
            3,
        )
        .expect("save prepared frame");

        let stored = load_game(&connection, "2026-11-14", DailyMode::Frames).expect("stored game");
        assert_eq!(stored.state, DailyGameState::Ready);
        assert_eq!(stored.sources, sources);
        assert_eq!(
            load_frames(&connection, "2026-11-14", DailyMode::Frames, 6)
                .expect("ready frames")
                .len(),
            1
        );
        assert_eq!(
            load_source_indexes(&connection, "2026-11-14", DailyMode::Frames)
                .expect("used indexes"),
            HashSet::from([3])
        );
        assert_eq!(
            load_frame_hint(&connection, "2026-11-14", DailyMode::Frames, 1).expect("next hint"),
            hints[1].clone()
        );

        let next = DailyFrameView {
            slot: 1,
            data_url: "data:image/jpeg;base64,BB".into(),
            hint_kind: hints[1].0.clone(),
            hint_value: hints[1].1.clone(),
        };
        save_progress_with_frame(
            &connection,
            "2026-11-14",
            DailyMode::Frames,
            1,
            &[42],
            &next,
            5,
        )
        .expect("save next frame");

        assert_eq!(
            load_frames(&connection, "2026-11-14", DailyMode::Frames, 6)
                .expect("two ready frames")
                .len(),
            2
        );
        assert_eq!(
            load_game(&connection, "2026-11-14", DailyMode::Frames)
                .expect("progress")
                .attempts,
            1
        );
        assert_eq!(
            load_source_indexes(&connection, "2026-11-14", DailyMode::Frames)
                .expect("used indexes"),
            HashSet::from([3, 5])
        );
        let loaded = load_frame(&connection, "2026-11-14", DailyMode::Frames, 1)
            .expect("read next frame")
            .expect("next frame");
        assert_eq!(loaded.0.data_url, next.data_url);
        assert_eq!(loaded.1, 5);
    }

    #[test]
    fn revealed_frames_fill_missing_slots_without_touching_progress() {
        let connection = memory_db();
        ensure_games(&connection, "2026-11-14").expect("ensure");
        let game = load_game(&connection, "2026-11-14", DailyMode::Frames).expect("game");
        let sources: Vec<String> = (0..6)
            .map(|index| format!("https://example.test/{index}.jpg"))
            .collect();
        let hints: Vec<(String, String)> = (0..6)
            .map(|slot| ("year".to_string(), (2010 + slot).to_string()))
            .collect();
        let first = DailyFrameView {
            slot: 0,
            data_url: "data:image/jpeg;base64,AA".into(),
            hint_kind: hints[0].0.clone(),
            hint_value: hints[0].1.clone(),
        };
        save_prepared_frame(
            &connection,
            "2026-11-14",
            DailyMode::Frames,
            &game.entry,
            &sources,
            &hints,
            &first,
            2,
        )
        .expect("save prepared frame");
        let last = DailyFrameView {
            slot: 5,
            data_url: "data:image/jpeg;base64,FF".into(),
            hint_kind: hints[5].0.clone(),
            hint_value: hints[5].1.clone(),
        };
        save_revealed_frame(&connection, "2026-11-14", DailyMode::Frames, &last, 5)
            .expect("save revealed frame");

        assert_eq!(
            load_frames(&connection, "2026-11-14", DailyMode::Frames, 6)
                .expect("revealed frames")
                .len(),
            2
        );
        assert_eq!(
            load_game(&connection, "2026-11-14", DailyMode::Frames)
                .expect("progress")
                .attempts,
            0
        );
        assert_eq!(
            load_source_indexes(&connection, "2026-11-14", DailyMode::Frames)
                .expect("used indexes"),
            HashSet::from([2, 5])
        );
    }

    #[test]
    fn a_win_inserts_one_pack_and_a_repeat_does_not() {
        let connection = memory_db();
        ensure_games(&connection, "2026-11-14").expect("ensure");
        let game = load_game(&connection, "2026-11-14", DailyMode::Frames).expect("game");
        let first = finish_guess(
            &connection,
            "2026-11-14",
            DailyMode::Frames,
            true,
            1,
            &[game.entry.media_id],
            &game.entry,
        )
        .expect("first finish");
        assert!(first.is_some());
        let pack_id = first.clone().expect("pack id");
        let (source, media_id, size): (String, Option<i64>, i64) = connection
            .query_row(
                "SELECT source, media_id, size FROM card_packs WHERE id = ?1",
                [pack_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("read daily reward pack");
        assert_eq!(source, "daily");
        assert_eq!(media_id, Some(game.entry.media_id));
        assert_eq!(size, CARD_PACK_SIZE as i64);
        let second = finish_guess(
            &connection,
            "2026-11-14",
            DailyMode::Frames,
            true,
            1,
            &[game.entry.media_id],
            &game.entry,
        )
        .expect("second finish");
        assert_eq!(first, second);
        let packs: i64 = connection
            .query_row("SELECT COUNT(*) FROM card_packs", [], |row| row.get(0))
            .expect("count packs");
        assert_eq!(packs, 1);
        assert_eq!(streak(&connection, "2026-11-14"), 1);
    }

    #[test]
    fn a_repeated_finish_returns_the_stored_reward_after_a_loss() {
        let connection = memory_db();
        ensure_games(&connection, "2026-11-14").expect("ensure");
        let game = load_game(&connection, "2026-11-14", DailyMode::Frames).expect("game");
        let first = finish_guess(
            &connection,
            "2026-11-14",
            DailyMode::Frames,
            false,
            game.attempts + 1,
            &[1],
            &game.entry,
        )
        .expect("first finish");
        assert_eq!(first, None);

        let second = finish_guess(
            &connection,
            "2026-11-14",
            DailyMode::Frames,
            true,
            game.attempts + 1,
            &[game.entry.media_id],
            &game.entry,
        )
        .expect("repeated finish");
        assert_eq!(second, None);
        let packs: i64 = connection
            .query_row("SELECT COUNT(*) FROM card_packs", [], |row| row.get(0))
            .expect("count packs");
        assert_eq!(packs, 0);
    }

    #[test]
    fn a_repeated_finish_keeps_the_stored_reward_after_a_win() {
        let connection = memory_db();
        ensure_games(&connection, "2026-11-14").expect("ensure");
        let game = load_game(&connection, "2026-11-14", DailyMode::Frames).expect("game");
        let first = finish_guess(
            &connection,
            "2026-11-14",
            DailyMode::Frames,
            true,
            1,
            &[game.entry.media_id],
            &game.entry,
        )
        .expect("first finish");
        assert!(first.is_some());

        let second = finish_guess(
            &connection,
            "2026-11-14",
            DailyMode::Frames,
            false,
            2,
            &[1, 2],
            &game.entry,
        )
        .expect("repeated finish");
        assert_eq!(second, first);
    }

    #[test]
    fn a_daily_win_seeds_fallback_answer_metadata() {
        let connection = memory_db();
        ensure_games(&connection, "2026-11-14").expect("ensure");
        let game = load_game(&connection, "2026-11-14", DailyMode::Frames).expect("game");
        finish_guess(
            &connection,
            "2026-11-14",
            DailyMode::Frames,
            true,
            1,
            &[game.entry.media_id],
            &game.entry,
        )
        .expect("finish");

        let (title, image_url, fetched_at): (String, Option<String>, i64) = connection
            .query_row(
                "SELECT title, image_url, fetched_at FROM card_meta
                  WHERE kind = 'anime' AND entity_id = ?1",
                [game.entry.media_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("fallback metadata");
        assert_eq!(title, game.entry.title);
        assert_eq!(image_url, None);
        assert_eq!(fetched_at, 0);
    }

    #[test]
    fn streak_keeps_the_run_until_today_is_played() {
        let connection = memory_db();
        for day in ["2026-11-12", "2026-11-13"] {
            ensure_games(&connection, day).expect("ensure day");
            let game = load_game(&connection, day, DailyMode::Frames).expect("game");
            finish_guess(
                &connection,
                day,
                DailyMode::Frames,
                false,
                6,
                &[1, 2, 3, 4, 5, 6],
                &game.entry,
            )
            .expect("result");
        }
        assert_eq!(streak(&connection, "2026-11-14"), 2);
        assert_eq!(streak(&connection, "2026-11-15"), 0);
    }

    #[test]
    fn history_lists_finished_days_newest_first() {
        let connection = memory_db();
        ensure_games(&connection, "2026-11-13").expect("ensure yesterday");
        let yesterday =
            load_game(&connection, "2026-11-13", DailyMode::Frames).expect("yesterday game");
        finish_guess(
            &connection,
            "2026-11-13",
            DailyMode::Frames,
            false,
            6,
            &[1, 2, 3, 4, 5, 6],
            &yesterday.entry,
        )
        .expect("yesterday result");
        ensure_games(&connection, "2026-11-14").expect("ensure today");
        let today = load_game(&connection, "2026-11-14", DailyMode::Op).expect("today game");
        finish_guess(
            &connection,
            "2026-11-14",
            DailyMode::Op,
            true,
            2,
            &[7],
            &today.entry,
        )
        .expect("today result");

        let items = history(&connection, 20, None).expect("history");
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].day, "2026-11-14");
        assert_eq!(items[0].mode, DailyHistoryMode::Op);
        assert!(items[0].won);
        assert_eq!(items[0].attempts, 2);
        assert_eq!(items[0].max_attempts, DailyHistoryMode::Op.max_attempts());
        assert_eq!(items[0].title, today.entry.title);
        assert_eq!(items[1].day, "2026-11-13");
        assert!(!items[1].won);
        assert_eq!(items[1].title, yesterday.entry.title);
        assert_eq!(history(&connection, 1, None).expect("limited").len(), 1);

        let without_current = history(&connection, 20, Some(("2026-11-14", DailyHistoryMode::Op)))
            .expect("history without the current result");
        assert_eq!(without_current.len(), 1);
        assert_eq!(without_current[0].day, "2026-11-13");
        assert_eq!(without_current[0].mode, DailyHistoryMode::Frames);
    }

    #[test]
    fn history_includes_finished_character_sheets_and_can_exclude_them() {
        let connection = memory_db();
        super::super::characters::ensure_table(&connection).expect("characters table");
        connection
            .execute(
                "INSERT INTO daily_characters(day, roster, progress, reward_pack_id, finished)
                 VALUES (?1, '[]', ?2, NULL, 1)",
                params![
                    "2026-11-12",
                    serde_json::json!({
                        "answers": [],
                        "checked": true,
                        "correct": [
                            [true, true],
                            [true, true],
                            [true, true],
                            [true, false],
                            [false, false]
                        ]
                    })
                    .to_string()
                ],
            )
            .expect("character sheet");

        let items = history(&connection, 20, None).expect("history");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].mode, DailyHistoryMode::Characters);
        assert!(items[0].won);
        assert_eq!(items[0].attempts, 7);
        assert_eq!(items[0].max_attempts, 10);

        let excluded = history(
            &connection,
            20,
            Some(("2026-11-12", DailyHistoryMode::Characters)),
        )
        .expect("history without the current characters sheet");
        assert!(excluded.is_empty());
    }

    #[test]
    fn bootstrap_never_returns_the_answer_title_in_an_error() {
        let connection = memory_db();
        ensure_games(&connection, "2026-11-14").expect("ensure");
        let game = load_game(&connection, "2026-11-14", DailyMode::Frames).expect("frames game");
        set_failure(
            &connection,
            "2026-11-14",
            DailyMode::Frames,
            &format!("blocked: {}", game.entry.title),
        )
        .expect("failure");
        let bootstrap = bootstrap(&connection, "2026-11-14").expect("bootstrap");
        let frames = bootstrap
            .modes
            .iter()
            .find(|view| view.mode == DailyMode::Frames)
            .expect("frames view");
        assert_eq!(frames.error.as_deref(), Some("daily source is unavailable"));
    }

    #[test]
    fn reset_clears_daily_state_and_only_unopened_daily_packs() {
        let connection = memory_db();
        ensure_games(&connection, "2026-11-14").expect("ensure");
        let game = load_game(&connection, "2026-11-14", DailyMode::Frames).expect("game");
        finish_guess(
            &connection,
            "2026-11-14",
            DailyMode::Frames,
            true,
            1,
            &[game.entry.media_id],
            &game.entry,
        )
        .expect("daily reward pack");
        insert_pack(
            &connection,
            LOCAL_USER_ID,
            &CardPackRow {
                id: "daily-opened".into(),
                source: "daily".into(),
                pack_kind: "default".into(),
                media_id: Some(1),
                media_kind: None,
                seed: 1,
                size: CARD_PACK_SIZE as i64,
                created_at: 1,
                opened_at: Some(2),
                contents_state: CardPackContentsState::Ready,
                claimed_at: None,
                chosen_slot: None,
            },
        )
        .expect("opened daily pack");
        insert_pack(
            &connection,
            LOCAL_USER_ID,
            &CardPackRow {
                id: "test-kept".into(),
                source: "test".into(),
                pack_kind: "default".into(),
                media_id: None,
                media_kind: None,
                seed: 3,
                size: CARD_PACK_SIZE as i64,
                created_at: 3,
                opened_at: None,
                contents_state: CardPackContentsState::Pending,
                claimed_at: None,
                chosen_slot: None,
            },
        )
        .expect("unrelated pack");

        reset(&connection).expect("reset");

        for table in ["daily_games", "daily_game_frames", "daily_results"] {
            let count: i64 = connection
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                    row.get(0)
                })
                .expect("count daily state");
            assert_eq!(count, 0, "{table} was not cleared");
        }
        let packs: Vec<String> = {
            let mut statement = connection
                .prepare("SELECT id FROM card_packs ORDER BY id")
                .expect("prepare packs");
            let rows = statement
                .query_map([], |row| row.get(0))
                .expect("query packs");
            rows.collect::<Result<_, _>>().expect("collect packs")
        };
        assert_eq!(
            packs,
            vec!["daily-opened".to_string(), "test-kept".to_string()]
        );
    }
}
