use std::collections::HashMap;
use std::sync::LazyLock;
use std::time::{Duration, Instant};

use reqwest::Client;
use serde::Serialize;

const API_HOST: &str = "https://api.tenrai.org/v1";
const REQUEST_INTERVAL: Duration = Duration::from_millis(400);

static CLIENTS: LazyLock<std::sync::Mutex<HashMap<Option<String>, Client>>> =
    LazyLock::new(|| std::sync::Mutex::new(HashMap::new()));

static LAST_REQUEST: LazyLock<tokio::sync::Mutex<Instant>> = LazyLock::new(|| {
    tokio::sync::Mutex::new(
        Instant::now()
            .checked_sub(REQUEST_INTERVAL)
            .unwrap_or_else(Instant::now),
    )
});

async fn throttle() {
    let mut last = LAST_REQUEST.lock().await;
    let elapsed = last.elapsed();
    if elapsed < REQUEST_INTERVAL {
        tokio::time::sleep(
            REQUEST_INTERVAL
                .checked_sub(elapsed)
                .expect("Tenrai throttle delay underflow: elapsed exceeds interval"),
        )
        .await;
    }
    *last = Instant::now();
}

fn client_for(proxy: Option<&str>) -> Result<Client, String> {
    let key = proxy.map(str::to_string);
    if let Some(client) = CLIENTS
        .lock()
        .map_err(|_| "Tenrai client cache is poisoned".to_string())?
        .get(&key)
        .cloned()
    {
        return Ok(client);
    }
    let mut builder = Client::builder()
        .user_agent("iluhaAnime/3.0 (https://github.com/iluhanime)")
        .timeout(Duration::from_secs(15));
    if let Some(proxy) = proxy {
        builder = builder
            .proxy(reqwest::Proxy::all(proxy).map_err(|error| format!("Tenrai proxy: {error}"))?);
    }
    let client = builder
        .build()
        .map_err(|error| format!("build Tenrai client: {error}"))?;
    CLIENTS
        .lock()
        .map_err(|_| "Tenrai client cache is poisoned".to_string())?
        .insert(key, client.clone());
    Ok(client)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimeStill {
    pub url: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TenraiPicture {
    pub url: String,
    pub thumb_url: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TenraiCharacter {
    pub mal_id: i64,
    pub name: String,
    pub role: Option<String>,
}

fn non_empty(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

fn picture_from_node(node: &serde_json::Value) -> Option<TenraiPicture> {
    let jpg = &node["jpg"];
    let url = non_empty(jpg["large_image_url"].as_str())
        .or_else(|| non_empty(jpg["image_url"].as_str()))
        .or_else(|| non_empty(node["image_url"].as_str()))?;
    let thumb = non_empty(jpg["small_image_url"].as_str())
        .or_else(|| non_empty(jpg["image_url"].as_str()))
        .or_else(|| non_empty(node["image_url"].as_str()))
        .unwrap_or(url);
    Some(TenraiPicture {
        url: url.to_string(),
        thumb_url: thumb.to_string(),
    })
}

fn parse_pictures(json: &serde_json::Value) -> Vec<TenraiPicture> {
    let mut seen = std::collections::HashSet::new();
    json["data"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(picture_from_node)
        .filter(|picture| seen.insert(picture.url.clone()))
        .collect()
}

fn parse_characters(json: &serde_json::Value) -> Vec<TenraiCharacter> {
    let mut seen = std::collections::HashSet::new();
    json["data"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|entry| {
            let character = entry.get("character").unwrap_or(entry);
            let mal_id = character["mal_id"]
                .as_i64()
                .or_else(|| character["malId"].as_i64())?;
            let name = character["name"]
                .as_str()
                .or_else(|| {
                    character["name"]
                        .get("full")
                        .and_then(serde_json::Value::as_str)
                })?
                .trim();
            if name.is_empty() || !seen.insert(mal_id) {
                return None;
            }
            Some(TenraiCharacter {
                mal_id,
                name: name.to_string(),
                role: entry["role"]
                    .as_str()
                    .map(str::trim)
                    .filter(|role| !role.is_empty())
                    .map(str::to_string),
            })
        })
        .collect()
}

fn parse_stills(json: &serde_json::Value) -> Vec<AnimeStill> {
    parse_pictures(json)
        .into_iter()
        .map(|picture| AnimeStill { url: picture.url })
        .collect()
}

async fn request_json(path: &str, proxy: Option<&str>) -> Result<serde_json::Value, String> {
    throttle().await;
    let client = client_for(proxy)?;
    let response = client
        .get(format!("{API_HOST}{path}"))
        .send()
        .await
        .map_err(|error| format!("Tenrai request failed: {error}"))?;
    let status = response.status();
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err("Tenrai rate limit exceeded, try again later".into());
    }
    if !status.is_success() {
        return Err(format!("Tenrai request failed with status {status}"));
    }
    response
        .json()
        .await
        .map_err(|error| format!("Tenrai response parse failed: {error}"))
}

fn source_path(kind: &str, id: i64) -> Result<String, String> {
    match kind {
        "anime" => Ok(format!("/anime/{id}/pictures")),
        "manga" => Ok(format!("/manga/{id}/pictures")),
        "character" => Ok(format!("/characters/{id}/pictures")),
        _ => Err("unsupported Tenrai picture kind".into()),
    }
}

pub async fn pictures(
    kind: &str,
    id: i64,
    proxy: Option<&str>,
) -> Result<Vec<TenraiPicture>, String> {
    if id <= 0 {
        return Err("invalid MAL id".into());
    }
    let json = request_json(&source_path(kind, id)?, proxy).await?;
    Ok(parse_pictures(&json))
}

pub async fn characters_for_media(
    kind: &str,
    id: i64,
    proxy: Option<&str>,
) -> Result<Vec<TenraiCharacter>, String> {
    if id <= 0 {
        return Err("invalid MAL media id".into());
    }
    let path = match kind {
        "anime" => format!("/anime/{id}/characters"),
        "manga" => format!("/manga/{id}/characters"),
        _ => return Err("unsupported Tenrai character source".into()),
    };
    let json = request_json(&path, proxy).await?;
    Ok(parse_characters(&json))
}

#[tauri::command]
pub async fn get_anime_stills(mal_id: u64) -> Result<Vec<AnimeStill>, String> {
    let id = i64::try_from(mal_id).map_err(|_| "invalid MAL id".to_string())?;
    Ok(parse_stills(
        &request_json(&source_path("anime", id)?, None).await?,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_large_pictures_with_thumb_fallback_and_dedupes() {
        let json = json!({
            "data": [
                { "jpg": { "image_url": "https://cdn/small1.jpg", "large_image_url": "https://cdn/big1.jpg", "small_image_url": "https://cdn/thumb1.jpg" } },
                { "jpg": { "image_url": "https://cdn/small2.jpg", "large_image_url": "" } },
                { "jpg": { "image_url": "https://cdn/big1.jpg", "large_image_url": "https://cdn/big1.jpg" } },
                { "jpg": { "image_url": "", "large_image_url": "" } }
            ]
        });
        let pictures = parse_pictures(&json);
        assert_eq!(pictures.len(), 2);
        assert_eq!(pictures[0].url, "https://cdn/big1.jpg");
        assert_eq!(pictures[0].thumb_url, "https://cdn/thumb1.jpg");
        assert_eq!(pictures[1].url, "https://cdn/small2.jpg");
        assert_eq!(pictures[1].thumb_url, "https://cdn/small2.jpg");
    }

    #[test]
    fn empty_pictures_without_data() {
        assert!(parse_pictures(&json!({})).is_empty());
        assert!(parse_stills(&json!({})).is_empty());
    }

    #[test]
    fn parses_character_ids_names_and_roles() {
        let json = json!({
            "data": [
                { "character": { "mal_id": 45627, "name": "Levi Ackerman" }, "role": "Main" },
                { "character": { "mal_id": 45627, "name": "Levi Ackerman" }, "role": "Main" },
                { "character": { "mal_id": 71, "name": "Eren Yeager" }, "role": "Main" },
                { "character": { "mal_id": 0, "name": "" } }
            ]
        });
        let characters = parse_characters(&json);
        assert_eq!(characters.len(), 2);
        assert_eq!(characters[0].mal_id, 45627);
        assert_eq!(characters[0].role.as_deref(), Some("Main"));
        assert_eq!(characters[1].name, "Eren Yeager");
    }

    #[test]
    fn builds_the_expected_mal_paths() {
        assert_eq!(
            source_path("anime", 16498).unwrap(),
            "/anime/16498/pictures"
        );
        assert_eq!(source_path("manga", 2).unwrap(), "/manga/2/pictures");
        assert_eq!(
            source_path("character", 45627).unwrap(),
            "/characters/45627/pictures"
        );
        assert!(source_path("staff", 1).is_err());
    }
}
