use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::Manager;

use base64::Engine;

use crate::bencode::{extract_announce_url, extract_info_hash, extract_torrent_name};
use crate::errors::AppResult;
use crate::scrapers::{
    build_nekobt_client, build_no_redirect_client, build_rutracker_client,
    build_rutracker_client_with_ua, cookies_to_header, decode_windows_1251,
    extract_cookies_from_headers, url_encode,
};

const KEYRING_SERVICE: &str = "iluhaAnime";
const RUTRACKER_CREDENTIAL: &str = "rutracker.cookies";
const RUTRACKER_USER_AGENT: &str = "rutracker.user_agent";
const NEKOBT_CREDENTIAL: &str = "nekobt.api_key";
const RUTRACKER_WEBVIEW_LABEL: &str = "rutracker-login";
const ERAI_CREDENTIAL: &str = "erai-raws.cookies";
const ERAI_WEBVIEW_LABEL: &str = "erai-raws-login";

#[cfg(target_os = "windows")]
static RUTRACKER_BROWSER_REQUEST_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Debug)]
pub struct RutrackerBrowserResponse {
    pub status: u16,
    pub body: Vec<u8>,
}

pub fn save_secret(account: &str, value: &str) -> AppResult<()> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, account)?;
    entry.set_password(value)?;
    Ok(())
}

pub fn load_secret(account: &str) -> AppResult<String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, account)?;
    Ok(entry.get_password()?)
}

pub fn delete_secret(account: &str) {
    if let Ok(entry) = keyring::Entry::new(KEYRING_SERVICE, account) {
        let _ = entry.delete_credential();
    }
}

fn rutracker_cookie_path(app_handle: &tauri::AppHandle) -> PathBuf {
    let dir = app_handle.path().app_data_dir().unwrap_or_else(|e| {
        eprintln!("Failed to get app data dir: {e}");
        PathBuf::from(".")
    });
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
    let json = serde_json::to_string(cookies).map_err(|error| error.to_string())?;
    save_secret(RUTRACKER_CREDENTIAL, &json).map_err(|error| error.to_string())?;
    let _ = fs::remove_file(path);
    Ok(())
}

/// Persists the User-Agent the in-app browser used when the rutracker session
/// was captured. Anti-bot clearance cookies are bound to the User-Agent that
/// passed the challenge, so the HTTP client must send the same one.
pub fn save_rutracker_user_agent(_app_handle: &tauri::AppHandle, user_agent: &str) {
    let trimmed = user_agent.trim();
    if !trimmed.is_empty() {
        let _ = save_secret(RUTRACKER_USER_AGENT, trimmed);
    }
}

pub fn load_rutracker_user_agent(_app_handle: &tauri::AppHandle) -> Option<String> {
    load_secret(RUTRACKER_USER_AGENT)
        .ok()
        .filter(|value| !value.trim().is_empty())
}

pub fn load_rutracker_cookies(app_handle: &tauri::AppHandle) -> HashMap<String, String> {
    if let Ok(json) = load_secret(RUTRACKER_CREDENTIAL) {
        if let Ok(cookies) = serde_json::from_str(&json) {
            return cookies;
        }
    }

    let path = rutracker_cookie_path(app_handle);
    let Ok(json) = fs::read_to_string(&path) else {
        return HashMap::new();
    };
    let cookies: HashMap<String, String> = serde_json::from_str(&json).unwrap_or_default();
    if !cookies.is_empty() && save_secret(RUTRACKER_CREDENTIAL, &json).is_ok() {
        let _ = fs::remove_file(path);
        tracing::info!("migrated Rutracker credentials to the OS credential store");
    }
    cookies
}

const MAX_AUTH_RESPONSE_BYTES: usize = 2 * 1024 * 1024;

/// Decodes a response body: rutracker serves windows-1251, but anti-bot
/// challenge pages are usually UTF-8; try UTF-8 first, then fall back.
fn decode_page(bytes: &[u8]) -> String {
    match std::str::from_utf8(bytes) {
        Ok(text) => text.to_string(),
        Err(_) => decode_windows_1251(bytes),
    }
}

/// Recognizes anti-bot challenge / block pages so we can tell the user the
/// real reason instead of a misleading "wrong password" error.
fn detect_challenge(text: &str) -> Option<&'static str> {
    let lower = text.to_lowercase();
    // NOTE: `challenge-platform` is deliberately NOT a marker: Cloudflare's
    // JS-detection injects `/cdn-cgi/challenge-platform/scripts/jsd/main.js`
    // into every normal HTML page, so matching it would flag regular pages as
    // challenges. Only `cf-chl` / `just a moment` (etc.) identify a real
    // challenge interstitial.
    const MARKERS: &[(&str, &str)] = &[
        ("ddos-guard", "anti-bot challenge (DDoS-Guard)"),
        ("cf-chl", "anti-bot challenge (Cloudflare)"),
        ("just a moment", "anti-bot challenge"),
        ("проверка соединения", "anti-bot challenge"),
        ("доступ ограничен", "access blocked"),
        ("captcha", "captcha"),
    ];
    for (marker, label) in MARKERS {
        if lower.contains(marker) {
            return Some(label);
        }
    }
    None
}

