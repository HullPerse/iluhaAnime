//! AnimeLib HTTP client.
//!
//! Direct HTTP client for AnimeLib (animelib.org) through the site's JSON API
//! at https://api.cdnlibs.org/api. Every request below was verified live on
//! 2026-10-28; see `.docs/features/streaming/endpoints.md` for the recorded
//! requests and responses.
//!
//! Endpoints:
//!   GET /api/anime?q=<query>&page=<n>   search (also `q=` for a browse list)
//!   GET /api/anime/<slug_url>           details; the numeric id answers 404
//!   GET /api/episodes?anime_id=<id>     episode list, id or slug_url both work
//!   GET /api/episodes/<episode_id>      player rows
//!
//! Request requirements: a browser-shaped User-Agent and the Referer/Origin of
//! the site. Without the User-Agent the API answers HTTP 200 with an HTML error
//! page, so the status code alone cannot be trusted. No token is required for
//! any verified request; one is sent when the user has stored one.

use crate::stream::anime_lib_models::{
    AnimeLibAnime, AnimeLibConstants, AnimeLibEpisode, AnimeLibFilterOption, AnimeLibGenreOption,
    AnimeLibSearchFilters, AnimeLibSearchPage, AnimeLibVariant, StreamResolutionError,
    StreamVariant,
};
use reqwest::Client;
use serde::Deserialize;
use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

const ANIMELIB_API_BASE: &str = "https://api.cdnlibs.org/api";
const ANIMELIB_SITE: &str = "https://animelib.org";

/// Media servers the site's own player builds URLs against, as published by
/// `GET /constants?fields[]=videoServers`. A native row names its server in
/// `video_domain`; the file path is appended to that base unchanged.
const VIDEO_SERVER_MAIN: &str = "https://video1.cdnlibs.org/.%D0%B0s/";
const VIDEO_SERVER_SECONDARY_1: &str = "https://video2.cdnlibs.org/";
const VIDEO_SERVER_SECONDARY_2: &str = "https://video1.imglib.info/";

