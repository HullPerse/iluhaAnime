use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{LazyLock, Mutex},
    time::{Duration, Instant, SystemTime},
};

use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::{ipc, Manager};
use tokio::sync::Mutex as AsyncMutex;

use super::sources::public_sources;
use super::sources::{
    allowed_cover, allowed_lib_cover, dex_client, lib_client, lib_cover_client, lib_request,
    MangaLibDomain, MangaLibServer, MangaSource, SourceError, MANGALIB_COVER_HOSTS, USER_AGENT,
};

const MAX_PAGE_BYTES: usize = 24 * 1024 * 1024;
/// Reader pages stay on disk across sessions; only this budget evicts them,
/// oldest read first, so a title opened months later is still cached.
const CACHE_LIMIT: u64 = 5 * 1024 * 1024 * 1024;
const MANIFEST_TTL: Duration = Duration::from_secs(600);

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReaderChapter {
    source: MangaSource,
    manga_id: String,
    chapter_id: String,
    number: String,
    volume: Option<String>,
    branch: Option<u64>,
    proxy_url: Option<String>,
    #[serde(default)]
    manga_lib_domain: MangaLibDomain,
    #[serde(default)]
    server: MangaLibServer,
}

#[derive(Clone)]
struct Manifest {
    chapter: ReaderChapter,
    urls: Vec<Url>,
    expires: Instant,
}

static MANIFESTS: LazyLock<AsyncMutex<HashMap<String, Manifest>>> =
    LazyLock::new(|| AsyncMutex::new(HashMap::new()));
static AT_HOME_NEXT: LazyLock<AsyncMutex<Instant>> =
    LazyLock::new(|| AsyncMutex::new(Instant::now()));
static DISK_CACHE: Mutex<Option<HashMap<PathBuf, (u64, SystemTime)>>> = Mutex::new(None);

#[derive(Serialize)]
pub struct ReaderManifest {
    key: String,
    count: usize,
}

#[derive(Clone, Serialize)]
pub struct LoadProgress {
    loaded: usize,
    total: Option<u64>,
    cached: bool,
}

fn safe_segment(value: &str, max_length: usize) -> bool {
    !value.is_empty()
        && value.len() <= max_length
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
        && !matches!(value, "." | "..")
}

/// Page files come from the source, so they may contain spaces or non-ASCII
/// names like `Без названия196 1_qvcJ.png`. Only URL-structural characters are
/// rejected; `Url::parse` percent-encodes the rest.
fn safe_path_segment(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 400
        && !matches!(value, "." | "..")
        && !value
            .chars()
            .any(|character| matches!(character, '/' | '\\' | '?' | '#') || character.is_control())
}

fn lib_urls(
    value: &Value,
    domain: MangaLibDomain,
    server: MangaLibServer,
) -> Result<Vec<Url>, SourceError> {
    let pages = value["pages"].as_array().ok_or(SourceError::Parse)?;
    pages
        .iter()
        .map(|page| {
            let path = page["url"]
                .as_str()
                .ok_or(SourceError::Parse)?
                .trim_start_matches('/');
            if !path.starts_with("manga/") || !path.split('/').all(safe_path_segment) {
                return Err(SourceError::Parse);
            }
            Url::parse(&format!("https://{}/{path}", domain.image_host(server)))
                .map_err(|_| SourceError::Parse)
        })
        .collect()
}

fn dex_urls(value: &Value) -> Result<Vec<Url>, SourceError> {
    let mut server = Url::parse(value["baseUrl"].as_str().ok_or(SourceError::Parse)?)
        .map_err(|_| SourceError::Parse)?;
    let host_allowed = server.host_str().is_some_and(|host| {
        host.ends_with(".mangadex.network")
            || matches!(host, "uploads.mangadex.org" | "mangadex.org")
    });
    if server.scheme() != "https"
        || !host_allowed
        || server.port().is_some()
        || !server.username().is_empty()
        || server.password().is_some()
        || server.query().is_some()
        || server.fragment().is_some()
    {
        return Err(SourceError::Blocked);
    }
    let chapter = &value["chapter"];
    let hash = chapter["hash"]
        .as_str()
        .filter(|value| safe_segment(value, 128))
        .ok_or(SourceError::Parse)?;
    server.set_path(&format!("/data/{hash}/"));
    chapter["data"]
        .as_array()
        .ok_or(SourceError::Parse)?
        .iter()
        .map(|file| {
            let name = file
                .as_str()
                .filter(|value| safe_segment(value, 200))
                .ok_or(SourceError::Parse)?;
            server.join(name).map_err(|_| SourceError::Parse)
        })
        .collect()
}

