tokio::task_local! {
    pub(crate) static PACK_REQUEST_COUNTS: std::cell::Cell<(u64, u64)>;
}

use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

use crate::scrapers::clients::resolve_proxy;
static CLIENT: LazyLock<Result<reqwest::Client, String>> = LazyLock::new(|| {
    reqwest::Client::builder()
        .user_agent("iluhaAnime/1.0")
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| format!("failed to build reqwest client: {error}"))
});
static PROXY_CLIENT: Mutex<Option<(String, reqwest::Client)>> = Mutex::new(None);

const RATE_LIMIT_PER_MIN: usize = 25;
const RATE_LIMIT_ADAPTIVE_CEILING: usize = 30;
const RATE_LIMIT_BACKOFF_PER_MIN: usize = 10;
const RATE_LIMIT_RESET_CAP_SECS: u64 = 60;
const FOREGROUND_RESERVE_DEFAULT: usize = 10;
const FOREGROUND_TIMEOUT_SECS: u64 = 20;
const BACKGROUND_TIMEOUT_SECS: u64 = 30;
const FOREGROUND_ATTEMPTS: u32 = 1;
const BACKGROUND_ATTEMPTS: u32 = 3;
const BACKGROUND_YIELD_MS: u64 = 50;

/// Foreground requests are user actions; background requests are card packs,
/// roster pages and other work the user did not explicitly wait for. The
/// limiter reserves part of the per-minute window for foreground requests so a
/// pack batch cannot consume the whole minute before the user acts.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RequestPriority {
    Foreground,
    Background,
    Diagnostic,
}
fn env_limit(name: &str, default: usize) -> usize {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse::<usize>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default)
}

pub const MAX_CONCURRENT_REQUESTS: usize = 3;
static ANILIST_CONCURRENCY: LazyLock<tokio::sync::Semaphore> = LazyLock::new(|| {
    tokio::sync::Semaphore::new(env_limit(
        "ILUHA_ANILIST_CONCURRENCY",
        MAX_CONCURRENT_REQUESTS,
    ))
});
static RATE_LOG: LazyLock<Mutex<VecDeque<Instant>>> = LazyLock::new(|| Mutex::new(VecDeque::new()));
static BACKGROUND_RATE_LOG: LazyLock<Mutex<VecDeque<Instant>>> =
    LazyLock::new(|| Mutex::new(VecDeque::new()));
static RATE_LIMIT_ADAPTIVE: AtomicUsize = AtomicUsize::new(RATE_LIMIT_PER_MIN);
static COOLDOWN_UNTIL: Mutex<Option<Instant>> = Mutex::new(None);
/// A 429 backoff must survive the next successful response, otherwise the
/// adaptive limit immediately jumps back to the server ceiling.
static BACKOFF_UNTIL: Mutex<Option<Instant>> = Mutex::new(None);
static FOREGROUND_INFLIGHT: AtomicUsize = AtomicUsize::new(0);
static REQUEST_TOTAL: AtomicU64 = AtomicU64::new(0);
static REQUEST_ATTEMPTS: AtomicU64 = AtomicU64::new(0);
static REQUEST_429: AtomicU64 = AtomicU64::new(0);
static SLOT_WAIT_MICROS: AtomicU64 = AtomicU64::new(0);
static CONFIGURED_RATE_LIMIT: LazyLock<usize> =
    LazyLock::new(|| env_limit("ILUHA_ANILIST_RATE_LIMIT", RATE_LIMIT_PER_MIN));
static FOREGROUND_RESERVE: LazyLock<usize> = LazyLock::new(|| {
    env_limit(
        "ILUHA_ANILIST_FOREGROUND_RESERVE",
        FOREGROUND_RESERVE_DEFAULT,
    )
});
static BACKGROUND_BUDGET: LazyLock<usize> = LazyLock::new(|| {
    env_limit(
        "ILUHA_ANILIST_BACKGROUND_BUDGET",
        CONFIGURED_RATE_LIMIT
            .min(RATE_LIMIT_ADAPTIVE_CEILING)
            .saturating_sub(*FOREGROUND_RESERVE),
    )
});

