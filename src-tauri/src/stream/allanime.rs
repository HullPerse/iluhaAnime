//! `AllAnime` integration.
//!
//! Unlike `AnimeLib`, this source is built around a GraphQL API. Search and
//! show details use a normal POST request; episode sources use Apollo's
//! persisted-query GET (the full query trips a server-side bug) and fall back
//! to the POST shape when the persisted query is refused.
//!
//! Episode source requests also carry a time-bound `aaReq` token. The key is
//! assembled from the site's bootstrap endpoint (`partB`) and the client mask
//! extracted from its crypto chunk; the token is AES-256-GCM encrypted with the
//! five-minute bucket in its IV, and the answer's `data.tobeparsed` blob is
//! encrypted with the same key. Older mirrors still answer the legacy
//! AES-256-CTR `data.episode.tobeparsed` shape, so both are read. The layout is
//! reproduced from the public client implementations (`ani-cli`, `animdl`,
//! `luffy`); no third-party code is vendored.
//!
//! A source URL is XOR-ed with `0x38` and hex encoded. An internal path
//! (`/clock?...`) is fetched from `allanime.day` with `/clock.json` and maps to
//! mpv-playable HLS or MP4 links. Direct MP4/HLS URLs are returned as they are;
//! embed pages (mp4upload, ok.ru, Filemoon) are not playable by mpv and are
//! reported as unsupported instead of being handed to the player.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use aes::Aes256;
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::Engine as _;
use ctr::cipher::{KeyIvInit, StreamCipher};
use ctr::Ctr128BE;
use hmac::{Hmac, Mac};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::scrapers::clients::resolve_proxy;
use crate::stream::anime_lib_client::USER_AGENT;
use crate::stream::anime_lib_models::{
    AnimeLibAnime, AnimeLibEpisode, AnimeLibSearchFilters, AnimeLibSearchPage, AnimeLibVariant,
    AudioTrack, StreamResolutionError, StreamVariant, SubtitleTrack,
};
use crate::stream::anime_lib_resolver::keep_playable;
use crate::stream::commands::{
    AnimeLibEpisodesInput, AnimeLibPlayersInput, AnimeLibSourcesInput, AnimeLibTitle,
    AnimeLibTitleInput, SearchAnimeLibInput,
};

fn rate_limit_delay(message: &str) -> Option<Duration> {
    let seconds = message
        .strip_prefix("Too many requests, please try again in ")?
        .split_whitespace()
        .next()?
        .parse::<u64>()
        .ok()?;
    Some(Duration::from_secs(seconds.clamp(1, 30) + 1))
}

const API_BASE: &str = "https://api.mkissa.net/api";
const CLOCK_HOST: &str = "https://allanime.day";
const REFERER: &str = "https://mkissa.to";
const EPISODE_REFERER: &str = "https://mkissa.to";
const BOOTSTRAP_URL: &str = "https://api.mkissa.net/client-crypto/v1/bootstrap";
const BUILD_ID: &str = "190";
const CRYPTO_LANE: &str = "k7";
const CRYPTO_GROUP: &str = "mkissa";
const CRYPTO_HOST: &str = "mkissa.to";
const SALT_MUL: u32 = 179;
const SALT_ADD: u32 = 115;
const FRAG_MUL: u32 = 58;
const FRAG_ADD: u32 = 158;
const BOOT_PREFIX: &str = "rEVwtVi:";
const BOOT_JOIN: &str = "~";
const BOOT_PARTS: [&str; 5] = ["host", "lane", "buildId", "group", "epoch"];
const MASK_FRAGMENTS: [&str; 4] = [
    "J0mP4l4MHpw=",
    "rojHZpjcsso=",
    "RQPF6Dz59/E=",
    "UGdxCsEP9Cw=",
];
// The episode query text did not rotate with build 181 -> 190.
const EPISODE_QUERY_HASH: &str = "670bbf38d0868f446e2346c1e956ca2c40c416e733ca248fd54e04f1c8b99145";
const KEYGEN_TTL: Duration = Duration::from_secs(30 * 60);
const EPOCH_MS: i64 = 604_800_000;
const SOURCE_PREFIX: &str = "allanime:";
const SEARCH_LIMIT: i32 = 40;
const CACHE_TTL: Duration = Duration::from_secs(5 * 60);
const CACHE_LIMIT: usize = 32;

const SEARCH_QUERY: &str = r#"
query ($search: SearchInput, $limit: Int, $page: Int, $translationType: VaildTranslationTypeEnumType, $countryOrigin: VaildCountryOriginEnumType) {
  shows(search: $search, limit: $limit, page: $page, translationType: $translationType, countryOrigin: $countryOrigin) {
    edges { _id name thumbnail availableEpisodes }
  }
}
"#;

const SEARCH_QUERY_MIN: &str = r#"
query ($search: SearchInput, $limit: Int, $page: Int, $translationType: VaildTranslationTypeEnumType, $countryOrigin: VaildCountryOriginEnumType) {
  shows(search: $search, limit: $limit, page: $page, translationType: $translationType, countryOrigin: $countryOrigin) {
    edges { _id name availableEpisodes }
  }
}
"#;

const SHOW_QUERY: &str = r#"
query ($showId: String!) {
  show(_id: $showId) {
    _id name englishName nativeName thumbnail banner description status season score
    genres availableEpisodes availableEpisodesDetail
  }
}
"#;

const SHOW_QUERY_MIN: &str = r#"
query ($showId: String!) {
  show(_id: $showId) { _id name availableEpisodes availableEpisodesDetail }
}
"#;

const EPISODE_QUERY: &str = r#"
query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) {
  episode(showId: $showId, translationType: $translationType, episodeString: $episodeString) {
    episodeString sourceUrls
  }
}
"#;

/// A process-wide cache for the short-lived episode answer. `players` and
/// `stream_sources` both need the same rows, and the resolve is repeated when a
/// quality or a voice-over is switched.
struct CachedSources {
    at: Instant,
    sources: Vec<WireSource>,
}

static SOURCE_CACHE: OnceLock<Mutex<HashMap<String, CachedSources>>> = OnceLock::new();

fn source_cache() -> &'static Mutex<HashMap<String, CachedSources>> {
    SOURCE_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cache_get(key: &str) -> Option<Vec<WireSource>> {
    let mut cache = source_cache()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let entry = cache.get(key)?;
    if entry.at.elapsed() > CACHE_TTL {
        cache.remove(key);
        return None;
    }
    Some(entry.sources.clone())
}