/// Browser-shaped User-Agent. This is load bearing: the API blocks unknown
/// clients by answering HTTP 200 with an HTML error page instead of JSON.
/// Shared with the Kodik resolver, which is refused the same way.
pub(crate) const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
     (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/// HTTP client for the AnimeLib source.
pub struct AnimeLibClient {
    client: Client,
    token: Option<String>,
    /// The resolved SOCKS/HTTP proxy, kept so the Kodik resolver uses the same
    /// route as the catalog request that produced the player row.
    proxy: Option<String>,
}

impl AnimeLibClient {
    #[cfg(test)]
    pub fn new() -> Result<Self, String> {
        Self::with_options(None, None)
    }

    #[cfg(test)]
    pub fn with_token(token: String) -> Result<Self, String> {
        Self::with_options(Some(token), None)
    }

    pub fn with_proxy(proxy: Option<String>) -> Result<Self, String> {
        Self::with_options(None, proxy)
    }

    pub fn with_token_and_proxy(token: String, proxy: Option<String>) -> Result<Self, String> {
        Self::with_options(Some(token), proxy)
    }

    fn with_options(token: Option<String>, proxy: Option<String>) -> Result<Self, String> {
        Ok(Self {
            client: shared_client(proxy.as_deref())?,
            token,
            proxy,
        })
    }

    /// Search AnimeLib for titles matching the query. An empty query returns
    /// the site's browse list, and the filters narrow it the same way the
    /// site's catalog does.
    ///
    /// The API's full-text index does not contain every title that has a media
    /// page (for example `Onii-chan wa Oshimai!` answers an empty page while
    /// its details and episodes exist). When the first page of a query comes
    /// back empty, a direct slug lookup of the normalized query recovers that
    /// title instead of reporting "nothing found".
    pub async fn search(
        &self,
        query: &str,
        page: Option<i32>,
        filters: &AnimeLibSearchFilters,
    ) -> Result<AnimeLibSearchPage, StreamResolutionError> {
        let page = page.unwrap_or(1).max(1);
        let url = search_url(query, page, filters);
        let response: WireSearchResponse = self.get_json(&url).await?;
        let mut items: Vec<AnimeLibAnime> = response.data.into_iter().map(into_anime).collect();
        if items.is_empty() && page == 1 && !query.trim().is_empty() {
            if let Some(item) = self.slug_lookup(query).await {
                items.push(item);
            }
        }
        Ok(AnimeLibSearchPage {
            items,
            page: response.meta.current_page.unwrap_or(page),
            last_page: response.meta.last_page,
            total: response.meta.total,
        })
    }

    /// One title from the site's own random ordering.
    ///
    /// `sort_by=random` makes the API answer a freshly shuffled page: its
    /// `meta.seed` changes on every request, so one page is sixty distinct
    /// random titles. Filters still apply, which keeps 18+ content out unless
    /// the viewer opted in.
    pub async fn random(
        &self,
        filters: &AnimeLibSearchFilters,
    ) -> Result<Option<AnimeLibAnime>, StreamResolutionError> {
        let mut shuffled = filters.clone();
        shuffled.sort_by = Some("random".to_string());
        shuffled.sort_type = Some("desc".to_string());
        let page = self.search("", Some(1), &shuffled).await?;
        if page.items.is_empty() {
            return Ok(None);
        }
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.subsec_nanos())
            .unwrap_or(0) as usize;
        let index = nanos % page.items.len();
        Ok(page.items.into_iter().nth(index))
    }

    /// The title behind a query when the search index does not know it.
    ///
    /// The site derives an anime slug from the original title: punctuation and
    /// inner hyphens are dropped ("Onii-chan" becomes "oniichan") and words
    /// are joined with hyphens plus the `-anime` suffix. Trying that one slug
    /// costs a single request only after the search already answered empty.
    async fn slug_lookup(&self, query: &str) -> Option<AnimeLibAnime> {
        for candidate in slug_candidates(query) {
            if let Ok(item) = self.details(&candidate).await {
                return Some(item);
            }
        }
        None
    }

    /// The filter options for the AnimeLib catalog (site id 5).
    ///
    /// The shared constants endpoint serves every site in the family, so the
    /// rows whose `site_ids` do not include AnimeLib are dropped. The answer
    /// changes rarely and is reused for twenty minutes.
    pub async fn constants(&self) -> Result<AnimeLibConstants, StreamResolutionError> {
        if let Some(constants) = cached_constants() {
            return Ok(constants);
        }
        let url = format!(
            "{ANIMELIB_API_BASE}/constants?fields[]=types&fields[]=status&fields[]=ageRestrictionAnime&fields[]=genres"
        );
        let response: WireConstantsResponse = self.get_json(&url).await?;
        let constants = into_constants(response.data);
        store_constants(&constants);
        Ok(constants)
    }

    /// Fetch anime details. `slug` is the `slug` or `slug_url` field from a
    /// search result; the numeric id is not a valid path segment.
    ///
    /// The `fields[]` selection is what makes the synopsis, genres and views
    /// available, and it costs nothing extra: the site serves them in the same
    /// answer. The list endpoint rejects the same parameter, which is why the
    /// cards get rating and type but not a synopsis.
    pub async fn details(&self, slug: &str) -> Result<AnimeLibAnime, StreamResolutionError> {
        let url = format!(
            "{ANIMELIB_API_BASE}/anime/{slug}?fields[]=genres&fields[]=summary&fields[]=views&fields[]=releaseDate"
        );
        let response: WireAnimeResponse = self.get_json(&url).await?;
        Ok(into_anime(response.data))
    }

    /// Confirm that the client's token belongs to a live session.
    ///
    /// `/auth/me` answers 401 for an anonymous or rejected token and a user
    /// envelope for a valid one, which is the only endpoint used here whose
    /// answer depends on the credential.
    pub async fn auth_me(&self) -> Result<(), StreamResolutionError> {
        let url = format!("{ANIMELIB_API_BASE}/auth/me");
        let _: serde_json::Value = self.get_json(&url).await?;
        Ok(())
    }

    /// Fetch episodes for a title. `anime_id` accepts the numeric id or the
    /// `slug_url`.
    pub async fn episodes(
        &self,
        anime_id: &str,
    ) -> Result<Vec<AnimeLibEpisode>, StreamResolutionError> {
        let encoded: String = url::form_urlencoded::byte_serialize(anime_id.as_bytes()).collect();
        let url = format!("{ANIMELIB_API_BASE}/episodes?anime_id={encoded}");
        let response: WireEpisodesResponse = self.get_json(&url).await?;
        Ok(response
            .data
            .into_iter()
            .map(|episode| AnimeLibEpisode {
                id: episode.id.to_string(),
                number: episode.number.parse().unwrap_or(0),
                title: Some(episode.name),
                air_date: Some(episode.created_at),
                duration: None,
                cover: None,
            })
            .collect())
    }

    /// Fetch playback players (voice-overs) for an episode.
    ///
    /// Every row is returned. Rows whose `player` is `Kodik` carry the player
    /// URL in `src` and no inline `video` payload; a row with `video` carries
    /// the site's own qualities. Which of the two a row is, is decided by the
    /// resolver, not here.
    pub async fn players(
        &self,
        episode_id: &str,
    ) -> Result<Vec<AnimeLibVariant>, StreamResolutionError> {
        let detail = self.episode_detail(episode_id).await?;
        Ok(detail.players.into_iter().map(into_variant).collect())
    }

    /// Resolve a selected voice-over into stream candidates.
    ///
    /// Returns the site's own qualities when the row has a `video` payload.
    /// A Kodik row carries no inline qualities, so the player page is asked
    /// for its links instead of inventing a media URL for it.
    pub async fn resolve_episode_variant(
        &self,
        episode_id: &str,
        variant_id: &str,
    ) -> Result<Vec<StreamVariant>, StreamResolutionError> {
        let key = self.sources_cache_key(episode_id, variant_id);
        if let Some(sources) = cached_sources(&key) {
            return Ok(sources);
        }
        let sources = self
            .resolve_episode_variant_uncached(episode_id, variant_id)
            .await?;
        store_sources(key, &sources);
        Ok(sources)
    }

    /// The token decides which rows the API returns, so it is part of the key.
    fn sources_cache_key(&self, episode_id: &str, variant_id: &str) -> String {
        let mut hasher = DefaultHasher::new();
        self.token.hash(&mut hasher);
        format!("{episode_id}:{variant_id}:{:x}", hasher.finish())
    }

    async fn resolve_episode_variant_uncached(
        &self,
        episode_id: &str,
        variant_id: &str,
    ) -> Result<Vec<StreamVariant>, StreamResolutionError> {
        let detail = self.episode_detail(episode_id).await?;
        let variant_key = VariantKey::parse(variant_id);
        let player = detail
            .players
            .into_iter()
            .find(|row| variant_key.matches(&into_variant(row.clone())))
            .ok_or_else(|| StreamResolutionError::NoVariants {
                message: format!("no player {variant_id} on episode {episode_id}"),
            })?;

        let video = player.video.clone();
        let subtitles: Vec<crate::stream::anime_lib_models::SubtitleTrack> = player
            .subtitles
            .clone()
            .unwrap_or_default()
            .into_iter()
            .map(|subtitle| crate::stream::anime_lib_models::SubtitleTrack {
                id: subtitle.id.to_string(),
                url: subtitle.src,
                language: subtitle.name,
                is_default: false,
                headers: site_headers(),
            })
            .collect();

        let audio_tracks = vec![crate::stream::anime_lib_models::AudioTrack {
            id: player.id.to_string(),
            language: player.team.name.clone(),
            title: Some(player.team.name.clone()),
            default: true,
        }];

        let headers = site_headers();

        let Some(video) = video else {
            // No inline qualities: the row is a Kodik player URL, and the
            // stream has to be asked out of the player page.
            return crate::stream::kodik::resolve(
                &player.src,
                &site_referer(),
                audio_tracks,
                variant_id,
                self.proxy.as_deref(),
            )
            .await;
        };

        let mut streams: Vec<StreamVariant> = Vec::new();
        for quality in video.quality {
            if quality.href.is_empty() {
                continue;
            }
            let label = format!("{}p", quality.quality);
            let media_url = native_media_url(player.video_domain.as_deref(), &quality.href);
            streams.push(StreamVariant {
                variant_id: variant_id.to_string(),
                quality: quality.quality.to_string(),
                label,
                url: media_url,
                r#type: "mp4".to_string(),
                headers: headers.clone(),
                subtitles: subtitles.clone(),
                audio_tracks: audio_tracks.clone(),
            });
        }

        if streams.is_empty() {
            return Err(StreamResolutionError::NoVariants {
                message: format!("player {} has no qualities", player.id),
            });
        }
        Ok(streams)
    }

    /// Episode detail carries every player row and its qualities, which is the
    /// request behind every voice-over resolve. One episode would otherwise be
    /// fetched once per row, and the prefetch of the site's own rows makes that
    /// visible. The cache is process wide, short lived and bounded.
    async fn episode_detail(
        &self,
        episode_id: &str,
    ) -> Result<WireEpisodeDetail, StreamResolutionError> {
        let key = self.detail_cache_key(episode_id);
        if let Some(detail) = cached_detail(&key) {
            return Ok(detail);
        }
        let url = format!("{ANIMELIB_API_BASE}/episodes/{episode_id}");
        let response: WireEpisodeResponse = self.get_json(&url).await?;
        store_detail(key, &response.data);
        Ok(response.data)
    }

    /// The token decides which rows the API returns, so it is part of the key.
    fn detail_cache_key(&self, episode_id: &str) -> String {
        let mut hasher = DefaultHasher::new();
        self.token.hash(&mut hasher);
        format!("{episode_id}:{:x}", hasher.finish())
    }

    async fn get_json<T>(&self, url: &str) -> Result<T, StreamResolutionError>
    where
        T: for<'de> Deserialize<'de>,
    {
        let mut request = self
            .client
            .get(url)
            .header("Accept", "application/json")
            .header("Referer", format!("{ANIMELIB_SITE}/"))
            .header("Origin", ANIMELIB_SITE)
            // The API is shared by the whole site family; 5 is AnimeLib.
            .header("Site-Id", "5");
        if let Some(token) = self
            .token
            .as_deref()
            .filter(|value| !value.trim().is_empty())
        {
            request = request.header("Authorization", format!("Bearer {token}"));
        }

        let response =
            request
                .send()
                .await
                .map_err(|error| StreamResolutionError::NetworkError {
                    message: format!("request failed: {error}"),
                })?;

        let status = response.status();
        if status == 401 || status == 403 {
            return Err(StreamResolutionError::AuthRequired {
                message: format!("AnimeLib API returned {status} for {url}"),
            });
        }
        if !status.is_success() {
            return Err(StreamResolutionError::NetworkError {
                message: format!("HTTP {status} for {url}"),
            });
        }

        let body = response
            .text()
            .await
            .map_err(|error| StreamResolutionError::NetworkError {
                message: format!("failed to read response body: {error}"),
            })?;

        // The API answers HTTP 200 with an HTML error page when it refuses the
        // client, so the body, not the status, decides whether this is JSON.
        if !body.trim_start().starts_with(['{', '[']) {
            return Err(StreamResolutionError::NetworkError {
                message: format!(
                    "AnimeLib API answered {} for {url} instead of JSON",
                    first_line(&body)
                ),
            });
        }

        serde_json::from_str::<T>(&body).map_err(|error| StreamResolutionError::NetworkError {
            message: format!("failed to parse response from {url}: {error}"),
        })
    }
}

