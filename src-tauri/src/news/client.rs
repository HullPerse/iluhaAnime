use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

use serde::Deserialize;

use crate::news::models::{NewsItem, NewsPage};
use crate::news::parse::{parse_attachments, parse_blocks};
use crate::scrapers::clients::read_body_capped;

const API_URL: &str = "https://shikimori.io/api/topics";
const GRAPHQL_URL: &str = "https://shikimori.io/api/graphql";
const SITE_URL: &str = "https://shikimori.io/forum/news";
const PAGE_SIZE: usize = 30;
const CACHE_TTL: Duration = Duration::from_secs(600);
const MAL_CACHE_TTL: Duration = Duration::from_secs(24 * 60 * 60);
const MAX_CACHED_PAGES: usize = 10;
const MAX_CACHED_MAL: usize = 512;
const MAX_BODY_BYTES: usize = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_SECS: u64 = 20;

#[derive(Debug, Deserialize)]
struct RawTopic {
    id: i64,
    topic_title: String,
    #[serde(default)]
    html_body: String,
    #[serde(default)]
    html_footer: String,
    created_at: String,
    #[serde(default)]
    linked_id: Option<i64>,
    #[serde(default)]
    linked_type: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawExternalLink {
    kind: String,
    url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawAnimeLinks {
    #[serde(default)]
    external_links: Vec<RawExternalLink>,
}

#[derive(Debug, Deserialize)]
struct RawGraphQlData {
    #[serde(default)]
    animes: Vec<RawAnimeLinks>,
}

#[derive(Debug, Deserialize)]
struct RawGraphQlError {
    #[serde(default)]
    message: String,
}

#[derive(Debug, Deserialize)]
struct RawGraphQlResponse {
    #[serde(default)]
    data: Option<RawGraphQlData>,
    #[serde(default)]
    errors: Vec<RawGraphQlError>,
}

struct CachedPage {
    stored_at: Instant,
    page: NewsPage,
}

#[derive(Clone, Copy)]
struct CachedMalId {
    stored_at: Instant,
    mal_id: Option<u64>,
}

static CACHE: LazyLock<Mutex<HashMap<u32, CachedPage>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static MAL_CACHE: LazyLock<Mutex<HashMap<u64, CachedMalId>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Fetches one page of the news forum; cached pages are reused for ten minutes.
pub async fn fetch_page(page: u32, proxy: Option<String>) -> Result<NewsPage, String> {
    if page == 0 {
        return Err("bad-shape: page starts at 1".to_string());
    }
    if let Some(cached) = cached_page(page) {
        return Ok(cached);
    }

    let client = build_client(proxy.as_deref())?;
    let limit = (PAGE_SIZE + 1).to_string();
    let page_value = page.to_string();
    let response = client
        .get(API_URL)
        .query(&[
            ("forum", "news"),
            ("limit", limit.as_str()),
            ("page", page_value.as_str()),
        ])
        .send()
        .await
        .map_err(|error| format!("unreachable: {error}"))?;

    let status = response.status();
    if matches!(status.as_u16(), 401 | 403 | 429 | 451) {
        return Err(format!("blocked: shikimori answered {status}"));
    }
    if !status.is_success() {
        return Err(format!("unreachable: shikimori answered {status}"));
    }

    let body = read_body_capped(response, MAX_BODY_BYTES)
        .await
        .map_err(|error| format!("unreachable: {error:?}"))?;
    let topics = serde_json::from_slice::<Vec<RawTopic>>(&body)
        .map_err(|error| format!("bad-shape: {error}"))?;

    let page_data = build_page(page, topics);
    store_page(page, &page_data);
    Ok(page_data)
}

fn build_page(page: u32, mut topics: Vec<RawTopic>) -> NewsPage {
    let has_more = topics.len() > PAGE_SIZE;
    topics.truncate(PAGE_SIZE);
    NewsPage {
        items: topics.into_iter().map(to_item).collect(),
        page,
        has_more,
    }
}

fn to_item(topic: RawTopic) -> NewsItem {
    let linked_anime_id = topic
        .linked_type
        .as_deref()
        .filter(|kind| *kind == "Anime")
        .and(topic.linked_id)
        .filter(|id| *id > 0);
    NewsItem {
        id: topic.id,
        title: topic.topic_title.trim().to_string(),
        created_at: topic.created_at,
        site_url: format!("{SITE_URL}/{}", topic.id),
        blocks: parse_blocks(&topic.html_body),
        attachments: parse_attachments(&topic.html_footer),
        linked_anime_id,
    }
}

/// Resolves the MyAnimeList id from the Shikimori "На других сайтах" block; `None` when absent.
pub async fn fetch_mal_id(shikimori_id: u64, proxy: Option<String>) -> Result<Option<u64>, String> {
    if shikimori_id == 0 {
        return Err("bad-shape: anime id starts at 1".to_string());
    }
    if let Some(cached) = cached_mal_id(shikimori_id) {
        return Ok(cached.mal_id);
    }

    let client = build_client(proxy.as_deref())?;
    let body = serde_json::json!({
        "query": "query ($ids: String) { animes(ids: $ids) { externalLinks { kind url } } }",
        "variables": { "ids": shikimori_id.to_string() },
    });
    let response = client
        .post(GRAPHQL_URL)
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("unreachable: {error}"))?;

    let status = response.status();
    if matches!(status.as_u16(), 401 | 403 | 429 | 451) {
        return Err(format!("blocked: shikimori answered {status}"));
    }
    if !status.is_success() {
        return Err(format!("unreachable: shikimori answered {status}"));
    }

    let raw = read_body_capped(response, MAX_BODY_BYTES)
        .await
        .map_err(|error| format!("unreachable: {error:?}"))?;
    let parsed = serde_json::from_slice::<RawGraphQlResponse>(&raw)
        .map_err(|error| format!("bad-shape: {error}"))?;
    let data = match parsed.data {
        Some(data) => data,
        None => {
            let message = parsed
                .errors
                .first()
                .map(|error| error.message.trim())
                .filter(|message| !message.is_empty())
                .unwrap_or("shikimori graphql failed");
            return Err(format!("bad-shape: {message}"));
        }
    };
    let mal_id = data
        .animes
        .into_iter()
        .next()
        .and_then(|anime| mal_id_from_links(&anime.external_links));
    store_mal_id(shikimori_id, mal_id);
    Ok(mal_id)
}

fn mal_id_from_links(links: &[RawExternalLink]) -> Option<u64> {
    links
        .iter()
        .find(|link| link.kind == "myanimelist")
        .and_then(|link| parse_mal_url(&link.url))
}

fn parse_mal_url(url: &str) -> Option<u64> {
    let rest = url.split("myanimelist.net/anime/").nth(1)?;
    let digits = rest.split(|ch: char| !ch.is_ascii_digit()).next()?;
    digits.parse::<u64>().ok().filter(|id| *id > 0)
}

fn build_client(proxy: Option<&str>) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .user_agent(format!(
            "iluhaAnime/{} (desktop client)",
            env!("CARGO_PKG_VERSION")
        ))
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS));
    if let Some(proxy) = proxy {
        builder = builder.proxy(
            reqwest::Proxy::all(proxy)
                .map_err(|error| format!("unreachable: invalid proxy address: {error}"))?,
        );
    }
    builder
        .build()
        .map_err(|error| format!("unreachable: failed to build client: {error}"))
}