fn cache_put(key: String, sources: Vec<WireSource>) {
    let mut cache = source_cache()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    if cache.len() >= CACHE_LIMIT {
        cache.clear();
    }
    cache.insert(
        key,
        CachedSources {
            at: Instant::now(),
            sources,
        },
    );
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AvailableEpisodes {
    #[serde(default)]
    sub: Option<i64>,
    #[serde(default)]
    dub: Option<i64>,
    #[serde(default)]
    raw: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchEdge {
    #[serde(rename = "_id", default)]
    id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    thumbnail: Option<String>,
    #[serde(default)]
    available_episodes: Option<AvailableEpisodes>,
}

#[derive(Debug, Deserialize)]
struct SearchData {
    shows: ShowsConnection,
}

#[derive(Debug, Deserialize)]
struct ShowsConnection {
    #[serde(default)]
    edges: Vec<SearchEdge>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Show {
    #[serde(rename = "_id", default)]
    id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    english_name: Option<String>,
    #[serde(default)]
    native_name: Option<String>,
    #[serde(default)]
    thumbnail: Option<String>,
    #[serde(default)]
    banner: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    season: Option<Value>,
    #[serde(default)]
    score: Option<f64>,
    #[serde(default)]
    genres: Vec<String>,
    #[serde(default)]
    available_episodes: Option<AvailableEpisodes>,
    #[serde(default)]
    available_episodes_detail: Option<HashMap<String, Vec<Value>>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EpisodeInfo {
    episode_id_num: f64,
    #[serde(default)]
    notes: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ShowData {
    show: Option<Show>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WireSource {
    #[serde(rename = "sourceUrl", default)]
    source_url: String,
    #[serde(rename = "sourceName", default)]
    source_name: String,
    #[serde(rename = "type", default)]
    source_type: String,
}

/// The rotating AllAnime crypto values. The build profile below is extracted
/// from the site's crypto chunk; only `epoch` and `partB` change per bootstrap.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
struct KeyGen {
    build_id: String,
    epoch: i64,
    lane: String,
    key: String,
    query_hash: String,
}

fn now_millis() -> Result<i64, StreamResolutionError> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .map_err(|error| StreamResolutionError::NetworkError {
            message: format!("system clock is before the Unix epoch: {error}"),
        })
}

fn current_epoch() -> Result<i64, StreamResolutionError> {
    Ok(now_millis()? / EPOCH_MS)
}

/// Build the 32-byte client mask from the four base64 fragments and the build
/// id. These are the derivation constants baked into the site's crypto chunk.
fn derive_mask(build_id: &str) -> Result<[u8; 32], StreamResolutionError> {
    let mut hashed = [0_u8; 32];
    let bytes = build_id.as_bytes();
    if bytes.is_empty() {
        return Err(StreamResolutionError::NetworkError {
            message: "AllAnime build id is empty".to_string(),
        });
    }
    for (index, slot) in hashed.iter_mut().enumerate() {
        let salt = (index as u32 * SALT_MUL + SALT_ADD) as u8;
        *slot = bytes[index % bytes.len()] ^ salt;
    }

    let mut mask = [0_u8; 32];
    for (fragment, encoded) in MASK_FRAGMENTS.iter().enumerate() {
        let part = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .map_err(|error| StreamResolutionError::NetworkError {
                message: format!("AllAnime mask fragment is not base64: {error}"),
            })?;
        let offset = fragment * 8;
        for index in 0..8 {
            let scramble = (fragment as u32 * FRAG_MUL + index as u32 * FRAG_ADD) as u8;
            mask[offset + index] = part[index] ^ hashed[offset + index] ^ scramble;
        }
    }
    Ok(mask)
}

fn boot_token(build_id: &str, epoch: i64) -> Result<String, StreamResolutionError> {
    let mask = derive_mask(build_id)?;
    let mut hmac = <Hmac<Sha256> as Mac>::new_from_slice(&mask).map_err(|error| {
        StreamResolutionError::NetworkError {
            message: format!("AllAnime boot key is invalid: {error}"),
        }
    })?;
    hmac.update(format!("{BOOT_PREFIX}{build_id}").as_bytes());
    let inner = hmac.finalize().into_bytes();

    let values = [
        ("host", CRYPTO_HOST.to_string()),
        ("lane", CRYPTO_LANE.to_string()),
        ("buildId", build_id.to_string()),
        ("group", CRYPTO_GROUP.to_string()),
        ("epoch", epoch.to_string()),
    ];
    let payload = BOOT_PARTS
        .iter()
        .map(|part| {
            values
                .iter()
                .find(|(name, _)| name == part)
                .map(|(_, value)| value.clone())
                .unwrap_or_default()
        })
        .collect::<Vec<_>>()
        .join(BOOT_JOIN);

    let mut signature = <Hmac<Sha256> as Mac>::new_from_slice(&inner).map_err(|error| {
        StreamResolutionError::NetworkError {
            message: format!("AllAnime boot key is invalid: {error}"),
        }
    })?;
    signature.update(payload.as_bytes());
    Ok(hex::encode(signature.finalize().into_bytes()))
}

static KEYGEN_CACHE: OnceLock<Mutex<Option<(Instant, KeyGen)>>> = OnceLock::new();

fn keygen_cache() -> &'static Mutex<Option<(Instant, KeyGen)>> {
    KEYGEN_CACHE.get_or_init(|| Mutex::new(None))
}

#[derive(Debug, Clone, Default, Deserialize)]
struct ClockSub {
    #[serde(default)]
    lang: String,
    #[serde(default)]
    label: String,
    #[serde(default)]
    src: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClockLink {
    #[serde(default)]
    link: String,
    #[serde(default)]
    src: String,
    #[serde(default)]
    hls: bool,
    #[serde(default)]
    resolution_str: String,
    #[serde(default)]
    subtitles: Vec<ClockSub>,
}

#[derive(Debug, Clone, Default, Deserialize)]
struct Clock {
    #[serde(default)]
    links: Vec<ClockLink>,
    #[serde(default)]
    subtitles: Vec<ClockSub>,
}

#[derive(Debug, Deserialize)]
struct GqlError {
    #[serde(default)]
    message: String,
}

/// The source id stored in catalog ids and history rows.
pub fn source_media_id(raw: &str) -> String {
    format!("{SOURCE_PREFIX}{raw}")
}

fn raw_media_id(id: &str) -> &str {
    id.strip_prefix(SOURCE_PREFIX).unwrap_or(id)
}

fn mode_label(mode: &str) -> &'static str {
    if mode == "dub" {
        "Dub"
    } else {
        "Sub"
    }
}

fn network_error(error: reqwest::Error) -> StreamResolutionError {
    StreamResolutionError::NetworkError {
        message: format!("AllAnime request failed: {error}"),
    }
}

fn refused(message: impl Into<String>) -> StreamResolutionError {
    StreamResolutionError::AuthRequired {
        message: message.into(),
    }
}

/// The site's API is readable with a browser User-Agent and its own referer.
/// A Cloudflare challenge answers HTML, which is reported as a refusal instead
/// of a parse error.
fn is_html(text: &str) -> bool {
    let head = text.trim_start();
    head.starts_with('<') || head.starts_with("<!DOCTYPE") || head.starts_with("<!doctype")
}

fn first_error(value: &Value) -> Option<String> {
    value
        .get("errors")
        .and_then(Value::as_array)
        .filter(|errors| !errors.is_empty())
        .map(|errors| {
            errors
                .iter()
                .filter_map(|error| serde_json::from_value::<GqlError>(error.clone()).ok())
                .map(|error| error.message)
                .filter(|message| !message.is_empty())
                .collect::<Vec<_>>()
                .join("; ")
        })
        .filter(|message| !message.is_empty())
}

pub struct AllAnimeClient {
    client: reqwest::Client,
    proxy: Option<String>,
}

impl AllAnimeClient {
    pub fn with_proxy(proxy: Option<String>) -> Result<Self, String> {
        let mut builder = reqwest::Client::builder()
            .timeout(Duration::from_secs(25))
            .user_agent(USER_AGENT)
            .cookie_store(true);
        if let Some(url) = proxy
            .as_deref()
            .map(str::trim)
            .filter(|url| !url.is_empty())
        {
            builder = builder.proxy(reqwest::Proxy::all(url).map_err(|error| error.to_string())?);
        }
        Ok(Self {
            client: builder.build().map_err(|error| error.to_string())?,
            proxy,
        })
    }

    fn cache_key(&self, show: &str, episode: &str, mode: &str) -> String {
        format!(
            "{}|{show}|{episode}|{mode}",
            self.proxy.as_deref().unwrap_or("")
        )
    }

    async fn read_value(
        &self,
        response: reqwest::Response,
    ) -> Result<Value, StreamResolutionError> {
        let status = response.status();
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("")
            .to_string();
        let text = response.text().await.map_err(network_error)?;

        if status == reqwest::StatusCode::FORBIDDEN
            || status == reqwest::StatusCode::SERVICE_UNAVAILABLE
        {
            return Err(refused(
                "AllAnime refused this client (Cloudflare challenge). Configure a proxy or pick another source.",
            ));
        }
        if !status.is_success() {
            return Err(StreamResolutionError::NetworkError {
                message: format!("AllAnime answered HTTP {}", status.as_u16()),
            });
        }
        if content_type.contains("text/html") || is_html(&text) {
            return Err(refused(
                "AllAnime answered with an HTML page instead of JSON. The source is blocking this client.",
            ));
        }
        serde_json::from_str(&text).map_err(|error| StreamResolutionError::NetworkError {
            message: format!("AllAnime returned invalid JSON: {error}"),
        })
    }

    async fn post_graphql(
        &self,
        query: &str,
        variables: Value,
    ) -> Result<Value, StreamResolutionError> {
        let response = self
            .client
            .post(API_BASE)
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .header(reqwest::header::ACCEPT, "application/json")
            .header(reqwest::header::REFERER, format!("{REFERER}/"))
            .header(reqwest::header::ORIGIN, REFERER)
            .json(&json!({ "query": query, "variables": variables }))
            .send()
            .await
            .map_err(network_error)?;
        let value = self.read_value(response).await?;
        if let Some(message) = first_error(&value) {
            if message.contains("NEED_CAPTCHA") {
                return Err(refused("AllAnime: NEED_CAPTCHA"));
            }
            if value.get("data").map(Value::is_null).unwrap_or(true) {
                return Err(StreamResolutionError::NetworkError {
                    message: format!("AllAnime: {message}"),
                });
            }
        }
        Ok(value.get("data").cloned().unwrap_or(Value::Null))
    }

    /// Ask the site's bootstrap for the current epoch and the second half of
    /// the AES key. The client mask is XORed with `partB`; the boot token is
    /// a double HMAC over the build profile, so no public keygen file is read.
    async fn bootstrap(&self, epoch: i64) -> Result<KeyGen, StreamResolutionError> {
        let token = boot_token(BUILD_ID, epoch)?;
        let response = self
            .client
            .get(BOOTSTRAP_URL)
            .query(&[("buildId", BUILD_ID), ("k", CRYPTO_LANE)])
            .header(reqwest::header::ACCEPT, "application/json")
            .header(reqwest::header::REFERER, format!("{EPISODE_REFERER}/"))
            .header(reqwest::header::ORIGIN, EPISODE_REFERER)
            .header("x-build-id", BUILD_ID)
            .header("x-aa-boot", token)
            .send()
            .await
            .map_err(network_error)?;
        let value = self.read_value(response).await?;
        let active_epoch = value.get("epoch").and_then(Value::as_i64).ok_or_else(|| {
            StreamResolutionError::NetworkError {
                message: "AllAnime bootstrap is missing its epoch".to_string(),
            }
        })?;
        let part_b = value.get("partB").and_then(Value::as_str).ok_or_else(|| {
            StreamResolutionError::NetworkError {
                message: "AllAnime bootstrap is missing partB".to_string(),
            }
        })?;
        let mask = derive_mask(BUILD_ID)?;
        let part = base64::engine::general_purpose::STANDARD
            .decode(part_b)
            .map_err(|error| StreamResolutionError::NetworkError {
                message: format!("AllAnime partB is not base64: {error}"),
            })?;
        if part.len() < 32 {
            return Err(StreamResolutionError::NetworkError {
                message: "AllAnime partB is too short".to_string(),
            });
        }
        let mut key = [0_u8; 32];
        for (index, byte) in key.iter_mut().enumerate() {
            *byte = mask[index] ^ part[index % part.len()];
        }
        Ok(KeyGen {
            build_id: BUILD_ID.to_string(),
            epoch: active_epoch,
            lane: CRYPTO_LANE.to_string(),
            key: hex::encode(key),
            query_hash: EPISODE_QUERY_HASH.to_string(),
        })
    }

    /// The current build's key material. A missing or malformed bootstrap uses
    /// the bundled profile instead of failing the whole catalog.
    async fn keygen(&self) -> Result<KeyGen, StreamResolutionError> {
        let now = Instant::now();
        {
            let cache = keygen_cache()
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            if let Some((at, keys)) = cache.as_ref() {
                if now.duration_since(*at) < KEYGEN_TTL {
                    return Ok(keys.clone());
                }
            }
        }

        let epoch = current_epoch()?;
        let mut last_error = None;
        for candidate in [epoch, epoch - 1] {
            match self.bootstrap(candidate).await {
                Ok(keys) => {
                    let mut cache = keygen_cache()
                        .lock()
                        .unwrap_or_else(std::sync::PoisonError::into_inner);
                    *cache = Some((now, keys.clone()));
                    return Ok(keys);
                }
                Err(error) => last_error = Some(error),
            }
        }
        Err(
            last_error.unwrap_or_else(|| StreamResolutionError::NetworkError {
                message: "AllAnime bootstrap failed".to_string(),
            }),
        )
    }

    async fn persisted_episode(
        &self,
        show: &str,
        episode: &str,
        mode: &str,
        keys: &KeyGen,
    ) -> Result<Value, StreamResolutionError> {
        for attempt in 0..3 {
            let token = build_aa_req(keys)?;
            let variables = json!({
                "showId": show,
                "translationType": mode,
                "episodeString": episode,
            });
            let extensions = json!({
                "persistedQuery": { "version": 1, "sha256Hash": keys.query_hash },
                "aaReq": token,
                "k": keys.lane,
            });
            let response = self
                .client
                .get(API_BASE)
                .query(&[
                    ("variables", variables.to_string()),
                    ("extensions", extensions.to_string()),
                ])
                .header(reqwest::header::ACCEPT, "application/json")
                .header(reqwest::header::REFERER, format!("{EPISODE_REFERER}/"))
                .header(reqwest::header::ORIGIN, EPISODE_REFERER)
                .header("x-build-id", &keys.build_id)
                .send()
                .await
                .map_err(network_error)?;
            let value = self.read_value(response).await?;
            if let Some(message) = first_error(&value) {
                if message.contains("NEED_CAPTCHA") {
                    return Err(refused("AllAnime: NEED_CAPTCHA"));
                }
                if let Some(delay) = rate_limit_delay(&message) {
                    if attempt < 2 {
                        tokio::time::sleep(delay).await;
                        continue;
                    }
                }
                // A refused persisted query can still carry the encrypted decoy;
                // let the caller decide whether there is a payload to decrypt.
                let has_payload = value.pointer("/data/episode/tobeparsed").is_some();
                if !has_payload {
                    return Err(StreamResolutionError::NetworkError {
                        message: format!("AllAnime episode: {message}"),
                    });
                }
            }
            return Ok(value.get("data").cloned().unwrap_or(Value::Null));
        }
        unreachable!("bounded episode retry always returns on its last attempt")
    }

    async fn search_page(
        &self,
        query: &str,
        page: i32,
        rich: bool,
        filters: &AnimeLibSearchFilters,
    ) -> Result<AnimeLibSearchPage, StreamResolutionError> {
        let variables = json!({
            "search": { "allowAdult": false, "allowUnknown": false, "query": query,
                "sortBy": match filters.sort_by.as_deref() {
                    Some("name") if filters.sort_type.as_deref() == Some("desc") => "Name_DESC",
                    Some("name") => "Name_ASC",
                    Some("created_at") => "Recent",
                    Some("views") => "Popular",
                    _ => "Top",
                }
            },
            "limit": SEARCH_LIMIT,
            "page": page,
            "translationType": "sub",
            "countryOrigin": "ALL",
        });
        let data = self
            .post_graphql(
                if rich { SEARCH_QUERY } else { SEARCH_QUERY_MIN },
                variables,
            )
            .await?;
        let parsed: SearchData =
            serde_json::from_value(data).map_err(|error| StreamResolutionError::NetworkError {
                message: format!("AllAnime search shape changed: {error}"),
            })?;
        let items = parsed
            .shows
            .edges
            .into_iter()
            .filter(|edge| !edge.id.trim().is_empty())
            .map(anime_from_edge)
            .collect();
        Ok(AnimeLibSearchPage {
            items,
            page,
            last_page: None,
            total: None,
        })
    }

    /// Search the catalog. The rich query carries a thumbnail; a deployment
    /// that dropped the field still answers the minimal query.
    pub async fn search(
        &self,
        query: &str,
        page: Option<i32>,
    ) -> Result<AnimeLibSearchPage, StreamResolutionError> {
        self.search_sorted(query, page, &AnimeLibSearchFilters::default())
            .await
    }

    async fn search_sorted(
        &self,
        query: &str,
        page: Option<i32>,
        filters: &AnimeLibSearchFilters,
    ) -> Result<AnimeLibSearchPage, StreamResolutionError> {
        let page = page.unwrap_or(1).max(1);
        match self.search_page(query, page, true, filters).await {
            Ok(result) if !result.items.is_empty() => Ok(result),
            first => {
                let fallback = self.search_page(query, page, false, filters).await;
                match (first, fallback) {
                    (Ok(result), _) => Ok(result),
                    (_, Ok(result)) => Ok(result),
                    (Err(error), Err(_)) => Err(error),
                }
            }
        }
    }

    async fn show_detail(&self, raw: &str) -> Result<Show, StreamResolutionError> {
        if let Ok(data) = self
            .post_graphql(SHOW_QUERY, json!({ "showId": raw }))
            .await
        {
            if let Ok(Some(show)) =
                serde_json::from_value::<ShowData>(data.clone()).map(|data| data.show)
            {
                if !show.name.trim().is_empty() {
                    return Ok(show);
                }
            }
        }
        let data = self
            .post_graphql(SHOW_QUERY_MIN, json!({ "showId": raw }))
            .await?;
        let show = serde_json::from_value::<ShowData>(data)
            .map_err(|error| StreamResolutionError::NetworkError {
                message: format!("AllAnime show shape changed: {error}"),
            })?
            .show
            .ok_or_else(|| StreamResolutionError::NoVariants {
                message: format!("AllAnime has no show {raw}"),
            })?;
        Ok(show)
    }

    async fn fill_episode_titles(&self, raw: &str, episodes: &mut [AnimeLibEpisode]) {
        let Some(last) = episodes.last() else {
            return;
        };
        let query = "query($showId:String!,$end:Float!){episodeInfos(showId:$showId,episodeNumStart:0,episodeNumEnd:$end){episodeIdNum notes}}";
        let Ok(data) = self
            .post_graphql(query, json!({"showId": raw, "end": last.number}))
            .await
        else {
            return;
        };
        let Ok(infos) = serde_json::from_value::<Vec<EpisodeInfo>>(
            data.get("episodeInfos").cloned().unwrap_or(Value::Null),
        ) else {
            return;
        };
        apply_episode_titles(episodes, infos);
    }

    /// The title and its episode list, enriched with optional episode names.
    pub async fn show(&self, slug: &str) -> Result<AnimeLibTitle, StreamResolutionError> {
        let raw = raw_media_id(slug.trim());
        let show = self.show_detail(raw).await?;
        let mut episodes = episodes_from(&show, raw);
        self.fill_episode_titles(raw, &mut episodes).await;
        Ok(AnimeLibTitle {
            anime: anime_from_show(show, raw),
            episodes,
        })
    }

    pub async fn episodes(
        &self,
        anime_id: &str,
    ) -> Result<Vec<AnimeLibEpisode>, StreamResolutionError> {
        let raw = raw_media_id(anime_id.trim());
        let show = self.show_detail(raw).await?;
        let mut episodes = episodes_from(&show, raw);
        self.fill_episode_titles(raw, &mut episodes).await;
        Ok(episodes)
    }

    /// Every selectable row: one per translation type and provider. A row that
    /// only names an embed page is dropped because mpv cannot open it.
    pub async fn players(
        &self,
        episode_id: &str,
    ) -> Result<Vec<AnimeLibVariant>, StreamResolutionError> {
        let (show, episode) = parse_episode_id(episode_id)?;
        let mut rows: Vec<AnimeLibVariant> = Vec::new();
        let mut last_error: Option<StreamResolutionError> = None;

        for mode in ["sub", "dub"] {
            match self.episode_sources(&show, &episode, mode).await {
                Ok(sources) => {
                    for source in sources {
                        if !is_supported_source(&source.source_name, &source.source_type)
                            && !is_direct_source(&source.source_url)
                        {
                            continue;
                        }
                        let name = if source.source_name.trim().is_empty() {
                            "Default".to_string()
                        } else {
                            source.source_name.trim().to_string()
                        };
                        let id = format!("{mode}:{name}");
                        if rows.iter().any(|row| row.id == id) {
                            continue;
                        }
                        rows.push(AnimeLibVariant {
                            id,
                            name: format!("{} · {}", mode_label(mode), name),
                            language: Some(mode_label(mode).to_string()),
                            separate_stream: true,
                            player: "AllAnime".to_string(),
                            source_url: source.source_url,
                        });
                    }
                }
                Err(error @ StreamResolutionError::AuthRequired { .. }) => {
                    if rows.is_empty() {
                        return Err(error);
                    }
                    break;
                }
                Err(error) => last_error = Some(error),
            }
        }

        if rows.is_empty() {
            return Err(
                last_error.unwrap_or_else(|| StreamResolutionError::NoVariants {
                    message: "This episode has no AllAnime players".to_string(),
                }),
            );
        }
        rows.sort_by(|left, right| left.name.cmp(&right.name));
        Ok(rows)
    }

    async fn episode_sources(
        &self,
        show: &str,
        episode: &str,
        mode: &str,
    ) -> Result<Vec<WireSource>, StreamResolutionError> {
        static EPISODE_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
        let _guard = EPISODE_LOCK.lock().await;
        let key = self.cache_key(show, episode, mode);
        if let Some(sources) = cache_get(&key) {
            return Ok(sources);
        }

        let keys = self.keygen().await?;
        let mut last_error: Option<StreamResolutionError> = None;
        match self.persisted_episode(show, episode, mode, &keys).await {
            Ok(data) => {
                if let Some(sources) = sources_from_data(&data, &keys)? {
                    cache_put(key.clone(), sources.clone());
                    return Ok(sources);
                }
            }
            Err(error @ StreamResolutionError::AuthRequired { .. }) => return Err(error),
            Err(error @ StreamResolutionError::NetworkError { .. })
                if error.to_string().contains("Too many requests") =>
            {
                return Err(error)
            }
            Err(error) => last_error = Some(error),
        }

        let variables = json!({
            "showId": show,
            "translationType": mode,
            "episodeString": episode,
        });
        match self.post_graphql(EPISODE_QUERY, variables).await {
            Ok(data) => {
                if let Some(sources) = sources_from_data(&data, &keys)? {
                    cache_put(key, sources.clone());
                    return Ok(sources);
                }
            }
            Err(error) => last_error = Some(error),
        }

        Err(
            last_error.unwrap_or_else(|| StreamResolutionError::NoVariants {
                message: format!("AllAnime has no {mode} sources for episode {episode}"),
            }),
        )
    }

    /// Resolve one provider row into playable candidates.
    pub async fn stream_sources(
        &self,
        episode_id: &str,
        variant_id: &str,
    ) -> Result<Vec<StreamVariant>, StreamResolutionError> {
        let (show, episode) = parse_episode_id(episode_id)?;
        let (mode, name) = parse_variant_id(variant_id)?;
        let sources = self.episode_sources(&show, &episode, mode).await?;
        let source = sources
            .into_iter()
            .find(|source| {
                let source_name = if source.source_name.trim().is_empty() {
                    "Default"
                } else {
                    source.source_name.trim()
                };
                source_name == name
            })
            .ok_or_else(|| StreamResolutionError::NoVariants {
                message: format!("AllAnime player {name} is not on this episode"),
            })?;

        let decoded = decode_source_url(&source.source_url).ok_or_else(|| {
            StreamResolutionError::UnsupportedFormat {
                message: "AllAnime returned a source URL that could not be decoded".to_string(),
            }
        })?;
        let headers = media_headers();

        if decoded.starts_with("http://") || decoded.starts_with("https://") {
            if !is_direct_url(&decoded) {
                return Err(StreamResolutionError::UnsupportedFormat {
                    message: format!("AllAnime provider {name} is an embed page, not a stream"),
                });
            }
            return Ok(keep_playable(vec![variant_from_url(
                variant_id,
                &decoded,
                "auto",
                false,
                headers,
                audio_tracks(mode),
            )]));
        }

        if !decoded.starts_with('/') {
            return Err(StreamResolutionError::UnsupportedFormat {
                message: format!("AllAnime provider {name} returned an unknown path"),
            });
        }

        let response = self
            .client
            .get(format!("{CLOCK_HOST}{decoded}"))
            .header(reqwest::header::ACCEPT, "application/json")
            .header(reqwest::header::REFERER, format!("{REFERER}/"))
            .header(reqwest::header::ORIGIN, REFERER)
            .send()
            .await
            .map_err(network_error)?;
        let value = self.read_value(response).await?;
        let clock = parse_clock(value);
        let audio = audio_tracks(mode);
        let mut variants: Vec<StreamVariant> = Vec::new();
        let mut seen: HashSet<String> = HashSet::new();

        for link in clock.links {
            let url = if !link.link.trim().is_empty() {
                link.link.trim().to_string()
            } else {
                link.src.trim().to_string()
            };
            if url.is_empty() {
                continue;
            }
            let url = if let Some(rest) = url.strip_prefix("//") {
                format!("https://{rest}")
            } else {
                url
            };
            if !seen.insert(url.clone()) {
                continue;
            }
            let quality = quality_label(&link.resolution_str);
            let mut subtitles = map_subtitles(&clock.subtitles, &headers);
            subtitles.extend(map_subtitles(&link.subtitles, &headers));
            dedupe_subtitles(&mut subtitles);
            variants.push(StreamVariant {
                variant_id: variant_id.to_string(),
                quality: quality.clone(),
                label: quality,
                r#type: container_of(&url, link.hls).to_string(),
                url,
                headers: headers.clone(),
                subtitles,
                audio_tracks: audio.clone(),
            });
        }

        if variants.is_empty() {
            return Err(StreamResolutionError::NoVariants {
                message: format!("AllAnime player {name} answered without playable links"),
            });
        }
        Ok(keep_playable(variants))
    }
}

fn anime_from_edge(edge: SearchEdge) -> AnimeLibAnime {
    let title = if edge.name.trim().is_empty() {
        edge.id.clone()
    } else {
        edge.name
    };
    let episode_count = edge
        .available_episodes
        .as_ref()
        .and_then(|counts| counts.sub.or(counts.dub).or(counts.raw))
        .map(|count| count as i32);
    AnimeLibAnime {
        id: source_media_id(&edge.id),
        title,
        synonyms: Vec::new(),
        cover: edge.thumbnail,
        banner: None,
        description: None,
        year: None,
        status: None,
        genres: Vec::new(),
        episode_count,
        rating: None,
        rating_votes: None,
        media_type: None,
        age_rating: None,
        views: None,
        anilist_id: None,
        sub_or_dub: None,
        slug_url: edge.id,
    }
}

fn anime_from_show(show: Show, raw: &str) -> AnimeLibAnime {
    let episode_count = episode_count(&show);
    let id = if show.id.trim().is_empty() {
        raw.to_string()
    } else {
        show.id
    };
    let title = if show.name.trim().is_empty() {
        id.clone()
    } else {
        show.name.clone()
    };
    let mut synonyms = Vec::new();
    for candidate in [show.english_name.as_deref(), show.native_name.as_deref()]
        .into_iter()
        .flatten()
    {
        let candidate = candidate.trim().to_string();
        if !candidate.is_empty() && candidate != title && !synonyms.contains(&candidate) {
            synonyms.push(candidate);
        }
    }
    AnimeLibAnime {
        id: source_media_id(raw),
        title,
        synonyms,
        cover: show.thumbnail,
        banner: show.banner,
        description: show.description,
        year: parse_year(show.season.as_ref()),
        status: show.status,
        genres: show.genres,
        episode_count,
        rating: show.score,
        rating_votes: None,
        media_type: None,
        age_rating: None,
        views: None,
        anilist_id: None,
        sub_or_dub: None,
        slug_url: raw.to_string(),
    }
}

fn apply_episode_titles(episodes: &mut [AnimeLibEpisode], infos: Vec<EpisodeInfo>) {
    for info in infos {
        if !info.episode_id_num.is_finite() || info.episode_id_num.fract() != 0.0 {
            continue;
        }
        let Some(title) = info
            .notes
            .map(|title| title.trim().to_string())
            .filter(|title| !title.is_empty())
        else {
            continue;
        };
        if let Some(episode) = episodes
            .iter_mut()
            .find(|episode| f64::from(episode.number) == info.episode_id_num)
        {
            episode.title = Some(title);
        }
    }
}

fn episode_count(show: &Show) -> Option<i32> {
    let from_detail = show
        .available_episodes_detail
        .as_ref()
        .map(|detail| detail.values().map(Vec::len).max().unwrap_or(0))
        .filter(|count| *count > 0)
        .map(|count| count as i32);
    from_detail.or_else(|| {
        show.available_episodes
            .as_ref()
            .and_then(|counts| counts.sub.or(counts.dub).or(counts.raw))
            .map(|count| count as i32)
    })
}

fn parse_year(season: Option<&Value>) -> Option<i32> {
    let season = season?;
    if let Some(year) = season.get("year").and_then(Value::as_i64) {
        return i32::try_from(year).ok();
    }
    let season = season.as_str()?;
    let digits: String = season.chars().filter(char::is_ascii_digit).collect();
    if digits.len() == 4 {
        digits.parse().ok()
    } else {
        None
    }
}

fn episode_string(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => {
            let trimmed = text.trim();
            (!trimmed.is_empty()).then(|| trimmed.to_string())
        }
        Value::Number(number) => Some(number.to_string()),
        _ => None,
    }
}

fn episodes_from(show: &Show, raw: &str) -> Vec<AnimeLibEpisode> {
    let mut numbers: BTreeMap<String, f64> = BTreeMap::new();

    if let Some(detail) = &show.available_episodes_detail {
        for mode in ["sub", "dub", "raw"] {
            let Some(values) = detail.get(mode) else {
                continue;
            };
            for value in values {
                let Some(text) = episode_string(value) else {
                    continue;
                };
                if let Ok(number) = text.parse::<f64>() {
                    numbers.insert(text, number);
                }
            }
        }
    }

    if numbers.is_empty() {
        let count = show
            .available_episodes
            .as_ref()
            .and_then(|counts| counts.sub.or(counts.dub).or(counts.raw))
            .unwrap_or(0);
        for number in 1..=count {
            numbers.insert(number.to_string(), number as f64);
        }
    }

    let mut episodes: Vec<AnimeLibEpisode> = numbers
        .into_iter()
        .map(|(text, number)| AnimeLibEpisode {
            id: format!("{}{}|{}", SOURCE_PREFIX, raw, text),
            number: number.round() as i32,
            title: None,
            air_date: None,
            duration: None,
            cover: None,
        })
        .collect();
    episodes.sort_by(|left, right| left.number.cmp(&right.number));
    episodes
}

fn parse_episode_id(episode_id: &str) -> Result<(String, String), StreamResolutionError> {
    let raw = raw_media_id(episode_id.trim());
    let (show, episode) =
        raw.split_once('|')
            .ok_or_else(|| StreamResolutionError::UnsupportedFormat {
                message: format!("AllAnime episode id is missing its show: {episode_id}"),
            })?;
    if show.trim().is_empty() || episode.trim().is_empty() {
        return Err(StreamResolutionError::UnsupportedFormat {
            message: format!("AllAnime episode id is incomplete: {episode_id}"),
        });
    }
    Ok((show.trim().to_string(), episode.trim().to_string()))
}

fn parse_variant_id(variant_id: &str) -> Result<(&str, &str), StreamResolutionError> {
    let rest = variant_id
        .strip_prefix("AllAnime:")
        .unwrap_or(variant_id)
        .trim();
    let (mode, name) =
        rest.split_once(':')
            .ok_or_else(|| StreamResolutionError::UnsupportedFormat {
                message: format!("AllAnime player id is incomplete: {variant_id}"),
            })?;
    if mode != "sub" && mode != "dub" {
        return Err(StreamResolutionError::UnsupportedFormat {
            message: format!("AllAnime player id has an unknown translation: {variant_id}"),
        });
    }
    let name = name.trim();
    if name.is_empty() {
        return Err(StreamResolutionError::UnsupportedFormat {
            message: format!("AllAnime player id is missing its provider: {variant_id}"),
        });
    }
    Ok((mode, name))
}

fn sources_from_data(
    data: &Value,
    keys: &KeyGen,
) -> Result<Option<Vec<WireSource>>, StreamResolutionError> {
    // Current builds encrypt the whole data object; the decrypted JSON still
    // nests the provider rows under `episode.sourceUrls`.
    if let Some(blob) = data.get("tobeparsed").and_then(Value::as_str) {
        let plain = decrypt_gcm_payload(blob, &keys.key)?;
        let value: Value =
            serde_json::from_str(&plain).map_err(|error| StreamResolutionError::NetworkError {
                message: format!("AllAnime episode payload is not JSON: {error}"),
            })?;
        return Ok(sources_from_value(value.pointer("/episode/sourceUrls")));
    }

    let episode = data.get("episode").unwrap_or(&Value::Null);
    if let Some(blob) = episode.get("tobeparsed").and_then(Value::as_str) {
        let plain = decrypt_payload(blob)?;
        let value: Value =
            serde_json::from_str(&plain).map_err(|error| StreamResolutionError::NetworkError {
                message: format!("AllAnime episode payload is not JSON: {error}"),
            })?;
        return Ok(sources_from_value(value.pointer("/episode/sourceUrls")));
    }
    Ok(sources_from_value(episode.get("sourceUrls")))
}

/// The `aaReq` extension: a compact JSON payload encrypted with the build key
/// in AES-256-GCM. `ts` is the current five-minute bucket in milliseconds, and
/// the nonce is the first 12 bytes of SHA-256(`epoch:queryHash:ts`).
fn build_aa_req(keys: &KeyGen) -> Result<String, StreamResolutionError> {
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| StreamResolutionError::NetworkError {
            message: format!("system clock is before the Unix epoch: {error}"),
        })?
        .as_millis() as i64;
    let ts = now_ms / 300_000 * 300_000;
    let payload = json!({
        "v": 1,
        "ts": ts,
        "epoch": keys.epoch,
        "buildId": keys.build_id,
        "qh": keys.query_hash,
        "k": keys.lane,
    });
    let nonce_hash = Sha256::digest(format!(
        "{}:{}:{}:{}:{}",
        keys.epoch, keys.build_id, keys.query_hash, ts, keys.lane
    ));
    let key =
        hex::decode(keys.key.trim()).map_err(|error| StreamResolutionError::UnsupportedFormat {
            message: format!("AllAnime keygen key is not hex: {error}"),
        })?;
    let cipher =
        Aes256Gcm::new_from_slice(&key).map_err(|_| StreamResolutionError::UnsupportedFormat {
            message: "AllAnime keygen key has the wrong length".to_string(),
        })?;
    let sealed = cipher
        .encrypt(
            Nonce::from_slice(&nonce_hash[..12]),
            payload.to_string().as_bytes(),
        )
        .map_err(|_| StreamResolutionError::UnsupportedFormat {
            message: "AllAnime aaReq could not be encrypted".to_string(),
        })?;
    let mut token = Vec::with_capacity(13 + sealed.len());
    token.push(1);
    token.extend_from_slice(&nonce_hash[..12]);
    token.extend_from_slice(&sealed);
    Ok(base64::engine::general_purpose::STANDARD.encode(token))
}

/// Decrypt the current `data.tobeparsed`: prefix byte, 12 IV bytes, ciphertext
/// and a 16-byte GCM tag.
fn decrypt_gcm_payload(blob: &str, key_hex: &str) -> Result<String, StreamResolutionError> {
    let data = base64::engine::general_purpose::STANDARD
        .decode(blob.trim())
        .map_err(|error| StreamResolutionError::UnsupportedFormat {
            message: format!("AllAnime episode payload is not base64: {error}"),
        })?;
    if data.len() < 30 {
        return Err(StreamResolutionError::UnsupportedFormat {
            message: "AllAnime episode payload is too short".to_string(),
        });
    }
    let key =
        hex::decode(key_hex.trim()).map_err(|error| StreamResolutionError::UnsupportedFormat {
            message: format!("AllAnime keygen key is not hex: {error}"),
        })?;
    let cipher =
        Aes256Gcm::new_from_slice(&key).map_err(|_| StreamResolutionError::UnsupportedFormat {
            message: "AllAnime keygen key has the wrong length".to_string(),
        })?;
    let plain = cipher
        .decrypt(Nonce::from_slice(&data[1..13]), &data[13..])
        .map_err(|_| StreamResolutionError::UnsupportedFormat {
            message: "AllAnime episode payload failed authentication".to_string(),
        })?;
    String::from_utf8(plain).map_err(|error| StreamResolutionError::UnsupportedFormat {
        message: format!("AllAnime episode payload is not UTF-8: {error}"),
    })
}

fn sources_from_value(value: Option<&Value>) -> Option<Vec<WireSource>> {
    let value = value?;
    let sources: Vec<WireSource> = serde_json::from_value(value.clone()).ok()?;
    let sources: Vec<WireSource> = sources
        .into_iter()
        .filter(|source| !source.source_url.trim().is_empty())
        .collect();
    (!sources.is_empty()).then_some(sources)
}

/// Decrypt `data.episode.tobeparsed`. The layout is fixed by the player:
/// one prefix byte, 12 IV bytes, the ciphertext, and 16 trailing bytes.
fn decrypt_payload(blob: &str) -> Result<String, StreamResolutionError> {
    let data = base64::engine::general_purpose::STANDARD
        .decode(blob.trim())
        .map_err(|error| StreamResolutionError::UnsupportedFormat {
            message: format!("AllAnime episode payload is not base64: {error}"),
        })?;
    if data.len() < 30 {
        return Err(StreamResolutionError::UnsupportedFormat {
            message: "AllAnime episode payload is too short".to_string(),
        });
    }

    let mut iv = [0u8; 16];
    iv[..12].copy_from_slice(&data[1..13]);
    iv[15] = 2;

    let key = Sha256::digest(b"Xot36i3lK3:v1");
    let mut cipher = Ctr128BE::<Aes256>::new_from_slices(&key, &iv).map_err(|_| {
        StreamResolutionError::UnsupportedFormat {
            message: "AllAnime episode payload has a bad key or IV".to_string(),
        }
    })?;
    let mut plain = data[13..data.len() - 16].to_vec();
    cipher.apply_keystream(&mut plain);
    String::from_utf8(plain).map_err(|error| StreamResolutionError::UnsupportedFormat {
        message: format!("AllAnime episode payload is not UTF-8: {error}"),
    })
}

/// `--` or `-` plus two hex digits per byte, XOR-ed with `0x38`. Internal
/// `/clock?...` paths become `/clock.json?...`.
pub fn decode_source_url(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return Some(trimmed.to_string());
    }
    let body = trimmed.trim_start_matches('-');
    if body.is_empty() || body.len() % 2 != 0 || !body.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return None;
    }
    let mut decoded = String::with_capacity(body.len() / 2);
    for pair in body.as_bytes().chunks_exact(2) {
        let hex = std::str::from_utf8(pair).ok()?;
        let byte = u8::from_str_radix(hex, 16).ok()? ^ 0x38;
        decoded.push(byte as char);
    }
    if let Some(rest) = decoded.strip_prefix("/clock?") {
        decoded = format!("/clock.json?{rest}");
    }
    (!decoded.is_empty()).then_some(decoded)
}

