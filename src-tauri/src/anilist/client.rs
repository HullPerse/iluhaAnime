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

const RATE_LIMIT_PER_MIN: usize = 85;
static RATE_LOG: LazyLock<Mutex<VecDeque<Instant>>> = LazyLock::new(|| Mutex::new(VecDeque::new()));
static RATE_LIMIT_ADAPTIVE: AtomicUsize = AtomicUsize::new(RATE_LIMIT_PER_MIN);

fn update_rate_limit(header: Option<&str>) {
    let Some(limit) = header.and_then(|v| v.parse::<usize>().ok()) else {
        return;
    };
    if (10..=90).contains(&limit) {
        RATE_LIMIT_ADAPTIVE.store(limit.min(RATE_LIMIT_PER_MIN), Ordering::Relaxed);
    }
}

fn rate_limit_per_min() -> usize {
    RATE_LIMIT_ADAPTIVE.load(Ordering::Relaxed)
}

async fn acquire_request_slot() {
    loop {
        let now = Instant::now();
        {
            let mut log = RATE_LOG.lock().unwrap();
            while let Some(&t) = log.front() {
                if now.duration_since(t) >= Duration::from_secs(60) {
                    log.pop_front();
                } else {
                    break;
                }
            }
            if log.len() < rate_limit_per_min() {
                log.push_back(now);
                return;
            }
        }
        tokio::time::sleep(Duration::from_millis(600)).await;
    }
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
        acquire_request_slot().await;

        let mut builder = client.post("https://graphql.anilist.co").json(&query);
        if let Some(t) = token {
            builder = builder.header("Authorization", format!("Bearer {t}"));
        }
        let resp = match builder.send().await {
            Ok(r) => r,
            Err(e) => {
                last_err = format!("AniList request failed: {e}");
                tokio::time::sleep(Duration::from_secs(1 << attempt)).await;
                continue;
            }
        };

        if resp.status() == reqwest::StatusCode::FORBIDDEN {
            return Err(forbidden_error(token.is_some()));
        }

        if resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            let retry_after = resp
                .headers()
                .get(reqwest::header::RETRY_AFTER)
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(1 << attempt);
            last_err = "AniList rate limit exceeded".to_string();
            tokio::time::sleep(Duration::from_secs(retry_after.min(10))).await;
            continue;
        }

        update_rate_limit(
            resp.headers()
                .get("x-ratelimit-limit")
                .and_then(|v| v.to_str().ok()),
        );

        if !resp.status().is_success() {
            last_err = format!("AniList HTTP {}", resp.status());
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
            return Err(format!("AniList GraphQL error: {}", json["errors"]));
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
    fn forbidden_error_names_login_only_for_anonymous_calls() {
        let anon = forbidden_error(false);
        assert!(anon.contains("403"));
        assert!(anon.contains("Log in"));
        assert_eq!(forbidden_error(true), "AniList HTTP 403");
    }
}