fn configured_rate_limit() -> usize {
    (*CONFIGURED_RATE_LIMIT)
        .min(RATE_LIMIT_ADAPTIVE_CEILING)
        .max(1)
}

fn background_budget() -> usize {
    (*BACKGROUND_BUDGET)
        .min(rate_limit_per_min().saturating_sub(*FOREGROUND_RESERVE))
        .max(1)
}

fn backoff_active() -> bool {
    let mut backoff = BACKOFF_UNTIL
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    match *backoff {
        Some(deadline) if deadline > Instant::now() => true,
        Some(_) => {
            *backoff = None;
            false
        }
        None => false,
    }
}

/// Records a 429 and keeps the lowered limit until the reset deadline. The
/// previous implementation only lowered the atomic and the next successful
/// response raised it back to 30.
fn note_rate_limited(delay_secs: u64) {
    RATE_LIMIT_ADAPTIVE.fetch_min(RATE_LIMIT_BACKOFF_PER_MIN, Ordering::Relaxed);
    let deadline = Instant::now() + Duration::from_secs(delay_secs.max(1));
    let mut backoff = BACKOFF_UNTIL
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *backoff = Some(backoff.map_or(deadline, |current| current.max(deadline)));
}

fn update_rate_limit(header: Option<&str>) {
    if backoff_active() {
        return;
    }
    let Some(limit) = header.and_then(|v| v.parse::<usize>().ok()) else {
        return;
    };
    if (10..=90).contains(&limit) {
        RATE_LIMIT_ADAPTIVE.store(limit.min(configured_rate_limit()), Ordering::Relaxed);
    }
}

fn parse_retry_after_secs(header: Option<&str>) -> Option<u64> {
    header?.trim().parse::<u64>().ok()
}

fn reset_delay_secs(header: Option<&str>, now_unix_secs: u64) -> Option<u64> {
    let reset = header?.trim().parse::<u64>().ok()?;
    Some(reset.saturating_sub(now_unix_secs))
}

fn rate_limit_delay_secs(
    retry_after: Option<&str>,
    reset: Option<&str>,
    now_unix_secs: u64,
    fallback_secs: u64,
) -> u64 {
    let retry = parse_retry_after_secs(retry_after);
    let reset_delay = reset_delay_secs(reset, now_unix_secs);
    retry
        .or(reset_delay)
        .map_or(fallback_secs, |base| match (retry, reset_delay) {
            (Some(a), Some(b)) => a.max(b),
            _ => base,
        })
        .max(1)
        .min(RATE_LIMIT_RESET_CAP_SECS)
}

fn graphql_error_message(errors: &serde_json::Value) -> String {
    let first = errors.as_array().and_then(|items| items.first());
    let message = first
        .and_then(|error| error.get("message").and_then(serde_json::Value::as_str))
        .unwrap_or("unknown GraphQL error");
    let base = match first.and_then(|error| error.get("status").and_then(serde_json::Value::as_i64))
    {
        Some(status) => format!("AniList GraphQL error {status}: {message}"),
        None => format!("AniList GraphQL error: {message}"),
    };
    let details = first
        .and_then(|error| error.get("validation"))
        .and_then(serde_json::Value::as_object)
        .map(|fields| {
            fields
                .iter()
                .filter_map(|(field, messages)| {
                    let text = messages
                        .as_array()?
                        .iter()
                        .filter_map(serde_json::Value::as_str)
                        .collect::<Vec<_>>()
                        .join("; ");
                    if text.is_empty() {
                        None
                    } else {
                        Some(format!("{field}: {text}"))
                    }
                })
                .collect::<Vec<_>>()
                .join("; ")
        })
        .filter(|details| !details.is_empty());
    match details {
        Some(details) => format!("{base} ({details})"),
        None => base,
    }
}

fn should_retry_http(status: reqwest::StatusCode) -> bool {
    status.is_server_error()
}

fn now_unix_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs())
}