fn cached_page(page: u32) -> Option<NewsPage> {
    let mut cache = CACHE.lock().ok()?;
    let entry = cache.get(&page)?;
    if entry.stored_at.elapsed() > CACHE_TTL {
        cache.remove(&page);
        return None;
    }
    Some(entry.page.clone())
}

fn cached_mal_id(shikimori_id: u64) -> Option<CachedMalId> {
    let mut cache = MAL_CACHE.lock().ok()?;
    let entry = cache.get(&shikimori_id)?;
    if entry.stored_at.elapsed() > MAL_CACHE_TTL {
        cache.remove(&shikimori_id);
        return None;
    }
    Some(*entry)
}

fn store_mal_id(shikimori_id: u64, mal_id: Option<u64>) {
    let Ok(mut cache) = MAL_CACHE.lock() else {
        return;
    };
    if cache.len() >= MAX_CACHED_MAL {
        if let Some(oldest) = cache
            .iter()
            .min_by_key(|(_, entry)| entry.stored_at)
            .map(|(id, _)| *id)
        {
            cache.remove(&oldest);
        }
    }
    cache.insert(
        shikimori_id,
        CachedMalId {
            stored_at: Instant::now(),
            mal_id,
        },
    );
}

fn store_page(page: u32, data: &NewsPage) {
    let Ok(mut cache) = CACHE.lock() else {
        return;
    };
    if cache.len() >= MAX_CACHED_PAGES {
        if let Some(oldest) = cache
            .iter()
            .min_by_key(|(_, entry)| entry.stored_at)
            .map(|(page, _)| *page)
        {
            cache.remove(&oldest);
        }
    }
    cache.insert(
        page,
        CachedPage {
            stored_at: Instant::now(),
            page: data.clone(),
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    fn topic(id: i64) -> RawTopic {
        RawTopic {
            id,
            topic_title: format!(" Новость {id} "),
            html_body: "Текст".to_string(),
            html_footer: String::new(),
            created_at: "2026-11-11T14:15:23.755+03:00".to_string(),
            linked_id: None,
            linked_type: None,
        }
    }

    #[test]
    fn keeps_only_anime_links_from_the_topic() {
        let mut anime = topic(1);
        anime.linked_type = Some("Anime".to_string());
        anime.linked_id = Some(61813);
        let mut manga = topic(2);
        manga.linked_type = Some("Manga".to_string());
        manga.linked_id = Some(61813);
        let page = build_page(1, vec![anime, manga, topic(3)]);
        assert_eq!(page.items[0].linked_anime_id, Some(61813));
        assert_eq!(page.items[1].linked_anime_id, None);
        assert_eq!(page.items[2].linked_anime_id, None);
    }

    #[test]
    fn extracts_the_mal_id_from_external_links() {
        let links = vec![
            RawExternalLink {
                kind: "official_site".to_string(),
                url: "https://example.com".to_string(),
            },
            RawExternalLink {
                kind: "myanimelist".to_string(),
                url: "http://myanimelist.net/anime/61813".to_string(),
            },
        ];
        assert_eq!(mal_id_from_links(&links), Some(61813));
        assert_eq!(mal_id_from_links(&links[..1]), None);
    }

    #[test]
    fn parses_mal_ids_from_absolute_and_suffixed_urls() {
        assert_eq!(
            parse_mal_url("https://myanimelist.net/anime/21/One_Piece"),
            Some(21)
        );
        assert_eq!(
            parse_mal_url("http://myanimelist.net/anime/61813"),
            Some(61813)
        );
        assert_eq!(parse_mal_url("https://myanimelist.net/anime/"), None);
        assert_eq!(parse_mal_url("https://example.com/anime/21"), None);
    }

    #[test]
    fn truncates_the_extra_item_and_reports_more_pages() {
        let topics = (0..=PAGE_SIZE as i64).map(topic).collect::<Vec<_>>();
        let page = build_page(2, topics);
        assert_eq!(page.items.len(), PAGE_SIZE);
        assert_eq!(page.page, 2);
        assert!(page.has_more);
    }

    #[test]
    fn a_short_page_ends_the_feed() {
        let page = build_page(1, vec![topic(1), topic(2)]);
        assert_eq!(page.items.len(), 2);
        assert!(!page.has_more);
        assert_eq!(page.items[0].site_url, "https://shikimori.io/forum/news/1");
        assert_eq!(page.items[0].title, "Новость 1");
    }

    #[test]
    fn caches_pages_by_number() {
        let page = build_page(7, vec![topic(70)]);
        store_page(7, &page);
        assert_eq!(cached_page(7).map(|cached| cached.items.len()), Some(1));
    }
}
