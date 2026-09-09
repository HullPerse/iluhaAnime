#![allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    clippy::cast_possible_wrap
)]

use serde::Serialize;

use super::auth::{load_token, optional_token};
use super::client::{graphql_request, resolve_proxy};
use super::media::{
    AniAnimeStaffEdge, AniCharacterEdge, AniCharacterMediaEdge, AniCharacterNode,
    AniStaffCharacterEdge, AniStaffDetail, AniStaffMediaEdge, AniVoiceActor,
};

#[derive(Debug, Serialize)]
pub struct AniRecommendation {
    pub id: u64,
    pub title: String,
    pub cover_url: Option<String>,
    pub episodes: Option<i32>,
    pub score: Option<i32>,
    pub format: Option<String>,
    pub recommendation_rating: i32,
}

#[derive(Debug, Serialize)]
pub struct AniImage {
    pub medium: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AniTitle {
    pub romaji: String,
    pub english: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct FavouriteAnime {
    pub id: i64,
    pub title: AniTitle,
    pub cover_image: Option<AniImage>,
    pub mean_score: Option<f64>,
    pub format: Option<String>,
}

fn parse_favourite_nodes(nodes: &[serde_json::Value]) -> Vec<FavouriteAnime> {
    nodes
        .iter()
        .map(|n| FavouriteAnime {
            id: n["id"].as_i64().unwrap_or(0),
            title: AniTitle {
                romaji: n["title"]["romaji"].as_str().unwrap_or("").to_string(),
                english: n["title"]["english"].as_str().map(String::from),
            },
            cover_image: n["coverImage"]["medium"].as_str().map(|s| AniImage {
                medium: Some(s.to_string()),
            }),
            mean_score: n["meanScore"].as_f64(),
            format: n["format"].as_str().map(String::from),
        })
        .collect()
}

#[derive(Debug, Serialize)]
pub struct FavouritePerson {
    pub id: i64,
    pub name: String,
    pub image: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct FavouritePeople {
    pub staff: Vec<FavouritePerson>,
    pub characters: Vec<FavouritePerson>,
}

fn parse_favourite_people(nodes: &[serde_json::Value]) -> Vec<FavouritePerson> {
    nodes
        .iter()
        .map(|n| FavouritePerson {
            id: n["id"].as_i64().unwrap_or(0),
            name: n["name"]["full"]
                .as_str()
                .or_else(|| n["name"]["native"].as_str())
                .unwrap_or("")
                .to_string(),
            image: n["image"]["medium"].as_str().map(String::from),
        })
        .collect()
}

const FAVOURITE_PERSON_NODES: &str = "id name { full native } image { medium }";

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_favourite_people(
    app_handle: tauri::AppHandle,
    user_id: i64,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<FavouritePeople, String> {
    let token = load_token(&app_handle)?;
    let body = serde_json::json!({
        "query": format!(
            r"
            query ($userId: Int) {{
                User(id: $userId) {{
                    favourites {{
                        staff {{ nodes {{ {nodes} }} }}
                        characters {{ nodes {{ {nodes} }} }}
                    }}
                }}
            }}
        ",
            nodes = FAVOURITE_PERSON_NODES
        ),
        "variables": { "userId": user_id }
    });
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let json = graphql_request(body, Some(&token), proxy.as_deref()).await?;
    if json.get("errors").is_some() {
        return Err(format!("{:?}", json["errors"]));
    }
    let favs = &json["data"]["User"]["favourites"];
    let staff = favs["staff"]["nodes"]
        .as_array()
        .ok_or_else(|| "Unexpected response".to_string())?;
    let characters = favs["characters"]["nodes"]
        .as_array()
        .ok_or_else(|| "Unexpected response".to_string())?;
    Ok(FavouritePeople {
        staff: parse_favourite_people(staff),
        characters: parse_favourite_people(characters),
    })
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn toggle_favourite_staff(
    app_handle: tauri::AppHandle,
    staff_id: i64,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<FavouritePerson>, String> {
    let token = load_token(&app_handle)?;
    let body = serde_json::json!({
        "query": format!(
            r"
            mutation ($staffId: Int) {{
                ToggleFavourite(staffId: $staffId) {{
                    staff {{ nodes {{ {nodes} }} }}
                }}
            }}
        ",
            nodes = FAVOURITE_PERSON_NODES
        ),
        "variables": { "staffId": staff_id }
    });
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let json = graphql_request(body, Some(&token), proxy.as_deref()).await?;
    if json.get("errors").is_some() {
        return Err(format!("{:?}", json["errors"]));
    }
    let nodes = json["data"]["ToggleFavourite"]["staff"]["nodes"]
        .as_array()
        .ok_or_else(|| "Unexpected response".to_string())?;
    Ok(parse_favourite_people(nodes))
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn toggle_favourite_character(
    app_handle: tauri::AppHandle,
    character_id: i64,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<FavouritePerson>, String> {
    let token = load_token(&app_handle)?;
    let body = serde_json::json!({
        "query": format!(
            r"
            mutation ($characterId: Int) {{
                ToggleFavourite(characterId: $characterId) {{
                    characters {{ nodes {{ {nodes} }} }}
                }}
            }}
        ",
            nodes = FAVOURITE_PERSON_NODES
        ),
        "variables": { "characterId": character_id }
    });
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let json = graphql_request(body, Some(&token), proxy.as_deref()).await?;
    if json.get("errors").is_some() {
        return Err(format!("{:?}", json["errors"]));
    }
    let nodes = json["data"]["ToggleFavourite"]["characters"]["nodes"]
        .as_array()
        .ok_or_else(|| "Unexpected response".to_string())?;
    Ok(parse_favourite_people(nodes))
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn toggle_favourite(
    app_handle: tauri::AppHandle,
    anime_id: i64,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<FavouriteAnime>, String> {
    let token = load_token(&app_handle)?;
    let body = serde_json::json!({
        "query": r"
            mutation ($animeId: Int) {
                ToggleFavourite(animeId: $animeId) {
                    anime {
                        nodes {
                            id
                            title { romaji english }
                            coverImage { medium }
                            meanScore
                            format
                        }
                    }
                }
            }
        ",
        "variables": { "animeId": anime_id }
    });
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let json = graphql_request(body, Some(&token), proxy.as_deref()).await?;
    if json.get("errors").is_some() {
        return Err(format!("{:?}", json["errors"]));
    }
    let nodes = json["data"]["ToggleFavourite"]["anime"]["nodes"]
        .as_array()
        .ok_or_else(|| "Unexpected response".to_string())?;
    Ok(parse_favourite_nodes(nodes))
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_favourites(
    app_handle: tauri::AppHandle,
    user_id: i64,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<FavouriteAnime>, String> {
    let token = load_token(&app_handle)?;
    let body = serde_json::json!({
        "query": r"
            query ($userId: Int) {
                User(id: $userId) {
                    favourites {
                        anime {
                            nodes {
                                id
                                title { romaji english }
                                coverImage { medium }
                                meanScore
                                format
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
    if json.get("errors").is_some() {
        return Err(format!("{:?}", json["errors"]));
    }
    let nodes = json["data"]["User"]["favourites"]["anime"]["nodes"]
        .as_array()
        .ok_or_else(|| "Unexpected response".to_string())?;
    Ok(parse_favourite_nodes(nodes))
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_profile_recommendations(
    app_handle: tauri::AppHandle,
    user_id: u64,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<AniRecommendation>, String> {
    let token = load_token(&app_handle)?;

    let list_body = serde_json::json!({
        "query": r"
            query ($userId: Int) {
                MediaListCollection(userId: $userId, type: ANIME) {
                    lists {
                        name
                        entries {
                            score
                            media { id }
                        }
                    }
                }
            }
        ",
        "variables": { "userId": user_id }
    });
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let list_json = graphql_request(list_body, Some(&token), proxy.as_deref()).await?;
    let lists = list_json["data"]["MediaListCollection"]["lists"]
        .as_array()
        .ok_or_else(|| "Unexpected response".to_string())?;

    let mut scored: Vec<(u64, f64)> = Vec::new();
    let mut completed_ids = std::collections::HashSet::new();
    for list in lists {
        let name = list["name"].as_str().unwrap_or("");
        if name.to_uppercase() != "COMPLETED" {
            continue;
        }
        if let Some(entries) = list["entries"].as_array() {
            for entry in entries {
                let score = entry["score"].as_f64().unwrap_or(0.0);
                if let Some(media_id) = entry["media"]["id"].as_u64() {
                    scored.push((media_id, score));
                    completed_ids.insert(media_id);
                }
            }
        }
    }
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let top_ids: Vec<u64> = scored.into_iter().take(5).map(|(id, _)| id).collect();

    if top_ids.is_empty() {
        return Ok(Vec::new());
    }

    let rec_body = serde_json::json!({
        "query": r"
            query ($ids: [Int]) {
                Page(page: 1, perPage: 50) {
                    media(id_in: $ids, type: ANIME) {
                        recommendations(page: 1, perPage: 10, sort: RATING_DESC) {
                            nodes {
                                mediaRecommendation {
                                    id
                                    title { romaji english native }
                                    episodes, averageScore, format
                                    coverImage { medium large }
                                }
                                rating
                            }
                        }
                    }
                }
            }
        ",
        "variables": { "ids": top_ids }
    });
    let rec_json = graphql_request(rec_body, Some(&token), proxy.as_deref()).await?;

    let media_list = rec_json["data"]["Page"]["media"]
        .as_array()
        .ok_or_else(|| "Unexpected response".to_string())?;

    let mut seen = std::collections::HashSet::new();
    let mut result: Vec<AniRecommendation> = Vec::new();
    for media in media_list {
        if let Some(nodes) = media["recommendations"]["nodes"].as_array() {
            for r in nodes {
                let m = &r["mediaRecommendation"];
                let media_id = m["id"].as_u64().unwrap_or(0);
                if !seen.insert(media_id) {
                    continue;
                }
                if completed_ids.contains(&media_id) {
                    continue;
                }
                let title = m["title"]["romaji"]
                    .as_str()
                    .or_else(|| m["title"]["english"].as_str())
                    .unwrap_or("Unknown");
                result.push(AniRecommendation {
                    id: media_id,
                    title: title.to_string(),
                    cover_url: m["coverImage"]["medium"].as_str().map(String::from),
                    episodes: m["episodes"].as_i64().map(|n| n as i32),
                    score: m["averageScore"].as_i64().map(|n| n as i32),
                    format: m["format"].as_str().map(String::from),
                    recommendation_rating: r["rating"].as_i64().unwrap_or(0) as i32,
                });
            }
        }
    }

    Ok(result)
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_anime_recommendations(
    app_handle: tauri::AppHandle,
    id: u64,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<AniRecommendation>, String> {
    let body = serde_json::json!({
        "query": r"
            query ($id: Int) {
                Media(id: $id, type: ANIME) {
                    recommendations(page: 1, perPage: 25, sort: RATING_DESC) {
                        nodes {
                            mediaRecommendation {
                                id
                                title { romaji english }
                                episodes, averageScore, format
                                coverImage { medium }
                            }
                            rating
                        }
                    }
                }
            }
        ",
        "variables": { "id": id }
    });
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let token = optional_token(&app_handle);
    let json = graphql_request(body, token.as_deref(), proxy.as_deref()).await?;
    if json.get("errors").is_some() {
        return Err(format!("{:?}", json["errors"]));
    }
    let nodes = json["data"]["Media"]["recommendations"]["nodes"]
        .as_array()
        .ok_or_else(|| "Failed to parse recommendations".to_string())?;
    let mut seen = std::collections::HashSet::new();
    Ok(nodes
        .iter()
        .filter_map(|r| {
            let m = &r["mediaRecommendation"];
            let media_id = m["id"].as_u64().unwrap_or(0);
            if media_id == 0 || !seen.insert(media_id) {
                return None;
            }
            let title = m["title"]["romaji"]
                .as_str()
                .or_else(|| m["title"]["english"].as_str())
                .unwrap_or("Unknown");
            Some(AniRecommendation {
                id: media_id,
                title: title.to_string(),
                cover_url: m["coverImage"]["medium"].as_str().map(String::from),
                episodes: m["episodes"].as_i64().map(|n| n as i32),
                score: m["averageScore"].as_i64().map(|n| n as i32),
                format: m["format"].as_str().map(String::from),
                recommendation_rating: r["rating"].as_i64().unwrap_or(0) as i32,
            })
        })
        .collect())
}
#[derive(Debug, Serialize)]
pub struct AniActivity {
    pub id: u64,
    pub created_at: i64,
    pub activity_type: String,
    pub status: Option<String>,
    pub progress: Option<String>,
    pub text: Option<String>,
    pub media_id: Option<u64>,
    pub media_title: Option<String>,
    pub media_cover: Option<String>,
    pub user_id: u64,
    pub user_name: String,
    pub user_avatar: Option<String>,
}

fn normalize_activity_status(raw: &str) -> String {
    let lower = raw.to_lowercase();
    match lower.as_str() {
        "plans to watch" | "plans to read" => return "PLANNING".to_string(),
        "completed" | "read completed" => return "COMPLETED".to_string(),
        _ => {}
    }
    for needle in ["dropped", "drop "] {
        if lower.contains(needle) {
            return "DROPPED".to_string();
        }
    }
    for needle in ["paused", "pause "] {
        if lower.contains(needle) {
            return "PAUSED".to_string();
        }
    }
    for needle in ["reread", "rewatch", "replay", "repeat"] {
        if lower.contains(needle) {
            return "REPEATING".to_string();
        }
    }
    if lower.contains("complete") || lower.contains("finish") {
        return "COMPLETED".to_string();
    }
    for needle in ["watch", "read", "start", "current"] {
        if lower.contains(needle) {
            return "CURRENT".to_string();
        }
    }
    raw.to_string()
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_anilist_activity(
    app_handle: tauri::AppHandle,
    user_ids: Vec<u64>,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<AniActivity>, String> {
    let body = serde_json::json!({
        "query": r"
            query ($userIds: [Int], $page: Int) {
                Page(page: $page, perPage: 50) {
                    activities(userId_in: $userIds, sort: ID_DESC) {
                        ... on ListActivity {
                            id
                            createdAt
                            status
                            progress
                            media { id type title { romaji english } coverImage { medium } }
                            user { id name avatar { medium } }
                        }
                        ... on TextActivity {
                            id
                            createdAt
                            text
                            user { id name avatar { medium } }
                        }
                    }
                }
            }
        ",
        "variables": { "userIds": user_ids, "page": 1 }
    });
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let token = optional_token(&app_handle);
    let json = graphql_request(body, token.as_deref(), proxy.as_deref()).await?;
    if json.get("errors").is_some() {
        return Err(format!("{:?}", json["errors"]));
    }
    let activities = json["data"]["Page"]["activities"]
        .as_array()
        .ok_or_else(|| "Failed to parse activities".to_string())?;
    Ok(activities
        .iter()
        .filter_map(|a| {
            let user = &a["user"];
            let a_type = if a["status"].is_string() {
                "list"
            } else {
                "text"
            };
            if a_type == "list" && a["media"]["type"].as_str() != Some("ANIME") {
                return None;
            }
            Some(AniActivity {
                id: a["id"].as_u64().unwrap_or(0),
                created_at: a["createdAt"].as_i64().unwrap_or(0),
                activity_type: a_type.to_string(),
                status: a["status"].as_str().map(normalize_activity_status),
                progress: a["progress"].as_str().map(String::from),
                text: a["text"].as_str().map(String::from),
                media_id: a["media"]["id"].as_u64(),
                media_title: a["media"]["title"]["romaji"]
                    .as_str()
                    .or_else(|| a["media"]["title"]["english"].as_str())
                    .map(String::from),
                media_cover: a["media"]["coverImage"]["medium"]
                    .as_str()
                    .map(String::from),
                user_id: user["id"].as_u64().unwrap_or(0),
                user_name: user["name"].as_str().unwrap_or("").to_string(),
                user_avatar: user["avatar"]["medium"].as_str().map(String::from),
            })
        })
        .collect())
}
#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_anime_characters(
    app_handle: tauri::AppHandle,
    id: u64,
    page: u64,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<AniCharacterEdge>, String> {
    let body = serde_json::json!({
        "query": r"
            query ($id: Int, $page: Int) {
                Media(id: $id, type: ANIME) {
                    characters(page: $page, perPage: 25) {
                        edges {
                            role
                            node {
                                id
                                name { full native }
                                image { medium }
                            }
                            voiceActors(language: JAPANESE, sort: [ID]) {
                                id
                                name { full native }
                                image { medium }
                                language
                            }
                        }
                    }
                }
            }
        ",
        "variables": { "id": id, "page": page }
    });
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let token = optional_token(&app_handle);
    let json = graphql_request(body, token.as_deref(), proxy.as_deref()).await?;
    if json.get("errors").is_some() {
        return Err(format!("{:?}", json["errors"]));
    }
    let edges = json["data"]["Media"]["characters"]["edges"]
        .as_array()
        .ok_or_else(|| "Failed to parse characters".to_string())?;
    Ok(edges
        .iter()
        .map(|e| AniCharacterEdge {
            role: e["role"].as_str().unwrap_or("").to_string(),
            character: {
                let n = &e["node"];
                AniCharacterNode {
                    id: n["id"].as_u64().unwrap_or(0),
                    name: n["name"]["full"].as_str().unwrap_or("").to_string(),
                    native_name: n["name"]["native"].as_str().map(String::from),
                    image: n["image"]["medium"].as_str().map(String::from),
                }
            },
            voice_actors: e["voiceActors"]
                .as_array()
                .map(|vas| {
                    vas.iter()
                        .map(|va| AniVoiceActor {
                            id: va["id"].as_u64().unwrap_or(0),
                            name: va["name"]["full"].as_str().unwrap_or("").to_string(),
                            native_name: va["name"]["native"].as_str().map(String::from),
                            image: va["image"]["medium"].as_str().map(String::from),
                            language: va["language"].as_str().map(String::from),
                        })
                        .collect()
                })
                .unwrap_or_default(),
        })
        .collect())
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_character_media(
    app_handle: tauri::AppHandle,
    id: u64,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<AniCharacterMediaEdge>, String> {
    let body = serde_json::json!({
        "query": r"
            query ($id: Int) {
                Character(id: $id) {
                    media(page: 1, perPage: 50, type: ANIME) {
                        edges {
                            node {
                                id
                                title { romaji english }
                                coverImage { medium }
                            }
                        }
                    }
                }
            }
        ",
        "variables": { "id": id }
    });
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let token = optional_token(&app_handle);
    let json = graphql_request(body, token.as_deref(), proxy.as_deref()).await?;
    let edges = json["data"]["Character"]["media"]["edges"]
        .as_array()
        .ok_or_else(|| "No media found".to_string())?;
    let mut seen = std::collections::HashSet::new();
    Ok(edges
        .iter()
        .filter_map(|e| {
            let n = &e["node"];
            let mid = n["id"].as_u64().unwrap_or(0);
            if mid == 0 || !seen.insert(mid) {
                return None;
            }
            let title = n["title"]["romaji"]
                .as_str()
                .or_else(|| n["title"]["english"].as_str())
                .unwrap_or("Unknown")
                .to_string();
            Some(AniCharacterMediaEdge {
                id: mid,
                title,
                cover_url: n["coverImage"]["medium"].as_str().map(String::from),
            })
        })
        .collect())
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_staff_characters(
    app_handle: tauri::AppHandle,
    id: u64,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<AniStaffDetail, String> {
    let body = serde_json::json!({
        "query": r"
            query ($id: Int) {
                Staff(id: $id) {
                    id
                    name { full native }
                    image { medium }
                    characters(page: 1, perPage: 50) {
                        edges {
                            node {
                                id
                                name { full native }
                                image { medium }
                            }
                        }
                    }
                    staffMedia(page: 1, perPage: 50, type: ANIME) {
                        edges {
                            node {
                                id
                                title { romaji english }
                                coverImage { medium }
                            }
                        }
                    }
                }
            }
        ",
        "variables": { "id": id }
    });
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let token = optional_token(&app_handle);
    let json = graphql_request(body, token.as_deref(), proxy.as_deref()).await?;
    let s = &json["data"]["Staff"];
    let name = s["name"]["full"]
        .as_str()
        .or_else(|| s["name"]["native"].as_str())
        .unwrap_or("Unknown")
        .to_string();

    let mut seen_chars = std::collections::HashSet::new();
    let characters = s["characters"]["edges"]
        .as_array()
        .map(|edges| {
            edges
                .iter()
                .filter_map(|e| {
                    let n = &e["node"];
                    let cid = n["id"].as_u64().unwrap_or(0);
                    if cid == 0 || !seen_chars.insert(cid) {
                        return None;
                    }
                    Some(AniStaffCharacterEdge {
                        id: cid,
                        name: n["name"]["full"].as_str().unwrap_or("").to_string(),
                        image: n["image"]["medium"].as_str().map(String::from),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let mut seen_media = std::collections::HashSet::new();
    let media = s["staffMedia"]["edges"]
        .as_array()
        .map(|edges| {
            edges
                .iter()
                .filter_map(|e| {
                    let n = &e["node"];
                    let mid = n["id"].as_u64().unwrap_or(0);
                    if mid == 0 || !seen_media.insert(mid) {
                        return None;
                    }
                    let title = n["title"]["romaji"]
                        .as_str()
                        .or_else(|| n["title"]["english"].as_str())
                        .unwrap_or("Unknown")
                        .to_string();
                    Some(AniStaffMediaEdge {
                        id: mid,
                        title,
                        cover_url: n["coverImage"]["medium"].as_str().map(String::from),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(AniStaffDetail {
        id: s["id"].as_u64().unwrap_or(0),
        name,
        image: s["image"]["medium"].as_str().map(String::from),
        characters,
        media,
    })
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_anime_staff(
    app_handle: tauri::AppHandle,
    id: u64,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<AniAnimeStaffEdge>, String> {
    let body = serde_json::json!({
        "query": r"
            query ($id: Int) {
                Media(id: $id, type: ANIME) {
                    staff {
                        edges {
                            role
                            node {
                                id
                                name { full native }
                            }
                        }
                    }
                }
            }
        ",
        "variables": { "id": id }
    });
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let token = optional_token(&app_handle);
    let json = graphql_request(body, token.as_deref(), proxy.as_deref()).await?;
    if json.get("errors").is_some() {
        return Err(format!("{:?}", json["errors"]));
    }
    let edges = json["data"]["Media"]["staff"]["edges"]
        .as_array()
        .ok_or_else(|| "Failed to parse staff".to_string())?;
    Ok(edges
        .iter()
        .map(|e| AniAnimeStaffEdge {
            role: e["role"].as_str().unwrap_or("").to_string(),
            id: e["node"]["id"].as_u64().unwrap_or(0),
            name: e["node"]["name"]["full"]
                .as_str()
                .or_else(|| e["node"]["name"]["native"].as_str())
                .unwrap_or("")
                .to_string(),
        })
        .collect())
}