/// True when the fetched page shows a logged-in rutracker session.
fn session_is_logged_in(text: &str) -> bool {
    if detect_challenge(text).is_some() {
        return false;
    }

    text.contains("profile.php?mode=viewprofile")
        || (text.contains("logout") || text.contains("Выход") || text.contains("выход"))
}

async fn read_body_limited(resp: reqwest::Response) -> Result<Vec<u8>, String> {
    use futures::StreamExt;
    let mut body = Vec::new();
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Read error: {e}"))?;
        if body.len().saturating_add(chunk.len()) > MAX_AUTH_RESPONSE_BYTES {
            break;
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

/// Parses one line of the Netscape `cookies.txt` export format:
/// `domain \t includeSubdomains \t path \t secure \t expiry \t name \t value`
/// (domain may carry the `#HttpOnly_` prefix). Returns None when the line is
/// not in that shape so callers can fall back to `key=value` parsing.
fn parse_netscape_cookie_line(line: &str) -> Option<HashMap<String, String>> {
    let mut fields = line.split('\t');
    let domain = fields.next()?;
    let domain = domain.strip_prefix("#HttpOnly_").unwrap_or(domain).trim();
    // A Netscape data line starts with a bare domain; comments start with '#',
    // and `key=value` pairs contain '=' or spaces.
    if domain.is_empty()
        || domain.starts_with('#')
        || domain.contains('=')
        || domain.contains(' ')
        || domain.contains(';')
    {
        return None;
    }
    let _include_subdomains = fields.next()?;
    let _path = fields.next()?;
    let _secure = fields.next()?;
    let _expiry = fields.next()?;
    let name = fields.next()?.trim();
    let value = fields.next()?.trim();
    if name.is_empty() || value.is_empty() {
        return None;
    }
    let mut map = HashMap::new();
    map.insert(name.to_string(), value.to_string());
    Some(map)
}

/// Parses a pasted cookie block. Accepts any of:
/// - a JSON object (`{"bb_session":"..."}`),
/// - a `key=value; key2=value2` string or raw Cookie request-header line,
/// - a Netscape `cookies.txt` export (tab-separated, e.g. from a
///   "cookies.txt" browser extension).
fn parse_cookie_input(input: &str) -> Result<HashMap<String, String>, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("cookies_parse".to_string());
    }

    if trimmed.starts_with('{') {
        let value: serde_json::Value =
            serde_json::from_str(trimmed).map_err(|_| "cookies_parse".to_string())?;
        let obj = value
            .as_object()
            .ok_or_else(|| "cookies_parse".to_string())?;
        let mut map = HashMap::new();
        for (key, value) in obj {
            if let Some(text) = value.as_str() {
                map.insert(key.clone(), text.to_string());
            }
        }
        return Ok(map);
    }

    let mut map = HashMap::new();
    for raw_line in trimmed.lines() {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some(netscape) = parse_netscape_cookie_line(line) {
            map.extend(netscape);
            continue;
        }
        for raw_part in line.split(';') {
            let part = raw_part.trim().trim_matches('"').trim();
            if part.is_empty() {
                continue;
            }
            if let Some(eq) = part.find('=') {
                let key = part[..eq].trim();
                let value = part[eq + 1..].trim();
                if !key.is_empty() && !value.is_empty() {
                    map.insert(key.to_string(), value.to_string());
                }
            }
        }
    }
    Ok(map)
}

fn nekobt_api_key_path(app_handle: &tauri::AppHandle) -> PathBuf {
    let dir = app_handle.path().app_data_dir().unwrap_or_else(|e| {
        eprintln!("Failed to get app data dir: {e}");
        PathBuf::from(".")
    });
    dir.join("nekobt_key.json")
}

fn save_nekobt_api_key(app_handle: &tauri::AppHandle, key: &str) -> Result<(), String> {
    let path = nekobt_api_key_path(app_handle);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create dir: {e}"))?;
    }
    save_secret(NEKOBT_CREDENTIAL, key).map_err(|error| error.to_string())?;
    let _ = fs::remove_file(path);
    Ok(())
}

pub fn load_nekobt_api_key(app_handle: &tauri::AppHandle) -> String {
    if let Ok(key) = load_secret(NEKOBT_CREDENTIAL) {
        return key;
    }

    let path = nekobt_api_key_path(app_handle);
    let key = fs::read_to_string(&path).unwrap_or_default();
    if !key.trim().is_empty() && save_secret(NEKOBT_CREDENTIAL, key.trim()).is_ok() {
        let _ = fs::remove_file(path);
        tracing::info!("migrated nekoBT credentials to the OS credential store");
    }
    key
}

