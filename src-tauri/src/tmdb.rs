use std::sync::LazyLock;

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

fn poster_url(path: Option<&str>) -> Option<String> {
    path.filter(|p| !p.is_empty())
        .map(|p| format!("{IMAGE_HOST}/t/p/w500{p}"))
}

fn year_from_date(date: Option<&str>) -> Option<i32> {
    date.and_then(|d| d.get(0..4)).and_then(|y| y.parse().ok())
}

#[tauri::command]
pub async fn search_tmdb(
    api_key: String,
    query: String,
    page: Option<u32>,
    language: Option<String>,
    include_adult: Option<bool>,
) -> Result<Vec<TmdbSearchResult>, String> {
    let api_key = api_key.trim();
    if api_key.is_empty() {
        return Err("TMDB API key is not set. Add it in Settings.".into());
    }
    let query_trim = query.trim();
    if query_trim.is_empty() || query_trim.chars().count() > 256 {
        return Err("TMDB search query is empty or too long".into());
    }
    let page = page.unwrap_or(1).clamp(1, 500);
    let language = language.unwrap_or_else(|| "en-US".to_string());
    let adult = include_adult.unwrap_or(false);

    let response = CLIENT
        .get(format!("{API_HOST}/search/multi"))
        .query(&[
            ("api_key", api_key),
            ("query", query_trim),
            ("page", &page.to_string()),
            ("language", &language),
            ("include_adult", &adult.to_string()),
        ])
        .send()
        .await
        .map_err(|e| format!("TMDB request failed: {e}"))?;

    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err("TMDB API key is invalid".into());
    }
    if !status.is_success() {
        return Err(format!("TMDB search failed with status {status}"));
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
        // Only movies and tv; skip person/tv aggregates.
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
        out.push(TmdbSearchResult {
            id: item["id"].as_i64().unwrap_or(0),
            title,
            media_type: media_type.to_string(),
            cover_url: cover,
            year: year_from_date(date),
            overview: item["overview"].as_str().map(String::from),
            release_date: date.map(String::from),
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn get_tmdb_details(
    api_key: String,
    tmdb_id: i64,
    media_type: String,
    language: Option<String>,
) -> Result<TmdbDetails, String> {
    let api_key = api_key.trim();
    if api_key.is_empty() {
        return Err("TMDB API key is not set".into());
    }
    if !matches!(media_type.as_str(), "movie" | "tv") {
        return Err("TMDB media_type must be movie or tv".into());
    }
    let language = language.unwrap_or_else(|| "en-US".to_string());
    let endpoint = format!("{API_HOST}/{media_type}/{tmdb_id}");
    let response = CLIENT
        .get(&endpoint)
        .query(&[
            ("api_key", api_key),
            ("language", &language),
            ("append_to_response", "images"),
            ("include_image_language", "en,null"),
        ])
        .send()
        .await
        .map_err(|e| format!("TMDB details request failed: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("TMDB details failed with status {status}"));
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
                .and_then(|v| v.as_i64())
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
