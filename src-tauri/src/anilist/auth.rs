use serde::Serialize;
use std::{fs, path::PathBuf};
use tauri::Manager;

use crate::app_db;
use crate::auth::{delete_secret, load_secret, save_secret};

use super::client::{graphql_request, resolve_proxy};
use super::media::{collect_titles, parse_date, AniListEntry, AniMedia};

fn token_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?;
    Ok(dir.join("anilist_token.txt"))
}

const ANILIST_CREDENTIAL: &str = "anilist.access_token";

fn save_token(app_handle: &tauri::AppHandle, token: &str) -> Result<(), String> {
    save_secret(ANILIST_CREDENTIAL, token).map_err(|error| error.to_string())?;
    if let Ok(path) = token_path(app_handle) {
        let _ = fs::remove_file(path);
    }
    Ok(())
}

pub fn load_token(app_handle: &tauri::AppHandle) -> Result<String, String> {
    if let Ok(token) = load_secret(ANILIST_CREDENTIAL) {
        return Ok(token);
    }

    let path = token_path(app_handle)?;
    let token = fs::read_to_string(&path).map_err(|_| "Not authenticated".to_string())?;
    if save_secret(ANILIST_CREDENTIAL, token.trim()).is_ok() {
        let _ = fs::remove_file(path);
        tracing::info!("migrated AniList credentials to the OS credential store");
    }
    Ok(token)
}

pub fn optional_token(app_handle: &tauri::AppHandle) -> Option<String> {
    load_token(app_handle)
        .ok()
        .filter(|token| !token.is_empty())
}

#[derive(Debug, Serialize)]
pub struct AniUser {
    pub id: u64,
    pub name: String,
    pub avatar: Option<String>,
    pub anime_count: i32,
    pub episodes_watched: i32,
    pub mean_score: Option<i32>,
}

