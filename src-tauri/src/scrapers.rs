use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::auth::{load_nekobt_api_key, load_rutracker_cookies};

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
#[allow(dead_code)]
struct NekoBtSearchData {
    results: Vec<NekoBtTorrentItem>,
    #[serde(default)]
    more: Option<bool>,
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

pub(crate) fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Client error: {e}"))
}

pub(crate) fn build_nyaa_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(90))
        .build()
        .map_err(|e| format!("Client error: {e}"))
}

pub(crate) fn build_no_redirect_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| format!("Client error: {e}"))
}

pub(crate) fn build_nekobt_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("iluhaAnime/1.0")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Client error: {e}"))
}

pub(crate) fn decode_windows_1251(bytes: &[u8]) -> String {
    let (cow, _, _) = encoding_rs::WINDOWS_1251.decode(bytes);
    cow.to_string()
}

pub(crate) fn cookies_to_header(cookies: &HashMap<String, String>) -> String {
    cookies
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join("; ")
}

pub(crate) fn extract_cookies_from_headers(
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

pub(crate) fn url_encode(s: String) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            b' ' => "+".to_string(),
            _ => format!("%{:02X}", b),
        })
        .collect()
}

fn parse_seeders_leechers(s: &str) -> (u32, u32) {
    let re = regex_lite::Regex::new(r"Seeders:\s*(\d+)\s*/\s*Leechers:\s*(\d+)").ok();
    match re.and_then(|r| r.captures(s)) {
        Some(c) => (
            c.get(1).and_then(|m| m.as_str().parse().ok()).unwrap_or(0),
            c.get(2).and_then(|m| m.as_str().parse().ok()).unwrap_or(0),
        ),
        None => (0, 0),
    }
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
    if name.chars().all(|c| c.is_ascii_digit() || c.is_whitespace() || c == '.' || c == ',') {
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
        serde_json::Value::Number(n) => {
            if let Some(bytes) = n.as_i64() {
                let bytes = bytes as f64;
                if bytes < 1024.0 { format!("{:.2} B", bytes) }
                else if bytes < 1024.0 * 1024.0 { format!("{:.2} KiB", bytes / 1024.0) }
                else if bytes < 1024.0 * 1024.0 * 1024.0 { format!("{:.2} MiB", bytes / (1024.0 * 1024.0)) }
                else { format!("{:.2} GiB", bytes / (1024.0 * 1024.0 * 1024.0)) }
            } else {
                String::new()
            }
        }
        serde_json::Value::String(s) => s.clone(),
        _ => String::new(),
    };

    Some(NyaaItem {
        title: item.name,
        magnet: item.magnet,
        torrent: if item.torrent.starts_with("http") { item.torrent } else { format!("https://nyaa.si{}", item.torrent) },
        size: size_str,
        seeders: item.seeders,
        leechers: item.leechers,
        category: String::new(),
        link: format!("https://nyaa.si{}", item.url),
    })
}

fn parse_entries(html: &str) -> Vec<NyaaItem> {
    let doc = Html::parse_document(html);
    let entry_sel = Selector::parse(".home_list_entry").unwrap();
    let link_sel = Selector::parse(".link > a").unwrap();
    let size_sel = Selector::parse(".size").unwrap();
    let a_sel = Selector::parse("a").unwrap();
    let span_sel = Selector::parse("span[title]").unwrap();

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
                } else if a.value().attr("class").map_or(false, |c| c == "website")
                    && link.is_empty()
                {
                    link = h.to_string();
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
            link,
        });
    }

    items
}

fn parse_nyaa_entries(html: &str) -> Vec<NyaaItem> {
    let doc = Html::parse_document(html);
    let row_sel = Selector::parse("table.torrent-list tbody tr").unwrap();
    let td_sel = Selector::parse("td").unwrap();
    let a_sel = Selector::parse("a").unwrap();

    let mut items = Vec::new();

    for row in doc.select(&row_sel) {
        let tds: Vec<_> = row.select(&td_sel).collect();
        if tds.len() < 8 {
            continue;
        }

        let magnet = tds[2]
            .select(&a_sel)
            .find_map(|a| {
                let h = a.value().attr("href")?;
                if h.starts_with("magnet:") { Some(h.to_string()) } else { None }
            });

        let magnet = match magnet {
            Some(m) => m,
            None => continue,
        };

        let title = tds[1]
            .select(&a_sel)
            .next()
            .and_then(|a| a.value().attr("title"))
            .map(|t| t.to_string())
            .unwrap_or_default();

        let link = tds[1]
            .select(&a_sel)
            .next()
            .and_then(|a| a.value().attr("href"))
            .unwrap_or_default();

        if !is_valid_torrent(&title, link) {
            continue;
        }

        let torrent = tds[2]
            .select(&a_sel)
            .find_map(|a| {
                let h = a.value().attr("href")?;
                if h.ends_with(".torrent") { Some(format!("https://nyaa.si{h}")) } else { None }
            })
            .unwrap_or_default();

        let size = tds[3]
            .text()
            .collect::<String>()
            .trim()
            .to_string();

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

        let torrent_url = if link.starts_with('/') { format!("https://nyaa.si{link}") } else { link.to_string() };

        items.push(NyaaItem {
            title,
            magnet,
            torrent,
            size,
            seeders,
            leechers,
            category: String::new(),
            link: torrent_url,
        });
    }

    items
}

