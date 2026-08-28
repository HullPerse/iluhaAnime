use base64::{engine::general_purpose::STANDARD, Engine as _};
use rusqlite::{params, Connection};
use serde::Serialize;
use sha1::{Digest, Sha1};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Manager;
const MAX_IMAGE_BYTES: u64 = 4 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserImage {
    pub id: String,
    pub name: String,
    pub mime_type: String,
    pub data_url: String,
    pub created_at: i64,
}

pub fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?;
    Ok(dir.join("user_assets.sqlite3"))
}

fn open_database(app: &tauri::AppHandle) -> Result<Connection, String> {
    let path = database_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create assets dir: {e}"))?;
    }
    let conn = Connection::open(path).map_err(|e| format!("open assets db: {e}"))?;
    conn.busy_timeout(Duration::from_secs(5))
        .map_err(|e| format!("assets db timeout: {e}"))?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("assets db journal: {e}"))?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS user_images (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            data BLOB NOT NULL,
            created_at INTEGER NOT NULL
        );",
    )
    .map_err(|e| format!("assets db schema: {e}"))?;
    Ok(conn)
}

pub fn image_mime(bytes: &[u8], extension: Option<&str>) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some("image/png");
    }
    if bytes.starts_with(b"\xff\xd8\xff") {
        return Some("image/jpeg");
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("image/gif");
    }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    match extension.map(str::to_ascii_lowercase).as_deref() {
        Some("png") => Some("image/png"),
        Some("jpg" | "jpeg") => Some("image/jpeg"),
        Some("gif") => Some("image/gif"),
        Some("webp") => Some("image/webp"),
        _ => None,
    }
}

fn now_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn image_from_row(
    id: String,
    name: String,
    mime_type: String,
    data: Vec<u8>,
    created_at: i64,
) -> UserImage {
    UserImage {
        id,
        name,
        data_url: format!("data:{mime_type};base64,{}", STANDARD.encode(data)),
        mime_type,
        created_at,
    }
}

#[tauri::command]
pub fn import_user_image(app: tauri::AppHandle, path: String) -> Result<UserImage, String> {
    let source = Path::new(&path);
    let metadata = fs::metadata(source).map_err(|e| format!("image metadata: {e}"))?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_IMAGE_BYTES {
        return Err("Image must be a non-empty file smaller than 4 MiB".to_string());
    }
    let data = fs::read(source).map_err(|e| format!("read image: {e}"))?;
    let extension = source.extension().and_then(|value| value.to_str());
    let mime_type = image_mime(&data, extension)
        .ok_or_else(|| "Unsupported image. Use PNG, JPEG, GIF, or WebP.".to_string())?;
    let id = hex::encode(Sha1::digest(&data))[..20].to_string();
    let name = source
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("uploaded-image")
        .chars()
        .take(120)
        .collect::<String>();
    let created_at = now_seconds();
    let conn = open_database(&app)?;
    conn.execute(
        "INSERT OR IGNORE INTO user_images (id, name, mime_type, data, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, name, mime_type, data, created_at],
    )
    .map_err(|e| format!("save image: {e}"))?;
    get_user_image(app, id)
}

#[tauri::command]
pub async fn download_remote_image(
    app: tauri::AppHandle,
    url: String,
    name_hint: Option<String>,
) -> Result<UserImage, String> {
    let url = url.trim();
    if url.is_empty() || url.len() > 4_096 {
        return Err("Remote image URL is empty or too long".to_string());
    }
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("Remote image URL must use http(s)".to_string());
    }
    let client = reqwest::Client::builder()
        .user_agent("iluhaAnime/3.0")
        .build()
        .map_err(|e| format!("image http client: {e}"))?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("image download: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "image download failed: status {}",
            response.status()
        ));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("image body: {e}"))?;
    let data = bytes.to_vec();
    if data.is_empty() || data.len() as u64 > MAX_IMAGE_BYTES {
        return Err("Downloaded image is empty or exceeds 4 MiB".to_string());
    }
    let mime_type = image_mime(&data, None).ok_or_else(|| {
        "Downloaded data is not a supported image (PNG/JPEG/GIF/WebP)".to_string()
    })?;
    let id = hex::encode(Sha1::digest(&data))[..20].to_string();
    let name = name_hint
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|s| s.chars().take(120).collect::<String>())
        .unwrap_or_else(|| "remote-cover".to_string());
    let created_at = now_seconds();
    let conn = open_database(&app)?;
    conn.execute(
        "INSERT OR IGNORE INTO user_images (id, name, mime_type, data, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, name, mime_type, data, created_at],
    )
    .map_err(|e| format!("save remote image: {e}"))?;
    get_user_image(app, id)
}

#[tauri::command]
pub fn list_user_images(app: tauri::AppHandle) -> Result<Vec<UserImage>, String> {
    let conn = open_database(&app)?;
    let mut statement = conn
        .prepare("SELECT id, name, mime_type, data, created_at FROM user_images ORDER BY created_at DESC")
        .map_err(|e| format!("list images: {e}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok(image_from_row(
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        })
        .map_err(|e| format!("list image rows: {e}"))?;
    Ok(rows.filter_map(Result::ok).collect())
}

#[tauri::command]
pub fn get_user_image(app: tauri::AppHandle, id: String) -> Result<UserImage, String> {
    let conn = open_database(&app)?;
    conn.query_row(
        "SELECT id, name, mime_type, data, created_at FROM user_images WHERE id = ?1",
        params![id],
        |row| {
            Ok(image_from_row(
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        },
    )
    .map_err(|e| format!("image not found: {e}"))
}

#[tauri::command]
pub fn delete_user_image(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let conn = open_database(&app)?;
    conn.execute("DELETE FROM user_images WHERE id = ?1", params![id])
        .map_err(|e| format!("delete image: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_supported_image_signatures() {
        assert_eq!(
            image_mime(b"\x89PNG\r\n\x1a\nrest", None),
            Some("image/png")
        );
        assert_eq!(image_mime(b"\xff\xd8\xffrest", None), Some("image/jpeg"));
        assert_eq!(image_mime(b"GIF89arest", None), Some("image/gif"));
        assert_eq!(image_mime(b"RIFF0000WEBPrest", None), Some("image/webp"));
    }

    #[test]
    fn detects_known_extensions_for_small_legacy_files() {
        assert_eq!(image_mime(b"legacy", Some("PNG")), Some("image/png"));
        assert_eq!(image_mime(b"legacy", Some("jpeg")), Some("image/jpeg"));
        assert_eq!(image_mime(b"legacy", Some("webp")), Some("image/webp"));
        assert_eq!(image_mime(b"legacy", Some("txt")), None);
    }

    #[test]
    fn creates_data_urls_without_losing_mime_type() {
        let image = image_from_row(
            "abc".to_string(),
            "icon.png".to_string(),
            "image/png".to_string(),
            vec![1, 2, 3],
            10,
        );
        assert_eq!(image.data_url, "data:image/png;base64,AQID");
        assert_eq!(image.mime_type, "image/png");
    }
}
