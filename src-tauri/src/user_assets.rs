use base64::{engine::general_purpose::STANDARD, Engine as _};
use rusqlite::{params, Connection};
use serde::Serialize;
use sha1::{Digest, Sha1};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Manager;

const MAX_IMAGE_BYTES: u64 = 4 * 1024 * 1024;

const USER_IMAGES_TABLE: &str = "user_images";
const DITHER_IMAGES_TABLE: &str = "dither_images";
const REMOTE_IMAGES_TABLE: &str = "remote_images";
const REMOTE_IMAGE_CACHE_CAP: i64 = 500;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserImage {
    pub id: String,
    pub name: String,
    pub mime_type: String,
    pub path: String,
    pub original_path: Option<String>,
    pub dither_options: Option<String>,
    pub created_at: i64,
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

pub fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(assets_root(app)?.join("user_assets.sqlite3"))
}

fn assets_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))
}

fn images_dir(app: &tauri::AppHandle, table: &str) -> Result<PathBuf, String> {
    Ok(assets_root(app)?.join("images").join(table))
}

fn open_database_at(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create assets dir: {e}"))?;
    }
    let conn = Connection::open(path).map_err(|e| format!("open assets db: {e}"))?;
    conn.busy_timeout(Duration::from_secs(5))
        .map_err(|e| format!("assets db timeout: {e}"))?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| format!("assets db journal: {e}"))?;
    drop_legacy_blob_schema(&conn)?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS user_images (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS dither_images (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            mime_type NOT NULL,
            original_ext TEXT,
            dither_options TEXT,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS remote_images (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            url TEXT NOT NULL UNIQUE
        );",
    )
    .map_err(|e| format!("assets db schema: {e}"))?;
    Ok(conn)
}

fn open_database(app: &tauri::AppHandle) -> Result<Connection, String> {
    open_database_at(&database_path(app)?)
}

fn drop_legacy_blob_schema(conn: &Connection) -> Result<(), String> {
    let has_blob_column: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('user_images') WHERE name = 'data'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("assets db schema check: {e}"))?;
    if has_blob_column > 0 {
        conn.execute_batch(
            "DROP TABLE IF EXISTS dither_images; DROP TABLE IF EXISTS user_images; VACUUM;",
        )
        .map_err(|e| format!("assets db legacy wipe: {e}"))?;
        return Ok(());
    }

    let has_table: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'dither_images'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("assets db schema check: {e}"))?;
    if has_table == 0 {
        return Ok(());
    }
    let has_options_column: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('dither_images') WHERE name = 'dither_options'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("assets db schema check: {e}"))?;
    if has_options_column == 0 {
        conn.execute_batch("ALTER TABLE dither_images ADD COLUMN dither_options TEXT")
            .map_err(|e| format!("assets db options migration: {e}"))?;
    }
    Ok(())
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

fn mime_ext(mime_type: &str) -> &'static str {
    match mime_type {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        _ => "img",
    }
}

fn now_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn content_id(bytes: &[u8]) -> String {
    hex::encode(Sha1::digest(bytes))[..20].to_string()
}
const THUMB_W: u32 = 336;
const THUMB_PREFIX: &str = "t336_";

fn thumb_id(id: &str) -> String {
    if id.starts_with(THUMB_PREFIX) {
        id.to_string()
    } else {
        format!("{THUMB_PREFIX}{id}")
    }
}

fn make_thumb336(bytes: &[u8]) -> Option<Vec<u8>> {
    let mime_type = image_mime(bytes, None)?;
    if mime_type != "image/png" && mime_type != "image/jpeg" {
        return None;
    }
    let image = image::load_from_memory(bytes).ok()?;
    let resized = if image.width() > THUMB_W {
        let height = (u64::from(image.height()) * u64::from(THUMB_W) / u64::from(image.width()))
            .max(1) as u32;
        image.resize(THUMB_W, height, image::imageops::FilterType::Triangle)
    } else {
        image
    };
    let rgb = image::DynamicImage::ImageRgb8(resized.to_rgb8());
    let mut out = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 80)
        .encode_image(&rgb)
        .ok()?;
    if out.is_empty() {
        return None;
    }
    Some(out)
}

fn ensure_thumb(conn: &Connection, dir: &Path, id: &str, name: &str, orig_bytes: &[u8]) {
    if id.starts_with(THUMB_PREFIX) {
        return;
    }
    let Some(thumb) = make_thumb336(orig_bytes) else {
        return;
    };
    let tid = thumb_id(id);
    let _ = write_image_file(dir, &format!("{tid}.jpg"), &thumb);
    let _ = conn.execute(
        "INSERT OR IGNORE INTO user_images (id, name, mime_type, created_at) VALUES (?1, ?2, 'image/jpeg', ?3)",
        params![tid, name, now_seconds()],
    );
}
fn remote_thumb_file(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{}.jpg", thumb_id(id)))
}

fn write_remote_thumb(dir: &Path, id: &str, orig_bytes: &[u8]) -> Option<PathBuf> {
    let thumb = make_thumb336(orig_bytes)?;
    write_image_file(dir, &format!("{}.jpg", thumb_id(id)), &thumb).ok()
}

fn write_image_file(dir: &Path, file_name: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    fs::create_dir_all(dir).map_err(|e| format!("create image dir: {e}"))?;
    let path = dir.join(file_name);
    let temp = dir.join(format!(".{file_name}.tmp"));
    fs::write(&temp, bytes).map_err(|e| format!("write image file: {e}"))?;
    fs::rename(&temp, &path).map_err(|e| format!("commit image file: {e}"))?;
    Ok(path)
}

