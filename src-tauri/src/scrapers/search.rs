#![allow(clippy::too_many_arguments)]

use scraper::{Html, Selector};
use serde::Deserialize;
use std::time::Instant;

use crate::auth::{
    load_nekobt_api_key, load_rutracker_cookies, load_rutracker_user_agent, rutracker_browser_fetch,
};

use super::clients::{
    absolute_detail_url, acquire_scraper_slot, build_client_inner, build_rutracker_client,
    cloudflare_blocked_error, cookies_to_header, decode_rutracker_page, format_file_size,
    is_cloudflare_challenge, is_rutracker_challenge, is_valid_torrent, parse_rus_number,
    parse_seeders_leechers, resolve_proxy, rutracker_challenge_error, url_encode, NyaaItem,
    RUTRACKER_DEFAULT_UA,
};

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
    proxy: Option<&str>,
) -> Result<Vec<NyaaItem>, String> {
    let client = build_client_inner(
        90,
        false,
        false,
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        proxy,
    )?;

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
        if is_cloudflare_challenge(&html) {
            let host = if base_url.contains("sukebei") {
                "sukebei.nyaa.si"
            } else {
                "nyaa.si"
            };
            return Err(cloudflare_blocked_error(host));
        }
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

#[tauri::command]
#[allow(non_snake_case)]
pub async fn search_erairaws(
    query: String,
    encoding: Option<String>,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<NyaaItem>, String> {
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let client = build_client_inner(
        30,
        false,
        false,
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        proxy.as_deref(),
    )?;

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

        if is_cloudflare_challenge(&html) {
            return Err(cloudflare_blocked_error("animetosho.org"));
        }

        let items = parse_entries(&html);
        if !items.is_empty() || attempt >= 2 {
            return Ok(items);
        }
        last_err = "No torrents found".to_string();
    }

    Err(last_err)
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn search_nyaa(
    query: String,
    page: Option<u32>,
    sort: Option<String>,
    order: Option<String>,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<NyaaItem>, String> {
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    search_nyaa_impl(
        "https://nyaa.si/",
        "1_0",
        query,
        page,
        sort,
        order,
        nyaa_json_to_item,
        parse_nyaa_entries,
        proxy.as_deref(),
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
#[allow(non_snake_case)]
pub async fn search_sukebei(
    query: String,
    page: Option<u32>,
    sort: Option<String>,
    order: Option<String>,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<NyaaItem>, String> {
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    search_nyaa_impl(
        "https://sukebei.nyaa.si/",
        "0_0",
        query,
        page,
        sort,
        order,
        sukebei_json_to_item,
        parse_sukebei_entries,
        proxy.as_deref(),
    )
    .await
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn search_rutracker(
    app_handle: tauri::AppHandle,
    query: String,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<NyaaItem>, String> {
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let cookies = load_rutracker_cookies(&app_handle);
    if cookies.is_empty() {
        return Err("Not authenticated. Please login to rutracker first.".to_string());
    }

    let search_url = format!(
        "https://rutracker.org/forum/tracker.php?nm={}",
        url_encode(&query)
    );
    // WebView2 ignores reqwest proxy strings, so the browser path runs direct-only.
    let browser_response = if proxy.is_none() {
        rutracker_browser_fetch(&app_handle, &search_url).await?
    } else {
        None
    };
    let (status, bytes) = if let Some(response) = browser_response {
        (response.status, response.body)
    } else {
        let user_agent = load_rutracker_user_agent(&app_handle)
            .unwrap_or_else(|| RUTRACKER_DEFAULT_UA.to_string());
        let client = build_client_inner(30, false, true, &user_agent, proxy.as_deref())?;
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
        if is_rutracker_challenge(&html) {
            return Err(rutracker_challenge_error());
        }
        return Err(format!("Rutracker search returned HTTP {status}"));
    }

    if is_rutracker_challenge(&html) {
        return Err(rutracker_challenge_error());
    }

    Ok(parse_rutracker_entries(&html))
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn search_nekobt(
    app_handle: tauri::AppHandle,
    query: String,
    page: Option<u32>,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<NyaaItem>, String> {
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let key = load_nekobt_api_key(&app_handle);
    if key.is_empty() {
        return Err("Not authenticated. Please enter your nekoBT API key first.".to_string());
    }

    if query.trim().is_empty() {
        return Err("Search query is empty".to_string());
    }

    let client = build_client_inner(30, false, false, "iluhaAnime/1.0", proxy.as_deref())?;
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
fn source_test_url(source: &str) -> Option<&'static str> {
    match source {
        "erai-raws" => Some("https://animetosho.org/"),
        "rutracker" => Some("https://rutracker.org/forum/index.php"),
        "nyaa" => Some("https://nyaa.si/"),
        "nekobt" => Some("https://nekobt.to/"),
        "sukebei" => Some("https://sukebei.nyaa.si/"),
        _ => None,
    }
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn test_source_connection(
    source: String,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<String, String> {
    let url = source_test_url(&source)
        .ok_or_else(|| format!("Unknown source: {source}"))?
        .to_string();
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let client = if source == "rutracker" {
        build_rutracker_client(proxy.as_deref())?
    } else {
        build_client_inner(
            10,
            false,
            false,
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
            proxy.as_deref(),
        )?
    };
    let start = Instant::now();
    let resp = client.get(&url).send().await.map_err(|e| {
        let msg = e.to_string();
        if msg.contains("proxy") || msg.contains("Proxy") || msg.contains("tunnel") {
            format!("Proxy error: {msg}")
        } else {
            format!("Connection failed: {msg}")
        }
    })?;
    let elapsed = start.elapsed().as_millis();
    let status = resp.status().as_u16();
    let ok = resp.status().is_success();
    if source == "rutracker" {
        let bytes = resp.bytes().await.map_err(|e| format!("Read error: {e}"))?;
        if is_rutracker_challenge(&decode_rutracker_page(&bytes)) {
            return Err(rutracker_challenge_error());
        }
    } else {
        let bytes = resp.bytes().await.map_err(|e| format!("Read error: {e}"))?;
        if is_cloudflare_challenge(&String::from_utf8_lossy(&bytes)) {
            let host = url
                .trim_start_matches("https://")
                .split('/')
                .next()
                .unwrap_or(&url);
            return Err(cloudflare_blocked_error(host));
        }
    }
    if ok {
        Ok(format!("OK {elapsed}ms (HTTP {status})"))
    } else if status == 403 || status == 429 {
        Ok(format!("OK {elapsed}ms (HTTP {status} - reachable)"))
    } else if (400..500).contains(&status) {
        Err(format!("HTTP {status} after {elapsed}ms"))
    } else if (500..600).contains(&status) {
        Err(format!("Server error HTTP {status} after {elapsed}ms"))
    } else {
        Ok(format!("OK {elapsed}ms (HTTP {status})"))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
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
    fn connection_test_covers_every_search_source() {
        assert_eq!(
            source_test_url("erai-raws"),
            Some("https://animetosho.org/")
        );
        assert_eq!(
            source_test_url("rutracker"),
            Some("https://rutracker.org/forum/index.php")
        );
        assert_eq!(source_test_url("nyaa"), Some("https://nyaa.si/"));
        assert_eq!(source_test_url("nekobt"), Some("https://nekobt.to/"));
        assert_eq!(source_test_url("sukebei"), Some("https://sukebei.nyaa.si/"));
        assert_eq!(source_test_url("unknown"), None);
    }
}
