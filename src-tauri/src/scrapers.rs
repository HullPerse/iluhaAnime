#![allow(clippy::too_many_arguments)]

use futures::StreamExt;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};

use crate::auth::{
    load_erai_cookies, load_nekobt_api_key, load_rutracker_cookies, load_rutracker_user_agent,
    rutracker_browser_fetch,
};

const SCRAPER_MIN_INTERVAL: Duration = Duration::from_millis(250);
static SCRAPER_CONCURRENCY: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(4);
static SCRAPER_LAST_REQUEST: OnceLock<tokio::sync::Mutex<Instant>> = OnceLock::new();

async fn acquire_scraper_slot() -> Result<tokio::sync::SemaphorePermit<'static>, String> {
    let permit = SCRAPER_CONCURRENCY
        .acquire()
        .await
        .map_err(|_| "Scraper resource manager is closed".to_string())?;
    let clock = SCRAPER_LAST_REQUEST.get_or_init(|| tokio::sync::Mutex::new(Instant::now()));
    let mut last_request = clock.lock().await;
    let elapsed = last_request.elapsed();
    if elapsed < SCRAPER_MIN_INTERVAL {
        tokio::time::sleep(SCRAPER_MIN_INTERVAL.checked_sub(elapsed).unwrap()).await;
    }
    *last_request = Instant::now();
    drop(last_request);
    Ok(permit)
}

#[derive(Debug, Serialize)]
pub struct NyaaItem {
    pub title: String,
    pub magnet: String,
    pub torrent: String,
    pub size: String,
    pub seeders: u32,
    pub leechers: u32,
    pub category: String,
    pub link: String,
    pub website: String,
}

#[derive(Deserialize)]
struct NyaaJsonItem {
    name: String,
    #[serde(default)]
    magnet: String,
    #[serde(default)]
    torrent: String,
    size: serde_json::Value,
    #[serde(default)]
    seeders: u32,
    #[serde(default)]
    leechers: u32,
    #[serde(default)]
    url: String,
}

#[derive(Deserialize)]
struct NekoBtSearchData {
    results: Vec<NekoBtTorrentItem>,
}

#[derive(Deserialize)]
struct NekoBtSearchResponse {
    error: bool,
    data: NekoBtSearchData,
    message: Option<String>,
}

#[derive(Deserialize)]
struct NekoBtTorrentItem {
    id: String,
    title: String,
    magnet: String,
    #[serde(default)]
    filesize: String,
    #[serde(default)]
    seeders: String,
    #[serde(default)]
    leechers: String,
}

#[derive(Clone, Debug)]
struct Ipv4FirstResolver;

impl reqwest::dns::Resolve for Ipv4FirstResolver {
    fn resolve(&self, name: reqwest::dns::Name) -> reqwest::dns::Resolving {
        Box::pin(async move {
            let host = name.as_str().to_string();
            let mut addrs: Vec<SocketAddr> =
                tokio::net::lookup_host((host.as_str(), 0)).await?.collect();
            addrs.sort_by_key(|addr| !matches!(addr, SocketAddr::V4(_)));
            let addrs: reqwest::dns::Addrs = Box::new(addrs.into_iter());
            Ok(addrs)
        })
    }
}

fn build_client_inner(
    timeout_secs: u64,
    no_redirect: bool,
    http1_only: bool,
    user_agent: &str,
) -> Result<reqwest::Client, String> {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::ACCEPT,
        reqwest::header::HeaderValue::from_static(
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        ),
    );
    headers.insert(
        reqwest::header::ACCEPT_LANGUAGE,
        reqwest::header::HeaderValue::from_static("ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7"),
    );
    headers.insert(
        reqwest::header::HeaderName::from_static("upgrade-insecure-requests"),
        reqwest::header::HeaderValue::from_static("1"),
    );
    headers.insert(
        reqwest::header::HeaderName::from_static("sec-fetch-dest"),
        reqwest::header::HeaderValue::from_static("document"),
    );
    headers.insert(
        reqwest::header::HeaderName::from_static("sec-fetch-mode"),
        reqwest::header::HeaderValue::from_static("navigate"),
    );
    headers.insert(
        reqwest::header::HeaderName::from_static("sec-fetch-site"),
        reqwest::header::HeaderValue::from_static("none"),
    );

    let mut builder = reqwest::Client::builder()
        .user_agent(user_agent)
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .connect_timeout(std::time::Duration::from_secs(10))
        .dns_resolver(Arc::new(Ipv4FirstResolver))
        .default_headers(headers);
    if no_redirect {
        builder = builder.redirect(reqwest::redirect::Policy::none());
    }
    if http1_only {
        builder = builder.http1_only();
    }
    builder.build().map_err(|e| format!("Client error: {e}"))
}

pub fn build_client() -> Result<reqwest::Client, String> {
    build_client_inner(
        30,
        false,
        false,
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    )
}

pub fn build_nyaa_client() -> Result<reqwest::Client, String> {
    build_client_inner(
        90,
        false,
        false,
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    )
}

pub fn build_no_redirect_client() -> Result<reqwest::Client, String> {
    build_client_inner(
        30,
        true,
        true,
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    )
}

/// User-Agent used when no in-app-browser session is stored. The webview
/// captures its own (Edge `WebView2`) User-Agent at save time, because
/// rutracker's anti-bot clearance cookies are bound to the exact User-Agent
/// that passed the challenge.
pub const RUTRACKER_DEFAULT_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

/// Client for rutracker requests. rutracker's protection layer can drop
/// HTTP/2 connections from non-browser stacks, so force HTTP/1.1 (verified to
/// work from a native client), prefer IPv4, and fail fast on dead paths.
pub fn build_rutracker_client() -> Result<reqwest::Client, String> {
    build_rutracker_client_with_ua(RUTRACKER_DEFAULT_UA)
}

/// Same as [`build_rutracker_client`] but with an explicit User-Agent, the
/// one captured from the in-app browser, when available.
pub fn build_rutracker_client_with_ua(user_agent: &str) -> Result<reqwest::Client, String> {
    build_client_inner(30, false, true, user_agent)
}

pub fn build_nekobt_client() -> Result<reqwest::Client, String> {
    build_client_inner(30, false, false, "iluhaAnime/1.0")
}

/// Downloads a .torrent file from an arbitrary URL (nyaa-style sources such as
/// erai-raws and sukebei). Feeding the raw bytes into the torrent session means
/// metadata comes from the file itself, so no DHT/peer round-trip is needed.
#[tauri::command]
pub async fn fetch_torrent_bytes(url: String) -> Result<Vec<u8>, String> {
    const MAX_TORRENT_BYTES: u64 = 64 * 1024 * 1024;

    let client = build_nyaa_client()?;
    let _slot = acquire_scraper_slot().await?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Download returned HTTP {}", resp.status().as_u16()));
    }
    if let Some(len) = resp.content_length() {
        if len > MAX_TORRENT_BYTES {
            return Err("Torrent file too large".to_string());
        }
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("Read error: {e}"))?
        .to_vec();
    if bytes.len() as u64 > MAX_TORRENT_BYTES {
        return Err("Torrent file too large".to_string());
    }

    if crate::bencode::extract_info_hash(&bytes).is_err() {
        return Err("Downloaded content is not a valid .torrent file".to_string());
    }

    Ok(bytes)
}

pub fn format_file_size(bytes: f64) -> String {
    if bytes < 1024.0 {
        format!("{bytes:.2} B")
    } else if bytes < 1024.0 * 1024.0 {
        format!("{:.2} KiB", bytes / 1024.0)
    } else if bytes < 1024.0 * 1024.0 * 1024.0 {
        format!("{:.2} MiB", bytes / (1024.0 * 1024.0))
    } else {
        format!("{:.2} GiB", bytes / (1024.0 * 1024.0 * 1024.0))
    }
}

pub fn decode_windows_1251(bytes: &[u8]) -> String {
    let (cow, _, _) = encoding_rs::WINDOWS_1251.decode(bytes);
    cow.to_string()
}

fn decode_rutracker_page(bytes: &[u8]) -> String {
    match std::str::from_utf8(bytes) {
        Ok(text) => text.to_string(),
        Err(_) => decode_windows_1251(bytes),
    }
}

fn is_rutracker_challenge(text: &str) -> bool {
    let lower = text.to_lowercase();
    [
        "ddos-guard",
        "cf-chl",
        "just a moment",
        "проверка соединения",
        "доступ ограничен",
        "captcha",
    ]
    .iter()
    .any(|marker| lower.contains(marker))
}

fn rutracker_challenge_error() -> String {
    "blocked: anti-bot challenge on rutracker".to_string()
}

pub fn cookies_to_header(cookies: &HashMap<String, String>) -> String {
    cookies
        .iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join("; ")
}

pub fn extract_cookies_from_headers(
    headers: &reqwest::header::HeaderMap,
    cookies: &mut HashMap<String, String>,
) {
    for header in headers.get_all("set-cookie") {
        if let Ok(val) = header.to_str() {
            if let Some(eq_pos) = val.find('=') {
                let name = val[..eq_pos].trim().to_string();
                let rest = &val[eq_pos + 1..];
                let value = rest.split(';').next().unwrap_or("").trim().to_string();
                if !name.is_empty() {
                    cookies.insert(name, value);
                }
            }
        }
    }
}

pub fn url_encode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            b' ' => "+".to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

fn parse_seeders_leechers(s: &str) -> (u32, u32) {
    let re = regex_lite::Regex::new(r"Seeders:\s*(\d+)\s*/\s*Leechers:\s*(\d+)").ok();
    re.and_then(|r| r.captures(s)).map_or((0, 0), |c| {
        (
            c.get(1).and_then(|m| m.as_str().parse().ok()).unwrap_or(0),
            c.get(2).and_then(|m| m.as_str().parse().ok()).unwrap_or(0),
        )
    })
}

fn is_valid_torrent(name: &str, url: &str) -> bool {
    if name.trim().is_empty() {
        return false;
    }
    if name.len() < 5 {
        return false;
    }
    if !url.starts_with("/view/") {
        return false;
    }
    if name
        .chars()
        .all(|c| c.is_ascii_digit() || c.is_whitespace() || c == '.' || c == ',')
    {
        return false;
    }
    let lower = name.to_lowercase();
    if lower.starts_with("comment") || lower == "1 comment" || lower == "no comments" {
        return false;
    }
    true
}

fn nyaa_json_to_item(item: NyaaJsonItem) -> Option<NyaaItem> {
    if !is_valid_torrent(&item.name, &item.url) {
        return None;
    }

    let size_str = match &item.size {
        serde_json::Value::Number(n) => n.as_f64().map_or_else(String::new, format_file_size),
        serde_json::Value::String(s) => s.clone(),
        _ => String::new(),
    };

    Some(NyaaItem {
        title: item.name,
        magnet: item.magnet,
        torrent: if item.torrent.starts_with("http") {
            item.torrent
        } else {
            format!("https://nyaa.si{}", item.torrent)
        },
        size: size_str,
        seeders: item.seeders,
        leechers: item.leechers,
        category: String::new(),
        link: format!("https://nyaa.si{}", item.url),
        website: String::new(),
    })
}

