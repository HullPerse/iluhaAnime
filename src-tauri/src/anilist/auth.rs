use serde::Serialize;
use std::{fs, path::PathBuf};
use tauri::Manager;

use crate::app_db;
use crate::auth::{delete_secret, load_secret, save_secret};

use super::batch::{execute_alias_batches, MAX_ALIASES_PER_CHUNK};
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
    pub title_language: Option<String>,
}

fn parse_title_language(user: &serde_json::Value) -> Option<String> {
    match user["options"]["titleLanguage"].as_str()? {
        "ROMAJI" => Some("romaji".to_string()),
        "ENGLISH" => Some("english".to_string()),
        "NATIVE" => Some("native".to_string()),
        _ => None,
    }
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
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AniFollowingUser {
    pub id: u64,
    pub name: String,
    pub avatar: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FollowingPage {
    pub users: Vec<AniFollowingUser>,
    pub has_next_page: bool,
    pub total: Option<i32>,
}

fn validate_following_params(
    user_id: u64,
    page: Option<u32>,
    per_page: Option<u32>,
) -> Result<(i64, u32, u32), String> {
    if user_id == 0 {
        return Err("A user id is required".to_string());
    }
    let page = page.unwrap_or(1);
    let per_page = per_page.unwrap_or(25);
    if page == 0 {
        return Err("page must be at least 1".to_string());
    }
    if !(1..=50).contains(&per_page) {
        return Err("per_page must be between 1 and 50".to_string());
    }
    Ok((user_id as i64, page, per_page))
}

fn parse_following_user(node: &serde_json::Value) -> Option<AniFollowingUser> {
    let id = node["id"].as_u64()?;
    if id == 0 {
        return None;
    }
    Some(AniFollowingUser {
        id,
        name: node["name"].as_str().unwrap_or("User").to_string(),
        avatar: node["avatar"]["large"]
            .as_str()
            .or_else(|| node["avatar"]["medium"].as_str())
            .map(String::from),
    })
}

fn parse_following_page(json: &serde_json::Value) -> FollowingPage {
    let page = &json["data"]["Page"];
    let users = page["following"]
        .as_array()
        .map(|items| items.iter().filter_map(parse_following_user).collect())
        .unwrap_or_default();
    FollowingPage {
        users,
        has_next_page: page["pageInfo"]["hasNextPage"].as_bool().unwrap_or(false),
        total: page["pageInfo"]["total"].as_i64().map(|n| n as i32),
    }
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_anilist_following(
    app_handle: tauri::AppHandle,
    user_id: u64,
    page: Option<u32>,
    perPage: Option<u32>,
    per_page: Option<u32>,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<FollowingPage, String> {
    let per_page = perPage.or(per_page);
    let (user_id, page, per_page) = validate_following_params(user_id, page, per_page)?;
    let token = load_token(&app_handle).ok();
    let body = serde_json::json!({
        "query": r"
            query ($userId: Int!, $page: Int, $perPage: Int) {
                Page(page: $page, perPage: $perPage) {
                    pageInfo { hasNextPage total }
                    following(userId: $userId) {
                        id
                        name
                        avatar { large medium }
                    }
                }
            }
        ",
        "variables": { "userId": user_id, "page": page, "perPage": per_page }
    });
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let json = graphql_request(body, token.as_deref(), proxy.as_deref()).await?;
    Ok(parse_following_page(&json))
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
                    options { titleLanguage }
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
        title_language: parse_title_language(v),
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
                    options { titleLanguage }
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
        title_language: parse_title_language(v),
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
            title_romaji: m["title"]["romaji"].as_str().map(String::from),
            title_english: m["title"]["english"].as_str().map(String::from),
            title_native: m["title"]["native"].as_str().map(String::from),
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
        custom_lists: entry["customLists"]
            .as_array()
            .map(|items| {
                items
                    .iter()
                    .filter_map(|name| name.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default(),
    }
}

const LIST_CHUNK_SIZE: u32 = 500;
const LIST_MAX_CHUNKS: u32 = 25;

const COLLECTION_QUERY: &str = r"
            query ($userId: Int, $chunk: Int, $perChunk: Int) {
                MediaListCollection(userId: $userId, type: ANIME, chunk: $chunk, perChunk: $perChunk) {
                    hasNextChunk
                    lists {
                        name
                        entries {
                            progress
                            score
                            status
                            notes
                            repeat
                            customLists
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
        ";

const MINIMAL_COLLECTION_QUERY: &str = r"
            query ($userId: Int, $chunk: Int, $perChunk: Int) {
                MediaListCollection(userId: $userId, type: ANIME, chunk: $chunk, perChunk: $perChunk) {
                    hasNextChunk
                    lists {
                        name
                        entries {
                            status
                            media {
                                id
                                title { romaji english native }
                                status
                                nextAiringEpisode { episode airingAt }
                            }
                        }
                    }
                }
            }
        ";

fn collection_body(user_id: u64, chunk: u32, minimal: bool) -> serde_json::Value {
    serde_json::json!({
        "query": if minimal { MINIMAL_COLLECTION_QUERY } else { COLLECTION_QUERY },
        "variables": { "userId": user_id, "chunk": chunk, "perChunk": LIST_CHUNK_SIZE }
    })
}

fn parse_collection_lists(lists: &serde_json::Value) -> Vec<AniListCollection> {
    lists
        .as_array()
        .map(|items| {
            items
                .iter()
                .map(|l| {
                    let name = l["name"].as_str().unwrap_or("").to_string();
                    let entries = l["entries"]
                        .as_array()
                        .map(|e| e.iter().map(parse_list_entry).collect())
                        .unwrap_or_default();
                    AniListCollection { name, entries }
                })
                .collect()
        })
        .unwrap_or_default()
}

fn merge_list_chunk(into: &mut Vec<AniListCollection>, chunk: Vec<AniListCollection>) {
    for group in chunk {
        if let Some(existing) = into.iter_mut().find(|known| known.name == group.name) {
            existing.entries.extend(group.entries);
        } else {
            into.push(group);
        }
    }
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_anilist_lists(
    app_handle: tauri::AppHandle,
    user_id: u64,
    minimal: Option<bool>,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<AniListCollection>, String> {
    let token = load_token(&app_handle)?;
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let minimal = minimal.unwrap_or(false);
    let mut merged: Vec<AniListCollection> = Vec::new();
    for chunk in 1..=LIST_MAX_CHUNKS {
        let json = graphql_request(
            collection_body(user_id, chunk, minimal),
            Some(&token),
            proxy.as_deref(),
        )
        .await?;
        let collection = &json["data"]["MediaListCollection"];
        merge_list_chunk(&mut merged, parse_collection_lists(&collection["lists"]));
        if !collection["hasNextChunk"].as_bool().unwrap_or(false) {
            break;
        }
    }
    Ok(merged)
}
#[derive(Debug, Serialize)]
pub struct AniListCollection {
    pub name: String,
    pub entries: Vec<AniListEntry>,
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_anilist_custom_lists(
    app_handle: tauri::AppHandle,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<String>, String> {
    let token = load_token(&app_handle)?;
    let body = serde_json::json!({
        "query": r"
            query {
                Viewer {
                    mediaListOptions {
                        animeList { customLists }
                    }
                }
            }
        ",
    });
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let json = graphql_request(body, Some(&token), proxy.as_deref()).await?;
    Ok(json["data"]["Viewer"]["mediaListOptions"]["animeList"]["customLists"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|name| name.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AniFriendScore {
    pub user_id: u64,
    pub score: Option<f64>,
    pub score_format: Option<String>,
    pub status: Option<String>,
    pub progress: Option<i32>,
    pub repeat: Option<i32>,
    pub notes: Option<String>,
    pub episodes: Option<i32>,
}

fn friend_score_query(user_ids: &[u64]) -> String {
    use std::fmt::Write;

    let mut query = String::from("query ($mediaId: Int) {\n");
    for (index, id) in user_ids.iter().enumerate() {
        let _ = writeln!(
            query,
            "f{index}: MediaList(mediaId: $mediaId, userId: {id}) {{ score status progress repeat notes media {{ episodes }} user {{ mediaListOptions {{ scoreFormat }} }} }}"
        );
    }
    query.push('}');
    query
}

fn parse_friend_score(node: &serde_json::Value, user_id: u64) -> Option<AniFriendScore> {
    if node.is_null() {
        return None;
    }
    Some(AniFriendScore {
        user_id,
        score: node["score"].as_f64(),
        score_format: node["user"]["mediaListOptions"]["scoreFormat"]
            .as_str()
            .map(String::from),
        status: node["status"].as_str().map(String::from),
        progress: node["progress"].as_i64().map(|n| n as i32),
        repeat: node["repeat"].as_i64().map(|n| n as i32),
        notes: node["notes"].as_str().map(String::from),
        episodes: node["media"]["episodes"].as_i64().map(|n| n as i32),
    })
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_anilist_friend_scores(
    app_handle: tauri::AppHandle,
    media_id: u64,
    user_ids: Vec<u64>,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<AniFriendScore>, String> {
    if user_ids.is_empty() {
        return Ok(Vec::new());
    }
    let token = load_token(&app_handle)?;
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let outcome = execute_alias_batches(
        &user_ids,
        MAX_ALIASES_PER_CHUNK,
        |chunk| {
            serde_json::json!({
                "query": friend_score_query(chunk),
                "variables": { "mediaId": media_id as i64 }
            })
        },
        {
            let token = token.clone();
            let proxy = proxy.clone();
            move |body| {
                let token = token.clone();
                let proxy = proxy.clone();
                async move { graphql_request(body, Some(&token), proxy.as_deref()).await }
            }
        },
        |index, user_id, json| {
            let alias = format!("f{index}");
            parse_friend_score(&json["data"][alias.as_str()], user_id)
        },
    )
    .await?;
    Ok(outcome.values)
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
    repeat: Option<i32>,
    r#private: Option<bool>,
    startedAt: Option<FuzzyDateInput>,
    completedAt: Option<FuzzyDateInput>,
    customLists: Option<Vec<String>>,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<(), String> {
    let token = load_token(&app_handle)?;
    let body = serde_json::json!({
        "query": r"
            mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int, $score: Float, $notes: String, $repeat: Int, $private: Boolean, $startedAt: FuzzyDateInput, $completedAt: FuzzyDateInput, $customLists: [String]) {
                SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress, score: $score, notes: $notes, repeat: $repeat, private: $private, startedAt: $startedAt, completedAt: $completedAt, customLists: $customLists) {
                    id
                    status
                    progress
                }
            }
        ",
        "variables": save_entry_variables(
            media_id,
            &status,
            progress,
            score,
            notes.as_deref(),
            repeat,
            r#private,
            startedAt.as_ref(),
            completedAt.as_ref(),
            customLists.as_deref()
        )
    });
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let json = graphql_request(body, Some(&token), proxy.as_deref()).await?;
    if json.get("errors").is_some() {
        return Err(format!("{:?}", json["errors"]));
    }
    Ok(())
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn delete_anilist_entry(
    app_handle: tauri::AppHandle,
    media_id: u64,
    user_id: u64,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<bool, String> {
    let token = load_token(&app_handle)?;
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let find = serde_json::json!({
        "query": "query ($mediaId: Int, $userId: Int) { MediaList(mediaId: $mediaId, userId: $userId) { id } }",
        "variables": { "mediaId": media_id, "userId": user_id }
    });
    let found = graphql_request(find, Some(&token), proxy.as_deref()).await?;
    if found.get("errors").is_some() {
        return Err(format!("{:?}", found["errors"]));
    }
    let entry_id = found["data"]["MediaList"]["id"].as_u64().unwrap_or(0);
    if entry_id == 0 {
        return Ok(false);
    }
    let body = serde_json::json!({
        "query": "mutation ($id: Int) { DeleteMediaListEntry(id: $id) { deleted } }",
        "variables": { "id": entry_id }
    });
    let json = graphql_request(body, Some(&token), proxy.as_deref()).await?;
    if json.get("errors").is_some() {
        return Err(format!("{:?}", json["errors"]));
    }
    Ok(json["data"]["DeleteMediaListEntry"]["deleted"]
        .as_bool()
        .unwrap_or(true))
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn update_anilist_entries_bulk(
    app_handle: tauri::AppHandle,
    ids: Vec<u64>,
    status: Option<String>,
    score: Option<f64>,
    progress: Option<i32>,
    repeat: Option<i32>,
    private: Option<bool>,
    notes: Option<String>,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<u64>, String> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let token = load_token(&app_handle)?;
    let body = serde_json::json!({
        "query": r"
            mutation ($ids: [Int], $status: MediaListStatus, $score: Float, $progress: Int, $repeat: Int, $private: Boolean, $notes: String) {
                UpdateMediaListEntries(ids: $ids, status: $status, score: $score, progress: $progress, repeat: $repeat, private: $private, notes: $notes) {
                    id
                }
            }
        ",
        "variables": bulk_update_variables(
            &ids,
            status.as_deref(),
            score,
            progress,
            repeat,
            private,
            notes.as_deref()
        )
    });
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let json = graphql_request(body, Some(&token), proxy.as_deref()).await?;
    Ok(parse_bulk_update_ids(
        &json["data"]["UpdateMediaListEntries"],
    ))
}

#[allow(clippy::cast_possible_wrap)]
fn bulk_update_variables(
    ids: &[u64],
    status: Option<&str>,
    score: Option<f64>,
    progress: Option<i32>,
    repeat: Option<i32>,
    private: Option<bool>,
    notes: Option<&str>,
) -> serde_json::Value {
    serde_json::json!({
        "ids": ids.iter().map(|id| *id as i64).collect::<Vec<_>>(),
        "status": status,
        "score": score,
        "progress": progress,
        "repeat": repeat,
        "private": private,
        "notes": notes
    })
}

fn parse_bulk_update_ids(entries: &serde_json::Value) -> Vec<u64> {
    entries
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|entry| entry["id"].as_u64())
                .collect()
        })
        .unwrap_or_default()
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FuzzyDateInput {
    pub year: Option<i32>,
    pub month: Option<i32>,
    pub day: Option<i32>,
}

#[allow(clippy::cast_possible_wrap)]
fn save_entry_variables(
    media_id: u64,
    status: &str,
    progress: Option<i32>,
    score: Option<f64>,
    notes: Option<&str>,
    repeat: Option<i32>,
    private: Option<bool>,
    started_at: Option<&FuzzyDateInput>,
    completed_at: Option<&FuzzyDateInput>,
    custom_lists: Option<&[String]>,
) -> serde_json::Value {
    serde_json::json!({
        "mediaId": media_id as i64,
        "status": status,
        "progress": progress,
        "score": score,
        "notes": notes,
        "repeat": repeat,
        "private": private,
        "startedAt": started_at,
        "completedAt": completed_at,
        "customLists": custom_lists
    })
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

    #[test]
    fn narrows_known_title_language_values() {
        for (raw, expected) in [
            ("ROMAJI", "romaji"),
            ("ENGLISH", "english"),
            ("NATIVE", "native"),
        ] {
            let viewer = serde_json::json!({ "options": { "titleLanguage": raw } });
            assert_eq!(parse_title_language(&viewer).as_deref(), Some(expected));
        }
    }

    #[test]
    fn unknown_title_language_falls_back_to_none() {
        for raw in ["ROMAJI_STYLISED", "KLINGON", ""] {
            let viewer = serde_json::json!({ "options": { "titleLanguage": raw } });
            assert_eq!(parse_title_language(&viewer), None);
        }
        assert_eq!(parse_title_language(&serde_json::json!({})), None);
        assert_eq!(
            parse_title_language(&serde_json::json!({ "options": { "titleLanguage": 7 } })),
            None
        );
    }

    #[test]
    fn friend_score_query_aliases_every_user() {
        let query = friend_score_query(&[7, 9]);
        assert!(query.contains("f0: MediaList(mediaId: $mediaId, userId: 7)"));
        assert!(query.contains("f1: MediaList(mediaId: $mediaId, userId: 9)"));
        assert!(query.contains("scoreFormat"));
    }

    #[test]
    fn save_entry_variables_carry_optional_fields() {
        let full = save_entry_variables(
            21,
            "COMPLETED",
            Some(12),
            Some(8.5),
            Some("great"),
            Some(1),
            Some(true),
            Some(&FuzzyDateInput {
                year: Some(2023),
                month: Some(5),
                day: Some(2),
            }),
            Some(&FuzzyDateInput {
                year: Some(2024),
                month: None,
                day: None,
            }),
            Some(&["favorites".to_string()]),
        );
        assert_eq!(full["mediaId"], 21);
        assert_eq!(full["repeat"], 1);
        assert_eq!(full["private"], true);
        assert_eq!(full["startedAt"]["month"], 5);
        assert_eq!(full["completedAt"]["year"], 2024);
        assert!(full["completedAt"]["month"].is_null());
        assert_eq!(full["customLists"][0], "favorites");

        let minimal = save_entry_variables(
            21, "PLANNING", None, None, None, None, None, None, None, None,
        );
        assert!(minimal["repeat"].is_null());
        assert!(minimal["private"].is_null());
        assert!(minimal["startedAt"].is_null());
        assert!(minimal["customLists"].is_null());
    }

    #[test]
    fn bulk_update_variables_carry_ids_once() {
        let vars = bulk_update_variables(&[7, 9], Some("CURRENT"), None, Some(3), None, None, None);
        assert_eq!(vars["ids"].as_array().unwrap().len(), 2);
        assert_eq!(vars["ids"][0], 7);
        assert_eq!(vars["status"], "CURRENT");
        assert_eq!(vars["progress"], 3);
        assert!(vars["score"].is_null());

        let payload = serde_json::json!([
            { "id": 101 },
            { "id": null },
            {},
            { "id": 102 }
        ]);
        assert_eq!(parse_bulk_update_ids(&payload), vec![101, 102]);
        assert!(parse_bulk_update_ids(&serde_json::Value::Null).is_empty());
    }

    #[test]
    fn merges_two_collection_chunks_by_group_name() {
        let first = serde_json::json!([
            { "name": "Completed", "entries": [{ "progress": 1 }, { "progress": 2 }] },
            { "name": "Watching", "entries": [{ "progress": 3 }] }
        ]);
        let second = serde_json::json!([
            { "name": "Completed", "entries": [{ "progress": 4 }] },
            { "name": "Planning", "entries": [{ "progress": 5 }] }
        ]);
        let mut merged = parse_collection_lists(&first);
        merge_list_chunk(&mut merged, parse_collection_lists(&second));
        let names: Vec<&str> = merged.iter().map(|g| g.name.as_str()).collect();
        assert_eq!(names, vec!["Completed", "Watching", "Planning"]);
        assert_eq!(merged[0].entries.len(), 3);
        assert_eq!(merged[1].entries.len(), 1);
        assert_eq!(merged[2].entries.len(), 1);
    }

    #[test]
    fn minimal_collection_body_is_smaller_than_full() {
        let full =
            serde_json::to_vec(&collection_body(7, 1, false)).expect("full body should serialize");
        let minimal = serde_json::to_vec(&collection_body(7, 1, true))
            .expect("minimal body should serialize");
        assert!(minimal.len() < full.len());
        let minimal_body = collection_body(7, 1, true);
        let minimal_query = minimal_body["query"].as_str().unwrap_or_default();
        for heavy in [
            "synonyms",
            "coverImage",
            "bannerImage",
            "genres",
            "tags { name }",
            "description",
        ] {
            assert!(
                !minimal_query.contains(heavy),
                "minimal query leaks {heavy}"
            );
        }
        for needed in [
            "nextAiringEpisode { episode airingAt }",
            "hasNextChunk",
            "title { romaji english native }",
        ] {
            assert!(
                minimal_query.contains(needed),
                "minimal query misses {needed}"
            );
        }
    }

    #[test]
    fn parses_friend_score_rows() {
        let row = serde_json::json!({
            "score": 85,
            "status": "COMPLETED",
            "progress": 12,
            "repeat": 1,
            "notes": "  great  ",
            "media": { "episodes": 24 },
            "user": { "mediaListOptions": { "scoreFormat": "POINT_100" } }
        });
        let parsed = parse_friend_score(&row, 7).expect("row should parse");
        assert_eq!(parsed.user_id, 7);
        assert_eq!(parsed.score, Some(85.0));
        assert_eq!(parsed.score_format.as_deref(), Some("POINT_100"));
        assert_eq!(parsed.status.as_deref(), Some("COMPLETED"));
        assert_eq!(parsed.progress, Some(12));
        assert_eq!(parsed.repeat, Some(1));
        assert_eq!(parsed.notes.as_deref(), Some("  great  "));
        assert_eq!(parsed.episodes, Some(24));
    }

    #[test]
    fn friends_without_an_entry_are_skipped() {
        assert!(parse_friend_score(&serde_json::Value::Null, 7).is_none());
    }

    #[test]
    fn following_params_reject_bad_input() {
        assert!(validate_following_params(0, None, None).is_err());
        assert!(validate_following_params(7, Some(0), None).is_err());
        assert!(validate_following_params(7, None, Some(0)).is_err());
        assert!(validate_following_params(7, None, Some(51)).is_err());
        let (user_id, page, per_page) =
            validate_following_params(7, None, None).expect("defaults should pass");
        assert_eq!((user_id, page, per_page), (7, 1, 25));
    }

    #[test]
    fn parses_following_page_with_pagination() {
        let json = serde_json::json!({
            "data": { "Page": {
                "pageInfo": { "hasNextPage": true, "total": 3 },
                "following": [
                    { "id": 7, "name": "A", "avatar": { "large": "https://img/a.jpg", "medium": null } },
                    { "id": 9, "name": "B", "avatar": { "large": null, "medium": "https://img/b.jpg" } },
                    { "id": 0, "name": "Ghost", "avatar": { "large": null, "medium": null } },
                    { "id": 11, "name": "C", "avatar": { "large": null, "medium": null } },
                ],
            } },
        });
        let parsed = parse_following_page(&json);
        assert!(parsed.has_next_page);
        assert_eq!(parsed.total, Some(3));
        assert_eq!(parsed.users.len(), 3);
        assert_eq!(parsed.users[0].name, "A");
        assert_eq!(parsed.users[0].avatar.as_deref(), Some("https://img/a.jpg"));
        assert_eq!(parsed.users[1].avatar.as_deref(), Some("https://img/b.jpg"));
        assert_eq!(parsed.users[2].avatar, None);
    }

    #[test]
    fn parses_following_page_without_page_info() {
        let json = serde_json::json!({ "data": { "Page": { "following": [] } } });
        let parsed = parse_following_page(&json);
        assert!(!parsed.has_next_page);
        assert_eq!(parsed.total, None);
        assert!(parsed.users.is_empty());
    }
}