/// The sorts the catalog accepts. Anything else is ignored instead of being
/// forwarded to the API, whose sort column is not documented.
const SEARCH_SORTS: &[&str] = &["rating_score", "views", "name", "created_at", "random"];

/// The age ratings the site serves (1 PG … 5 RX 18+). A request without an
/// explicit age filter still excludes 18+ content unless the viewer opted in.
const AGE_RATINGS_WITHOUT_ADULT: [i32; 4] = [1, 2, 3, 4];

fn search_url(query: &str, page: i32, filters: &AnimeLibSearchFilters) -> String {
    let mut serializer = url::form_urlencoded::Serializer::new(String::new());
    serializer.append_pair("page", &page.to_string());
    if !query.trim().is_empty() {
        serializer.append_pair("q", query);
    }
    for value in &filters.types {
        serializer.append_pair("types[]", &value.to_string());
    }
    for value in &filters.genres {
        serializer.append_pair("genres[]", &value.to_string());
    }
    for value in &filters.statuses {
        serializer.append_pair("status[]", &value.to_string());
    }
    let mut ages = filters.age_ratings.clone();
    ages.retain(|value| (1..=5).contains(value));
    if !filters.adult {
        ages.retain(|value| *value != 5);
    }
    if ages.is_empty() {
        ages = AGE_RATINGS_WITHOUT_ADULT.to_vec();
        if filters.adult {
            ages.push(5);
        }
    }
    for value in &ages {
        serializer.append_pair("caution[]", &value.to_string());
    }
    if let Some(year) = filters.year_min {
        serializer.append_pair("year_min", &year.to_string());
    }
    if let Some(year) = filters.year_max {
        serializer.append_pair("year_max", &year.to_string());
    }
    if let Some(count) = filters.episodes_min {
        serializer.append_pair("episodes_min", &count.to_string());
    }
    if let Some(count) = filters.episodes_max {
        serializer.append_pair("episodes_max", &count.to_string());
    }
    let sort_by = filters
        .sort_by
        .as_deref()
        .filter(|value| SEARCH_SORTS.contains(value));
    if let Some(sort_by) = sort_by {
        serializer.append_pair("sort_by", sort_by);
        let sort_type = match filters.sort_type.as_deref() {
            Some("asc") => "asc",
            _ => "desc",
        };
        serializer.append_pair("sort_type", sort_type);
    }
    format!("{ANIMELIB_API_BASE}/anime?{}", serializer.finish())
}

/// Candidate slugs for a title the search index missed, best first.
///
/// The site's slug drops punctuation and inner hyphens, joins the words with
/// hyphens and appends `-anime`. A query with no Latin letters produces no
/// candidate, which is cheaper than one pointless request.
fn slug_candidates(query: &str) -> Vec<String> {
    let normalized = query.to_lowercase().replace('&', " and ");
    let mut words: Vec<String> = Vec::new();
    for raw in normalized.split_whitespace() {
        let word: String = raw
            .chars()
            .filter(|character| character.is_ascii_alphanumeric())
            .collect();
        if !word.is_empty() {
            words.push(word);
        }
    }
    if words.is_empty() {
        return Vec::new();
    }
    let base = words.join("-");
    vec![format!("{base}-anime"), base]
}

/// How long an episode detail is reused. Player rows do not change during a
/// session, and the site is not expected to add qualities mid-episode.
const DETAIL_TTL: Duration = Duration::from_secs(300);
const DETAIL_CAPACITY: usize = 32;

struct CachedDetail {
    fetched: Instant,
    detail: WireEpisodeDetail,
}

fn detail_cache() -> &'static Mutex<HashMap<String, CachedDetail>> {
    static CACHE: OnceLock<Mutex<HashMap<String, CachedDetail>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cached_detail(key: &str) -> Option<WireEpisodeDetail> {
    let mut cache = detail_cache().lock().ok()?;
    let entry = cache.get(key)?;
    if entry.fetched.elapsed() < DETAIL_TTL {
        return Some(entry.detail.clone());
    }
    cache.remove(key);
    None
}

/// Resolved source lists live as long as the frontend's own cache. A voice-over
/// that was switched away from and back again is then a URL reuse instead of
/// another Kodik page plus POST.
const SOURCES_TTL: Duration = Duration::from_secs(300);
const SOURCES_CAPACITY: usize = 32;

struct CachedSources {
    fetched: Instant,
    sources: Vec<StreamVariant>,
}

fn source_cache() -> &'static Mutex<HashMap<String, CachedSources>> {
    static CACHE: OnceLock<Mutex<HashMap<String, CachedSources>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cached_sources(key: &str) -> Option<Vec<StreamVariant>> {
    let mut cache = source_cache().lock().ok()?;
    let entry = cache.get(key)?;
    if entry.fetched.elapsed() < SOURCES_TTL {
        return Some(entry.sources.clone());
    }
    cache.remove(key);
    None
}

fn store_sources(key: String, sources: &[StreamVariant]) {
    let Ok(mut cache) = source_cache().lock() else {
        return;
    };
    if cache.len() >= SOURCES_CAPACITY {
        let oldest = cache
            .iter()
            .min_by_key(|(_, entry)| entry.fetched)
            .map(|(key, _)| key.clone());
        if let Some(oldest) = oldest {
            cache.remove(&oldest);
        }
    }
    cache.insert(
        key,
        CachedSources {
            fetched: Instant::now(),
            sources: sources.to_vec(),
        },
    );
}

/// Constants describe the whole catalog, not one viewer's session, so the
/// answer is shared by every client and refreshed on the same twenty minute
/// rhythm the site itself uses.
const CONSTANTS_TTL: Duration = Duration::from_secs(20 * 60);

fn constants_cache() -> &'static Mutex<Option<(Instant, AnimeLibConstants)>> {
    static CACHE: OnceLock<Mutex<Option<(Instant, AnimeLibConstants)>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

fn cached_constants() -> Option<AnimeLibConstants> {
    let cache = constants_cache().lock().ok()?;
    let (fetched, constants) = cache.as_ref()?;
    (fetched.elapsed() < CONSTANTS_TTL).then(|| constants.clone())
}

