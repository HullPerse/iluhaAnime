use std::time::Duration;

use tauri::AppHandle;

use crate::app_db::db::{lock_app_data_write_timeout, open_database, APP_DATA_WRITE_TIMEOUT};
use crate::cards::packs::spawn_prepare_packs_with_proxy;

use super::pool;
use super::prepare;
use super::sources;
use super::store;
use super::themes;
use super::types::{
    DailyFrameView, DailyFramesView, DailyGameState, DailyGuessView, DailyMode, DailyOpGuessView,
    DailyOpView,
};

const FRAME_COUNT: u32 = 6;
const REROLL_LIMIT: usize = 8;
const CANDIDATE_TIMEOUT: Duration = Duration::from_secs(45);
const NEXT_FRAME_TIMEOUT: Duration = Duration::from_secs(25);
const OP_CANDIDATE_TIMEOUT: Duration = Duration::from_secs(150);
const REVEAL_FRAME_TIMEOUT: Duration = Duration::from_secs(20);

/// A prefetch and the user's click can race; the second caller waits, then
/// finds the prepared row and returns it without downloading again. The clip
/// modes lock separately: the card screen warms the OP on mount, and "audio
/// only" must not queue behind that whole download.
static OP_PREPARE_LOCK: std::sync::LazyLock<tokio::sync::Mutex<()>> =
    std::sync::LazyLock::new(|| tokio::sync::Mutex::new(()));
static AUDIO_PREPARE_LOCK: std::sync::LazyLock<tokio::sync::Mutex<()>> =
    std::sync::LazyLock::new(|| tokio::sync::Mutex::new(()));

/// The result screen asks once for every frame; a duplicate request waits for
/// the first one instead of downloading the same screenshots again.
static FRAME_REVEAL_LOCK: std::sync::LazyLock<tokio::sync::Mutex<()>> =
    std::sync::LazyLock::new(|| tokio::sync::Mutex::new(()));

pub async fn prepare_frames(
    app: &AppHandle,
    day: &str,
    proxy: Option<&str>,
) -> Result<DailyFramesView, String> {
    let (stored, existing, result) = {
        let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
        let connection = open_database(app)?;
        store::ensure_games(&connection, day)?;
        let stored = store::load_game(&connection, day, DailyMode::Frames)?;
        let frames = store::load_frames(&connection, day, DailyMode::Frames, FRAME_COUNT)?;
        let result = store::result_view(&connection, day, DailyMode::Frames, &stored.entry)?;
        (stored, frames, result)
    };
    if result.is_some() || (stored.state == DailyGameState::Ready && !existing.is_empty()) {
        return frames_view(app, day, stored.attempts, &stored.entry);
    }

    let op_media = {
        let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
        let connection = open_database(app)?;
        store::load_game(&connection, day, DailyMode::Op)
            .ok()
            .map(|game| game.entry.media_id)
    };
    let mut candidates = vec![stored.entry.clone()];
    if let Ok(rest) = pool::candidates(day, DailyMode::Frames, op_media) {
        for entry in rest {
            if entry.media_id != stored.entry.media_id {
                candidates.push(entry.clone());
            }
        }
    }
    candidates.truncate(REROLL_LIMIT);

    let mut last_error = String::new();
    for candidate in candidates {
        let frame_seed = stored.seed ^ (candidate.media_id as u64).rotate_left(17);
        tracing::info!(media_id = candidate.media_id, "preparing daily frames");
        let prepared = tokio::time::timeout(CANDIDATE_TIMEOUT, async {
            let plan = prepare::build_plan(&candidate, frame_seed, proxy).await?;
            let (frame, source_index) = prepare::first_frame(&plan, frame_seed, proxy).await?;
            Ok::<_, String>((plan, frame, source_index))
        })
        .await;
        match prepared {
            Ok(Ok((plan, frame, source_index))) => {
                let attempts = {
                    let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
                    let connection = open_database(app)?;
                    store::save_prepared_frame(
                        &connection,
                        day,
                        DailyMode::Frames,
                        &candidate,
                        &plan.urls,
                        &plan.hints,
                        &frame,
                        source_index,
                    )?;
                    0
                };
                return frames_view(app, day, attempts, &candidate);
            }
            Ok(Err(error)) => {
                last_error = error;
                tracing::warn!(
                    media_id = candidate.media_id,
                    error = last_error.as_str(),
                    "daily frames candidate failed"
                );
            }
            Err(_) => {
                last_error = "preparing frames timed out".to_string();
                tracing::warn!(
                    media_id = candidate.media_id,
                    "daily frames candidate timed out"
                );
            }
        }
    }

    let message = if last_error.is_empty() {
        "no daily frame candidate was usable".to_string()
    } else {
        format!("could not prepare daily frames: {last_error}")
    };
    {
        let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
        let connection = open_database(app)?;
        store::set_failure(&connection, day, DailyMode::Frames, &message)?;
    }
    Err(message)
}

