use std::sync::{
    atomic::{AtomicI32, AtomicI64, Ordering},
    LazyLock,
};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use reqwest::Client;
use serde::Serialize;

static CLIENT: LazyLock<Client> = LazyLock::new(|| {
    Client::builder()
        .user_agent("iluhaAnime/3.0 (https://github.com/iluhanime)")
        .build()
        .expect("failed to build TMDB reqwest client")
});

const API_HOST: &str = "https://api.themoviedb.org/3";
const IMAGE_HOST: &str = "https://image.tmdb.org";

static TMDB_LAST_REQUEST: LazyLock<tokio::sync::Mutex<Instant>> = LazyLock::new(|| {
    tokio::sync::Mutex::new(Instant::now().checked_sub(Duration::from_secs(10)).unwrap())
});
static TMDB_REMAINING: AtomicI32 = AtomicI32::new(-1);
static TMDB_RESET_AT: AtomicI64 = AtomicI64::new(0);
static TMDB_RETRY_AFTER: AtomicI64 = AtomicI64::new(0);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TmdbRateLimit {
    pub remaining: Option<i32>,
    pub reset_at: Option<i64>,
    pub retry_after_secs: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TmdbSearchResult {
    pub id: i64,
    pub title: String,
    pub media_type: String,
    pub cover_url: Option<String>,
    pub year: Option<i32>,
    pub overview: Option<String>,
    pub release_date: Option<String>,
    pub alt_titles: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TmdbPoster {
    pub url: String,
    pub width: Option<i32>,
    pub height: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TmdbDetails {
    pub id: i64,
    pub title: String,
    pub media_type: String,
    pub overview: Option<String>,
    pub year: Option<i32>,
    pub runtime_minutes: Option<i32>,
    pub genres: Vec<String>,
    pub posters: Vec<TmdbPoster>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TmdbBackdrop {
    pub url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TmdbMedia {
    pub backdrops: Vec<TmdbBackdrop>,
    pub trailer_youtube_id: Option<String>,
}

fn parse_tmdb_media(json: &serde_json::Value) -> TmdbMedia {
    let mut backdrops = Vec::new();
    if let Some(imgs) = json["images"]["backdrops"].as_array() {
        for img in imgs.iter().take(8) {
            if let Some(path) = img["file_path"].as_str().filter(|p| !p.is_empty()) {
                backdrops.push(TmdbBackdrop {
                    url: format!("{IMAGE_HOST}/t/p/w780{path}"),
                });
            }
        }
    }
    let results: Vec<&serde_json::Value> = json["videos"]["results"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|v| v["site"].as_str() == Some("YouTube"))
        .collect();
    let pick = |kind: &str| {
        results
            .iter()
            .filter(|v| v["type"].as_str() == Some(kind))
            .find_map(|v| {
                v["key"]
                    .as_str()
                    .filter(|k| !k.is_empty())
                    .map(String::from)
            })
    };
    let trailer_youtube_id = pick("Trailer")
        .or_else(|| pick("Teaser"))
        .or_else(|| pick("Clip"));
    TmdbMedia {
        backdrops,
        trailer_youtube_id,
    }
}

fn poster_url(path: Option<&str>) -> Option<String> {
    path.filter(|p| !p.is_empty())
        .map(|p| format!("{IMAGE_HOST}/t/p/w500{p}"))
}

fn year_from_date(date: Option<&str>) -> Option<i32> {
    date.and_then(|d| d.get(0..4)).and_then(|y| y.parse().ok())
}

fn is_bearer_token(token: &str) -> bool {
    token.starts_with("eyJ") || token.len() > 64 || token.contains('.') && token.len() > 40
}

fn resolve_api_key(api_key: Option<String>, api_key_camel: Option<String>) -> String {
    api_key
        .or(api_key_camel)
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn resolve_proxy(proxy: Option<String>, proxy_camel: Option<String>) -> Option<String> {
    proxy
        .or(proxy_camel)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn client_for_proxy(proxy: Option<&str>) -> Result<Client, String> {
    if let Some(url) = proxy {
        let proxy = reqwest::Proxy::all(url).map_err(|e| format!("Invalid proxy URL: {e}"))?;
        Client::builder()
            .user_agent("iluhaAnime/3.0 (https://github.com/iluhanime)")
            .proxy(proxy)
            .timeout(Duration::from_secs(15))
            .build()
            .map_err(|e| format!("Failed to build proxied TMDB client: {e}"))
    } else {
        Ok(CLIENT.clone())
    }
}

fn redact_key(text: String, key: &str) -> String {
    if key.is_empty() {
        text
    } else {
        text.replace(key, "[REDACTED]")
    }
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn test_tmdb_connection(
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<String, String> {
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let client = client_for_proxy(proxy.as_deref())?;
    let start = Instant::now();
    let resp = client
        .get(format!("{API_HOST}/configuration"))
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| {
            let msg = e.to_string();
            if msg.contains("proxy") || msg.contains("Proxy") || msg.contains("tunnel") {
                format!("Proxy error: {msg}")
            } else {
                format!("Connection failed: {msg}")
            }
        })?;
    let elapsed = start.elapsed().as_millis();
    let status = resp.status().as_u16();
    if resp.status().is_success() || status == 401 {
        Ok(format!("OK {elapsed}ms (HTTP {status})"))
    } else if status == 429 {
        Ok(format!(
            "OK {elapsed}ms (HTTP 429 - rate limited, proxy works)"
        ))
    } else if (400..500).contains(&status) {
        Err(format!("HTTP {status} after {elapsed}ms"))
    } else {
        Ok(format!("OK {elapsed}ms (HTTP {status})"))
    }
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

async fn throttle_tmdb() {
    let mut last = TMDB_LAST_REQUEST.lock().await;
    let elapsed = last.elapsed();
    if elapsed < Duration::from_millis(250) {
        tokio::time::sleep(Duration::from_millis(250).checked_sub(elapsed).unwrap()).await;
    }
    *last = Instant::now();
}

fn update_rate_limit(headers: &reqwest::header::HeaderMap) {
    let remaining = headers
        .get("x-ratelimit-remaining")
        .or_else(|| headers.get("x-rate-limit-remaining"))
        .or_else(|| headers.get("ratelimit-remaining"))
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<i32>().ok());
    if let Some(r) = remaining {
        TMDB_REMAINING.store(r, Ordering::Relaxed);
    }
    let reset = headers
        .get("x-ratelimit-reset")
        .or_else(|| headers.get("x-rate-limit-reset"))
        .or_else(|| headers.get("ratelimit-reset"))
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<i64>().ok());
    if let Some(rs) = reset {
        let at = if rs > 1_000_000_000 {
            rs
        } else {
            now_secs() + rs
        };
        TMDB_RESET_AT.store(at, Ordering::Relaxed);
    }
    let retry = headers
        .get("retry-after")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<i64>().ok());
    if let Some(ra) = retry {
        TMDB_RETRY_AFTER.store(now_secs() + ra, Ordering::Relaxed);
    }
}

#[tauri::command]
pub fn get_tmdb_rate_limit() -> TmdbRateLimit {
    let remaining = match TMDB_REMAINING.load(Ordering::Relaxed) {
        -1 => None,
        v => Some(v),
    };
    let reset_at = match TMDB_RESET_AT.load(Ordering::Relaxed) {
        0 => None,
        v => Some(v),
    };
    let retry_after_secs = match TMDB_RETRY_AFTER.load(Ordering::Relaxed) {
        0 => None,
        v => {
            let now = now_secs();
            if v > now {
                Some(v - now)
            } else {
                None
            }
        }
    };
    TmdbRateLimit {
        remaining,
        reset_at,
        retry_after_secs,
    }
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn search_tmdb(
    api_key: Option<String>,
    apiKey: Option<String>,
    query: String,
    page: Option<u32>,
    language: Option<String>,
    include_adult: Option<bool>,
    includeAdult: Option<bool>,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<TmdbSearchResult>, String> {
    let api_key = resolve_api_key(api_key, apiKey);
    if api_key.is_empty() {
        return Err("TMDB API key is not set. Add it in Settings.".into());
    }
    let query_trim = query.trim();
    if query_trim.is_empty() || query_trim.chars().count() > 256 {
        return Err("TMDB search query is empty or too long".into());
    }
    let page = page.unwrap_or(1).clamp(1, 500);
    let language = language.unwrap_or_else(|| "en-US".to_string());
    let adult = includeAdult.or(include_adult).unwrap_or(false);
    let bearer = is_bearer_token(&api_key);
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let client = client_for_proxy(proxy.as_deref())?;
    throttle_tmdb().await;

    let mut request = client.get(format!("{API_HOST}/search/multi")).query(&[
        ("query", query_trim),
        ("page", &page.to_string()),
        ("language", &language),
        ("include_adult", &adult.to_string()),
    ]);
    if bearer {
        request = request.header("Authorization", format!("Bearer {api_key}"));
    } else {
        request = request.query(&[("api_key", api_key.as_str())]);
    }
    let response = request
        .send()
        .await
        .map_err(|e| {
            let msg = e.to_string();
            let hint = if msg.contains("sending request for url")
                || msg.contains("dns error")
                || msg.contains("failed to lookup address")
            {
                " (TMDB is not reachable - if you use TUN with app exclusion, set TMDB proxy to socks5://127.0.0.1:10808 or http://127.0.0.1:7890 in Settings)"
            } else {
                ""
            };
            redact_key(format!("TMDB request failed: {msg}{hint}"), &api_key)
        })?;
    update_rate_limit(response.headers());

    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err("TMDB API key is invalid".into());
    }
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        let retry = response
            .headers()
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(10);
        TMDB_RETRY_AFTER.store(now_secs() + retry, Ordering::Relaxed);
        return Err(format!("TMDB rate limit exceeded, try again in {retry}s"));
    }
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        let short = body.chars().take(200).collect::<String>();
        if short.to_lowercase().contains("invalid api key") {
            return Err("TMDB API key is invalid".into());
        }
        return Err(format!("TMDB search failed with status {status}: {short}"));
    }
    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("TMDB response parse failed: {e}"))?;

    let results = json["results"]
        .as_array()
        .ok_or("Unexpected TMDB response")?;
    let mut out = Vec::new();
    for item in results {
        let media_type = item["media_type"].as_str().unwrap_or("");
        if !matches!(media_type, "movie" | "tv") {
            continue;
        }
        let title = item["title"]
            .as_str()
            .or_else(|| item["name"].as_str())
            .unwrap_or("Unknown")
            .to_string();
        if title.is_empty() {
            continue;
        }
        let date = item["release_date"]
            .as_str()
            .or_else(|| item["first_air_date"].as_str());
        let cover = poster_url(item["poster_path"].as_str());
        let mut alt_titles = Vec::new();
        if let Some(orig) = item["original_title"]
            .as_str()
            .or_else(|| item["original_name"].as_str())
        {
            if !orig.is_empty() && orig != title {
                alt_titles.push(orig.to_string());
            }
        }
        if let Some(alt) = item["title"]
            .as_str()
            .zip(item["original_title"].as_str())
            .and_then(|(t, o)| if t == o { None } else { Some(o) })
        {
            if !alt_titles.contains(&alt.to_string()) {
                alt_titles.push(alt.to_string());
            }
        }
        out.push(TmdbSearchResult {
            id: item["id"].as_i64().unwrap_or(0),
            title,
            media_type: media_type.to_string(),
            cover_url: cover,
            year: year_from_date(date),
            overview: item["overview"].as_str().map(String::from),
            release_date: date.map(String::from),
            alt_titles,
        });
    }
    Ok(out)
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn get_tmdb_details(
    api_key: Option<String>,
    apiKey: Option<String>,
    tmdb_id: Option<i64>,
    tmdbId: Option<i64>,
    media_type: Option<String>,
    mediaType: Option<String>,
    language: Option<String>,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<TmdbDetails, String> {
    let api_key = resolve_api_key(api_key, apiKey);
    if api_key.is_empty() {
        return Err("TMDB API key is not set".into());
    }
    let tmdb_id = tmdb_id.or(tmdbId).ok_or("TMDB id is missing")?;
    let media_type = media_type
        .or(mediaType)
        .ok_or("TMDB media_type is missing")?;
    if !matches!(media_type.as_str(), "movie" | "tv") {
        return Err("TMDB media_type must be movie or tv".into());
    }
    let language = language.unwrap_or_else(|| "en-US".to_string());
    let endpoint = format!("{API_HOST}/{media_type}/{tmdb_id}");
    let bearer = is_bearer_token(&api_key);
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let client = client_for_proxy(proxy.as_deref())?;
    throttle_tmdb().await;
    let mut request = client.get(&endpoint).query(&[
        ("language", language.as_str()),
        ("append_to_response", "images"),
        ("include_image_language", "en,null"),
    ]);
    if bearer {
        request = request.header("Authorization", format!("Bearer {api_key}"));
    } else {
        request = request.query(&[("api_key", api_key.as_str())]);
    }
    let response = request.send().await.map_err(|e| {
        let msg = e.to_string();
        let hint = if msg.contains("sending request for url")
            || msg.contains("dns error")
            || msg.contains("failed to lookup address")
        {
            " (TMDB is not reachable - set TMDB proxy in Settings if api.themoviedb.org is blocked)"
        } else {
            ""
        };
        redact_key(
            format!("TMDB details request failed: {msg}{hint}"),
            &api_key,
        )
    })?;
    update_rate_limit(response.headers());

    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err("TMDB API key is invalid".into());
    }
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        let retry = response
            .headers()
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(10);
        TMDB_RETRY_AFTER.store(now_secs() + retry, Ordering::Relaxed);
        return Err(format!("TMDB rate limit exceeded, try again in {retry}s"));
    }
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        let short = body.chars().take(200).collect::<String>();
        if short.to_lowercase().contains("invalid api key") {
            return Err("TMDB API key is invalid".into());
        }
        return Err(format!("TMDB details failed with status {status}: {short}"));
    }
    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("TMDB details parse failed: {e}"))?;

    let title = json["title"]
        .as_str()
        .or_else(|| json["name"].as_str())
        .unwrap_or("Unknown")
        .to_string();
    let date = json["release_date"]
        .as_str()
        .or_else(|| json["first_air_date"].as_str());
    let runtime = json["runtime"]
        .as_i64()
        .or_else(|| {
            json["episode_run_time"]
                .as_array()
                .and_then(|a| a.first())
                .and_then(serde_json::Value::as_i64)
        })
        .map(|n| n as i32);
    let genres = json["genres"]
        .as_array()
        .map(|g| {
            g.iter()
                .filter_map(|v| v["name"].as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    let mut posters = Vec::new();
    if let Some(imgs) = json["images"]["posters"].as_array() {
        for p in imgs.iter().take(8) {
            if let Some(path) = p["file_path"].as_str() {
                posters.push(TmdbPoster {
                    url: format!("{IMAGE_HOST}/t/p/w500{path}"),
                    width: p["width"].as_i64().map(|n| n as i32),
                    height: p["height"].as_i64().map(|n| n as i32),
                });
            }
        }
    }
    if posters.is_empty() {
        if let Some(path) = json["poster_path"].as_str() {
            posters.push(TmdbPoster {
                url: format!("{IMAGE_HOST}/t/p/w500{path}"),
                width: Some(500),
                height: Some(750),
            });
        }
    }

    Ok(TmdbDetails {
        id: json["id"].as_i64().unwrap_or(0),
        title,
        media_type,
        overview: json["overview"].as_str().map(String::from),
        year: year_from_date(date),
        runtime_minutes: runtime,
        genres,
        posters,
    })
}
#[allow(non_snake_case)]
#[tauri::command]
pub async fn get_tmdb_media(
    api_key: Option<String>,
    apiKey: Option<String>,
    tmdb_id: Option<i64>,
    tmdbId: Option<i64>,
    media_type: Option<String>,
    mediaType: Option<String>,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<TmdbMedia, String> {
    let api_key = resolve_api_key(api_key, apiKey);
    if api_key.is_empty() {
        return Err("TMDB API key is not set".into());
    }
    let tmdb_id = tmdb_id.or(tmdbId).ok_or("TMDB id is missing")?;
    let media_type = media_type
        .or(mediaType)
        .ok_or("TMDB media_type is missing")?;
    if !matches!(media_type.as_str(), "movie" | "tv") {
        return Err("TMDB media_type must be movie or tv".into());
    }
    let endpoint = format!("{API_HOST}/{media_type}/{tmdb_id}");
    let bearer = is_bearer_token(&api_key);
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let client = client_for_proxy(proxy.as_deref())?;
    throttle_tmdb().await;
    let mut request = client.get(&endpoint).query(&[
        ("language", "en-US"),
        ("append_to_response", "videos,images"),
        ("include_image_language", "en,null"),
    ]);
    if bearer {
        request = request.header("Authorization", format!("Bearer {api_key}"));
    } else {
        request = request.query(&[("api_key", api_key.as_str())]);
    }
    let response = request
        .send()
        .await
        .map_err(|e| redact_key(format!("TMDB media request failed: {e}"), &api_key))?;
    update_rate_limit(response.headers());
    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err("TMDB API key is invalid".into());
    }
    if !status.is_success() {
        return Err(format!("TMDB media failed with status {status}"));
    }
    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("TMDB media parse failed: {e}"))?;
    Ok(parse_tmdb_media(&json))
}

#[cfg(test)]
mod tmdb_media_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_backdrops_and_trailer() {
        let json = json!({
            "images": { "backdrops": [
                { "file_path": "/a.jpg" },
                { "file_path": "" },
                { "file_path": "/b.jpg" },
            ]},
            "videos": { "results": [
                { "site": "YouTube", "type": "Teaser", "key": "teaser1" },
                { "site": "Vimeo", "type": "Trailer", "key": "nope" },
                { "site": "YouTube", "type": "Trailer", "key": "abc123" },
            ]},
        });
        let media = parse_tmdb_media(&json);
        assert_eq!(media.backdrops.len(), 2);
        assert_eq!(
            media.backdrops[0].url,
            "https://image.tmdb.org/t/p/w780/a.jpg"
        );
        assert_eq!(media.trailer_youtube_id.as_deref(), Some("abc123"));
    }

    #[test]
    fn empty_media_without_images_or_videos() {
        let media = parse_tmdb_media(&json!({}));
        assert!(media.backdrops.is_empty());
        assert_eq!(media.trailer_youtube_id, None);
    }
}