fn is_supported_source(name: &str, source_type: &str) -> bool {
    if !source_type.trim().is_empty() && source_type != "player" {
        return false;
    }
    matches!(name.trim(), "Default" | "Yt-mp4" | "S-mp4" | "Luf-Mp4")
}

fn is_direct_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.contains(".m3u8")
        || lower.contains(".mp4")
        || lower.contains(".mkv")
        || lower.contains("repackager.wixmp.com")
        || lower.contains("tools.fast4speed.rsvp")
}

fn is_direct_source(raw: &str) -> bool {
    let trimmed = raw.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return is_direct_url(trimmed);
    }
    decode_source_url(trimmed)
        .map(|url| is_direct_url(&url))
        .unwrap_or(false)
}

fn media_headers() -> BTreeMap<String, String> {
    let mut headers = BTreeMap::new();
    headers.insert("Referer".to_string(), format!("{REFERER}/"));
    headers.insert("Origin".to_string(), REFERER.to_string());
    headers.insert("User-Agent".to_string(), USER_AGENT.to_string());
    headers
}

fn audio_tracks(mode: &str) -> Vec<AudioTrack> {
    let (language, title) = if mode == "dub" {
        ("en", "English")
    } else {
        ("ja", "Japanese")
    };
    vec![AudioTrack {
        id: mode.to_string(),
        language: language.to_string(),
        title: Some(title.to_string()),
        default: true,
    }]
}