#[tauri::command]
pub async fn rutracker_login(
    app_handle: tauri::AppHandle,
    username: String,
    password: String,
) -> Result<String, String> {
    let no_redirect = build_no_redirect_client()?;
    let client = build_rutracker_client()?;
    let mut cookies = HashMap::new();

    let init_resp = no_redirect
        .get("https://rutracker.org/forum/index.php")
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?;

    extract_cookies_from_headers(init_resp.headers(), &mut cookies);

    if init_resp.status() == reqwest::StatusCode::FOUND
        || init_resp.status() == reqwest::StatusCode::MOVED_PERMANENTLY
    {
        let redirected = no_redirect
            .get("https://rutracker.org/forum/index.php")
            .header("Cookie", cookies_to_header(&cookies))
            .send()
            .await
            .map_err(|e| format!("network: {e}"))?;
        extract_cookies_from_headers(redirected.headers(), &mut cookies);
    }

    // If even the front page is a challenge/block page, fail early with the reason.
    // (3xx redirects are handled above and are fine to continue from.)
    if init_resp.status().is_client_error() || init_resp.status().is_server_error() {
        let init_status = init_resp.status();
        let bytes = read_body_limited(init_resp).await?;
        let text = decode_page(&bytes);
        if let Some(label) = detect_challenge(&text) {
            return Err(format!("blocked: {label}"));
        }
        return Err(format!("login_failed: HTTP {init_status}"));
    }

    let login_resp = no_redirect
        .post("https://rutracker.org/forum/login.php")
        .header("Cookie", cookies_to_header(&cookies))
        .header("Referer", "https://rutracker.org/forum/index.php")
        .header("Origin", "https://rutracker.org")
        .form(&[
            ("login_username", username.as_str()),
            ("login_password", password.as_str()),
            ("login", "Вход"),
            ("redirect", "index.php"),
        ])
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?;

    let status = login_resp.status();
    extract_cookies_from_headers(login_resp.headers(), &mut cookies);

    if status != reqwest::StatusCode::FOUND && status != reqwest::StatusCode::MOVED_PERMANENTLY {
        let bytes = read_body_limited(login_resp).await?;
        let text = decode_page(&bytes);
        if let Some(label) = detect_challenge(&text) {
            return Err(format!("blocked: {label}"));
        }
        if text.contains("login_username")
            || text.contains("login-form-full")
            || text.contains("Неверное имя")
        {
            return Err("wrong_credentials".to_string());
        }
        return Err(format!("login_failed: HTTP {status}"));
    }

    let post_login = no_redirect
        .get("https://rutracker.org/forum/index.php")
        .header("Cookie", cookies_to_header(&cookies))
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?;
    extract_cookies_from_headers(post_login.headers(), &mut cookies);

    if post_login.status() == reqwest::StatusCode::FOUND
        || post_login.status() == reqwest::StatusCode::MOVED_PERMANENTLY
    {
        let final_resp = client
            .get("https://rutracker.org/forum/index.php")
            .header("Cookie", cookies_to_header(&cookies))
            .send()
            .await
            .map_err(|e| format!("network: {e}"))?;
        extract_cookies_from_headers(final_resp.headers(), &mut cookies);
    }

    // Validate that the session actually stuck before saving anything.
    let check_resp = client
        .get("https://rutracker.org/forum/index.php")
        .header("Cookie", cookies_to_header(&cookies))
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?;
    let check_status = check_resp.status();
    let bytes = read_body_limited(check_resp).await?;
    let text = decode_page(&bytes);
    if let Some(label) = detect_challenge(&text) {
        return Err(format!("blocked: {label}"));
    }
    if !check_status.is_success() || !session_is_logged_in(&text) {
        return Err("session_failed".to_string());
    }

    save_rutracker_cookies(&app_handle, &cookies)?;

    Ok("ok".to_string())
}

#[tauri::command]
pub async fn check_rutracker_session(app_handle: tauri::AppHandle) -> Result<bool, String> {
    let cookies = load_rutracker_cookies(&app_handle);
    if cookies.is_empty() {
        return Ok(false);
    }

    if let Some(response) =
        rutracker_browser_fetch(&app_handle, "https://rutracker.org/forum/index.php").await?
    {
        if !(200..300).contains(&response.status) {
            return Ok(false);
        }
        return Ok(session_is_logged_in(&decode_page(&response.body)));
    }

    let client = build_rutracker_client()?;
    let resp = client
        .get("https://rutracker.org/forum/index.php")
        .header("Cookie", cookies_to_header(&cookies))
        .send()
        .await
        .map_err(|e| {
            tracing::warn!("rutracker session check failed: {e}");
            format!("Connection failed: {e}")
        })?;

    let bytes = resp.bytes().await.map_err(|e| format!("Read error: {e}"))?;
    let text = decode_page(&bytes);

    Ok(session_is_logged_in(&text))
}