async fn search_nyaa_impl(
    base_url: &str,
    category: &str,
    query: String,
    page: Option<u32>,
    sort: Option<String>,
    order: Option<String>,
    json_converter: fn(NyaaJsonItem) -> Option<NyaaItem>,
    html_parser: fn(&str) -> Vec<NyaaItem>,
) -> Result<Vec<NyaaItem>, String> {
    let client = build_nyaa_client()?;

    let mut params = vec![("q", query.as_str()), ("c", category), ("format", "json")];
    let page_str = page.map(|p| p.to_string());
    let sort_str = sort.as_deref();
    let order_str = order.as_deref();
    let mut extra = Vec::new();
    if let Some(ref p) = page_str {
        extra.push(("p", p.as_str()));
    }
    if let Some(s) = sort_str {
        extra.push(("s", s));
    }
    if let Some(o) = order_str {
        extra.push(("o", o));
    }
    params.extend(extra.iter().copied());

    let mut last_err = String::new();
    for attempt in 0..3 {
        if attempt > 0 {
            tokio::time::sleep(std::time::Duration::from_secs(2 * attempt)).await;
        }

        let _slot = acquire_scraper_slot().await?;
        let resp = match client.get(base_url).query(&params).send().await {
            Ok(r) => r,
            Err(e) => {
                last_err = format!("{e}");
                continue;
            }
        };

        if resp.status() == 504 || resp.status() == 503 {
            last_err = format!(
                "{} временно недоступен (HTTP {}), попробуйте позже",
                if base_url.contains("sukebei") {
                    "Sukebei"
                } else {
                    "Nyaa.si"
                },
                resp.status()
            );
            continue;
        }

        if !resp.status().is_success() {
            return Err(format!("Nyaa вернул HTTP {}", resp.status()));
        }

        let bytes = match resp.bytes().await {
            Ok(b) => b,
            Err(e) => {
                last_err = format!("{e}");
                continue;
            }
        };

        if bytes.first() == Some(&b'[') {
            let items: Vec<NyaaJsonItem> = match serde_json::from_slice(&bytes) {
                Ok(items) => items,
                Err(e) => {
                    last_err = format!("JSON parse error: {e}");
                    continue;
                }
            };

            let result: Vec<NyaaItem> = items.into_iter().filter_map(json_converter).collect();
            if !result.is_empty() || attempt >= 2 {
                return Ok(result);
            }
            last_err = "No valid torrents found".to_string();
            continue;
        }

        let html = String::from_utf8_lossy(&bytes).to_string();
        let parsed = html_parser(&html);
        if !parsed.is_empty() {
            return Ok(parsed);
        }

        last_err = "No results found".to_string();
    }

    Err(last_err)
}

fn parse_entries(html: &str) -> Vec<NyaaItem> {
    let doc = Html::parse_document(html);
    let entry_sel = Selector::parse(".home_list_entry").expect("hardcoded selector");
    let link_sel = Selector::parse(".link > a").expect("hardcoded selector");
    let size_sel = Selector::parse(".size").expect("hardcoded selector");
    let a_sel = Selector::parse("a").expect("hardcoded selector");
    let span_sel = Selector::parse("span[title]").expect("hardcoded selector");

    let mut items = Vec::new();

    for entry in doc.select(&entry_sel) {
        let title = entry
            .select(&link_sel)
            .next()
            .map(|a| a.text().collect::<String>().trim().to_string())
            .unwrap_or_default();

        if !title.to_lowercase().contains("erai-raws") {
            continue;
        }

        let size = entry
            .select(&size_sel)
            .next()
            .map(|s| s.text().collect::<String>().trim().to_string())
            .unwrap_or_default();

        let mut magnet = String::new();
        let mut torrent = String::new();
        let mut link = String::new();
        let mut website = String::new();

        for a in entry.select(&a_sel) {
            if let Some(h) = a.value().attr("href") {
                if h.starts_with("magnet:") && magnet.is_empty() {
                    magnet = h.to_string();
                } else if h.ends_with(".torrent") && torrent.is_empty() {
                    torrent = if h.starts_with("http") {
                        h.to_string()
                    } else {
                        format!("https://animetosho.org{h}")
                    };
                } else if a
                    .value()
                    .attr("class")
                    .unwrap_or_default()
                    .split_whitespace()
                    .any(|class| class == "website")
                {
                    website = absolute_detail_url("https://animetosho.org", h);
                } else if link.is_empty()
                    && (h.starts_with("/view/")
                        || h.starts_with("https://animetosho.org/view/")
                        || h.starts_with("http://animetosho.org/view/"))
                {
                    link = absolute_detail_url("https://animetosho.org", h);
                }
            }
        }

        let sealee = entry
            .select(&span_sel)
            .next()
            .and_then(|s| s.value().attr("title"))
            .unwrap_or("")
            .to_string();

        let (seeders, leechers) = parse_seeders_leechers(&sealee);

        items.push(NyaaItem {
            title,
            magnet,
            torrent,
            size,
            seeders,
            leechers,
            category: String::new(),
            link: if link.is_empty() {
                website.clone()
            } else {
                link
            },
            website,
        });
    }

    items
}

fn parse_nyaa_entries(html: &str) -> Vec<NyaaItem> {
    let doc = Html::parse_document(html);
    let row_sel = Selector::parse("table.torrent-list tbody tr").expect("hardcoded selector");
    let td_sel = Selector::parse("td").expect("hardcoded selector");
    let a_sel = Selector::parse("a").expect("hardcoded selector");

    let mut items = Vec::new();

    for row in doc.select(&row_sel) {
        let tds: Vec<_> = row.select(&td_sel).collect();
        if tds.len() < 8 {
            continue;
        }

        let title_a = tds[1].select(&a_sel).last();

        let mut title = title_a
            .and_then(|a| a.value().attr("title"))
            .map(|t| t.trim().to_string())
            .unwrap_or_default();

        if title.is_empty() {
            title = title_a
                .map(|a| a.text().collect::<String>().trim().to_string())
                .unwrap_or_default();
        }

        let link = title_a
            .and_then(|a| a.value().attr("href"))
            .unwrap_or_default()
            .to_string();

        if !is_valid_torrent(&title, &link) {
            continue;
        }

        if title.to_lowercase().ends_with("comment")
            || title.to_lowercase().ends_with("comments")
            || title.eq_ignore_ascii_case("comment")
            || title.eq_ignore_ascii_case("comments")
            || title.eq_ignore_ascii_case("no comments")
            || title.eq_ignore_ascii_case("1 comment")
        {
            continue;
        }

        let magnet = tds[2]
            .select(&a_sel)
            .find_map(|a| {
                let h = a.value().attr("href")?;
                if h.starts_with("magnet:") {
                    Some(h.to_string())
                } else {
                    None
                }
            })
            .unwrap_or_default();

        let torrent = tds[2]
            .select(&a_sel)
            .find_map(|a| {
                let h = a.value().attr("href")?;
                if h.ends_with(".torrent") {
                    Some(format!("https://nyaa.si{h}"))
                } else {
                    None
                }
            })
            .unwrap_or_default();

        let size = tds[3].text().collect::<String>().trim().to_string();

        let seeders = tds[5]
            .text()
            .collect::<String>()
            .trim()
            .parse()
            .unwrap_or(0);

        let leechers = tds[6]
            .text()
            .collect::<String>()
            .trim()
            .parse()
            .unwrap_or(0);

        let torrent_url = if link.starts_with('/') {
            format!("https://nyaa.si{link}")
        } else {
            link
        };

        items.push(NyaaItem {
            title,
            magnet,
            torrent,
            size,
            seeders,
            leechers,
            category: String::new(),
            link: torrent_url,
            website: String::new(),
        });
    }

    items
}

fn rutracker_absolute_url(href: &str) -> String {
    let href = href.trim();
    let path = href.trim_start_matches('/');
    if ["viewtopic.php", "viewtorrent.php", "tracker.php", "dl.php"]
        .iter()
        .any(|prefix| path.starts_with(prefix))
    {
        return format!("https://rutracker.org/forum/{path}");
    }
    absolute_detail_url("https://rutracker.org", href)
}

fn parse_rutracker_entries(html: &str) -> Vec<NyaaItem> {
    let doc = Html::parse_document(html);
    let row_sel = Selector::parse("tr.hl-tr, tr.hl-tr1, tr.hl-tr2, tr[id^='trs-tr-']")
        .expect("hardcoded selector");
    let td_sel = Selector::parse("td").expect("hardcoded selector");
    let topic_sel =
        Selector::parse("a[data-topic_id], a.tLink, a.med.tLink").expect("hardcoded selector");
    let seed_sel = Selector::parse(".seedmed, .seed, [class*='seed']").expect("hardcoded selector");
    let leech_sel =
        Selector::parse(".leechmed, .leech, [class*='leech']").expect("hardcoded selector");

    let mut items = Vec::new();

    for row in doc.select(&row_sel) {
        let tds: Vec<_> = row.select(&td_sel).collect();
        let topic_anchor = row.select(&topic_sel).find(|anchor| {
            anchor
                .value()
                .attr("data-topic_id")
                .is_some_and(|value| !value.is_empty())
        });
        let topic_id = topic_anchor
            .and_then(|anchor| anchor.value().attr("data-topic_id"))
            .or_else(|| row.value().attr("data-topic_id"))
            .or_else(|| {
                row.value()
                    .attr("id")
                    .and_then(|id| id.strip_prefix("trs-tr-"))
            })
            .unwrap_or_default()
            .to_string();
        if topic_id.is_empty() {
            continue;
        }

        let title = topic_anchor
            .map(|anchor| anchor.text().collect::<String>())
            .or_else(|| {
                tds.get(3)
                    .and_then(|cell| cell.select(&topic_sel).next())
                    .map(|anchor| anchor.text().collect::<String>())
            })
            .map(|title| title.trim().to_string())
            .filter(|title| !title.is_empty());
        let Some(title) = title else { continue };

        let link = topic_anchor
            .and_then(|anchor| anchor.value().attr("href"))
            .map(rutracker_absolute_url)
            .filter(|href| !href.is_empty())
            .unwrap_or_else(|| format!("https://rutracker.org/forum/viewtopic.php?t={topic_id}"));

        let cell_text = |index: usize| {
            tds.get(index)
                .map(|cell| cell.text().collect::<String>())
                .unwrap_or_default()
        };
        let size = cell_text(5).replace(['\u{a0}', '↓'], "").trim().to_string();
        let seeders = row
            .select(&seed_sel)
            .next()
            .map(|cell| parse_rus_number(&cell.text().collect::<String>()))
            .filter(|value| *value > 0)
            .unwrap_or_else(|| parse_rus_number(&cell_text(6)));
        let leechers = row
            .select(&leech_sel)
            .next()
            .map(|cell| parse_rus_number(&cell.text().collect::<String>()))
            .filter(|value| *value > 0)
            .unwrap_or_else(|| parse_rus_number(&cell_text(7)));

        items.push(NyaaItem {
            title,
            magnet: String::new(),
            torrent: String::new(),
            size,
            seeders,
            leechers,
            category: topic_id,
            link,
            website: String::new(),
        });
    }

    items
}

fn parse_rus_number(s: &str) -> u32 {
    let cleaned: String = s
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == ',')
        .collect();
    let without_comma = cleaned.replace(',', "");
    without_comma.parse().unwrap_or(0)
}

#[tauri::command]
pub async fn search_erairaws(
    query: String,
    encoding: Option<String>,
) -> Result<Vec<NyaaItem>, String> {
    let client = build_client()?;

    let search_query = match encoding.as_deref() {
        None | Some("" | "all") => format!("{query} erai-raws"),
        Some(enc) => format!("{query} erai-raws {enc}"),
    };

    let mut last_err = String::new();
    for attempt in 0..3 {
        if attempt > 0 {
            tokio::time::sleep(std::time::Duration::from_secs(2 * attempt)).await;
        }

        let _slot = acquire_scraper_slot().await?;
        let resp = match client
            .get("https://animetosho.org/search")
            .query(&[("q", &search_query)])
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                last_err = format!("Request failed: {e}");
                continue;
            }
        };

        if !resp.status().is_success() {
            last_err = format!("Search page returned HTTP {}", resp.status());
            continue;
        }

        let html = match resp.text().await {
            Ok(h) => h,
            Err(e) => {
                last_err = format!("Read error: {e}");
                continue;
            }
        };

        let items = parse_entries(&html);
        if !items.is_empty() || attempt >= 2 {
            return Ok(items);
        }
        last_err = "No torrents found".to_string();
    }

    Err(last_err)
}

#[tauri::command]
pub async fn search_nyaa(
    query: String,
    page: Option<u32>,
    sort: Option<String>,
    order: Option<String>,
) -> Result<Vec<NyaaItem>, String> {
    search_nyaa_impl(
        "https://nyaa.si/",
        "1_0",
        query,
        page,
        sort,
        order,
        nyaa_json_to_item,
        parse_nyaa_entries,
    )
    .await
}