fn frames_view(
    app: &AppHandle,
    day: &str,
    attempts: u32,
    entry: &pool::PoolEntry,
) -> Result<DailyFramesView, String> {
    let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
    let connection = open_database(app)?;
    store::frames_view(
        &connection,
        day,
        DailyMode::Frames,
        entry,
        attempts,
        DailyMode::Frames.max_attempts(),
    )
}

/// Fills the frames that a win skipped over, so the reveal screen can show
/// the complete set. The recorded result and attempts are not changed.
pub async fn reveal_frames(
    app: &AppHandle,
    day: &str,
    proxy: Option<&str>,
) -> Result<DailyFramesView, String> {
    let _guard = FRAME_REVEAL_LOCK.lock().await;
    let max_attempts = DailyMode::Frames.max_attempts();
    let (game, result, existing, mut used, hints) = {
        let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
        let connection = open_database(app)?;
        let game = store::load_game(&connection, day, DailyMode::Frames)?;
        let result = store::result_view(&connection, day, DailyMode::Frames, &game.entry)?;
        let mut existing = Vec::new();
        let mut hints = Vec::new();
        for slot in 0..max_attempts {
            if let Some(frame) = store::load_frame(&connection, day, DailyMode::Frames, slot)? {
                existing.push(frame);
            }
            hints.push(store::load_frame_hint(
                &connection,
                day,
                DailyMode::Frames,
                slot,
            )?);
        }
        let used = store::load_source_indexes(&connection, day, DailyMode::Frames)?;
        (game, result, existing, used, hints)
    };
    let Some(result) = result else {
        return Err("daily frames are still in progress".into());
    };
    let mut frames = Vec::with_capacity(max_attempts as usize);
    for slot in 0..max_attempts {
        let hint = &hints[slot as usize];
        let current = existing
            .iter()
            .find(|(frame, _)| frame.slot == slot)
            .and_then(|(_, index)| game.sources.get(*index).map(|url| (*index, url.clone())));
        let downloaded = tokio::time::timeout(REVEAL_FRAME_TIMEOUT, async {
            match current {
                Some((index, url)) => sources::download_full_frame(&url, proxy)
                    .await
                    .map(|data_url| (data_url, index)),
                None => {
                    prepare::download_full_slot(&game.sources, game.seed, slot, &used, proxy).await
                }
            }
        })
        .await;
        match downloaded {
            Ok(Ok((data_url, source_index))) => {
                let frame = DailyFrameView {
                    slot,
                    data_url,
                    hint_kind: hint.0.clone(),
                    hint_value: hint.1.clone(),
                };
                let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
                let connection = open_database(app)?;
                store::save_revealed_frame(
                    &connection,
                    day,
                    DailyMode::Frames,
                    &frame,
                    source_index,
                )?;
                used.insert(source_index);
                frames.push(frame);
            }
            Ok(Err(error)) => tracing::warn!(
                slot,
                error = error.as_str(),
                "daily full reveal frame failed"
            ),
            Err(_) => tracing::warn!(slot, "daily full reveal frame timed out"),
        }
    }
    frames.sort_by_key(|frame| frame.slot);
    Ok(DailyFramesView {
        day: day.to_owned(),
        mode: DailyMode::Frames,
        attempts: result.attempts,
        max_attempts,
        revealed: max_attempts,
        frames,
        result: Some(result),
    })
}