fn remove_image_files(dir: &Path, base_names: &[String]) {
    for name in base_names {
        let _ = fs::remove_file(dir.join(name));
    }
}

fn image_file_names(id: &str, suffix: &str, exts: &[&str]) -> Vec<String> {
    exts.iter()
        .map(|ext| {
            if suffix.is_empty() {
                format!("{id}.{ext}")
            } else {
                format!("{id}.{suffix}.{ext}")
            }
        })
        .collect()
}

fn data_file_names(id: &str) -> Vec<String> {
    image_file_names(id, "", &["png", "jpg", "gif", "webp", "img"])
}

fn dither_original_file_names(id: &str) -> Vec<String> {
    image_file_names(id, "original", &["png", "jpg", "gif", "webp", "img"])
}

fn import_image_bytes(
    dir: &Path,
    conn: &Connection,
    table: &str,
    bytes: &[u8],
    name: String,
) -> Result<(), String> {
    let id = content_id(bytes);
    let mime_type = image_mime(bytes, None)
        .ok_or_else(|| "Unsupported image. Use PNG, JPEG, GIF, or WebP.".to_string())?;
    write_image_file(dir, &format!("{id}.{}", mime_ext(mime_type)), bytes)?;
    conn.execute(
        &format!(
            "INSERT OR IGNORE INTO {table} (id, name, mime_type, created_at) VALUES (?1, ?2, ?3, ?4)"
        ),
        params![id, name, mime_type, now_seconds()],
    )
    .map_err(|e| format!("save image: {e}"))?;
    Ok(())
}

fn user_image_from_row(
    id: String,
    name: String,
    mime_type: String,
    dir: &Path,
) -> Result<UserImage, String> {
    let path = dir.join(format!("{id}.{}", mime_ext(&mime_type)));
    if !path.is_file() {
        return Err(format!("image file missing: {id}"));
    }
    Ok(UserImage {
        id,
        name,
        path: path.to_string_lossy().into_owned(),
        original_path: None,
        mime_type,
        created_at: 0,
        dither_options: None,
    })
}

fn dither_image_from_row(
    id: String,
    name: String,
    mime_type: String,
    original_ext: Option<String>,
    dither_options: Option<String>,
    dir: &Path,
) -> Result<UserImage, String> {
    let path = dir.join(format!("{id}.{}", mime_ext(&mime_type)));
    if !path.is_file() {
        return Err(format!("image file missing: {id}"));
    }
    let original_path = original_ext.and_then(|ext| {
        let candidate = dir.join(format!("{id}.original.{ext}"));
        candidate
            .is_file()
            .then(|| candidate.to_string_lossy().into_owned())
    });
    #[allow(clippy::missing_const_for_fn)]
    Ok(UserImage {
        id,
        name,
        path: path.to_string_lossy().into_owned(),
        original_path,
        dither_options,
        mime_type,
        created_at: 0,
    })
}

const fn fill_created_at(mut image: UserImage, created_at: i64) -> UserImage {
    image.created_at = created_at;
    image
}

#[tauri::command]
pub fn import_user_image(app: tauri::AppHandle, path: String) -> Result<UserImage, String> {
    let source = Path::new(&path);
    let metadata = fs::metadata(source).map_err(|e| format!("image metadata: {e}"))?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_IMAGE_BYTES {
        return Err("Image must be a non-empty file smaller than 4 MiB".to_string());
    }
    let data = fs::read(source).map_err(|e| format!("read image: {e}"))?;
    image_mime(&data, source.extension().and_then(|v| v.to_str()))
        .ok_or_else(|| "Unsupported image. Use PNG, JPEG, GIF, or WebP.".to_string())?;
    let name = source
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("uploaded-image")
        .chars()
        .take(120)
        .collect::<String>();
    let dir = images_dir(&app, USER_IMAGES_TABLE)?;
    let conn = open_database(&app)?;
    import_image_bytes(&dir, &conn, USER_IMAGES_TABLE, &data, name.clone())?;
    ensure_thumb(&conn, &dir, &content_id(&data), &name, &data);
    get_user_image(app, content_id(&data))
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
    if image_mime(&data, None).is_none() {
        return Err("Downloaded data is not a supported image (PNG/JPEG/GIF/WebP)".to_string());
    }
    let name = name_hint.as_deref().filter(|s| !s.is_empty()).map_or_else(
        || "remote-cover".to_string(),
        |s| s.chars().take(120).collect::<String>(),
    );
    let dir = images_dir(&app, USER_IMAGES_TABLE)?;
    let conn = open_database(&app)?;
    import_image_bytes(&dir, &conn, USER_IMAGES_TABLE, &data, name.clone())?;
    ensure_thumb(&conn, &dir, &content_id(&data), &name, &data);
    get_user_image(app, content_id(&data))
}

