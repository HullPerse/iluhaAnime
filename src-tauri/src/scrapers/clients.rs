use serde::Serialize;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, LazyLock};
use std::time::{Duration, Instant};

const SCRAPER_MIN_INTERVAL: Duration = Duration::from_millis(250);
static SCRAPER_CONCURRENCY: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(4);
static SCRAPER_LAST_REQUEST: LazyLock<tokio::sync::Mutex<Instant>> =
    LazyLock::new(|| tokio::sync::Mutex::new(Instant::now()));
pub async fn acquire_scraper_slot() -> Result<tokio::sync::SemaphorePermit<'static>, String> {
    let permit = SCRAPER_CONCURRENCY
        .acquire()
        .await
        .map_err(|_| "Scraper resource manager is closed".to_string())?;
    let mut last_request = SCRAPER_LAST_REQUEST.lock().await;
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

pub fn resolve_proxy(proxy: Option<String>, proxy_camel: Option<String>) -> Option<String> {
    proxy
        .or(proxy_camel)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

pub fn build_client_inner(
    timeout_secs: u64,
    no_redirect: bool,
    http1_only: bool,
    user_agent: &str,
    proxy: Option<&str>,
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
    if let Some(url) = proxy {
        let proxy = reqwest::Proxy::all(url).map_err(|e| format!("Invalid proxy URL: {e}"))?;
        builder = builder.proxy(proxy);
    }
    if no_redirect {
        builder = builder.redirect(reqwest::redirect::Policy::none());
    }
    if http1_only {
        builder = builder.http1_only();
    }
    builder.build().map_err(|e| format!("Client error: {e}"))
}

pub fn build_client(proxy: Option<&str>) -> Result<reqwest::Client, String> {
    build_client_inner(
    30,
    false,
    false,
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    proxy,
  )
}

pub fn build_nyaa_client(proxy: Option<&str>) -> Result<reqwest::Client, String> {
    build_client_inner(
    90,
    false,
    false,
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    proxy,
  )
}

pub fn build_no_redirect_client(proxy: Option<&str>) -> Result<reqwest::Client, String> {
    build_client_inner(
    30,
    true,
    true,
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    proxy,
  )
}

pub const RUTRACKER_DEFAULT_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

pub fn build_rutracker_client(proxy: Option<&str>) -> Result<reqwest::Client, String> {
    build_rutracker_client_with_ua(RUTRACKER_DEFAULT_UA, proxy)
}
pub fn build_rutracker_client_with_ua(
    user_agent: &str,
    proxy: Option<&str>,
) -> Result<reqwest::Client, String> {
    build_client_inner(30, false, true, user_agent, proxy)
}
pub fn build_nekobt_client(proxy: Option<&str>) -> Result<reqwest::Client, String> {
    build_client_inner(30, false, false, "iluhaAnime/1.0", proxy)
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn fetch_torrent_bytes(
    url: String,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<u8>, String> {
    const MAX_TORRENT_BYTES: u64 = 64 * 1024 * 1024;
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let client = build_nyaa_client(proxy.as_deref())?;
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

pub fn decode_rutracker_page(bytes: &[u8]) -> String {
    match std::str::from_utf8(bytes) {
        Ok(text) => text.to_string(),
        Err(_) => decode_windows_1251(bytes),
    }
}

pub fn is_rutracker_challenge(text: &str) -> bool {
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

pub fn rutracker_challenge_error() -> String {
    "blocked: anti-bot challenge on rutracker".to_string()
}

pub fn is_cloudflare_challenge(text: &str) -> bool {
    let lower = text.to_lowercase();
    ["cf-chl", "just a moment"]
        .iter()
        .any(|marker| lower.contains(marker))
}

pub fn cloudflare_blocked_error(host: &str) -> String {
    format!("blocked: Cloudflare challenge on {host}")
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

pub fn parse_seeders_leechers(s: &str) -> (u32, u32) {
    let re = regex_lite::Regex::new(r"Seeders:\s*(\d+)\s*/\s*Leechers:\s*(\d+)").ok();
    re.and_then(|r| r.captures(s)).map_or((0, 0), |c| {
        (
            c.get(1).and_then(|m| m.as_str().parse().ok()).unwrap_or(0),
            c.get(2).and_then(|m| m.as_str().parse().ok()).unwrap_or(0),
        )
    })
}

pub fn is_valid_torrent(name: &str, url: &str) -> bool {
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

pub fn parse_rus_number(s: &str) -> u32 {
    let cleaned: String = s
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == ',')
        .collect();
    let without_comma = cleaned.replace(',', "");
    without_comma.parse().unwrap_or(0)
}

pub fn absolute_detail_url(origin: &str, href: &str) -> String {
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
    fn rutracker_challenge_detection_matches_login_page_shape() {
        assert!(is_rutracker_challenge(
            "<html><head><title>Just a moment...</title></head><body>cf-chl challenge-platform</body></html>"
        ));
        assert!(is_rutracker_challenge("DDoS-Guard protection"));
        assert!(is_rutracker_challenge("captcha"));
    }

    #[test]
    fn rutracker_challenge_detection_accepts_plain_forum_pages() {
        assert!(!is_rutracker_challenge(
            "<form action=\"login.php\"><input name=\"login_username\"><input name=\"login_password\"></form>"
        ));
        assert!(!is_rutracker_challenge(
            "<a href=\"profile.php?mode=viewprofile\">Profile</a> logout"
        ));
    }

    #[test]
    fn resolve_proxy_prefers_snake_case_and_drops_blanks() {
        assert_eq!(resolve_proxy(None, None), None);
        assert_eq!(
            resolve_proxy(Some("socks5://127.0.0.1:10808".to_string()), None),
            Some("socks5://127.0.0.1:10808".to_string())
        );
        assert_eq!(
            resolve_proxy(None, Some("http://127.0.0.1:7890".to_string())),
            Some("http://127.0.0.1:7890".to_string())
        );
        assert_eq!(
            resolve_proxy(
                Some("socks5://127.0.0.1:10808".to_string()),
                Some("http://127.0.0.1:7890".to_string())
            ),
            Some("socks5://127.0.0.1:10808".to_string())
        );
        assert_eq!(
            resolve_proxy(Some("   ".to_string()), Some("".to_string())),
            None
        );
        assert_eq!(
            resolve_proxy(Some("  http://127.0.0.1:7890  ".to_string()), None),
            Some("http://127.0.0.1:7890".to_string())
        );
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
    fn cloudflare_challenge_detection_matches_interstitial_pages() {
        assert!(is_cloudflare_challenge(
            "<title>Just a moment...</title><script>cf-chl-platform</script>"
        ));
        assert!(is_cloudflare_challenge("cf-chl challenge-platform"));
    }

    #[test]
    fn cloudflare_challenge_detection_accepts_plain_tracker_pages() {
        assert!(!is_cloudflare_challenge(""));
        assert!(!is_cloudflare_challenge(
            "<div class=\"home_list_entry\"><div class=\"link\"><a>[Erai-raws] Title</a></div></div>"
        ));
        assert!(!is_cloudflare_challenge(
            "<a href=\"profile.php?mode=viewprofile\">Profile</a>"
        ));
    }

    #[test]
    fn cloudflare_blocked_error_names_the_host() {
        assert_eq!(
            cloudflare_blocked_error("animetosho.org"),
            "blocked: Cloudflare challenge on animetosho.org"
        );
    }
}