/// Lets the user import the session cookies from their browser, the reliable
/// workaround when rutracker's anti-bot or a browser-only VPN blocks the app's
/// own login requests.
#[tauri::command]
pub async fn rutracker_set_cookies(
    app_handle: tauri::AppHandle,
    cookies: String,
) -> Result<String, String> {
    let parsed = parse_cookie_input(&cookies)?;
    if parsed.is_empty() {
        return Err("cookies_parse".to_string());
    }

    let client = build_rutracker_client()?;
    let resp = client
        .get("https://rutracker.org/forum/index.php")
        .header("Cookie", cookies_to_header(&parsed))
        .send()
        .await
        .map_err(|e| {
            tracing::warn!("rutracker cookie validation failed: {e}");
            format!("network: {e}")
        })?;

    let status = resp.status();
    if !status.is_success() {
        let bytes = read_body_limited(resp).await?;
        let text = decode_page(&bytes);
        if let Some(label) = detect_challenge(&text) {
            return Err(format!("blocked: {label}"));
        }
        return Err(format!("cookies_invalid: HTTP {status}"));
    }

    let bytes = read_body_limited(resp).await?;
    let text = decode_page(&bytes);
    if let Some(label) = detect_challenge(&text) {
        return Err(format!("blocked: {label}"));
    }
    if !session_is_logged_in(&text) {
        return Err("cookies_invalid".to_string());
    }

    save_rutracker_cookies(&app_handle, &parsed)?;
    Ok("ok".to_string())
}

/// Opens an in-app browser (WebView2/Chromium) at rutracker so the Cloudflare
/// JS challenge can complete and the user can log in. A raw HTTP client like
/// reqwest cannot pass that challenge; a real browser engine can.
#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn rutracker_webview_login(app_handle: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;

    if let Some(window) = app_handle.get_webview_window(RUTRACKER_WEBVIEW_LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
        return Ok("ok".to_string());
    }

    let url: url::Url = "https://rutracker.org/forum/index.php"
        .parse()
        .map_err(|e| format!("url: {e}"))?;
    tauri::WebviewWindowBuilder::new(
        &app_handle,
        RUTRACKER_WEBVIEW_LABEL,
        tauri::WebviewUrl::External(url),
    )
    .title("RuTracker.org - sign in")
    .inner_size(480.0, 760.0)
    .min_inner_size(360.0, 560.0)
    .build()
    .map_err(|e| format!("webview_open: {e}"))?;
    Ok("ok".to_string())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub async fn rutracker_webview_login(_app_handle: tauri::AppHandle) -> Result<String, String> {
    Err("In-app browser login is only available on Windows".to_string())
}

/// Captures the rutracker session cookies (including HttpOnly ones such as
/// `cf_clearance`/`bb_session`) from the WebView2 login window and saves them.
#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub async fn rutracker_finish_webview_login(
    _app_handle: tauri::AppHandle,
) -> Result<String, String> {
    Err("In-app browser login is only available on Windows".to_string())
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn rutracker_finish_webview_login(
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    use tauri::Manager;

    let window = app_handle
        .get_webview_window(RUTRACKER_WEBVIEW_LABEL)
        .ok_or_else(|| "webview_not_found".to_string())?;
    let (cookies, user_agent) = harvest_webview_cookies(window.as_ref(), &["rutracker"])
        .await
        .map_err(|e| format!("webview_save: {e}"))?;
    if cookies.is_empty() {
        return Err("no_cookies".to_string());
    }
    if !cookies.contains_key("bb_session") {
        return Err("no_session".to_string());
    }
    save_rutracker_user_agent(&app_handle, &user_agent);
    save_rutracker_cookies(&app_handle, &cookies)?;
    // Keep the browser profile alive: Cloudflare clearance is bound to the
    // browser context, so search/details/download requests must run there too.
    let _ = window.hide();
    Ok("ok".to_string())
}

#[cfg(target_os = "windows")]
pub async fn rutracker_browser_fetch(
    app_handle: &tauri::AppHandle,
    url: &str,
) -> Result<Option<RutrackerBrowserResponse>, String> {
    let Some(window) = app_handle.get_webview_window(RUTRACKER_WEBVIEW_LABEL) else {
        return Ok(None);
    };

    let request_id = format!(
        "__iluha_rutracker_request_{}",
        RUTRACKER_BROWSER_REQUEST_ID.fetch_add(1, Ordering::Relaxed)
    );
    let request_key = serde_json::to_string(&request_id).map_err(|e| e.to_string())?;
    let request_url = serde_json::to_string(url).map_err(|e| e.to_string())?;
    let start_script = format!(
        r#"(() => {{
            const key = {request_key};
            const url = {request_url};
            window[key] = {{ pending: true }};
            fetch(url, {{ credentials: "include", cache: "no-store" }})
                .then(async (response) => {{
                    const bytes = new Uint8Array(await response.arrayBuffer());
                    let binary = "";
                    for (let offset = 0; offset < bytes.length; offset += 0x8000) {{
                        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
                    }}
                    window[key] = {{ status: response.status, body: btoa(binary) }};
                }})
                .catch((error) => {{
                    window[key] = {{ error: String(error) }};
                }});
            return true;
        }})()"#
    );
    eval_webview_script(&window, start_script).await?;

    for _ in 0..900 {
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        let poll_script = format!(
            r"(() => {{
                const value = window[{request_key}];
                if (!value || value.pending) return null;
                delete window[{request_key}];
                return value;
            }})()"
        );
        let result = eval_webview_script(&window, poll_script).await?;
        let Some(value) = result else {
            continue;
        };
        if let Some(error) = value.get("error").and_then(serde_json::Value::as_str) {
            return Err(format!("browser request failed: {error}"));
        }
        let status = value
            .get("status")
            .and_then(serde_json::Value::as_u64)
            .ok_or_else(|| "browser response did not contain a status".to_string())?;
        let body = value
            .get("body")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| "browser response did not contain a body".to_string())?;
        let body = base64::engine::general_purpose::STANDARD
            .decode(body)
            .map_err(|e| format!("browser response decode failed: {e}"))?;
        return Ok(Some(RutrackerBrowserResponse {
            status: status as u16,
            body,
        }));
    }

    Err("browser request timed out".to_string())
}