fn sukebei_json_to_item(item: NyaaJsonItem) -> Option<NyaaItem> {
    if !is_valid_torrent(&item.name, &item.url) {
        return None;
    }

    let size_str = match &item.size {
        serde_json::Value::Number(n) => n.as_f64().map_or_else(String::new, format_file_size),
        serde_json::Value::String(s) => s.clone(),
        _ => String::new(),
    };

    Some(NyaaItem {
        title: item.name,
        magnet: item.magnet,
        torrent: if item.torrent.starts_with("http") {
            item.torrent
        } else {
            format!("https://sukebei.nyaa.si{}", item.torrent)
        },
        size: size_str,
        seeders: item.seeders,
        leechers: item.leechers,
        category: String::new(),
        link: format!("https://sukebei.nyaa.si{}", item.url),
        website: String::new(),
    })
}

fn parse_sukebei_entries(html: &str) -> Vec<NyaaItem> {
    let doc = Html::parse_document(html);
    let row_sel = Selector::parse("table.torrent-list tbody tr").expect("hardcoded selector");
    let td_sel = Selector::parse("td").expect("hardcoded selector");
    let a_sel = Selector::parse("a").expect("hardcoded selector");

    let mut items = Vec::new();

    for row in doc.select(&row_sel) {
        let tds: Vec<_> = row.select(&td_sel).collect();
        if tds.len() < 8 {
            continue;
        }

        let title_a = tds[1].select(&a_sel).next();

        let mut title = title_a
            .and_then(|a| a.value().attr("title"))
            .map(|t| t.trim().to_string())
            .unwrap_or_default();

        if title.is_empty() {
            title = title_a
                .map(|a| a.text().collect::<String>().trim().to_string())
                .unwrap_or_default();
        }

        let link = title_a
            .and_then(|a| a.value().attr("href"))
            .unwrap_or_default()
            .to_string();

        if !is_valid_torrent(&title, &link) {
            continue;
        }

        let lower = title.to_lowercase();
        if lower.ends_with("comment")
            || lower.ends_with("comments")
            || lower == "comment"
            || lower == "comments"
            || lower == "no comments"
            || lower == "1 comment"
        {
            continue;
        }

        let magnet = tds[2]
            .select(&a_sel)
            .find_map(|a| {
                let h = a.value().attr("href")?;
                if h.starts_with("magnet:") {
                    Some(h.to_string())
                } else {
                    None
                }
            })
            .unwrap_or_default();

        let torrent = tds[2]
            .select(&a_sel)
            .find_map(|a| {
                let h = a.value().attr("href")?;
                if h.ends_with(".torrent") {
                    Some(if h.starts_with("http") {
                        h.to_string()
                    } else {
                        format!("https://sukebei.nyaa.si{h}")
                    })
                } else {
                    None
                }
            })
            .unwrap_or_default();

        let size = tds[3].text().collect::<String>().trim().to_string();

        let seeders = tds[5]
            .text()
            .collect::<String>()
            .trim()
            .parse()
            .unwrap_or(0);

        let leechers = tds[6]
            .text()
            .collect::<String>()
            .trim()
            .parse()
            .unwrap_or(0);

        let torrent_url = if link.starts_with('/') {
            format!("https://sukebei.nyaa.si{link}")
        } else {
            link
        };

        items.push(NyaaItem {
            title,
            magnet,
            torrent,
            size,
            seeders,
            leechers,
            category: String::new(),
            link: torrent_url,
            website: String::new(),
        });
    }

    items
}

#[tauri::command]
pub async fn search_sukebei(
    query: String,
    page: Option<u32>,
    sort: Option<String>,
    order: Option<String>,
) -> Result<Vec<NyaaItem>, String> {
    search_nyaa_impl(
        "https://sukebei.nyaa.si/",
        "0_0",
        query,
        page,
        sort,
        order,
        sukebei_json_to_item,
        parse_sukebei_entries,
    )
    .await
}

#[tauri::command]
pub async fn search_rutracker(
    app_handle: tauri::AppHandle,
    query: String,
) -> Result<Vec<NyaaItem>, String> {
    let cookies = load_rutracker_cookies(&app_handle);
    if cookies.is_empty() {
        return Err("Not authenticated. Please login to rutracker first.".to_string());
    }

    let search_url = format!(
        "https://rutracker.org/forum/tracker.php?nm={}",
        url_encode(&query)
    );
    let browser_response = rutracker_browser_fetch(&app_handle, &search_url).await?;
    let (status, bytes) = if let Some(response) = browser_response {
        (response.status, response.body)
    } else {
        let user_agent = load_rutracker_user_agent(&app_handle)
            .unwrap_or_else(|| RUTRACKER_DEFAULT_UA.to_string());
        let client = build_rutracker_client_with_ua(&user_agent)?;
        let _slot = acquire_scraper_slot().await?;
        let resp = client
            .get("https://rutracker.org/forum/tracker.php")
            .header("Cookie", cookies_to_header(&cookies))
            .header("Referer", "https://rutracker.org/forum/tracker.php")
            .query(&[("nm", query.as_str())])
            .send()
            .await
            .map_err(|e| format!("Rutracker search failed: {e}"))?;
        let status = resp.status().as_u16();
        let bytes = resp.bytes().await.unwrap_or_default().to_vec();
        (status, bytes)
    };
    let html = decode_rutracker_page(&bytes);

    if !(200..300).contains(&status) {
        // 403 is usually the anti-bot layer (DDoS-Guard/Cloudflare) rejecting
        // the request; surface that as a "blocked" error instead of a raw
        // status so the UI can hint at re-saving the browser session.
        if is_rutracker_challenge(&html) {
            return Err(rutracker_challenge_error());
        }
        return Err(format!("Rutracker search returned HTTP {status}"));
    }

    // Anti-bot providers can return a challenge page with HTTP 200. Do not
    // parse it as an empty search result or mark the session as successful.
    if is_rutracker_challenge(&html) {
        return Err(rutracker_challenge_error());
    }

    Ok(parse_rutracker_entries(&html))
}

