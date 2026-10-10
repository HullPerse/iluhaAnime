use std::collections::VecDeque;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};
static CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .user_agent("iluhaAnime/1.0")
        .timeout(Duration::from_secs(30))
        .build()
        .expect("failed to build reqwest client")
});

const RATE_LIMIT_PER_MIN: usize = 25;
const RATE_LIMIT_ADAPTIVE_CEILING: usize = 30;
const RATE_LIMIT_BACKOFF_PER_MIN: usize = 10;
const RATE_LIMIT_RESET_CAP_SECS: u64 = 60;
pub(crate) const MAX_CONCURRENT_REQUESTS: usize = 3;
static ANILIST_CONCURRENCY: tokio::sync::Semaphore =
    tokio::sync::Semaphore::const_new(MAX_CONCURRENT_REQUESTS);
static RATE_LOG: LazyLock<Mutex<VecDeque<Instant>>> = LazyLock::new(|| Mutex::new(VecDeque::new()));
static RATE_LIMIT_ADAPTIVE: AtomicUsize = AtomicUsize::new(RATE_LIMIT_PER_MIN);

fn update_rate_limit(header: Option<&str>) {
    let Some(limit) = header.and_then(|v| v.parse::<usize>().ok()) else {
        return;
    };
    if (10..=90).contains(&limit) {
        RATE_LIMIT_ADAPTIVE.store(limit.min(RATE_LIMIT_ADAPTIVE_CEILING), Ordering::Relaxed);
    }
}

fn note_rate_limited() {
    RATE_LIMIT_ADAPTIVE.fetch_min(RATE_LIMIT_BACKOFF_PER_MIN, Ordering::Relaxed);
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
        .map(|base| match (retry, reset_delay) {
            (Some(a), Some(b)) => a.max(b),
            _ => base,
        })
        .unwrap_or(fallback_secs)
        .max(1)
        .min(RATE_LIMIT_RESET_CAP_SECS)
}

fn graphql_error_message(errors: &serde_json::Value) -> String {
    let first = errors.as_array().and_then(|items| items.first());
    let message = first
        .and_then(|error| error.get("message").and_then(serde_json::Value::as_str))
        .unwrap_or("unknown GraphQL error");
    match first.and_then(|error| error.get("status").and_then(serde_json::Value::as_i64)) {
        Some(status) => format!("AniList GraphQL error {status}: {message}"),
        None => format!("AniList GraphQL error: {message}"),
    }
}

fn now_unix_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn rate_limit_per_min() -> usize {
    RATE_LIMIT_ADAPTIVE.load(Ordering::Relaxed)
}

async fn acquire_request_slot() -> tokio::sync::SemaphorePermit<'static> {
    loop {
        let now = Instant::now();
        {
            let mut log = RATE_LOG
                .lock()
                .expect("AniList rate-limit log mutex poisoned");
            while let Some(&t) = log.front() {
                if now.duration_since(t) >= Duration::from_secs(60) {
                    log.pop_front();
                } else {
                    break;
                }
            }
            if log.len() < rate_limit_per_min() {
                log.push_back(now);
                break;
            }
        }
        tokio::time::sleep(Duration::from_millis(600)).await;
    }
    ANILIST_CONCURRENCY
        .acquire()
        .await
        .expect("AniList concurrency semaphore closed")
}
pub fn resolve_proxy(proxy_url: Option<String>, proxy_camel: Option<String>) -> Option<String> {
    proxy_url
        .or(proxy_camel)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
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
        let proxy = reqwest::Proxy::all(url).map_err(|e| format!("Invalid proxy URL: {e}"))?;
        reqwest::Client::builder()
            .user_agent("iluhaAnime/1.0")
            .proxy(proxy)
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| format!("Failed to build proxied AniList client: {e}"))
    } else {
        Ok(CLIENT.clone())
    }
}

