use std::sync::LazyLock;
use std::time::{Duration, Instant};

use reqwest::Client;
use serde::Serialize;

const API_HOST: &str = "https://api.jikan.moe/v4";

static CLIENT: LazyLock<Client> = LazyLock::new(|| {
    Client::builder()
        .user_agent("iluhaAnime/3.0 (https://github.com/iluhanime)")
        .build()
        .expect("failed to build Jikan reqwest client")
});

static JIKAN_LAST_REQUEST: LazyLock<tokio::sync::Mutex<Instant>> = LazyLock::new(|| {
    tokio::sync::Mutex::new(
        Instant::now()
            .checked_sub(Duration::from_secs(10))
            .unwrap_or_else(Instant::now),
    )
});

async fn throttle_jikan() {
    let mut last = JIKAN_LAST_REQUEST.lock().await;
    let elapsed = last.elapsed();
    if elapsed < Duration::from_millis(400) {
        tokio::time::sleep(
            Duration::from_millis(400)
                .checked_sub(elapsed)
                .expect("Jikan throttle delay underflow: elapsed exceeds interval"),
        )
        .await;
    }
    *last = Instant::now();
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimeStill {
    pub url: String,
}

fn parse_stills(json: &serde_json::Value) -> Vec<AnimeStill> {
    json["data"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|pic| {
            let large = pic["jpg"]["large_image_url"]
                .as_str()
                .filter(|u| !u.is_empty());
            let small = pic["jpg"]["image_url"].as_str().filter(|u| !u.is_empty());
            large.or(small).map(|u| AnimeStill { url: u.to_string() })
        })
        .take(8)
        .collect()
}

#[tauri::command]
pub async fn get_anime_stills(mal_id: u64) -> Result<Vec<AnimeStill>, String> {
    throttle_jikan().await;
    let response = CLIENT
        .get(format!("{API_HOST}/anime/{mal_id}/pictures"))
        .send()
        .await
        .map_err(|e| format!("Jikan stills request failed: {e}"))?;
    let status = response.status();
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err("Jikan rate limit exceeded, try again later".into());
    }
    if !status.is_success() {
        return Err(format!("Jikan stills failed with status {status}"));
    }
    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Jikan stills parse failed: {e}"))?;
    Ok(parse_stills(&json))
}

#[cfg(test)]
mod jikan_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_large_stills_with_fallback() {
        let json = json!({
            "data": [
                { "jpg": { "image_url": "https://cdn/small1.jpg", "large_image_url": "https://cdn/big1.jpg" } },
                { "jpg": { "image_url": "https://cdn/small2.jpg", "large_image_url": "" } },
                { "jpg": { "image_url": "", "large_image_url": "" } },
            ]
        });
        let stills = parse_stills(&json);
        assert_eq!(stills.len(), 2);
        assert_eq!(stills[0].url, "https://cdn/big1.jpg");
        assert_eq!(stills[1].url, "https://cdn/small2.jpg");
    }

    #[test]
    fn empty_pictures_without_data() {
        assert!(parse_stills(&json!({})).is_empty());
    }
}
