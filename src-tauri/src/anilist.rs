#![allow(clippy::cast_possible_truncation, clippy::cast_sign_loss, clippy::cast_possible_wrap)]

use serde::{Deserialize, Serialize};
use std::cmp::Reverse;
use std::collections::{BinaryHeap, HashMap, HashSet, VecDeque};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tokio_util::sync::CancellationToken;

use crate::app_db;
use crate::auth::{delete_secret, load_secret, save_secret};

static CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .user_agent("iluhaAnime/1.0")
        .build()
        .expect("failed to build reqwest client")
});

const RATE_LIMIT_PER_MIN: usize = 85;
static RATE_LOG: LazyLock<Mutex<VecDeque<Instant>>> = LazyLock::new(|| Mutex::new(VecDeque::new()));
static RATE_LIMIT_ADAPTIVE: AtomicUsize = AtomicUsize::new(RATE_LIMIT_PER_MIN);

fn update_rate_limit(header: Option<&str>) {
    let Some(limit) = header.and_then(|v| v.parse::<usize>().ok()) else {
        return;
    };
    if (10..=90).contains(&limit) {
        // Keep a small reserve below AniList's advertised 90/minute ceiling.
        RATE_LIMIT_ADAPTIVE.store(limit.min(RATE_LIMIT_PER_MIN), Ordering::Relaxed);
    }
}

fn rate_limit_per_min() -> usize {
    RATE_LIMIT_ADAPTIVE.load(Ordering::Relaxed)
}

async fn acquire_request_slot() {
    loop {
        let now = Instant::now();
        {
            let mut log = RATE_LOG.lock().unwrap();
            while let Some(&t) = log.front() {
                if now.duration_since(t) >= Duration::from_secs(60) {
                    log.pop_front();
                } else {
                    break;
                }
            }
            if log.len() < rate_limit_per_min() {
                log.push_back(now);
                return;
            }
        }
        tokio::time::sleep(Duration::from_millis(600)).await;
    }
}

#[derive(Debug, Serialize)]
pub struct AniRanking {
    pub rank: i32,
    pub type_: String,
    pub context: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedFranchiseNode {
    pub node: FranchiseNode,
    pub targets: Vec<(u64, String, Option<String>, Option<i32>)>,
    pub fetched_at: i64,
}

const FRANCHISE_CACHE_TTL_SECS: i64 = 7 * 24 * 60 * 60;
static FRANCHISE_CACHE: LazyLock<Mutex<HashMap<u64, CachedFranchiseNode>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static FRANCHISE_CACHE_LOADED: AtomicBool = AtomicBool::new(false);
static PREFETCH_RUNNING: AtomicBool = AtomicBool::new(false);
static PREFETCH_CANCEL: LazyLock<Mutex<CancellationToken>> =
    LazyLock::new(|| Mutex::new(CancellationToken::new()));

fn reset_prefetch_cancel() -> CancellationToken {
    let token = CancellationToken::new();
    if let Ok(mut current) = PREFETCH_CANCEL.lock() {
        *current = token.clone();
    }
    token
}

fn franchise_db_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?;
    Ok(dir.join("franchise_relations_cache.sqlite3"))
}

pub fn clear_franchise_cache_memory() {
    if let Ok(mut cache) = FRANCHISE_CACHE.lock() {
        cache.clear();
    }
    FRANCHISE_CACHE_LOADED.store(false, Ordering::Relaxed);
}

fn open_franchise_db(app_handle: &AppHandle) -> Result<rusqlite::Connection, String> {
    let path = franchise_db_path(app_handle)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("{e}"))?;
    }
    let conn = rusqlite::Connection::open(&path).map_err(|e| format!("open db: {e}"))?;
    conn.busy_timeout(Duration::from_secs(5))
        .map_err(|e| format!("busy timeout: {e}"))?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("journal mode: {e}"))?;
    // This database is a rebuildable cache. NORMAL keeps WAL durable while
    // avoiding a full fsync for every cache write.
    conn.pragma_update(None, "synchronous", "NORMAL")
        .map_err(|e| format!("synchronous: {e}"))?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS franchise_nodes (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            cover_url TEXT,
            episodes INTEGER,
            score INTEGER,
            format TEXT,
            media_type TEXT,
            year INTEGER,
            targets_json TEXT NOT NULL,
            fetched_at INTEGER NOT NULL
        );",
    )
    .map_err(|e| format!("schema: {e}"))?;
    Ok(conn)
}

