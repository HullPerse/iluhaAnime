use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::num::NonZeroU32;
use std::path::PathBuf;
use std::sync::Arc;
use sha1::Digest;
use tauri::{Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

#[derive(Debug, Serialize)]
pub struct VideoChapter {
    pub start_time: f64,
    pub end_time: f64,
    pub title: String,
}

#[derive(Debug, Serialize)]
pub struct VideoInfo {
    pub chapters: Vec<VideoChapter>,
    pub streams: Vec<VideoStreamInfo>,
}

#[derive(Debug, Serialize)]
pub struct VideoFileEntry {
    pub path: String,
    pub name: String,
    pub size: u64,
}

#[derive(Debug, Serialize)]
pub struct VideoStreamInfo {
    pub index: i32,
    pub codec_type: String,
    pub codec_name: String,
    pub language: Option<String>,
    pub title: Option<String>,
    pub is_default: bool,
    pub file_path: Option<String>,
}

mod torrent;
use torrent::{TorrentFileInfo, TorrentInfo, TorrentInfoResult, TorrentManager};

fn ffmpeg_bin_dir(app_handle: &tauri::AppHandle) -> std::path::PathBuf {
    let platform = if cfg!(target_os = "windows") { "windows" }
                   else if cfg!(target_os = "macos") { "macos" }
                   else { "linux" };
    app_handle.path().app_data_dir().unwrap_or_default().join("bin").join(platform)
}

fn ffprobe_exe(app_handle: &tauri::AppHandle) -> String {
    let ext = if cfg!(target_os = "windows") { ".exe" } else { "" };
    let custom = ffmpeg_bin_dir(app_handle).join(format!("ffprobe{ext}"));
    if custom.exists() { custom.to_string_lossy().to_string() } else { format!("ffprobe{ext}") }
}

fn ffmpeg_exe(app_handle: &tauri::AppHandle) -> String {
    let ext = if cfg!(target_os = "windows") { ".exe" } else { "" };
    let custom = ffmpeg_bin_dir(app_handle).join(format!("ffmpeg{ext}"));
    if custom.exists() { custom.to_string_lossy().to_string() } else { format!("ffmpeg{ext}") }
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
}

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Client error: {e}"))
}

#[tauri::command]
async fn search_erairaws(query: String, encoding: String) -> Result<Vec<NyaaItem>, String> {
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

fn rutracker_cookie_path(app_handle: &tauri::AppHandle) -> PathBuf {
    let dir = app_handle.path().app_data_dir().expect("app data dir");
    dir.join("rutracker_cookies.json")
}

fn save_rutracker_cookies(
    app_handle: &tauri::AppHandle,
    cookies: &HashMap<String, String>,
) -> Result<(), String> {
    let path = rutracker_cookie_path(app_handle);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create dir: {e}"))?;
    }
    let json = serde_json::to_string(cookies).map_err(|e| format!("Serialize error: {e}"))?;
    fs::write(&path, &json).map_err(|e| format!("Write error: {e}"))
}

fn load_rutracker_cookies(app_handle: &tauri::AppHandle) -> HashMap<String, String> {
    let path = rutracker_cookie_path(app_handle);
    if !path.exists() {
        return HashMap::new();
    }
    let json = match fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => return HashMap::new(),
    };
    serde_json::from_str(&json).unwrap_or_default()
}

fn nekobt_api_key_path(app_handle: &tauri::AppHandle) -> PathBuf {
    let dir = app_handle.path().app_data_dir().expect("app data dir");
    dir.join("nekobt_key.json")
}

fn save_nekobt_api_key(app_handle: &tauri::AppHandle, key: &str) -> Result<(), String> {
    let path = nekobt_api_key_path(app_handle);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create dir: {e}"))?;
    }
    fs::write(&path, key).map_err(|e| format!("Write error: {e}"))
}

fn load_nekobt_api_key(app_handle: &tauri::AppHandle) -> String {
    let path = nekobt_api_key_path(app_handle);
    if !path.exists() {
        return String::new();
    }
    fs::read_to_string(&path).unwrap_or_default()
}

fn cookies_to_header(cookies: &HashMap<String, String>) -> String {
    cookies
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join("; ")
}

fn extract_cookies_from_headers(
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

fn decode_windows_1251(bytes: &[u8]) -> String {
    let (cow, _, _) = encoding_rs::WINDOWS_1251.decode(bytes);
    cow.to_string()
}

fn build_no_redirect_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| format!("Client error: {e}"))
}

