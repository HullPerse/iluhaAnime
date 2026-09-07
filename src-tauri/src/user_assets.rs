use base64::{engine::general_purpose::STANDARD, Engine as _};
use rusqlite::{params, params_from_iter, Connection};
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
    pub original_src: Option<String>,
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
        );
        CREATE TABLE IF NOT EXISTS dither_images (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            data BLOB NOT NULL,
            original_data BLOB,
            created_at INTEGER NOT NULL
        );",
    )
    .map_err(|e| format!("assets db schema: {e}"))?;
    let has_original: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('dither_images') WHERE name = 'original_data'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("assets db schema check: {e}"))?;
    if has_original == 0 {
        conn.execute(
            "ALTER TABLE dither_images ADD COLUMN original_data BLOB",
            [],
        )
        .map_err(|e| format!("assets db migrate dither: {e}"))?;
    }
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
    original: Option<Vec<u8>>,
    created_at: i64,
) -> UserImage {
    UserImage {
        id,
        name,
        data_url: format!("data:{mime_type};base64,{}", STANDARD.encode(&data)),
        original_src: original
            .map(|bytes| format!("data:{mime_type};base64,{}", STANDARD.encode(bytes))),
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

fn resolve_proxy(proxy: Option<String>, proxy_camel: Option<String>) -> Option<String> {
    proxy
        .or(proxy_camel)
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn client_for_image_proxy(proxy: Option<&str>) -> Result<reqwest::Client, String> {
    if let Some(url) = proxy {
        let proxy = reqwest::Proxy::all(url).map_err(|e| format!("Invalid proxy URL: {e}"))?;
        reqwest::Client::builder()
            .user_agent("iluhaAnime/3.0")
            .proxy(proxy)
            .timeout(Duration::from_secs(15))
            .build()
            .map_err(|e| format!("image http client (proxy): {e}"))
    } else {
        reqwest::Client::builder()
            .user_agent("iluhaAnime/3.0")
            .timeout(Duration::from_secs(15))
            .build()
            .map_err(|e| format!("image http client: {e}"))
    }
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn download_remote_image(
    app: tauri::AppHandle,
    url: String,
    name_hint: Option<String>,
    nameHint: Option<String>,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<UserImage, String> {
    let url = url.trim();
    if url.is_empty() || url.len() > 4_096 {
        return Err("Remote image URL is empty or too long".to_string());
    }
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("Remote image URL must use http(s)".to_string());
    }
    let name_hint = name_hint.or(nameHint);
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let client = client_for_image_proxy(proxy.as_deref())?;
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
    let name = name_hint.as_deref().filter(|s| !s.is_empty()).map_or_else(
        || "remote-cover".to_string(),
        |s| s.chars().take(120).collect::<String>(),
    );
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
                None,
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
                None,
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
#[tauri::command]
pub fn import_dither_image(app: tauri::AppHandle, path: String) -> Result<UserImage, String> {
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
        .unwrap_or("dither-image")
        .chars()
        .take(120)
        .collect::<String>();
    let created_at = now_seconds();
    let original = data.clone();
    let conn = open_database(&app)?;
    conn.execute(
        "INSERT OR IGNORE INTO dither_images (id, name, mime_type, data, original_data, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, name, mime_type, data, original, created_at],
    )
    .map_err(|e| format!("save dither image: {e}"))?;
    dither_image_from_connection(&conn, &id)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DitherImageMeta {
    pub id: String,
    pub name: String,
    pub mime_type: String,
    pub has_original: bool,
    pub created_at: i64,
}

fn query_dither_image_meta(conn: &Connection) -> Result<Vec<DitherImageMeta>, String> {
    let mut statement = conn
        .prepare("SELECT id, name, mime_type, original_data IS NOT NULL, created_at FROM dither_images ORDER BY created_at DESC")
        .map_err(|e| format!("list dither image meta: {e}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok(DitherImageMeta {
                id: row.get(0)?,
                name: row.get(1)?,
                mime_type: row.get(2)?,
                has_original: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| format!("list dither image meta rows: {e}"))?;
    Ok(rows.filter_map(Result::ok).collect())
}

fn query_dither_images(conn: &Connection, ids: &[String]) -> Result<Vec<UserImage>, String> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let query = format!("SELECT id, name, mime_type, data, original_data, created_at FROM dither_images WHERE id IN ({placeholders})");
    let mut statement = conn
        .prepare(&query)
        .map_err(|e| format!("get dither images: {e}"))?;
    let rows = statement
        .query_map(params_from_iter(ids), |row| {
            Ok(image_from_row(
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
            ))
        })
        .map_err(|e| format!("get dither image rows: {e}"))?;
    Ok(rows.filter_map(Result::ok).collect())
}

#[tauri::command]
pub fn list_dither_image_meta(app: tauri::AppHandle) -> Result<Vec<DitherImageMeta>, String> {
    let conn = open_database(&app)?;
    query_dither_image_meta(&conn)
}

#[tauri::command]
pub fn get_dither_images(app: tauri::AppHandle, ids: Vec<String>) -> Result<Vec<UserImage>, String> {
    let conn = open_database(&app)?;
    query_dither_images(&conn, &ids)
}

#[tauri::command]
pub fn delete_dither_image(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let conn = open_database(&app)?;
    let changed = conn
        .execute("DELETE FROM dither_images WHERE id = ?1", params![id])
        .map_err(|e| format!("delete dither image: {e}"))?;
    if changed == 0 {
        return Err("dither image not found".to_string());
    }
    Ok(())
}

fn parse_data_url_image(data_url: &str) -> Result<(String, Vec<u8>), String> {
    let (meta, payload) = data_url
        .split_once(',')
        .ok_or_else(|| "image must be a data URL".to_string())?;
    if !meta.starts_with("data:image/") || !meta.contains(";base64") {
        return Err("image must be a base64 data URL".to_string());
    }
    let bytes = STANDARD
        .decode(payload)
        .map_err(|e| format!("decode image: {e}"))?;
    if bytes.is_empty() || bytes.len() as u64 > MAX_IMAGE_BYTES {
        return Err("Image must be a non-empty file smaller than 4 MiB".to_string());
    }
    let mime_type = image_mime(&bytes, None)
        .ok_or_else(|| "Unsupported image. Use PNG, JPEG, GIF, or WebP.".to_string())?;
    Ok((mime_type.to_string(), bytes))
}

fn dither_image_from_connection(conn: &Connection, id: &str) -> Result<UserImage, String> {
    conn.query_row(
        "SELECT id, name, mime_type, data, original_data, created_at FROM dither_images WHERE id = ?1",
        params![id],
        |row| {
            Ok(image_from_row(
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
            ))
        },
    )
    .map_err(|e| format!("dither image not found: {e}"))
}

#[tauri::command]
pub fn get_dither_image(app: tauri::AppHandle, id: String) -> Result<UserImage, String> {
    let conn = open_database(&app)?;
    dither_image_from_connection(&conn, &id)
}

#[allow(non_snake_case)]
#[tauri::command]
pub fn update_dither_image_data(
    app: tauri::AppHandle,
    id: String,
    data_url: String,
    dataUrl: Option<String>,
) -> Result<UserImage, String> {
    let payload = dataUrl.as_deref().unwrap_or(&data_url);
    if payload.trim().is_empty() {
        return Err("image must be a base64 data URL".to_string());
    }
    let (mime_type, data) = parse_data_url_image(payload)?;
    let conn = open_database(&app)?;
    let changed = conn
        .execute(
            "UPDATE dither_images SET data = ?1, mime_type = ?2 WHERE id = ?3",
            params![data, mime_type, id],
        )
        .map_err(|e| format!("update dither image: {e}"))?;
    if changed == 0 {
        return Err("dither image not found".to_string());
    }
    dither_image_from_connection(&conn, &id)
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

    fn memory_dither_db() -> Connection {
        let conn = Connection::open_in_memory().expect("memory db");
        conn.execute_batch(
            "CREATE TABLE dither_images (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                data BLOB NOT NULL,
                original_data BLOB,
                created_at INTEGER NOT NULL
            );
            INSERT INTO dither_images VALUES ('aaa', 'first.png', 'image/png', X'AABB', X'CCDD', 10);
            INSERT INTO dither_images VALUES ('bbb', 'second.jpg', 'image/jpeg', X'EEFF', NULL, 5);",
        )
        .expect("seed dither images");
        conn
    }

    #[test]
    fn meta_lists_without_bytes_and_flags_originals() {
        let conn = memory_dither_db();
        let metas = query_dither_image_meta(&conn).expect("meta list");
        assert_eq!(metas.len(), 2);
        assert_eq!(metas[0].id, "aaa");
        assert!(metas[0].has_original);
        assert_eq!(metas[1].id, "bbb");
        assert!(!metas[1].has_original);
    }

    #[test]
    fn batch_get_returns_only_known_ids_with_bytes() {
        let conn = memory_dither_db();
        let images = query_dither_images(&conn, &["bbb".to_string(), "stale".to_string()])
            .expect("batch get");
        assert_eq!(images.len(), 1);
        assert_eq!(images[0].id, "bbb");
        assert_eq!(images[0].data_url, "data:image/jpeg;base64,7v8=");
        assert_eq!(images[0].original_src, None);
    }

    #[test]
    fn batch_get_with_no_ids_returns_empty() {
        let conn = memory_dither_db();
        let images = query_dither_images(&conn, &[]).expect("empty batch get");
        assert!(images.is_empty());
    }

    #[test]
    fn creates_data_urls_without_losing_mime_type() {
        let image = image_from_row(
            "abc".to_string(),
            "icon.png".to_string(),
            "image/png".to_string(),
            vec![1, 2, 3],
            None,
            10,
        );
        assert_eq!(image.data_url, "data:image/png;base64,AQID");
        assert_eq!(image.mime_type, "image/png");
        assert_eq!(image.original_src, None);
    }

    #[test]
    fn maps_stored_original_bytes_to_original_src() {
        let image = image_from_row(
            "abc".to_string(),
            "icon.png".to_string(),
            "image/png".to_string(),
            vec![9, 9, 9],
            Some(vec![1, 2, 3]),
            10,
        );
        assert_eq!(
            image.original_src,
            Some("data:image/png;base64,AQID".to_string())
        );
    }

    #[test]
    fn accepts_png_data_urls() {
        let url = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
        let (mime, bytes) = parse_data_url_image(url).expect("valid png data URL");
        assert_eq!(mime, "image/png");
        assert!(bytes.starts_with(b"\x89PNG\r\n\x1a\n"));
    }

    #[test]
    fn rejects_non_image_data_urls() {
        assert!(parse_data_url_image("data:text/plain;base64,abcd").is_err());
        assert!(parse_data_url_image("data:image/png,abcd").is_err());
        assert!(parse_data_url_image("not-a-data-url").is_err());
        assert!(parse_data_url_image("data:image/png;base64,!!!").is_err());
        assert!(parse_data_url_image("data:image/png;base64,").is_err());
        assert!(parse_data_url_image("data:image/png;base64,aGVsbG8=").is_err());
    }
}
