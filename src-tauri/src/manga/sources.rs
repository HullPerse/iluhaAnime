use futures::future::join_all;
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    sync::{Arc, LazyLock, Mutex as StdMutex, OnceLock},
    time::{Duration, Instant},
};
use tokio::sync::Mutex;
use unicode_normalization::UnicodeNormalization;

pub(super) mod public_sources;

const MAX_CATALOG_BYTES: usize = 8 * 1024 * 1024;
const PAGE_SIZE: u32 = 10;
pub(super) const USER_AGENT: &str = concat!(
    "iluhaAnime/",
    env!("CARGO_PKG_VERSION"),
    " (+https://github.com/HullPerse/iluhaAnime)"
);

#[derive(Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MangaSource {
    MangaLib,
    MangaDex,
    ReadManga,
    AsuraScans,
}

impl MangaSource {
    pub(super) const fn id(self) -> &'static str {
        match self {
            Self::MangaLib => "mangalib",
            Self::MangaDex => "mangadex",
            Self::ReadManga => "readmanga",
            Self::AsuraScans => "asurascans",
        }
    }
}

#[derive(Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MangaPersonRole {
    Author,
    Artist,
}

impl MangaPersonRole {
    pub(super) const fn query_key(self) -> &'static str {
        match self {
            Self::Author => "author",
            Self::Artist => "artist",
        }
    }
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MangaPersonSearch {
    pub(super) name: String,
    pub(super) role: MangaPersonRole,
    pub(super) key: Option<String>,
    pub(super) source: Option<MangaSource>,
}

#[derive(Debug)]
pub enum SourceError {
    Network,
    RateLimited,
    Blocked,
    NotFound,
    Parse,
    Unsupported,
    AuthRequired,
    PaidChapter,
    ExpiredPages,
}

impl Serialize for SourceError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let code = match self {
            Self::Network => "Network",
            Self::RateLimited => "RateLimited",
            Self::Blocked => "Blocked",
            Self::NotFound => "NotFound",
            Self::Parse => "Parse",
            Self::Unsupported => "Unsupported",
            Self::AuthRequired => "AuthRequired",
            Self::PaidChapter => "PaidChapter",
            Self::ExpiredPages => "ExpiredPages",
        };
        serde_json::json!({ "code": code, "message": code }).serialize(serializer)
    }
}

pub(super) struct SourceClient {
    pub(super) client: Client,
    next_request: Mutex<Instant>,
    interval: Duration,
}

impl SourceClient {
    fn new(interval: Duration, proxy: Option<&str>) -> Result<Self, SourceError> {
        let mut builder = Client::builder()
            .user_agent(USER_AGENT)
            .timeout(Duration::from_secs(20))
            .redirect(reqwest::redirect::Policy::none());
        if let Some(proxy) = proxy {
            let url = reqwest::Url::parse(proxy).map_err(|_| SourceError::Unsupported)?;
            if !matches!(url.scheme(), "http" | "https" | "socks5" | "socks5h")
                || url.host_str().is_none()
            {
                return Err(SourceError::Unsupported);
            }
            builder =
                builder.proxy(reqwest::Proxy::all(url).map_err(|_| SourceError::Unsupported)?);
        }
        let client = builder.build().map_err(|_| SourceError::Network)?;
        Ok(Self {
            client,
            next_request: Mutex::new(Instant::now()),
            interval,
        })
    }

    pub(super) async fn send(
        &self,
        request: reqwest::RequestBuilder,
    ) -> Result<reqwest::Response, SourceError> {
        {
            let mut next = self.next_request.lock().await;
            tokio::time::sleep_until((*next).into()).await;
            *next = Instant::now() + self.interval;
        }
        let response = request.send().await.map_err(|_| SourceError::Network)?;
        match response.status() {
            StatusCode::OK => {}
            StatusCode::TOO_MANY_REQUESTS => {
                let seconds = response
                    .headers()
                    .get(reqwest::header::RETRY_AFTER)
                    .and_then(|value| value.to_str().ok())
                    .and_then(|value| value.parse::<u64>().ok())
                    .unwrap_or(2)
                    .clamp(1, 120);
                let mut next = self.next_request.lock().await;
                *next = (*next).max(Instant::now() + Duration::from_secs(seconds));
                return Err(SourceError::RateLimited);
            }
            StatusCode::UNAUTHORIZED => return Err(SourceError::AuthRequired),
            StatusCode::FORBIDDEN | StatusCode::UNAVAILABLE_FOR_LEGAL_REASONS => {
                return Err(SourceError::Blocked);
            }
            StatusCode::NOT_FOUND => return Err(SourceError::NotFound),
            status if status.is_redirection() => return Err(SourceError::Blocked),
            _ => return Err(SourceError::Network),
        }
        if response.headers().contains_key("cf-mitigated") {
            return Err(SourceError::Blocked);
        }
        Ok(response)
    }

    pub(super) async fn get(&self, request: reqwest::RequestBuilder) -> Result<Value, SourceError> {
        let bytes = self.bytes(request).await?;
        serde_json::from_slice(&bytes).map_err(|_| SourceError::Parse)
    }