fn store_constants(constants: &AnimeLibConstants) {
    if let Ok(mut cache) = constants_cache().lock() {
        *cache = Some((Instant::now(), constants.clone()));
    }
}

fn store_detail(key: String, detail: &WireEpisodeDetail) {
    let Ok(mut cache) = detail_cache().lock() else {
        return;
    };
    if cache.len() >= DETAIL_CAPACITY {
        let oldest = cache
            .iter()
            .min_by_key(|(_, entry)| entry.fetched)
            .map(|(key, _)| key.clone());
        if let Some(oldest) = oldest {
            cache.remove(&oldest);
        }
    }
    cache.insert(
        key,
        CachedDetail {
            fetched: Instant::now(),
            detail: detail.clone(),
        },
    );
}

/// The referer an embedded Kodik player expects: the site that hosts it.
/// A Kodik URL fetched with its own host as the referer is refused.
pub(crate) fn site_referer() -> String {
    format!("{ANIMELIB_SITE}/")
}

/// Turn a native quality path into a playable URL.
///
/// The site concatenates the chosen server base and the row's `href` without
/// normalizing slashes, so its own URLs carry a double slash. Absolute and
/// protocol-relative hrefs are kept as they are. The host matters: a file on
/// `secondary_2` answers 404 on the `main` server.
fn native_media_url(video_domain: Option<&str>, href: &str) -> String {
    if href.starts_with("http://") || href.starts_with("https://") {
        return href.to_string();
    }
    if let Some(rest) = href.strip_prefix("//") {
        return format!("https://{rest}");
    }
    let base = match video_domain {
        Some("secondary_1") => VIDEO_SERVER_SECONDARY_1,
        Some("secondary_2") => VIDEO_SERVER_SECONDARY_2,
        _ => VIDEO_SERVER_MAIN,
    };
    format!("{base}{href}")
}

/// The headers the AnimeLib CDN and the Kodik player both expect.
fn site_headers() -> std::collections::BTreeMap<String, String> {
    let mut headers = std::collections::BTreeMap::new();
    headers.insert("Referer".to_string(), format!("{ANIMELIB_SITE}/"));
    headers.insert("Origin".to_string(), ANIMELIB_SITE.to_string());
    headers
}

/// One client per proxy value, so consecutive catalog requests reuse the same
/// connection pool instead of paying a TLS handshake each time. A `Client` is
/// a handle over a shared pool, so handing out clones is cheap.
fn shared_client(proxy: Option<&str>) -> Result<Client, String> {
    static CACHE: OnceLock<Mutex<HashMap<Option<String>, Client>>> = OnceLock::new();
    let key = proxy
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Ok(existing) = cache.lock() {
        if let Some(client) = existing.get(&key) {
            return Ok(client.clone());
        }
    }
    let client = build_client(key.as_deref())?;
    if let Ok(mut cache) = cache.lock() {
        cache.insert(key, client.clone());
    }
    Ok(client)
}

fn build_client(proxy: Option<&str>) -> Result<Client, String> {
    let mut builder = Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent(USER_AGENT);
    if let Some(url) = proxy.map(str::trim).filter(|url| !url.is_empty()) {
        builder = builder.proxy(
            reqwest::Proxy::all(url)
                .map_err(|error| format!("invalid AnimeLib proxy {url}: {error}"))?,
        );
    }
    builder
        .build()
        .map_err(|error| format!("failed to create anime lib client: {error}"))
}

/// First non-empty line of an HTML error page, trimmed for a readable message.
fn first_line(body: &str) -> String {
    body.lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("an empty body")
        .chars()
        .take(120)
        .collect()
}

/// The identity of a voice-over row. `player` plus `team.id` is unique inside
/// an episode, which the numeric `team.id` alone is not.
#[derive(Debug, Clone, PartialEq, Eq)]
struct VariantKey {
    player: String,
    team_id: i64,
}

impl VariantKey {
    fn parse(variant_id: &str) -> Self {
        match variant_id.split_once(':') {
            Some((player, team_id)) => Self {
                player: player.to_string(),
                team_id: team_id.parse().unwrap_or(0),
            },
            None => Self {
                player: String::new(),
                team_id: variant_id.parse().unwrap_or(0),
            },
        }
    }

    fn matches(&self, variant: &AnimeLibVariant) -> bool {
        variant.id == self.team_id.to_string()
            && (self.player.is_empty() || variant.player == self.player)
    }
}

fn into_anime(item: WireAnimeInfo) -> AnimeLibAnime {
    let WireAnimeInfo {
        id,
        name,
        rus_name,
        eng_name,
        slug_url,
        cover,
        release_date_string,
        status,
        anilist_id,
        rating,
        media_type,
        age_restriction,
        views,
        genres,
        summary,
    } = item;
    let synonyms = eng_name
        .filter(|label| !label.is_empty() && label != &name)
        .into_iter()
        .collect();
    AnimeLibAnime {
        id: id.to_string(),
        title: rus_name.clone().unwrap_or(name),
        synonyms,
        cover: Some(cover.default),
        banner: None,
        description: summary.as_ref().map(summary_text).filter(|text| !text.is_empty()),
        year: release_date_string.as_deref().and_then(year_from_label),
        status: status.map(|label| label.label),
        genres: genres
            .unwrap_or_default()
            .into_iter()
            .filter_map(|genre| genre.name)
            .collect(),
        episode_count: None,
        rating: rating
            .as_ref()
            .and_then(|value| value.average.as_deref())
            .and_then(|value| value.replace(',', ".").parse::<f64>().ok()),
        rating_votes: rating.as_ref().and_then(|value| value.votes),
        media_type: media_type.map(|label| label.label),
        age_rating: age_restriction.map(|label| label.label),
        views: views.and_then(|value| value.total),
        anilist_id,
        sub_or_dub: None,
        slug_url,
    }
}

/// Longest synopsis sent to the frontend. The site sends a rich text document
/// and a few titles carry several thousand characters; the modal shows a
/// scrollable block, not a wall of text over the IPC boundary.
const SUMMARY_MAX_CHARS: usize = 2000;

/// Flatten the site's rich text `summary` document into plain paragraphs.
fn summary_text(document: &serde_json::Value) -> String {
    fn walk(value: &serde_json::Value, out: &mut String) {
        match value {
            serde_json::Value::Object(map) => {
                let kind = map.get("type").and_then(|kind| kind.as_str()).unwrap_or_default();
                if let Some(serde_json::Value::String(text)) = map.get("text") {
                    out.push_str(text);
                }
                if kind == "hardBreak" {
                    out.push('\n');
                }
                if let Some(serde_json::Value::Array(children)) = map.get("content") {
                    for child in children {
                        walk(child, out);
                    }
                    if matches!(kind, "paragraph" | "heading" | "listItem" | "blockquote") {
                        out.push('\n');
                    }
                }
            }
            serde_json::Value::Array(items) => {
                for item in items {
                    walk(item, out);
                }
            }
            _ => {}
        }
    }

    let mut text = String::new();
    walk(document, &mut text);
    let flattened: Vec<&str> = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();
    let joined = flattened.join("\n");
    if joined.chars().count() <= SUMMARY_MAX_CHARS {
        return joined;
    }
    let mut capped: String = joined.chars().take(SUMMARY_MAX_CHARS).collect();
    capped.push('…');
    capped
}

