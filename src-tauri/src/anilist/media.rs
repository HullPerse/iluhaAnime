#![allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    clippy::cast_possible_wrap
)]

use serde::Serialize;

use super::auth::optional_token;
use super::client::{graphql_request, resolve_proxy};

#[derive(Debug, Serialize)]
pub struct AniRanking {
    pub rank: i32,
    #[serde(rename = "type")]
    pub type_: String,
    pub context: String,
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
    pub media_type: Option<String>,
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
    pub banner_image: Option<String>,
    pub id_mal: Option<i64>,
    pub trailer_youtube_id: Option<String>,
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
pub struct AniListEntry {
    pub media: AniMedia,
    pub progress: Option<i32>,
    pub score: Option<f64>,
    pub list_status: String,
    pub created_at: Option<i64>,
    pub completed_at: Option<String>,
    pub updated_at: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct AniCharacterNode {
    pub id: u64,
    pub name: String,
    pub native_name: Option<String>,
    pub image: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AniVoiceActor {
    pub id: u64,
    pub name: String,
    pub native_name: Option<String>,
    pub image: Option<String>,
    pub language: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AniCharacterEdge {
    pub role: String,
    pub character: AniCharacterNode,
    pub voice_actors: Vec<AniVoiceActor>,
}

#[derive(Debug, Serialize)]
pub struct AniCharacterMediaEdge {
    pub id: u64,
    pub title: String,
    pub cover_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AniStaffCharacterEdge {
    pub id: u64,
    pub name: String,
    pub image: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AniStaffMediaEdge {
    pub id: u64,
    pub title: String,
    pub cover_url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AniAnimeStaffEdge {
    pub role: String,
    pub id: u64,
    pub name: String,
}

#[derive(Debug, Serialize)]
pub struct AniStaffDetail {
    pub id: u64,
    pub name: String,
    pub image: Option<String>,
    pub characters: Vec<AniStaffCharacterEdge>,
    pub media: Vec<AniStaffMediaEdge>,
}

pub fn parse_date(d: &serde_json::Value) -> Option<String> {
    let year = d["year"].as_i64()?;
    let month = d["month"].as_i64().unwrap_or(1);
    let day = d["day"].as_i64().unwrap_or(1);
    Some(format!("{year}-{month:02}-{day:02}"))
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

pub fn collect_titles(m: &serde_json::Value, main_title: &str) -> Vec<String> {
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

pub fn parse_animedia(m: &serde_json::Value) -> AniMedia {
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
        banner_image: m["bannerImage"].as_str().map(String::from),
        id_mal: m["idMal"].as_i64(),
        trailer_youtube_id: m["trailer"]
            .get("site")
            .and_then(|s| s.as_str())
            .filter(|s| *s == "youtube")
            .and_then(|_| {
                m["trailer"]["id"]
                    .as_str()
                    .filter(|id| !id.is_empty())
                    .map(String::from)
            }),
        season: m["season"].as_str().map(String::from),
        season_year: m["seasonYear"]
            .as_i64()
            .map(|n| n as i32)
            .or_else(|| m["startDate"]["year"].as_i64().map(|n| n as i32)),
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
                                media_type: node["type"].as_str().map(String::from),
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
    token: Option<&str>,
    proxy: Option<&str>,
) -> Result<(Vec<AniMedia>, u32), String> {
    let json = graphql_request(body, token, proxy).await?;
    let p = &json["data"]["Page"];
    let total = p["pageInfo"]["total"].as_u64().unwrap_or(0) as u32;
    let media = p["media"]
        .as_array()
        .map(|a| a.iter().map(parse_animedia).collect())
        .unwrap_or_default();
    Ok((media, total))
}

async fn fetch_paginated_with<F, Fut>(
    base_query: &str,
    variables: serde_json::Value,
    max_pages: u32,
    per_page: u32,
    mut request_page: F,
) -> Result<Vec<AniMedia>, String>
where
    F: FnMut(serde_json::Value, u32) -> Fut,
    Fut: std::future::Future<Output = Result<(Vec<AniMedia>, u32), String>>,
{
    let mut vars = variables.clone();
    vars["perPage"] = serde_json::json!(per_page);

    let (mut all, total) = request_page(
        serde_json::json!({
            "query": base_query,
            "variables": vars,
        }),
        per_page,
    )
    .await?;

    let pages = total.div_ceil(per_page).min(max_pages);

    for page in 2..=pages {
        vars["page"] = serde_json::json!(page);
        let (media, _) = request_page(
            serde_json::json!({
                "query": base_query,
                "variables": vars,
            }),
            per_page,
        )
        .await?;
        all.extend(media);
    }

    Ok(all)
}

async fn fetch_paginated(
    base_query: &str,
    variables: serde_json::Value,
    max_pages: u32,
    per_page: u32,
    token: Option<&str>,
    proxy: Option<&str>,
) -> Result<Vec<AniMedia>, String> {
    let proxy = proxy.map(str::to_string);
    let token = token.map(str::to_string);
    fetch_paginated_with(
        base_query,
        variables,
        max_pages,
        per_page,
        move |body, per_page| {
            let proxy = proxy.clone();
            let token = token.clone();
            async move { fetch_page(body, per_page, token.as_deref(), proxy.as_deref()).await }
        },
    )
    .await
}
const SEARCH_MEDIA_GQL: &str = r"
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
                synonyms
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
";

fn clamp_filter_paging(page: u32, per_page: Option<u32>) -> (u32, u32) {
    (page.clamp(1, 10_000), per_page.unwrap_or(50).clamp(1, 50))
}

#[allow(clippy::too_many_arguments)]
fn filter_search_variables(
    query: &Option<String>,
    tags: &Option<Vec<String>>,
    genres: &Option<Vec<String>>,
    format: &Option<String>,
    status: &Option<String>,
    season: &Option<String>,
    season_year: Option<i32>,
    adult: Option<bool>,
    sort: &Option<Vec<String>>,
    source: &Option<String>,
    country: &Option<String>,
    year_from: Option<i32>,
    year_to: Option<i32>,
    episodes_from: Option<i32>,
    episodes_to: Option<i32>,
    score_from: Option<i32>,
    score_to: Option<i32>,
) -> serde_json::Value {
    let mut variables = serde_json::json!({});

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

    variables
}
#[allow(clippy::too_many_arguments)]
#[tauri::command]
#[allow(non_snake_case)]
pub async fn search_anilist(
    app_handle: tauri::AppHandle,
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
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<AniMedia>, String> {
    let mut variables = filter_search_variables(
        &query,
        &tags,
        &genres,
        &format,
        &status,
        &season,
        season_year,
        adult,
        &sort,
        &source,
        &country,
        year_from,
        year_to,
        episodes_from,
        episodes_to,
        score_from,
        score_to,
    );
    variables["page"] = serde_json::json!(1);

    let mp = max_pages.unwrap_or(3).clamp(1, 20);
    let pp = per_page.unwrap_or(20).clamp(1, 50);

    variables["perPage"] = serde_json::json!(pp);

    let gql = SEARCH_MEDIA_GQL;

    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let token = optional_token(&app_handle);
    fetch_paginated(gql, variables, mp, pp, token.as_deref(), proxy.as_deref()).await
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotlightPage {
    pub media: Vec<AniMedia>,
    pub total: u32,
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_spotlight_page(
    app_handle: tauri::AppHandle,
    page: u32,
    per_page: u32,
    score_from: i32,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<SpotlightPage, String> {
    let page = page.clamp(1, 10_000);
    let per_page = per_page.clamp(1, 50);
    let score = score_from.clamp(0, 100);
    let variables = serde_json::json!({
        "page": page,
        "perPage": per_page,
        "averageScore_greater": score,
        "isAdult": false,
    });
    let gql = r"
        query (
            $page: Int,
            $perPage: Int,
            $averageScore_greater: Int,
            $isAdult: Boolean
        ) {
            Page(page: $page, perPage: $perPage) {
                pageInfo { total }
                media(
                    type: ANIME
                    averageScore_greater: $averageScore_greater
                    isAdult: $isAdult
                ) {
                    id
                    title { romaji english native }
                    synonyms
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
    ";
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let token = optional_token(&app_handle);
    let (media, total) = fetch_page(
        serde_json::json!({ "query": gql, "variables": variables }),
        per_page,
        token.as_deref(),
        proxy.as_deref(),
    )
    .await?;
    Ok(SpotlightPage { media, total })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterPage {
    pub media: Vec<AniMedia>,
    pub total: u32,
}

#[tauri::command]
#[allow(non_snake_case)]
#[allow(clippy::too_many_arguments)]
pub async fn get_anilist_filter_page(
    app_handle: tauri::AppHandle,
    page: u32,
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
    per_page: Option<u32>,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<FilterPage, String> {
    let mut variables = filter_search_variables(
        &query,
        &tags,
        &genres,
        &format,
        &status,
        &season,
        season_year,
        adult,
        &sort,
        &source,
        &country,
        year_from,
        year_to,
        episodes_from,
        episodes_to,
        score_from,
        score_to,
    );
    let (page, pp) = clamp_filter_paging(page, per_page);
    variables["page"] = serde_json::json!(page);
    variables["perPage"] = serde_json::json!(pp);
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let token = optional_token(&app_handle);
    let (media, total) = fetch_page(
        serde_json::json!({ "query": SEARCH_MEDIA_GQL, "variables": variables }),
        pp,
        token.as_deref(),
        proxy.as_deref(),
    )
    .await?;
    Ok(FilterPage { media, total })
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn search_anilist_by_tag(
    app_handle: tauri::AppHandle,
    tag: String,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<AniMedia>, String> {
    let token = optional_token(&app_handle);
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    fetch_paginated(
        r"
            query ($tag: String, $page: Int) {
                Page(page: $page, perPage: 20) {
                    pageInfo { total }
                    media(type: ANIME, tag_in: [$tag]) {
                        id
                        title { romaji english native }
                        synonyms
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
        ",
        serde_json::json!({ "tag": tag, "page": 1, "perPage": 20 }),
        MAX_PAGES,
        20,
        token.as_deref(),
        proxy.as_deref(),
    )
    .await
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn search_anilist_by_genre(
    app_handle: tauri::AppHandle,
    genre: String,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<AniMedia>, String> {
    let token = optional_token(&app_handle);
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    fetch_paginated(
        r"
            query ($genre: String, $page: Int) {
                Page(page: $page, perPage: 20) {
                    pageInfo { total }
                    media(type: ANIME, genre_in: [$genre]) {
                        id
                        title { romaji english native }
                        synonyms
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
        ",
        serde_json::json!({ "genre": genre, "page": 1, "perPage": 20 }),
        MAX_PAGES,
        20,
        token.as_deref(),
        proxy.as_deref(),
    )
    .await
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn search_anilist_by_studio(
    app_handle: tauri::AppHandle,
    studio_id: u64,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<AniMedia>, String> {
    let body = serde_json::json!({
        "query": r"
            query ($id: Int) {
                Studio(id: $id) {
                    media(page: 1, perPage: 50) {
                        nodes {
                            id
                            title { romaji english native }
                            synonyms
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
        ",
        "variables": { "id": studio_id }
    });
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let token = optional_token(&app_handle);
    let json = graphql_request(body, token.as_deref(), proxy.as_deref()).await?;
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
#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_anime_by_id(
    app_handle: tauri::AppHandle,
    id: u64,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<AniMedia, String> {
    let body = serde_json::json!({
        "query": r"
            query ($id: Int) {
                Media(id: $id, type: ANIME) {
                    id
                    title { romaji english native }
                    synonyms
                    episodes, duration, status, averageScore, format, type
                    genres, tags { name }
                    description (asHtml: false)
                    coverImage { medium large }
                    bannerImage
                    idMal
                    trailer { id site }
                    seasonYear
                    startDate { year month day }
                    endDate { year month day }
                    studios { nodes { id name } }
                    rankings { rank type context }
                    relations { edges { relationType node { id title { romaji english } coverImage { medium } episodes averageScore format type } } }
                    nextAiringEpisode { episode airingAt }
                }
            }
        ",
        "variables": { "id": id }
    });
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let token = optional_token(&app_handle);
    let json = graphql_request(body, token.as_deref(), proxy.as_deref()).await?;
    let m = &json["data"]["Media"];
    if m.is_null() {
        return Err(format!("Anime with id {id} not found"));
    }
    Ok(parse_animedia(m))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn paginated_request_count_is_one_for_empty_results() {
        let mut pages = Vec::new();
        let result = fetch_paginated_with(
            "query { Page { media { id } } }",
            serde_json::json!({ "page": 1 }),
            3,
            20,
            |body, _| {
                pages.push(body["variables"]["page"].as_u64().unwrap());
                async { Ok((Vec::new(), 0)) }
            },
        )
        .await
        .unwrap();

        assert!(result.is_empty());
        assert_eq!(pages, vec![1]);
    }

    #[tokio::test]
    async fn paginated_request_count_is_capped_by_max_pages() {
        let mut pages = Vec::new();
        let result = fetch_paginated_with(
            "query { Page { media { id } } }",
            serde_json::json!({ "page": 1 }),
            3,
            20,
            |body, _| {
                pages.push(body["variables"]["page"].as_u64().unwrap());
                async { Ok((Vec::new(), 100)) }
            },
        )
        .await
        .unwrap();

        assert!(result.is_empty());
        assert_eq!(pages, vec![1, 2, 3]);
    }

    #[tokio::test]
    async fn paginated_request_count_stops_after_a_failed_page() {
        let mut request_count = 0;
        let error = fetch_paginated_with(
            "query { Page { media { id } } }",
            serde_json::json!({ "page": 1 }),
            3,
            20,
            |_, _| {
                request_count += 1;
                let result = if request_count == 2 {
                    Err("fixture failure".to_string())
                } else {
                    Ok((Vec::new(), 60))
                };
                async move { result }
            },
        )
        .await
        .unwrap_err();

        assert_eq!(request_count, 2);
        assert_eq!(error, "fixture failure");
    }

    #[test]
    fn parses_gallery_fields() {
        let m = serde_json::json!({
            "id": 21,
            "title": { "romaji": "One Piece" },
            "status": "RELEASING",
            "coverImage": { "large": "https://img/large.jpg" },
            "bannerImage": "https://img/banner.jpg",
            "idMal": 21,
            "trailer": { "id": "abc123", "site": "youtube" },
        });
        let media = parse_animedia(&m);
        assert_eq!(media.id_mal, Some(21));
        assert_eq!(media.trailer_youtube_id.as_deref(), Some("abc123"));
    }

    #[test]
    fn ignores_non_youtube_trailers() {
        let m = serde_json::json!({
            "id": 1,
            "title": { "romaji": "X" },
            "status": "FINISHED",
            "trailer": { "id": "abc123", "site": "dailymotion" },
        });
        assert_eq!(parse_animedia(&m).trailer_youtube_id, None);
    }

    #[test]
    fn prefers_season_year_over_start_date() {
        let m = serde_json::json!({
            "id": 1,
            "seasonYear": 2023,
            "startDate": { "year": 2022 },
        });
        assert_eq!(parse_animedia(&m).season_year, Some(2023));
    }

    #[test]
    fn falls_back_to_start_date_year() {
        let m = serde_json::json!({
            "id": 1,
            "startDate": { "year": 2022 },
        });
        assert_eq!(parse_animedia(&m).season_year, Some(2022));
    }

    #[derive(Default)]
    struct FilterArgs {
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
    }

    impl FilterArgs {
        fn build(&self) -> serde_json::Value {
            filter_search_variables(
                &self.query,
                &self.tags,
                &self.genres,
                &self.format,
                &self.status,
                &self.season,
                self.season_year,
                self.adult,
                &self.sort,
                &self.source,
                &self.country,
                self.year_from,
                self.year_to,
                self.episodes_from,
                self.episodes_to,
                self.score_from,
                self.score_to,
            )
        }
    }

    #[test]
    fn filter_variables_omit_empty_filters() {
        let v = FilterArgs::default().build();
        assert!(v.get("search").is_none());
        assert!(v.get("tag_in").is_none());
        assert!(v.get("genre_in").is_none());
        assert!(v.get("isAdult").is_none());
        assert!(v.get("page").is_none());
    }

    #[test]
    fn filter_variables_map_ranges_and_flags() {
        let v = FilterArgs {
            tags: Some(vec![]),
            genres: Some(vec!["Action".to_string()]),
            adult: Some(true),
            year_from: Some(2000),
            year_to: Some(2010),
            score_from: Some(70),
            ..Default::default()
        }
        .build();
        assert!(v.get("tag_in").is_none());
        assert_eq!(v["genre_in"], serde_json::json!(["Action"]));
        assert_eq!(v["isAdult"], serde_json::json!(true));
        assert_eq!(v["startDate_greater"], serde_json::json!(2000 * 10000));
        assert_eq!(
            v["startDate_lesser"],
            serde_json::json!(2010 * 10000 + 1231)
        );
        assert_eq!(v["averageScore_greater"], serde_json::json!(70));
        assert!(v.get("averageScore_lesser").is_none());
    }

    #[test]
    fn clamp_filter_paging_bounds_page_and_size() {
        assert_eq!(clamp_filter_paging(3, Some(25)), (3, 25));
        assert_eq!(clamp_filter_paging(1, None), (1, 50));
        assert_eq!(clamp_filter_paging(0, Some(0)), (1, 1));
        assert_eq!(clamp_filter_paging(99_999, Some(500)), (10_000, 50));
    }
}
