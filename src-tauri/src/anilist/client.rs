use std::collections::VecDeque;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};
static CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .user_agent("iluhaAnime/1.0")
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
pub async fn graphql_request(
    query: serde_json::Value,
    token: Option<&str>,
) -> Result<serde_json::Value, String> {
    let mut last_err = "AniList request failed".to_string();
    for attempt in 0..3 {
        acquire_request_slot().await;

        let mut builder = CLIENT.post("https://graphql.anilist.co").json(&query);
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