/// Resolves the OP/ED challenge. The video is downloaded once into an opaque
/// cache file; a reopened tab only reads the prepared row.
pub async fn prepare_op(
    app: &AppHandle,
    day: &str,
    proxy: Option<&str>,
) -> Result<DailyOpView, String> {
    prepare_clip_game(app, day, DailyMode::Op, proxy).await
}

/// The audio-only challenge uses one opening clip and plays a random 15-second
/// slice. The video is hidden in the UI, but the result screen can replay it.
pub async fn prepare_audio(
    app: &AppHandle,
    day: &str,
    proxy: Option<&str>,
) -> Result<DailyOpView, String> {
    prepare_clip_game(app, day, DailyMode::Audio, proxy).await
}

async fn prepare_clip_game(
    app: &AppHandle,
    day: &str,
    mode: DailyMode,
    proxy: Option<&str>,
) -> Result<DailyOpView, String> {
    let prepare_lock = match mode {
        DailyMode::Audio => &AUDIO_PREPARE_LOCK,
        _ => &OP_PREPARE_LOCK,
    };
    let _prepare_guard = prepare_lock.lock().await;
    let (stored, result) = {
        let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
        let connection = open_database(app)?;
        store::ensure_games(&connection, day)?;
        let stored = store::load_game(&connection, day, mode)?;
        let result = store::result_view(&connection, day, mode, &stored.entry)?;
        (stored, result)
    };
    if result.is_some()
        || (stored.state == DailyGameState::Ready
            && !stored.clip_path.is_empty()
            && std::path::Path::new(&stored.clip_path).is_file())
    {
        let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
        let connection = open_database(app)?;
        return store::op_view(
            &connection,
            day,
            mode,
            &stored,
            stored.attempts,
            mode.max_attempts(),
        );
    }

    let excluded = {
        let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
        let connection = open_database(app)?;
        let mut excluded = Vec::new();
        if let Ok(frames) = store::load_game(&connection, day, DailyMode::Frames) {
            excluded.push(frames.entry.media_id);
        }
        if mode == DailyMode::Audio {
            if let Ok(op) = store::load_game(&connection, day, DailyMode::Op) {
                excluded.push(op.entry.media_id);
            }
        }
        excluded
    };
    let mut candidates = vec![stored.entry.clone()];
    if let Ok(rest) = pool::candidates(day, mode, None) {
        for entry in rest {
            if entry.media_id != stored.entry.media_id && !excluded.contains(&entry.media_id) {
                candidates.push(entry.clone());
            }
        }
    }
    candidates.truncate(REROLL_LIMIT);

    let mut last_error = String::new();
    for candidate in candidates {
        let clip_seed = stored.seed ^ (candidate.media_id as u64).rotate_left(19);
        tracing::info!(
            media_id = candidate.media_id,
            mode = mode.as_str(),
            "preparing daily clip"
        );
        let prepared = tokio::time::timeout(
            OP_CANDIDATE_TIMEOUT,
            themes::prepare_clip(app, day, &candidate, clip_seed, proxy, mode),
        )
        .await;
        match prepared {
            Ok(Ok(clip)) => {
                let hints: Vec<(String, String)> = prepare::hints(&candidate, clip_seed)
                    .into_iter()
                    .take(mode.max_attempts() as usize)
                    .collect();
                {
                    let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
                    let connection = open_database(app)?;
                    store::save_prepared_op(
                        &connection,
                        day,
                        mode,
                        &candidate,
                        &clip.theme_type,
                        &clip.theme_title,
                        &clip.path,
                        clip.start_fraction,
                        &hints,
                    )?;
                }
                let (stored, attempts) = {
                    let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
                    let connection = open_database(app)?;
                    let stored = store::load_game(&connection, day, mode)?;
                    let attempts = stored.attempts;
                    (stored, attempts)
                };
                let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
                let connection = open_database(app)?;
                return store::op_view(
                    &connection,
                    day,
                    mode,
                    &stored,
                    attempts,
                    mode.max_attempts(),
                );
            }
            Ok(Err(error)) => {
                last_error = error;
                tracing::warn!(
                    media_id = candidate.media_id,
                    mode = mode.as_str(),
                    error = last_error.as_str(),
                    "daily clip candidate failed"
                );
            }
            Err(_) => {
                last_error = "preparing clip timed out".to_string();
                tracing::warn!(
                    media_id = candidate.media_id,
                    mode = mode.as_str(),
                    "daily clip candidate timed out"
                );
            }
        }
    }

    let message = if last_error.is_empty() {
        format!("no daily {} candidate was usable", mode.as_str())
    } else {
        format!("could not prepare daily {}: {last_error}", mode.as_str())
    };
    {
        let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
        let connection = open_database(app)?;
        store::set_failure(&connection, day, mode, &message)?;
    }
    Err(message)
}