#[tauri::command]
pub async fn search_nekobt(
    app_handle: tauri::AppHandle,
    query: String,
    page: Option<u32>,
) -> Result<Vec<NyaaItem>, String> {
    let key = load_nekobt_api_key(&app_handle);
    if key.is_empty() {
        return Err("Not authenticated. Please enter your nekoBT API key first.".to_string());
    }

    if query.trim().is_empty() {
        return Err("Search query is empty".to_string());
    }

    let client = build_nekobt_client()?;
    let page = page.unwrap_or(1);
    let offset = (u64::from(page).saturating_sub(1)) * 20;
    let limit = 20u64;

    let _slot = acquire_scraper_slot().await?;
    let resp = client
        .get("https://nekobt.to/api/v1/torrents/search")
        .header("Cookie", format!("ssid={key}"))
        .query(&[
            ("query", query.trim()),
            ("limit", &limit.to_string()),
            ("offset", &offset.to_string()),
            ("sort_by", "seeders"),
        ])
        .send()
        .await
        .map_err(|e| format!("nekoBT search failed: {e}"))?;

    if !resp.status().is_success() {
        if resp.status() == 429 {
            return Err("nekoBT rate limit exceeded. Try again later.".to_string());
        }
        return Err(format!("nekoBT вернул HTTP {}", resp.status()));
    }

    let bytes = resp.bytes().await.map_err(|e| format!("Read error: {e}"))?;
    let response: NekoBtSearchResponse =
        serde_json::from_slice(&bytes).map_err(|e| format!("Parse error: {e}"))?;

    if response.error {
        let msg = response
            .message
            .unwrap_or_else(|| "Unknown error".to_string());
        return Err(msg);
    }

    let items: Vec<NyaaItem> = response
        .data
        .results
        .into_iter()
        .map(|t| {
            let size = if t.filesize.is_empty() {
                String::new()
            } else if let Ok(bytes) = t.filesize.parse::<f64>() {
                format_file_size(bytes)
            } else {
                t.filesize
            };

            let seeders = t.seeders.parse().unwrap_or(0);
            let leechers = t.leechers.parse().unwrap_or(0);

            let id = t.id;

            NyaaItem {
                title: t.title,
                magnet: t.magnet,
                torrent: String::new(),
                size,
                seeders,
                leechers,
                category: id.clone(),
                link: format!("https://nekobt.to/torrents/{id}"),
                website: String::new(),
            }
        })
        .collect();

    Ok(items)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentDetailField {
    pub label: String,
    pub value: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentDetailFile {
    pub name: String,
    pub size: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentDetailComment {
    pub author: String,
    pub date: String,
    pub text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentDetails {
    pub source: String,
    pub url: String,
    pub title: String,
    pub description: String,
    pub category: String,
    pub size: String,
    pub uploaded_at: String,
    pub updated_at: String,
    pub seeders: u32,
    pub leechers: u32,
    pub completed: u32,
    pub downloads: u32,
    pub info_hash: String,
    pub magnet: String,
    pub torrent_url: String,
    pub fields: Vec<TorrentDetailField>,
    pub files: Vec<TorrentDetailFile>,
    pub screenshots: Vec<String>,
    pub comments: Vec<TorrentDetailComment>,
    pub notice: Option<String>,
}

fn detail_origin(source: &str) -> Option<&'static str> {
    match source {
        "nyaa" => Some("https://nyaa.si"),
        "sukebei" => Some("https://sukebei.nyaa.si"),
        "rutracker" => Some("https://rutracker.org"),
        "nekobt" => Some("https://nekobt.to"),
        "erai-raws" => Some("https://animetosho.org"),
        _ => None,
    }
}

fn detail_origin_for_url(source: &str, url: &str) -> Option<&'static str> {
    let parsed = url::Url::parse(url).ok()?;
    if parsed.scheme() != "https" {
        return None;
    }
    let host = parsed.host_str()?.to_ascii_lowercase();
    match source {
        "erai-raws" if host == "animetosho.org" => Some("https://animetosho.org"),
        "erai-raws" if host == "erai-raws.info" || host == "www.erai-raws.info" => {
            Some("https://www.erai-raws.info")
        }
        _ => {
            let origin = detail_origin(source)?;
            let origin_url = url::Url::parse(origin).ok()?;
            let origin_host = origin_url.host_str()?;
            (host == origin_host).then_some(origin)
        }
    }
}

fn validate_detail_url(source: &str, url: &str) -> Result<&'static str, String> {
    detail_origin_for_url(source, url)
        .ok_or_else(|| "The torrent URL is outside the selected source".to_string())
}
fn absolute_detail_url(origin: &str, href: &str) -> String {
    let href = href.trim();
    if let Some(http_origin) = origin
        .strip_prefix("https://")
        .map(|host| format!("http://{host}"))
    {
        if href == http_origin {
            return origin.to_string();
        }
        if let Some(rest) = href.strip_prefix(&http_origin) {
            if rest.starts_with('/') {
                return format!("{origin}{rest}");
            }
        }
    }
    if href.starts_with("https://") || href.starts_with("http://") {
        href.to_string()
    } else if href.starts_with("//") {
        format!("https:{href}")
    } else if href.contains(':') {
        String::new()
    } else if href.starts_with('/') {
        format!("{origin}{href}")
    } else {
        format!("{origin}/{}", href.trim_start_matches('/'))
    }
}

fn clean_detail_text(value: impl Into<String>) -> String {
    let collapsed = value
        .into()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    [
        (" .", "."),
        (" ,", ","),
        (" !", "!"),
        (" ?", "?"),
        (" ;", ";"),
        (" :", ":"),
        (" )", ")"),
        ("( ", "("),
    ]
    .iter()
    .fold(collapsed, |text, (from, to)| text.replace(from, to))
    .trim()
    .to_string()
}

fn clean_detail_text_multiline(value: impl Into<String>) -> String {
    let mut cleaned = String::new();
    for line in value.into().lines() {
        let line = clean_detail_text(line);
        if line.is_empty() {
            continue;
        }
        if !cleaned.is_empty() {
            cleaned.push('\n');
        }
        cleaned.push_str(&line);
    }
    cleaned
}

fn element_text(element: scraper::ElementRef<'_>) -> String {
    clean_detail_text(element.text().collect::<Vec<_>>().join(" "))
}

const DETAIL_BLOCK_TAGS: &[&str] = &[
    "address",
    "article",
    "aside",
    "blockquote",
    "br",
    "caption",
    "dd",
    "details",
    "div",
    "dl",
    "dt",
    "fieldset",
    "figcaption",
    "figure",
    "footer",
    "form",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "hr",
    "li",
    "main",
    "nav",
    "ol",
    "p",
    "pre",
    "section",
    "summary",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "tr",
    "ul",
];

fn element_text_multiline(element: scraper::ElementRef<'_>) -> String {
    let mut out = String::new();
    for node in element.descendants() {
        if let Some(text) = node.value().as_text() {
            out.push_str(text);
        } else if let Some(el) = node.value().as_element() {
            if DETAIL_BLOCK_TAGS.contains(&el.name()) {
                out.push('\n');
            }
        }
    }
    clean_detail_text_multiline(out)
}

fn first_detail_text(doc: &Html, selectors: &[&str]) -> String {
    selectors
        .iter()
        .filter_map(|raw| Selector::parse(raw).ok())
        .find_map(|selector| doc.select(&selector).next().map(element_text))
        .unwrap_or_default()
}

fn first_detail_text_multiline(doc: &Html, selectors: &[&str]) -> String {
    selectors
        .iter()
        .filter_map(|raw| Selector::parse(raw).ok())
        .find_map(|selector| doc.select(&selector).next().map(element_text_multiline))
        .unwrap_or_default()
}

fn detail_number(value: &str) -> u32 {
    let digits: String = value.chars().filter(char::is_ascii_digit).collect();
    digits.parse().unwrap_or(0)
}

fn detail_field(fields: &[TorrentDetailField], names: &[&str]) -> String {
    fields
        .iter()
        .find(|field| {
            let label = field.label.to_lowercase();
            names.iter().any(|name| label.contains(name))
        })
        .map(|field| field.value.clone())
        .unwrap_or_default()
}

fn parse_detail_fields(doc: &Html) -> Vec<TorrentDetailField> {
    let row_sel = Selector::parse("table tr").expect("hardcoded selector");
    let cell_sel = Selector::parse("th, td").expect("hardcoded selector");
    let mut fields = Vec::new();

    for row in doc.select(&row_sel) {
        let cells: Vec<String> = row.select(&cell_sel).map(element_text_multiline).collect();
        if cells.len() < 2 {
            continue;
        }
        let label = cells[0].trim_end_matches(':').trim().to_string();
        let value = cells[1..].join("\n");
        if !label.is_empty() && !value.is_empty() && label.len() < 80 && value.len() < 500 {
            fields.push(TorrentDetailField { label, value });
        }
        if fields.len() >= 40 {
            break;
        }
    }

    let dl_sel = Selector::parse("dl").expect("hardcoded selector");
    let term_sel = Selector::parse("dt, dd").expect("hardcoded selector");
    for definition_list in doc.select(&dl_sel) {
        let terms: Vec<String> = definition_list
            .select(&term_sel)
            .map(element_text_multiline)
            .filter(|value| !value.is_empty())
            .collect();
        for pair in terms.chunks(2) {
            if pair.len() < 2 || fields.len() >= 40 {
                break;
            }
            let label = pair[0].trim_end_matches(':').trim().to_string();
            let value = pair[1].clone();
            if !label.is_empty() && label.len() < 80 && value.len() < 500 {
                fields.push(TorrentDetailField { label, value });
            }
        }
        if fields.len() >= 40 {
            break;
        }
    }

    let mut bootstrap_fields = parse_bootstrap_detail_fields(doc);
    for field in bootstrap_fields.drain(..) {
        let duplicate = fields
            .iter()
            .any(|existing: &TorrentDetailField| existing.label == field.label);
        if !duplicate && fields.len() < 40 {
            fields.push(field);
        }
    }
    fields
}

fn parse_bootstrap_detail_fields(doc: &Html) -> Vec<TorrentDetailField> {
    let row_sel = Selector::parse(".panel-body .row").expect("hardcoded selector");
    let cell_sel = Selector::parse("div[class*='col-md-']").expect("hardcoded selector");
    let mut fields = Vec::new();
    for row in doc.select(&row_sel) {
        let cells: Vec<String> = row
            .select(&cell_sel)
            .map(element_text_multiline)
            .filter(|value| !value.is_empty())
            .collect();
        for pair in cells.chunks(2) {
            if pair.len() < 2 {
                continue;
            }
            let label = pair[0].trim_end_matches(':').trim().to_string();
            let value = pair[1].trim().to_string();
            if !label.is_empty() && label.len() < 80 && value.len() < 500 {
                fields.push(TorrentDetailField { label, value });
            }
            if fields.len() >= 40 {
                return fields;
            }
        }
    }
    fields
}

fn parse_detail_files(doc: &Html) -> Vec<TorrentDetailFile> {
    let selectors = [
        ".torrent-file-list li",
        ".torrent-file-list tr",
        ".torrent-file-list .file",
        ".file-list li",
        ".file-list tr",
        ".file-list .file",
        ".file-list .row",
        ".files li",
        ".files tr",
        ".files .file",
        "ul.torrent-files li",
        "#filelist li",
        "#filelist tr",
        "#torrent-files li",
        "#torrent-files tr",
        ".filelist li",
        ".filelist tr",
        "table.files tr",
        "table.filelist tr",
    ];
    let mut files = Vec::new();
    for raw in selectors {
        let Ok(selector) = Selector::parse(raw) else {
            continue;
        };
        for element in doc.select(&selector) {
            let text = element_text(element);
            if text.is_empty() || text.len() > 500 {
                continue;
            }
            let cells = Selector::parse("td, span").expect("hardcoded selector");
            let parts: Vec<String> = element
                .select(&cells)
                .map(element_text)
                .filter(|s| !s.is_empty())
                .collect();
            let nested_sel = Selector::parse("li, tr, ul").expect("hardcoded selector");
            let has_nested = element.select(&nested_sel).next().is_some();
            let (name, size) = if has_nested {
                continue;
            } else if parts.len() >= 2 {
                (
                    parts[..parts.len() - 1].join(" / "),
                    parts.last().cloned().unwrap_or_default(),
                )
            } else if parts.len() == 1 {
                let size_text = parts[0]
                    .trim()
                    .trim_start_matches('(')
                    .trim_end_matches(')');
                if looks_like_file_size(size_text) {
                    let name = text
                        .trim_end()
                        .strip_suffix(parts[0].as_str())
                        .map(str::trim)
                        .filter(|name| !name.is_empty())
                        .unwrap_or(&text)
                        .to_string();
                    (name, parts[0].clone())
                } else {
                    (text, String::new())
                }
            } else {
                (text, String::new())
            };
            if !files
                .iter()
                .any(|file: &TorrentDetailFile| file.name == name)
            {
                files.push(TorrentDetailFile { name, size });
            }
            if files.len() >= 300 {
                break;
            }
        }
        if !files.is_empty() {
            break;
        }
    }

    if files.is_empty() {
        let row_sel = Selector::parse("table tr").expect("hardcoded selector");
        let cell_sel = Selector::parse("td, th").expect("hardcoded selector");
        let file_name_re =
            regex_lite::Regex::new(r"(?i)(?:\.[a-z0-9]{1,8})(?:$|[\s)])").expect("hardcoded regex");
        for row in doc.select(&row_sel) {
            let cells: Vec<String> = row
                .select(&cell_sel)
                .map(element_text)
                .filter(|value| !value.is_empty())
                .collect();
            if cells.len() < 2 || !file_name_re.is_match(&cells[0]) {
                continue;
            }
            let name = cells[..cells.len() - 1].join(" / ");
            let size = cells.last().cloned().unwrap_or_default();
            if !files.iter().any(|file| file.name == name) {
                files.push(TorrentDetailFile { name, size });
            }
            if files.len() >= 300 {
                break;
            }
        }
    }
    files
}

const IMAGE_NOISE: &[&str] = &[
    "logo", "avatar", "icon", "emoji", "emoticon", "smilie", "smiley", "captcha", "spacer",
    "pixel", "blank", "rating", "bullet", "arrow", "banner", "favicon", "imageset", "/styles/",
    "loading", "userbar", "1x1", "q_icon", "edited", "online", "offline", "flag_",
];

fn is_image_noise(class: &str, src_lower: &str) -> bool {
    let hay = format!("{class} {src_lower}");
    IMAGE_NOISE.iter().any(|part| hay.contains(part))
}

fn push_image_src(src: &str, origin: &str, images: &mut Vec<String>) {
    let src = src.trim();
    if src.is_empty() {
        return;
    }
    let url = absolute_detail_url(origin, src);
    if url.starts_with("https://") && !images.contains(&url) {
        images.push(url);
    }
}

fn collect_imgs(
    element: scraper::ElementRef<'_>,
    origin: &str,
    images: &mut Vec<String>,
    limit: usize,
) {
    let image_sel = Selector::parse("img").expect("hardcoded selector");
    for image in element.select(&image_sel) {
        let value = image.value();
        let src = value
            .attr("data-original")
            .or_else(|| value.attr("data-src"))
            .or_else(|| value.attr("src"))
            .unwrap_or_default();
        let class = value.attr("class").unwrap_or_default().to_lowercase();
        if src.trim().is_empty() || is_image_noise(&class, &src.to_lowercase()) {
            continue;
        }
        push_image_src(src, origin, images);
        if images.len() >= limit {
            break;
        }
    }
}

fn collect_markdown_imgs(
    element: scraper::ElementRef<'_>,
    origin: &str,
    images: &mut Vec<String>,
    limit: usize,
) {
    let html = element.inner_html();
    let Ok(re) = regex_lite::Regex::new(r"!\[[^\]]*\]\((https?://[^)\s]+)\)") else {
        return;
    };
    for cap in re.captures_iter(&html) {
        if let Some(m) = cap.get(1) {
            push_image_src(&m.as_str().replace("&amp;", "&"), origin, images);
            if images.len() >= limit {
                break;
            }
        }
    }
}

fn description_container<'a>(doc: &'a Html, source: &str) -> Option<scraper::ElementRef<'a>> {
    let selectors: &[&str] = match source {
        "rutracker" => &[".post_body", ".post-message", ".postcontent"],
        "nyaa" | "sukebei" => &[
            "#torrent-description",
            ".torrent-description",
            ".panel-body.markdown-text",
            ".panel-body",
        ],
        "erai-raws" => &[
            ".comment_message",
            ".user_message_c",
            ".comment-body",
            ".comment-content",
        ],
        "nekobt" => &[],
        _ => &[
            "#torrent-description",
            ".torrent-description",
            ".post_body",
            ".post-message",
            ".comment_message",
            ".user_message_c",
            ".panel-body.markdown-text",
            ".description",
        ],
    };
    selectors
        .iter()
        .filter_map(|raw| Selector::parse(raw).ok())
        .find_map(|selector| doc.select(&selector).next())
}

