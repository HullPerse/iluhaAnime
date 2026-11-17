use std::sync::Arc;
use std::time::Duration;

use tauri::AppHandle;

use crate::app_db::db::{lock_app_data_write_timeout, open_database, APP_DATA_WRITE_TIMEOUT};
use crate::scrapers::clients::{resolve_proxy, Ipv4FirstResolver};

use super::game;
use super::pool::{self, DailySearchEntry};
use super::seed::validate_day;
use super::store;
use super::types::{
    DailyBootstrap, DailyFramesView, DailyGuessView, DailyHistoryItem, DailyMode, DailyOpGuessView,
    DailyOpView,
};

#[tauri::command]
#[allow(non_snake_case)]
pub async fn daily_test_proxy(
    mode: String,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<String, String> {
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let mut builder = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .connect_timeout(Duration::from_secs(10))
        .dns_resolver(Arc::new(Ipv4FirstResolver))
        .user_agent("iluhaAnime daily proxy test");
    if let Some(proxy) = proxy {
        builder =
            builder.proxy(reqwest::Proxy::all(&proxy).map_err(|e| format!("invalid proxy: {e}"))?);
    }
    let client = builder.build().map_err(|e| e.to_string())?;
    match mode.as_str() {
        "frames" => {
            let api_urls: Vec<String> = super::sources::SHIKIMORI_API_BASES
                .iter()
                .map(|base| format!("{base}/1/screenshots"))
                .collect();
            let api = first_reachable(&client, "Shikimori API", &api_urls).await?;
            let image_urls: Vec<String> = super::sources::SHIKIMORI_IMAGE_HOSTS
                .iter()
                .map(|host| format!("https://{host}/"))
                .collect();
            let images = first_reachable(&client, "Shikimori image host", &image_urls).await?;
            Ok(format!("{api}; {images}"))
        }
        "op" => {
            let api = client
                .post("https://graphql.animethemes.moe/")
                .json(&serde_json::json!({"query":"query { __typename }"}))
                .send()
                .await
                .map_err(|e| format!("AnimeThemes API: {e}"))?
                .status();
            require_reachable("AnimeThemes API", api)?;
            let cdn = probe_status(&client, "https://v.animethemes.moe/").await?;
            require_reachable("AnimeThemes CDN", cdn)?;
            Ok(format!("AnimeThemes API HTTP {api}; CDN HTTP {cdn}"))
        }
        _ => Err("unknown daily proxy mode".into()),
    }
}

async fn probe_status(client: &reqwest::Client, url: &str) -> Result<reqwest::StatusCode, String> {
    client
        .get(url)
        .send()
        .await
        .map(|response| response.status())
        .map_err(|error| format!("{url}: {error}"))
}

fn require_reachable(host: &str, status: reqwest::StatusCode) -> Result<(), String> {
    if blocked_status(status) {
        return Err(format!("{host} blocked with HTTP {status}"));
    }
    Ok(())
}

fn blocked_status(status: reqwest::StatusCode) -> bool {
    status.is_server_error()
        || status == reqwest::StatusCode::FORBIDDEN
        || status == reqwest::StatusCode::TOO_MANY_REQUESTS
}

/// The daily prepare walks the same mirror list. The proxy test must do the
/// same, otherwise a working `.tv` mirror looks like a broken proxy.
async fn first_reachable(
    client: &reqwest::Client,
    label: &str,
    urls: &[String],
) -> Result<String, String> {
    let mut last_error = format!("{label} did not answer");
    for url in urls {
        match probe_status(client, url).await {
            Ok(status) if !blocked_status(status) => {
                return Ok(format!("{label} HTTP {status}"));
            }
            Ok(status) => last_error = format!("{label} blocked with HTTP {status}"),
            Err(error) => last_error = error,
        }
    }
    Err(last_error)
}

const PREPARE_TIMEOUT: Duration = Duration::from_secs(75);

fn mark_prepare_failure(app: &AppHandle, day: &str, mode: DailyMode) {
    let Ok(_write) = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT) else {
        return;
    };
    let Ok(connection) = open_database(app) else {
        return;
    };
    let _ = store::set_failure(&connection, day, mode, "daily source is unavailable");
}
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

/// A tiny, tier-free title index used by the local guess autocomplete.
#[tauri::command]
pub fn daily_game_search_index() -> Result<Vec<DailySearchEntry>, String> {
    pool::search_index()
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
            mark_prepare_failure(&app, &day, DailyMode::Frames);
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
            mark_prepare_failure(&app, &day, DailyMode::Op);
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
            mark_prepare_failure(&app, &day, DailyMode::Audio);
            Err("preparing the daily audio clip timed out; try again".into())
        }
    }
}

/// OP/ED guesses use the same answer check as frames, but the state returns
/// the growing video window instead of the next screenshot.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn daily_game_guess_op(
    app: AppHandle,
    day: String,
    media_id: i64,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<DailyOpGuessView, String> {
    validate_day(&day)?;
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    game::guess_op(&app, &day, media_id, proxy.as_deref()).await
}

#[tauri::command]
pub async fn daily_game_skip_op(app: AppHandle, day: String) -> Result<DailyOpGuessView, String> {
    validate_day(&day)?;
    game::skip_op(&app, &day).await
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn daily_game_guess_audio(
    app: AppHandle,
    day: String,
    media_id: i64,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<DailyOpGuessView, String> {
    validate_day(&day)?;
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    game::guess_audio(&app, &day, media_id, proxy.as_deref()).await
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
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<DailyGuessView, String> {
    validate_day(&day)?;
    let mode = DailyMode::parse(&mode)?;
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    game::guess(&app, &day, mode, media_id, proxy.as_deref()).await
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