#[tauri::command]
async fn rutracker_login(
    app_handle: tauri::AppHandle,
    username: String,
    password: String,
) -> Result<String, String> {
    let no_redirect = build_no_redirect_client()?;
    let client = build_client()?;
    let mut cookies = HashMap::new();

    // 1. GET index.php (no redirect) to capture initial cookies
    let init_resp = no_redirect
        .get("https://rutracker.org/forum/index.php")
        .send()
        .await
        .map_err(|e| format!("Connection failed: {e}"))?;

    extract_cookies_from_headers(init_resp.headers(), &mut cookies);

    // If index.php redirects, follow it manually to capture all cookies
    if init_resp.status() == reqwest::StatusCode::FOUND
        || init_resp.status() == reqwest::StatusCode::MOVED_PERMANENTLY
    {
        let redirected = no_redirect
            .get("https://rutracker.org/forum/index.php")
            .header("Cookie", cookies_to_header(&cookies))
            .send()
            .await
            .map_err(|e| format!("Redirect follow failed: {e}"))?;
        extract_cookies_from_headers(redirected.headers(), &mut cookies);
    }

    // 2. POST login.php (no redirect) — 302 on success carries session cookie
    let login_resp = no_redirect
        .post("https://rutracker.org/forum/login.php")
        .header("Cookie", cookies_to_header(&cookies))
        .header("Referer", "https://rutracker.org/forum/index.php")
        .form(&[
            ("login_username", username.as_str()),
            ("login_password", password.as_str()),
            ("login", "Вход"),
            ("redirect", "index.php"),
        ])
        .send()
        .await
        .map_err(|e| format!("Login request failed: {e}"))?;

    let status = login_resp.status();
    extract_cookies_from_headers(login_resp.headers(), &mut cookies);

    if status != reqwest::StatusCode::FOUND && status != reqwest::StatusCode::MOVED_PERMANENTLY {
        return Err("Неверное имя пользователя или пароль".to_string());
    }

    // 3. Follow the redirect manually: GET index.php to finalise session
    let post_login = no_redirect
        .get("https://rutracker.org/forum/index.php")
        .header("Cookie", cookies_to_header(&cookies))
        .send()
        .await
        .map_err(|e| format!("Post-login request failed: {e}"))?;
    extract_cookies_from_headers(post_login.headers(), &mut cookies);

    // If index.php redirects again (e.g. to index.php?sid=…), follow once more
    if post_login.status() == reqwest::StatusCode::FOUND
        || post_login.status() == reqwest::StatusCode::MOVED_PERMANENTLY
    {
        let final_resp = client
            .get("https://rutracker.org/forum/index.php")
            .header("Cookie", cookies_to_header(&cookies))
            .send()
            .await
            .map_err(|e| format!("Final redirect follow failed: {e}"))?;
        extract_cookies_from_headers(final_resp.headers(), &mut cookies);
    }

    save_rutracker_cookies(&app_handle, &cookies)?;

    Ok("ok".to_string())
}

#[tauri::command]
async fn check_rutracker_session(app_handle: tauri::AppHandle) -> Result<bool, String> {
    let cookies = load_rutracker_cookies(&app_handle);
    if cookies.is_empty() {
        return Ok(false);
    }

    let client = build_client()?;
    let resp = client
        .get("https://rutracker.org/forum/index.php")
        .header("Cookie", cookies_to_header(&cookies))
        .send()
        .await
        .map_err(|e| format!("Connection failed: {e}"))?;

    let bytes = resp.bytes().await.map_err(|e| format!("Read error: {e}"))?;
    let text = decode_windows_1251(&bytes);

    // positive check: profile link in header means authenticated
    // fallback: absence of login form
    Ok(text.contains("profile.php?mode=viewprofile") || !text.contains("login-form-full"))
}

#[tauri::command]
async fn rutracker_logout(app_handle: tauri::AppHandle) -> Result<(), String> {
    let path = rutracker_cookie_path(&app_handle);
    let _ = fs::remove_file(&path);
    Ok(())
}

#[tauri::command]
async fn search_rutracker(
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

        // Skip rows with no magnet link — only real torrents have one
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

fn build_nyaa_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(90))
        .build()
        .map_err(|e| format!("Client error: {e}"))
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
    // numeric-only titles like "1 comment" are not real torrents
    if name.chars().all(|c| c.is_ascii_digit() || c.is_whitespace() || c == '.' || c == ',') {
        return false;
    }
    // skip common non-torrent text
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