#[cfg(not(target_os = "windows"))]
pub async fn rutracker_browser_fetch(
    _app_handle: &tauri::AppHandle,
    _url: &str,
) -> Result<Option<RutrackerBrowserResponse>, String> {
    Ok(None)
}

#[cfg(target_os = "windows")]
async fn eval_webview_script(
    window: &tauri::WebviewWindow,
    script: String,
) -> Result<Option<serde_json::Value>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let tx = Mutex::new(Some(tx));
    window
        .eval_with_callback(script, move |result| {
            if let Ok(mut sender) = tx.lock() {
                if let Some(sender) = sender.take() {
                    let _ = sender.send(result);
                }
            }
        })
        .map_err(|e| format!("browser script: {e}"))?;
    let result = rx
        .await
        .map_err(|e| format!("browser script callback: {e}"))?;
    let value: serde_json::Value =
        serde_json::from_str(&result).map_err(|e| format!("browser script result: {e}"))?;
    if value.is_null() {
        Ok(None)
    } else {
        Ok(Some(value))
    }
}

#[cfg(target_os = "windows")]
async fn harvest_webview_cookies(
    webview: &tauri::Webview,
    domain_markers: &'static [&'static str],
) -> Result<(HashMap<String, String>, String), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_2;
    use windows_core::Interface;

    type HarvestResult = Result<Vec<(String, String)>, String>;
    let (setup_tx, setup_rx) = tokio::sync::oneshot::channel::<
        Result<(String, Vec<tokio::sync::oneshot::Receiver<HarvestResult>>), String>,
    >();

    webview
        .with_webview(move |platform| {
            let result = (|| -> Result<(String, Vec<tokio::sync::oneshot::Receiver<HarvestResult>>), String> {
                let controller = platform.controller();
                let core = unsafe { controller.CoreWebView2() }
                    .map_err(|e| format!("CoreWebView2: {e}"))?;
                let core: ICoreWebView2_2 = core.cast().map_err(|e| format!("cast: {e}"))?;
                let manager = unsafe { core.CookieManager() }
                    .map_err(|e| format!("CookieManager: {e}"))?;

                // The User-Agent the webview used to pass the anti-bot
                // challenge: clearance cookies are bound to it, so the HTTP
                // client must send the exact same string.
                let mut user_agent = String::new();
                if let Ok(settings) = unsafe { core.Settings() } {
                    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings2;
                    if let Ok(settings2) = settings.cast::<ICoreWebView2Settings2>() {
                        let mut ua = windows_core::PWSTR::null();
                        unsafe {
                            let _ = settings2.UserAgent(&raw mut ua);
                        }
                        user_agent = pwstr_to_string(ua);
                    }
                }

                // An empty URI makes WebView2 return every cookie in the
                // profile. Rutracker scopes its session cookies to /forum/ and
                // may set them on a mirror domain, so a single page-URI lookup
                // can silently miss bb_session even after a successful login.
                // Query the profile as a whole and fall back to the canonical
                // forum URL for good measure.
                let mut receivers = Vec::new();
                for uri in [
                    windows_core::w!(""),
                    windows_core::w!("https://rutracker.org/forum/"),
                ] {
                    let (tx, rx) = tokio::sync::oneshot::channel::<HarvestResult>();
                    let handler = webview2_com::GetCookiesCompletedHandler::create(Box::new(
                        move |result, list| {
                            let mut pairs = Vec::new();
                            if let Err(e) = result {
                                let _ = tx.send(Err(format!("GetCookies error: {e}")));
                                return Err(e);
                            }
                            if let Some(list) = list {
                                let mut count: u32 = 0;
                                unsafe {
                                    let _ = list.Count(&raw mut count);
                                }
                                for i in 0..count {
                                    if let Ok(cookie) = unsafe { list.GetValueAtIndex(i) } {
                                        let mut name = windows_core::PWSTR::null();
                                        let mut value = windows_core::PWSTR::null();
                                        let mut domain = windows_core::PWSTR::null();
                                        unsafe {
                                            let _ = cookie.Name(&raw mut name);
                                            let _ = cookie.Value(&raw mut value);
                                            let _ = cookie.Domain(&raw mut domain);
                                        }
                                        let name = pwstr_to_string(name);
                                        let value = pwstr_to_string(value);
                                        let domain = pwstr_to_string(domain).to_lowercase();
                                        let name_lower = name.to_lowercase();
                                        // Keep rutracker session cookies plus
                                        // anti-bot clearance cookies (DDoS-Guard
                                        // / Cloudflare), which rutracker's
                                        // protected paths such as tracker.php
                                        // require in addition to bb_session.
                                        let domain_matches =
                                            domain_markers.iter().any(|marker| domain.contains(marker));
                                        if !name.is_empty()
                                            && (domain_matches
                                                || name.starts_with("bb_")
                                                || name_lower.contains("ddos")
                                                || name_lower.contains("ddg")
                                                || name_lower.contains("cf_clearance")
                                                || name_lower.contains("guard"))
                                        {
                                            pairs.push((name, value));
                                        }
                                    }
                                }
                            }
                            let _ = tx.send(Ok(pairs));
                            Ok(())
                        },
                    ));
                    unsafe { manager.GetCookies(uri, &handler) }
                        .map_err(|e| format!("GetCookies call: {e}"))?;
                    receivers.push(rx);
                }
                Ok((user_agent, receivers))
            })();
            let _ = setup_tx.send(result);
        })
        .map_err(|e| format!("with_webview: {e}"))?;

    let (user_agent, receivers) = setup_rx.await.map_err(|e| format!("cookie setup: {e}"))??;
    let mut merged: Vec<(String, String)> = Vec::new();
    for rx in receivers {
        let pairs = rx.await.map_err(|e| format!("cookie handler: {e}"))??;
        for (name, value) in pairs {
            if !merged.iter().any(|(existing, _)| existing == &name) {
                merged.push((name, value));
            }
        }
    }
    let mut cookies = HashMap::new();
    for (name, value) in merged {
        cookies.insert(name, value);
    }
    Ok((cookies, user_agent))
}