fn lookup_remote_image(dir: &Path, conn: &Connection, url: &str) -> Option<UserImage> {
    let (id, name, mime_type): (String, String, String) = conn
        .query_row(
            "SELECT id, name, mime_type FROM remote_images WHERE url = ?1",
            params![url],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .ok()?;
    let image = user_image_from_row(id.clone(), name, mime_type, dir).ok()?;
    let thumb = remote_thumb_file(dir, &id);
    if thumb.is_file() {
        return Some(UserImage {
            path: thumb.to_string_lossy().into_owned(),
            mime_type: "image/jpeg".to_string(),
            ..image
        });
    }
    Some(image)
}

fn evict_remote_image_cache(dir: &Path, conn: &Connection, cap: i64) -> Result<(), String> {
    let stale: Vec<(String, String)> = conn
        .prepare(
            "SELECT id, mime_type FROM remote_images ORDER BY created_at DESC, rowid DESC LIMIT -1 OFFSET ?1",
        )
        .map_err(|e| format!("remote image cache query: {e}"))?
        .query_map([cap], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| format!("remote image cache scan: {e}"))?
        .collect::<Result<Vec<(String, String)>, _>>()
        .map_err(|e| format!("remote image cache scan: {e}"))?;
    for (id, mime_type) in &stale {
        conn.execute("DELETE FROM remote_images WHERE id = ?1", params![id])
            .map_err(|e| format!("remote image cache prune: {e}"))?;
        remove_image_files(dir, &[format!("{id}.{}", mime_ext(mime_type))]);
        remove_image_files(dir, &[format!("{}.jpg", thumb_id(id))]);
    }
    Ok(())
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn fetch_remote_image(
    app: tauri::AppHandle,
    url: String,
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
    let dir = images_dir(&app, REMOTE_IMAGES_TABLE)?;
    let conn = open_database(&app)?;
    if let Some(image) = lookup_remote_image(&dir, &conn, url) {
        return Ok(image);
    }
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let client = client_for_image_proxy(proxy.as_deref())?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("cached image download: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "cached image download failed: status {}",
            response.status()
        ));
    }
    let data = response
        .bytes()
        .await
        .map_err(|e| format!("cached image body: {e}"))?
        .to_vec();
    if data.is_empty() || data.len() as u64 > MAX_IMAGE_BYTES {
        return Err("Downloaded image is empty or exceeds 4 MiB".to_string());
    }
    let mime_type = image_mime(&data, None).ok_or_else(|| {
        "Downloaded data is not a supported image (PNG/JPEG/GIF/WebP)".to_string()
    })?;
    let id = content_id(&data);
    write_image_file(&dir, &format!("{id}.{}", mime_ext(mime_type)), &data)?;
    conn.execute(
        "INSERT OR REPLACE INTO remote_images (id, name, mime_type, created_at, url) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, "remote-image", mime_type, now_seconds(), url],
    )
    .map_err(|e| format!("save cached image: {e}"))?;
    evict_remote_image_cache(&dir, &conn, REMOTE_IMAGE_CACHE_CAP)?;
    if let Some(thumb_path) = write_remote_thumb(&dir, &id, &data) {
        return Ok(UserImage {
            id: id.clone(),
            name: "remote-image".to_string(),
            path: thumb_path.to_string_lossy().into_owned(),
            original_path: None,
            mime_type: "image/jpeg".to_string(),
            created_at: 0,
            dither_options: None,
        });
    }
    user_image_from_row(id, "remote-image".into(), mime_type.to_string(), &dir)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteImageStats {
    pub count: i64,
    pub bytes: u64,
}

fn remote_image_stats(dir: &Path, conn: &Connection) -> Result<RemoteImageStats, String> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM remote_images", [], |row| row.get(0))
        .map_err(|e| format!("remote images count: {e}"))?;
    let mut bytes = 0u64;
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    bytes += meta.len();
                }
            }
        }
    }
    Ok(RemoteImageStats { count, bytes })
}

fn clear_remote_images(dir: &Path, conn: &Connection) -> Result<usize, String> {
    let rows: Vec<(String, String)> = conn
        .prepare("SELECT id, mime_type FROM remote_images")
        .map_err(|e| format!("remote images scan: {e}"))?
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| format!("remote images scan: {e}"))?
        .collect::<Result<Vec<(String, String)>, _>>()
        .map_err(|e| format!("remote images scan: {e}"))?;
    let mut names: Vec<String> = Vec::new();
    for (id, mime) in &rows {
        names.push(format!("{id}.{}", mime_ext(mime)));
        names.push(format!("{}.jpg", thumb_id(id)));
    }
    remove_image_files(dir, &names);
    conn.execute("DELETE FROM remote_images", [])
        .map_err(|e| format!("remote images clear: {e}"))?;
    Ok(rows.len())
}

#[tauri::command]
pub fn get_remote_images_stats(app: tauri::AppHandle) -> Result<RemoteImageStats, String> {
    let dir = images_dir(&app, REMOTE_IMAGES_TABLE)?;
    let conn = open_database(&app)?;
    remote_image_stats(&dir, &conn)
}

#[tauri::command]
pub fn clear_remote_image_cache(app: tauri::AppHandle) -> Result<usize, String> {
    let dir = images_dir(&app, REMOTE_IMAGES_TABLE)?;
    let conn = open_database(&app)?;
    clear_remote_images(&dir, &conn)
}

#[tauri::command]
pub fn list_user_images(app: tauri::AppHandle) -> Result<Vec<UserImage>, String> {
    let dir = images_dir(&app, USER_IMAGES_TABLE)?;
    let conn = open_database(&app)?;
    let mut statement = conn
        .prepare("SELECT id, name, mime_type, created_at FROM user_images ORDER BY created_at DESC")
        .map_err(|e| format!("list images: {e}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
            ))
        })
        .map_err(|e| format!("list image rows: {e}"))?;
    Ok(rows
        .filter_map(Result::ok)
        .filter_map(|(id, name, mime_type, created_at)| {
            user_image_from_row(id, name, mime_type, &dir)
                .ok()
                .map(|image| fill_created_at(image, created_at))
        })
        .collect())
}

