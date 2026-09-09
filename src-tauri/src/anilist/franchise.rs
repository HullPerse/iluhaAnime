#![allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    clippy::cast_possible_wrap
)]

use serde::{Deserialize, Serialize};
use std::cmp::Reverse;
use std::collections::{BinaryHeap, HashMap, HashSet, VecDeque};
use std::future::Future;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{LazyLock, Mutex};
use std::time::Duration;
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Emitter, Manager};
use tokio_util::sync::CancellationToken;

use crate::app_db;

use super::auth::optional_token;
use super::client::{graphql_request, resolve_proxy};
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
    let body_bytes = serde_json::to_vec(&body).map_or(0, |bytes| bytes.len());
    FranchiseQueryMetrics {
        id_count: ids.len(),
        query_bytes,
        body_bytes,
    }
}

async fn fetch_franchise_batch_once(
    ids: &[u64],
    token: Option<&str>,
    proxy: Option<&str>,
) -> Result<Vec<FetchedFranchiseNode>, String> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let json = graphql_request(franchise_query_body(ids), token, proxy).await?;
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

fn fetch_franchise_batch<'a>(
    ids: &'a [u64],
    token: Option<&'a str>,
    proxy: Option<&'a str>,
) -> std::pin::Pin<Box<dyn Future<Output = Result<Vec<FetchedFranchiseNode>, String>> + Send + 'a>>
{
    Box::pin(fetch_franchise_batch_inner(ids, token, proxy))
}

async fn fetch_franchise_batch_inner(
    ids: &[u64],
    token: Option<&str>,
    proxy: Option<&str>,
) -> Result<Vec<FetchedFranchiseNode>, String> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    match fetch_franchise_batch_once(ids, token, proxy).await {
        Ok(result) => Ok(result),
        Err(err) => {
            eprintln!("anilist franchise batch failed ({} ids): {err}", ids.len());
            let lower = err.to_ascii_lowercase();
            let can_split = lower.contains("complex") || lower.contains("query depth");
            if ids.len() == 1 || !can_split {
                return Err(err);
            }
            let mid = ids.len() / 2;
            let mut result = fetch_franchise_batch(&ids[..mid], token, proxy).await?;
            result.extend(fetch_franchise_batch(&ids[mid..], token, proxy).await?);
            Ok(result)
        }
    }
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn get_anime_franchise(
    app_handle: tauri::AppHandle,
    id: u64,
    scope: String,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<FranchiseGraph, String> {
    let bypass_cache = scope == "fresh";
    load_franchise_cache(&app_handle);

    let mut nodes: Vec<FranchiseNode> = Vec::new();
    let mut edges: Vec<FranchiseEdge> = Vec::new();
    let mut edge_keys: HashSet<(u64, u64, String)> = HashSet::new();
    let mut node_ids: HashSet<u64> = HashSet::new();
    let mut visited: HashSet<u64> = HashSet::new();
    visited.insert(id);
    let mut pending_persist: Vec<CachedFranchiseNode> = Vec::new();

    let mut frontier: BinaryHeap<Reverse<FrontierEntry>> = BinaryHeap::new();
    frontier.push(Reverse(FrontierEntry {
        rank: 0,
        depth: 0,
        id,
    }));

    while node_ids.len() < MAX_FRANCHISE_NODES {
        if frontier.is_empty() {
            break;
        }

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
            let proxy = resolve_proxy(proxy_url.clone(), proxyUrl.clone());
            let token = optional_token(&app_handle);
            let fresh = match fetch_franchise_batch(&fetch_ids, token.as_deref(), proxy.as_deref()).await {
                Ok(fresh) => fresh,
                Err(err) => {
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

        let depths: HashMap<u64, u8> = batch.iter().map(|entry| (entry.id, entry.depth)).collect();

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
#[allow(non_snake_case)]
pub async fn prefetch_anime_relations(
    app_handle: tauri::AppHandle,
    anime_ids: Vec<u64>,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
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
        let proxy = resolve_proxy(proxy_url.clone(), proxyUrl.clone());
        let token = optional_token(&app_handle);
        let results = if let Ok(r) = fetch_franchise_batch_once(&to_fetch, token.as_deref(), proxy.as_deref()).await {
            r
        } else {
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
                        .get(tid)
                        .map_or_else(|| "?".to_string(), |t| t.node.title.clone());
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

#[tauri::command]
pub fn sync_franchise_to_index(app_handle: tauri::AppHandle) -> Result<usize, String> {
    load_franchise_cache(&app_handle);
    let guard = FRANCHISE_CACHE
        .lock()
        .map_err(|_| "cache lock".to_string())?;
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
