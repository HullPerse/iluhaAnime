use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

use crate::bencode::{extract_announce_url, extract_info_hash, extract_torrent_name};
use crate::scrapers::{
    build_client, build_nekobt_client, build_no_redirect_client, cookies_to_header,
    decode_windows_1251, extract_cookies_from_headers, url_encode,
};

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
    let json = serde_json::to_string(cookies).map_err(|e| format!("Serialize error: {e}"))?;
    fs::write(&path, &json).map_err(|e| format!("Write error: {e}"))
}

pub fn load_rutracker_cookies(app_handle: &tauri::AppHandle) -> HashMap<String, String> {
    let path = rutracker_cookie_path(app_handle);
    if !path.exists() {
        return HashMap::new();
    }
    let Ok(json) = fs::read_to_string(&path) else { return HashMap::new() };
    serde_json::from_str(&json).unwrap_or_default()
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
    fs::write(&path, key).map_err(|e| format!("Write error: {e}"))
}

pub fn load_nekobt_api_key(app_handle: &tauri::AppHandle) -> String {
    let path = nekobt_api_key_path(app_handle);
    if !path.exists() {
        return String::new();
    }
    fs::read_to_string(&path).unwrap_or_default()
}

#[tauri::command]
pub async fn rutracker_login(
    app_handle: tauri::AppHandle,
    username: String,
    password: String,
) -> Result<String, String> {
    let no_redirect = build_no_redirect_client()?;
    let client = build_client()?;
    let mut cookies = HashMap::new();

    let init_resp = no_redirect
        .get("https://rutracker.org/forum/index.php")
        .send()
        .await
        .map_err(|e| format!("Connection failed: {e}"))?;

    extract_cookies_from_headers(init_resp.headers(), &mut cookies);

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

    let post_login = no_redirect
        .get("https://rutracker.org/forum/index.php")
        .header("Cookie", cookies_to_header(&cookies))
        .send()
        .await
        .map_err(|e| format!("Post-login request failed: {e}"))?;
    extract_cookies_from_headers(post_login.headers(), &mut cookies);

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
pub async fn check_rutracker_session(app_handle: tauri::AppHandle) -> Result<bool, String> {
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

    Ok(text.contains("profile.php?mode=viewprofile") || !text.contains("login-form-full"))
}

#[tauri::command]
pub async fn rutracker_logout(app_handle: tauri::AppHandle) -> Result<(), String> {
    let path = rutracker_cookie_path(&app_handle);
    let _ = fs::remove_file(&path);
    Ok(())
}

#[tauri::command]
pub async fn rutracker_get_magnet(
    app_handle: tauri::AppHandle,
    topic_id: String,
) -> Result<String, String> {
    let cookies = load_rutracker_cookies(&app_handle);
    if cookies.is_empty() {
        return Err("Not authenticated".to_string());
    }

    let client = build_client()?;
    let resp = client
        .get(format!("https://rutracker.org/forum/dl.php?t={topic_id}"))
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

    if body.get("error").and_then(serde_json::Value::as_bool).unwrap_or(true) {
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
    let path = nekobt_api_key_path(&app_handle);
    let _ = fs::remove_file(&path);
    Ok(())
}