#[cfg(target_os = "windows")]
fn pwstr_to_string(ptr: windows_core::PWSTR) -> String {
    if ptr.is_null() {
        return String::new();
    }
    unsafe {
        let mut len = 0usize;
        while *ptr.0.add(len) != 0 {
            len += 1;
        }
        String::from_utf16_lossy(std::slice::from_raw_parts(ptr.0, len))
    }
}

#[tauri::command]
pub async fn rutracker_logout(app_handle: tauri::AppHandle) -> Result<(), String> {
    delete_secret(RUTRACKER_CREDENTIAL);
    delete_secret(RUTRACKER_USER_AGENT);
    let path = rutracker_cookie_path(&app_handle);
    let _ = fs::remove_file(&path);
    Ok(())
}

pub fn load_erai_cookies() -> HashMap<String, String> {
    load_secret(ERAI_CREDENTIAL)
        .ok()
        .and_then(|json| serde_json::from_str(&json).ok())
        .unwrap_or_default()
}

fn save_erai_cookies(cookies: &HashMap<String, String>) -> Result<(), String> {
    let json = serde_json::to_string(cookies).map_err(|error| error.to_string())?;
    save_secret(ERAI_CREDENTIAL, &json).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn check_erai_session() -> Result<bool, String> {
    let cookies = load_erai_cookies();
    if cookies.is_empty() {
        return Ok(false);
    }
    let client = crate::scrapers::build_client()?;
    let response = client
        .get("https://www.erai-raws.info/")
        .header("Cookie", cookies_to_header(&cookies))
        .send()
        .await
        .map_err(|error| format!("network: {error}"))?;
    if !response.status().is_success() {
        return Ok(false);
    }
    let body = read_body_limited(response).await?;
    let text = decode_page(&body).to_lowercase();
    Ok(!text.contains("log in to see the content") && !text.contains("wp-login.php"))
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn erai_webview_login(app_handle: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;

    if let Some(window) = app_handle.get_webview_window(ERAI_WEBVIEW_LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
        return Ok("ok".to_string());
    }
    let url: url::Url = "https://www.erai-raws.info/"
        .parse()
        .map_err(|error| format!("url: {error}"))?;
    tauri::WebviewWindowBuilder::new(
        &app_handle,
        ERAI_WEBVIEW_LABEL,
        tauri::WebviewUrl::External(url),
    )
    .title("Erai-Raws - sign in")
    .inner_size(480.0, 760.0)
    .min_inner_size(360.0, 560.0)
    .build()
    .map_err(|error| format!("webview_open: {error}"))?;
    Ok("ok".to_string())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub async fn erai_webview_login(_app_handle: tauri::AppHandle) -> Result<String, String> {
    Err("In-app browser login is only available on Windows".to_string())
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn erai_finish_webview_login(app_handle: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;

    let window = app_handle
        .get_webview_window(ERAI_WEBVIEW_LABEL)
        .ok_or_else(|| "webview_not_found".to_string())?;
    let (cookies, _) = harvest_webview_cookies(window.as_ref(), &["erai-raws"])
        .await
        .map_err(|error| format!("webview_save: {error}"))?;
    if !cookies.keys().any(|name| {
        let lower = name.to_lowercase();
        lower.starts_with("wordpress_logged_in_") || lower.starts_with("wordpress_sec_")
    }) {
        return Err("no_session".to_string());
    }
    save_erai_cookies(&cookies)?;
    let _ = window.hide();
    Ok("ok".to_string())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub async fn erai_finish_webview_login(_app_handle: tauri::AppHandle) -> Result<String, String> {
    Err("In-app browser login is only available on Windows".to_string())
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn erai_open_page(
    app_handle: tauri::AppHandle,
    page_url: String,
) -> Result<String, String> {
    use tauri::Manager;

    let parsed = url::Url::parse(&page_url).map_err(|error| format!("url: {error}"))?;
    let host = parsed.host_str().unwrap_or_default().to_ascii_lowercase();
    if parsed.scheme() != "https" || (host != "erai-raws.info" && host != "www.erai-raws.info") {
        return Err("The Erai-Raws URL is outside the allowed source".to_string());
    }
    let window = app_handle
        .get_webview_window(ERAI_WEBVIEW_LABEL)
        .ok_or_else(|| "webview_not_found".to_string())?;
    let escaped = serde_json::to_string(&page_url).map_err(|error| error.to_string())?;
    window
        .eval(format!("window.location.href = {escaped};"))
        .map_err(|error| format!("webview_open: {error}"))?;
    let _ = window.show();
    let _ = window.set_focus();
    Ok("ok".to_string())
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub async fn erai_open_page(
    _app_handle: tauri::AppHandle,
    _page_url: String,
) -> Result<String, String> {
    Err("In-app browser login is only available on Windows".to_string())
}

#[tauri::command]
pub async fn erai_logout() -> Result<(), String> {
    delete_secret(ERAI_CREDENTIAL);
    Ok(())
}

/// Downloads the raw .torrent file for a rutracker topic. The app feeds these
/// bytes straight into the torrent session, so metadata is embedded and no
/// DHT/peer round-trip is needed to resolve a magnet (useful when a VPN blocks
/// P2P but allows the site itself).
#[tauri::command]
pub async fn rutracker_get_torrent_bytes(
    app_handle: tauri::AppHandle,
    topic_id: String,
) -> Result<Vec<u8>, String> {
    let cookies = load_rutracker_cookies(&app_handle);
    if cookies.is_empty() {
        return Err("Not authenticated".to_string());
    }

    let download_url = format!("https://rutracker.org/forum/dl.php?t={topic_id}");
    let browser_response = rutracker_browser_fetch(&app_handle, &download_url).await?;
    let (status, bytes) = if let Some(response) = browser_response {
        (response.status, response.body)
    } else {
        let user_agent = load_rutracker_user_agent(&app_handle)
            .unwrap_or_else(|| crate::scrapers::RUTRACKER_DEFAULT_UA.to_string());
        let client = build_rutracker_client_with_ua(&user_agent)?;
        let resp = client
            .get(&download_url)
            .header("Cookie", cookies_to_header(&cookies))
            .header("Referer", "https://rutracker.org/forum/viewtopic.php")
            .send()
            .await
            .map_err(|e| {
                tracing::warn!("rutracker torrent download failed: {e}");
                format!("Download failed: {e}")
            })?;
        let status = resp.status().as_u16();
        let bytes = resp
            .bytes()
            .await
            .map_err(|e| format!("Read error: {e}"))?
            .to_vec();
        (status, bytes)
    };

    if !(200..300).contains(&status) {
        return Err(format!("Download returned HTTP {status}"));
    }

    let text = decode_page(&bytes);
    if let Some(label) = detect_challenge(&text) {
        return Err(format!("blocked: {label}"));
    }

    if extract_info_hash(&bytes).is_err() {
        return Err("Downloaded content is not a valid .torrent file".to_string());
    }

    Ok(bytes)
}

#[tauri::command]
pub async fn rutracker_get_magnet(
    app_handle: tauri::AppHandle,
    topic_id: String,
) -> Result<String, String> {
    let bytes = rutracker_get_torrent_bytes(app_handle, topic_id).await?;
    let info_hash = extract_info_hash(&bytes)?;
    let name = extract_torrent_name(&bytes).unwrap_or_default();

    let mut magnet = format!("magnet:?xt=urn:btih:{info_hash}");
    if !name.is_empty() {
        magnet.push_str("&dn=");
        magnet.push_str(&url_encode(&name));
    }

    if let Ok(announce) = extract_announce_url(&bytes) {
        if !announce.is_empty() {
            magnet.push_str("&tr=");
            magnet.push_str(&url_encode(&announce));
        }
    }

    Ok(magnet)
}

#[tauri::command]
pub async fn nekobt_set_api_key(
    app_handle: tauri::AppHandle,
    api_key: String,
) -> Result<String, String> {
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

    let body: serde_json::Value = resp
        .bytes()
        .await
        .map_err(|e| format!("Read error: {e}"))
        .and_then(|b| serde_json::from_slice(&b).map_err(|e| format!("Parse error: {e}")))?;

    if body
        .get("error")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(true)
    {
        let msg = body
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("Invalid API key");
        return Err(msg.to_string());
    }

    save_nekobt_api_key(&app_handle, &key)?;
    Ok("ok".to_string())
}

#[tauri::command]
pub async fn check_nekobt_session(app_handle: tauri::AppHandle) -> Result<bool, String> {
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

    resp.map_or(Ok(false), |r| Ok(r.status().is_success()))
}

#[tauri::command]
pub async fn nekobt_logout(app_handle: tauri::AppHandle) -> Result<(), String> {
    delete_secret(NEKOBT_CREDENTIAL);
    let path = nekobt_api_key_path(&app_handle);
    let _ = fs::remove_file(&path);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_cookie_header_format() {
        let parsed = parse_cookie_input("bb_session=abc; uid=123; bb_data=xyz").unwrap();
        assert_eq!(parsed.get("bb_session").map(String::as_str), Some("abc"));
        assert_eq!(parsed.get("uid").map(String::as_str), Some("123"));
        assert_eq!(parsed.get("bb_data").map(String::as_str), Some("xyz"));
    }

    #[test]
    fn parses_cookie_header_with_equals_in_value() {
        let parsed = parse_cookie_input("a=1=2; b=3").unwrap();
        assert_eq!(parsed.get("a").map(String::as_str), Some("1=2"));
        assert_eq!(parsed.get("b").map(String::as_str), Some("3"));
    }

    #[test]
    fn parses_cookie_json_object() {
        let parsed = parse_cookie_input(r#"{"bb_session":"abc","uid":"42"}"#).unwrap();
        assert_eq!(parsed.get("bb_session").map(String::as_str), Some("abc"));
        assert_eq!(parsed.get("uid").map(String::as_str), Some("42"));
    }

    #[test]
    fn rejects_empty_or_garbage_cookies() {
        assert!(parse_cookie_input("").is_err());
        assert!(parse_cookie_input("   ").is_err());
        assert!(parse_cookie_input("no-equals-here").unwrap().is_empty());
        assert!(parse_cookie_input("{not json").is_err());
    }

    #[test]
    fn parses_netscape_cookie_file_export() {
        let input = r#"# Netscape HTTP Cookie File
# http://curl.haxx.se/rfc/cookie_spec.html

.rutracker.org	TRUE	/forum/	FALSE	1815770953	bb_guid	sRfbwEdiN0sG
.rutracker.org	TRUE	/forum/	TRUE	1821182794	bb_session	0-42176024-xRj24mi9mIQoRzt95v2N
"#;
        let parsed = parse_cookie_input(input).unwrap();
        assert_eq!(
            parsed.get("bb_session").map(String::as_str),
            Some("0-42176024-xRj24mi9mIQoRzt95v2N")
        );
        assert_eq!(
            parsed.get("bb_guid").map(String::as_str),
            Some("sRfbwEdiN0sG")
        );
    }

    #[test]
    fn parses_netscape_file_with_httponly_prefix_and_mixed_formats() {
        let input = "#HttpOnly_.rutracker.org\tTRUE\t/\tTRUE\t0\tbb_session\tabc=def\nbb_guid=xyz";
        let parsed = parse_cookie_input(input).unwrap();
        assert_eq!(
            parsed.get("bb_session").map(String::as_str),
            Some("abc=def")
        );
        assert_eq!(parsed.get("bb_guid").map(String::as_str), Some("xyz"));
    }

    #[test]
    fn detects_anti_bot_challenge_markers() {
        assert_eq!(
            detect_challenge("cf-chl-platform"),
            Some("anti-bot challenge (Cloudflare)")
        );
        assert_eq!(
            detect_challenge("Just a moment..."),
            Some("anti-bot challenge")
        );
        assert_eq!(
            detect_challenge("DDoS-Guard protection"),
            Some("anti-bot challenge (DDoS-Guard)")
        );
        assert_eq!(detect_challenge("Обычная страница форума"), None);
    }

    #[test]
    fn session_detection_requires_authenticated_markers_and_rejects_challenges() {
        assert!(session_is_logged_in("profile.php?mode=viewprofile"));
        assert!(session_is_logged_in("Добро пожаловать на форум · Выход"));
        assert!(!session_is_logged_in("login-form-full"));
        assert!(!session_is_logged_in("Just a moment... DDoS-Guard"));
    }

    #[test]
    fn decode_page_prefers_utf8_over_windows1251() {
        let utf8 = "Привет".as_bytes();
        assert_eq!(decode_page(utf8), "Привет");
        let cp1251 = [0xCF, 0xF0, 0xE8, 0xE2, 0xE5, 0xF2];
        assert_eq!(decode_page(&cp1251), "Привет");
    }

    /// Live smoke test: the rutracker client (HTTP/1.1 + IPv4-first) must be
    /// able to complete a request to the forum front page; the previous
    /// connection-level failure ("network" error) is gone. rutracker is behind
    /// a Cloudflare JS challenge, so the response may be a challenge page
    /// rather than the real forum; that's expected and reported, not failed.
    /// Run with: `cargo test -- --ignored`.
    #[tokio::test]
    #[ignore]
    async fn rutracker_client_can_reach_forum() {
        let client = build_rutracker_client().unwrap();
        let resp = client
            .get("https://rutracker.org/forum/index.php")
            .send()
            .await
            .expect("network request should not fail");
        assert!(
            resp.status().is_success(),
            "expected a successful status, got {}",
            resp.status()
        );
        let bytes = read_body_limited(resp).await.unwrap();
        let text = decode_page(&bytes);
        println!(
            "rutracker responded with {} bytes; challenge: {:?}",
            bytes.len(),
            detect_challenge(&text)
        );
    }
}