fn parse_rutracker_entries(html: &str) -> Vec<NyaaItem> {
    let doc = Html::parse_document(html);
    let row_sel = Selector::parse("tr.hl-tr, tr.hl-tr1, tr.hl-tr2").unwrap();
    let td_sel = Selector::parse("td").unwrap();
    let link_sel = Selector::parse("a.tLink, a.med.tLink").unwrap();

    let mut items = Vec::new();

    for row in doc.select(&row_sel) {
        let tds: Vec<_> = row.select(&td_sel).collect();
        if tds.len() < 8 {
            continue;
        }

        let topic_id = row.value().attr("data-topic_id").unwrap_or_default().to_string();

        let title = tds[3]
            .select(&link_sel)
            .next()
            .map(|a| a.text().collect::<String>().trim().to_string())
            .filter(|t| !t.is_empty());

        let title = match title {
            Some(t) => t,
            None => continue,
        };

        let link = format!("https://rutracker.org/forum/viewtopic.php?t={}", topic_id);

        let size = tds[5]
            .text()
            .collect::<String>()
            .trim()
            .to_string()
            .replace(['\u{a0}', '↓'], "")
            .trim()
            .to_string();

        let seeders = tds[6]
            .text()
            .collect::<String>()
            .chars()
            .filter(|c| c.is_ascii_digit())
            .collect::<String>()
            .parse()
            .unwrap_or(0);

        let leechers = tds[7]
            .text()
            .collect::<String>()
            .chars()
            .filter(|c| c.is_ascii_digit())
            .collect::<String>()
            .parse()
            .unwrap_or(0);

        items.push(NyaaItem {
            title,
            magnet: String::new(),
            torrent: String::new(),
            size,
            seeders,
            leechers,
            category: topic_id,
            link,
        });
    }

    items
}

#[tauri::command]
pub async fn search_erairaws(query: String, encoding: String) -> Result<Vec<NyaaItem>, String> {
    let client = build_client()?;

    let search_query = if encoding.is_empty() || encoding == "all" {
        format!("{} erai-raws", query)
    } else {
        format!("{} erai-raws {}", query, encoding)
    };

    let resp = client
        .get("https://animetosho.org/search")
        .query(&[("q", search_query)])
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Search page returned HTTP {}", resp.status()));
    }

    let html = resp.text().await.map_err(|e| format!("Read error: {e}"))?;
    Ok(parse_entries(&html))
}

#[tauri::command]
pub async fn search_nyaa(query: String, page: Option<u32>, sort: Option<String>, order: Option<String>) -> Result<Vec<NyaaItem>, String> {
    let client = build_nyaa_client()?;

    let mut params = vec![("q", query.as_str()), ("c", "1_0"), ("format", "json")];
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

        let resp = match client
            .get("https://nyaa.si/")
            .query(&params)
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                last_err = format!("{e}");
                continue;
            }
        };

        if resp.status() == 504 || resp.status() == 503 {
            last_err = format!("Nyaa.si временно недоступен (HTTP {}), попробуйте позже", resp.status());
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

            let result: Vec<NyaaItem> = items.into_iter().filter_map(nyaa_json_to_item).collect();
            if !result.is_empty() || attempt >= 2 {
                return Ok(result);
            }
            last_err = "No valid torrents found".to_string();
            continue;
        }

        let html = String::from_utf8_lossy(&bytes).to_string();
        let parsed = parse_nyaa_entries(&html);
        if !parsed.is_empty() {
            return Ok(parsed);
        }

        last_err = "No results found".to_string();
    }

    Err(last_err)
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

    let client = build_client()?;
    let resp = client
        .get("https://rutracker.org/forum/tracker.php")
        .header("Cookie", cookies_to_header(&cookies))
        .query(&[("nm", query.as_str())])
        .send()
        .await
        .map_err(|e| format!("Rutracker search failed: {e}"))?;

    let bytes = resp.bytes().await.map_err(|e| format!("Read error: {e}"))?;
    let html = decode_windows_1251(&bytes);
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
    let offset = ((page as u64).saturating_sub(1)) * 20;
    let limit = 20u64;

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
    let response: NekoBtSearchResponse = serde_json::from_slice(&bytes)
        .map_err(|e| format!("Parse error: {e}"))?;

    if response.error {
        let msg = response.message.unwrap_or_else(|| "Unknown error".to_string());
        return Err(msg);
    }

    let items: Vec<NyaaItem> = response.data.results.into_iter().map(|t| {
        let size = if t.filesize.is_empty() {
            String::new()
        } else if let Ok(bytes) = t.filesize.parse::<f64>() {
            if bytes < 1024.0 { format!("{:.2} B", bytes) }
            else if bytes < 1024.0 * 1024.0 { format!("{:.2} KiB", bytes / 1024.0) }
            else if bytes < 1024.0 * 1024.0 * 1024.0 { format!("{:.2} MiB", bytes / (1024.0 * 1024.0)) }
            else { format!("{:.2} GiB", bytes / (1024.0 * 1024.0 * 1024.0)) }
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
        }
    }).collect();

    Ok(items)
}