fn load_user_image(conn: &Connection, dir: &Path, id: &str) -> Result<UserImage, String> {
    let (row_id, name, mime_type, created_at): (String, String, String, i64) = conn
        .query_row(
            "SELECT id, name, mime_type, created_at FROM user_images WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|_| format!("image not found: {id}"))?;
    let original = user_image_from_row(row_id.clone(), name.clone(), mime_type, dir)
        .map(|image| fill_created_at(image, created_at))?;
    if row_id.starts_with(THUMB_PREFIX) {
        return Ok(original);
    }
    let thumb_path = dir.join(format!("{}.jpg", thumb_id(&row_id)));
    if !thumb_path.is_file() {
        if let Ok(bytes) = fs::read(&original.path) {
            ensure_thumb(conn, dir, &row_id, &name, &bytes);
        }
    }
    if thumb_path.is_file() {
        Ok(UserImage {
            path: thumb_path.to_string_lossy().into_owned(),
            mime_type: "image/jpeg".to_string(),
            ..original
        })
    } else {
        Ok(original)
    }
}

#[tauri::command]
pub fn get_user_image(app: tauri::AppHandle, id: String) -> Result<UserImage, String> {
    let dir = images_dir(&app, USER_IMAGES_TABLE)?;
    let conn = open_database(&app)?;
    load_user_image(&conn, &dir, &id)
}

fn remove_user_image(conn: &Connection, dir: &Path, id: &str) -> Result<(), String> {
    let changed = conn
        .execute("DELETE FROM user_images WHERE id = ?1", params![id])
        .map_err(|e| format!("delete image: {e}"))?;
    let tid = thumb_id(id);
    let thumb_changed = if tid == id {
        0
    } else {
        conn.execute("DELETE FROM user_images WHERE id = ?1", params![tid])
            .map_err(|e| format!("delete image: {e}"))?
    };
    if changed + thumb_changed > 0 {
        let mut names = data_file_names(id);
        if tid != id {
            names.extend(data_file_names(&tid));
        }
        remove_image_files(dir, &names);
    }
    Ok(())
}

#[tauri::command]
pub fn delete_user_image(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let dir = images_dir(&app, USER_IMAGES_TABLE)?;
    let conn = open_database(&app)?;
    remove_user_image(&conn, &dir, &id)
}

fn dither_data_file(id: &str, mime_type: &str) -> String {
    format!("{id}.{}", mime_ext(mime_type))
}

fn dither_original_file(id: &str, original_ext: &str) -> String {
    format!("{id}.original.{original_ext}")
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
        .ok_or_else(|| "Unsupported image. Use PNG, JPEG, or WebP.".to_string())?;
    if mime_type == "image/gif" {
        return Err(
            "GIF images are not supported as wallpaper. Use PNG, JPEG, or WebP.".to_string(),
        );
    }
    let id = content_id(&data);
    let name = source
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("dither-image")
        .chars()
        .take(120)
        .collect::<String>();
    let dir = images_dir(&app, DITHER_IMAGES_TABLE)?;
    let conn = open_database(&app)?;
    import_image_bytes(&dir, &conn, DITHER_IMAGES_TABLE, &data, name)?;
    let original = data.clone();
    write_image_file(
        &dir,
        &dither_original_file(&id, mime_ext(mime_type)),
        &original,
    )?;
    conn.execute(
        "UPDATE dither_images SET original_ext = ?2 WHERE id = ?1",
        params![id, mime_ext(mime_type)],
    )
    .map_err(|e| format!("save dither original: {e}"))?;
    get_dither_image(app, id)
}

fn query_dither_image_meta(conn: &Connection, dir: &Path) -> Result<Vec<DitherImageMeta>, String> {
    let mut statement = conn
        .prepare("SELECT id, name, mime_type, original_ext, created_at FROM dither_images ORDER BY created_at DESC")
        .map_err(|e| format!("list dither image meta: {e}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, i64>(4)?,
            ))
        })
        .map_err(|e| format!("list dither image meta rows: {e}"))?;
    Ok(rows
        .filter_map(Result::ok)
        .map(
            |(id, name, mime_type, original_ext, created_at)| DitherImageMeta {
                has_original: original_ext
                    .is_some_and(|ext| dir.join(dither_original_file(&id, &ext)).is_file()),
                id,
                name,
                mime_type,
                created_at,
            },
        )
        .collect())
}

fn query_dither_images(
    dir: &Path,
    conn: &Connection,
    ids: &[String],
) -> Result<Vec<UserImage>, String> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let query = format!(
        "SELECT id, name, mime_type, original_ext, dither_options, created_at FROM dither_images WHERE id IN ({placeholders})"
    );
    let mut statement = conn
        .prepare(&query)
        .map_err(|e| format!("get dither images: {e}"))?;
    let rows = statement
        .query_map(rusqlite::params_from_iter(ids), |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, i64>(5)?,
            ))
        })
        .map_err(|e| format!("get dither image rows: {e}"))?;
    Ok(rows
        .filter_map(Result::ok)
        .filter_map(
            |(id, name, mime_type, original_ext, dither_options, created_at)| {
                dither_image_from_row(id, name, mime_type, original_ext, dither_options, dir)
                    .ok()
                    .map(|image| fill_created_at(image, created_at))
            },
        )
        .collect())
}