pub async fn guess(
    app: &AppHandle,
    day: &str,
    mode: DailyMode,
    media_id: i64,
    proxy: Option<&str>,
) -> Result<DailyGuessView, String> {
    if mode != DailyMode::Frames {
        return Err("this daily mode is not ready yet".into());
    }
    if media_id <= 0 {
        return Err("invalid guess media id".into());
    }
    let (game, existing_result) = {
        let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
        let connection = open_database(app)?;
        let game = store::load_game(&connection, day, mode)?;
        let result = store::result_view(&connection, day, mode, &game.entry)?;
        (game, result)
    };
    if let Some(result) = existing_result {
        return Ok(DailyGuessView {
            correct: media_id == game.entry.media_id,
            same_franchise: false,
            attempts: result.attempts,
            max_attempts: mode.max_attempts(),
            revealed: result.attempts.clamp(1, mode.max_attempts()),
            finished: true,
            frame: None,
            result: Some(result),
        });
    }
    if game.state != DailyGameState::Ready {
        return Err("daily game is not prepared".into());
    }

    let attempts = game.attempts + 1;
    let max_attempts = mode.max_attempts();
    let correct = media_id == game.entry.media_id;
    let same_franchise =
        !correct && guessed_same_franchise(app, game.entry.media_id, media_id, proxy).await;
    let finished = correct || attempts >= max_attempts;
    let mut guesses = game.guesses.clone();
    guesses.push(media_id);

    if finished {
        let result = {
            let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
            let connection = open_database(app)?;
            store::finish_guess(
                &connection,
                day,
                mode,
                correct,
                attempts,
                &guesses,
                &game.entry,
            )?;
            store::result_view(&connection, day, mode, &game.entry)?
                .ok_or_else(|| "daily result missing after finish".to_string())?
        };
        let result_won = result.won;
        let result_attempts = result.attempts;
        if result_won {
            spawn_prepare_packs_with_proxy(app.clone(), proxy.map(str::to_owned));
        }
        return Ok(DailyGuessView {
            correct: result_won,
            same_franchise,
            attempts: result_attempts,
            max_attempts,
            revealed: result_attempts.clamp(1, max_attempts),
            finished: true,
            frame: None,
            result: Some(result),
        });
    }

    let slot = attempts;
    let (frame, source_index) = tokio::time::timeout(
        NEXT_FRAME_TIMEOUT,
        ensure_next_frame(app, day, mode, game.seed, slot, proxy),
    )
    .await
    .map_err(|_| "preparing the next daily frame timed out".to_string())??;
    let revealed = (attempts + 1).min(max_attempts);
    {
        let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
        let connection = open_database(app)?;
        store::save_progress_with_frame(
            &connection,
            day,
            mode,
            attempts,
            &guesses,
            &frame,
            source_index,
        )?;
    }

    Ok(DailyGuessView {
        correct,
        same_franchise,
        attempts,
        max_attempts,
        revealed,
        finished: false,
        frame: Some(frame),
        result: None,
    })
}

