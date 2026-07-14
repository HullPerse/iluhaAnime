use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::sync::LazyLock;
use tauri::Manager;

static CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .user_agent("iluhaAnime/1.0")
        .build()
        .expect("reqwest client")
});

#[derive(Debug, Serialize)]
pub struct AniRanking {
    pub rank: i32,
    pub type_: String,
    pub context: String,
}

fn token_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?;
    Ok(dir.join("anilist_token.txt"))
}

fn save_token(app_handle: &tauri::AppHandle, token: &str) -> Result<(), String> {
    let path = token_path(app_handle)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("{e}"))?;
    }
    fs::write(&path, token).map_err(|e| format!("{e}"))
}

fn load_token(app_handle: &tauri::AppHandle) -> Result<String, String> {
    let path = token_path(app_handle)?;
    if !path.exists() {
        return Err("Not authenticated".to_string());
    }
    fs::read_to_string(&path).map_err(|e| format!("{e}"))
}

async fn graphql_request(
    query: serde_json::Value,
    token: Option<&str>,
) -> Result<serde_json::Value, String> {
    let mut builder = CLIENT
        .post("https://graphql.anilist.co")
        .json(&query);
    if let Some(t) = token {
        builder = builder.header("Authorization", format!("Bearer {t}"));
    }
    let resp = builder
        .send()
        .await
        .map_err(|e| format!("AniList request failed: {e}"))?;
    resp.json()
        .await
        .map_err(|e| format!("Failed to parse AniList response: {e}"))
}

#[derive(Debug, Serialize)]
pub struct AniStudio {
    pub id: u64,
    pub name: String,
}