#[tauri::command]
async fn search_nyaa(query: String, page: Option<u32>, sort: Option<String>, order: Option<String>) -> Result<Vec<NyaaItem>, String> {
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
async fn rutracker_get_magnet(
    app_handle: tauri::AppHandle,
    topic_id: String,
) -> Result<String, String> {
    let cookies = load_rutracker_cookies(&app_handle);
    if cookies.is_empty() {
        return Err("Not authenticated".to_string());
    }

    let client = build_client()?;
    let resp = client
        .get(format!("https://rutracker.org/forum/dl.php?t={}", topic_id))
        .header("Cookie", cookies_to_header(&cookies))
        .send()
        .await
        .map_err(|e| format!("Download failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Download returned HTTP {}", resp.status()));
    }

    let bytes = resp.bytes().await.map_err(|e| format!("Read error: {e}"))?;

    let info_hash = extract_info_hash(&bytes)?;
    let name = extract_torrent_name(&bytes).unwrap_or_default();

    let mut magnet = format!("magnet:?xt=urn:btih:{}", info_hash);
    if !name.is_empty() {
        magnet.push_str("&dn=");
        magnet.push_str(&url_encode(name));
    }

    if let Ok(announce) = extract_announce_url(&bytes) {
        if !announce.is_empty() {
            magnet.push_str("&tr=");
            magnet.push_str(&url_encode(announce));
        }
    }

    Ok(magnet)
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

fn build_nekobt_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("iluhaAnime/1.0")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Client error: {e}"))
}

#[tauri::command]
async fn nekobt_set_api_key(app_handle: tauri::AppHandle, api_key: String) -> Result<String, String> {
    let key = api_key.trim().to_string();
    if key.is_empty() {
        return Err("API key cannot be empty".to_string());
    }

    let client = build_nekobt_client()?;
    let resp = client
        .get("https://nekobt.to/api/v1/announcements")
        .header("Cookie", format!("ssid={key}"))
        .send()
        .await
        .map_err(|e| format!("Connection failed: {e}"))?;

    if !resp.status().is_success() {
        return Err("Invalid API key or connection error".to_string());
    }

    let body: serde_json::Value = resp.bytes().await
        .map_err(|e| format!("Read error: {e}"))
        .and_then(|b| serde_json::from_slice(&b).map_err(|e| format!("Parse error: {e}")))?;

    if body.get("error").and_then(|v| v.as_bool()).unwrap_or(true) {
        let msg = body.get("message").and_then(|v| v.as_str()).unwrap_or("Invalid API key");
        return Err(msg.to_string());
    }

    save_nekobt_api_key(&app_handle, &key)?;
    Ok("ok".to_string())
}