fn load_franchise_cache(app_handle: &AppHandle) {
    if FRANCHISE_CACHE_LOADED.load(Ordering::Relaxed) {
        return;
    }
    let Ok(conn) = open_franchise_db(app_handle) else {
        eprintln!("unable to open AniList franchise cache; will retry later");
        return;
    };
    let mut stmt = match conn.prepare(
        "SELECT id, title, cover_url, episodes, score, format, media_type, year, targets_json, fetched_at FROM franchise_nodes",
    ) {
        Ok(s) => s,
        Err(err) => {
            eprintln!("unable to read AniList franchise cache: {err}");
            return;
        }
    };
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)? as u64,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, Option<i64>>(3)?,
            row.get::<_, Option<i64>>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, Option<String>>(6)?,
            row.get::<_, Option<i64>>(7)?,
            row.get::<_, String>(8)?,
            row.get::<_, i64>(9)?,
        ))
    });
    let Ok(rows) = rows else {
        eprintln!("unable to iterate AniList franchise cache");
        return;
    };
    let mut guard = FRANCHISE_CACHE.lock().unwrap();
    for row in rows.flatten() {
        let (
            id,
            title,
            cover_url,
            episodes,
            score,
            format,
            media_type,
            year,
            targets_json,
            fetched_at,
        ) = row;
        let targets =
            serde_json::from_str::<Vec<(u64, String, Option<String>, Option<i32>)>>(&targets_json)
                .unwrap_or_default();
        guard.insert(
            id,
            CachedFranchiseNode {
                node: FranchiseNode {
                    id,
                    title,
                    cover_url,
                    episodes: episodes.map(|n| n as i32),
                    score: score.map(|n| n as i32),
                    format,
                    media_type,
                    year: year.map(|n| n as i32),
                },
                targets,
                fetched_at,
            },
        );
    }
    FRANCHISE_CACHE_LOADED.store(true, Ordering::Relaxed);
}

fn persist_franchise_nodes(
    app_handle: &AppHandle,
    nodes: &[CachedFranchiseNode],
) -> Result<(), String> {
    if nodes.is_empty() {
        return Ok(());
    }
    let conn = open_franchise_db(app_handle)?;
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("tx: {e}"))?;
    {
        let mut stmt = tx
            .prepare(
                "INSERT OR REPLACE INTO franchise_nodes
                (id, title, cover_url, episodes, score, format, media_type, year, targets_json, fetched_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            )
            .map_err(|e| format!("prepare: {e}"))?;
        for cached in nodes {
            let node = &cached.node;
            let targets_json =
                serde_json::to_string(&cached.targets).map_err(|e| format!("{e}"))?;
            stmt.execute(rusqlite::params![
                node.id as i64,
                node.title,
                node.cover_url,
                node.episodes.map(i64::from),
                node.score.map(i64::from),
                node.format,
                node.media_type,
                node.year.map(i64::from),
                targets_json,
                cached.fetched_at,
            ])
            .map_err(|e| format!("insert: {e}"))?;
        }
    }
    tx.commit().map_err(|e| format!("commit: {e}"))
}

fn is_fresh(cached: &CachedFranchiseNode) -> bool {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_secs() as i64);
    now - cached.fetched_at < FRANCHISE_CACHE_TTL_SECS
}

fn flush_pending_franchise_cache(app_handle: &AppHandle, pending: &mut Vec<CachedFranchiseNode>) {
    if pending.is_empty() {
        return;
    }
    let batch = std::mem::take(pending);
    if let Err(err) = persist_franchise_nodes(app_handle, &batch) {
        eprintln!("unable to persist AniList franchise cache: {err}");
    }
}