#[tauri::command]
pub fn list_dither_image_meta(app: tauri::AppHandle) -> Result<Vec<DitherImageMeta>, String> {
    let dir = images_dir(&app, DITHER_IMAGES_TABLE)?;
    let conn = open_database(&app)?;
    query_dither_image_meta(&conn, &dir)
}

#[tauri::command]
pub fn get_dither_images(
    app: tauri::AppHandle,
    ids: Vec<String>,
) -> Result<Vec<UserImage>, String> {
    let dir = images_dir(&app, DITHER_IMAGES_TABLE)?;
    let conn = open_database(&app)?;
    query_dither_images(&dir, &conn, &ids)
}

#[tauri::command]
pub fn delete_dither_image(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let dir = images_dir(&app, DITHER_IMAGES_TABLE)?;
    let conn = open_database(&app)?;
    let changed = conn
        .execute("DELETE FROM dither_images WHERE id = ?1", params![id])
        .map_err(|e| format!("delete dither image: {e}"))?;
    if changed == 0 {
        return Err("dither image not found".to_string());
    }
    let mut names = data_file_names(&id);
    names.extend(dither_original_file_names(&id));
    remove_image_files(&dir, &names);
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

#[tauri::command]
pub fn get_dither_image(app: tauri::AppHandle, id: String) -> Result<UserImage, String> {
    let dir = images_dir(&app, DITHER_IMAGES_TABLE)?;
    let conn = open_database(&app)?;
    conn.query_row(
        "SELECT id, name, mime_type, original_ext, dither_options, created_at FROM dither_images WHERE id = ?1",
        params![id],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, i64>(5)?,
            ))
        },
    )
    .map_err(|_| format!("dither image not found: {id}"))
    .and_then(
        |(id, name, mime_type, original_ext, dither_options, created_at)| {
            dither_image_from_row(id, name, mime_type, original_ext, dither_options, &dir)
                .map(|image| fill_created_at(image, created_at))
        },
    )
}

#[tauri::command]
pub fn set_dither_image_options(
    app: tauri::AppHandle,
    id: String,
    options_json: String,
) -> Result<UserImage, String> {
    if serde_json::from_str::<serde_json::Value>(&options_json).is_err() {
        return Err("dither options must be valid JSON".to_string());
    }
    if options_json.len() > 8192 {
        return Err("dither options payload too large".to_string());
    }
    let conn = open_database(&app)?;
    let changed = conn
        .execute(
            "UPDATE dither_images SET dither_options = ?2 WHERE id = ?1",
            params![id, options_json],
        )
        .map_err(|e| format!("save dither options: {e}"))?;
    if changed == 0 {
        return Err("dither image not found".to_string());
    }
    get_dither_image(app, id)
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
    let dir = images_dir(&app, DITHER_IMAGES_TABLE)?;
    let conn = open_database(&app)?;
    let changed = conn
        .execute(
            "UPDATE dither_images SET mime_type = ?2 WHERE id = ?1",
            params![id, mime_type],
        )
        .map_err(|e| format!("update dither image: {e}"))?;
    if changed == 0 {
        return Err("dither image not found".to_string());
    }
    remove_image_files(&dir, &data_file_names(&id));
    write_image_file(&dir, &dither_data_file(&id, &mime_type), &data)?;
    get_dither_image(app, id)
}