#[tauri::command]
async fn check_nekobt_session(app_handle: tauri::AppHandle) -> Result<bool, String> {
    let key = load_nekobt_api_key(&app_handle);
    if key.is_empty() {
        return Ok(false);
    }

    let client = build_nekobt_client()?;
    let resp = client
        .get("https://nekobt.to/api/v1/announcements")
        .header("Cookie", format!("ssid={key}"))
        .send()
        .await;

    match resp {
        Ok(r) => Ok(r.status().is_success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
async fn nekobt_logout(app_handle: tauri::AppHandle) -> Result<(), String> {
    let path = nekobt_api_key_path(&app_handle);
    let _ = fs::remove_file(&path);
    Ok(())
}

#[tauri::command]
async fn search_nekobt(
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

fn url_encode(s: String) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            b' ' => "+".to_string(),
            _ => format!("%{:02X}", b),
        })
        .collect()
}

fn extract_info_hash(torrent_bytes: &[u8]) -> Result<String, String> {
    let bytes = torrent_bytes;
    if bytes.is_empty() || bytes[0] != b'd' {
        return Err("Invalid torrent file".to_string());
    }

    let mut pos = 1;
    while pos < bytes.len() && bytes[pos] != b'e' {
        let (key, new_pos) = read_bencode_string(bytes, pos)
            .map_err(|_| "Failed to read key".to_string())?;
        if key == b"info" {
            let value_start = new_pos;
            let (_, value_end) = skip_bencode_value(bytes, new_pos)
                .map_err(|_| "Failed to skip info value".to_string())?;

            let info_bytes = &bytes[value_start..value_end];
            let mut hasher = sha1::Sha1::new();
            hasher.update(info_bytes);
            let hash = hasher.finalize();
            return Ok(hex::encode(hash));
        }
        let (_, new_pos) = skip_bencode_value(bytes, new_pos)
            .map_err(|_| "Failed to skip value".to_string())?;
        pos = new_pos;
    }

    Err("Could not find info in torrent".to_string())
}

fn extract_torrent_name(torrent_bytes: &[u8]) -> Result<String, String> {
    let bytes = torrent_bytes;
    if bytes.is_empty() || bytes[0] != b'd' {
        return Err("Invalid torrent file".to_string());
    }

    let mut pos = find_info_dict_start(bytes)?;
    if pos == bytes.len() {
        return Err("No info dict".to_string());
    }

    while pos < bytes.len() && bytes[pos] != b'e' {
        let (key, new_pos) = read_bencode_string(bytes, pos)
            .map_err(|_| "Failed to read key in info".to_string())?;
        if key == b"name" {
            let (name_bytes, _) = read_bencode_string(bytes, new_pos)
                .map_err(|_| "Failed to read name".to_string())?;
            return Ok(String::from_utf8_lossy(name_bytes).to_string());
        }
        let (_, new_pos) = skip_bencode_value(bytes, new_pos)
            .map_err(|_| "Failed to skip value in info".to_string())?;
        pos = new_pos;
    }

    Err("No name found".to_string())
}

fn extract_announce_url(torrent_bytes: &[u8]) -> Result<String, String> {
    let bytes = torrent_bytes;
    if bytes.is_empty() || bytes[0] != b'd' {
        return Err("Invalid torrent file".to_string());
    }

    let mut pos = 1;
    while pos < bytes.len() && bytes[pos] != b'e' {
        let (key, new_pos) = read_bencode_string(bytes, pos)
            .map_err(|_| "Failed to read key".to_string())?;
        if key == b"announce" {
            let (announce_bytes, _) = read_bencode_string(bytes, new_pos)
                .map_err(|_| "Failed to read announce".to_string())?;
            return Ok(String::from_utf8_lossy(announce_bytes).to_string());
        }
        let (_, new_pos) = skip_bencode_value(bytes, new_pos)
            .map_err(|_| "Failed to skip value".to_string())?;
        pos = new_pos;
    }

    Err("No announce found".to_string())
}

fn find_info_dict_start(bytes: &[u8]) -> Result<usize, String> {
    let mut pos = 1;
    while pos < bytes.len() && bytes[pos] != b'e' {
        let (key, new_pos) = read_bencode_string(bytes, pos)
            .map_err(|_| "Failed to read key".to_string())?;
        if key == b"info" {
            return Ok(new_pos);
        }
        let (_, new_pos) = skip_bencode_value(bytes, new_pos)
            .map_err(|_| "Failed to skip value".to_string())?;
        pos = new_pos;
    }
    Err("No info key found".to_string())
}

fn read_bencode_string(bytes: &[u8], pos: usize) -> Result<(&[u8], usize), String> {
    let remaining = &bytes[pos..];
    let colon_pos = remaining.iter().position(|&b| b == b':')
        .ok_or("No colon in bencode string")?;
    let len_str = std::str::from_utf8(&remaining[..colon_pos])
        .map_err(|_| "Invalid length".to_string())?;
    let len: usize = len_str.parse().map_err(|_| "Invalid length number".to_string())?;
    let str_start = pos + colon_pos + 1;
    let str_end = str_start + len;
    if str_end > bytes.len() {
        return Err("String out of bounds".to_string());
    }
    Ok((&bytes[str_start..str_end], str_end))
}

fn skip_bencode_value(bytes: &[u8], pos: usize) -> Result<(usize, usize), String> {
    if pos >= bytes.len() {
        return Err("Unexpected end".to_string());
    }
    match bytes[pos] {
        b'i' => {
            let end = bytes[pos..].iter().position(|&b| b == b'e')
                .ok_or("Unterminated integer".to_string())?;
            Ok((pos, pos + end + 1))
        }
        b'l' | b'd' => {
            let mut p = pos + 1;
            while p < bytes.len() && bytes[p] != b'e' {
                let (_, new_p) = skip_bencode_value(bytes, p)?;
                p = new_p;
            }
            if p >= bytes.len() {
                return Err("Unterminated list/dict".to_string());
            }
            Ok((pos, p + 1))
        }
        c if c.is_ascii_digit() => read_bencode_string(bytes, pos).map(|(_, end)| (pos, end)),
        _ => Err(format!("Unknown bencode type at pos {}", pos)),
    }
}

#[tauri::command]
async fn start_torrent_download(
    magnet: String,
    save_dir: String,
    only_files: Option<Vec<usize>>,
    sub_folder: Option<String>,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<usize, String> {
    manager
        .manager
        .add_torrent(magnet, save_dir, only_files, sub_folder)
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn get_torrent_info(
    magnet: String,
    save_dir: String,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<TorrentInfoResult, String> {
    manager.manager.get_torrent_info(magnet, save_dir).await
}

#[tauri::command]
fn list_torrents(manager: tauri::State<'_, TorrentBackend>) -> Result<Vec<TorrentInfo>, String> {
    Ok(manager.manager.collect_torrents())
}

#[tauri::command]
async fn pause_torrent(id: usize, manager: tauri::State<'_, TorrentBackend>) -> Result<(), String> {
    manager
        .manager
        .pause_torrent(id)
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn resume_torrent(
    id: usize,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<(), String> {
    manager
        .manager
        .resume_torrent(id)
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn remove_torrent(
    id: usize,
    delete_files: bool,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<(), String> {
    manager
        .manager
        .remove_torrent(id, delete_files)
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
fn get_app_data_path(app_handle: tauri::AppHandle) -> Result<String, String> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create dir: {e}"))?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, &content).map_err(|e| format!("Write error: {e}"))
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Read error: {e}"))
}

#[tauri::command]
fn set_global_speed_limits(
    download_bps: Option<u32>,
    upload_bps: Option<u32>,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<(), String> {
    manager.manager.set_global_limits(
        download_bps.and_then(NonZeroU32::new),
        upload_bps.and_then(NonZeroU32::new),
    );
    Ok(())
}

#[tauri::command]
fn get_running_torrent_files(
    id: usize,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<Vec<TorrentFileInfo>, String> {
    manager.manager.get_running_torrent_files(id)
}

#[tauri::command]
async fn update_torrent_only_files(
    id: usize,
    only_files: Vec<usize>,
    manager: tauri::State<'_, TorrentBackend>,
) -> Result<(), String> {
    manager
        .manager
        .update_torrent_only_files(id, only_files)
        .await
}

#[tauri::command]
async fn get_video_chapters(app_handle: tauri::AppHandle, path: String) -> Result<Vec<VideoChapter>, String> {
    let output = std::process::Command::new(ffprobe_exe(&app_handle))
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_chapters",
            &path,
        ])
        .output()
        .map_err(|e| format!("ffprobe not found: {e}"))?;

    if !output.status.success() {
        return Err("ffprobe returned non-zero exit code".to_string());
    }

    let json: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse ffprobe output: {e}"))?;

    let chapters = json["chapters"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|ch| {
                    let start = ch["start_time"]
                        .as_str()
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(0.0);
                    let end = ch["end_time"]
                        .as_str()
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(0.0);
                    let title = ch["tags"]["title"]
                        .as_str()
                        .unwrap_or("")
                        .to_string();
                    if start == 0.0 && end == 0.0 {
                        return None;
                    }
                    Some(VideoChapter { start_time: start, end_time: end, title })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok(chapters)
}

#[tauri::command]
async fn get_video_streams(app_handle: tauri::AppHandle, path: String) -> Result<Vec<VideoStreamInfo>, String> {
    let output = std::process::Command::new(ffprobe_exe(&app_handle))
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_streams",
            &path,
        ])
        .output()
        .map_err(|e| format!("ffprobe not found: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe error: {stderr}"));
    }

    let json: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse ffprobe output: {e}"))?;

    let streams = json["streams"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter(|s| {
                    let t = s["codec_type"].as_str().unwrap_or("");
                    t == "audio" || t == "subtitle"
                })
                .map(|s| VideoStreamInfo {
                    index: s["index"].as_i64().unwrap_or(0) as i32,
                    codec_type: s["codec_type"].as_str().unwrap_or("").to_string(),
                    codec_name: s["codec_name"].as_str().unwrap_or("").to_string(),
                    language: s["tags"]["language"].as_str().map(|l| l.to_string()),
                    title: s["tags"]["title"].as_str().map(|t| t.to_string()),
                    is_default: s["disposition"]["default"].as_i64().unwrap_or(0) == 1,
                    file_path: None,
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok(streams)
}

#[tauri::command]
async fn extract_video_subtitle(app_handle: tauri::AppHandle, path: String, stream_index: usize, codec_name: Option<String>) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let is_ass = codec_name.as_deref() == Some("ass") || codec_name.as_deref() == Some("ssa");
    let ext = if is_ass { "ass" } else { "vtt" };
    let output_path = temp_dir.join(format!("iluha_sub_{}.{}", stream_index, ext));

    let _ = std::fs::remove_file(&output_path);

    let mut args = vec![
        "-y".to_string(),
        "-i".to_string(),
        path.clone(),
        "-map".to_string(),
        format!("0:{}", stream_index),
    ];
    if is_ass {
        args.extend_from_slice(&["-c:s".to_string(), "copy".to_string()]);
    } else {
        args.extend_from_slice(&["-c:s".to_string(), "webvtt".to_string()]);
    }
    args.push(output_path.to_string_lossy().to_string());

    let output = std::process::Command::new(ffmpeg_exe(&app_handle))
        .args(&args)
        .output()
        .map_err(|e| format!("ffmpeg not found: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg failed: {stderr}"));
    }

    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn remux_video_audio(app_handle: tauri::AppHandle, path: String, stream_index: usize) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let output_path = temp_dir.join(format!("iluha_audio_{}.mkv", stream_index));

    let _ = std::fs::remove_file(&output_path);

    let output = std::process::Command::new(ffmpeg_exe(&app_handle))
        .args([
            "-y",
            "-i",
            &path,
            "-map",
            "0:v",
            "-map",
            &format!("0:{}", stream_index),
            "-c",
            "copy",
            "-map_metadata",
            "0",
            &output_path.to_string_lossy().to_string(),
        ])
        .output()
        .map_err(|e| format!("ffmpeg not found: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg remux failed: {stderr}"));
    }

    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn scan_external_tracks(path: String) -> Result<Vec<VideoStreamInfo>, String> {
    let video_path = std::path::Path::new(&path);
    let parent = video_path.parent().unwrap_or(std::path::Path::new(""));
    let stem = video_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    let sub_exts = [
        "srt", "ass", "ssa", "vtt", "sub", "idx", "sup", "pgs", "stl", "ttml",
    ];
    let audio_exts = [
        "mp3", "aac", "m4a", "mka", "ac3", "eac3", "dts", "truehd", "flac",
        "ogg", "opus", "wav", "wma",
    ];

    let mut tracks: Vec<VideoStreamInfo> = Vec::new();
    let mut ext_idx: i32 = -1;
    let mut stack: Vec<std::path::PathBuf> = vec![parent.to_path_buf()];

    while let Some(dir) = stack.pop() {
        if !dir.is_dir() {
            continue;
        }
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_dir() {
                stack.push(entry_path);
                continue;
            }
            let file_stem = match entry_path.file_stem().and_then(|s| s.to_str()) {
                Some(s) => s.to_lowercase(),
                None => continue,
            };
            if file_stem != stem
                && !file_stem.starts_with(&format!("{}.", stem))
                && !file_stem.starts_with(&format!("{} - ", stem))
            {
                continue;
            }
            let ext = match entry_path.extension().and_then(|e| e.to_str()) {
                Some(e) => e.to_lowercase(),
                None => continue,
            };
            let codec_type = if sub_exts.contains(&ext.as_str()) {
                "subtitle"
            } else if audio_exts.contains(&ext.as_str()) {
                "audio"
            } else {
                continue;
            };
            let label = entry_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            tracks.push(VideoStreamInfo {
                index: ext_idx,
                codec_type: codec_type.to_string(),
                codec_name: ext,
                language: None,
                title: Some(label.clone()),
                is_default: false,
                file_path: Some(entry_path.to_string_lossy().to_string()),
            });
            ext_idx -= 1;
        }
    }

    Ok(tracks)
}

#[tauri::command]
async fn remux_with_external_audio(
    app_handle: tauri::AppHandle,
    video_path: String,
    audio_path: String,
) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let output_path = temp_dir.join("iluha_ext_audio.mkv");
    let _ = std::fs::remove_file(&output_path);

    let output = std::process::Command::new(ffmpeg_exe(&app_handle))
        .args([
            "-y",
            "-i",
            &video_path,
            "-i",
            &audio_path,
            "-map",
            "0:v",
            "-map",
            "1:a",
            "-c",
            "copy",
            "-map_metadata",
            "0",
            &output_path.to_string_lossy().to_string(),
        ])
        .output()
        .map_err(|e| format!("ffmpeg not found: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg remux failed: {stderr}"));
    }

    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn convert_external_subtitle(app_handle: tauri::AppHandle, path: String, codec_name: Option<String>) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let is_ass = codec_name.as_deref() == Some("ass") || codec_name.as_deref() == Some("ssa") || path.ends_with(".ass") || path.ends_with(".ssa");
    let ext = if is_ass { "ass" } else { "vtt" };
    let output_path = temp_dir.join(format!("iluha_ext_sub.{}", ext));
    let _ = std::fs::remove_file(&output_path);

    let mut args = vec![
        "-y".to_string(),
        "-i".to_string(),
        path.clone(),
    ];
    if is_ass {
        args.extend_from_slice(&["-c:s".to_string(), "copy".to_string()]);
    } else {
        args.extend_from_slice(&["-c:s".to_string(), "webvtt".to_string()]);
    }
    args.push(output_path.to_string_lossy().to_string());

    let output = std::process::Command::new(ffmpeg_exe(&app_handle))
        .args(&args)
        .output()
        .map_err(|e| format!("ffmpeg not found: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg subtitle convert failed: {stderr}"));
    }

    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn check_ffprobe(app_handle: tauri::AppHandle) -> Result<bool, String> {
    let probe = ffprobe_exe(&app_handle);
    let status = std::process::Command::new(&probe)
        .arg("-version")
        .output();
    match status {
        Ok(o) => Ok(o.status.success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
async fn get_video_info(app_handle: tauri::AppHandle, path: String) -> Result<VideoInfo, String> {
    let output = std::process::Command::new(ffprobe_exe(&app_handle))
        .args([
            "-v", "quiet",
            "-print_format", "json",
            "-show_chapters",
            "-show_streams",
            &path,
        ])
        .output()
        .map_err(|e| format!("ffprobe not found: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe error: {stderr}"));
    }

    let json: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse ffprobe output: {e}"))?;

    let chapters = json["chapters"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|ch| {
                    let start = ch["start_time"]
                        .as_str()
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(0.0);
                    let end = ch["end_time"]
                        .as_str()
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(0.0);
                    let title = ch["tags"]["title"]
                        .as_str()
                        .unwrap_or("")
                        .to_string();
                    if start == 0.0 && end == 0.0 {
                        return None;
                    }
                    Some(VideoChapter { start_time: start, end_time: end, title })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let mut streams: Vec<VideoStreamInfo> = json["streams"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter(|s| {
                    let t = s["codec_type"].as_str().unwrap_or("");
                    t == "audio" || t == "subtitle"
                })
                .map(|s| VideoStreamInfo {
                    index: s["index"].as_i64().unwrap_or(0) as i32,
                    codec_type: s["codec_type"].as_str().unwrap_or("").to_string(),
                    codec_name: s["codec_name"].as_str().unwrap_or("").to_string(),
                    language: s["tags"]["language"].as_str().map(|l| l.to_string()),
                    title: s["tags"]["title"].as_str().map(|t| t.to_string()),
                    is_default: s["disposition"]["default"].as_i64().unwrap_or(0) == 1,
                    file_path: None,
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    // external tracks: sibling files
    let video_path = std::path::Path::new(&path);
    let parent = video_path.parent().unwrap_or(std::path::Path::new(""));
    let stem = video_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    let sub_exts = [
        "srt", "ass", "ssa", "vtt", "sub", "idx", "sup", "pgs", "stl", "ttml",
    ];
    let audio_exts = [
        "mp3", "aac", "m4a", "mka", "ac3", "eac3", "dts", "truehd", "flac",
        "ogg", "opus", "wav", "wma",
    ];

    let mut ext_idx: i32 = -1;
    let mut stack: Vec<std::path::PathBuf> = vec![parent.to_path_buf()];
    while let Some(dir) = stack.pop() {
        if !dir.is_dir() { continue; }
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_dir() {
                stack.push(entry_path);
                continue;
            }
            let file_stem = match entry_path.file_stem().and_then(|s| s.to_str()) {
                Some(s) => s.to_lowercase(),
                None => continue,
            };
            if file_stem != stem
                && !file_stem.starts_with(&format!("{}.", stem))
                && !file_stem.starts_with(&format!("{} - ", stem))
            {
                continue;
            }
            let ext = match entry_path.extension().and_then(|e| e.to_str()) {
                Some(e) => e.to_lowercase(),
                None => continue,
            };
            let codec_type = if sub_exts.contains(&ext.as_str()) {
                "subtitle"
            } else if audio_exts.contains(&ext.as_str()) {
                "audio"
            } else {
                continue;
            };
            let label = entry_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            streams.push(VideoStreamInfo {
                index: ext_idx,
                codec_type: codec_type.to_string(),
                codec_name: ext,
                language: None,
                title: Some(label),
                is_default: false,
                file_path: Some(entry_path.to_string_lossy().to_string()),
            });
            ext_idx -= 1;
        }
    }

    Ok(VideoInfo { chapters, streams })
}

fn download_urls() -> Result<(&'static str, &'static str, &'static str), String> {
    #[cfg(target_os = "windows")]
    return Ok((
        "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n8.1-latest-win64-gpl-8.1.zip",
        "bin/ffmpeg.exe",
        "bin/ffprobe.exe",
    ));

    #[cfg(not(any(target_os = "windows")))]
    return Err("Unsupported platform".to_string());
}

#[tauri::command]
async fn download_ffmpeg(app_handle: tauri::AppHandle) -> Result<String, String> {
    let dir = ffmpeg_bin_dir(&app_handle);
    std::fs::create_dir_all(&dir).map_err(|e| format!("create dir: {e}"))?;

    let (url, ffmpeg_in, ffprobe_in) = download_urls()?;

    let ffmpeg_out = dir.join(if cfg!(target_os = "windows") { "ffmpeg.exe" } else { "ffmpeg" });
    let ffprobe_out = dir.join(if cfg!(target_os = "windows") { "ffprobe.exe" } else { "ffprobe" });
    if ffmpeg_out.exists() && ffprobe_out.exists() {
        return Ok(dir.to_string_lossy().to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("client: {e}"))?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("download: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }

    let bytes = response.bytes().await.map_err(|e| format!("read: {e}"))?;
    let cursor = std::io::Cursor::new(&bytes);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| format!("zip: {e}"))?;

    let targets = [(ffmpeg_in, &ffmpeg_out), (ffprobe_in, &ffprobe_out)];
    for (in_zip, out_path) in &targets {
        let mut found = false;
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| format!("zip entry: {e}"))?;
            let name = file.name().to_string().replace('\\', "/");
            if name.ends_with(in_zip) || name.contains(in_zip) {
                let mut outfile =
                    std::fs::File::create(out_path).map_err(|e| format!("create file: {e}"))?;
                std::io::copy(&mut file, &mut outfile).map_err(|e| format!("extract: {e}"))?;
                found = true;
                break;
            }
        }
        if !found {
            return Err(format!("{in_zip} not found in archive"));
        }
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(m) = std::fs::metadata(&ffmpeg_out) {
            let mut p = m.permissions();
            p.set_mode(0o755);
            let _ = std::fs::set_permissions(&ffmpeg_out, p);
        }
        if let Ok(m) = std::fs::metadata(&ffprobe_out) {
            let mut p = m.permissions();
            p.set_mode(0o755);
            let _ = std::fs::set_permissions(&ffprobe_out, p);
        }
    }

    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
async fn scan_video_folder(path: String) -> Result<Vec<VideoFileEntry>, String> {
    let video_exts = [
        "mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "m4v",
        "mpg", "mpeg", "ts", "m2ts", "ogv", "3gp",
    ];
    let root = std::path::Path::new(&path);
    if !root.is_dir() {
        return Err("Not a directory".to_string());
    }

    let mut files: Vec<VideoFileEntry> = Vec::new();
    let mut stack: Vec<std::path::PathBuf> = vec![root.to_path_buf()];

    while let Some(dir) = stack.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_dir() {
                stack.push(entry_path);
                continue;
            }
            let ext = entry_path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_lowercase())
                .unwrap_or_default();
            if !video_exts.contains(&ext.as_str()) {
                continue;
            }
            let name = entry_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            let size = match entry.metadata() {
                Ok(m) => m.len(),
                Err(_) => 0,
            };
            files.push(VideoFileEntry {
                path: entry_path.to_string_lossy().to_string(),
                name,
                size,
            });
        }
    }

    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(files)
}

struct TorrentBackend {
    manager: Arc<TorrentManager>,
}



#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let app_data = app.path().app_data_dir().expect("app data dir");
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async {
                let manager = TorrentManager::new(app_data)
                    .await
                    .expect("failed to initialize torrent session");
                let manager = Arc::new(manager);
                let app_clone = handle.clone();
                let mgr_clone = manager.clone();
                tokio::spawn(async move {
                    let mut prev_states: HashMap<usize, (bool, Option<String>)> = HashMap::new();
                    let mut cleanup_counter: u32 = 0;
                    loop {
                        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                        let torrents = mgr_clone.collect_torrents();
                        let _ = app_clone.emit("torrents-update", &torrents);

                        for t in &torrents {
                            let prev = prev_states.get(&t.id);
                            let prev_finished = prev.map(|(f, _)| *f).unwrap_or(false);
                            let prev_error = prev.and_then(|(_, e)| e.clone());

                            if t.finished && !prev_finished && t.total_bytes > 0 {
                                let _ = app_clone
                                    .notification()
                                    .builder()
                                    .title("Загрузка завершена")
                                    .body(&t.name)
                                    .show();
                            }

                            if t.error.is_some() && prev_error.is_none() {
                                let msg =
                                    format!("{}: {}", t.name, t.error.as_deref().unwrap_or(""));
                                let _ = app_clone
                                    .notification()
                                    .builder()
                                    .title("Ошибка загрузки")
                                    .body(&msg)
                                    .show();
                            }

                            prev_states.insert(t.id, (t.finished, t.error.clone()));
                        }

                        let current_ids: HashSet<usize> = torrents.iter().map(|t| t.id).collect();
                        prev_states.retain(|id, _| current_ids.contains(id));

                        cleanup_counter += 1;
                        if cleanup_counter >= 30 {
                            cleanup_counter = 0;
                            mgr_clone.cleanup_unselected_files();
                        }
                    }
                });
                handle.manage(TorrentBackend { manager });
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            search_erairaws,
            search_nyaa,
            search_rutracker,
            rutracker_login,
            check_rutracker_session,
            rutracker_logout,
            rutracker_get_magnet,
            nekobt_set_api_key,
            check_nekobt_session,
            nekobt_logout,
            search_nekobt,
            start_torrent_download,
            list_torrents,
            pause_torrent,
            resume_torrent,
            remove_torrent,
            get_app_data_path,
            write_text_file,
            read_text_file,
            get_torrent_info,
            get_running_torrent_files,
            update_torrent_only_files,
            set_global_speed_limits,
            get_video_chapters,
            get_video_streams,
            extract_video_subtitle,
            remux_video_audio,
            scan_external_tracks,
            remux_with_external_audio,
            convert_external_subtitle,
            check_ffprobe,
            get_video_info,
            download_ffmpeg,
            scan_video_folder,

        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