#[derive(Debug, Serialize)]
pub struct AniRelatedMedia {
    pub id: u64,
    pub title: String,
    pub cover_url: Option<String>,
    pub episodes: Option<i32>,
    pub score: Option<i32>,
    pub format: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AniRelation {
    pub relation_type: String,
    pub media: AniRelatedMedia,
}


#[derive(Debug, Serialize)]
pub struct AniMedia {
    pub id: u64,
    pub title: String,
    pub titles: Vec<String>,
    pub episodes: Option<i32>,
    pub duration: Option<i32>,
    pub format: Option<String>,
    pub status: String,
    pub score: Option<i32>,
    pub genres: Vec<String>,
    pub tags: Vec<String>,
    pub description: Option<String>,
    pub cover_url: Option<String>,
    pub season: Option<String>,
    pub season_year: Option<i32>,
    pub studios: Vec<AniStudio>,
    pub next_episode: Option<i32>,
    pub next_airing_at: Option<i64>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub popularity: Option<i32>,
    pub favourites: Option<i32>,
    pub rankings: Vec<AniRanking>,
    pub relations: Vec<AniRelation>,
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
pub struct AniListEntry {
    pub media: AniMedia,
    pub progress: Option<i32>,
    pub score: Option<f64>,
    pub list_status: String,
}



#[derive(Debug, Serialize)]
pub struct AniCharacterNode {
    pub id: u64,
    pub name: String,
    pub native_name: Option<String>,
    pub image: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AniCharacterEdge {
    pub role: String,
    pub character: AniCharacterNode,
}

fn parse_date(d: &serde_json::Value) -> Option<String> {
    let year = d["year"].as_i64()?;
    let month = d["month"].as_i64().unwrap_or(1);
    let day = d["day"].as_i64().unwrap_or(1);
    Some(format!("{}-{:02}-{:02}", year, month, day))
}

fn fmt_desc(s: &str) -> String {
    s.replace("<br>", "\n")
        .replace("<br/>", "\n")
        .replace("<i>", "")
        .replace("</i>", "")
        .replace("<b>", "")
        .replace("</b>", "")
        .replace("<strong>", "")
        .replace("</strong>", "")
        .replace("<em>", "")
        .replace("</em>", "")
}

fn collect_titles(m: &serde_json::Value, main_title: &str) -> Vec<String> {
    let mut titles = Vec::new();
    if let Some(et) = m["title"]["english"].as_str() {
        if et != main_title {
            titles.push(et.to_string());
        }
    }
    if let Some(nt) = m["title"]["native"].as_str() {
        if nt != main_title {
            titles.push(nt.to_string());
        }
    }
    if let Some(syns) = m["synonyms"].as_array() {
        for s in syns {
            if let Some(syn) = s.as_str() {
                if syn != main_title && !titles.contains(&syn.to_string()) {
                    titles.push(syn.to_string());
                }
            }
        }
    }
    titles
}

fn parse_animedia(m: &serde_json::Value) -> AniMedia {
    let main_title = m["title"]["romaji"]
        .as_str()
        .or_else(|| m["title"]["english"].as_str())
        .unwrap_or("Unknown");
    AniMedia {
        id: m["id"].as_u64().unwrap_or(0),
        title: main_title.to_string(),
        titles: collect_titles(m, main_title),
        episodes: m["episodes"].as_i64().map(|n| n as i32),
        duration: m["duration"].as_i64().map(|n| n as i32),
        format: m["format"].as_str().map(String::from),
        status: m["status"].as_str().unwrap_or("UNKNOWN").to_string(),
        score: m["averageScore"].as_i64().map(|n| n as i32),
        genres: m["genres"]
            .as_array()
            .map(|g| {
                g.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default(),
        tags: m["tags"]
            .as_array()
            .map(|t| {
                t.iter()
                    .filter_map(|v| v["name"].as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default(),
        description: m["description"].as_str().map(fmt_desc),
        cover_url: m["coverImage"]["large"]
            .as_str()
            .or_else(|| m["coverImage"]["medium"].as_str())
            .map(String::from),
        season: m["season"].as_str().map(String::from),
        season_year: m["seasonYear"].as_i64().map(|n| n as i32),
        studios: m["studios"]["nodes"]
            .as_array()
            .map(|s| {
                s.iter()
                    .map(|v| AniStudio {
                        id: v["id"].as_u64().unwrap_or(0),
                        name: v["name"].as_str().unwrap_or("").to_string(),
                    })
                    .collect()
            })
            .unwrap_or_default(),
        next_episode: m["nextAiringEpisode"]["episode"].as_i64().map(|n| n as i32),
        next_airing_at: m["nextAiringEpisode"]["airingAt"].as_i64(),
        start_date: parse_date(&m["startDate"]),
        end_date: parse_date(&m["endDate"]),
        popularity: m["popularity"].as_i64().map(|n| n as i32),
        favourites: m["favourites"].as_i64().map(|n| n as i32),
        rankings: m["rankings"]
            .as_array()
            .map(|r| {
                r.iter()
                    .map(|v| AniRanking {
                        rank: v["rank"].as_i64().unwrap_or(0) as i32,
                        type_: v["type"].as_str().unwrap_or("").to_string(),
                        context: v["context"].as_str().unwrap_or("").to_string(),
                    })
                    .collect()
            })
            .unwrap_or_default(),
        relations: m["relations"]["edges"]
                  .as_array()
                  .map(|edges| {
                      edges
                          .iter()
                          .map(|edge| {
                              let rel_type = edge["relationType"]
                                  .as_str()
                                  .unwrap_or("UNKNOWN")
                                  .to_string();
                              let node = &edge["node"];
                              let title = node["title"]["romaji"]
                                  .as_str()
                                  .or_else(|| node["title"]["english"].as_str())
                                  .unwrap_or("Unknown");
                              AniRelation {
                                  relation_type: rel_type,
                                  media: AniRelatedMedia {
                                      id: node["id"].as_u64().unwrap_or(0),
                                      title: title.to_string(),
                                      cover_url: node["coverImage"]["medium"].as_str().map(String::from),
                                      episodes: node["episodes"].as_i64().map(|n| n as i32),
                                      score: node["averageScore"].as_i64().map(|n| n as i32),
                                      format: node["format"].as_str().map(String::from),
                                  },
                              }
                          })
                          .collect()
                  })
                  .unwrap_or_default(),
          }
      }

const MAX_PAGES: u32 = 3;

async fn fetch_page(
    body: serde_json::Value,
    _per_page: u32,
) -> Result<(Vec<AniMedia>, u32), String> {
    let json = graphql_request(body, None).await?;
    let p = &json["data"]["Page"];
    let total = p["pageInfo"]["total"].as_u64().unwrap_or(0) as u32;
    let media = p["media"]
        .as_array()
        .map(|a| a.iter().map(parse_animedia).collect())
        .unwrap_or_default();
    Ok((media, total))
}

async fn fetch_paginated(
    base_query: &str,
    variables: serde_json::Value,
    max_pages: u32,
    per_page: u32,
) -> Result<Vec<AniMedia>, String> {
    let mut vars = variables.clone();
    vars["perPage"] = serde_json::json!(per_page);

    let (mut all, total) = fetch_page(serde_json::json!({
        "query": base_query,
        "variables": vars,
    }), per_page)
    .await?;

    let pages = ((total + per_page - 1) / per_page).min(max_pages);

    for page in 2..=pages {
        vars["page"] = serde_json::json!(page);
        if let Ok((media, _)) = fetch_page(serde_json::json!({
            "query": base_query,
            "variables": vars,
        }), per_page)
        .await
        {
            all.extend(media);
        }
    }

    Ok(all)
}

#[tauri::command]
pub async fn search_anilist(
    query: Option<String>,
    tags: Option<Vec<String>>,
    genres: Option<Vec<String>>,
    format: Option<String>,
    status: Option<String>,
    season: Option<String>,
    season_year: Option<i32>,
    adult: Option<bool>,
    sort: Option<Vec<String>>,
    source: Option<String>,
    country: Option<String>,
    year_from: Option<i32>,
    year_to: Option<i32>,
    episodes_from: Option<i32>,
    episodes_to: Option<i32>,
    score_from: Option<i32>,
    score_to: Option<i32>,
    max_pages: Option<u32>,
    per_page: Option<u32>,
) -> Result<Vec<AniMedia>, String> {
    let mut variables = serde_json::json!({ "page": 1 });

    if let Some(q) = query.as_ref().filter(|q| !q.is_empty()) {
        variables["search"] = serde_json::json!(q);
    }

    if let Some(t) = tags.as_ref().filter(|t| !t.is_empty()) {
        variables["tag_in"] = serde_json::json!(t);
    }

    if let Some(g) = genres.as_ref().filter(|g| !g.is_empty()) {
        variables["genre_in"] = serde_json::json!(g);
    }

    if let Some(f) = format.as_ref() {
        variables["format"] = serde_json::json!(f);
    }

    if let Some(s) = status.as_ref() {
        variables["status"] = serde_json::json!(s);
    }

    if let Some(s) = season.as_ref() {
        variables["season"] = serde_json::json!(s);
    }

    if let Some(y) = season_year {
        variables["seasonYear"] = serde_json::json!(y);
    }

    if let Some(a) = adult {
        variables["isAdult"] = serde_json::json!(a);
    }

    if let Some(s) = sort.as_ref().filter(|s| !s.is_empty()) {
        variables["sort"] = serde_json::json!(s);
    }

    if let Some(s) = source.as_ref() {
        variables["source"] = serde_json::json!(s);
    }

    if let Some(c) = country.as_ref() {
        variables["countryOfOrigin"] = serde_json::json!(c);
    }

    if let Some(y) = year_from {
        variables["startDate_greater"] = serde_json::json!(y * 10000);
    }

    if let Some(y) = year_to {
        variables["startDate_lesser"] = serde_json::json!(y * 10000 + 1231);
    }

    if let Some(e) = episodes_from {
        variables["episodes_greater"] = serde_json::json!(e);
    }

    if let Some(e) = episodes_to {
        variables["episodes_lesser"] = serde_json::json!(e);
    }

    if let Some(s) = score_from {
        variables["averageScore_greater"] = serde_json::json!(s);
    }

    if let Some(s) = score_to {
        variables["averageScore_lesser"] = serde_json::json!(s);
    }

    let mp = max_pages.unwrap_or(3);
    let pp = per_page.unwrap_or(20);

    variables["perPage"] = serde_json::json!(pp);

    let gql = r#"
        query (
            $page: Int,
            $perPage: Int,
            $search: String,
            $tag_in: [String],
            $genre_in: [String],
            $format: MediaFormat,
            $status: MediaStatus,
            $season: MediaSeason,
            $seasonYear: Int,
            $isAdult: Boolean,
            $sort: [MediaSort],
            $source: MediaSource,
            $countryOfOrigin: CountryCode,
            $startDate_greater: FuzzyDateInt,
            $startDate_lesser: FuzzyDateInt,
            $episodes_greater: Int,
            $episodes_lesser: Int,
            $averageScore_greater: Int,
            $averageScore_lesser: Int
        ) {
            Page(page: $page, perPage: $perPage) {
                pageInfo { total }
                media(
                    search: $search
                    type: ANIME
                    tag_in: $tag_in
                    genre_in: $genre_in
                    format: $format
                    status: $status
                    season: $season
                    seasonYear: $seasonYear
                    isAdult: $isAdult
                    sort: $sort
                    source: $source
                    countryOfOrigin: $countryOfOrigin
                    startDate_greater: $startDate_greater
                    startDate_lesser: $startDate_lesser
                    episodes_greater: $episodes_greater
                    episodes_lesser: $episodes_lesser
                    averageScore_greater: $averageScore_greater
                    averageScore_lesser: $averageScore_lesser
                ) {
                    id
                    title { romaji english native }
                    episodes
                    duration
                    status
                    averageScore
                    genres
                    tags { name }
                    description(asHtml: false)
                    coverImage { medium large }
                    season
                    seasonYear
                    studios { nodes { id name } }
                    nextAiringEpisode { episode airingAt }
                }
            }
        }
    "#;

    fetch_paginated(gql, variables, mp, pp).await
}

#[tauri::command]
pub async fn search_anilist_by_tag(tag: String) -> Result<Vec<AniMedia>, String> {
    fetch_paginated(
        r#"
            query ($tag: String, $page: Int) {
                Page(page: $page, perPage: 20) {
                    pageInfo { total }
                    media(type: ANIME, tag_in: [$tag]) {
                        id
                        title { romaji english native }
                        episodes, duration, status, averageScore
                        genres, tags { name }
                        description(asHtml: false)
                        coverImage { medium large }
                        season, seasonYear
                        studios { nodes { id name } }
                        nextAiringEpisode { episode airingAt }
                    }
                }
            }
        "#,
        serde_json::json!({ "tag": tag, "page": 1, "perPage": 20 }),
        MAX_PAGES,
        20,
    )
    .await
}

#[tauri::command]
pub async fn search_anilist_by_genre(genre: String) -> Result<Vec<AniMedia>, String> {
    fetch_paginated(
        r#"
            query ($genre: String, $page: Int) {
                Page(page: $page, perPage: 20) {
                    pageInfo { total }
                    media(type: ANIME, genre_in: [$genre]) {
                        id
                        title { romaji english native }
                        episodes, duration, status, averageScore
                        genres, tags { name }
                        description(asHtml: false)
                        coverImage { medium large }
                        season, seasonYear
                        studios { nodes { id name } }
                        nextAiringEpisode { episode airingAt }
                    }
                }
            }
        "#,
        serde_json::json!({ "genre": genre, "page": 1, "perPage": 20 }),
        MAX_PAGES,
        20,
    )
    .await
}

#[tauri::command]
pub async fn search_anilist_by_studio(studio_id: u64) -> Result<Vec<AniMedia>, String> {
    let body = serde_json::json!({
        "query": r#"
            query ($id: Int) {
                Studio(id: $id) {
                    media(page: 1, perPage: 50) {
                        nodes {
                            id
                            title { romaji english native }
                            episodes, duration, status, averageScore
                            genres, tags { name }
                            description (asHtml: false)
                            coverImage { medium large }
                            season, seasonYear
                            studios { nodes { id name } }
                            nextAiringEpisode { episode airingAt }
                        }
                    }
                }
            }
        "#,
        "variables": { "id": studio_id }
    });
    let json = graphql_request(body, None).await?;
    if json.get("errors").is_some() {
        return Err(format!("{:?}", json["errors"]));
    }
    let studio = &json["data"]["Studio"];
    if studio.is_null() {
        return Err("Studio not found".to_string());
    }
    let nodes = studio["media"]["nodes"]
        .as_array()
        .ok_or_else(|| "Studio has no media field".to_string())?;
    Ok(nodes.iter().map(parse_animedia).collect())
}

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
                romaji: n["title"]["romaji"]
                    .as_str()
                    .unwrap_or("")
                    .to_string(),
                english: n["title"]["english"].as_str().map(String::from),
            },
            cover_image: n["coverImage"]["medium"].as_str().map(|s| {
                AniImage {
                    medium: Some(s.to_string()),
                }
            }),
            mean_score: n["meanScore"].as_f64(),
            format: n["format"].as_str().map(String::from),
        })
        .collect()
}

#[tauri::command]
pub async fn toggle_favourite(
    app_handle: tauri::AppHandle,
    anime_id: i64,
) -> Result<Vec<FavouriteAnime>, String> {
    let token = load_token(&app_handle)?;
    let body = serde_json::json!({
        "query": r#"
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
        "#,
        "variables": { "animeId": anime_id }
    });
    let json = graphql_request(body, Some(&token)).await?;
    if json.get("errors").is_some() {
        return Err(format!("{:?}", json["errors"]));
    }
    let nodes = json["data"]["ToggleFavourite"]["anime"]["nodes"]
        .as_array()
        .ok_or_else(|| "Unexpected response".to_string())?;
    Ok(parse_favourite_nodes(nodes))
}

#[tauri::command]
pub async fn get_favourites(
    app_handle: tauri::AppHandle,
    user_id: i64,
) -> Result<Vec<FavouriteAnime>, String> {
    let token = load_token(&app_handle)?;
    let body = serde_json::json!({
        "query": r#"
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
        "#,
        "variables": { "userId": user_id }
    });
    let json = graphql_request(body, Some(&token)).await?;
    if json.get("errors").is_some() {
        return Err(format!("{:?}", json["errors"]));
    }
    let nodes = json["data"]["User"]["favourites"]["anime"]["nodes"]
        .as_array()
        .ok_or_else(|| "Unexpected response".to_string())?;
    Ok(parse_favourite_nodes(nodes))
}

#[tauri::command]
pub async fn get_profile_recommendations(
    app_handle: tauri::AppHandle,
    user_id: u64,
) -> Result<Vec<AniRecommendation>, String> {
    let token = load_token(&app_handle)?;

    let list_body = serde_json::json!({
        "query": r#"
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
        "#,
        "variables": { "userId": user_id }
    });
    let list_json = graphql_request(list_body, Some(&token)).await?;
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
        "query": r#"
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
        "#,
        "variables": { "ids": top_ids }
    });
    let rec_json = graphql_request(rec_body, Some(&token)).await?;

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
pub async fn get_anime_by_id(id: u64) -> Result<AniMedia, String> {
    let body = serde_json::json!({
        "query": r#"
            query ($id: Int) {
                Media(id: $id, type: ANIME) {
                    id
                    title { romaji english native }
                    synonyms
                    episodes, duration, status, averageScore, format
                    genres, tags { name }
                    description (asHtml: false)
                    coverImage { medium large }
                    season, seasonYear, popularity, favourites
                    startDate { year month day }
                    endDate { year month day }
                    studios { nodes { id name } }
                    rankings { rank type context }
                    relations { edges { relationType node { id title { romaji english } coverImage { medium } episodes averageScore format } } }
                    nextAiringEpisode { episode airingAt }
                }
            }
        "#,
        "variables": { "id": id }
    });
    let json = graphql_request(body, None).await?;
    let m = &json["data"]["Media"];
    Ok(parse_animedia(m))
}

#[tauri::command]
pub async fn anilist_login(app_handle: tauri::AppHandle, token: String) -> Result<AniUser, String> {
    let body = serde_json::json!({
        "query": r#"
            query {
                Viewer {
                    id, name, avatar { medium }
                    statistics {
                        anime { count episodesWatched meanScore }
                    }
                }
            }
        "#
    });
    let json = graphql_request(body, Some(&token)).await?;
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
pub async fn check_anilist_auth(app_handle: tauri::AppHandle) -> Result<Option<AniUser>, String> {
    let token = match load_token(&app_handle) {
        Ok(t) => t,
        Err(_) => return Ok(None),
    };
    let body = serde_json::json!({
        "query": r#"
            query {
                Viewer {
                    id, name, avatar { medium }
                    statistics {
                        anime { count episodesWatched meanScore }
                    }
                }
            }
        "#
    });
    let json = match graphql_request(body, Some(&token)).await {
        Ok(j) => j,
        Err(_) => return Ok(None),
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
pub async fn get_anilist_lists(
    app_handle: tauri::AppHandle,
    user_id: u64,
) -> Result<Vec<AniListCollection>, String> {
    let token = load_token(&app_handle)?;
    let body = serde_json::json!({
        "query": r#"
            query ($userId: Int) {
                MediaListCollection(userId: $userId, type: ANIME) {
                    lists {
                        name
                        entries {
                            progress
                            score
                            status
                            media {
                                id
                                title { romaji english native }
                                episodes, averageScore
                                coverImage { medium }
                                status
                                nextAiringEpisode { episode airingAt }
                            }
                        }
                    }
                }
            }
        "#,
        "variables": { "userId": user_id }
    });
    let json = graphql_request(body, Some(&token)).await?;
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
                                    genres: vec![],
                                    tags: vec![],
                                    description: None,
                                    cover_url: m["coverImage"]["medium"].as_str().map(String::from),
                                    season: None,
                                    season_year: None,
                                    studios: vec![],
                                    next_episode: m["nextAiringEpisode"]["episode"].as_i64().map(|n| n as i32),
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
    let path = token_path(&app_handle)?;
    let _ = fs::remove_file(&path);
    Ok(())
}

#[tauri::command]
pub async fn save_anilist_entry(
    app_handle: tauri::AppHandle,
    media_id: u64,
    status: String,
    progress: Option<i32>,
    score: Option<f64>,
) -> Result<(), String> {
    let token = load_token(&app_handle)?;
    let body = serde_json::json!({
        "query": r#"
            mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int, $score: Float) {
                SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress, score: $score) {
                    id
                    status
                    progress
                }
            }
        "#,
        "variables": {
            "mediaId": media_id as i64,
            "status": status,
            "progress": progress,
            "score": score
        }
    });
    let json = graphql_request(body, Some(&token)).await?;
    if json.get("errors").is_some() {
        return Err(format!("{:?}", json["errors"]));
    }
    Ok(())
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

#[tauri::command]
pub async fn get_anilist_activity(user_ids: Vec<u64>) -> Result<Vec<AniActivity>, String> {
    let body = serde_json::json!({
        "query": r#"
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
        "#,
        "variables": { "userIds": user_ids, "page": 1 }
    });
    let json = graphql_request(body, None).await?;
    if json.get("errors").is_some() {
        return Err(format!("{:?}", json["errors"]));
    }
    let activities = json["data"]["Page"]["activities"]
        .as_array()
        .ok_or_else(|| "Failed to parse activities".to_string())?;
    Ok(activities.iter().filter_map(|a| {
        let user = &a["user"];
        let a_type = if a["status"].is_string() { "list" } else { "text" };
        if a_type == "list" && a["media"]["type"].as_str() != Some("ANIME") {
            return None;
        }
        Some(AniActivity {
            id: a["id"].as_u64().unwrap_or(0),
            created_at: a["createdAt"].as_i64().unwrap_or(0),
            activity_type: a_type.to_string(),
            status: a["status"].as_str().map(String::from),
            progress: a["progress"].as_str().map(String::from),
            text: a["text"].as_str().map(String::from),
            media_id: a["media"]["id"].as_u64(),
            media_title: a["media"]["title"]["romaji"].as_str().or_else(|| a["media"]["title"]["english"].as_str()).map(String::from),
            media_cover: a["media"]["coverImage"]["medium"].as_str().map(String::from),
            user_id: user["id"].as_u64().unwrap_or(0),
            user_name: user["name"].as_str().unwrap_or("").to_string(),
            user_avatar: user["avatar"]["medium"].as_str().map(String::from),
        })
    }).collect())
}

#[tauri::command]
pub async fn get_anime_characters(id: u64, page: u64) -> Result<Vec<AniCharacterEdge>, String> {
    let body = serde_json::json!({
        "query": r#"
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
                        }
                    }
                }
            }
        "#,
        "variables": { "id": id, "page": page }
    });
    let json = graphql_request(body, None).await?;
    if json.get("errors").is_some() {
        return Err(format!("{:?}", json["errors"]));
    }
    let edges = json["data"]["Media"]["characters"]["edges"]
        .as_array()
        .ok_or_else(|| "Failed to parse characters".to_string())?;
    Ok(edges.iter().map(|e| AniCharacterEdge {
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
    }).collect())
}