fn collect_rutracker_screenshots(doc: &Html, origin: &str) -> Vec<String> {
    let post_sel =
        Selector::parse(".post_body, .post-message, .postcontent").expect("hardcoded selector");
    let Some(post) = doc.select(&post_sel).next() else {
        return Vec::new();
    };

    let spoiler_sel = Selector::parse(
        ".sp-wrap, .spoiler, .spoil, [class*='spoiler'], .screenshots, #screenshots",
    )
    .expect("hardcoded selector");
    let heading_sel = Selector::parse(".sp-head, .sp-title, .spoiler-title, .spoil-head")
        .expect("hardcoded selector");
    let body_sel = Selector::parse(".sp-body, .spoiler-body, .sp-content, .spoil-body")
        .expect("hardcoded selector");
    let mut images = Vec::new();

    for spoiler in post.select(&spoiler_sel) {
        let heading = spoiler
            .select(&heading_sel)
            .next()
            .map(element_text)
            .unwrap_or_default()
            .to_lowercase();
        let class = spoiler
            .value()
            .attr("class")
            .unwrap_or_default()
            .to_lowercase();
        let is_screenshot_spoiler = heading.contains("скриншот")
            || heading.contains("screenshot")
            || class.contains("screenshot");
        if !is_screenshot_spoiler {
            continue;
        }

        let image_area = spoiler.select(&body_sel).next().unwrap_or(spoiler);
        collect_imgs(image_area, origin, &mut images, 24);
        if images.len() >= 24 {
            break;
        }
    }
    images
}

fn parse_detail_screenshots(doc: &Html, origin: &str, source: &str) -> Vec<String> {
    if source == "nekobt" {
        return Vec::new();
    }
    if source == "rutracker" {
        return collect_rutracker_screenshots(doc, origin);
    }

    let mut images: Vec<String> = Vec::new();
    const LIMIT: usize = 24;

    if source == "erai-raws" {
        let screenshot_selectors = [
            ".screenshots",
            "#screenshots",
            ".screenshot-list",
            ".preview-list",
            ".preview",
        ];
        for raw in screenshot_selectors {
            let Ok(selector) = Selector::parse(raw) else {
                continue;
            };
            if let Some(container) = doc.select(&selector).next() {
                collect_imgs(container, origin, &mut images, LIMIT);
                if !images.is_empty() {
                    break;
                }
            }
        }
    }

    if images.is_empty() {
        if let Some(container) = description_container(doc, source) {
            collect_imgs(container, origin, &mut images, LIMIT);
            collect_markdown_imgs(container, origin, &mut images, LIMIT);
        }
    }

    if images.is_empty() {
        let image_sel = Selector::parse("img").expect("hardcoded selector");
        for image in doc.select(&image_sel) {
            let value = image.value();
            let src = value
                .attr("data-original")
                .or_else(|| value.attr("data-src"))
                .or_else(|| value.attr("src"))
                .unwrap_or_default();
            let class = value.attr("class").unwrap_or_default().to_lowercase();
            if src.trim().is_empty() || is_image_noise(&class, &src.to_lowercase()) {
                continue;
            }
            push_image_src(src, origin, &mut images);
            if images.len() >= LIMIT {
                break;
            }
        }
    }
    images
}

fn parse_detail_comments(doc: &Html, source: &str) -> Vec<TorrentDetailComment> {
    let block_sel = Selector::parse(".comment, .comment-box, .comment-item, .post")
        .expect("hardcoded selector");
    let author_sel = Selector::parse(".author, .username, .user, [class*='author']")
        .expect("hardcoded selector");
    let date_sel =
        Selector::parse("time, .date, .timestamp, [class*='date']").expect("hardcoded selector");
    let body_sel = Selector::parse(".comment-body, .comment-content, .post_body, .text, p")
        .expect("hardcoded selector");
    let mut comments = Vec::new();
    let mut skipped_primary_description = false;

    for block in doc.select(&block_sel) {
        let is_primary_description = match source {
            "rutracker" => block.select(&body_sel).next().is_some(),
            "erai-raws" => block
                .select(
                    &Selector::parse(".comment_message, .user_message_c")
                        .expect("hardcoded selector"),
                )
                .next()
                .is_some(),
            _ => false,
        };
        if is_primary_description && !skipped_primary_description {
            skipped_primary_description = true;
            continue;
        }

        let text = element_text(block);
        if text.is_empty() || text.len() > 4000 {
            continue;
        }
        let author = block
            .select(&author_sel)
            .next()
            .map(element_text)
            .unwrap_or_default();
        let date = block
            .select(&date_sel)
            .next()
            .map(element_text)
            .unwrap_or_default();
        let body = block
            .select(&body_sel)
            .next()
            .map_or_else(|| element_text_multiline(block), element_text_multiline);
        if !comments
            .iter()
            .any(|comment: &TorrentDetailComment| comment.text == body)
        {
            comments.push(TorrentDetailComment {
                author,
                date,
                text: body,
            });
        }
        if comments.len() >= 100 {
            break;
        }
    }
    comments
}

fn text_stat_value(text: &str, labels: &[&str]) -> String {
    let lower = text.to_lowercase();
    for label in labels {
        let Some(start) = lower.find(label) else {
            continue;
        };
        let value = text[start + label.len()..]
            .trim_start_matches(|ch: char| ch == ':' || ch.is_whitespace())
            .split('|')
            .next()
            .and_then(|part| part.lines().find(|line| !line.trim().is_empty()))
            .unwrap_or_default()
            .trim();
        if !value.is_empty() {
            return value.to_string();
        }
    }
    String::new()
}

fn parse_rutracker_topic_stats(doc: &Html) -> (String, String, u32, u32, u32) {
    let body_sel = Selector::parse("body").expect("hardcoded selector");
    let text = doc
        .select(&body_sel)
        .next()
        .map(element_text_multiline)
        .unwrap_or_default();
    let size = text_stat_value(&text, &["размер"]);
    let registered = text_stat_value(&text, &["зарегистрирован"]);
    let downloaded = text_stat_value(&text, &[".torrent скачан", "скачан"]);
    let seeders = parse_rus_number(&text_stat_value(&text, &["сиды"]));
    let leechers = parse_rus_number(&text_stat_value(&text, &["личи"]));
    (
        size,
        registered,
        parse_rus_number(&downloaded),
        seeders,
        leechers,
    )
}

fn rutracker_topic_id(url: &str) -> Option<String> {
    let start = ["?t=", "&t="]
        .iter()
        .filter_map(|marker| url.find(marker).map(|index| index + marker.len()))
        .min()?;
    let topic_id: String = url[start..]
        .chars()
        .take_while(char::is_ascii_digit)
        .collect();
    (!topic_id.is_empty()).then_some(topic_id)
}

fn looks_like_file_name(value: &str) -> bool {
    regex_lite::Regex::new(r"(?i)\.[a-z0-9]{1,8}(?:$|[\s)])")
        .expect("hardcoded regex")
        .is_match(value)
}

fn looks_like_file_size(value: &str) -> bool {
    regex_lite::Regex::new(
        r"(?i)^\s*[0-9]+(?:[.,][0-9]+)?\s*(?:b|kb|kib|mb|mib|gb|gib|tb|tib|байт|кб|мб|гб)\s*$",
    )
    .expect("hardcoded regex")
    .is_match(value)
}

