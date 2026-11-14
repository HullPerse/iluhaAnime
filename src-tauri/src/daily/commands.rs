use std::time::Duration;

use tauri::AppHandle;

use crate::app_db::db::{lock_app_data_write_timeout, open_database, APP_DATA_WRITE_TIMEOUT};
use crate::scrapers::clients::resolve_proxy;

use super::game;
use super::seed::validate_day;
use super::store;
use super::types::{
    DailyBootstrap, DailyFramesView, DailyGuessView, DailyHistoryItem, DailyMode, DailyOpGuessView,
    DailyOpView,
};

const PREPARE_TIMEOUT: Duration = Duration::from_secs(45);
const OP_PREPARE_TIMEOUT: Duration = Duration::from_secs(240);
const REVEAL_TIMEOUT: Duration = Duration::from_secs(150);

/// Resolves today's two games and returns only their state. The answer and
/// the payload stay in Rust until a result exists.
#[tauri::command]
pub fn daily_game_bootstrap(app: AppHandle, day: String) -> Result<DailyBootstrap, String> {
    validate_day(&day)?;
    let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
    let connection = open_database(&app)?;
    store::ensure_games(&connection, &day)?;
    store::bootstrap(&connection, &day)
}

/// Fetches and crops today's six frames lazily. Repeated calls only read the
/// prepared rows, so a reopened tab is instant.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn daily_game_prepare(
    app: AppHandle,
    day: String,
    mode: String,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<DailyFramesView, String> {
    validate_day(&day)?;
    if DailyMode::parse(&mode)? != DailyMode::Frames {
        return Err("this daily mode is not ready yet".into());
    }
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    match tokio::time::timeout(
        PREPARE_TIMEOUT,
        game::prepare_frames(&app, &day, proxy.as_deref()),
    )
    .await
    {
        Ok(result) => result,
        Err(_) => {
            tracing::warn!(day = day.as_str(), "daily frames preparation timed out");
            Err("preparing daily frames timed out; try again".into())
        }
    }
}

/// After a win, downloads the frames that were still hidden and returns the
/// complete set for the reveal screen. The result itself is already recorded.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn daily_game_reveal_frames(
    app: AppHandle,
    day: String,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<DailyFramesView, String> {
    validate_day(&day)?;
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    match tokio::time::timeout(
        REVEAL_TIMEOUT,
        game::reveal_frames(&app, &day, proxy.as_deref()),
    )
    .await
    {
        Ok(result) => result,
        Err(_) => {
            tracing::warn!(day = day.as_str(), "daily frame reveal timed out");
            Err("revealing the daily frames timed out; try again".into())
        }
    }
}

/// Resolves the OP/ED challenge and downloads the clip into an opaque local
/// cache. A repeated call only reads the prepared row.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn daily_game_prepare_op(
    app: AppHandle,
    day: String,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<DailyOpView, String> {
    validate_day(&day)?;
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    match tokio::time::timeout(
        OP_PREPARE_TIMEOUT,
        game::prepare_op(&app, &day, proxy.as_deref()),
    )
    .await
    {
        Ok(result) => result,
        Err(_) => {
            tracing::warn!(day = day.as_str(), "daily op preparation timed out");
            Err("preparing the daily opening timed out; try again".into())
        }
    }
}

/// Prepares the audio-only opening clip. The same opaque file is hidden by the
/// player and shown in full on the result screen.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn daily_game_prepare_audio(
    app: AppHandle,
    day: String,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<DailyOpView, String> {
    validate_day(&day)?;
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    match tokio::time::timeout(
        OP_PREPARE_TIMEOUT,
        game::prepare_audio(&app, &day, proxy.as_deref()),
    )
    .await
    {
        Ok(result) => result,
        Err(_) => {
            tracing::warn!(day = day.as_str(), "daily audio preparation timed out");
            Err("preparing the daily audio clip timed out; try again".into())
        }
    }
}

/// OP/ED guesses use the same answer check as frames, but the state returns
/// the growing video window instead of the next screenshot.
#[tauri::command]
pub async fn daily_game_guess_op(
    app: AppHandle,
    day: String,
    media_id: i64,
    guessed_titles: Option<Vec<String>>,
) -> Result<DailyOpGuessView, String> {
    validate_day(&day)?;
    let guessed_titles = guessed_titles.unwrap_or_default();
    game::guess_op(&app, &day, media_id, &guessed_titles).await
}

#[tauri::command]
pub async fn daily_game_skip_op(app: AppHandle, day: String) -> Result<DailyOpGuessView, String> {
    validate_day(&day)?;
    game::skip_op(&app, &day).await
}

#[tauri::command]
pub async fn daily_game_guess_audio(
    app: AppHandle,
    day: String,
    media_id: i64,
    guessed_titles: Option<Vec<String>>,
) -> Result<DailyOpGuessView, String> {
    validate_day(&day)?;
    let guessed_titles = guessed_titles.unwrap_or_default();
    game::guess_audio(&app, &day, media_id, &guessed_titles).await
}

#[tauri::command]
pub async fn daily_game_skip_audio(
    app: AppHandle,
    day: String,
) -> Result<DailyOpGuessView, String> {
    validate_day(&day)?;
    game::skip_audio(&app, &day).await
}

/// A guess is only an AniList media id. The answer is compared and returned
/// inside Rust, so the frontend never receives it before the game ends.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn daily_game_guess(
    app: AppHandle,
    day: String,
    mode: String,
    media_id: i64,
    guessed_titles: Option<Vec<String>>,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<DailyGuessView, String> {
    validate_day(&day)?;
    let mode = DailyMode::parse(&mode)?;
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let guessed_titles = guessed_titles.unwrap_or_default();
    game::guess(
        &app,
        &day,
        mode,
        media_id,
        &guessed_titles,
        proxy.as_deref(),
    )
    .await
}

/// Skip reveals the next frame and spends one attempt, without recording a
/// guessed title in the history.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn daily_game_skip(
    app: AppHandle,
    day: String,
    mode: String,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<DailyGuessView, String> {
    validate_day(&day)?;
    let mode = DailyMode::parse(&mode)?;
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    game::skip(&app, &day, mode, proxy.as_deref()).await
}

/// The journal on the result screen. `day` and `mode` identify the result
/// currently on screen and are excluded from its own history. Bounded so a
/// long streak cannot grow the payload without limit.
#[tauri::command]
pub fn daily_game_history(
    app: AppHandle,
    day: Option<String>,
    mode: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<DailyHistoryItem>, String> {
    if let Some(day) = &day {
        validate_day(day)?;
    }
    let mode = match mode.as_deref() {
        Some(mode) => Some(DailyMode::parse(mode)?),
        None => None,
    };
    let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
    let connection = open_database(&app)?;
    store::history(
        &connection,
        limit.unwrap_or(20).clamp(1, 50),
        day.as_deref().zip(mode),
    )
}

/// Test-only helper: clears every daily game and unopened daily reward pack.
#[tauri::command]
pub fn daily_game_reset(app: AppHandle) -> Result<(), String> {
    let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
    let connection = open_database(&app)?;
    store::reset(&connection)
}