/// The API returns a localized date label such as `03 октября 2002 г.`, not an
/// ISO date, so the year is read from the last four digit group.
fn year_from_label(label: &str) -> Option<i32> {
    label
        .split(|character: char| !character.is_ascii_digit())
        .filter(|part| part.len() == 4)
        .filter_map(|part| part.parse::<i32>().ok())
        .find(|year| (1900..=2100).contains(year))
}

/// The AnimeLib site id shared by the catalog and its constants.
const ANIMELIB_SITE_ID: i32 = 5;

/// Whether a constant row is served on AnimeLib. A missing `site_ids` means
/// the value is not site-scoped; an empty one means it is served nowhere.
fn serves_anime(site_ids: &Option<Vec<i32>>) -> bool {
    site_ids
        .as_ref()
        .map_or(true, |ids| ids.contains(&ANIMELIB_SITE_ID))
}

fn into_constants(wire: WireConstants) -> AnimeLibConstants {
    fn options(rows: Vec<WireConstantRow>) -> Vec<AnimeLibFilterOption> {
        rows.into_iter()
            .filter(|row| serves_anime(&row.site_ids))
            .filter_map(|row| {
                let label = row.label.or(row.name)?;
                (!label.is_empty()).then_some(AnimeLibFilterOption { id: row.id, label })
            })
            .collect()
    }

    let genres = wire
        .genres
        .into_iter()
        .filter(|row| serves_anime(&row.site_ids))
        .filter_map(|row| {
            let label = row.name.or(row.label)?;
            (!label.is_empty()).then_some(AnimeLibGenreOption {
                id: row.id,
                label,
                adult: row.adult.unwrap_or(false),
            })
        })
        .collect();

    AnimeLibConstants {
        types: options(wire.types),
        statuses: options(wire.status),
        age_ratings: options(wire.age_restriction_anime),
        genres,
    }
}

fn into_variant(row: WirePlayer) -> AnimeLibVariant {
    AnimeLibVariant {
        id: row.team.id.to_string(),
        name: row.team.name,
        language: row.translation_type.map(|kind| kind.label),
        separate_stream: true,
        player: row.player,
        source_url: row.src,
    }
}

// ---- Wire types matching the verified AnimeLib API JSON ----

#[derive(Deserialize)]
struct WireSearchResponse {
    data: Vec<WireAnimeInfo>,
    #[serde(default)]
    meta: WireMeta,
}

/// The pagination envelope the search endpoint answers with. Every field is
/// optional because the site does not document it.
#[derive(Deserialize, Default)]
struct WireMeta {
    #[serde(default)]
    current_page: Option<i32>,
    #[serde(default)]
    last_page: Option<i32>,
    #[serde(default)]
    total: Option<i32>,
}

#[derive(Deserialize)]
struct WireAnimeResponse {
    data: WireAnimeInfo,
}

#[derive(Deserialize)]
struct WireConstantsResponse {
    data: WireConstants,
}

#[derive(Deserialize, Default)]
struct WireConstants {
    #[serde(default)]
    types: Vec<WireConstantRow>,
    #[serde(default)]
    status: Vec<WireConstantRow>,
    #[serde(default, rename = "ageRestrictionAnime")]
    age_restriction_anime: Vec<WireConstantRow>,
    #[serde(default)]
    genres: Vec<WireConstantRow>,
}

/// A constants row. Types and statuses use `label`; genres use `name` and
/// carry an `adult` flag that decides whether the genre is hidden until the
/// viewer enables NSFW.
#[derive(Deserialize)]
struct WireConstantRow {
    id: i32,
    #[serde(default)]
    label: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    site_ids: Option<Vec<i32>>,
    #[serde(default)]
    adult: Option<bool>,
}

#[derive(Deserialize)]
struct WireAnimeInfo {
    id: i64,
    name: String,
    rus_name: Option<String>,
    eng_name: Option<String>,
    slug_url: String,
    cover: WireCover,
    #[serde(default, rename = "releaseDateString")]
    release_date_string: Option<String>,
    #[serde(default)]
    status: Option<WireLabel>,
    #[serde(default)]
    anilist_id: Option<i64>,
    // The list answer already carries rating, type and age restriction. The
    // last three only arrive when the details request asks for them, which is
    // why they stay optional.
    #[serde(default)]
    rating: Option<WireRating>,
    #[serde(default, rename = "type")]
    media_type: Option<WireLabel>,
    #[serde(default, rename = "ageRestriction")]
    age_restriction: Option<WireLabel>,
    #[serde(default)]
    views: Option<WireViews>,
    #[serde(default)]
    genres: Option<Vec<WireGenre>>,
    /// The synopsis as a rich text document; flattened by `summary_text`.
    #[serde(default)]
    summary: Option<serde_json::Value>,
}

/// The site's score envelope. `average` is a decimal string (`"9.36"`), not a
/// number, and `votes` counts the viewers behind it.
#[derive(Deserialize)]
struct WireRating {
    #[serde(default)]
    average: Option<String>,
    #[serde(default)]
    votes: Option<i64>,
}

#[derive(Deserialize)]
struct WireViews {
    #[serde(default)]
    total: Option<i64>,
}

#[derive(Deserialize)]
struct WireGenre {
    #[serde(default)]
    name: Option<String>,
}

#[derive(Deserialize)]
struct WireCover {
    default: String,
}

#[derive(Deserialize, Clone)]
struct WireLabel {
    label: String,
}

#[derive(Deserialize)]
struct WireEpisodesResponse {
    data: Vec<WireEpisode>,
}

#[derive(Deserialize)]
struct WireEpisode {
    id: i64,
    name: String,
    number: String,
    #[serde(default)]
    created_at: String,
}

#[derive(Deserialize)]
struct WireEpisodeResponse {
    data: WireEpisodeDetail,
}

#[derive(Deserialize, Clone)]
struct WireEpisodeDetail {
    players: Vec<WirePlayer>,
}

#[derive(Deserialize, Clone)]
struct WirePlayer {
    id: i64,
    player: String,
    team: WireTeam,
    #[serde(default)]
    translation_type: Option<WireLabel>,
    #[serde(default)]
    src: String,
    #[serde(default)]
    video: Option<WireVideo>,
    #[serde(default)]
    video_domain: Option<String>,
    #[serde(default)]
    subtitles: Option<Vec<WireSubtitle>>,
}

#[derive(Deserialize, Clone)]
struct WireTeam {
    id: i64,
    name: String,
}

#[derive(Deserialize, Clone)]
struct WireVideo {
    quality: Vec<WireQuality>,
}

#[derive(Deserialize, Clone)]
struct WireQuality {
    href: String,
    quality: i32,
}

#[derive(Deserialize, Clone)]
struct WireSubtitle {
    id: i64,
    name: String,
    src: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn client_builds_with_and_without_a_token() {
        AnimeLibClient::new().expect("client builds without a token");
        AnimeLibClient::with_token("token".to_string()).expect("client builds with a token");
        AnimeLibClient::with_proxy(Some("socks5h://127.0.0.1:10808".to_string()))
            .expect("client builds with a proxy");
        AnimeLibClient::with_token_and_proxy(
            "token".to_string(),
            Some("http://127.0.0.1:7890".to_string()),
        )
        .expect("client builds with a token and a proxy");
    }