fn parse_rutracker_file_tree(response: &str) -> Vec<TorrentDetailFile> {
    let html = serde_json::from_str::<serde_json::Value>(response)
        .ok()
        .and_then(|json| {
            json.get("html")
                .or_else(|| json.get("data"))
                .and_then(|value| value.as_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| response.to_string());
    let doc = Html::parse_document(&html);
    let row_sel = Selector::parse(
        "#tor-filelist li, #tor-filelist tr, #tor-filelist .file, #tor-filelist .ft-file, .filetree li, .filetree tr",
    )
    .expect("hardcoded selector");
    let cell_sel = Selector::parse("td, th, span, a").expect("hardcoded selector");
    let nested_sel = Selector::parse("li, tr").expect("hardcoded selector");
    let mut files = Vec::new();

    for row in doc.select(&row_sel) {
        if row.select(&nested_sel).next().is_some() {
            continue;
        }
        let text = element_text(row);
        if text.is_empty() || text.len() > 1000 {
            continue;
        }
        let parts: Vec<String> = row
            .select(&cell_sel)
            .map(element_text)
            .filter(|part| !part.is_empty())
            .collect();
        let name = parts
            .iter()
            .find(|part| looks_like_file_name(part))
            .cloned()
            .or_else(|| {
                let candidate = text.split(" (").next().unwrap_or(text.as_str()).trim();
                looks_like_file_name(candidate).then_some(candidate.to_string())
            });
        let Some(name) = name else { continue };
        let size = parts
            .iter()
            .rev()
            .find(|part| looks_like_file_size(part))
            .cloned()
            .unwrap_or_default();
        if !files
            .iter()
            .any(|file: &TorrentDetailFile| file.name == name)
        {
            files.push(TorrentDetailFile { name, size });
        }
        if files.len() >= 500 {
            break;
        }
    }
    files
}

async fn fetch_rutracker_file_tree(
    app_handle: &tauri::AppHandle,
    client: &reqwest::Client,
    cookies: &HashMap<String, String>,
    topic_id: &str,
) -> Result<String, String> {
    let file_tree_url = format!("https://rutracker.org/forum/viewtorrent.php?t={topic_id}");
    let browser_response = rutracker_browser_fetch(app_handle, &file_tree_url).await?;
    let (status, bytes) = if let Some(response) = browser_response {
        (response.status, response.body)
    } else {
        let response = client
            .get("https://rutracker.org/forum/viewtorrent.php")
            .header("Cookie", cookies_to_header(cookies))
            .header("Referer", "https://rutracker.org/forum/")
            .header("X-Requested-With", "XMLHttpRequest")
            .query(&[("t", topic_id)])
            .send()
            .await
            .map_err(|error| format!("Rutracker file list request failed: {error}"))?;
        let status = response.status().as_u16();
        let bytes = response
            .bytes()
            .await
            .map_err(|error| format!("Rutracker file list read failed: {error}"))?
            .to_vec();
        (status, bytes)
    };
    const MAX_FILE_TREE_BYTES: usize = 4 * 1024 * 1024;
    if bytes.len() > MAX_FILE_TREE_BYTES {
        return Err("Rutracker file list is too large to display safely".to_string());
    }
    let html = decode_rutracker_page(&bytes);
    if !(200..300).contains(&status) {
        if is_rutracker_challenge(&html) {
            return Err(rutracker_challenge_error());
        }
        return Err(format!("Rutracker file list returned HTTP {status}"));
    }
    if is_rutracker_challenge(&html) {
        return Err(rutracker_challenge_error());
    }
    Ok(html)
}

fn max_labeled_number(text: &str, label: &str) -> u32 {
    let label = label.to_ascii_lowercase();
    let lines: Vec<&str> = text.lines().collect();
    let mut maximum = 0;
    for (index, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        let Some((name, value)) = trimmed.split_once(':') else {
            continue;
        };
        if name.trim().to_ascii_lowercase() != label {
            continue;
        }
        let candidate = value
            .trim()
            .parse::<u32>()
            .ok()
            .or_else(|| lines.get(index + 1)?.trim().parse::<u32>().ok());
        if let Some(value) = candidate {
            maximum = maximum.max(value);
        }
    }
    maximum
}

fn parse_animetosho_stats(doc: &Html) -> (String, String, u32, u32, u32) {
    let body_sel = Selector::parse("body").expect("hardcoded selector");
    let text = doc
        .select(&body_sel)
        .next()
        .map(element_text_multiline)
        .unwrap_or_default();
    let size = animetosho_size(&text);
    let date = text_stat_value(&text, &["date submitted"]);
    (
        size,
        date,
        max_labeled_number(&text, "C"),
        max_labeled_number(&text, "S"),
        max_labeled_number(&text, "L"),
    )
}

fn animetosho_size(text: &str) -> String {
    let trimmed = text.trim();
    if looks_like_file_size(trimmed) {
        return trimmed.to_string();
    }
    let lower = text.to_lowercase();
    let window = lower.find("file name").map_or(text, |label_start| {
        &text[label_start..text.len().min(label_start + 300)]
    });
    let Ok(re) = regex_lite::Regex::new(r"\(([0-9.,]+\s*(?:[KMGT]i?B|байт|B))\s*\)") else {
        return String::new();
    };
    re.captures(window)
        .and_then(|cap| cap.get(1))
        .map(|m| m.as_str().trim().to_string())
        .unwrap_or_default()
}

fn parse_animetosho_comment(doc: &Html) -> String {
    let row_sel = Selector::parse("tr").expect("hardcoded selector");
    let cell_sel = Selector::parse("th, td").expect("hardcoded selector");
    for row in doc.select(&row_sel) {
        let cells: Vec<String> = row
            .select(&cell_sel)
            .map(element_text_multiline)
            .filter(|value| !value.is_empty())
            .collect();
        if cells.len() >= 2 && cells[0].trim().eq_ignore_ascii_case("comment") {
            return cells[1..].join("\n");
        }
    }
    String::new()
}

fn parse_animetosho_file(doc: &Html) -> Vec<TorrentDetailFile> {
    let row_sel = Selector::parse("tr").expect("hardcoded selector");
    let cell_sel = Selector::parse("th, td").expect("hardcoded selector");
    for row in doc.select(&row_sel) {
        let cells: Vec<String> = row
            .select(&cell_sel)
            .map(element_text)
            .filter(|value| !value.is_empty())
            .collect();
        if cells.len() < 2 || !cells[0].trim().eq_ignore_ascii_case("file name (size)") {
            continue;
        }
        let raw = &cells[1];
        let name = raw
            .split('(')
            .next()
            .map(str::trim)
            .filter(|name| looks_like_file_name(name))
            .unwrap_or_default()
            .to_string();
        let size = animetosho_size(raw);
        if !name.is_empty() {
            return vec![TorrentDetailFile { name, size }];
        }
    }
    Vec::new()
}

fn parse_torrent_detail_html(source: &str, url: &str, html: &str) -> TorrentDetails {
    let origin = detail_origin_for_url(source, url)
        .or_else(|| detail_origin(source))
        .unwrap_or("");
    let doc = Html::parse_document(html);
    let (topic_size, topic_registered, topic_downloads, topic_seeders, topic_leechers) =
        if source == "rutracker" {
            parse_rutracker_topic_stats(&doc)
        } else if source == "erai-raws" {
            parse_animetosho_stats(&doc)
        } else {
            (String::new(), String::new(), 0, 0, 0)
        };
    let fields = if source == "rutracker" {
        Vec::new()
    } else {
        parse_detail_fields(&doc)
    };
    let title_selectors: &[&str] = match source {
        "nyaa" | "sukebei" => &[
            "h3.panel-title",
            ".panel-title",
            ".torrent-title",
            "h1",
            "h2",
            "title",
        ],
        "rutracker" => &[
            "h1.torTopic",
            "h1.maintitle",
            ".topic-title",
            ".maintitle",
            "h1",
            "h2",
            "title",
        ],
        "erai-raws" => &[
            ".release-title",
            ".torrent-title",
            "h1",
            "h2",
            ".title",
            "title",
        ],
        "nekobt" => &[".torrent-title", "h1", "h2", "title"],
        _ => &["h1", "h2", "title"],
    };
    let description_selectors: &[&str] = match source {
        "nyaa" | "sukebei" => &[
            "#torrent-description",
            ".torrent-description",
            ".panel-body.markdown-text",
            ".panel-body",
            ".description",
        ],
        "rutracker" => &[".post_body", ".post-message", ".postcontent"],
        "erai-raws" => &[
            ".comment_message",
            ".user_message_c",
            ".comment-body",
            ".comment-content",
            ".description",
        ],
        "nekobt" => &[],
        _ => &[
            "#torrent-description",
            ".torrent-description",
            ".description",
            ".post_body",
        ],
    };
    let title = first_detail_text(&doc, title_selectors);
    let mut description = first_detail_text_multiline(&doc, description_selectors);
    if description.is_empty() && source == "erai-raws" {
        description = parse_animetosho_comment(&doc);
    }
    let mut magnet = String::new();
    let mut torrent_url = String::new();
    let link_sel = Selector::parse("a").expect("hardcoded selector");
    for link in doc.select(&link_sel) {
        let href = link.value().attr("href").unwrap_or_default();
        if href.starts_with("magnet:") && magnet.is_empty() {
            magnet = href.to_string();
            continue;
        }
        if torrent_url.is_empty() {
            let class = link.value().attr("class").unwrap_or_default();
            let is_rutracker_download = source == "rutracker"
                && (href.to_lowercase().contains("dl.php")
                    || class.split_whitespace().any(|value| value == "dl-link"));
            if href.to_lowercase().contains(".torrent") || is_rutracker_download {
                let candidate = absolute_detail_url(origin, href);
                let same_origin = candidate == origin
                    || candidate
                        .strip_prefix(origin)
                        .is_some_and(|rest| rest.starts_with('/'));
                if same_origin {
                    torrent_url = candidate;
                }
            }
        }
    }
    let category = detail_field(&fields, &["category", "раздел", "категория"]);
    let parsed_size = detail_field(&fields, &["size", "размер"]);
    let size = if topic_size.is_empty() || !looks_like_file_size(&topic_size) {
        parsed_size
    } else {
        topic_size
    };
    let parsed_uploaded_at = detail_field(
        &fields,
        &[
            "uploaded",
            "added",
            "date",
            "submitted",
            "дата",
            "добавлен",
            "создан",
        ],
    );
    let uploaded_at = if topic_registered.is_empty() {
        parsed_uploaded_at
    } else {
        topic_registered
    };
    let updated_at = detail_field(&fields, &["updated", "обновлен"]);
    let parsed_seeders = detail_number(&detail_field(&fields, &["seeder", "сид"]));
    let seeders = if topic_seeders == 0 {
        parsed_seeders
    } else {
        topic_seeders
    };
    let parsed_leechers = detail_number(&detail_field(&fields, &["leecher", "лич"]));
    let leechers = if topic_leechers == 0 {
        parsed_leechers
    } else {
        topic_leechers
    };
    let parsed_completed = detail_number(&detail_field(
        &fields,
        &["completed", "downloaded", "скачан"],
    ));
    let completed = if topic_downloads == 0 {
        parsed_completed
    } else {
        topic_downloads
    };
    let info_hash = detail_field(&fields, &["info hash", "hash", "хеш"]);
    let downloads = topic_downloads;
    let files = if source == "rutracker" {
        Vec::new()
    } else if source == "erai-raws" && parse_detail_files(&doc).is_empty() {
        parse_animetosho_file(&doc)
    } else {
        parse_detail_files(&doc)
    };
    let screenshots = parse_detail_screenshots(&doc, origin, source);
    let comments = parse_detail_comments(&doc, source);
    let has_details = !description.is_empty()
        || !fields.is_empty()
        || !files.is_empty()
        || !screenshots.is_empty()
        || !comments.is_empty()
        || !magnet.is_empty()
        || !torrent_url.is_empty();
    let notice = if has_details {
        None
    } else {
        Some("Источник вернул страницу без доступных деталей. Оригинал можно открыть во внешнем браузере.".to_string())
    };

    TorrentDetails {
        source: source.to_string(),
        url: url.to_string(),
        title,
        description,
        category,
        size,
        uploaded_at,
        updated_at,
        seeders,
        leechers,
        completed,
        downloads,
        info_hash,
        magnet,
        torrent_url,
        fields,
        files,
        screenshots,
        comments,
        notice,
    }
}

#[tauri::command]
pub async fn get_torrent_details(
    app_handle: tauri::AppHandle,
    source: String,
    url: String,
) -> Result<TorrentDetails, String> {
    let origin = validate_detail_url(&source, &url)?;
    let client = if source == "nekobt" {
        build_nekobt_client()?
    } else if source == "rutracker" {
        let user_agent = load_rutracker_user_agent(&app_handle)
            .unwrap_or_else(|| RUTRACKER_DEFAULT_UA.to_string());
        build_rutracker_client_with_ua(&user_agent)?
    } else {
        build_client()?
    };
    let mut request = client.get(&url);
    if source == "rutracker" {
        let cookies = load_rutracker_cookies(&app_handle);
        if cookies.is_empty() {
            return Err("Not authenticated. Please login to rutracker first.".to_string());
        }
        request = request.header("Cookie", cookies_to_header(&cookies));
    } else if source == "erai-raws"
        && detail_origin_for_url(&source, &url) == Some("https://www.erai-raws.info")
    {
        let cookies = load_erai_cookies();
        if cookies.is_empty() {
            return Err("Not authenticated. Please login to Erai-Raws first.".to_string());
        }
        request = request.header("Cookie", cookies_to_header(&cookies));
    } else if source == "nekobt" {
        let key = load_nekobt_api_key(&app_handle);
        if key.is_empty() {
            return Err("Not authenticated. Please enter your nekoBT API key first.".to_string());
        }
        request = request.header("Cookie", format!("ssid={key}"));
    }
    const MAX_DETAIL_RESPONSE_BYTES: usize = 8 * 1024 * 1024;
    let browser_response = if source == "rutracker" {
        rutracker_browser_fetch(&app_handle, &url).await?
    } else {
        None
    };
    let (status, body) = if let Some(response) = browser_response {
        (response.status, response.body)
    } else {
        let _slot = acquire_scraper_slot().await?;
        let response = request
            .send()
            .await
            .map_err(|e| format!("Torrent details request failed: {e}"))?;
        let status = response.status().as_u16();
        let mut body = Vec::new();
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Read error: {e}"))?;
            if body.len().saturating_add(chunk.len()) > MAX_DETAIL_RESPONSE_BYTES {
                return Err("Torrent page is too large to display safely".to_string());
            }
            body.extend_from_slice(&chunk);
        }
        (status, body)
    };
    if !(200..300).contains(&status) {
        return Err(format!("Torrent page returned HTTP {status}"));
    }
    if body.len() > MAX_DETAIL_RESPONSE_BYTES {
        return Err("Torrent page is too large to display safely".to_string());
    }
    let html = if source == "rutracker" {
        decode_rutracker_page(&body)
    } else {
        String::from_utf8_lossy(&body).to_string()
    };
    if source == "rutracker" && is_rutracker_challenge(&html) {
        return Err(rutracker_challenge_error());
    }
    let mut details = parse_torrent_detail_html(&source, &url, &html);

    if source == "rutracker" {
        let cookies = load_rutracker_cookies(&app_handle);
        if let Some(topic_id) = rutracker_topic_id(&url) {
            if let Ok(file_tree) =
                fetch_rutracker_file_tree(&app_handle, &client, &cookies, &topic_id).await
            {
                details.files = parse_rutracker_file_tree(&file_tree);
            }
        }
    }

    if details.title.is_empty() {
        details.title = origin.to_string();
    }
    Ok(details)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_file_size_bytes() {
        assert_eq!(format_file_size(0.0), "0.00 B");
        assert_eq!(format_file_size(512.0), "512.00 B");
    }

    #[test]
    fn test_format_file_size_kib() {
        assert_eq!(format_file_size(1024.0), "1.00 KiB");
        assert_eq!(format_file_size(2048.0), "2.00 KiB");
    }

    #[test]
    fn test_format_file_size_mib() {
        assert_eq!(format_file_size(1048576.0), "1.00 MiB");
        assert_eq!(format_file_size(1572864.0), "1.50 MiB");
    }

    #[test]
    fn test_format_file_size_gib() {
        assert_eq!(format_file_size(1073741824.0), "1.00 GiB");
    }

    #[test]
    fn test_is_valid_torrent_short_name() {
        assert!(!is_valid_torrent("ab", "/view/123"));
    }

    #[test]
    fn rutracker_challenge_detection_handles_http_200_pages() {
        assert!(is_rutracker_challenge(
            "<title>Just a moment...</title><script>cf-chl-platform</script>"
        ));
        assert!(is_rutracker_challenge("ПРОВЕРКА СОЕДИНЕНИЯ"));
        assert!(!is_rutracker_challenge(
            "<a href=\"profile.php?mode=viewprofile\">Profile</a>"
        ));
    }

    #[test]
    fn test_is_valid_torrent_comment() {
        assert!(!is_valid_torrent("Comment", "/view/123"));
        assert!(!is_valid_torrent("1 comment", "/view/123"));
        assert!(!is_valid_torrent("no comments", "/view/123"));
    }

    #[test]
    fn test_is_valid_torrent_no_url() {
        assert!(!is_valid_torrent("Valid Title", ""));
    }

    #[test]
    fn test_is_valid_torrent_valid() {
        assert!(is_valid_torrent(
            "[Erai-raws] Anime Title [1080p][HEVC]",
            "/view/12345"
        ));
    }

    #[test]
    fn rutracker_search_parser_accepts_current_topic_rows() {
        let html = r#"
            <table>
              <tr id="trs-tr-6783649">
                <td></td><td></td><td></td>
                <td><a data-topic_id="6783649" href="viewtopic.php?t=6783649">[Anime] Example release [1080p]</a></td>
                <td></td><td>12.4 GiB</td>
                <td class="seedmed">42</td><td class="leechmed">7</td>
              </tr>
            </table>
        "#;
        let items = parse_rutracker_entries(html);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].category, "6783649");
        assert_eq!(items[0].title, "[Anime] Example release [1080p]");
        assert_eq!(items[0].size, "12.4 GiB");
        assert_eq!(items[0].seeders, 42);
        assert_eq!(items[0].leechers, 7);
        assert_eq!(
            items[0].link,
            "https://rutracker.org/forum/viewtopic.php?t=6783649"
        );
    }

    #[test]
    fn test_parse_rus_number_digits() {
        assert_eq!(parse_rus_number("1234"), 1234);
    }

    #[test]
    fn test_parse_rus_number_with_spaces() {
        assert_eq!(parse_rus_number("1 234"), 1234);
    }

    #[test]
    fn test_parse_rus_number_with_comma() {
        assert_eq!(parse_rus_number("1,234"), 1234);
    }

    #[test]
    fn test_parse_rus_number_empty() {
        assert_eq!(parse_rus_number(""), 0);
    }

    #[test]
    fn test_parse_rus_number_with_text() {
        assert_eq!(parse_rus_number("N/A"), 0);
        assert_eq!(parse_rus_number("~500"), 500);
    }

    #[test]
    fn test_parse_rus_number_non_ascii_digits() {
        assert_eq!(parse_rus_number("١٢٣"), 0);
    }

    #[test]
    fn parse_erai_entries_normalizes_relative_source_links() {
        let html = r#"
            <div class="home_list_entry">
              <div class="link"><a> [Erai-Raws] Example Title </a></div>
              <a class="website muted" href="http://animetosho.org/view/12345">source</a>
              <a href="magnet:?xt=urn:btih:ABC">magnet</a>
              <div class="size">1 GiB</div>
            </div>
        "#;
        let items = parse_entries(html);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].link, "https://animetosho.org/view/12345");
        assert_eq!(
            absolute_detail_url("https://animetosho.org", "//animetosho.org/view/2"),
            "https://animetosho.org/view/2"
        );
        assert_eq!(
            absolute_detail_url("https://animetosho.org", "http://animetosho.org/view/3"),
            "https://animetosho.org/view/3"
        );
        assert_eq!(
            absolute_detail_url(
                "https://animetosho.org",
                "http://animetosho.org.evil/view/3"
            ),
            "http://animetosho.org.evil/view/3"
        );
        assert_eq!(
            absolute_detail_url("https://animetosho.org", "javascript:alert(1)"),
            ""
        );
    }

    #[test]
    fn detail_url_validation_rejects_cross_source_and_spoofed_hosts() {
        assert!(validate_detail_url("nyaa", "https://nyaa.si/view/123").is_ok());
        assert!(validate_detail_url("nyaa", "https://nyaa.si.evil.test/view/123").is_err());
        assert!(
            validate_detail_url("nyaa", "https://rutracker.org/forum/viewtopic.php?t=1").is_err()
        );
        assert!(validate_detail_url("unknown", "https://nyaa.si/view/123").is_err());
    }

    #[test]
    fn detail_url_validation_accepts_each_scraper_origin() {
        let urls = [
            ("erai-raws", "https://animetosho.org/view/example"),
            ("rutracker", "https://rutracker.org/forum/viewtopic.php?t=1"),
            ("nyaa", "https://nyaa.si/view/1"),
            ("sukebei", "https://sukebei.nyaa.si/view/1"),
            ("nekobt", "https://nekobt.to/torrents/1"),
        ];
        for (source, url) in urls {
            assert!(
                validate_detail_url(source, url).is_ok(),
                "{source} should accept {url}"
            );
        }
    }

    #[test]
    fn detail_parser_supports_tracker_panels_and_external_screenshots() {
        let html = r#"
            <html><head><title>Fallback title</title></head>
            <body>
              <h3 class="panel-title">Example torrent</h3>
              <table><tr><th>Size:</th><td>1.5 GiB</td></tr><tr><th>Seeders:</th><td>42</td></tr></table>
              <div class="panel-body markdown-text">A useful <b>description</b>.</div>
              <table class="file-list"><tr><td>episode.mkv</td><td>1.5 GiB</td></tr></table>
              <div class="comment"><span class="author">alice</span><time>today</time><p>Hello!</p></div>
              <img src="/screens/one.jpg"><img src="https://images.example/preview.jpg"><img src="javascript:alert(1)">
              <a href="magnet:?xt=urn:btih:ABC">magnet</a>
              <a href="https://tracker.example/file.torrent">external torrent</a>
            </body></html>
        "#;
        let details = parse_torrent_detail_html("nyaa", "https://nyaa.si/view/1", html);
        assert_eq!(details.title, "Example torrent");
        assert_eq!(details.description, "A useful description.");
        assert_eq!(details.seeders, 42);
        assert_eq!(details.files.len(), 1);
        assert_eq!(details.comments.len(), 1);
        assert_eq!(details.magnet, "magnet:?xt=urn:btih:ABC");
        assert_eq!(details.torrent_url, "");
        assert_eq!(
            details.screenshots,
            vec![
                "https://nyaa.si/screens/one.jpg",
                "https://images.example/preview.jpg"
            ]
        );
    }

    #[test]
    fn sukebei_detail_parser_uses_the_same_tracker_markup() {
        let html = r#"
            <h3 class="panel-title">Sukebei release</h3>
            <div class="panel-body markdown-text">A release description.</div>
            <img src="https://images.example/sukebei.jpg">
        "#;
        let details =
            parse_torrent_detail_html("sukebei", "https://sukebei.nyaa.si/view/123", html);
        assert_eq!(details.title, "Sukebei release");
        assert_eq!(details.description, "A release description.");
        assert_eq!(
            details.screenshots,
            vec!["https://images.example/sukebei.jpg"]
        );
    }

    #[test]
    fn nekobt_shell_without_metadata_is_reported_as_unavailable_details() {
        let details = parse_torrent_detail_html(
            "nekobt",
            "https://nekobt.to/torrents/123",
            "<html><head><title>nekoBT</title></head><body><div id=app></div></body></html>",
        );
        assert!(details.title == "nekoBT");
        assert!(details.notice.is_some());
    }

    #[test]
    fn rutracker_detail_parser_accepts_authenticated_download_link_shape() {
        let html = r#"
            <h1>Russian release</h1>
            <table><tr><th>Size</th><td>2 GiB</td></tr></table>
            <a class="dl-link" href="/forum/dl.php?t=123">Download torrent</a>
        "#;
        let details = parse_torrent_detail_html(
            "rutracker",
            "https://rutracker.org/forum/viewtopic.php?t=123",
            html,
        );
        assert_eq!(
            details.torrent_url,
            "https://rutracker.org/forum/dl.php?t=123"
        );
    }

    #[test]
    fn rutracker_screenshots_come_from_post_body_not_page_icons() {
        let html = r#"
            <html><head><title>t</title></head><body>
              <div class="post_head">
                <img src="https://rutracker.org/forum/styles/imageset/ru/icon_topic_hot.png">
                <img class="smilie" src="https://rutracker.org/forum/images/smilies/icon_e_smile.gif">
              </div>
              <div class="post_body">
                Название: Test<br>
                <img src="https://rutracker.org/forum/images/flags/ru.gif">
                <div class="sp-wrap">
                  <div class="sp-head">Скриншоты</div>
                  <div class="sp-body">
                    <img src="https://img.rutracker.org/f/001/screenshot1.jpg">
                    <a href="https://rutracker.org/forum/viewtopic.php?p=1#p1"><img class="postImg" src="https://img.rutracker.org/f/001/screenshot2.jpg"></a>
                  </div>
                </div>
              </div>
              <div class="post_body">
                Reply body with <img src="https://img.rutracker.org/f/002/reply-pic.jpg">
              </div>
            </body></html>
        "#;
        let details = parse_torrent_detail_html(
            "rutracker",
            "https://rutracker.org/forum/viewtopic.php?t=123",
            html,
        );
        assert_eq!(
            details.screenshots,
            vec![
                "https://img.rutracker.org/f/001/screenshot1.jpg",
                "https://img.rutracker.org/f/001/screenshot2.jpg",
            ]
        );
    }

    #[test]
    fn rutracker_topic_stats_and_comments_use_their_own_sections() {
        let html = r#"
            <html><body>
              <div class="topic-stats">Размер: 17.09 GB | Зарегистрирован: 14 лет 8 месяцев | .torrent скачан: 8,496 раз | Сиды: 14 | Личи: 13</div>
              <div class="post"><div class="post_body">Release description<div class="sp-wrap"><div class="sp-head">Скриншоты</div><div class="sp-body"></div></div></div></div>
              <div class="post"><div class="post_body">A real reply</div><span class="author">alice</span></div>
              <script>var fake = 'Скачан: 0 раз';</script>
            </body></html>
        "#;
        let details = parse_torrent_detail_html(
            "rutracker",
            "https://rutracker.org/forum/viewtopic.php?t=3512528",
            html,
        );
        assert_eq!(details.size, "17.09 GB");
        assert_eq!(details.uploaded_at, "14 лет 8 месяцев");
        assert_eq!(details.downloads, 8496);
        assert_eq!(details.seeders, 14);
        assert_eq!(details.leechers, 13);
        assert_eq!(details.comments.len(), 1);
        assert_eq!(details.comments[0].text, "A real reply");
    }

    #[test]
    fn rutracker_file_tree_parser_ignores_folder_wrappers_and_scripts() {
        let html = r#"
            <div id="tor-filelist">
              <ul><li class="folder">Season 1<ul>
                <li><span class="ft-file">episode-01.mkv</span><span class="ft-size">635 MiB</span></li>
                <li><span class="ft-file">episode-02.mkv</span><span class="ft-size">640 MiB</span></li>
              </ul></li></ul>
              <script>var fake = 'page.js';</script>
            </div>
        "#;
        let files = parse_rutracker_file_tree(html);
        assert_eq!(files.len(), 2);
        assert_eq!(files[0].name, "episode-01.mkv");
        assert_eq!(files[0].size, "635 MiB");
        assert_eq!(
            rutracker_topic_id("https://rutracker.org/forum/viewtopic.php?t=3512528"),
            Some("3512528".to_string())
        );
    }

    #[test]
    fn nyaa_screenshots_extract_markdown_images_from_description() {
        let html = r#"
            <html><head><title>t</title></head><body>
              <div markdown-text class="panel-body" id="torrent-description">
                **Video:** 1080p<br>
                ![](https://i.kek.sh/screen1.jpg)<br>
                ![](https://i.kek.sh/screen2.jpg?w=1200&amp;h=675)
              </div>
            </body></html>
        "#;
        let details = parse_torrent_detail_html("nyaa", "https://nyaa.si/view/1", html);
        assert_eq!(
            details.screenshots,
            vec![
                "https://i.kek.sh/screen1.jpg",
                "https://i.kek.sh/screen2.jpg?w=1200&h=675",
            ]
        );
    }

    #[test]
    fn detail_screenshots_fallback_skips_captcha_and_icons() {
        let html = r#"
            <html><head><title>t</title></head><body>
              <div class="comment"><div class="comment_message"><div class="user_message_c">plain text</div></div></div>
              <img src="https://animetosho.org/inc/captcha.php?h=abc" alt="captcha">
              <img src="https://images.example/real-shot.jpg">
            </body></html>
        "#;
        let details =
            parse_torrent_detail_html("erai-raws", "https://animetosho.org/view/example", html);
        assert_eq!(
            details.screenshots,
            vec!["https://images.example/real-shot.jpg"]
        );
    }

    #[test]
    fn detail_text_cleaning_fixes_paren_spacing() {
        assert_eq!(clean_detail_text("Nyaa ( cached)"), "Nyaa (cached)");
        assert_eq!(
            clean_detail_text("Magnet Link ( 1.376 GB)"),
            "Magnet Link (1.376 GB)"
        );
    }

    #[test]
    fn detail_description_preserves_line_breaks() {
        let html = r#"
            <div class="panel-body markdown-text">
                Video Info:<br>
                udp://tracker.opentrackr.org:1337/announce<br>
                S: 6292 · L: 312 · C: 19283
            </div>
        "#;
        let details = parse_torrent_detail_html("nyaa", "https://nyaa.si/view/1", html);
        assert_eq!(
            details.description,
            "Video Info:\nudp://tracker.opentrackr.org:1337/announce\nS: 6292 · L: 312 · C: 19283"
        );
    }

    #[test]
    fn detail_field_values_preserve_line_breaks() {
        let html = r#"
            <table>
                <tr><th>Download</th><td>Host1<br>Host2<br>Host3</td></tr>
                <tr><th>Extractions</th><td>Audio: GoFile | MdiaLoad<br>Subtitles: CR [eng, ASS]</td></tr>
            </table>
        "#;
        let details = parse_torrent_detail_html("nyaa", "https://nyaa.si/view/1", html);
        let download = details
            .fields
            .iter()
            .find(|field| field.label == "Download")
            .expect("Download field");
        assert_eq!(download.value, "Host1\nHost2\nHost3");
        let extractions = details
            .fields
            .iter()
            .find(|field| field.label == "Extractions")
            .expect("Extractions field");
        assert_eq!(
            extractions.value,
            "Audio: GoFile | MdiaLoad\nSubtitles: CR [eng, ASS]"
        );
    }

    #[test]
    fn erai_results_keep_mirror_details_and_original_release_url() {
        let html = r#"
            <div class="home_list_entry">
              <div class="link"><a href="/view/release.n123">[Erai-raws] Release</a></div>
              <a class="website" href="https://www.erai-raws.info/episodes/release/">Website</a>
              <a href="magnet:?xt=urn:btih:ABC">Magnet</a>
              <a href="/download/release.torrent">Torrent</a>
              <div class="size">1 GiB</div>
            </div>
        "#;
        let items = parse_entries(html);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].link, "https://animetosho.org/view/release.n123");
        assert_eq!(
            items[0].website,
            "https://www.erai-raws.info/episodes/release/"
        );
    }

    #[test]
    fn nyaa_detail_parser_maps_tracker_metadata_and_file_list() {
        let html = r#"
            <h3 class="panel-title">[Erai-raws] Release</h3>
            <table>
              <tr><th>Category:</th><td>Anime - English-translated</td></tr>
              <tr><th>Date:</th><td>2025-05-04 15:21 UTC</td></tr>
              <tr><th>File size:</th><td>715.7 MiB</td></tr>
              <tr><th>Seeders:</th><td>1</td></tr>
              <tr><th>Completed:</th><td>593</td></tr>
            </table>
            <div id="torrent-description">Video Info:<br>AVC<br>Audio: AAC</div>
            <table class="files"><tr><td>episode.mkv</td><td>715.7 MiB</td></tr></table>
            <a href="/download/1.torrent">Torrent</a>
            <a href="magnet:?xt=urn:btih:ABC">Magnet</a>
        "#;
        let details = parse_torrent_detail_html("nyaa", "https://nyaa.si/view/1", html);
        assert_eq!(details.title, "[Erai-raws] Release");
        assert_eq!(details.category, "Anime - English-translated");
        assert_eq!(details.seeders, 1);
        assert_eq!(details.completed, 593);
        assert_eq!(details.files[0].name, "episode.mkv");
        assert_eq!(details.torrent_url, "https://nyaa.si/download/1.torrent");
    }

    #[test]
    fn nyaa_detail_parser_handles_bootstrap_row_layout() {
        let html = r#"
            <div class="panel panel-default">
              <div class="panel-heading"><h3 class="panel-title">[kikuri] Release</h3></div>
              <div class="panel-body">
                <div class="row">
                  <div class="col-md-1">Category:</div>
                  <div class="col-md-5"><a>Anime</a> - <a>English-translated</a></div>
                  <div class="col-md-1">Date:</div>
                  <div class="col-md-5">2026-08-12 21:12 UTC</div>
                </div>
                <div class="row">
                  <div class="col-md-1">Submitter:</div>
                  <div class="col-md-5">Anonymous</div>
                  <div class="col-md-1">Seeders:</div>
                  <div class="col-md-5"><span style="color: green;">113</span></div>
                </div>
                <div class="row">
                  <div class="col-md-1">File size:</div>
                  <div class="col-md-5">22.9 GiB</div>
                  <div class="col-md-1">Completed:</div>
                  <div class="col-md-5">533</div>
                </div>
                <div class="row">
                  <div class="col-md-offset-6 col-md-1">Info hash:</div>
                  <div class="col-md-5"><kbd>abc123</kbd></div>
                </div>
              </div>
            </div>
            <div id="torrent-description">Video Info:<br>AVC</div>
        "#;
        let details = parse_torrent_detail_html("nyaa", "https://nyaa.si/view/1", html);
        assert_eq!(details.title, "[kikuri] Release");
        assert_eq!(details.category, "Anime - English-translated");
        assert_eq!(details.seeders, 113);
        assert_eq!(details.leechers, 0);
        assert_eq!(details.completed, 533);
        assert_eq!(details.size, "22.9 GiB");
        assert_eq!(details.info_hash, "abc123");
        assert_eq!(details.uploaded_at, "2026-08-12 21:12 UTC");
        assert_eq!(details.description, "Video Info:\nAVC");
    }

    #[test]
    fn animetosho_detail_parses_comment_description_and_single_file() {
        let html = r#"
            <table>
              <tr><th>Date Submitted</th><td>27/03/2026 16:36</td></tr>
              <tr><th>Comment</th><td>Video Info:<br>AVC<br>Audio: AAC</td></tr>
              <tr><th>File Name (Size)</th><td><a>release.mkv</a> <span>(661.9 MB)</span></td></tr>
            </table>
        "#;
        let details =
            parse_torrent_detail_html("erai-raws", "https://animetosho.org/view/example", html);
        assert_eq!(details.description, "Video Info:\nAVC\nAudio: AAC");
        assert_eq!(details.files.len(), 1);
        assert_eq!(details.files[0].name, "release.mkv");
        assert_eq!(details.files[0].size, "661.9 MB");
    }

    #[test]
    fn animetosho_size_extracts_only_the_parenthesized_value() {
        assert_eq!(animetosho_size("release.mkv (661.9 MB)"), "661.9 MB");
        assert_eq!(animetosho_size("episode.mp4 (1.2 GiB)"), "1.2 GiB");
        assert_eq!(animetosho_size("22.9 GiB"), "22.9 GiB");
        assert_eq!(animetosho_size("no size here"), "");
    }

    #[test]
    fn sukebei_file_list_skips_folders_and_strips_sizes_from_names() {
        let html = r#"
            <div class="torrent-file-list panel-body">
                <ul>
                    <li><a class="folder">Root</a>
                        <ul>
                            <li><a class="folder">Frieren</a>
                                <ul>
                                    <li><i class="fa fa-file"></i>episode.mp4 <span class="file-size">(155.4 MiB)</span></li>
                                    <li><i class="fa fa-file"></i>cover.jpg <span class="file-size">(141.2 MiB)</span></li>
                                </ul>
                            </li>
                        </ul>
                    </li>
                </ul>
            </div>
        "#;
        let files = parse_detail_files(&Html::parse_document(html));
        assert_eq!(files.len(), 2);
        assert_eq!(files[0].name, "episode.mp4");
        assert_eq!(files[0].size, "(155.4 MiB)");
        assert_eq!(files[1].name, "cover.jpg");
        assert_eq!(files[1].size, "(141.2 MiB)");
    }

    #[test]
    fn animetosho_detail_stats_use_tracker_values_without_overwriting_file_metadata() {
        let html = r#"
            <body>
              Date Submitted<br>07/04/2024 02:04
              File Name (Size)<br>release.mkv (373.4 MB)
              S:<br>0<br>L:<br>0<br>C:<br>32
              S:<br>16<br>L:<br>3<br>C:<br>825
            </body>
        "#;
        let details =
            parse_torrent_detail_html("erai-raws", "https://animetosho.org/view/example", html);
        assert_eq!(details.uploaded_at, "07/04/2024 02:04");
        assert_eq!(details.seeders, 16);
        assert_eq!(details.leechers, 3);
        assert_eq!(details.completed, 825);
    }

    #[test]
    fn erai_detail_urls_allow_only_the_two_known_hosts() {
        assert!(validate_detail_url("erai-raws", "https://animetosho.org/view/1").is_ok());
        assert!(
            validate_detail_url("erai-raws", "https://www.erai-raws.info/episodes/one/").is_ok()
        );
        assert!(validate_detail_url("erai-raws", "https://erai-raws.info.evil/view/1").is_err());
    }

    fn print_detail_summary(source: &str, url: &str, details: &TorrentDetails) {
        println!("=== [{source}] {url}");
        println!("  title: {}", details.title);
        println!("  description: {} chars", details.description.len());
        println!(
            "  fields: {} (first: {:?})",
            details.fields.len(),
            details.fields.first().map(|f| &f.label)
        );
        println!(
            "  files: {} (first: {:?})",
            details.files.len(),
            details.files.first().map(|f| &f.name)
        );
        println!("  screenshots: {}", details.screenshots.len());
        println!("  comments: {}", details.comments.len());
        println!("  size: {} | category: {}", details.size, details.category);
        println!(
            "  seeders: {} | leechers: {} | completed: {} | downloads: {}",
            details.seeders, details.leechers, details.completed, details.downloads
        );
        println!(
            "  uploaded: {} | updated: {}",
            details.uploaded_at, details.updated_at
        );
        println!(
            "  magnet: {} | torrent: {}",
            details.magnet, details.torrent_url
        );
        println!("  notice: {:?}", details.notice);
    }

    #[tokio::test]
    #[ignore]
    async fn live_fetch_details_for_all_public_sources() {
        let client = build_client().expect("client");
        let mut fetches = Vec::new();

        let nyaa_items = search_nyaa("Frieren".to_string(), None, None, None)
            .await
            .unwrap_or_default();
        for item in nyaa_items.iter().take(3) {
            fetches.push(("nyaa", item.link.clone()));
        }

        let sukebei_items = search_sukebei("Frieren".to_string(), None, None, None)
            .await
            .unwrap_or_default();
        for item in sukebei_items.iter().take(3) {
            fetches.push(("sukebei", item.link.clone()));
        }

        let erai_items = search_erairaws("Frieren".to_string(), None)
            .await
            .unwrap_or_default();
        for item in erai_items.iter().take(3) {
            fetches.push(("erai-raws", item.link.clone()));
        }

        for (source, url) in fetches {
            if url.is_empty() {
                println!("=== [{source}] no link available");
                continue;
            }
            match client.get(&url).send().await {
                Ok(resp) if resp.status().is_success() => {
                    let html = resp.text().await.unwrap_or_default();
                    let details = parse_torrent_detail_html(source, &url, &html);
                    print_detail_summary(source, &url, &details);
                }
                Ok(resp) => {
                    println!("=== [{source}] {url} -> HTTP {}", resp.status());
                }
                Err(e) => {
                    println!("=== [{source}] {url} -> error: {e}");
                }
            }
        }
    }
}
