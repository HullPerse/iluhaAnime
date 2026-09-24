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
    pub score_format: Option<String>,
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
    pub score_format: Option<String>,
    pub is_following: Option<bool>,
    pub is_follower: Option<bool>,
}

fn parse_score_format(user: &serde_json::Value) -> Option<String> {
    user["mediaListOptions"]["scoreFormat"]
        .as_str()
        .map(String::from)
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
                    mediaListOptions { scoreFormat }
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
                    mediaListOptions { scoreFormat }
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
        score_format: parse_score_format(user),
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
                    mediaListOptions { scoreFormat }
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
        score_format: parse_score_format(v),
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
                    mediaListOptions { scoreFormat }
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
        score_format: parse_score_format(v),
    }))
}
fn parse_list_entry(entry: &serde_json::Value) -> AniListEntry {
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
            next_episode: m["nextAiringEpisode"]["episode"].as_i64().map(|n| n as i32),
            next_airing_at: m["nextAiringEpisode"]["airingAt"].as_i64(),
            start_date: parse_date(&m["startDate"]),
            end_date: None,
            popularity: m["popularity"].as_i64().map(|n| n as i32),
            favourites: None,
            rankings: vec![],
            relations: vec![],
        },
        progress: entry["progress"].as_i64().map(|n| n as i32),
        score: entry["score"].as_f64(),
        list_status: entry["status"].as_str().unwrap_or("").to_string(),
        created_at: entry["createdAt"].as_i64(),
        completed_at: parse_date(&entry["completedAt"]),
        started_at: parse_date(&entry["startedAt"]),
        updated_at: entry["updatedAt"].as_i64(),
        notes: entry["notes"].as_str().map(String::from),
        repeat: entry["repeat"].as_i64().map(|n| n as i32),
    }
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
                            notes
                            repeat
                            createdAt
                            completedAt { year month day }
                            startedAt { year month day }
                            updatedAt
                            media {
                                id
                                title { romaji english native }
                                synonyms
                                episodes, averageScore, popularity
                                startDate { year month day }
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
                .map(|e| e.iter().map(parse_list_entry).collect())
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
    let _ = app_db::prune_unified_index_scope(app_handle, "anilist".into(), Some(Vec::new()), None);
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
    notes: Option<String>,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<(), String> {
    let token = load_token(&app_handle)?;
    let body = serde_json::json!({
        "query": r"
            mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int, $score: Float, $notes: String) {
                SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress, score: $score, notes: $notes) {
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
            "score": score,
            "notes": notes
        }
    });
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let json = graphql_request(body, Some(&token), proxy.as_deref()).await?;
    if json.get("errors").is_some() {
        return Err(format!("{:?}", json["errors"]));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn list_entry_fixture() -> serde_json::Value {
        serde_json::json!({
            "progress": 12,
            "score": 8.0,
            "status": "CURRENT",
            "createdAt": 1700000000,
            "completedAt": { "year": 2024, "month": 3, "day": 9 },
            "startedAt": { "year": 2023, "month": 5, "day": 2 },
            "updatedAt": 1700000001,
            "media": {
                "id": 21,
                "title": { "romaji": "One Piece", "english": "One Piece" },
                "synonyms": [],
                "episodes": 1000,
                "averageScore": 87.4,
                "popularity": 500000,
                "startDate": { "year": 1999, "month": 10, "day": 20 },
                "genres": ["Action"],
                "tags": [{ "name": "Pirates" }],
                "coverImage": { "large": "https://img/large.jpg", "medium": null },
                "bannerImage": null,
                "status": "RELEASING",
                "nextAiringEpisode": { "episode": 1001, "airingAt": 1700000002 }
            }
        })
    }

    #[test]
    fn parses_release_date_and_popularity_from_list_entries() {
        let parsed = parse_list_entry(&list_entry_fixture());
        assert_eq!(parsed.media.start_date.as_deref(), Some("1999-10-20"));
        assert_eq!(parsed.media.popularity, Some(500000));
        assert_eq!(parsed.media.title, "One Piece");
        assert_eq!(parsed.completed_at.as_deref(), Some("2024-03-09"));
        assert_eq!(parsed.started_at.as_deref(), Some("2023-05-02"));
    }

    #[test]
    fn missing_release_date_and_popularity_stay_none() {
        let mut entry = list_entry_fixture();
        entry["media"]
            .as_object_mut()
            .expect("media object")
            .remove("startDate");
        entry["media"]
            .as_object_mut()
            .expect("media object")
            .remove("popularity");
        let parsed = parse_list_entry(&entry);
        assert_eq!(parsed.media.start_date, None);
        assert_eq!(parsed.media.popularity, None);
    }

    #[test]
    fn parses_notes_and_repeat_from_list_entries() {
        let mut entry = list_entry_fixture();
        entry["notes"] = serde_json::json!("rewatched with friends");
        entry["repeat"] = serde_json::json!(2);
        let parsed = parse_list_entry(&entry);
        assert_eq!(parsed.notes.as_deref(), Some("rewatched with friends"));
        assert_eq!(parsed.repeat, Some(2));
    }

    #[test]
    fn missing_notes_and_repeat_stay_none() {
        let parsed = parse_list_entry(&list_entry_fixture());
        assert_eq!(parsed.notes, None);
        assert_eq!(parsed.repeat, None);
    }

    #[test]
    fn parses_score_format_from_viewer_options() {
        let viewer = serde_json::json!({ "mediaListOptions": { "scoreFormat": "POINT_100" } });
        assert_eq!(parse_score_format(&viewer).as_deref(), Some("POINT_100"));
        let missing = serde_json::json!({});
        assert_eq!(parse_score_format(&missing), None);
    }
}