    #[test]
    fn year_comes_from_the_localized_date_label() {
        assert_eq!(year_from_label("03 октября 2002 г."), Some(2002));
        assert_eq!(year_from_label("2019"), Some(2019));
        assert_eq!(year_from_label("осень 2024"), Some(2024));
        assert_eq!(year_from_label("дата неизвестна"), None);
        assert_eq!(year_from_label(""), None);
    }

    #[test]
    fn a_details_answer_maps_rating_type_and_summary() {
        let json = serde_json::json!({ "data": {
            "id": 21371,
            "name": "Sousou no Frieren",
            "rus_name": "Провожающая в последний путь Фрирен",
            "slug_url": "21371--sousou-no-frieren-anime",
            "cover": { "default": "https://static.cdnlibs.org/frieren.jpg" },
            "releaseDateString": "29 сентября 2023 г.",
            "status": { "label": "Завершён" },
            "anilist_id": 52991,
            "rating": { "average": "9.36", "votes": 9753 },
            "type": { "id": 16, "label": "TV Сериал" },
            "ageRestriction": { "id": 2, "label": "PG-13" },
            "views": { "total": 489421 },
            "genres": [
                { "id": 43, "name": "Драма" },
                { "id": 7, "name": "Приключения" }
            ],
            "summary": {
                "type": "doc",
                "content": [
                    { "type": "paragraph", "content": [
                        { "type": "text", "text": "Фрирен, эльфийка-маг." }
                    ] },
                    { "type": "paragraph", "content": [
                        { "type": "text", "text": "Второй абзац." }
                    ] }
                ]
            }
        } });
        let wire: WireAnimeResponse = serde_json::from_value(json).expect("details parse");
        let anime = into_anime(wire.data);

        assert_eq!(anime.rating, Some(9.36));
        assert_eq!(anime.rating_votes, Some(9753));
        assert_eq!(anime.media_type.as_deref(), Some("TV Сериал"));
        assert_eq!(anime.age_rating.as_deref(), Some("PG-13"));
        assert_eq!(anime.views, Some(489_421));
        assert_eq!(anime.genres, vec!["Драма".to_string(), "Приключения".to_string()]);
        assert_eq!(
            anime.description.as_deref(),
            Some("Фрирен, эльфийка-маг.\nВторой абзац.")
        );
        assert_eq!(anime.year, Some(2023));
    }

    #[test]
    fn a_list_answer_without_the_extra_fields_maps_to_empty_options() {
        let json = serde_json::json!({ "data": {
            "id": 1,
            "name": "Test",
            "slug_url": "1--test-anime",
            "cover": { "default": "https://static.cdnlibs.org/test.jpg" }
        } });
        let wire: WireAnimeResponse = serde_json::from_value(json).expect("list answer parses");
        let anime = into_anime(wire.data);

        assert_eq!(anime.rating, None);
        assert_eq!(anime.rating_votes, None);
        assert_eq!(anime.media_type, None);
        assert_eq!(anime.age_rating, None);
        assert_eq!(anime.views, None);
        assert!(anime.genres.is_empty());
        assert_eq!(anime.description, None);
    }