pub async fn skip(
    app: &AppHandle,
    day: &str,
    mode: DailyMode,
    proxy: Option<&str>,
) -> Result<DailyGuessView, String> {
    if mode != DailyMode::Frames {
        return Err("this daily mode is not ready yet".into());
    }
    let (game, existing_result) = {
        let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
        let connection = open_database(app)?;
        let game = store::load_game(&connection, day, mode)?;
        let result = store::result_view(&connection, day, mode, &game.entry)?;
        (game, result)
    };
    if let Some(result) = existing_result {
        return Ok(DailyGuessView {
            correct: false,
            same_franchise: false,
            attempts: result.attempts,
            max_attempts: mode.max_attempts(),
            revealed: result.attempts.clamp(1, mode.max_attempts()),
            finished: true,
            frame: None,
            result: Some(result),
        });
    }
    if game.state != DailyGameState::Ready {
        return Err("daily game is not prepared".into());
    }

    let attempts = game.attempts + 1;
    let max_attempts = mode.max_attempts();
    if attempts >= max_attempts {
        let result = {
            let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
            let connection = open_database(app)?;
            store::finish_guess(
                &connection,
                day,
                mode,
                false,
                attempts,
                &game.guesses,
                &game.entry,
            )?;
            store::result_view(&connection, day, mode, &game.entry)?
                .ok_or_else(|| "daily result missing after finish".to_string())?
        };
        let result_attempts = result.attempts;
        return Ok(DailyGuessView {
            correct: false,
            same_franchise: false,
            attempts: result_attempts,
            max_attempts,
            revealed: result_attempts.clamp(1, max_attempts),
            finished: true,
            frame: None,
            result: Some(result),
        });
    }

    let slot = attempts;
    let (frame, source_index) = tokio::time::timeout(
        NEXT_FRAME_TIMEOUT,
        ensure_next_frame(app, day, mode, game.seed, slot, proxy),
    )
    .await
    .map_err(|_| "preparing the next daily frame timed out".to_string())??;
    let revealed = (attempts + 1).min(max_attempts);
    {
        let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
        let connection = open_database(app)?;
        store::save_progress_with_frame(
            &connection,
            day,
            mode,
            attempts,
            &game.guesses,
            &frame,
            source_index,
        )?;
    }
    Ok(DailyGuessView {
        correct: false,
        same_franchise: false,
        attempts,
        max_attempts,
        revealed,
        finished: false,
        frame: Some(frame),
        result: None,
    })
}

pub async fn guess_op(
    app: &AppHandle,
    day: &str,
    media_id: i64,
    proxy: Option<&str>,
) -> Result<DailyOpGuessView, String> {
    guess_clip_game(app, day, DailyMode::Op, media_id, proxy).await
}

pub async fn guess_audio(
    app: &AppHandle,
    day: &str,
    media_id: i64,
    proxy: Option<&str>,
) -> Result<DailyOpGuessView, String> {
    guess_clip_game(app, day, DailyMode::Audio, media_id, proxy).await
}

async fn guess_clip_game(
    app: &AppHandle,
    day: &str,
    mode: DailyMode,
    media_id: i64,
    proxy: Option<&str>,
) -> Result<DailyOpGuessView, String> {
    if media_id <= 0 {
        return Err("invalid guess media id".into());
    }
    let (game, existing_result) = {
        let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
        let connection = open_database(app)?;
        let game = store::load_game(&connection, day, mode)?;
        let result = store::result_view(&connection, day, mode, &game.entry)?;
        (game, result)
    };
    if let Some(result) = existing_result {
        let view = {
            let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
            let connection = open_database(app)?;
            store::op_view(
                &connection,
                day,
                mode,
                &game,
                result.attempts,
                mode.max_attempts(),
            )?
        };
        return Ok(DailyOpGuessView {
            correct: media_id == game.entry.media_id,
            same_franchise: false,
            finished: true,
            state: view,
        });
    }
    if game.state != DailyGameState::Ready {
        return Err(format!("daily {} game is not prepared", mode.as_str()));
    }

    let attempts = game.attempts + 1;
    let max_attempts = mode.max_attempts();
    let correct = media_id == game.entry.media_id;
    let same_franchise =
        !correct && guessed_same_franchise(app, game.entry.media_id, media_id, proxy).await;
    let finished = correct || attempts >= max_attempts;
    let mut guesses = game.guesses.clone();
    guesses.push(media_id);

    if finished {
        let pack_id = {
            let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
            let connection = open_database(app)?;
            store::finish_guess(
                &connection,
                day,
                mode,
                correct,
                attempts,
                &guesses,
                &game.entry,
            )?
        };
        if pack_id.is_some() {
            spawn_prepare_packs_with_proxy(app.clone(), proxy.map(str::to_owned));
        }
    } else {
        let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
        let connection = open_database(app)?;
        store::save_op_progress(&connection, day, mode, attempts, &guesses)?;
    }

    let view = {
        let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
        let connection = open_database(app)?;
        let stored = store::load_game(&connection, day, mode)?;
        store::op_view(&connection, day, mode, &stored, attempts, max_attempts)?
    };
    let stored_correct = view.result.as_ref().map_or(correct, |result| result.won);
    Ok(DailyOpGuessView {
        correct: stored_correct,
        same_franchise,
        finished: view.result.is_some(),
        state: view,
    })
}