fn rate_limit_per_min() -> usize {
    RATE_LIMIT_ADAPTIVE
        .load(Ordering::Relaxed)
        .min(configured_rate_limit())
        .max(1)
}

struct ForegroundGuard;

impl ForegroundGuard {
    fn acquire(priority: RequestPriority) -> Option<Self> {
        (priority == RequestPriority::Foreground).then(|| {
            FOREGROUND_INFLIGHT.fetch_add(1, Ordering::AcqRel);
            Self
        })
    }
}

impl Drop for ForegroundGuard {
    fn drop(&mut self) {
        FOREGROUND_INFLIGHT.fetch_sub(1, Ordering::AcqRel);
    }
}

async fn acquire_request_slot(
    priority: RequestPriority,
) -> Result<tokio::sync::SemaphorePermit<'static>, String> {
    loop {
        // Background work yields as soon as the user has a foreground request
        // waiting, even before that request has acquired its permit.
        if priority == RequestPriority::Background
            && FOREGROUND_INFLIGHT.load(Ordering::Acquire) > 0
        {
            tokio::time::sleep(Duration::from_millis(BACKGROUND_YIELD_MS)).await;
            continue;
        }
        let permit = ANILIST_CONCURRENCY
            .acquire()
            .await
            .map_err(|_| "AniList request queue is closed".to_string())?;
        let now = Instant::now();
        let cooldown = COOLDOWN_UNTIL
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .and_then(|deadline| deadline.checked_duration_since(now));
        if let Some(delay) = cooldown {
            drop(permit);
            tokio::time::sleep(delay).await;
            continue;
        }
        let delay = {
            let mut log = RATE_LOG.lock().unwrap_or_else(|poisoned| {
                tracing::warn!("AniList rate-limit log mutex was poisoned; recovering");
                poisoned.into_inner()
            });
            let mut background = BACKGROUND_RATE_LOG
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            while let Some(&t) = log.front() {
                if now.duration_since(t) >= Duration::from_secs(60) {
                    log.pop_front();
                } else {
                    break;
                }
            }
            while let Some(&t) = background.front() {
                if now.duration_since(t) >= Duration::from_secs(60) {
                    background.pop_front();
                } else {
                    break;
                }
            }
            let window_ok = log.len() < rate_limit_per_min();
            let background_ok =
                priority != RequestPriority::Background || background.len() < background_budget();
            if window_ok && background_ok {
                log.push_back(now);
                if priority != RequestPriority::Foreground {
                    background.push_back(now);
                }
                return Ok(permit);
            }
            if !window_ok {
                log.front().map_or(Duration::from_millis(600), |first| {
                    Duration::from_secs(60).saturating_sub(now.duration_since(*first))
                })
            } else {
                // The global window has room, but background has spent its
                // share. Yield briefly so a foreground request can take it.
                Duration::from_millis(750)
            }
        };
        drop(permit);
        tokio::time::sleep(delay).await;
    }
}
pub fn forbidden_error(authenticated: bool) -> String {
    if authenticated {
        "AniList HTTP 403".to_string()
    } else {
        "AniList HTTP 403: AniList disabled anonymous access. Log in and retry.".to_string()
    }
}

fn client_for_proxy(proxy: Option<&str>) -> Result<reqwest::Client, String> {
    if let Some(url) = proxy {
        let mut cached = PROXY_CLIENT
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some((_, client)) = cached.as_ref().filter(|(address, _)| address == url) {
            return Ok(client.clone());
        }
        let proxy = reqwest::Proxy::all(url).map_err(|e| format!("Invalid proxy URL: {e}"))?;
        let client = reqwest::Client::builder()
            .user_agent("iluhaAnime/1.0")
            .proxy(proxy)
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| format!("Failed to build proxied AniList client: {e}"))?;
        *cached = Some((url.to_owned(), client.clone()));
        Ok(client)
    } else {
        CLIENT.clone()
    }
}

#[allow(clippy::too_many_lines)]
pub async fn graphql_request(
    query: serde_json::Value,
    token: Option<&str>,
    proxy: Option<&str>,
) -> Result<serde_json::Value, String> {
    graphql_request_with_priority(query, token, proxy, RequestPriority::Foreground).await
}