pub fn read_user_image_bytes(app: &tauri::AppHandle, id: &str) -> Result<Option<Vec<u8>>, String> {
    let dir = images_dir(app, USER_IMAGES_TABLE)?;
    let conn = open_database(app)?;
    let mime_type: Option<String> = conn
        .query_row(
            "SELECT mime_type FROM user_images WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map(Some)
        .or_else(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            error => Err(format!("read image row: {error}")),
        })?;
    let Some(mime_type) = mime_type else {
        return Ok(None);
    };
    let path = dir.join(format!("{id}.{}", mime_ext(&mime_type)));
    if !path.is_file() {
        return Ok(None);
    }
    fs::read(&path)
        .map(Some)
        .map_err(|e| format!("read image file: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(tag: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("iluha_user_assets_{}_{}", tag, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("temp root");
        dir
    }

    fn png_bytes() -> Vec<u8> {
        let mut bytes = b"\x89PNG\r\n\x1a\n".to_vec();
        bytes.extend_from_slice(b"pixel-data-one");
        bytes
    }

    fn jpeg_bytes() -> Vec<u8> {
        let mut bytes = b"\xff\xd8\xff".to_vec();
        bytes.extend_from_slice(b"pixel-data-two");
        bytes
    }

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
    fn mime_ext_maps_the_four_supported_types() {
        assert_eq!(mime_ext("image/png"), "png");
        assert_eq!(mime_ext("image/jpeg"), "jpg");
        assert_eq!(mime_ext("image/gif"), "gif");
        assert_eq!(mime_ext("image/webp"), "webp");
        assert_eq!(mime_ext("image/other"), "img");
    }

    #[test]
    fn import_writes_file_and_row_and_get_returns_path() {
        let root = temp_root("import_roundtrip");
        let db = open_database_at(&root.join("user_assets.sqlite3")).expect("db");
        let dir = root.join("images").join(USER_IMAGES_TABLE);
        let bytes = png_bytes();
        import_image_bytes(&dir, &db, USER_IMAGES_TABLE, &bytes, "cover.png".into())
            .expect("import");
        let id = content_id(&bytes);
        let image = user_image_from_row(id.clone(), "cover.png".into(), "image/png".into(), &dir)
            .expect("image");
        assert!(image.path.ends_with(&format!("{id}.png")));
        assert_eq!(image.mime_type, "image/png");
        assert_eq!(image.original_path, None);
        drop(db);
        std::fs::remove_dir_all(&root).expect("cleanup");
    }

    #[test]
    fn reimporting_same_bytes_keeps_single_row_and_file() {
        let root = temp_root("dedup");
        let db = open_database_at(&root.join("user_assets.sqlite3")).expect("db");
        let dir = root.join("images").join(USER_IMAGES_TABLE);
        let bytes = png_bytes();
        import_image_bytes(&dir, &db, USER_IMAGES_TABLE, &bytes, "a.png".into()).expect("first");
        import_image_bytes(&dir, &db, USER_IMAGES_TABLE, &bytes, "b.png".into()).expect("second");
        let count: i64 = db
            .query_row("SELECT COUNT(*) FROM user_images", [], |row| row.get(0))
            .expect("count");
        assert_eq!(count, 1);
        let entries = std::fs::read_dir(&dir).expect("dir").count();
        assert_eq!(entries, 1);
        drop(db);
        std::fs::remove_dir_all(&root).expect("cleanup");
    }

    #[test]
    fn missing_file_reports_image_file_missing() {
        let root = temp_root("missing");
        let db = open_database_at(&root.join("user_assets.sqlite3")).expect("db");
        let dir = root.join("images").join(USER_IMAGES_TABLE);
        let bytes = png_bytes();
        import_image_bytes(&dir, &db, USER_IMAGES_TABLE, &bytes, "a.png".into()).expect("import");
        std::fs::remove_file(dir.join(format!("{}.png", content_id(&bytes)))).expect("remove");
        let result =
            user_image_from_row(content_id(&bytes), "a.png".into(), "image/png".into(), &dir);
        assert_eq!(
            result.unwrap_err(),
            format!("image file missing: {}", content_id(&bytes))
        );
        drop(db);
        std::fs::remove_dir_all(&root).expect("cleanup");
    }

    #[test]
    fn update_replaces_data_file_and_keeps_original() {
        let root = temp_root("update_dither");
        let db = open_database_at(&root.join("user_assets.sqlite3")).expect("db");
        let dir = root.join("images").join(DITHER_IMAGES_TABLE);
        let bytes = png_bytes();
        let id = content_id(&bytes);
        import_image_bytes(&dir, &db, DITHER_IMAGES_TABLE, &bytes, "art.png".into())
            .expect("import");
        db.execute(
            "UPDATE dither_images SET original_ext = 'png' WHERE id = ?1",
            params![id],
        )
        .expect("original flag");
        let original = dither_original_file(&id, "png");
        write_image_file(&dir, &original, &bytes).expect("original file");

        let rebaked = jpeg_bytes();
        let (mime, data) = ("image/jpeg".to_string(), rebaked.clone());
        remove_image_files(&dir, &data_file_names(&id));
        write_image_file(&dir, &dither_data_file(&id, &mime), &data).expect("new data");
        db.execute(
            "UPDATE dither_images SET mime_type = ?2 WHERE id = ?1",
            params![id, mime],
        )
        .expect("mime update");

        assert!(!dir.join(format!("{id}.png")).exists());
        assert!(dir.join(format!("{id}.jpg")).exists());
        assert!(dir.join(&original).exists());
        drop(db);
        std::fs::remove_dir_all(&root).expect("cleanup");
    }

    #[test]
    fn delete_removes_every_file_variant() {
        let root = temp_root("delete_files");
        let db = open_database_at(&root.join("user_assets.sqlite3")).expect("db");
        let dir = root.join("images").join(DITHER_IMAGES_TABLE);
        let bytes = png_bytes();
        let id = content_id(&bytes);
        import_image_bytes(&dir, &db, DITHER_IMAGES_TABLE, &bytes, "art.png".into())
            .expect("import");
        db.execute(
            "UPDATE dither_images SET original_ext = 'png' WHERE id = ?1",
            params![id],
        )
        .expect("original flag");
        write_image_file(&dir, &dither_original_file(&id, "png"), &bytes).expect("original file");
        assert!(dir.join(format!("{id}.png")).exists());
        assert!(dir.join(dither_original_file(&id, "png")).exists());

        db.execute("DELETE FROM dither_images WHERE id = ?1", params![id])
            .expect("row delete");
        remove_image_files(&dir, &data_file_names(&id));
        remove_image_files(
            &dir,
            &image_file_names(&id, "original", &["png", "jpg", "gif", "webp", "img"]),
        );
        assert!(std::fs::read_dir(&dir).expect("dir").count() == 0);
        drop(db);
        std::fs::remove_dir_all(&root).expect("cleanup");
    }

    #[test]
    fn legacy_blob_schema_is_wiped_and_recreated() {
        let root = temp_root("legacy_wipe");
        let db_path = root.join("user_assets.sqlite3");
        {
            let conn = Connection::open(&db_path).expect("legacy db");
            conn.execute_batch(
                "CREATE TABLE user_images (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, mime_type TEXT NOT NULL,
                    data BLOB NOT NULL, created_at INTEGER NOT NULL
                );
                INSERT INTO user_images VALUES ('old', 'old.png', 'image/png', X'0102', 1);",
            )
            .expect("legacy schema");
        }
        let conn = open_database_at(&db_path).expect("reopened");
        let columns: Vec<String> = {
            let mut statement = conn
                .prepare("SELECT name FROM pragma_table_info('user_images')")
                .expect("pragma");
            let rows = statement
                .query_map([], |row| row.get::<_, String>(0))
                .expect("map");
            rows.filter_map(Result::ok).collect()
        };
        assert!(!columns.iter().any(|column| column == "data"));
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM user_images", [], |row| row.get(0))
            .expect("count");
        assert_eq!(count, 0);
        let file_size = std::fs::metadata(&db_path).expect("meta").len();
        assert!(
            file_size < 64 * 1024,
            "vacuum should reclaim blob pages, got {file_size}"
        );
        drop(conn);
        std::fs::remove_dir_all(&root).expect("cleanup");
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

    fn insert_remote_row(db: &Connection, dir: &Path, n: u8, created_at: i64) -> String {
        let mut bytes = png_bytes();
        bytes.extend_from_slice(&[n]);
        let id = content_id(&bytes);
        write_image_file(dir, &format!("{id}.png"), &bytes).expect("write");
        db.execute(
            "INSERT INTO remote_images (id, name, mime_type, created_at, url) VALUES (?1, 'n', 'image/png', ?2, ?3)",
            params![id, created_at, format!("https://img/{n}.jpg")],
        )
        .expect("insert");
        id
    }

    #[test]
    fn remote_cache_lookup_hits_by_url_and_ignores_missing_files() {
        let root = temp_root("remote_lookup");
        let db = open_database_at(&root.join("user_assets.sqlite3")).expect("db");
        let dir = root.join("images").join(REMOTE_IMAGES_TABLE);
        let id = insert_remote_row(&db, &dir, 7, 1);
        let hit = lookup_remote_image(&dir, &db, "https://img/7.jpg").expect("hit");
        assert_eq!(hit.id, id);
        assert!(lookup_remote_image(&dir, &db, "https://img/other.jpg").is_none());
        db.execute(
            "INSERT INTO remote_images (id, name, mime_type, created_at, url) VALUES ('dead', 'n', 'image/png', 2, 'https://img/dead.jpg')",
            [],
        )
        .expect("insert");
        assert!(lookup_remote_image(&dir, &db, "https://img/dead.jpg").is_none());
        drop(db);
        std::fs::remove_dir_all(&root).expect("cleanup");
    }

    #[test]
    fn remote_cache_evicts_oldest_rows_and_files() {
        let root = temp_root("remote_evict");
        let db = open_database_at(&root.join("user_assets.sqlite3")).expect("db");
        let dir = root.join("images").join(REMOTE_IMAGES_TABLE);
        let mut ids = Vec::new();
        for n in 0..4u8 {
            ids.push(insert_remote_row(&db, &dir, n, i64::from(n)));
        }
        evict_remote_image_cache(&dir, &db, 2).expect("evict");
        let count: i64 = db
            .query_row("SELECT COUNT(*) FROM remote_images", [], |row| row.get(0))
            .expect("count");
        assert_eq!(count, 2);
        for (n, id) in ids.iter().enumerate() {
            let kept = n >= 2;
            let rows: i64 = db
                .query_row(
                    "SELECT COUNT(*) FROM remote_images WHERE id = ?1",
                    params![id],
                    |row| row.get(0),
                )
                .expect("count row");
            assert_eq!(rows, i64::from(kept));
            assert_eq!(dir.join(format!("{id}.png")).is_file(), kept);
        }
        drop(db);
        std::fs::remove_dir_all(&root).expect("cleanup");
    }

    #[test]
    fn remote_stats_count_rows_and_count_orphan_files_in_bytes() {
        let root = temp_root("remote_stats");
        let db = open_database_at(&root.join("user_assets.sqlite3")).expect("db");
        let dir = root.join("images").join(REMOTE_IMAGES_TABLE);
        insert_remote_row(&db, &dir, 1, 1);
        insert_remote_row(&db, &dir, 2, 2);
        std::fs::write(dir.join("orphan.png"), b"orphan-bytes").expect("write");
        let stats = remote_image_stats(&dir, &db).expect("stats");
        assert_eq!(stats.count, 2);
        let expected: u64 = std::fs::read_dir(&dir)
            .expect("read dir")
            .flatten()
            .filter_map(|e| e.metadata().ok())
            .filter(|m| m.is_file())
            .map(|m| m.len())
            .sum();
        assert_eq!(stats.bytes, expected);
        drop(db);
        std::fs::remove_dir_all(&root).expect("cleanup");
    }

    #[test]
    fn remote_clear_removes_all_rows_and_files_but_keeps_other_files() {
        let root = temp_root("remote_clear");
        let db = open_database_at(&root.join("user_assets.sqlite3")).expect("db");
        let dir = root.join("images").join(REMOTE_IMAGES_TABLE);
        let mut ids = Vec::new();
        for n in 0..3u8 {
            ids.push(insert_remote_row(&db, &dir, n, i64::from(n)));
        }
        let cleared = clear_remote_images(&dir, &db).expect("clear");
        assert_eq!(cleared, 3);
        let count: i64 = db
            .query_row("SELECT COUNT(*) FROM remote_images", [], |row| row.get(0))
            .expect("count");
        assert_eq!(count, 0);
        for id in &ids {
            assert!(!dir.join(format!("{id}.png")).exists());
        }
        assert!(dir.exists());
        assert_eq!(clear_remote_images(&dir, &db).expect("clear again"), 0);
        drop(db);
        std::fs::remove_dir_all(&root).expect("cleanup");
    }
    fn real_png_bytes(width: u32, height: u32) -> Vec<u8> {
        let img = image::RgbImage::from_fn(width, height, |x, y| {
            image::Rgb([(x % 256) as u8, (y % 256) as u8, 128])
        });
        let mut cursor = std::io::Cursor::new(Vec::new());
        image::DynamicImage::ImageRgb8(img)
            .write_to(&mut cursor, image::ImageFormat::Png)
            .expect("encode png");
        cursor.into_inner()
    }

    fn real_jpeg_bytes(width: u32, height: u32) -> Vec<u8> {
        let img = image::RgbImage::from_fn(width, height, |x, y| {
            image::Rgb([(y % 256) as u8, (x % 256) as u8, 64])
        });
        let mut cursor = std::io::Cursor::new(Vec::new());
        image::DynamicImage::ImageRgb8(img)
            .write_to(&mut cursor, image::ImageFormat::Jpeg)
            .expect("encode jpeg");
        cursor.into_inner()
    }

    fn thumb_dims(bytes: &[u8]) -> (u32, u32) {
        let img = image::load_from_memory(bytes).expect("decode thumb");
        (img.width(), img.height())
    }

    #[test]
    fn thumb_id_prefixes_once() {
        assert_eq!(thumb_id("abc123"), "t336_abc123");
        assert_eq!(thumb_id("t336_abc123"), "t336_abc123");
    }

    #[test]
    fn make_thumb336_keeps_small_png_dimensions_as_jpeg() {
        let thumb = make_thumb336(&real_png_bytes(100, 60)).expect("thumb");
        assert_eq!(&thumb[0..3], &[0xFF, 0xD8, 0xFF]);
        assert_eq!(thumb_dims(&thumb), (100, 60));
    }

    #[test]
    fn make_thumb336_resizes_wide_jpeg_to_336() {
        let thumb = make_thumb336(&real_jpeg_bytes(800, 400)).expect("thumb");
        assert_eq!(&thumb[0..3], &[0xFF, 0xD8, 0xFF]);
        assert_eq!(thumb_dims(&thumb), (336, 168));
    }

    #[test]
    fn make_thumb336_rejects_gif_and_garbage() {
        assert!(make_thumb336(b"GIF89a\x01\x00\x01\x00\x80\x00\x00").is_none());
        assert!(make_thumb336(b"definitely not image bytes").is_none());
    }

    #[test]
    fn store_plus_prefer_roundtrip_serves_thumb() {
        let root = temp_root("thumb_roundtrip");
        let db = open_database_at(&root.join("user_assets.sqlite3")).expect("db");
        let dir = root.join("images").join(USER_IMAGES_TABLE);
        let bytes = real_png_bytes(800, 400);
        let id = content_id(&bytes);
        import_image_bytes(&dir, &db, USER_IMAGES_TABLE, &bytes, "wide.png".into())
            .expect("import");
        ensure_thumb(&db, &dir, &id, "wide.png", &bytes);
        let tid = thumb_id(&id);
        assert!(dir.join(format!("{tid}.jpg")).is_file());
        let served = load_user_image(&db, &dir, &id).expect("load");
        assert_eq!(served.id, id);
        assert!(served.path.ends_with(&format!("{tid}.jpg")));
        assert_eq!(served.mime_type, "image/jpeg");
        let count: i64 = db
            .query_row("SELECT COUNT(*) FROM user_images", [], |row| row.get(0))
            .expect("count");
        assert_eq!(count, 2);
        drop(db);
        std::fs::remove_dir_all(&root).expect("cleanup");
    }

    #[test]
    fn read_repair_creates_missing_thumb_for_legacy_row() {
        let root = temp_root("thumb_repair");
        let db = open_database_at(&root.join("user_assets.sqlite3")).expect("db");
        let dir = root.join("images").join(USER_IMAGES_TABLE);
        let bytes = real_jpeg_bytes(200, 100);
        let id = content_id(&bytes);
        import_image_bytes(&dir, &db, USER_IMAGES_TABLE, &bytes, "legacy.jpg".into())
            .expect("import");
        let tid = thumb_id(&id);
        assert!(!dir.join(format!("{tid}.jpg")).exists());
        let served = load_user_image(&db, &dir, &id).expect("load");
        assert!(served.path.ends_with(&format!("{tid}.jpg")));
        assert!(dir.join(format!("{tid}.jpg")).is_file());
        drop(db);
        std::fs::remove_dir_all(&root).expect("cleanup");
    }

    #[test]
    fn delete_removes_image_and_thumb_files_and_rows() {
        let root = temp_root("thumb_delete");
        let db = open_database_at(&root.join("user_assets.sqlite3")).expect("db");
        let dir = root.join("images").join(USER_IMAGES_TABLE);
        let bytes = real_png_bytes(400, 300);
        let id = content_id(&bytes);
        import_image_bytes(&dir, &db, USER_IMAGES_TABLE, &bytes, "art.png".into()).expect("import");
        ensure_thumb(&db, &dir, &id, "art.png", &bytes);
        let tid = thumb_id(&id);
        assert!(dir.join(format!("{id}.png")).is_file());
        assert!(dir.join(format!("{tid}.jpg")).is_file());
        remove_user_image(&db, &dir, &id).expect("delete");
        let count: i64 = db
            .query_row("SELECT COUNT(*) FROM user_images", [], |row| row.get(0))
            .expect("count");
        assert_eq!(count, 0);
        assert_eq!(std::fs::read_dir(&dir).expect("dir").count(), 0);
        drop(db);
        std::fs::remove_dir_all(&root).expect("cleanup");
    }
}