    async fn bytes(&self, request: reqwest::RequestBuilder) -> Result<Vec<u8>, SourceError> {
        let mut response = self.send(request).await?;
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| SourceError::Network)? {
            if bytes.len().saturating_add(chunk.len()) > MAX_CATALOG_BYTES {
                return Err(SourceError::Parse);
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok(bytes)
    }
}

static MANGALIB: OnceLock<Result<Arc<SourceClient>, SourceError>> = OnceLock::new();
static MANGADEX: OnceLock<Result<Arc<SourceClient>, SourceError>> = OnceLock::new();
static MANGALIB_COVER: OnceLock<Result<Arc<SourceClient>, SourceError>> = OnceLock::new();
type ProxyClients = HashMap<(&'static str, String), Arc<SourceClient>>;
static PROXY_CLIENTS: LazyLock<StdMutex<ProxyClients>> =
    LazyLock::new(|| StdMutex::new(HashMap::new()));
static LIB_PERSON_NAMES: LazyLock<StdMutex<HashMap<String, String>>> =
    LazyLock::new(|| StdMutex::new(HashMap::new()));

fn source_client(
    direct: &OnceLock<Result<Arc<SourceClient>, SourceError>>,
    id: &'static str,
    interval: Duration,
    proxy: Option<&str>,
) -> Result<Arc<SourceClient>, SourceError> {
    let Some(proxy) = proxy.map(str::trim).filter(|value| !value.is_empty()) else {
        return direct
            .get_or_init(|| SourceClient::new(interval, None).map(Arc::new))
            .as_ref()
            .map(Arc::clone)
            .map_err(|_| SourceError::Network);
    };
    if proxy.len() > 2048 {
        return Err(SourceError::Unsupported);
    }
    let mut clients = PROXY_CLIENTS.lock().map_err(|_| SourceError::Network)?;
    let key = (id, proxy.to_owned());
    if let Some(client) = clients.get(&key) {
        return Ok(Arc::clone(client));
    }
    if clients.len() >= 12 {
        clients.clear();
    }
    let client = Arc::new(SourceClient::new(interval, Some(proxy))?);
    clients.insert(key, Arc::clone(&client));
    Ok(client)
}

pub(super) fn lib_client(proxy: Option<&str>) -> Result<Arc<SourceClient>, SourceError> {
    source_client(&MANGALIB, "mangalib", Duration::from_secs(1), proxy)
}

pub(super) fn lib_cover_client(proxy: Option<&str>) -> Result<Arc<SourceClient>, SourceError> {
    source_client(
        &MANGALIB_COVER,
        "mangalib-cover",
        Duration::from_secs(1),
        proxy,
    )
}

pub(super) fn dex_client(proxy: Option<&str>) -> Result<Arc<SourceClient>, SourceError> {
    source_client(&MANGADEX, "mangadex", Duration::from_millis(250), proxy)
}

static MANGA_META: OnceLock<Result<Arc<SourceClient>, SourceError>> = OnceLock::new();

fn meta_client(proxy: Option<&str>) -> Result<Arc<SourceClient>, SourceError> {
    source_client(&MANGA_META, "manga-meta", Duration::from_millis(200), proxy)
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MangaLibServer {
    First,
    Second,
    #[default]
    Compressed,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
pub enum MangaLibDomain {
    #[default]
    #[serde(rename = "mangalib.me")]
    Me,
    #[serde(rename = "mangalib.org")]
    Org,
}

impl MangaLibDomain {
    pub(super) fn referer(self) -> &'static str {
        match self {
            Self::Me => "https://mangalib.me/",
            Self::Org => "https://mangalib.org/",
        }
    }

    fn api(self) -> &'static str {
        match self {
            Self::Me => "https://api.cdnlibs.org",
            Self::Org => "https://api.mangalib.org",
        }
    }

    pub(super) fn image_host(self, server: MangaLibServer) -> &'static str {
        match (self, server) {
            (Self::Me, MangaLibServer::First) => "img1.cdnlibs.org",
            (Self::Me, MangaLibServer::Second) => "img2.cdnlibs.org",
            (Self::Me, MangaLibServer::Compressed) => "img3.cdnlibs.org",
            (Self::Org, MangaLibServer::First) => "img1.cdnrulib.link",
            (Self::Org, MangaLibServer::Second) => "img2.cdnrulib.link",
            (Self::Org, MangaLibServer::Compressed) => "img3.cdnrulib.link",
        }
    }
}

pub(super) const MANGALIB_COVER_HOSTS: [&str; 3] = [
    "cover.lib.social",
    "cover.cdnrulib.link",
    "cover.imglib.info",
];

pub(super) fn allowed_lib_cover(value: &str) -> Option<String> {
    MANGALIB_COVER_HOSTS
        .iter()
        .find_map(|host| allowed_cover(value, host))
}

fn lib_api_request(
    client: &SourceClient,
    domain: MangaLibDomain,
    path: &str,
) -> reqwest::RequestBuilder {
    client
        .client
        .get(format!("{}{path}", domain.api()))
        .header("Site-Id", "1")
        .header(reqwest::header::REFERER, domain.referer())
}

pub(super) fn lib_request(
    client: &SourceClient,
    domain: MangaLibDomain,
    path: &str,
) -> reqwest::RequestBuilder {
    lib_api_request(client, domain, &format!("/api/manga{path}"))
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MangaSearchHit {
    pub(super) id: String,
    pub(super) title: String,
    pub(super) cover: Option<String>,
    pub(super) status: Option<String>,
    pub(super) chapters: Option<u32>,
    suggestive: bool,
    pub(super) rating: String,
    pub(super) aliases: Vec<String>,
    pub(super) external_ids: ExternalIds,
}

#[derive(Debug, Deserialize, Serialize, Default)]
pub(super) struct ExternalIds {
    pub(super) anilist: Option<u64>,
    pub(super) mal: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MangaSearchPage {
    items: Vec<MangaSearchHit>,
    has_next: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MangaSearchMeta {
    id: String,
    chapters: u32,
}

pub(super) fn allowed_cover(value: &str, host: &str) -> Option<String> {
    let url = reqwest::Url::parse(value).ok()?;
    (url.scheme() == "https"
        && url.host_str() == Some(host)
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none())
    .then(|| url.to_string())
}

fn lib_anilist_id(hit: &Value) -> Option<u64> {
    if let Some(id) = hit["anilist_id"].as_u64().filter(|id| *id > 0) {
        return Some(id);
    }
    hit["externalLinks"].as_array()?.iter().find_map(|link| {
        let url = reqwest::Url::parse(link["source_link"].as_str()?).ok()?;
        if !matches!(url.scheme(), "https" | "http") || url.host_str() != Some("anilist.co") {
            return None;
        }
        let mut path = url.path_segments()?;
        if path.next()? != "manga" {
            return None;
        }
        path.next()?.parse::<u64>().ok().filter(|id| *id > 0)
    })
}

fn parse_lib(hit: &Value) -> Option<MangaSearchHit> {
    Some(MangaSearchHit {
        id: hit["slug_url"].as_str()?.to_owned(),
        title: hit["rus_name"]
            .as_str()
            .filter(|title| !title.is_empty())
            .or_else(|| hit["name"].as_str())?
            .to_owned(),
        cover: ["default", "md", "thumbnail"]
            .iter()
            .find_map(|key| hit["cover"][*key].as_str().and_then(allowed_lib_cover)),
        status: non_empty(&hit["status"]["label"]),
        chapters: None,
        suggestive: false,
        rating: "safe".to_owned(),
        aliases: ["name", "rus_name", "eng_name"]
            .iter()
            .filter_map(|key| non_empty(&hit[*key]))
            .collect(),
        external_ids: ExternalIds {
            anilist: lib_anilist_id(hit),
            mal: None,
        },
    })
}

fn parse_dex(hit: &Value, nsfw: bool) -> Option<MangaSearchHit> {
    let attributes = &hit["attributes"];
    let rating = attributes["contentRating"].as_str()?;
    if !nsfw && rating == "pornographic" {
        return None;
    }
    let id = hit["id"].as_str()?;
    let titles = attributes["title"].as_object()?;
    let title = ["en", "ja-ro", "ja"]
        .iter()
        .find_map(|key| titles.get(*key).and_then(Value::as_str))
        .or_else(|| titles.values().find_map(Value::as_str))?;
    let cover = hit["relationships"]
        .as_array()
        .and_then(|rels| rels.iter().find(|rel| rel["type"] == "cover_art"))
        .and_then(|rel| rel["attributes"]["fileName"].as_str())
        .and_then(|file| {
            allowed_cover(
                &format!("https://uploads.mangadex.org/covers/{id}/{file}.512.jpg"),
                "uploads.mangadex.org",
            )
        });
    Some(MangaSearchHit {
        id: id.to_owned(),
        title: title.to_owned(),
        cover,
        status: non_empty(&attributes["status"]),
        chapters: None,
        suggestive: !nsfw && rating == "suggestive",
        rating: rating.to_owned(),
        aliases: attributes["altTitles"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(Value::as_object)
            .flat_map(|titles| titles.values().filter_map(non_empty))
            .take(50)
            .collect(),
        external_ids: ExternalIds {
            anilist: attributes["links"]["al"]
                .as_str()
                .and_then(|id| id.parse().ok()),
            mal: attributes["links"]["mal"]
                .as_str()
                .and_then(|id| id.parse().ok()),
        },
    })
}

fn parse_search(
    source: MangaSource,
    value: &Value,
    offset: u32,
    nsfw: bool,
) -> Result<MangaSearchPage, SourceError> {
    let data = value["data"].as_array().ok_or(SourceError::Parse)?;
    let (items, has_next) = match source {
        MangaSource::MangaLib => (
            data.iter().filter_map(parse_lib).collect(),
            value["meta"]["has_next_page"]
                .as_bool()
                .ok_or(SourceError::Parse)?,
        ),
        MangaSource::MangaDex => (
            data.iter().filter_map(|hit| parse_dex(hit, nsfw)).collect(),
            value["total"].as_u64().ok_or(SourceError::Parse)? > u64::from(offset + PAGE_SIZE),
        ),
        _ => return Err(SourceError::Unsupported),
    };
    Ok(MangaSearchPage { items, has_next })
}

fn normalized_person_name(value: &str) -> String {
    let mut words: Vec<_> = value
        .nfkc()
        .flat_map(char::to_lowercase)
        .collect::<String>()
        .split_whitespace()
        .map(str::to_owned)
        .collect();
    words.sort_unstable();
    words.join(" ")
}

fn same_person_name(candidate: &str, target: &str) -> bool {
    candidate
        .split('/')
        .map(normalized_person_name)
        .any(|name| name == target)
}

fn empty_page() -> MangaSearchPage {
    MangaSearchPage {
        items: Vec::new(),
        has_next: false,
    }
}

async fn lib_english_person_name(
    name: &str,
    domain: MangaLibDomain,
    proxy: Option<&str>,
) -> Option<String> {
    if let Some(name) = LIB_PERSON_NAMES
        .lock()
        .ok()
        .and_then(|names| names.get(name).cloned())
    {
        return Some(name);
    }
    let client = lib_client(proxy).ok()?;
    let body = client
        .get(lib_api_request(&client, domain, "/api/people").query(&[("q", name)]))
        .await
        .ok()?;
    let rows = body["data"].as_array()?;
    let target = normalized_person_name(name);
    let row = rows
        .iter()
        .find(|row| {
            ["name", "rus_name", "alt_name"]
                .iter()
                .filter_map(|key| non_empty(&row[*key]))
                .any(|candidate| same_person_name(&candidate, &target))
        })
        .or_else(|| (rows.len() == 1).then(|| &rows[0]))?;
    let resolved = non_empty(&row["name"]).filter(|candidate| candidate != name)?;
    if let Ok(mut names) = LIB_PERSON_NAMES.lock() {
        names.insert(name.to_owned(), resolved.clone());
    }
    Some(resolved)
}

async fn lib_person_search(
    client: &SourceClient,
    domain: MangaLibDomain,
    person: &MangaPersonSearch,
    page: u32,
    nsfw: bool,
) -> Result<MangaSearchPage, SourceError> {
    let people = client
        .get(lib_api_request(client, domain, "/api/people").query(&[("q", person.name.as_str())]))
        .await?;
    let rows = people["data"].as_array().ok_or(SourceError::Parse)?;
    let target = normalized_person_name(&person.name);
    let row = rows
        .iter()
        .find(|row| {
            ["name", "rus_name", "alt_name"]
                .iter()
                .filter_map(|key| non_empty(&row[*key]))
                .any(|name| same_person_name(&name, &target))
        })
        .or_else(|| (rows.len() == 1).then(|| &rows[0]));
    let Some(id) = row.and_then(|row| row["id"].as_u64()) else {
        return Ok(empty_page());
    };
    let body = client
        .get(
            lib_api_request(client, domain, "/api/manga")
                .query(&[
                    ("target_id", id.to_string()),
                    ("target_model", "people".to_owned()),
                    ("site_id[0]", "1".to_owned()),
                ])
                .query(&[("page", page), ("limit", PAGE_SIZE)]),
        )
        .await?;
    parse_search(MangaSource::MangaLib, &body, (page - 1) * PAGE_SIZE, nsfw)
}

async fn dex_person_id(client: &SourceClient, name: &str) -> Result<Option<String>, SourceError> {
    let body = client
        .get(
            client
                .client
                .get("https://api.mangadex.org/author")
                .query(&[("name", name), ("limit", "20")]),
        )
        .await?;
    let rows = body["data"].as_array().ok_or(SourceError::Parse)?;
    let target = normalized_person_name(name);
    let row = rows
        .iter()
        .find(|row| {
            non_empty(&row["attributes"]["name"])
                .is_some_and(|candidate| same_person_name(&candidate, &target))
        })
        .or_else(|| (rows.len() == 1).then(|| &rows[0]));
    Ok(row.and_then(|row| non_empty(&row["id"])))
}

async fn dex_person_search(
    source: &SourceClient,
    person: &MangaPersonSearch,
    page: u32,
    nsfw: bool,
) -> Result<MangaSearchPage, SourceError> {
    let Some(id) = dex_person_id(source, &person.name).await? else {
        return Ok(empty_page());
    };
    let role = match person.role {
        MangaPersonRole::Author => "authors[]",
        MangaPersonRole::Artist => "artists[]",
    };
    let offset = (page - 1) * PAGE_SIZE;
    let mut request = source
        .client
        .get("https://api.mangadex.org/manga")
        .query(&[
            ("order[relevance]", "desc"),
            ("availableTranslatedLanguage[]", "ru"),
            ("availableTranslatedLanguage[]", "en"),
            ("includes[]", "cover_art"),
            ("contentRating[]", "safe"),
            ("contentRating[]", "suggestive"),
            ("contentRating[]", "erotica"),
        ])
        .query(&[(role, id.as_str())])
        .query(&[("offset", offset), ("limit", PAGE_SIZE)]);
    if nsfw {
        request = request.query(&[("contentRating[]", "pornographic")]);
    }
    let body = source.get(request).await?;
    parse_search(MangaSource::MangaDex, &body, offset, nsfw)
}

#[tauri::command]
pub async fn manga_search(
    source: MangaSource,
    query: String,
    page: u32,
    nsfw: bool,
    person: Option<MangaPersonSearch>,
    proxy_url: Option<String>,
    manga_lib_domain: Option<MangaLibDomain>,
) -> Result<MangaSearchPage, SourceError> {
    let mut person = person;
    if person
        .as_ref()
        .is_some_and(|person| person.name.trim().is_empty() || person.name.len() > 512)
    {
        return Err(SourceError::Unsupported);
    }
    if source != MangaSource::MangaLib {
        let current = person
            .as_ref()
            .filter(|person| !person.name.is_ascii())
            .map(|person| person.name.clone());
        if let Some(current) = current {
            if let Some(name) = lib_english_person_name(
                &current,
                manga_lib_domain.unwrap_or_default(),
                proxy_url.as_deref(),
            )
            .await
            {
                if let Some(mut resolved) = person.take() {
                    resolved.name = name;
                    person = Some(resolved);
                }
            }
        }
    }
    let person_query = person.as_ref().map(|person| person.name.trim());
    if person_query.is_some_and(|name| name.is_empty() || name.len() > 512) {
        return Err(SourceError::Unsupported);
    }
    let query = person_query.unwrap_or_else(|| query.trim());
    if query.is_empty() || query.len() > 512 || !(1..=1000).contains(&page) {
        return Err(SourceError::Unsupported);
    }
    let offset = (page - 1) * PAGE_SIZE;
    if let Some(person) = &person {
        let result = match source {
            MangaSource::MangaLib => {
                let client = lib_client(proxy_url.as_deref())?;
                lib_person_search(
                    &client,
                    manga_lib_domain.unwrap_or_default(),
                    person,
                    page,
                    nsfw,
                )
                .await?
            }
            MangaSource::MangaDex => {
                let client = dex_client(proxy_url.as_deref())?;
                dex_person_search(&client, person, page, nsfw).await?
            }
            MangaSource::ReadManga | MangaSource::AsuraScans => {
                public_sources::search(source, query, page, proxy_url.as_deref(), Some(person))
                    .await?
            }
        };
        let mut result = result;
        result.has_next &= page < 1000;
        return Ok(result);
    }
    let body = match source {
        MangaSource::MangaLib => {
            let source = lib_client(proxy_url.as_deref())?;
            let request = lib_request(&source, manga_lib_domain.unwrap_or_default(), "")
                .query(&[("q", query)])
                .query(&[("page", page), ("limit", PAGE_SIZE)]);
            source.get(request).await?
        }
        MangaSource::MangaDex => {
            let source = dex_client(proxy_url.as_deref())?;
            let mut request = source
                .client
                .get("https://api.mangadex.org/manga")
                .query(&[
                    ("title", query),
                    ("order[relevance]", "desc"),
                    ("availableTranslatedLanguage[]", "ru"),
                    ("availableTranslatedLanguage[]", "en"),
                    ("includes[]", "cover_art"),
                    ("contentRating[]", "safe"),
                    ("contentRating[]", "suggestive"),
                    ("contentRating[]", "erotica"),
                ])
                .query(&[("offset", offset), ("limit", PAGE_SIZE)]);
            if nsfw {
                request = request.query(&[("contentRating[]", "pornographic")]);
            }
            source.get(request).await?
        }
        MangaSource::ReadManga | MangaSource::AsuraScans => {
            let mut result =
                public_sources::search(source, query, page, proxy_url.as_deref(), None).await?;
            result.has_next &= page < 1000;
            return Ok(result);
        }
    };
    let mut result = parse_search(source, &body, offset, nsfw)?;
    result.has_next &= page < 1000;
    Ok(result)
}

fn lib_chapter_count(value: &Value) -> Option<u32> {
    value["data"]["items_count"]["uploaded"]
        .as_u64()
        .and_then(|count| u32::try_from(count).ok())
        .filter(|count| *count > 0)
}

fn dex_chapter_count(value: &Value) -> Option<u32> {
    let volumes = value["volumes"].as_object()?;
    let count = volumes
        .values()
        .filter_map(|volume| volume["chapters"].as_object())
        .map(serde_json::Map::len)
        .sum::<usize>();
    u32::try_from(count).ok().filter(|count| *count > 0)
}

fn valid_lib_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 160
        && id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
}

fn valid_dex_id(id: &str) -> bool {
    id.len() == 36
        && id.bytes().enumerate().all(|(index, byte)| {
            if matches!(index, 8 | 13 | 18 | 23) {
                byte == b'-'
            } else {
                byte.is_ascii_hexdigit()
            }
        })
}

/// Chapter totals are missing from the MangaLib and MangaDex search payloads,
/// so the frontend asks for them separately after the catalog page is painted.
#[tauri::command]
pub async fn manga_search_meta(
    source: MangaSource,
    ids: Vec<String>,
    proxy_url: Option<String>,
    manga_lib_domain: Option<MangaLibDomain>,
) -> Result<Vec<MangaSearchMeta>, SourceError> {
    if ids.len() > 20 {
        return Err(SourceError::Unsupported);
    }
    let ids: Vec<&str> = ids.iter().map(String::as_str).collect();
    let meta = match source {
        MangaSource::MangaLib => {
            let client = meta_client(proxy_url.as_deref())?;
            let domain = manga_lib_domain.unwrap_or_default();
            join_all(ids.into_iter().filter(|id| valid_lib_id(id)).map(|id| {
                let client = Arc::clone(&client);
                async move {
                    let body = client
                        .get(
                            lib_request(&client, domain, &format!("/{id}"))
                                .query(&[("fields[]", "chap_count")]),
                        )
                        .await
                        .ok()?;
                    Some(MangaSearchMeta {
                        id: id.to_owned(),
                        chapters: lib_chapter_count(&body)?,
                    })
                }
            }))
            .await
        }
        MangaSource::MangaDex => {
            let client = meta_client(proxy_url.as_deref())?;
            join_all(ids.into_iter().filter(|id| valid_dex_id(id)).map(|id| {
                let client = Arc::clone(&client);
                async move {
                    let body = client
                        .get(
                            client
                                .client
                                .get(format!("https://api.mangadex.org/manga/{id}/aggregate")),
                        )
                        .await
                        .ok()?;
                    Some(MangaSearchMeta {
                        id: id.to_owned(),
                        chapters: dex_chapter_count(&body)?,
                    })
                }
            }))
            .await
        }
        MangaSource::ReadManga | MangaSource::AsuraScans => Vec::new(),
    };
    Ok(meta.into_iter().flatten().collect())
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MangaChapter {
    pub(super) id: String,
    pub(super) number: String,
    pub(super) volume: Option<String>,
    pub(super) key: String,
    pub(super) title: Option<String>,
    pub(super) language: String,
    pub(super) group: Option<String>,
    pub(super) locked: bool,
    pub(super) lock_reason: Option<String>,
    available_at: Option<String>,
    branch: Option<u64>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MangaDetails {
    pub(super) title: MangaSearchHit,
    description: Option<String>,
    authors: Vec<String>,
    artists: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    author_keys: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    artist_keys: Vec<String>,
    genres: Vec<String>,
    release: Option<String>,
    #[serde(skip)]
    pub(super) publication_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) notification: Option<super::library::MangaNotification>,
    pub(super) chapters: Vec<MangaChapter>,
}

fn chapter_key(number: &str) -> String {
    let normalized: String = number.trim().nfkc().flat_map(char::to_lowercase).collect();
    match normalized.parse::<f64>() {
        Ok(number) if number.is_finite() => number.to_string(),
        _ => normalized,
    }
}

fn non_empty(value: &Value) -> Option<String> {
    value
        .as_str()
        .filter(|value| !value.trim().is_empty())
        .map(str::to_owned)
}

fn lib_chapters(value: &Value) -> Result<Vec<MangaChapter>, SourceError> {
    let chapters = value["data"].as_array().ok_or(SourceError::Parse)?;
    Ok(chapters
        .iter()
        .filter_map(|chapter| Some((non_empty(&chapter["number"])?, chapter)))
        .flat_map(|(number, chapter)| {
            chapter["branches"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(move |branch| {
                    let paid = !chapter["bundle_id"].is_null();
                    let locked = paid || branch["expired_type"].as_u64() != Some(0);
                    Some(MangaChapter {
                        id: branch["id"].as_u64()?.to_string(),
                        key: chapter_key(&number),
                        number: number.clone(),
                        volume: non_empty(&chapter["volume"]),
                        title: non_empty(&chapter["name"]),
                        language: "ru".to_owned(),
                        group: non_empty(&branch["teams"][0]["name"]),
                        locked,
                        lock_reason: locked.then(|| {
                            if paid {
                                "paid".to_owned()
                            } else {
                                "closed".to_owned()
                            }
                        }),
                        available_at: locked.then(|| non_empty(&branch["expired_at"])).flatten(),
                        branch: branch["branch_id"].as_u64(),
                    })
                })
        })
        .collect())
}

fn dex_chapter(chapter: &Value) -> Option<MangaChapter> {
    let attrs = &chapter["attributes"];
    let language = match attrs["translatedLanguage"].as_str()? {
        "en" => "en".to_owned(),
        "ru" => "ru".to_owned(),
        _ => return None,
    };
    let id = non_empty(&chapter["id"])?;
    let number = non_empty(&attrs["chapter"]).unwrap_or_default();
    let key = if number.is_empty() {
        format!("special:{id}")
    } else {
        chapter_key(&number)
    };
    let group = chapter["relationships"].as_array().and_then(|rels| {
        rels.iter()
            .find(|rel| rel["type"] == "scanlation_group")
            .and_then(|rel| non_empty(&rel["attributes"]["name"]))
    });
    let external = !attrs["externalUrl"].is_null();
    Some(MangaChapter {
        id,
        number,
        key,
        volume: non_empty(&attrs["volume"]),
        title: non_empty(&attrs["title"]),
        language,
        group,
        locked: external,
        lock_reason: external.then(|| "external".to_owned()),
        available_at: None,
        branch: None,
    })
}

fn dex_feed(offset: usize, id: &str, client: &SourceClient) -> reqwest::RequestBuilder {
    client
        .client
        .get(format!("https://api.mangadex.org/manga/{id}/feed"))
        .query(&[
            ("translatedLanguage[]", "ru"),
            ("translatedLanguage[]", "en"),
            ("order[chapter]", "desc"),
            ("includes[]", "scanlation_group"),
        ])
        .query(&[("limit", 100), ("offset", offset)])
}

fn manga_lib_summary(summary: &Value) -> Option<String> {
    let paragraphs: Vec<String> = summary["content"]
        .as_array()
        .into_iter()
        .flatten()
        .map(|block| {
            block["content"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|node| node["text"].as_str())
                .collect()
        })
        .filter(|text: &String| !text.trim().is_empty())
        .collect();
    non_empty(summary).or_else(|| non_empty(&Value::String(paragraphs.join("\n\n"))))
}

fn lib_people(rows: &Value) -> Vec<String> {
    rows.as_array()
        .into_iter()
        .flatten()
        .filter_map(|row| non_empty(&row["rus_name"]).or_else(|| non_empty(&row["name"])))
        .collect()
}

fn dex_people(relationships: &Value, role: &str) -> Vec<String> {
    relationships
        .as_array()
        .into_iter()
        .flatten()
        .filter(|row| row["type"].as_str() == Some(role))
        .filter_map(|row| non_empty(&row["attributes"]["name"]))
        .collect()
}

async fn dex_details(
    id: &str,
    nsfw: bool,
    proxy: Option<&str>,
) -> Result<MangaDetails, SourceError> {
    let is_id = id.len() == 36
        && id
            .chars()
            .all(|character| character.is_ascii_hexdigit() || character == '-');
    if !is_id {
        return Err(SourceError::Unsupported);
    }
    let client = dex_client(proxy)?;
    let details = client
        .get(
            client
                .client
                .get(format!("https://api.mangadex.org/manga/{id}"))
                .query(&[
                    ("includes[]", "cover_art"),
                    ("includes[]", "author"),
                    ("includes[]", "artist"),
                ]),
        )
        .await?;
    let title = parse_dex(&details["data"], nsfw).ok_or(SourceError::NotFound)?;
    let mut chapters = Vec::new();
    for offset in (0..10_000).step_by(100) {
        let page = client.get(dex_feed(offset, id, &client)).await?;
        let values = page["data"].as_array().ok_or(SourceError::Parse)?;
        chapters.extend(values.iter().filter_map(dex_chapter));
        if values.len() < 100
            || page["total"]
                .as_u64()
                .is_some_and(|total| total <= (offset + 100) as u64)
        {
            break;
        }
    }
    Ok(MangaDetails {
        title,
        description: non_empty(&details["data"]["attributes"]["description"]["ru"])
            .or_else(|| non_empty(&details["data"]["attributes"]["description"]["en"])),
        authors: dex_people(&details["data"]["relationships"], "author"),
        artists: dex_people(&details["data"]["relationships"], "artist"),
        author_keys: Vec::new(),
        artist_keys: Vec::new(),
        genres: details["data"]["attributes"]["tags"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|row| row["attributes"]["group"] == "genre")
            .filter_map(|row| {
                non_empty(&row["attributes"]["name"]["ru"])
                    .or_else(|| non_empty(&row["attributes"]["name"]["en"]))
            })
            .collect(),
        publication_status: non_empty(&details["data"]["attributes"]["status"]),
        notification: None,
        release: details["data"]["attributes"]["year"]
            .as_u64()
            .map(|year| year.to_string()),
        chapters,
    })
}

async fn lib_details(
    id: &str,
    proxy: Option<&str>,
    domain: MangaLibDomain,
) -> Result<MangaDetails, SourceError> {
    if id.len() > 160
        || !id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err(SourceError::Unsupported);
    }
    let client = lib_client(proxy)?;
    let details = client
        .get(lib_request(&client, domain, &format!("/{id}")).query(&[
            ("fields[]", "summary"),
            ("fields[]", "authors"),
            ("fields[]", "artists"),
            ("fields[]", "genres"),
            ("fields[]", "externalLinks"),
        ]))
        .await?;
    let title = parse_lib(&details["data"]).ok_or(SourceError::NotFound)?;
    let feed = client
        .get(lib_request(&client, domain, &format!("/{id}/chapters")))
        .await?;
    let mut chapters = lib_chapters(&feed)?;
    chapters.reverse();
    Ok(MangaDetails {
        title,
        description: manga_lib_summary(&details["data"]["summary"]),
        authors: lib_people(&details["data"]["authors"]),
        artists: lib_people(&details["data"]["artists"]),
        author_keys: Vec::new(),
        artist_keys: Vec::new(),
        genres: details["data"]["genres"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|row| non_empty(&row["name"]))
            .collect(),
        publication_status: non_empty(&details["data"]["status"]["label"]),
        notification: None,
        release: non_empty(&details["data"]["releaseDateString"]),
        chapters,
    })
}

fn probe_client(proxy_url: Option<&str>) -> Result<Client, String> {
    let mut builder = Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::none());
    if let Some(proxy) = proxy_url.map(str::trim).filter(|value| !value.is_empty()) {
        let url = reqwest::Url::parse(proxy).map_err(|_| "unsupported proxy address".to_owned())?;
        if !matches!(url.scheme(), "http" | "https" | "socks5" | "socks5h")
            || url.host_str().is_none()
        {
            return Err("unsupported proxy address".to_owned());
        }
        builder = builder
            .proxy(reqwest::Proxy::all(url).map_err(|error| format!("invalid proxy: {error}"))?);
    }
    builder.build().map_err(|error| error.to_string())
}

fn mangalib_host(domain: MangaLibDomain) -> &'static str {
    match domain {
        MangaLibDomain::Me => "api.cdnlibs.org",
        MangaLibDomain::Org => "api.mangalib.org",
    }
}

/// One lightweight request through the configured proxy. Reports the real
/// failure (connect error, HTTP status) instead of a generic network code.
async fn probe_source(
    source: MangaSource,
    proxy_url: Option<&str>,
    domain: MangaLibDomain,
) -> Result<String, String> {
    let client = probe_client(proxy_url)?;
    let started = Instant::now();
    let (request, host) = match source {
        MangaSource::MangaLib => (
            client
                .get(format!("{}/api/manga", domain.api()))
                .header("Site-Id", "1")
                .header(reqwest::header::REFERER, domain.referer())
                .query(&[("q", "test")]),
            mangalib_host(domain),
        ),
        MangaSource::MangaDex => (
            client
                .get("https://api.mangadex.org/manga")
                .query(&[("limit", "1")]),
            "api.mangadex.org",
        ),
        MangaSource::ReadManga | MangaSource::AsuraScans => {
            // These sites reject the app user agent with 402, so reuse the
            // browser headers the catalog requests already send.
            let host = public_sources::referer(source);
            let request = public_sources::with_headers(client.get(host))
                .header(reqwest::header::REFERER, host);
            (request, host)
        }
    };
    let status = request
        .send()
        .await
        .map_err(|error| format!("{host}: {error}"))?
        .status();
    if !status.is_success() {
        return Err(format!("{host} HTTP {}", status.as_u16()));
    }
    Ok(format!("{host} - {} ms", started.elapsed().as_millis()))
}

/// Reachability check for manga proxies. Without a source it probes both main
/// catalog APIs so the shared proxy setting gets one verdict.
#[tauri::command]
pub async fn manga_source_test_proxy(
    source: Option<MangaSource>,
    proxy_url: Option<String>,
    manga_lib_domain: Option<MangaLibDomain>,
) -> Result<String, String> {
    let proxy = proxy_url.as_deref();
    let domain = manga_lib_domain.unwrap_or_default();
    let Some(source) = source else {
        let (lib, dex) = tokio::join!(
            probe_source(MangaSource::MangaLib, proxy, domain),
            probe_source(MangaSource::MangaDex, proxy, MangaLibDomain::default()),
        );
        return match (lib, dex) {
            (Ok(message), _) | (_, Ok(message)) => Ok(message),
            (Err(lib), Err(dex)) => Err(format!("{lib}; {dex}")),
        };
    };
    probe_source(source, proxy, domain).await
}

#[tauri::command]
pub async fn manga_details(
    source: MangaSource,
    id: String,
    nsfw: bool,
    proxy_url: Option<String>,
    manga_lib_domain: Option<MangaLibDomain>,
) -> Result<MangaDetails, SourceError> {
    match source {
        MangaSource::MangaLib => {
            lib_details(
                &id,
                proxy_url.as_deref(),
                manga_lib_domain.unwrap_or_default(),
            )
            .await
        }
        MangaSource::MangaDex => dex_details(&id, nsfw, proxy_url.as_deref()).await,
        MangaSource::ReadManga | MangaSource::AsuraScans => {
            public_sources::details(source, &id, nsfw, proxy_url.as_deref()).await
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn person_names_match_regardless_of_word_order() {
        let oda = normalized_person_name("Eiichiro Oda");
        assert!(same_person_name("Oda Eiichiro", &oda));
        assert!(same_person_name("Oda Eiichiro / 尾田栄一郎", &oda));
        assert!(!same_person_name("Tatsuki Fujimoto", &oda));
    }

    #[tokio::test]
    #[ignore = "live public person catalog"]
    async fn live_person_catalog_returns_manga() {
        for (source, name) in [
            (MangaSource::MangaLib, "Эйитиро Ода"),
            (MangaSource::MangaDex, "Эйитиро Ода"),
            (MangaSource::ReadManga, "Эйитиро Ода"),
            (MangaSource::AsuraScans, "Park Jungyeol"),
        ] {
            let person = MangaPersonSearch {
                name: name.to_owned(),
                role: MangaPersonRole::Author,
                key: None,
                source: Some(source),
            };
            let page = manga_search(source, String::new(), 1, false, Some(person), None, None)
                .await
                .expect("live person page");
            assert!(!page.items.is_empty(), "{} returned no manga", source.id());
        }
    }

    #[test]
    fn manga_lib_domain_selects_allowlisted_api_and_cover_hosts() {
        let client = lib_client(None).expect("MangaLib client");
        for (domain, host, referer) in [
            (
                MangaLibDomain::Me,
                "api.cdnlibs.org",
                "https://mangalib.me/",
            ),
            (
                MangaLibDomain::Org,
                "api.mangalib.org",
                "https://mangalib.org/",
            ),
        ] {
            let request = lib_request(&client, domain, "/123--test")
                .build()
                .expect("MangaLib request");
            assert_eq!(request.url().host_str(), Some(host));
            assert_eq!(request.headers()[reqwest::header::REFERER], referer);
        }
        assert!(allowed_lib_cover("https://cover.lib.social/cover.jpg").is_some());
        assert!(allowed_lib_cover("https://cover.cdnrulib.link/cover.jpg").is_some());
        assert!(allowed_lib_cover("https://cover.cdnrulib.link.invalid/cover.jpg").is_none());
        assert!(allowed_lib_cover("https://cover.imglib.info/cover.jpg").is_some());
        assert!(allowed_lib_cover("https://cover.imglib.info.invalid/cover.jpg").is_none());
        assert!(allowed_lib_cover("https://cover.imglib.info:444/cover.jpg").is_none());
        assert!(allowed_lib_cover("https://name@cover.imglib.info/cover.jpg").is_none());
        assert!(allowed_lib_cover("http://cover.imglib.info/cover.jpg").is_none());
    }

    #[test]
    fn manga_lib_uses_only_positive_anilist_manga_links() {
        let title = serde_json::json!({
            "name": "Sample",
            "slug_url": "123--sample",
            "externalLinks": [
                {"source_link": "https://anilist.co/anime/10/Anime"},
                {"source_link": "https://anilist.co.example.com/manga/20"},
                {"source_link": "https://anilist.co/manga/0"},
                {"source_link": "https://anilist.co/manga/42/Manga"}
            ]
        });
        let hit = parse_lib(&title).expect("valid title");
        assert_eq!(hit.external_ids.anilist, Some(42));

        let unrelated = serde_json::json!({
            "externalLinks": [
                {"source_link": "https://anilist.co/anime/10"},
                {"source_link": "https://example.com/manga/42"}
            ]
        });
        assert_eq!(lib_anilist_id(&unrelated), None);
        assert_eq!(
            lib_anilist_id(&serde_json::json!({"anilist_id": 37})),
            Some(37)
        );
    }

    #[test]
    fn catalog_fixtures_decode_with_source_pagination() {
        let lib = serde_json::from_str(include_str!("../../tests/fixtures/manga/lib-search.json"))
            .expect("MangaLib JSON");
        let dex = serde_json::from_str(include_str!("../../tests/fixtures/manga/dex-search.json"))
            .expect("MangaDex JSON");
        let lib = parse_search(MangaSource::MangaLib, &lib, 0, false).expect("MangaLib page");
        let dex = parse_search(MangaSource::MangaDex, &dex, 0, false).expect("MangaDex page");
        assert_eq!(lib.items[0].id, "206--one-piece");
        assert!(lib.items[0]
            .cover
            .as_deref()
            .is_some_and(|cover| cover.ends_with("d197bd65-b148-4ed1-a09e-9695a4461f1a.jpg")));
        assert_eq!(lib.items[0].status.as_deref(), Some("Онгоинг"));
        assert_eq!(lib.items[0].chapters, None);
        assert_eq!(dex.items[0].status.as_deref(), Some("completed"));
        assert!(lib.has_next);
        assert!(dex.items.iter().any(|item| item.title == "Yotsuba to!"));
    }

    #[test]
    fn search_meta_reads_available_chapter_counts() {
        let lib = serde_json::json!({
            "data": { "items_count": { "uploaded": 313, "total": 0 } }
        });
        assert_eq!(lib_chapter_count(&lib), Some(313));
        assert_eq!(
            lib_chapter_count(&serde_json::json!({
                "data": { "items_count": { "uploaded": 0, "total": 0 } }
            })),
            None
        );

        let dex = serde_json::json!({
            "volumes": {
                "1": { "chapters": { "1": {}, "2": {} } },
                "none": { "chapters": { "none": {} } }
            }
        });
        assert_eq!(dex_chapter_count(&dex), Some(3));
        assert_eq!(
            dex_chapter_count(&serde_json::json!({ "volumes": {} })),
            None
        );
    }

    #[tokio::test]
    #[ignore = "live search metadata"]
    async fn live_search_meta_returns_chapter_totals() {
        for (source, query) in [
            (MangaSource::MangaLib, "One Piece"),
            (MangaSource::MangaDex, "Yotsuba"),
        ] {
            let page = manga_search(source, query.to_owned(), 1, false, None, None, None)
                .await
                .expect("live catalog page");
            let ids: Vec<String> = page
                .items
                .iter()
                .take(2)
                .map(|hit| hit.id.clone())
                .collect();
            let meta = manga_search_meta(source, ids.clone(), None, None)
                .await
                .expect("live search metadata");
            assert_eq!(meta.len(), ids.len(), "{} counts", source.id());
            assert!(meta.iter().all(|row| row.chapters > 0));
        }
    }

    #[test]
    fn search_meta_rejects_foreign_ids() {
        assert!(valid_lib_id("34466--jeonjijeog-dogja-sijeom_"));
        assert!(!valid_lib_id("../secret"));
        assert!(valid_dex_id("0a580438-bc72-4503-940b-12a5da881b56"));
        assert!(!valid_dex_id("0a580438-bc72-4503-940b"));
        assert!(!valid_dex_id("0a580438-bc72-4503-940b-12a5da881b5z"));
    }

    #[test]
    fn chapter_fixtures_preserve_fractional_numbers_and_languages() {
        let lib =
            serde_json::from_str(include_str!("../../tests/fixtures/manga/lib-chapters.json"))
                .expect("MangaLib JSON");
        let dex: Value =
            serde_json::from_str(include_str!("../../tests/fixtures/manga/dex-feed.json"))
                .expect("MangaDex JSON");
        let lib = lib_chapters(&lib).expect("MangaLib chapters");
        let dex: Vec<_> = dex["data"]
            .as_array()
            .expect("chapters")
            .iter()
            .filter_map(dex_chapter)
            .collect();
        assert_eq!(lib[1].key, "0.5");
        assert_eq!(chapter_key(" ０.５０ "), "0.5");
        assert!(!lib[1].locked);
        assert!(dex.iter().any(|chapter| chapter.language == "ru"));
        assert!(dex.iter().any(|chapter| chapter.language == "en"));
    }

    #[tokio::test]
    #[ignore = "live public catalog"]
    async fn live_catalogs_return_results() {
        for (source, query) in [
            (MangaSource::MangaLib, "One Piece"),
            (MangaSource::MangaDex, "Yotsuba"),
        ] {
            let page = manga_search(source, query.to_owned(), 1, false, None, None, None)
                .await
                .expect("live catalog page");
            assert!(!page.items.is_empty());
        }
    }
}