fn quality_label(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return "Auto".to_string();
    }
    if trimmed.eq_ignore_ascii_case("auto") || trimmed.ends_with('p') {
        trimmed.to_string()
    } else {
        format!("{trimmed}p")
    }
}

fn container_of(url: &str, hls: bool) -> &'static str {
    if hls || url.contains(".m3u8") {
        "m3u8"
    } else if url.contains(".mp4") {
        "mp4"
    } else if url.contains(".mkv") {
        "mkv"
    } else {
        "unknown"
    }
}

fn variant_from_url(
    variant_id: &str,
    url: &str,
    quality: &str,
    hls: bool,
    headers: BTreeMap<String, String>,
    audio: Vec<AudioTrack>,
) -> StreamVariant {
    StreamVariant {
        variant_id: variant_id.to_string(),
        quality: quality.to_string(),
        label: quality.to_string(),
        url: url.to_string(),
        r#type: container_of(url, hls).to_string(),
        headers,
        subtitles: Vec::new(),
        audio_tracks: audio,
    }
}

fn map_subtitles(subs: &[ClockSub], headers: &BTreeMap<String, String>) -> Vec<SubtitleTrack> {
    subs.iter()
        .enumerate()
        .filter_map(|(index, sub)| {
            let url = sub.src.trim();
            if url.is_empty() {
                return None;
            }
            let language = if sub.label.trim().is_empty() {
                sub.lang.trim()
            } else {
                sub.label.trim()
            };
            let english = sub.lang.to_ascii_lowercase().starts_with("en")
                || language.to_ascii_lowercase().contains("english");
            Some(SubtitleTrack {
                id: format!("allanime-sub-{index}"),
                url: url.to_string(),
                language: language.to_string(),
                is_default: index == 0 && english,
                headers: headers.clone(),
            })
        })
        .collect()
}