pub async fn skip_op(app: &AppHandle, day: &str) -> Result<DailyOpGuessView, String> {
    skip_clip_game(app, day, DailyMode::Op).await
}

pub async fn skip_audio(app: &AppHandle, day: &str) -> Result<DailyOpGuessView, String> {
    skip_clip_game(app, day, DailyMode::Audio).await
}

async fn skip_clip_game(
    app: &AppHandle,
    day: &str,
    mode: DailyMode,
) -> Result<DailyOpGuessView, String> {
    let (game, existing_result) = {
        let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
        let connection = open_database(app)?;
        let game = store::load_game(&connection, day, mode)?;
        let result = store::result_view(&connection, day, mode, &game.entry)?;
        (game, result)
    };
    if let Some(result) = existing_result {
        let view = {
            let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
            let connection = open_database(app)?;
            store::op_view(
                &connection,
                day,
                mode,
                &game,
                result.attempts,
                mode.max_attempts(),
            )?
        };
        return Ok(DailyOpGuessView {
            correct: false,
            same_franchise: false,
            finished: true,
            state: view,
        });
    }
    if game.state != DailyGameState::Ready {
        return Err(format!("daily {} game is not prepared", mode.as_str()));
    }

    let attempts = game.attempts + 1;
    let max_attempts = mode.max_attempts();
    if attempts >= max_attempts {
        let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
        let connection = open_database(app)?;
        store::finish_guess(
            &connection,
            day,
            mode,
            false,
            attempts,
            &game.guesses,
            &game.entry,
        )?;
    } else {
        let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
        let connection = open_database(app)?;
        store::save_op_progress(&connection, day, mode, attempts, &game.guesses)?;
    }

    let view = {
        let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
        let connection = open_database(app)?;
        let stored = store::load_game(&connection, day, mode)?;
        store::op_view(&connection, day, mode, &stored, attempts, max_attempts)?
    };
    Ok(DailyOpGuessView {
        correct: false,
        same_franchise: false,
        finished: view.result.is_some(),
        state: view,
    })
}

async fn guessed_same_franchise(
    app: &AppHandle,
    answer_id: i64,
    guessed_id: i64,
    proxy: Option<&str>,
) -> bool {
    let (Ok(answer_id), Ok(guessed_id)) = (u64::try_from(answer_id), u64::try_from(guessed_id))
    else {
        return false;
    };
    match crate::anilist::franchise::are_same_franchise(app, answer_id, guessed_id, proxy).await {
        Ok(same) => same,
        Err(error) => {
            tracing::warn!(error = error.as_str(), "daily franchise check failed");
            false
        }
    }
}

async fn ensure_next_frame(
    app: &AppHandle,
    day: &str,
    mode: DailyMode,
    seed: u64,
    slot: u32,
    proxy: Option<&str>,
) -> Result<(DailyFrameView, usize), String> {
    let (sources, hint, used) = {
        let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
        let connection = open_database(app)?;
        if let Some(existing) = store::load_frame(&connection, day, mode, slot)? {
            return Ok(existing);
        }
        let game = store::load_game(&connection, day, mode)?;
        let hint = store::load_frame_hint(&connection, day, mode, slot)?;
        let used = store::load_source_indexes(&connection, day, mode)?;
        (game.sources, hint, used)
    };
    if sources.is_empty() {
        return Err("daily frame sources are missing; restart the game".into());
    }
    let (data_url, source_index) =
        prepare::download_slot(&sources, seed, slot, &used, proxy).await?;
    let (hint_kind, hint_value) = hint;
    Ok((
        DailyFrameView {
            slot,
            data_url,
            hint_kind,
            hint_value,
        },
        source_index,
    ))
}