#[derive(Debug, Serialize)]
pub struct PrefetchItem {
    pub id: u64,
    pub title: String,
    pub relations: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct PrefetchProgress {
    pub done: usize,
    pub total: usize,
    pub remaining: usize,
    pub fetched: usize,
    pub skipped: usize,
    pub current: Option<String>,
    pub items: Vec<PrefetchItem>,
    pub elapsed_ms: u64,
    pub eta_secs: Option<u64>,
    pub next_batch_in_ms: u64,
}

#[derive(Debug, Serialize)]
pub struct PrefetchSummary {
    pub processed: usize,
    pub fetched: usize,
    pub skipped: usize,
    pub cancelled: bool,
}

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

fn load_token(app_handle: &tauri::AppHandle) -> Result<String, String> {
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

async fn graphql_request(
    query: serde_json::Value,
    token: Option<&str>,
) -> Result<serde_json::Value, String> {
    let mut last_err = "AniList request failed".to_string();
    for attempt in 0..3 {
        acquire_request_slot().await;

        let mut builder = CLIENT.post("https://graphql.anilist.co").json(&query);
        if let Some(t) = token {
            builder = builder.header("Authorization", format!("Bearer {t}"));
        }
        let resp = match builder.send().await {
            Ok(r) => r,
            Err(e) => {
                last_err = format!("AniList request failed: {e}");
                tokio::time::sleep(Duration::from_secs(1 << attempt)).await;
                continue;
            }
        };

        if resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            let retry_after = resp
                .headers()
                .get(reqwest::header::RETRY_AFTER)
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(1 << attempt);
            last_err = "AniList rate limit exceeded".to_string();
            tokio::time::sleep(Duration::from_secs(retry_after.min(10))).await;
            continue;
        }

        update_rate_limit(
            resp.headers()
                .get("x-ratelimit-limit")
                .and_then(|v| v.to_str().ok()),
        );

        if !resp.status().is_success() {
            last_err = format!("AniList HTTP {}", resp.status());
            tokio::time::sleep(Duration::from_secs(1 << attempt)).await;
            continue;
        }

        let json = resp
            .json::<serde_json::Value>()
            .await
            .map_err(|e| format!("Failed to parse AniList response: {e}"))?;
        if json
            .get("errors")
            .and_then(serde_json::Value::as_array)
            .is_some_and(|errors| !errors.is_empty())
        {
            return Err(format!("AniList GraphQL error: {}", json["errors"]));
        }
        return Ok(json);
    }
    Err(last_err)
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
pub async fn get_anilist_profile(
    app_handle: tauri::AppHandle,
    user_id: Option<u64>,
    user_name: Option<String>,
) -> Result<AniUserProfile, String> {
    if user_id.is_none() && user_name.as_deref().is_none_or(str::is_empty) {
        return Err("A user id or name is required".to_string());
    }

    // Relationship fields are only meaningful for an authenticated viewer and
    // can make an otherwise public profile query fail when no token exists.
    // Keep the public lookup usable, while still showing relationship data for
    // the signed-in AniList account.
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
    let json = graphql_request(body, token.as_deref()).await?;
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
pub struct AniStaffDetail {
    pub id: u64,
    pub name: String,
    pub image: Option<String>,
    pub characters: Vec<AniStaffCharacterEdge>,
    pub media: Vec<AniStaffMediaEdge>,
}

fn parse_date(d: &serde_json::Value) -> Option<String> {
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
) -> Result<Vec<AniMedia>, String> {
    fetch_paginated_with(base_query, variables, max_pages, per_page, fetch_page).await
}

#[allow(clippy::too_many_arguments)]
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

    // Bound caller-provided pagination so one UI request cannot create an
    // unexpectedly large burst or divide by zero in page calculation.
    let mp = max_pages.unwrap_or(3).clamp(1, 20);
    let pp = per_page.unwrap_or(20).clamp(1, 50);

    variables["perPage"] = serde_json::json!(pp);

    let gql = r"
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
    ";

    fetch_paginated(gql, variables, mp, pp).await
}

#[tauri::command]
pub async fn search_anilist_by_tag(tag: String) -> Result<Vec<AniMedia>, String> {
    fetch_paginated(
        r"
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
        ",
        serde_json::json!({ "tag": tag, "page": 1, "perPage": 20 }),
        MAX_PAGES,
        20,
    )
    .await
}

#[tauri::command]
pub async fn search_anilist_by_genre(genre: String) -> Result<Vec<AniMedia>, String> {
    fetch_paginated(
        r"
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
        ",
        serde_json::json!({ "genre": genre, "page": 1, "perPage": 20 }),
        MAX_PAGES,
        20,
    )
    .await
}

#[tauri::command]
pub async fn search_anilist_by_studio(studio_id: u64) -> Result<Vec<AniMedia>, String> {
    let body = serde_json::json!({
        "query": r"
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
        ",
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

#[tauri::command]
pub async fn toggle_favourite(
    app_handle: tauri::AppHandle,
    anime_id: i64,
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
                    season, seasonYear, popularity, favourites
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
    let json = graphql_request(body, None).await?;
    let m = &json["data"]["Media"];
    if m.is_null() {
        return Err(format!("Anime with id {id} not found"));
    }
    Ok(parse_animedia(m))
}

#[tauri::command]
pub async fn anilist_login(app_handle: tauri::AppHandle, token: String) -> Result<AniUser, String> {
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
    let Ok(json) = graphql_request(body, Some(&token)).await else {
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
pub async fn get_anilist_lists(
    app_handle: tauri::AppHandle,
    user_id: u64,
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
    // Drop this account's anime entries from the unified index so the next
    // (possibly unauthenticated) user never sees them in suggestions.
    let _ = app_db::prune_unified_index_scope(app_handle, "anilist".into(), Vec::new());
    Ok(())
}

#[allow(clippy::cast_possible_wrap)]
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
pub async fn get_anilist_activity(user_ids: Vec<u64>) -> Result<Vec<AniActivity>, String> {
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
    let json = graphql_request(body, None).await?;
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
pub async fn get_anime_characters(id: u64, page: u64) -> Result<Vec<AniCharacterEdge>, String> {
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
    let json = graphql_request(body, None).await?;
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
pub async fn get_character_media(id: u64) -> Result<Vec<AniCharacterMediaEdge>, String> {
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
    let json = graphql_request(body, None).await?;
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
pub async fn get_staff_characters(id: u64) -> Result<AniStaffDetail, String> {
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
    let json = graphql_request(body, None).await?;
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

#[derive(Debug, Serialize, Clone, Deserialize)]
pub struct FranchiseNode {
    pub id: u64,
    pub title: String,
    pub cover_url: Option<String>,
    pub episodes: Option<i32>,
    pub score: Option<i32>,
    pub format: Option<String>,
    pub media_type: Option<String>,
    pub year: Option<i32>,
}

#[derive(Debug, Serialize)]
pub struct FranchiseEdge {
    pub source: u64,
    pub target: u64,
    pub relation_type: String,
}

#[derive(Debug, Serialize)]
pub struct FranchiseGraph {
    pub root_id: u64,
    pub nodes: Vec<FranchiseNode>,
    pub edges: Vec<FranchiseEdge>,
}

const MAX_FRANCHISE_NODES: usize = 40;
const MAX_FRANCHISE_DEPTH: usize = 15;
const FRANCHISE_BATCH_SIZE: usize = 8;

fn is_anime_media(media_type: Option<&str>) -> bool {
    match media_type {
        None => true,
        Some("ANIME" | "MOVIE" | "OVA" | "ONA") => true,
        _ => false,
    }
}

// Frontier priority so a small node budget still walks the whole mainline
// chain (SEQUEL/PREQUEL) before filling the graph with side entries.
fn franchise_relation_rank(rel_type: &str) -> u8 {
    match rel_type {
        "SEQUEL" | "PREQUEL" => 0,
        "SIDE_STORY" | "SPIN_OFF" => 1,
        _ => 2,
    }
}

#[derive(Eq, PartialEq)]
struct FrontierEntry {
    rank: u8,
    depth: u8,
    id: u64,
}

impl Ord for FrontierEntry {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.rank
            .cmp(&other.rank)
            .then_with(|| self.depth.cmp(&other.depth))
            .then_with(|| other.id.cmp(&self.id))
    }
}

impl PartialOrd for FrontierEntry {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

struct FetchedFranchiseNode {
    node: FranchiseNode,
    targets: Vec<(u64, String, Option<String>, Option<i32>)>,
}

fn parse_franchise_media(m: &serde_json::Value) -> FranchiseNode {
    FranchiseNode {
        id: m["id"].as_u64().unwrap_or(0),
        title: m["title"]["romaji"]
            .as_str()
            .or_else(|| m["title"]["english"].as_str())
            .unwrap_or("Unknown")
            .to_string(),
        cover_url: m["coverImage"]["medium"].as_str().map(String::from),
        episodes: m["episodes"].as_i64().map(|n| n as i32),
        score: m["averageScore"].as_i64().map(|n| n as i32),
        format: m["format"].as_str().map(String::from),
        media_type: m["type"].as_str().map(String::from),
        year: m["startDate"]["year"].as_i64().map(|n| n as i32),
    }
}

fn parse_franchise_targets(
    m: &serde_json::Value,
) -> Vec<(u64, String, Option<String>, Option<i32>)> {
    let mut seen = HashSet::new();
    m["relations"]["edges"]
        .as_array()
        .map(|edges| {
            edges
                .iter()
                .filter_map(|edge| {
                    let target_id = edge["node"]["id"].as_u64().unwrap_or(0);
                    if target_id == 0 {
                        return None;
                    }
                    let rel_type = edge["relationType"]
                        .as_str()
                        .unwrap_or("UNKNOWN")
                        .to_string();
                    if !seen.insert((target_id, rel_type.clone())) {
                        return None;
                    }
                    let media_type = edge["node"]["type"].as_str().map(String::from);
                    Some((
                        target_id,
                        rel_type,
                        media_type,
                        edge["node"]["startDate"]["year"].as_i64().map(|n| n as i32),
                    ))
                })
                .collect()
        })
        .unwrap_or_default()
}

const FRANCHISE_BATCH_QUERY: &str = r"
    query ($ids: [Int], $page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
            media(id_in: $ids, type: ANIME) {
                id
                title { romaji english }
                coverImage { medium }
                episodes
                averageScore
                format
                type
                startDate { year }
                relations {
                    edges {
                        relationType
                        node {
                            id
                            title { romaji english }
                            coverImage { medium }
                            episodes
                            averageScore
                            format
                            type
                            startDate { year }
                        }
                    }
                }
            }
        }
    }
";

#[derive(Debug, Clone, Serialize)]
pub struct FranchiseQueryMetrics {
    pub id_count: usize,
    pub query_bytes: usize,
    pub body_bytes: usize,
}

#[must_use]
pub fn franchise_query_body(ids: &[u64]) -> serde_json::Value {
    // AniList's Page limit is 50; cap the helper as well so callers cannot
    // accidentally create a body whose perPage and id list disagree.
    let ids: Vec<i64> = ids.iter().take(50).map(|id| *id as i64).collect();
    serde_json::json!({
        "query": FRANCHISE_BATCH_QUERY,
        "variables": {
            "ids": ids,
            "page": 1,
            "perPage": ids.len().clamp(1, 50),
        }
    })
}

#[must_use]
pub fn franchise_query_metrics(ids: &[u64]) -> FranchiseQueryMetrics {
    let body = franchise_query_body(ids);
    let query_bytes = FRANCHISE_BATCH_QUERY.len();
    let body_bytes = serde_json::to_vec(&body)
        .map_or(0, |bytes| bytes.len());
    FranchiseQueryMetrics {
        id_count: ids.len(),
        query_bytes,
        body_bytes,
    }
}

async fn fetch_franchise_batch_once(ids: &[u64]) -> Result<Vec<FetchedFranchiseNode>, String> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let json = graphql_request(franchise_query_body(ids), None).await?;
    let media = json["data"]["Page"]["media"]
        .as_array()
        .ok_or_else(|| "AniList franchise response did not contain media".to_string())?;

    Ok(media
        .iter()
        .filter(|m| !m.is_null())
        .map(|m| FetchedFranchiseNode {
            node: parse_franchise_media(m),
            targets: parse_franchise_targets(m),
        })
        .collect())
}

fn fetch_franchise_batch(
    ids: &[u64],
) -> std::pin::Pin<
    Box<dyn std::future::Future<Output = Result<Vec<FetchedFranchiseNode>, String>> + Send + '_>,
> {
    Box::pin(fetch_franchise_batch_inner(ids))
}

async fn fetch_franchise_batch_inner(ids: &[u64]) -> Result<Vec<FetchedFranchiseNode>, String> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    match fetch_franchise_batch_once(ids).await {
        Ok(result) => Ok(result),
        Err(err) => {
            eprintln!("anilist franchise batch failed ({} ids): {err}", ids.len());
            let lower = err.to_ascii_lowercase();
            let can_split = lower.contains("complex") || lower.contains("query depth");
            if ids.len() == 1 || !can_split {
                return Err(err);
            }
            let mid = ids.len() / 2;
            let mut result = fetch_franchise_batch(&ids[..mid]).await?;
            result.extend(fetch_franchise_batch(&ids[mid..]).await?);
            Ok(result)
        }
    }
}

#[tauri::command]
pub async fn get_anime_franchise(
    app_handle: tauri::AppHandle,
    id: u64,
    scope: String,
) -> Result<FranchiseGraph, String> {
    let bypass_cache = scope == "fresh";
    load_franchise_cache(&app_handle);

    let mut nodes: Vec<FranchiseNode> = Vec::new();
    let mut edges: Vec<FranchiseEdge> = Vec::new();
    let mut edge_keys: HashSet<(u64, u64, String)> = HashSet::new();
    let mut node_ids: HashSet<u64> = HashSet::new();
    let mut visited: HashSet<u64> = HashSet::new();
    visited.insert(id);
    // Persist once per traversal instead of reopening SQLite for every graph
    // batch. The in-memory cache is updated immediately, so the UI remains
    // responsive even when the final cache flush is slow.
    let mut pending_persist: Vec<CachedFranchiseNode> = Vec::new();

    // Best-first traversal: the frontier is a min-heap ordered by relation
    // rank (then depth, then id). SEQUEL/PREQUEL entries always pop before
    // side stories and misc relations, so even a small node budget walks the
    // whole mainline chain (e.g. Fate/Zero -> Fate/kaleid Prisma Illya).
    let mut frontier: BinaryHeap<Reverse<FrontierEntry>> = BinaryHeap::new();
    frontier.push(Reverse(FrontierEntry { rank: 0, depth: 0, id }));

    while node_ids.len() < MAX_FRANCHISE_NODES {
        if frontier.is_empty() {
            break;
        }

        // Pop the highest-priority entries into a fetch batch.
        let mut batch: Vec<FrontierEntry> = Vec::new();
        while batch.len() < FRANCHISE_BATCH_SIZE {
            match frontier.pop() {
                Some(Reverse(entry)) => batch.push(entry),
                None => break,
            }
        }

        let mut results: Vec<FetchedFranchiseNode> = Vec::new();
        let mut fetch_ids: Vec<u64> = Vec::new();

        if bypass_cache {
            fetch_ids.extend(batch.iter().map(|entry| entry.id));
        } else {
            let guard = FRANCHISE_CACHE
                .lock()
                .map_err(|_| "cache lock".to_string())?;
            for entry in &batch {
                match guard.get(&entry.id) {
                    Some(c) if is_fresh(c) => results.push(FetchedFranchiseNode {
                        node: c.node.clone(),
                        targets: c.targets.clone(),
                    }),
                    _ => fetch_ids.push(entry.id),
                }
            }
        }

        if !fetch_ids.is_empty() {
            let fresh = match fetch_franchise_batch(&fetch_ids).await {
                Ok(fresh) => fresh,
                Err(err) => {
                    // Keep successful earlier batches durable even when a
                    // later network batch fails.
                    flush_pending_franchise_cache(&app_handle, &mut pending_persist);
                    return Err(err);
                }
            };
            let fetched_at = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_or(0, |d| d.as_secs() as i64);
            let mut persisted: Vec<CachedFranchiseNode> = Vec::new();
            for data in fresh {
                let cached = CachedFranchiseNode {
                    node: data.node,
                    targets: data.targets,
                    fetched_at,
                };
                results.push(FetchedFranchiseNode {
                    node: cached.node.clone(),
                    targets: cached.targets.clone(),
                });
                persisted.push(cached);
            }
            let mut cache_guard = FRANCHISE_CACHE
                .lock()
                .map_err(|_| "cache lock".to_string())?;
            for cached in &persisted {
                cache_guard.insert(cached.node.id, cached.clone());
            }
            drop(cache_guard);
            pending_persist.extend(persisted);
        }

        let depths: HashMap<u64, u8> = batch
            .iter()
            .map(|entry| (entry.id, entry.depth))
            .collect();

        for data in results {
            if node_ids.len() >= MAX_FRANCHISE_NODES {
                break;
            }
            let node_id = data.node.id;
            if node_ids.insert(node_id) {
                nodes.push(data.node);
            }

            let depth = depths.get(&node_id).copied().unwrap_or(0);
            if usize::from(depth) < MAX_FRANCHISE_DEPTH {
                for (target_id, rel_type, media_type, _year) in data.targets {
                    if !is_anime_media(media_type.as_deref()) {
                        continue;
                    }
                    let rank = franchise_relation_rank(&rel_type);
                    if edge_keys.insert((node_id, target_id, rel_type.clone())) {
                        edges.push(FranchiseEdge {
                            source: node_id,
                            target: target_id,
                            relation_type: rel_type,
                        });
                    }
                    if !visited.contains(&target_id) {
                        visited.insert(target_id);
                        frontier.push(Reverse(FrontierEntry {
                            rank,
                            depth: depth + 1,
                            id: target_id,
                        }));
                    }
                }
            }
        }

        // A popped batch is a useful durability checkpoint: it keeps the
        // number of SQLite transactions low without losing all progress when
        // a later best-first batch fails.
        flush_pending_franchise_cache(&app_handle, &mut pending_persist);
    }

    flush_pending_franchise_cache(&app_handle, &mut pending_persist);

    Ok(FranchiseGraph {
        root_id: id,
        nodes,
        edges,
    })
}

fn relation_line(rel_type: &str, title: &str, year: Option<i32>) -> String {
    match year {
        Some(y) => format!("{rel_type} - {title} ({y})"),
        None => format!("{rel_type} - {title}"),
    }
}

const PREFETCH_BATCH_SIZE: usize = 8;
const MAX_PREFETCH_NODES: usize = 50000;

fn emit_prefetch_progress(app_handle: &tauri::AppHandle, progress: &PrefetchProgress) {
    let _ = app_handle.emit("anilist-prefetch-progress", progress);
}

#[tauri::command]
pub async fn prefetch_anime_relations(
    app_handle: tauri::AppHandle,
    anime_ids: Vec<u64>,
) -> Result<PrefetchSummary, String> {
    if PREFETCH_RUNNING.load(Ordering::Relaxed) {
        return Err("Prefetch already running".to_string());
    }
    PREFETCH_RUNNING.store(true, Ordering::Relaxed);
    let prefetch_cancel = reset_prefetch_cancel();

    load_franchise_cache(&app_handle);

    let mut processed = 0usize;
    let mut fetched_count = 0usize;
    let mut skipped = 0usize;
    let mut queued: HashSet<u64> = HashSet::new();
    let mut queue: VecDeque<u64> = VecDeque::new();
    let mut done: HashSet<u64> = HashSet::new();

    let seeds: Vec<u64> = anime_ids
        .into_iter()
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    for id in seeds {
        if queued.insert(id) {
            queue.push_back(id);
        }
    }

    let mut cancelled = false;
    let mut attempts: HashMap<u64, u32> = HashMap::new();

    let start_time = std::time::Instant::now();
    let mut last_batch_start = std::time::Instant::now();
    let mut avg_batch_ms: f64 = 0.0;
    let mut has_batch_sample = false;
    let mut next_batch_in_ms: u64;

    while !queue.is_empty() {
        if prefetch_cancel.is_cancelled() {
            cancelled = true;
            break;
        }
        if processed >= MAX_PREFETCH_NODES {
            break;
        }

        let count = queue.len().min(PREFETCH_BATCH_SIZE);
        let batch: Vec<u64> = queue.drain(..count).collect();

        let mut to_fetch: Vec<u64> = Vec::new();
        let mut cached_ids: HashSet<u64> = HashSet::new();
        for id in &batch {
            let cached = FRANCHISE_CACHE.lock().ok().and_then(|g| g.get(id).cloned());
            match cached {
                Some(c) if is_fresh(&c) => {
                    skipped += 1;
                    processed += 1;
                    done.insert(*id);
                    cached_ids.insert(*id);
                    for (target, _, media_type, _) in &c.targets {
                        if is_anime_media(media_type.as_deref()) && queued.insert(*target) {
                            queue.push_back(*target);
                        }
                    }
                }
                _ => to_fetch.push(*id),
            }
        }

        if to_fetch.is_empty() {
            continue;
        }

        let current = FRANCHISE_CACHE
            .lock()
            .ok()
            .and_then(|g| g.get(&to_fetch[0]).map(|c| c.node.title.clone()))
            .unwrap_or_else(|| "?".to_string());

        let batch_start = std::time::Instant::now();
        let results = if let Ok(r) = fetch_franchise_batch_once(&to_fetch).await { r } else {
            // Failed batch (rate limit exhausted etc.): re-queue for another attempt,
            // but drop ids that keep failing to avoid an infinite loop.
            for id in to_fetch {
                let n = attempts.entry(id).or_insert(0);
                *n += 1;
                if *n <= 3 && queued.contains(&id) {
                    queue.push_back(id);
                } else {
                    processed += 1;
                    done.insert(id);
                }
            }
            continue;
        };

        // Smoothed batch duration (EWMA) for ETA estimation and next-call countdown.
        let batch_elapsed_ms = batch_start.elapsed().as_millis() as f64;
        avg_batch_ms = if has_batch_sample {
            batch_elapsed_ms.mul_add(0.3, avg_batch_ms * 0.7)
        } else {
            batch_elapsed_ms
        };
        has_batch_sample = true;
        next_batch_in_ms = last_batch_start.elapsed().as_millis() as u64;
        last_batch_start = std::time::Instant::now();

        {
            let mut guard = FRANCHISE_CACHE
                .lock()
                .map_err(|_| "cache lock".to_string())?;
            let mut persisted: Vec<CachedFranchiseNode> = Vec::new();
            for data in results {
                let fetched_at = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_or(0, |d| d.as_secs() as i64);
                let cached = CachedFranchiseNode {
                    node: data.node,
                    targets: data.targets,
                    fetched_at,
                };
                guard.insert(cached.node.id, cached.clone());
                persisted.push(cached);
            }
            drop(guard);
            if let Err(err) = persist_franchise_nodes(&app_handle, &persisted) {
                eprintln!("unable to persist AniList prefetch cache: {err}");
            }
        }

        // Build the text list for this batch (each anime + its relations).
        let mut items: Vec<PrefetchItem> = Vec::new();
        let guard = FRANCHISE_CACHE
            .lock()
            .map_err(|_| "cache lock".to_string())?;
        for id in &batch {
            let Some(c) = guard.get(id) else {
                continue;
            };
            let relations = c
                .targets
                .iter()
                .filter(|(_, _, mt, _)| is_anime_media(mt.as_deref()))
                .map(|(tid, rt, _, y)| {
                    let target_title = guard
                        .get(tid).map_or_else(|| "?".to_string(), |t| t.node.title.clone());
                    relation_line(rt, &target_title, *y)
                })
                .collect::<Vec<_>>();
            items.push(PrefetchItem {
                id: *id,
                title: c.node.title.clone(),
                relations,
            });
            if !cached_ids.contains(id) {
                processed += 1;
                fetched_count += 1;
                done.insert(*id);
            }

            for (target, _, media_type, _) in &c.targets {
                if !is_anime_media(media_type.as_deref()) {
                    continue;
                }
                if queued.insert(*target) {
                    queue.push_back(*target);
                }
            }
        }
        drop(guard);

        let remaining_batches = queue.len() as f64 / PREFETCH_BATCH_SIZE as f64;
        let eta_secs = if has_batch_sample {
            Some((remaining_batches * avg_batch_ms / 1000.0).ceil() as u64)
        } else {
            None
        };
        let elapsed_ms = start_time.elapsed().as_millis() as u64;

        emit_prefetch_progress(
            &app_handle,
            &PrefetchProgress {
                done: done.len(),
                total: done.len() + queue.len(),
                remaining: queue.len(),
                fetched: fetched_count,
                skipped,
                current: Some(current),
                items,
                elapsed_ms,
                eta_secs,
                next_batch_in_ms,
            },
        );
    }

    PREFETCH_RUNNING.store(false, Ordering::Relaxed);
    Ok(PrefetchSummary {
        processed,
        fetched: fetched_count,
        skipped,
        cancelled,
    })
}

#[tauri::command]
pub fn cancel_anime_prefetch() {
    if let Ok(token) = PREFETCH_CANCEL.lock() {
        token.cancel();
    }
}

/// Backfills the cached `AniList` franchise nodes into the unified search index
/// so related titles participate in the same autocomplete learning pipeline as
/// the user's own list, history and local files.
#[tauri::command]
pub fn sync_franchise_to_index(app_handle: tauri::AppHandle) -> Result<usize, String> {
    load_franchise_cache(&app_handle);
    let guard = FRANCHISE_CACHE.lock().map_err(|_| "cache lock".to_string())?;
    let mut entries: Vec<app_db::UnifiedIndexEntryInput> = Vec::new();
    for (id, cached) in guard.iter() {
        if !is_anime_media(cached.node.media_type.as_deref()) {
            continue;
        }
        let title = cached.node.title.trim();
        if title.is_empty() {
            continue;
        }
        entries.push(app_db::UnifiedIndexEntryInput {
            id: format!("anime:franchise:{id}"),
            kind: "anime".to_string(),
            scope: "franchise".to_string(),
            value: title.to_string(),
            subtitle: cached.node.year.map(|year| year.to_string()),
            metadata: Some(serde_json::json!({
                "franchise": true,
                "animeId": id,
                "format": cached.node.format,
            })),
        });
    }
    drop(guard);
    if entries.is_empty() {
        return Ok(0);
    }
    let mut total = 0usize;
    for batch in entries.chunks(5_000) {
        total += app_db::upsert_unified_index(app_handle.clone(), batch.to_vec())?;
    }
    Ok(total)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_deduplicates_franchise_targets() {
        let media = serde_json::json!({
            "relations": { "edges": [
                { "relationType": "SEQUEL", "node": { "id": 2, "type": "ANIME", "startDate": { "year": 2024 } } },
                { "relationType": "SEQUEL", "node": { "id": 2, "type": "ANIME", "startDate": { "year": 2024 } } },
                { "relationType": "PREQUEL", "node": { "id": 1, "type": "ANIME" } },
                { "relationType": "OTHER", "node": { "id": 0, "type": "ANIME" } }
            ] }
        });
        let targets = parse_franchise_targets(&media);
        assert_eq!(targets.len(), 2);
        assert_eq!(targets[0].0, 2);
        assert_eq!(targets[1].1, "PREQUEL");
    }

    #[test]
    fn franchise_media_filter_keeps_anime_formats_and_rejects_manga() {
        assert!(is_anime_media(Some("ANIME")));
        assert!(is_anime_media(Some("MOVIE")));
        assert!(is_anime_media(None));
        assert!(!is_anime_media(Some("MANGA")));
    }

    #[test]
    fn relation_lines_include_year_only_when_available() {
        assert_eq!(
            relation_line("SEQUEL", "Next", Some(2025)),
            "SEQUEL - Next (2025)"
        );
        assert_eq!(relation_line("OTHER", "Unknown", None), "OTHER - Unknown");
    }

    #[test]
    fn stale_franchise_cache_entries_are_not_fresh() {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let cached = CachedFranchiseNode {
            node: FranchiseNode {
                id: 1,
                title: "Test".into(),
                cover_url: None,
                episodes: None,
                score: None,
                format: None,
                media_type: Some("ANIME".into()),
                year: None,
            },
            targets: Vec::new(),
            fetched_at: now - FRANCHISE_CACHE_TTL_SECS - 1,
        };
        assert!(!is_fresh(&cached));
    }

    #[test]
    fn franchise_batch_query_uses_id_in_and_is_bounded() {
        let body = franchise_query_body(&[10, 20, 30]);
        let query = body["query"].as_str().unwrap();
        assert!(query.contains("media(id_in: $ids"));
        assert!(!query.contains("m10:"));
        assert_eq!(body["variables"]["ids"].as_array().unwrap().len(), 3);
        assert_eq!(body["variables"]["perPage"], 3);

        let many: Vec<u64> = (1..=100).collect();
        assert_eq!(franchise_query_body(&many)["variables"]["perPage"], 50);
    }

    #[test]
    fn franchise_query_metrics_are_stable_for_a_batch() {
        let first = franchise_query_metrics(&[1, 2, 3, 4]);
        let second = franchise_query_metrics(&[1, 2, 3, 4]);
        assert_eq!(first.id_count, 4);
        assert_eq!(first.query_bytes, second.query_bytes);
        assert_eq!(first.body_bytes, second.body_bytes);
        assert!(first.body_bytes > first.query_bytes);
    }

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
    fn franchise_batch_request_counts_match_current_eight_id_batches() {
        let request_count = |node_count: usize| node_count.div_ceil(FRANCHISE_BATCH_SIZE);

        assert_eq!(request_count(0), 0);
        assert_eq!(request_count(1), 1);
        assert_eq!(request_count(8), 1);
        assert_eq!(request_count(9), 2);
        assert_eq!(request_count(200), 25);
    }
}