#[derive(Debug, Serialize)]
pub struct AniUserProfile {
    pub id: u64,
    pub name: String,
    pub avatar: Option<String>,
    pub banner_image: Option<String>,
    pub about: Option<String>,
    pub anime_count: i32,
    pub episodes_watched: i32,
    pub mean_score: Option<i32>,
    pub is_following: Option<bool>,
    pub is_follower: Option<bool>,
}
#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_anilist_profile(
    app_handle: tauri::AppHandle,
    user_id: Option<u64>,
    user_name: Option<String>,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<AniUserProfile, String> {
    if user_id.is_none() && user_name.as_deref().is_none_or(str::is_empty) {
        return Err("A user id or name is required".to_string());
    }

    let token = load_token(&app_handle).ok();
    let query = if token.is_some() {
        r"
            query ($userId: Int, $userName: String) {
                User(id: $userId, name: $userName) {
                    id
                    name
                    about
                    bannerImage
                    avatar { large medium }
                    isFollowing
                    isFollower
                    statistics {
                        anime { count episodesWatched meanScore }
                    }
                }
            }
        "
    } else {
        r"
            query ($userId: Int, $userName: String) {
                User(id: $userId, name: $userName) {
                    id
                    name
                    about
                    bannerImage
                    avatar { large medium }
                    statistics {
                        anime { count episodesWatched meanScore }
                    }
                }
            }
        "
    };
    let mut variables = serde_json::Map::new();
    if let Some(id) = user_id {
        variables.insert("userId".to_string(), serde_json::json!(id as i64));
    }
    if let Some(name) = user_name {
        variables.insert("userName".to_string(), serde_json::json!(name));
    }
    let body = serde_json::json!({
        "query": query,
        "variables": variables,
    });
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let json = graphql_request(body, token.as_deref(), proxy.as_deref()).await?;
    let user = &json["data"]["User"];
    if user.is_null() {
        return Err("AniList user was not found".to_string());
    }
    let stats = &user["statistics"]["anime"];
    Ok(AniUserProfile {
        id: user["id"].as_u64().unwrap_or(0),
        name: user["name"].as_str().unwrap_or("User").to_string(),
        avatar: user["avatar"]["large"]
            .as_str()
            .or_else(|| user["avatar"]["medium"].as_str())
            .map(String::from),
        banner_image: user["bannerImage"].as_str().map(String::from),
        about: user["about"].as_str().map(String::from),
        anime_count: stats["count"].as_i64().unwrap_or(0) as i32,
        episodes_watched: stats["episodesWatched"].as_i64().unwrap_or(0) as i32,
        mean_score: stats["meanScore"].as_i64().map(|score| score as i32),
        is_following: user["isFollowing"].as_bool(),
        is_follower: user["isFollower"].as_bool(),
    })
}
#[tauri::command]
#[allow(non_snake_case)]
pub async fn anilist_login(
    app_handle: tauri::AppHandle,
    token: String,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<AniUser, String> {
    let body = serde_json::json!({
        "query": r"
            query {
                Viewer {
                    id, name, avatar { medium }
                    statistics {
                        anime { count episodesWatched meanScore }
                    }
                }
            }
        "
    });
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let json = graphql_request(body, Some(&token), proxy.as_deref()).await?;
    let v = &json["data"]["Viewer"];
    if v.is_null() {
        return Err("Invalid token".to_string());
    }
    let stats = &v["statistics"]["anime"];
    let user = AniUser {
        id: v["id"].as_u64().unwrap_or(0),
        name: v["name"].as_str().unwrap_or("User").to_string(),
        avatar: v["avatar"]["medium"].as_str().map(String::from),
        anime_count: stats["count"].as_i64().unwrap_or(0) as i32,
        episodes_watched: stats["episodesWatched"].as_i64().unwrap_or(0) as i32,
        mean_score: stats["meanScore"].as_i64().map(|n| n as i32),
    };
    save_token(&app_handle, &token)?;
    Ok(user)
}
#[tauri::command]
#[allow(non_snake_case)]
pub async fn check_anilist_auth(
    app_handle: tauri::AppHandle,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Option<AniUser>, String> {
    let Ok(token) = load_token(&app_handle) else {
        return Ok(None);
    };
    let body = serde_json::json!({
        "query": r"
            query {
                Viewer {
                    id, name, avatar { medium }
                    statistics {
                        anime { count episodesWatched meanScore }
                    }
                }
            }
        "
    });
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let Ok(json) = graphql_request(body, Some(&token), proxy.as_deref()).await else {
        return Ok(None);
    };
    let v = &json["data"]["Viewer"];
    if v.is_null() {
        return Ok(None);
    }
    let stats = &v["statistics"]["anime"];
    Ok(Some(AniUser {
        id: v["id"].as_u64().unwrap_or(0),
        name: v["name"].as_str().unwrap_or("User").to_string(),
        avatar: v["avatar"]["medium"].as_str().map(String::from),
        anime_count: stats["count"].as_i64().unwrap_or(0) as i32,
        episodes_watched: stats["episodesWatched"].as_i64().unwrap_or(0) as i32,
        mean_score: stats["meanScore"].as_i64().map(|n| n as i32),
    }))
}
#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_anilist_lists(
    app_handle: tauri::AppHandle,
    user_id: u64,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<AniListCollection>, String> {
    let token = load_token(&app_handle)?;
    let body = serde_json::json!({
        "query": r"
            query ($userId: Int) {
                MediaListCollection(userId: $userId, type: ANIME) {
                    lists {
                        name
                        entries {
                            progress
                            score
                            status
                            createdAt
                            completedAt { year month day }
                            updatedAt
                            media {
                                id
                                title { romaji english native }
                                synonyms
                                episodes, averageScore
                                genres
                                tags { name }
                                coverImage { medium large }
                                bannerImage
                                status
                                nextAiringEpisode { episode airingAt }
                            }
                        }
                    }
                }
            }
        ",
        "variables": { "userId": user_id }
    });
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let json = graphql_request(body, Some(&token), proxy.as_deref()).await?;
    let lists = json["data"]["MediaListCollection"]["lists"]
        .as_array()
        .ok_or_else(|| "Unexpected response".to_string())?;
    Ok(lists
        .iter()
        .map(|l| {
            let name = l["name"].as_str().unwrap_or("").to_string();
            let entries = l["entries"]
                .as_array()
                .map(|e| {
                    e.iter()
                        .map(|entry| {
                            let m = &entry["media"];
                            let main_title = m["title"]["romaji"]
                                .as_str()
                                .or_else(|| m["title"]["english"].as_str())
                                .unwrap_or("Unknown");
                            AniListEntry {
                                media: AniMedia {
                                    id: m["id"].as_u64().unwrap_or(0),
                                    title: main_title.to_string(),
                                    titles: collect_titles(m, main_title),
                                    episodes: m["episodes"].as_i64().map(|n| n as i32),
                                    duration: None,
                                    format: None,
                                    status: m["status"].as_str().unwrap_or("UNKNOWN").to_string(),
                                    score: m["averageScore"].as_f64().map(|n| n.round() as i32),
                                    genres: m["genres"]
                                        .as_array()
                                        .map(|items| {
                                            items
                                                .iter()
                                                .filter_map(serde_json::Value::as_str)
                                                .map(String::from)
                                                .collect()
                                        })
                                        .unwrap_or_default(),
                                    tags: m["tags"]
                                        .as_array()
                                        .map(|items| {
                                            items
                                                .iter()
                                                .filter_map(|item| item["name"].as_str())
                                                .map(String::from)
                                                .collect()
                                        })
                                        .unwrap_or_default(),
                                    description: None,
                                    cover_url: m["coverImage"]["large"]
                                        .as_str()
                                        .or_else(|| m["coverImage"]["medium"].as_str())
                                        .map(String::from),
                                    banner_image: m["bannerImage"].as_str().map(String::from),
                                    id_mal: m["idMal"].as_i64(),
                                    trailer_youtube_id: None,
                                    season: None,
                                    season_year: None,
                                    studios: vec![],
                                    next_episode: m["nextAiringEpisode"]["episode"]
                                        .as_i64()
                                        .map(|n| n as i32),
                                    next_airing_at: m["nextAiringEpisode"]["airingAt"].as_i64(),
                                    start_date: None,
                                    end_date: None,
                                    popularity: None,
                                    favourites: None,
                                    rankings: vec![],
                                    relations: vec![],
                                },
                                progress: entry["progress"].as_i64().map(|n| n as i32),
                                score: entry["score"].as_f64(),
                                list_status: entry["status"].as_str().unwrap_or("").to_string(),
                                created_at: entry["createdAt"].as_i64(),
                                completed_at: parse_date(&entry["completedAt"]),
                                updated_at: entry["updatedAt"].as_i64(),
                            }
                        })
                        .collect()
                })
                .unwrap_or_default();
            AniListCollection { name, entries }
        })
        .collect())
}
#[derive(Debug, Serialize)]
pub struct AniListCollection {
    pub name: String,
    pub entries: Vec<AniListEntry>,
}
#[tauri::command]
pub async fn anilist_logout(app_handle: tauri::AppHandle) -> Result<(), String> {
    delete_secret(ANILIST_CREDENTIAL);
    let path = token_path(&app_handle)?;
    let _ = fs::remove_file(&path);
    let _ = app_db::prune_unified_index_scope(app_handle, "anilist".into(), Vec::new());
    Ok(())
}
#[allow(clippy::cast_possible_wrap)]
#[tauri::command]
#[allow(non_snake_case)]
pub async fn save_anilist_entry(
    app_handle: tauri::AppHandle,
    media_id: u64,
    status: String,
    progress: Option<i32>,
    score: Option<f64>,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<(), String> {
    let token = load_token(&app_handle)?;
    let body = serde_json::json!({
        "query": r"
            mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int, $score: Float) {
                SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress, score: $score) {
                    id
                    status
                    progress
                }
            }
        ",
        "variables": {
            "mediaId": media_id as i64,
            "status": status,
            "progress": progress,
            "score": score
        }
    });
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let json = graphql_request(body, Some(&token), proxy.as_deref()).await?;
    if json.get("errors").is_some() {
        return Err(format!("{:?}", json["errors"]));
    }
    Ok(())
}