pub async fn graphql_request(
    query: serde_json::Value,
    token: Option<&str>,
    proxy: Option<&str>,
) -> Result<serde_json::Value, String> {
    let client = client_for_proxy(proxy)?;
    let mut last_err = "AniList request failed".to_string();
    for attempt in 0..3 {
        let permit = acquire_request_slot().await;

        let mut builder = client.post("https://graphql.anilist.co").json(&query);
        if let Some(t) = token {
            builder = builder.header("Authorization", format!("Bearer {t}"));
        }
        let send_result = builder.send().await;
        drop(permit);
        let resp = match send_result {
            Ok(r) => r,
            Err(e) => {
                last_err = format!("AniList request failed: {e}");
                tracing::warn!(attempt, error = last_err.as_str(), "anilist network error");
                tokio::time::sleep(Duration::from_secs(1 << attempt)).await;
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
            let remaining = headers
                .get("x-ratelimit-remaining")
                .and_then(|v| v.to_str().ok());
            update_rate_limit(
                headers
                    .get("x-ratelimit-limit")
                    .and_then(|v| v.to_str().ok()),
            );
            if remaining.is_some_and(|v| v.trim() == "0") {
                note_rate_limited();
            }
            let delay = rate_limit_delay_secs(retry_after, reset, now_unix_secs(), 1 << attempt);
            last_err = "AniList rate limit exceeded".to_string();
            tracing::warn!(attempt, delay_secs = delay, "anilist rate limited");
            tokio::time::sleep(Duration::from_secs(delay)).await;
            continue;
        }

        update_rate_limit(
            resp.headers()
                .get("x-ratelimit-limit")
                .and_then(|v| v.to_str().ok()),
        );

        if !resp.status().is_success() {
            let status = resp.status();
            let snippet: String = resp
                .text()
                .await
                .unwrap_or_default()
                .chars()
                .take(300)
                .collect();
            last_err = if snippet.is_empty() {
                format!("AniList HTTP {status}")
            } else {
                format!("AniList HTTP {status}: {snippet}")
            };
            tracing::warn!(
                attempt,
                error = last_err.as_str(),
                "anilist http error response"
            );
            tokio::time::sleep(Duration::from_secs(1 << attempt)).await;
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
    let resp = client
        .post("https://graphql.anilist.co")
        .json(&serde_json::json!({
            "query": "query ($id: Int) { Media(id: $id, type: ANIME) { id title { romaji } } }",
            "variables": { "id": 21 },
        }))
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| format!("API check failed: {}", describe(e)))?;
    let api_ms = api_start.elapsed().as_millis();
    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        if body.contains("temporarily disabled") {
            return Err(format!(
                "AniList API temporarily disabled by AniList (HTTP {status} after {api_ms}ms). Site OK ({site_ms}ms). Retry later or switch proxy."
            ));
        }
        return Err(format!("API check failed: HTTP {status} after {api_ms}ms"));
    }
    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("API check failed: bad JSON: {e}"))?;
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
    fn resolve_proxy_prefers_snake_case_and_drops_blanks() {
        assert_eq!(resolve_proxy(None, None), None);
        assert_eq!(
            resolve_proxy(Some("socks5://127.0.0.1:10808".to_string()), None),
            Some("socks5://127.0.0.1:10808".to_string())
        );
        assert_eq!(
            resolve_proxy(None, Some("http://127.0.0.1:7890".to_string())),
            Some("http://127.0.0.1:7890".to_string())
        );
        assert_eq!(
            resolve_proxy(Some("   ".to_string()), Some("".to_string())),
            None
        );
    }

    #[test]
    fn client_for_proxy_builds_direct_and_proxied_clients() {
        assert!(client_for_proxy(None).is_ok());
        assert!(client_for_proxy(Some("socks5://127.0.0.1:10808")).is_ok());
        assert!(client_for_proxy(Some("http://127.0.0.1:7890")).is_ok());
        assert!(client_for_proxy(Some("://bad-url")).is_err());
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