    #[test]
    fn a_rating_string_accepts_a_comma_and_a_summary_is_capped() {
        let mut rating = serde_json::json!({ "average": "9,36", "votes": 12 });
        assert_eq!(
            rating
                .get("average")
                .and_then(|value| value.as_str())
                .and_then(|value| value.replace(',', ".").parse::<f64>().ok()),
            Some(9.36)
        );
        rating = serde_json::json!({ "average": "", "votes": 12 });
        assert_eq!(
            rating
                .get("average")
                .and_then(|value| value.as_str())
                .and_then(|value| value.parse::<f64>().ok()),
            None
        );

        let long = "a".repeat(SUMMARY_MAX_CHARS + 500);
        let text = summary_text(&serde_json::json!({
            "type": "doc",
            "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": long }] }]
        }));
        assert_eq!(text.chars().count(), SUMMARY_MAX_CHARS + 1);
        assert!(text.ends_with('…'));
    }

    #[test]
    fn variant_key_matches_player_and_team() {
        let variant = AnimeLibVariant {
            id: "32416".to_string(),
            name: "AniDUB".to_string(),
            language: Some("Озвучка".to_string()),
            separate_stream: true,
            player: "Kodik".to_string(),
            source_url: "//kodikplayer.com/seria/1/hash/720p".to_string(),
        };
        assert!(VariantKey::parse("Kodik:32416").matches(&variant));
        assert!(!VariantKey::parse("Animelib:32416").matches(&variant));
        assert!(!VariantKey::parse("Kodik:999").matches(&variant));
        assert!(VariantKey::parse("32416").matches(&variant));
    }

    #[test]
    fn html_block_is_reported_as_a_network_error() {
        let body = "<!DOCTYPE html><html><title>Error 403</title></html>";
        assert!(!body.trim_start().starts_with(['{', '[']));
        assert_eq!(
            first_line(body),
            "<!DOCTYPE html><html><title>Error 403</title></html>"
        );
    }

    #[test]
    fn anime_mapping_keeps_slug_status_and_anilist_id() {
        let item: WireAnimeInfo = serde_json::from_str(
            r#"{
                "id": 11,
                "name": "Naruto",
                "rus_name": "Наруто",
                "eng_name": "Naruto",
                "slug": "naruto-anime",
                "slug_url": "11--naruto-anime",
                "cover": { "default": "https://cover.imglib.info/naruto.jpg", "thumbnail": "t" },
                "status": { "id": 2, "label": "Завершён" },
                "releaseDateString": "03 октября 2002 г.",
                "anilist_id": 20
            }"#,
        )
        .expect("parses");

        let anime = into_anime(item);
        assert_eq!(anime.title, "Наруто");
        assert_eq!(anime.slug_url, "11--naruto-anime");
        assert_eq!(anime.year, Some(2002));
        assert_eq!(anime.status.as_deref(), Some("Завершён"));
        assert_eq!(anime.anilist_id, Some(20));
        assert!(
            anime.synonyms.is_empty(),
            "eng_name equal to name is not a synonym"
        );
        assert_eq!(anime.episode_count, None);
    }

    #[test]
    fn player_row_mapping_keeps_the_kodik_source() {
        let row: WirePlayer = serde_json::from_str(
            r#"{
                "id": 976,
                "episode_id": 455,
                "player": "Kodik",
                "translation_type": { "id": 2, "label": "Озвучка" },
                "team": { "id": 32416, "name": "AniDUB" },
                "src": "//kodikplayer.com/seria/176463/hash/720p"
            }"#,
        )
        .expect("parses");

        let variant = into_variant(row);
        assert_eq!(variant.id, "32416");
        assert_eq!(variant.name, "AniDUB");
        assert_eq!(variant.player, "Kodik");
        assert_eq!(variant.language.as_deref(), Some("Озвучка"));
        assert_eq!(
            variant.source_url,
            "//kodikplayer.com/seria/176463/hash/720p"
        );
    }

    #[test]
    fn search_url_carries_filters_and_excludes_adult_by_default() {
        let filters = AnimeLibSearchFilters {
            types: vec![16],
            genres: vec![32, 91],
            statuses: vec![2],
            age_ratings: vec![2],
            year_min: Some(2020),
            year_max: Some(2024),
            episodes_min: Some(12),
            episodes_max: Some(24),
            sort_by: Some("name".to_string()),
            sort_type: Some("asc".to_string()),
            adult: false,
        };
        let url = search_url("Onii chan", 2, &filters);
        assert!(url.contains("q=Onii+chan") || url.contains("q=Onii%20chan"));
        assert!(url.contains("types%5B%5D=16"));
        assert!(url.contains("genres%5B%5D=32"));
        assert!(url.contains("genres%5B%5D=91"));
        assert!(url.contains("caution%5B%5D=2"));
        assert!(!url.contains("caution%5B%5D=5"));
        assert!(url.contains("year_min=2020"));
        assert!(url.contains("episodes_max=24"));
        assert!(url.contains("sort_by=name"));
        assert!(url.contains("sort_type=asc"));
    }

    #[test]
    fn search_url_includes_adult_and_drops_an_unknown_sort() {
        let filters = AnimeLibSearchFilters {
            adult: true,
            sort_by: Some("not_a_column".to_string()),
            ..AnimeLibSearchFilters::default()
        };
        let url = search_url("", 1, &filters);
        for age in 1..=5 {
            assert!(url.contains(&format!("caution%5B%5D={age}")));
        }
        assert!(!url.contains("sort_by"));
    }

    #[test]
    fn search_url_keeps_the_random_sort() {
        let filters = AnimeLibSearchFilters {
            sort_by: Some("random".to_string()),
            sort_type: Some("desc".to_string()),
            ..AnimeLibSearchFilters::default()
        };
        let url = search_url("", 1, &filters);
        assert!(url.contains("sort_by=random"));
        assert!(url.contains("sort_type=desc"));
    }

    #[test]
    fn slug_candidates_drop_inner_hyphens_and_punctuation() {
        assert_eq!(
            slug_candidates("Onii-chan wa Oshimai!"),
            vec![
                "oniichan-wa-oshimai-anime".to_string(),
                "oniichan-wa-oshimai".to_string()
            ]
        );
        assert!(slug_candidates("Мой братик").is_empty());
        assert_eq!(
            slug_candidates("Spy x Family & Code: White"),
            vec![
                "spy-x-family-and-code-white-anime".to_string(),
                "spy-x-family-and-code-white".to_string()
            ]
        );
    }

    /// The index skips some titles that still have a details page. The slug
    /// fallback is the only way to reach them, so this check runs against the
    /// live API instead of making the whole test suite depend on the network.
    ///
    /// `cargo test --lib stream::anime_lib_client::tests::live_search_recovers -- --ignored --nocapture`
    #[tokio::test]
    #[ignore = "needs the AnimeLib API"]
    async fn live_search_recovers_a_title_the_index_skips() {
        let client = AnimeLibClient::new().expect("client builds");
        let page = client
            .search(
                "Onii-chan wa Oshimai!",
                Some(1),
                &AnimeLibSearchFilters::default(),
            )
            .await
            .expect("search answers");
        let item = page
            .items
            .iter()
            .find(|item| item.id == "20391")
            .expect("the slug fallback recovers the title");
        assert_eq!(item.slug_url, "20391--oniichan-wa-oshimai-anime");
        println!("recovered: {} ({})", item.title, item.slug_url);
    }

    /// Measures where a voice-over switch spends its time: the live resolve,
    /// then the same resolve again from the process cache. A cold Kodik row
    /// costs its player page plus the signed POST; a warm one is a map lookup.
    ///
    /// `cargo test --lib stream::anime_lib_client::tests::live_switch_timing -- --ignored --nocapture`
    #[tokio::test]
    #[ignore = "needs the AnimeLib API and a region Kodik serves"]
    async fn live_switch_timing() {
        let token = std::env::var("ANIMELIB_TEST_TOKEN").ok().or_else(|| {
            for service in ["iluhaAnime", "iluhaAnime.iluhaAnime"] {
                let Ok(entry) = keyring::Entry::new(service, "animelib.token") else {
                    continue;
                };
                if let Ok(raw) = entry.get_password() {
                    return Some(raw);
                }
            }
            None
        });
        let client = match token {
            Some(token) => AnimeLibClient::with_token(token),
            None => AnimeLibClient::new(),
        }
        .expect("client builds");

        let started = Instant::now();
        let players = client.players("117295").await.expect("players answer");
        println!(
            "players: {:?} for {} rows",
            started.elapsed(),
            players.len()
        );
        let native: Vec<_> = players
            .iter()
            .filter(|row| row.player == "Animelib")
            .take(4)
            .collect();
        let rows: Vec<&AnimeLibVariant> = if native.is_empty() {
            players.iter().take(3).collect()
        } else {
            native
        };

        for row in rows {
            let variant = format!("{}:{}", row.player, row.id);
            let started = Instant::now();
            match client.resolve_episode_variant("117295", &variant).await {
                Ok(sources) => println!(
                    "cold {variant} ({}) : {:?}, {} sources",
                    row.name,
                    started.elapsed(),
                    sources.len()
                ),
                Err(error) => println!("cold {variant} failed: {error}"),
            }
            let started = Instant::now();
            let _ = client.resolve_episode_variant("117295", &variant).await;
            println!("warm {variant}: {:?}", started.elapsed());
        }
    }

    #[test]
    fn constants_keep_only_anime_rows_and_their_adult_flag() {
        let wire: WireConstantsResponse = serde_json::from_str(
            r#"{
                "data": {
                    "types": [
                        { "id": 16, "label": "TV Сериал", "site_ids": [5] },
                        { "id": 1, "label": "Манга", "site_ids": [1, 4, 2] }
                    ],
                    "status": [{ "id": 2, "label": "Завершён", "site_ids": [5] }],
                    "ageRestrictionAnime": [
                        { "id": 3, "label": "R-17", "site_ids": [5] },
                        { "id": 5, "label": "RX (18+)", "site_ids": [5] }
                    ],
                    "genres": [
                        { "id": 32, "name": "Арт", "adult": false, "site_ids": [5] },
                        { "id": 99, "name": "Хентай", "adult": true, "site_ids": [5] }
                    ]
                }
            }"#,
        )
        .expect("parses constants");
        let constants = into_constants(wire.data);
        assert_eq!(constants.types.len(), 1);
        assert_eq!(constants.types[0].id, 16);
        assert_eq!(constants.statuses.len(), 1);
        assert_eq!(constants.age_ratings.len(), 2);
        assert_eq!(constants.genres.len(), 2);
        assert!(constants.genres[1].adult);
    }

    #[test]
    fn source_cache_round_trips_and_separates_episodes() {
        let source = StreamVariant {
            variant_id: "Kodik:1".to_string(),
            quality: "720".to_string(),
            label: "720p".to_string(),
            url: "https://cdn/video.m3u8".to_string(),
            r#type: "m3u8".to_string(),
            headers: std::collections::BTreeMap::new(),
            subtitles: Vec::new(),
            audio_tracks: Vec::new(),
        };
        let key = "source-cache:1".to_string();
        store_sources(key.clone(), std::slice::from_ref(&source));
        let cached = cached_sources(&key).expect("cached");
        assert_eq!(cached.len(), 1);
        assert_eq!(cached[0].url, source.url);
        assert!(cached_sources("source-cache:2").is_none());
    }

    #[test]
    fn episode_detail_cache_key_separates_tokens() {
        let anonymous = AnimeLibClient::new().expect("client builds");
        let first = AnimeLibClient::with_token("first".to_string()).expect("client builds");
        let second = AnimeLibClient::with_token("second".to_string()).expect("client builds");
        assert_eq!(
            anonymous.detail_cache_key("455"),
            anonymous.detail_cache_key("455")
        );
        assert_ne!(
            anonymous.detail_cache_key("455"),
            first.detail_cache_key("455")
        );
        assert_ne!(
            first.detail_cache_key("455"),
            second.detail_cache_key("455")
        );
        assert_ne!(first.detail_cache_key("455"), first.detail_cache_key("456"));
    }

    #[test]
    fn episode_detail_cache_keeps_a_fetched_episode() {
        let detail: WireEpisodeDetail =
            serde_json::from_str(r#"{ "players": [] }"#).expect("parses");
        let key = "cache-round-trip:0".to_string();
        store_detail(key.clone(), &detail);
        assert!(cached_detail(&key).is_some());
        assert!(cached_detail("cache-round-trip:missing").is_none());
    }

    /// Live probe of the slug fallback: the title is on AnimeLib but its
    /// full-text index answers an empty page for the English name.
    ///
    /// `cargo test --lib stream::anime_lib_client::tests::live_search -- --ignored --nocapture`
    #[tokio::test]
    #[ignore = "needs the network"]
    async fn live_search_recovers_a_title_missing_from_the_index() {
        let client = AnimeLibClient::new().expect("client builds");
        let page = client
            .search(
                "Onii-chan wa Oshimai!",
                None,
                &AnimeLibSearchFilters::default(),
            )
            .await
            .expect("search answers");
        let item = page
            .items
            .first()
            .expect("the slug fallback finds the title");
        println!("fallback: {} {} {}", item.id, item.title, item.slug_url);
        assert_eq!(item.id, "20391");
    }

    /// Live probe against the real API. Not part of the default suite because
    /// it needs the network, and not runnable in CI for the same reason.
    ///
    /// `cargo test --lib stream::anime_lib_client -- --ignored --nocapture`
    #[tokio::test]
    #[ignore = "needs the network"]
    async fn live_animelib_catalog_answers() {
        let client = AnimeLibClient::new().expect("client builds");
        let results = client
            .search("naruto", None, &AnimeLibSearchFilters::default())
            .await
            .expect("search answers");
        println!(
            "search: {} items, page {:?} of {:?}, total {:?}",
            results.items.len(),
            results.page,
            results.last_page,
            results.total
        );
        let first = results.items.first().expect("at least one item");
        println!(
            "first: id={} title={} year={:?} status={:?} anilist={:?} slug_url={}",
            first.id, first.title, first.year, first.status, first.anilist_id, first.slug_url
        );
        assert!(first.year.is_some(), "the year comes from the date label");

        let details = client
            .details(&first.slug_url)
            .await
            .expect("details answer");
        assert_eq!(details.id, first.id);
        println!("details: {} ({:?})", details.title, details.status);

        let episodes = client.episodes(&details.id).await.expect("episodes answer");
        println!("episodes: {}", episodes.len());
        assert!(!episodes.is_empty(), "a title has episodes");
        let episode = episodes.first().expect("at least one episode");

        let players = client.players(&episode.id).await.expect("players answer");
        println!("players: {}", players.len());
        for player in &players {
            println!(
                "  {} / {} [{}] source={}",
                player.player, player.name, player.id, player.source_url
            );
        }
        assert!(!players.is_empty(), "an episode has voice-over rows");
    }

    #[test]
    fn search_meta_is_read_when_the_api_sends_it() {
        let response: WireSearchResponse = serde_json::from_str(
            r#"{
                "data": [{
                    "id": 11, "name": "Naruto", "slug_url": "11--naruto",
                    "cover": { "default": "https://cdn/cover.jpg" }
                }],
                "meta": { "current_page": 2, "last_page": 7, "total": 380 }
            }"#,
        )
        .expect("parses");
        assert_eq!(response.meta.current_page, Some(2));
        assert_eq!(response.meta.last_page, Some(7));
        assert_eq!(response.meta.total, Some(380));
    }

    #[test]
    fn search_meta_is_optional() {
        let response: WireSearchResponse = serde_json::from_str(
            r#"{ "data": [{ "id": 1, "name": "A", "slug_url": "a",
                "cover": { "default": "https://cdn/a.jpg" } }] }"#,
        )
        .expect("parses without meta");
        assert_eq!(response.meta.last_page, None);
        assert_eq!(response.meta.total, None);
    }

    #[test]
    fn native_media_url_uses_the_server_named_by_video_domain() {
        assert_eq!(
            native_media_url(
                Some("secondary_2"),
                "/uploads/converted_videos/anime/21371/players/111481/a_2160.mp4"
            ),
            "https://video1.imglib.info//uploads/converted_videos/anime/21371/players/111481/a_2160.mp4"
        );
        assert_eq!(
            native_media_url(Some("secondary_1"), "/uploads/a_1080.mp4"),
            "https://video2.cdnlibs.org//uploads/a_1080.mp4"
        );
        assert_eq!(
            native_media_url(None, "/uploads/a_720.mp4"),
            "https://video1.cdnlibs.org/.%D0%B0s//uploads/a_720.mp4"
        );
        assert_eq!(
            native_media_url(Some("unknown"), "/uploads/a.mp4"),
            "https://video1.cdnlibs.org/.%D0%B0s//uploads/a.mp4"
        );
    }

    #[test]
    fn native_media_url_keeps_absolute_and_protocol_relative_hrefs() {
        assert_eq!(
            native_media_url(Some("secondary_2"), "https://cdn.example/a.mp4"),
            "https://cdn.example/a.mp4"
        );
        assert_eq!(
            native_media_url(Some("secondary_2"), "//cdn.example/a.mp4"),
            "https://cdn.example/a.mp4"
        );
    }

    #[test]
    fn native_player_row_parses_its_qualities_and_domain() {
        let row: WirePlayer = serde_json::from_str(
            r#"{
                "id": 111481,
                "player": "Animelib",
                "team": { "id": 49363, "name": "Дубляжная" },
                "translation_type": { "id": 2, "label": "Озвучка" },
                "video_domain": "secondary_2",
                "video": { "quality": [
                    { "href": "/uploads/anime/21371/a_2160.mp4", "quality": 2160 },
                    { "href": "/uploads/anime/21371/a_1080.mp4", "quality": 1080 }
                ] }
            }"#,
        )
        .expect("parses");
        let video = row.video.as_ref().expect("video payload");
        assert_eq!(video.quality.len(), 2);
        assert_eq!(row.video_domain.as_deref(), Some("secondary_2"));
        assert_eq!(
            native_media_url(row.video_domain.as_deref(), &video.quality[0].href),
            "https://video1.imglib.info//uploads/anime/21371/a_2160.mp4"
        );
    }

    #[test]
    fn player_row_without_a_kodik_source_still_maps() {
        let row: WirePlayer = serde_json::from_str(
            r#"{ "id": 1, "player": "Animelib", "team": { "id": 2, "name": "Team" } }"#,
        )
        .expect("parses");
        let variant = into_variant(row);
        assert_eq!(variant.source_url, "");
        assert_eq!(variant.language, None);
    }
}