async fn lib_pages(chapter: &ReaderChapter) -> Result<Vec<Url>, SourceError> {
    if !safe_segment(&chapter.manga_id, 160) || !safe_segment(&chapter.number, 24) {
        return Err(SourceError::Unsupported);
    }
    let volume = chapter.volume.as_deref().unwrap_or("1");
    if !safe_segment(volume, 24) {
        return Err(SourceError::Unsupported);
    }
    let client = lib_client(chapter.proxy_url.as_deref())?;
    let mut request = lib_request(
        &client,
        chapter.manga_lib_domain,
        &format!("/{}/chapter", chapter.manga_id),
    )
    .query(&[("number", chapter.number.as_str()), ("volume", volume)]);
    if let Some(branch) = chapter.branch {
        request = request.query(&[("branch_id", branch)]);
    }
    let body = client.get(request).await?;
    let data = &body["data"];
    if data["expired_type"].as_u64() != Some(0) || !data["bundle_id"].is_null() {
        return Err(SourceError::PaidChapter);
    }
    if data["id"].as_u64().map(|id| id.to_string()).as_deref() != Some(chapter.chapter_id.as_str())
    {
        return Err(SourceError::NotFound);
    }
    lib_urls(data, chapter.manga_lib_domain, chapter.server)
}

async fn dex_pages(chapter: &ReaderChapter) -> Result<Vec<Url>, SourceError> {
    if chapter.chapter_id.len() != 36
        || !chapter
            .chapter_id
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() || byte == b'-')
    {
        return Err(SourceError::Unsupported);
    }
    {
        let mut next = AT_HOME_NEXT.lock().await;
        tokio::time::sleep_until((*next).into()).await;
        *next = Instant::now() + Duration::from_millis(1500);
    }
    let client = dex_client(chapter.proxy_url.as_deref())?;
    let body = client
        .get(client.client.get(format!(
            "https://api.mangadex.org/at-home/server/{}",
            chapter.chapter_id
        )))
        .await?;
    dex_urls(&body)
}

async fn resolve_manifest(chapter: ReaderChapter) -> Result<Manifest, SourceError> {
    let urls = match chapter.source {
        MangaSource::MangaLib => lib_pages(&chapter).await?,
        MangaSource::MangaDex => dex_pages(&chapter).await?,
        MangaSource::ReadManga | MangaSource::AsuraScans | MangaSource::WaManga => {
            public_sources::pages(
                chapter.source,
                &chapter.manga_id,
                &chapter.chapter_id,
                chapter.proxy_url.as_deref(),
            )
            .await?
        }
    };
    if urls.is_empty() || urls.len() > 1500 {
        return Err(SourceError::NotFound);
    }
    Ok(Manifest {
        chapter,
        urls,
        expires: Instant::now() + MANIFEST_TTL,
    })
}