/// Card packs, roster pages and metadata warmups must not starve user actions.
pub async fn graphql_request_background(
    query: serde_json::Value,
    token: Option<&str>,
    proxy: Option<&str>,
) -> Result<serde_json::Value, String> {
    graphql_request_with_priority(query, token, proxy, RequestPriority::Background).await
}

#[allow(clippy::too_many_lines)]
pub async fn graphql_request_with_priority(
    query: serde_json::Value,
    token: Option<&str>,
    proxy: Option<&str>,
    priority: RequestPriority,
) -> Result<serde_json::Value, String> {
    let client = client_for_proxy(proxy)?;
    let _foreground = ForegroundGuard::acquire(priority);
    let mut last_err = "AniList request failed".to_string();
    let attempts = match priority {
        RequestPriority::Foreground => FOREGROUND_ATTEMPTS,
        RequestPriority::Background | RequestPriority::Diagnostic => BACKGROUND_ATTEMPTS,
    };
    let timeout_secs = match priority {
        RequestPriority::Foreground => FOREGROUND_TIMEOUT_SECS,
        RequestPriority::Background | RequestPriority::Diagnostic => BACKGROUND_TIMEOUT_SECS,
    };
    let _ = PACK_REQUEST_COUNTS.try_with(|counts| {
        let (queries, attempts) = counts.get();
        counts.set((queries + 1, attempts));
    });
    REQUEST_TOTAL.fetch_add(1, Ordering::Relaxed);
    let request_started = Instant::now();
    for attempt in 0..attempts {
        let slot_started = Instant::now();
        let permit = acquire_request_slot(priority).await?;
        SLOT_WAIT_MICROS.fetch_add(slot_started.elapsed().as_micros() as u64, Ordering::Relaxed);
        let _ = PACK_REQUEST_COUNTS.try_with(|counts| {
            let (queries, attempts) = counts.get();
            counts.set((queries, attempts + 1));
        });
        REQUEST_ATTEMPTS.fetch_add(1, Ordering::Relaxed);

        let mut builder = client
            .post("https://graphql.anilist.co")
            .timeout(Duration::from_secs(timeout_secs))
            .json(&query);
        if let Some(t) = token {
            builder = builder.header("Authorization", format!("Bearer {t}"));
        }
        let send_result = builder.send().await;
        let resp = match send_result {
            Ok(r) => r,
            Err(e) => {
                last_err = format!("AniList request failed: {e}");
                tracing::warn!(attempt, error = last_err.as_str(), "anilist network error");
                drop(permit);
                if attempt + 1 < attempts {
                    tokio::time::sleep(Duration::from_secs(1 << attempt)).await;
                }
                continue;
            }
        };

        if resp.status() == reqwest::StatusCode::FORBIDDEN {
            tracing::warn!(
                attempt,
                authenticated = token.is_some(),
                "anilist forbidden response"
            );
            return Err(forbidden_error(token.is_some()));
        }

        if resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            let headers = resp.headers();
            let retry_after = headers
                .get(reqwest::header::RETRY_AFTER)
                .and_then(|v| v.to_str().ok());
            let reset = headers
                .get("x-ratelimit-reset")
                .and_then(|v| v.to_str().ok());
            update_rate_limit(
                headers
                    .get("x-ratelimit-limit")
                    .and_then(|v| v.to_str().ok()),
            );
            let delay = rate_limit_delay_secs(retry_after, reset, now_unix_secs(), 1 << attempt);
            last_err = "AniList rate limit exceeded".to_string();
            REQUEST_429.fetch_add(1, Ordering::Relaxed);
            note_rate_limited(delay);
            tracing::warn!(
                attempt,
                ?priority,
                delay_secs = delay,
                requests = REQUEST_TOTAL.load(Ordering::Relaxed),
                attempts = REQUEST_ATTEMPTS.load(Ordering::Relaxed),
                rate_limited = REQUEST_429.load(Ordering::Relaxed),
                rate_limit = rate_limit_per_min(),
                "anilist rate limited"
            );
            let mut cooldown = COOLDOWN_UNTIL
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let deadline = Instant::now() + Duration::from_secs(delay);
            *cooldown = Some(cooldown.map_or(deadline, |current| current.max(deadline)));
            continue;
        }

        update_rate_limit(
            resp.headers()
                .get("x-ratelimit-limit")
                .and_then(|v| v.to_str().ok()),
        );

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            let snippet: String = body.chars().take(300).collect();
            last_err = match serde_json::from_str::<serde_json::Value>(&body) {
                Ok(json)
                    if json
                        .get("errors")
                        .and_then(serde_json::Value::as_array)
                        .is_some_and(|errors| !errors.is_empty()) =>
                {
                    graphql_error_message(&json["errors"])
                }
                _ if snippet.is_empty() => format!("AniList HTTP {status}"),
                _ => format!("AniList HTTP {status}: {snippet}"),
            };
            tracing::warn!(
                attempt,
                error = last_err.as_str(),
                "anilist http error response"
            );
            if !should_retry_http(status) {
                return Err(last_err);
            }
            drop(permit);
            if attempt + 1 < attempts {
                tokio::time::sleep(Duration::from_secs(1 << attempt)).await;
            }
            continue;
        }

        let json = resp
            .json::<serde_json::Value>()
            .await
            .map_err(|e| format!("Failed to parse AniList response: {e}"))?;
        if json
            .get("errors")
            .and_then(serde_json::Value::as_array)
            .is_some_and(|errors| !errors.is_empty())
        {
            let message = graphql_error_message(&json["errors"]);
            tracing::warn!(attempt, error = message.as_str(), "anilist graphql errors");
            return Err(message);
        }
        tracing::debug!(
            attempt,
            ?priority,
            elapsed_ms = request_started.elapsed().as_millis(),
            requests = REQUEST_TOTAL.load(Ordering::Relaxed),
            attempts = REQUEST_ATTEMPTS.load(Ordering::Relaxed),
            rate_limited = REQUEST_429.load(Ordering::Relaxed),
            slot_wait_ms = SLOT_WAIT_MICROS.load(Ordering::Relaxed) / 1000,
            rate_limit = rate_limit_per_min(),
            "anilist request completed"
        );
        return Ok(json);
    }
    Err(last_err)
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn test_anilist_connection(
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<String, String> {
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let client = client_for_proxy(proxy.as_deref())?;
    let describe = |e: reqwest::Error| {
        let msg = e.to_string();
        if msg.contains("proxy") || msg.contains("Proxy") || msg.contains("tunnel") {
            format!("Proxy error: {msg}")
        } else {
            format!("Connection failed: {msg}")
        }
    };
    let start = Instant::now();
    let site = client
        .get("https://anilist.co")
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(describe)?;
    let site_ms = start.elapsed().as_millis();
    if !site.status().is_success() {
        return Err(format!("Site check failed: HTTP {}", site.status()));
    }
    let api_start = Instant::now();
    let outcome = graphql_request_with_priority(
        serde_json::json!({
            "query": "query ($id: Int) { Media(id: $id, type: ANIME) { id title { romaji } } }",
            "variables": { "id": 21 },
        }),
        None,
        proxy.as_deref(),
        RequestPriority::Diagnostic,
    )
    .await;
    let api_ms = api_start.elapsed().as_millis();
    let json = match outcome {
        Ok(json) => json,
        Err(error) => {
            if error.contains("temporarily disabled") {
                return Err(format!(
                    "AniList API temporarily disabled by AniList ({error} after {api_ms}ms). Site OK ({site_ms}ms). Retry later or switch proxy."
                ));
            }
            return Err(format!("API check failed: {error} after {api_ms}ms"));
        }
    };
    let id = json["data"]["Media"]["id"].as_u64().unwrap_or(0);
    let title = json["data"]["Media"]["title"]["romaji"]
        .as_str()
        .unwrap_or("?");
    Ok(format!(
        "OK site {site_ms}ms, API {api_ms}ms (#{id} {title})"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn client_for_proxy_builds_direct_and_proxied_clients() {
        assert!(client_for_proxy(None).is_ok());
        assert!(client_for_proxy(Some("socks5://127.0.0.1:10808")).is_ok());
        assert!(client_for_proxy(Some("http://127.0.0.1:7890")).is_ok());
        assert!(client_for_proxy(Some("://bad-url")).is_err());
    }

    #[test]
    fn graphql_error_message_unpacks_validation_fields() {
        let validation = serde_json::json!([{
            "message": "validation",
            "status": 400,
            "validation": { "progress": ["The progress must be an integer."] }
        }]);
        assert_eq!(
            graphql_error_message(&validation),
            "AniList GraphQL error 400: validation (progress: The progress must be an integer.)"
        );
    }

    #[test]
    fn client_errors_skip_retries() {
        assert!(!should_retry_http(reqwest::StatusCode::BAD_REQUEST));
        assert!(!should_retry_http(reqwest::StatusCode::UNAUTHORIZED));
        assert!(should_retry_http(
            reqwest::StatusCode::INTERNAL_SERVER_ERROR
        ));
        assert!(should_retry_http(reqwest::StatusCode::BAD_GATEWAY));
    }

    #[test]
    fn graphql_error_message_reports_status_and_message() {
        let limited = serde_json::json!([{ "message": "Too Many Requests.", "status": 429 }]);
        assert_eq!(
            graphql_error_message(&limited),
            "AniList GraphQL error 429: Too Many Requests."
        );
        let plain = serde_json::json!([{ "message": "Not found." }]);
        assert_eq!(
            graphql_error_message(&plain),
            "AniList GraphQL error: Not found."
        );
        assert_eq!(
            graphql_error_message(&serde_json::json!([])),
            "AniList GraphQL error: unknown GraphQL error"
        );
    }

    #[test]
    fn forbidden_error_names_login_only_for_anonymous_calls() {
        let anon = forbidden_error(false);
        assert!(anon.contains("403"));
        assert!(anon.contains("Log in"));
        assert_eq!(forbidden_error(true), "AniList HTTP 403");
    }

    #[test]
    fn rate_limit_delay_prefers_max_of_retry_after_and_reset() {
        assert_eq!(rate_limit_delay_secs(Some("30"), Some("10"), 1_000, 1), 30);
        assert_eq!(rate_limit_delay_secs(Some("5"), Some("1020"), 1_000, 1), 20);
        assert_eq!(rate_limit_delay_secs(None, Some("1045"), 1_000, 1), 45);
        assert_eq!(rate_limit_delay_secs(Some("3"), None, 1_000, 1), 3);
    }

    #[test]
    fn rate_limit_delay_caps_at_sixty_and_falls_back() {
        assert_eq!(rate_limit_delay_secs(Some("120"), None, 1_000, 1), 60);
        assert_eq!(rate_limit_delay_secs(None, Some("2000"), 1_000, 1), 60);
        assert_eq!(rate_limit_delay_secs(None, None, 1_000, 4), 4);
        assert_eq!(rate_limit_delay_secs(Some("0"), None, 1_000, 1), 1);
        assert_eq!(rate_limit_delay_secs(None, Some("900"), 1_000, 1), 1);
    }

    #[test]
    fn concurrency_budget_holds_three_permits() {
        assert_eq!(MAX_CONCURRENT_REQUESTS, 3);
        let first = ANILIST_CONCURRENCY
            .try_acquire()
            .expect("first concurrency permit should be free");
        let second = ANILIST_CONCURRENCY
            .try_acquire()
            .expect("second concurrency permit should be free");
        let third = ANILIST_CONCURRENCY
            .try_acquire()
            .expect("third concurrency permit should be free");
        assert!(ANILIST_CONCURRENCY.try_acquire().is_err());
        drop(first);
        drop(second);
        drop(third);
        assert_eq!(ANILIST_CONCURRENCY.available_permits(), 3);
    }
}