fn dedupe_subtitles(subtitles: &mut Vec<SubtitleTrack>) {
    let mut seen: HashSet<String> = HashSet::new();
    subtitles.retain(|subtitle| seen.insert(subtitle.url.clone()));
}

fn parse_clock(value: Value) -> Clock {
    if let Ok(clock) = serde_json::from_value::<Clock>(value.clone()) {
        return clock;
    }
    let links = serde_json::from_value::<Vec<ClockLink>>(value).unwrap_or_default();
    Clock {
        links,
        subtitles: Vec::new(),
    }
}

fn client_for(
    proxy_url: Option<String>,
    proxy_url_camel: Option<String>,
) -> Result<AllAnimeClient, String> {
    AllAnimeClient::with_proxy(resolve_proxy(proxy_url, proxy_url_camel))
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn allanime_test_connection(
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<String, String> {
    let page = client_for(proxy_url, proxyUrl)?
        .search("a", Some(1))
        .await
        .map_err(|error| error.to_string())?;
    Ok(format!("{} titles", page.items.len()))
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn allanime_search(
    input: SearchAnimeLibInput,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<AnimeLibSearchPage, String> {
    client_for(proxy_url, proxyUrl)?
        .search_sorted(&input.query, input.page, &input.filters)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn allanime_title(
    input: AnimeLibTitleInput,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<AnimeLibTitle, String> {
    client_for(proxy_url, proxyUrl)?
        .show(&input.slug)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn allanime_episodes(
    input: AnimeLibEpisodesInput,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<AnimeLibEpisode>, String> {
    client_for(proxy_url, proxyUrl)?
        .episodes(&input.anime_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn allanime_players(
    input: AnimeLibPlayersInput,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<AnimeLibVariant>, String> {
    client_for(proxy_url, proxyUrl)?
        .players(&input.episode_id)
        .await
        .map_err(|error| error.to_string())
}

/// Resolve a selected AllAnime player into every playable quality it offers.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn allanime_stream_sources(
    input: AnimeLibSourcesInput,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<StreamVariant>, String> {
    client_for(proxy_url, proxyUrl)?
        .stream_sources(&input.episode_id, &input.variant_id)
        .await
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rate_limit_wait_is_bounded_and_only_retries_the_server_limit() {
        assert_eq!(
            rate_limit_delay("Too many requests, please try again in 3 seconds."),
            Some(Duration::from_secs(4))
        );
        assert_eq!(
            rate_limit_delay("Too many requests, please try again in 999 seconds."),
            Some(Duration::from_secs(31))
        );
        assert_eq!(rate_limit_delay("Invalid token"), None);
        assert_eq!(
            rate_limit_delay("Too many requests, please try again in unknown seconds."),
            None
        );
    }

    #[test]
    fn object_season_keeps_the_rich_show_metadata() {
        let show: Show = serde_json::from_value(json!({
            "_id": "abc", "name": "Frieren", "thumbnail": "https://s4.anilist.co/cover.jpg",
            "season": { "quarter": "Fall", "year": 2023 }, "score": 9.26
        }))
        .expect("current API shape");
        let anime = anime_from_show(show, "abc");
        assert_eq!(
            anime.cover.as_deref(),
            Some("https://s4.anilist.co/cover.jpg")
        );
        assert_eq!(anime.year, Some(2023));
        assert_eq!(anime.rating, Some(9.26));
        assert_eq!(parse_year(Some(&json!("Fall 2023"))), Some(2023));
        assert_eq!(parse_year(Some(&json!({}))), None);
    }

    #[test]
    fn episode_notes_match_by_number_and_empty_notes_do_not_erase_titles() {
        let show = Show {
            available_episodes: Some(AvailableEpisodes {
                sub: Some(2),
                dub: None,
                raw: None,
            }),
            ..Show::default()
        };
        let mut episodes = episodes_from(&show, "abc");
        let infos = serde_json::from_value(json!([
            { "episodeIdNum": 2, "notes": "  Second episode  " },
            { "episodeIdNum": 1, "notes": "First episode" },
            { "episodeIdNum": 1, "notes": " " },
            { "episodeIdNum": 1.5, "notes": "Special" },
            { "episodeIdNum": 99, "notes": "Other" }
        ]))
        .expect("episode infos");
        apply_episode_titles(&mut episodes, infos);
        assert_eq!(episodes[0].title.as_deref(), Some("First episode"));
        assert_eq!(episodes[1].title.as_deref(), Some("Second episode"));
        assert_eq!(episodes[0].id, "allanime:abc|1");
    }

    #[tokio::test]
    #[ignore = "live AllAnime metadata"]
    async fn live_title_cover_and_episode_names() {
        let client = AllAnimeClient::with_proxy(None).expect("client");
        let title = client.show("ReHMC7TQnch3C6z8j").await.expect("show");
        assert!(title
            .anime
            .cover
            .as_deref()
            .is_some_and(|url| url.starts_with("https://")));
        assert_eq!(title.anime.year, Some(2023));
        assert_eq!(
            title
                .episodes
                .first()
                .and_then(|episode| episode.title.as_deref()),
            Some("The Journey's End")
        );
        println!(
            "cover={:?}, year={:?}, first episode={:?}",
            title.anime.cover, title.anime.year, title.episodes[0].title
        );
    }

    fn encode_xor(value: &str) -> String {
        let mut out = String::from("--");
        for byte in value.bytes() {
            out.push_str(&format!("{:02x}", byte ^ 0x38));
        }
        out
    }

    #[test]
    fn xor_decodes_the_reference_pair() {
        assert_eq!(decode_source_url("--79557a59"), Some("AmBa".to_string()));
    }

    #[test]
    fn clock_paths_gain_the_json_suffix() {
        let encoded = encode_xor("/clock?id=42");
        assert_eq!(
            decode_source_url(&encoded),
            Some("/clock.json?id=42".to_string())
        );
    }

    #[test]
    fn direct_urls_pass_through() {
        assert_eq!(
            decode_source_url("https://tools.fast4speed.rsvp/a.mp4"),
            Some("https://tools.fast4speed.rsvp/a.mp4".to_string())
        );
    }

    #[test]
    fn a_malformed_hex_payload_is_rejected() {
        assert_eq!(decode_source_url("--zz"), None);
        assert_eq!(decode_source_url("--123"), None);
    }

    #[test]
    fn episode_ids_carry_the_show_and_the_number() {
        let (show, episode) = parse_episode_id("allanime:abc123|7").expect("parses");
        assert_eq!(show, "abc123");
        assert_eq!(episode, "7");
        assert!(parse_episode_id("allanime:abc123").is_err());
        assert!(parse_episode_id("allanime:|7").is_err());
    }

    #[test]
    fn variant_ids_carry_the_mode_and_the_provider() {
        let (mode, name) = parse_variant_id("AllAnime:sub:Default").expect("parses");
        assert_eq!(mode, "sub");
        assert_eq!(name, "Default");
        assert!(parse_variant_id("AllAnime:raw:Default").is_err());
        assert!(parse_variant_id("AllAnime:sub").is_err());
    }

    #[test]
    fn the_episode_payload_round_trips_through_aes_ctr() {
        let plain =
            br#"{"episode":{"sourceUrls":[{"sourceUrl":"--79557a59","sourceName":"Default"}]}}"#;
        let key = Sha256::digest(b"Xot36i3lK3:v1");
        let mut iv = [0u8; 16];
        iv[..12].copy_from_slice(&[11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
        iv[15] = 2;
        let mut cipher = Ctr128BE::<Aes256>::new_from_slices(&key, &iv).expect("cipher");
        let mut ciphertext = plain.to_vec();
        cipher.apply_keystream(&mut ciphertext);

        let mut payload = vec![0u8];
        payload.extend_from_slice(&iv[..12]);
        payload.extend_from_slice(&ciphertext);
        payload.extend_from_slice(&[0u8; 16]);
        let encoded = base64::engine::general_purpose::STANDARD.encode(payload);

        let decoded = decrypt_payload(&encoded).expect("decrypts");
        assert_eq!(decoded.as_bytes(), plain);
    }

    #[test]
    fn show_episodes_merge_sub_and_dub_without_duplicates() {
        let show = Show {
            available_episodes_detail: Some(HashMap::from([
                ("sub".to_string(), vec![json!(1), json!(2), json!("2.5")]),
                ("dub".to_string(), vec![json!(1), json!(3)]),
            ])),
            ..Default::default()
        };
        let episodes = episodes_from(&show, "abc");
        assert_eq!(episodes.len(), 4);
        assert_eq!(episodes[0].id, "allanime:abc|1");
        assert_eq!(episodes[0].number, 1);
        assert_eq!(episodes[3].id, "allanime:abc|3");
    }

    #[test]
    fn a_show_without_detail_falls_back_to_the_episode_count() {
        let show = Show {
            available_episodes: Some(AvailableEpisodes {
                sub: Some(3),
                dub: None,
                raw: None,
            }),
            ..Default::default()
        };
        let episodes = episodes_from(&show, "abc");
        assert_eq!(episodes.len(), 3);
        assert_eq!(episodes[2].id, "allanime:abc|3");
    }

    #[test]
    fn embeds_are_not_offered_as_players() {
        assert!(is_supported_source("Default", "player"));
        assert!(is_supported_source("Luf-Mp4", "player"));
        assert!(!is_supported_source("Default", "iframe"));
        assert!(!is_supported_source("Fm-mp4", "player"));
        assert!(is_direct_source("https://tools.fast4speed.rsvp/a.mp4"));
    }

    #[test]
    fn the_clock_answer_maps_links_and_soft_subs() {
        let value = json!({
            "links": [
                {
                    "link": "https://cdn.example/master.m3u8",
                    "hls": true,
                    "resolutionStr": "1080",
                    "subtitles": [{ "lang": "en", "label": "English", "src": "https://cdn.example/en.vtt" }]
                },
                { "src": "https://cdn.example/720.mp4", "resolutionStr": "720" }
            ],
            "subtitles": [{ "lang": "en", "label": "English", "src": "https://cdn.example/en.vtt" }]
        });
        let clock = parse_clock(value);
        assert_eq!(clock.links.len(), 2);
        assert_eq!(quality_label(&clock.links[0].resolution_str), "1080p");
        assert_eq!(container_of(&clock.links[0].link, true), "m3u8");
        let mut subs = map_subtitles(&clock.subtitles, &media_headers());
        subs.extend(map_subtitles(&clock.links[0].subtitles, &media_headers()));
        dedupe_subtitles(&mut subs);
        assert_eq!(subs.len(), 1);
    }

    /// Live probe for the whole AllAnime chain: search, show/episodes, players
    /// and one resolved media source. Ignored so CI and offline builds stay
    /// green; run it with
    /// `cargo test --lib stream::allanime::tests::live -- --ignored --nocapture`.
    #[tokio::test]
    #[ignore = "live network check against AllAnime"]
    async fn live_search_title_episodes_and_one_playable_source() {
        let client = AllAnimeClient::with_proxy(None).expect("client");
        let page = client.search("Frieren", Some(1)).await.expect("search");
        assert!(!page.items.is_empty(), "search returned no titles");
        println!("search: {} titles", page.items.len());

        let picked = page
            .items
            .iter()
            .find(|item| item.title == "Sousou no Frieren")
            .or_else(|| page.items.first())
            .expect("a title");
        println!("title: {} ({})", picked.title, picked.id);

        let title = client.show(&picked.id).await.expect("show");
        assert!(!title.episodes.is_empty(), "show returned no episodes");
        println!("episodes: {}", title.episodes.len());

        let episode = title.episodes.first().expect("an episode");
        let players = client.players(&episode.id).await.expect("players");
        assert!(!players.is_empty(), "episode returned no players");
        println!("players: {}", players.len());

        let mut resolved = None;
        for row in &players {
            let variant = format!("{}:{}", row.player, row.id);
            match client.stream_sources(&episode.id, &variant).await {
                Ok(sources) if !sources.is_empty() => {
                    println!("resolved {}: {}", row.name, sources.len());
                    resolved = Some(sources);
                    break;
                }
                Ok(_) => println!("no sources: {}", row.name),
                Err(error) => println!("resolve failed for {}: {error}", row.name),
            }
        }

        let sources = resolved.expect("no player produced a playable source");
        let playable = sources.first().expect("a playable source");
        assert!(
            playable.url.starts_with("http"),
            "bad media URL: {}",
            playable.url
        );
        println!(
            "source: {} {} subs={}",
            playable.label,
            playable.url,
            playable.subtitles.len()
        );
    }

    #[test]
    fn build_190_boot_token_matches_the_site() {
        assert_eq!(
            boot_token("190", 2968).expect("token"),
            "4a8beabb9f230cd4fb9aa972242a403eccfc0c7f3e6d274b083c30e198c9d5b3"
        );
    }

    #[test]
    fn the_source_prefix_round_trips() {
        let id = source_media_id("abc");
        assert_eq!(id, "allanime:abc");
        assert_eq!(raw_media_id(&id), "abc");
        assert_eq!(raw_media_id("123"), "123");
    }
}