fn manifest_key(chapter: &ReaderChapter) -> Result<String, SourceError> {
    let bytes = serde_json::to_vec(chapter).map_err(|_| SourceError::Parse)?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

async fn put_manifest(key: String, manifest: Manifest) {
    let mut manifests = MANIFESTS.lock().await;
    manifests.retain(|_, item| item.expires > Instant::now());
    if manifests.len() >= 16 {
        if let Some(oldest) = manifests
            .iter()
            .min_by_key(|(_, item)| item.expires)
            .map(|(key, _)| key.clone())
        {
            manifests.remove(&oldest);
        }
    }
    manifests.insert(key, manifest);
}

#[tauri::command]
pub async fn manga_reader_open(chapter: ReaderChapter) -> Result<ReaderManifest, SourceError> {
    let key = manifest_key(&chapter)?;
    if let Some(manifest) = MANIFESTS
        .lock()
        .await
        .get(&key)
        .filter(|manifest| manifest.expires > Instant::now())
    {
        return Ok(ReaderManifest {
            key,
            count: manifest.urls.len(),
        });
    }
    let manifest = resolve_manifest(chapter).await?;
    let count = manifest.urls.len();
    put_manifest(key.clone(), manifest).await;
    Ok(ReaderManifest { key, count })
}

fn image_cache_entry(name: &str) -> bool {
    name.len() == 64 && name.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn cache_inventory(dir: &std::path::Path) -> HashMap<PathBuf, (u64, SystemTime)> {
    fs::read_dir(dir)
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter_map(|entry| {
            if !image_cache_entry(entry.file_name().to_str()?) || !entry.file_type().ok()?.is_file()
            {
                return None;
            }
            let metadata = entry.metadata().ok()?;
            Some((entry.path(), (metadata.len(), metadata.modified().ok()?)))
        })
        .collect()
}

fn read_cache(path: PathBuf) -> Option<Vec<u8>> {
    let mut cache = DISK_CACHE.lock().ok()?;
    let dir = path.parent()?;
    let index = cache.get_or_insert_with(|| cache_inventory(dir));
    let entry = index.get_mut(&path)?;
    if entry.0 > MAX_PAGE_BYTES as u64 {
        return None;
    }
    let bytes = fs::read(&path).ok()?;
    let now = SystemTime::now();
    entry.1 = now;
    if let Ok(file) = fs::OpenOptions::new().write(true).open(path) {
        let _ = file.set_modified(now);
    }
    Some(bytes)
}

fn write_cache(path: PathBuf, bytes: &[u8]) {
    let Ok(mut cache) = DISK_CACHE.lock() else {
        return;
    };
    let Some(dir) = path.parent() else {
        return;
    };
    let index = cache.get_or_insert_with(|| cache_inventory(dir));
    if fs::create_dir_all(dir).is_err() || index.contains_key(&path) {
        return;
    }
    let size = bytes.len() as u64;
    let mut total: u64 = index.values().map(|(size, _)| *size).sum();
    while total.saturating_add(size) > CACHE_LIMIT {
        let Some((oldest, (old_size, _))) = index.iter().min_by_key(|(_, (_, stamp))| *stamp)
        else {
            return;
        };
        if fs::remove_file(oldest).is_err() {
            return;
        }
        let oldest = oldest.clone();
        total = total.saturating_sub(*old_size);
        index.remove(&oldest);
    }
    let temp = path.with_extension("part");
    if fs::write(&temp, bytes).is_ok() && fs::rename(&temp, &path).is_ok() {
        index.insert(path, (size, SystemTime::now()));
    } else {
        let _ = fs::remove_file(temp);
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageCacheStats {
    count: u64,
    bytes: u64,
}

fn page_cache_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path()
        .app_cache_dir()
        .ok()
        .map(|dir| dir.join("manga-pages"))
}

fn clear_page_cache(dir: &std::path::Path) -> Result<u64, String> {
    let removed = cache_inventory(dir).len() as u64;
    if let Ok(mut cache) = DISK_CACHE.lock() {
        *cache = None;
    }
    match fs::remove_dir_all(dir) {
        Ok(()) => Ok(removed),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(0),
        Err(error) => Err(format!("manga page cache clear: {error}")),
    }
}

/// Reports the long-term reader cache that survives restarts and is cleared only
/// from Settings or by the size budget in [`write_cache`].
#[tauri::command]
pub fn manga_page_cache_stats(app: tauri::AppHandle) -> PageCacheStats {
    let Some(dir) = page_cache_dir(&app) else {
        return PageCacheStats { count: 0, bytes: 0 };
    };
    let index = cache_inventory(&dir);
    PageCacheStats {
        count: index.len() as u64,
        bytes: index.values().map(|(size, _)| *size).sum(),
    }
}

#[tauri::command]
pub fn clear_manga_page_cache(app: tauri::AppHandle) -> Result<u64, String> {
    let Some(dir) = page_cache_dir(&app) else {
        return Ok(0);
    };
    clear_page_cache(&dir)
}

fn referer(source: MangaSource, domain: MangaLibDomain) -> &'static str {
    match source {
        MangaSource::MangaLib => domain.referer(),
        MangaSource::MangaDex => "https://mangadex.org/",
        MangaSource::ReadManga | MangaSource::AsuraScans | MangaSource::WaManga => {
            public_sources::referer(source)
        }
    }
}

async fn fetch_image(
    manifest: &Manifest,
    page: usize,
    progress: &ipc::Channel<LoadProgress>,
) -> Result<Vec<u8>, SourceError> {
    let source = manifest.chapter.source;
    let url = manifest
        .urls
        .get(page)
        .ok_or(SourceError::NotFound)?
        .clone();
    download_image(
        source,
        manifest.chapter.proxy_url.as_deref(),
        manifest.chapter.manga_lib_domain,
        url,
        Some(progress),
    )
    .await
}

async fn download_image(
    source: MangaSource,
    proxy: Option<&str>,
    domain: MangaLibDomain,
    url: Url,
    progress: Option<&ipc::Channel<LoadProgress>>,
) -> Result<Vec<u8>, SourceError> {
    let client = match source {
        MangaSource::MangaLib
            if url
                .host_str()
                .is_some_and(|host| MANGALIB_COVER_HOSTS.contains(&host)) =>
        {
            lib_cover_client(proxy)?
        }
        MangaSource::MangaLib => lib_client(proxy)?,
        MangaSource::MangaDex => dex_client(proxy)?,
        MangaSource::ReadManga | MangaSource::AsuraScans | MangaSource::WaManga => {
            public_sources::client(source, proxy)?
        }
    };
    let request = client
        .client
        .get(url)
        .header(reqwest::header::REFERER, referer(source, domain));
    let request = if matches!(
        source,
        MangaSource::ReadManga | MangaSource::AsuraScans | MangaSource::WaManga
    ) {
        public_sources::with_headers(request)
    } else {
        request
    };
    let mut response = client.send(request).await?;
    let total = response.content_length();
    if total.is_some_and(|total| total > MAX_PAGE_BYTES as u64) {
        return Err(SourceError::Parse);
    }
    let mut bytes = Vec::new();
    let mut last_update = Instant::now();
    if let Some(progress) = progress {
        let _ = progress.send(LoadProgress {
            loaded: 0,
            total,
            cached: false,
        });
    }
    while let Some(chunk) = response.chunk().await.map_err(|_| SourceError::Network)? {
        if bytes.len().saturating_add(chunk.len()) > MAX_PAGE_BYTES {
            return Err(SourceError::Parse);
        }
        bytes.extend_from_slice(&chunk);
        if let Some(progress) =
            progress.filter(|_| last_update.elapsed() >= Duration::from_millis(100))
        {
            let _ = progress.send(LoadProgress {
                loaded: bytes.len(),
                total,
                cached: false,
            });
            last_update = Instant::now();
        }
    }
    if !matches!(
        image::guess_format(&bytes),
        Ok(image::ImageFormat::Jpeg
            | image::ImageFormat::Png
            | image::ImageFormat::WebP
            | image::ImageFormat::Gif)
    ) {
        return Err(SourceError::Parse);
    }
    Ok(bytes)
}

fn cover_source(value: &str) -> Option<(MangaSource, String)> {
    if let Some(url) = allowed_lib_cover(value) {
        return Some((MangaSource::MangaLib, url));
    }
    if let Some(url) = allowed_cover(value, "uploads.mangadex.org") {
        return Some((MangaSource::MangaDex, url));
    }
    if let Some(url) = allowed_cover(value, public_sources::READ_CDN) {
        return Some((MangaSource::ReadManga, url));
    }
    if let Some(url) = allowed_cover(value, public_sources::ASURA_CDN) {
        return Some((MangaSource::AsuraScans, url));
    }
    if let Some(url) = allowed_cover(value, public_sources::WAMANGA_CDN) {
        return Some((MangaSource::WaManga, url));
    }
    None
}

fn cover_cache_name(url: &str) -> String {
    let digest = Sha256::digest(format!("cover:{url}:{USER_AGENT}"));
    format!("{digest:x}")
}

async fn fetch_lib_cover(
    cover: &Url,
    proxy: Option<&str>,
    domain: MangaLibDomain,
) -> Result<Vec<u8>, SourceError> {
    if let Some(base) = cover.path().strip_suffix("_thumb.jpg") {
        for suffix in [".jpg", "_250x350.jpg"] {
            let mut larger = cover.clone();
            larger.set_path(&format!("{base}{suffix}"));
            match download_image(MangaSource::MangaLib, proxy, domain, larger, None).await {
                Ok(bytes) => return Ok(bytes),
                Err(SourceError::NotFound) => {}
                Err(error) => return Err(error),
            }
        }
    }
    download_image(MangaSource::MangaLib, proxy, domain, cover.clone(), None).await
}

#[tauri::command]
pub async fn manga_cover_fetch(
    app: tauri::AppHandle,
    url: String,
    proxy_url: Option<String>,
    manga_lib_domain: Option<MangaLibDomain>,
) -> Result<ipc::Response, SourceError> {
    let (source, normalized) = cover_source(&url).ok_or(SourceError::Unsupported)?;
    let cover = Url::parse(&normalized).map_err(|_| SourceError::Parse)?;
    let proxy = proxy_url.as_deref();
    let domain = manga_lib_domain.unwrap_or_default();
    let cache_path = page_cache_dir(&app).map(|dir| dir.join(cover_cache_name(&normalized)));
    if let Some(path) = cache_path.clone() {
        if let Ok(Some(bytes)) =
            tauri::async_runtime::spawn_blocking(move || read_cache(path)).await
        {
            return Ok(ipc::Response::new(bytes));
        }
    }
    let bytes = if source == MangaSource::MangaLib {
        fetch_lib_cover(&cover, proxy, domain).await?
    } else {
        download_image(source, proxy, domain, cover, None).await?
    };
    if let Some(path) = cache_path {
        let result = tauri::async_runtime::spawn_blocking(move || {
            write_cache(path, &bytes);
            bytes
        })
        .await
        .map_err(|_| SourceError::Network)?;
        return Ok(ipc::Response::new(result));
    }
    Ok(ipc::Response::new(bytes))
}

#[tauri::command]
pub async fn manga_page_fetch(
    app: tauri::AppHandle,
    key: String,
    page: usize,
    progress: ipc::Channel<LoadProgress>,
) -> Result<ipc::Response, SourceError> {
    let mut manifest = MANIFESTS
        .lock()
        .await
        .get(&key)
        .cloned()
        .ok_or(SourceError::ExpiredPages)?;
    if manifest.expires <= Instant::now() {
        manifest = resolve_manifest(manifest.chapter).await?;
        put_manifest(key.clone(), manifest.clone()).await;
    }
    let dir = page_cache_dir(&app);
    let cache_path = |manifest: &Manifest| -> Result<_, SourceError> {
        let url = manifest.urls.get(page).ok_or(SourceError::NotFound)?;
        let digest = Sha256::digest(format!(
            "{key}:{page}:{url}:{}:{USER_AGENT}",
            referer(manifest.chapter.source, manifest.chapter.manga_lib_domain)
        ));
        Ok(dir.as_ref().map(|dir| dir.join(format!("{digest:x}"))))
    };
    if let Some(path) = cache_path(&manifest)? {
        if let Ok(Some(bytes)) =
            tauri::async_runtime::spawn_blocking(move || read_cache(path)).await
        {
            let _ = progress.send(LoadProgress {
                loaded: bytes.len(),
                total: Some(bytes.len() as u64),
                cached: true,
            });
            return Ok(ipc::Response::new(bytes));
        }
    }
    let bytes = match fetch_image(&manifest, page, &progress).await {
        Err(SourceError::Blocked) => {
            manifest = resolve_manifest(manifest.chapter).await?;
            let bytes = fetch_image(&manifest, page, &progress).await?;
            put_manifest(key.clone(), manifest.clone()).await;
            bytes
        }
        result => result?,
    };
    if let Some(path) = cache_path(&manifest)? {
        let result = tauri::async_runtime::spawn_blocking(move || {
            write_cache(path, &bytes);
            bytes
        })
        .await
        .map_err(|_| SourceError::Network)?;
        return Ok(ipc::Response::new(result));
    }
    Ok(ipc::Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn page_cache_clear_reports_and_deletes_cached_pages() {
        let dir = std::env::temp_dir().join(format!("iluha-manga-cache-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("cache dir");
        fs::write(dir.join("a".repeat(64)), vec![0_u8; 12]).expect("page file");
        fs::write(dir.join("leftover.part"), vec![0_u8; 4]).expect("partial file");
        let index = cache_inventory(&dir);
        assert_eq!(index.len(), 1);
        assert_eq!(index.values().map(|(size, _)| *size).sum::<u64>(), 12);
        assert_eq!(clear_page_cache(&dir).expect("clear"), 1);
        assert!(!dir.exists());
        assert_eq!(clear_page_cache(&dir).expect("clear missing"), 0);
    }

    #[test]
    fn cover_cache_names_are_stable_and_distinct() {
        let first = cover_cache_name("https://cover.lib.social/a.jpg");
        assert_eq!(first.len(), 64);
        assert!(first.bytes().all(|byte| byte.is_ascii_hexdigit()));
        assert_ne!(first, cover_cache_name("https://cover.lib.social/b.jpg"));
    }

    #[test]
    fn page_manifests_resolve_only_reader_cdn_urls() {
        let dex: Value =
            serde_json::from_str(include_str!("../../tests/fixtures/manga/dex-at-home.json"))
                .expect("manifest");
        let lib: Value =
            serde_json::from_str(include_str!("../../tests/fixtures/manga/lib-pages.json"))
                .expect("manifest");
        assert!(dex_urls(&dex).expect("MangaDex pages")[0]
            .path()
            .starts_with("/data/"));
        assert_eq!(
            lib_urls(&lib["data"], MangaLibDomain::Me, MangaLibServer::Compressed)
                .expect("MangaLib pages")[0]
                .host_str(),
            Some("img3.cdnlibs.org")
        );
        assert_eq!(
            lib_urls(&lib["data"], MangaLibDomain::Me, MangaLibServer::First)
                .expect("MangaLib first server")[0]
                .host_str(),
            Some("img1.cdnlibs.org")
        );
        assert_eq!(
            lib_urls(&lib["data"], MangaLibDomain::Me, MangaLibServer::Second)
                .expect("MangaLib second server")[0]
                .host_str(),
            Some("img2.cdnlibs.org")
        );
        assert_eq!(
            lib_urls(
                &lib["data"],
                MangaLibDomain::Org,
                MangaLibServer::Compressed
            )
            .expect("MangaLib mirror pages")[0]
                .host_str(),
            Some("img3.cdnrulib.link")
        );
        assert!(matches!(
            dex_urls(&serde_json::json!({ "baseUrl": "https://127.0.0.1" })),
            Err(SourceError::Blocked)
        ));
        let spaced = lib_urls(
            &serde_json::json!({
                "pages": [
                    { "url": "//manga/semya-animesnikov/chapters/1510628/мангадиб2_Ok24.png" },
                    { "url": "//manga/tensai/chapters/1324153/Без названия196 1_qvcJ.png" }
                ]
            }),
            MangaLibDomain::Me,
            MangaLibServer::Compressed,
        )
        .expect("MangaLib pages with non-ASCII names");
        assert!(spaced[0].path().contains("%D0%BC"));
        assert!(!spaced[0].path().contains('м'));
        assert!(!spaced[1].path().contains(' '));
        assert!(spaced[1].path().contains("%20"));
        assert!(matches!(
            lib_urls(
                &serde_json::json!({
                    "pages": [{ "url": "//manga/../etc/passwd" }]
                }),
                MangaLibDomain::Me,
                MangaLibServer::Compressed
            ),
            Err(SourceError::Parse)
        ));
    }
}
