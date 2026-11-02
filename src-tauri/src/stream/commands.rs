//! AnimeLib Tauri commands.
//!
//! Commands exposed to the frontend for searching, browsing and resolving
//! AnimeLib playback sources. The catalog works without a credential: the API
//! answers anonymously, and a token stored in the OS keyring is sent only when
//! one exists. The token never travels through an IPC input.
//!
//! Login uses the in-app browser flow in `auth.rs`: the site's own login page,
//! a session harvested from localStorage and validated here. OAuth against the
//! site's authorization server stays unbuilt; see
//! `.docs/features/streaming/auth.md` for why.

use std::collections::BTreeMap;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::auth::{delete_secret, load_secret, save_secret};
use crate::scrapers::clients::resolve_proxy;
use crate::stream::anime_lib_client::AnimeLibClient;
use crate::stream::anime_lib_models::{
    AnimeLibAnime, AnimeLibConstants, AnimeLibEpisode, AnimeLibSearchFilters, AnimeLibSearchPage,
    AnimeLibVariant, StreamVariant,
};
use crate::stream::anime_lib_resolver::{build_watch_key, keep_playable};

/// Keyring account under the app's credential service. The token never
/// travels through an IPC input and is never written to settings storage.
pub(crate) const ANIMELIB_TOKEN_ACCOUNT: &str = "animelib.token";

/// Accept a raw JWT or a pasted `Authorization` value. The site stores the
/// bare token; a leading `Bearer` is a copy-paste artefact, not part of it.
fn normalize_token(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    let without_bearer = trimmed
        .strip_prefix("Bearer ")
        .or_else(|| trimmed.strip_prefix("bearer "))
        .unwrap_or(trimmed)
        .trim();
    (!without_bearer.is_empty() && !without_bearer.eq_ignore_ascii_case("bearer"))
        .then(|| without_bearer.to_string())
}

fn stored_token() -> Option<String> {
    load_secret(ANIMELIB_TOKEN_ACCOUNT)
        .ok()
        .and_then(|raw| normalize_token(&raw))
}

fn client(proxy: Option<String>) -> Result<AnimeLibClient, String> {
    match stored_token() {
        Some(token) => AnimeLibClient::with_token_and_proxy(token, proxy),
        None => AnimeLibClient::with_proxy(proxy),
    }
}

/// The proxy arrives as either spelling, matching the rest of the app's IPC.
#[allow(non_snake_case)]
fn client_for(
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<AnimeLibClient, String> {
    client(resolve_proxy(proxy_url, proxyUrl))
}

/// Save and remove the AnimeLib session token in the OS credential store.
/// The token is only accepted when the API confirms it with `/auth/me`.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn animelib_token_save(
    token: String,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<(), String> {
    let token = normalize_token(&token).ok_or("AnimeLib token is empty")?;
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    AnimeLibClient::with_token_and_proxy(token.clone(), proxy)?
        .auth_me()
        .await
        .map_err(|error| format!("AnimeLib rejected the token: {error}"))?;
    save_secret(ANIMELIB_TOKEN_ACCOUNT, &token).map_err(|error| error.to_string())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimeLibAccount {
    pub token_saved: bool,
    pub login: Option<String>,
}

/// Who the stored token belongs to. A saved token the API rejects is reported
/// as saved but nameless, so the settings surface can tell an expired session
/// from a missing one.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn animelib_account(
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<AnimeLibAccount, String> {
    let Some(token) = stored_token() else {
        return Ok(AnimeLibAccount {
            token_saved: false,
            login: None,
        });
    };
    let client = AnimeLibClient::with_token_and_proxy(token, resolve_proxy(proxy_url, proxyUrl))?;
    match client.auth_me_login().await {
        Ok(login) => Ok(AnimeLibAccount {
            token_saved: true,
            login,
        }),
        Err(_) => Ok(AnimeLibAccount {
            token_saved: true,
            login: None,
        }),
    }
}

#[tauri::command]
pub fn animelib_token_clear() {
    delete_secret(ANIMELIB_TOKEN_ACCOUNT);
}

/// Probe AnimeLib through the candidate proxy with the browse list.
///
/// `/constants` is not used here on purpose: its answer is cached per process,
/// so a cached reply would report success for a proxy that never connected.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn animelib_test_connection(
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<String, String> {
    let page = client_for(proxy_url, proxyUrl)?
        .search("", Some(1), &AnimeLibSearchFilters::default())
        .await
        .map_err(|error| error.to_string())?;
    Ok(format!("{} titles", page.items.len()))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchAnimeLibInput {
    pub query: String,
    #[serde(default)]
    pub page: Option<i32>,
    /// Catalog filters; omitted means the site's unfiltered browse list.
    #[serde(default)]
    pub filters: AnimeLibSearchFilters,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimeLibTitleInput {
    /// The `slug` or `slugUrl` from a search result, not the numeric id.
    pub slug: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimeLibEpisodesInput {
    /// The numeric id or the `slugUrl` of the title.
    pub anime_id: String,
}

/// A title and its episode list, answered together.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimeLibTitle {
    pub anime: AnimeLibAnime,
    pub episodes: Vec<AnimeLibEpisode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimeLibPlayersInput {
    pub episode_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimeLibSourcesInput {
    pub episode_id: String,
    /// `<player>:<teamId>`, for example `Kodik:32416`.
    pub variant_id: String,
}

/// Search AnimeLib titles. Returns one page plus whatever pagination the API
/// reports, so the tab can show real last-page information.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn anime_lib_search(
    input: SearchAnimeLibInput,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<AnimeLibSearchPage, String> {
    client_for(proxy_url, proxyUrl)?
        .search(&input.query, input.page, &input.filters)
        .await
        .map_err(|error| error.to_string())
}

/// One random title for the catalog, drawn by the site itself.
///
/// The filters travel with the request, so a random pick still respects the
/// types, genres, years and the 18+ permission the caller chose.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn anime_lib_random(
    filters: AnimeLibSearchFilters,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Option<crate::stream::anime_lib_models::AnimeLibAnime>, String> {
    client_for(proxy_url, proxyUrl)?
        .random(&filters)
        .await
        .map_err(|error| error.to_string())
}

/// The type, status, age and genre choices the catalog filters offer. The list
/// is filtered to the AnimeLib site and cached for twenty minutes.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn anime_lib_constants(
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<AnimeLibConstants, String> {
    client_for(proxy_url, proxyUrl)?
        .constants()
        .await
        .map_err(|error| error.to_string())
}

/// The title and its episode list in one round trip.
///
/// The episode endpoint accepts the same slug the details endpoint does, so
/// both requests go out together instead of the list waiting for the numeric
/// id the details answer carries.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn anime_lib_title(
    input: AnimeLibTitleInput,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<AnimeLibTitle, String> {
    let client = client_for(proxy_url, proxyUrl)?;
    let (anime, episodes) = tokio::join!(client.details(&input.slug), client.episodes(&input.slug));
    Ok(AnimeLibTitle {
        anime: anime.map_err(|error| error.to_string())?,
        episodes: episodes.map_err(|error| error.to_string())?,
    })
}

/// Fetch episodes for an AnimeLib title.
///
/// The player window knows a session by its numeric media id and nothing else,
/// so the season list is still reachable without a slug. The catalog modal
/// takes `anime_lib_title` instead.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn anime_lib_episodes(
    input: AnimeLibEpisodesInput,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<AnimeLibEpisode>, String> {
    client_for(proxy_url, proxyUrl)?
        .episodes(&input.anime_id)
        .await
        .map_err(|error| error.to_string())
}

/// Fetch playback players (voice-overs) for an episode.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn anime_lib_players(
    input: AnimeLibPlayersInput,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<AnimeLibVariant>, String> {
    client_for(proxy_url, proxyUrl)?
        .players(&input.episode_id)
        .await
        .map_err(|error| error.to_string())
}

/// Resolve a voice-over into every playable source it offers.
///
/// The list is handed to the player as it is. Picking the active quality and
/// switching between them happens in the player, so a quality change never
/// touches the source page again.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn anime_lib_stream_sources(
    input: AnimeLibSourcesInput,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<StreamVariant>, String> {
    let sources = client_for(proxy_url, proxyUrl)?
        .resolve_episode_variant(&input.episode_id, &input.variant_id)
        .await
        .map_err(|error| error.to_string())?;
    Ok(keep_playable(sources))
}

/// The watch key a stream session persists its position under.
#[tauri::command]
pub fn anime_lib_watch_key(source_id: String, media_id: String, episode_id: String) -> String {
    build_watch_key(&source_id, &media_id, &episode_id)
}

/// A warm request is a best-effort hit on the media host: it resolves DNS,
/// reaches the CDN edge and pulls the first few dozen kilobytes, so the first
/// real range the player asks for does not pay for a cold connection. The URL
/// comes from a remote catalog, so loopback and private hosts are refused
/// instead of letting the command probe the machine it runs on.
fn warm_target(url: &str) -> Option<url::Url> {
    let parsed = url::Url::parse(url.trim()).ok()?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return None;
    }
    let host = parsed
        .host_str()?
        .trim()
        .trim_start_matches('[')
        .trim_end_matches(']');
    if host.is_empty() || host.eq_ignore_ascii_case("localhost") || host.ends_with(".localhost") {
        return None;
    }
    if let Ok(ip) = host.parse::<std::net::IpAddr>() {
        let allowed = match ip {
            std::net::IpAddr::V4(v4) => {
                !v4.is_private()
                    && !v4.is_loopback()
                    && !v4.is_link_local()
                    && !v4.is_unspecified()
                    && !v4.is_broadcast()
            }
            std::net::IpAddr::V6(v6) => {
                !v6.is_loopback()
                    && !v6.is_unspecified()
                    && !v6.is_unique_local()
                    && !v6.is_unicast_link_local()
            }
        };
        if !allowed {
            return None;
        }
    }
    Some(parsed)
}

fn warm_client(proxy: Option<String>) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
             (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        )
        .connect_timeout(Duration::from_millis(2500))
        .timeout(Duration::from_millis(4500));
    if let Some(proxy) = proxy {
        builder = builder.proxy(reqwest::Proxy::all(&proxy).map_err(|error| error.to_string())?);
    }
    builder.build().map_err(|error| error.to_string())
}

/// Two warm requests at a time are enough for a hover list and keep a fast
/// pointer from opening a dozen connections at once.
static WARM_SEM: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(2);

/// Prefetch the start of a resolved stream URL through the route that will play
/// it. The caller treats this as best effort and never waits for it.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn stream_warm(
    url: String,
    headers: Option<BTreeMap<String, String>>,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<(), String> {
    let target = warm_target(&url).ok_or("unsupported stream URL")?;
    // Dropping a third hover is better than queueing it: the user has already
    // moved on, and the two running warms cover the likely pick.
    let Ok(_permit) = WARM_SEM.try_acquire() else {
        return Ok(());
    };
    let client = warm_client(resolve_proxy(proxy_url, proxyUrl))?;
    let mut request = client
        .get(target)
        .header(reqwest::header::RANGE, "bytes=0-65535");
    for (name, value) in headers.unwrap_or_default() {
        let name = name.trim();
        let value = value.trim();
        if name.is_empty()
            || value.is_empty()
            || name.eq_ignore_ascii_case("range")
            || name.eq_ignore_ascii_case("host")
        {
            continue;
        }
        if let (Ok(name), Ok(value)) = (
            reqwest::header::HeaderName::from_bytes(name.as_bytes()),
            value.parse::<reqwest::header::HeaderValue>(),
        ) {
            request = request.header(name, value);
        }
    }
    let mut response = request.send().await.map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "stream warm answered {}",
            response.status().as_u16()
        ));
    }
    // Stop at 64 KiB: the goal is a warm DNS entry and a warm edge, not a
    // download. A server that ignores Range must not stream a whole episode.
    let mut read = 0usize;
    while let Some(chunk) = response.chunk().await.map_err(|error| error.to_string())? {
        read += chunk.len();
        if read >= 64 * 1024 {
            break;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn search_input_serializes_camel_case_without_a_token() {
        let input: SearchAnimeLibInput =
            serde_json::from_str(r#"{ "query": "naruto", "page": 2 }"#).expect("parses");
        assert_eq!(input.query, "naruto");
        assert_eq!(input.page, Some(2));

        let json = serde_json::to_value(&input).expect("serializes");
        assert_eq!(json["query"], "naruto");
        assert!(json.get("token").is_none(), "the token is not an input");
    }

    #[test]
    fn title_input_takes_a_slug() {
        let input: AnimeLibTitleInput =
            serde_json::from_str(r#"{ "slug": "11--naruto-anime" }"#).expect("parses");
        assert_eq!(input.slug, "11--naruto-anime");
    }

    #[test]
    fn token_normalization_accepts_a_bare_or_bearer_value() {
        assert_eq!(normalize_token("  abc.def  "), Some("abc.def".to_string()));
        assert_eq!(
            normalize_token("Bearer abc.def"),
            Some("abc.def".to_string())
        );
        assert_eq!(
            normalize_token("bearer abc.def"),
            Some("abc.def".to_string())
        );
        assert_eq!(normalize_token("   "), None);
        assert_eq!(normalize_token("Bearer  "), None);
    }

    #[test]
    fn sources_input_takes_the_variant_id() {
        let input: AnimeLibSourcesInput =
            serde_json::from_str(r#"{ "episodeId": "455", "variantId": "Kodik:32416" }"#)
                .expect("parses");
        assert_eq!(input.episode_id, "455");
        assert_eq!(input.variant_id, "Kodik:32416");
    }

    #[test]
    fn a_client_builds_without_a_token() {
        AnimeLibClient::new().expect("no token builds a client");
        AnimeLibClient::with_token("token".to_string()).expect("a token builds a client");
    }

    /// Live check of the one thing the anonymous API cannot answer: whether a
    /// logged-in session exposes the site's own qualities. Save a token in
    /// Settings -> AnimeLib, or pass it as `ANIMELIB_TEST_TOKEN`, then run:
    ///
    /// `cargo test --lib stream::commands::tests::live_native_rows -- --ignored --nocapture`
    #[tokio::test]
    #[ignore = "needs a stored AnimeLib token and the network"]
    async fn live_native_rows_appear_for_a_stored_token() {
        let mut token = std::env::var("ANIMELIB_TEST_TOKEN")
            .ok()
            .and_then(|raw| normalize_token(&raw));
        if token.is_none() {
            for service in ["iluhaAnime", "iluhaAnime.iluhaAnime"] {
                let Ok(entry) = keyring::Entry::new(service, ANIMELIB_TOKEN_ACCOUNT) else {
                    continue;
                };
                let Ok(raw) = entry.get_password() else {
                    continue;
                };
                token = normalize_token(&raw);
                if token.is_some() {
                    break;
                }
            }
        }
        let token = token.expect("save an AnimeLib token in Settings -> AnimeLib first");
        let client = AnimeLibClient::with_token(token).expect("client builds");
        client.auth_me().await.expect("the stored token is valid");

        let episode = "117295"; // Frieren, the episode behind the reported 4K link.
        let players = client.players(episode).await.expect("players answer");
        let native: Vec<_> = players
            .iter()
            .filter(|row| row.player == "Animelib")
            .collect();
        println!(
            "episode {episode}: {} rows, {} native",
            players.len(),
            native.len()
        );
        for row in &native {
            println!("  {} {} {}", row.id, row.name, row.source_url);
        }
        for row in native {
            let variant = format!("Animelib:{}", row.id);
            match client.resolve_episode_variant(episode, &variant).await {
                Ok(sources) => {
                    for source in sources {
                        println!("  {}p {}", source.quality, source.url);
                    }
                }
                Err(error) => println!("  resolve failed: {error}"),
            }
        }
    }

    #[test]
    fn warm_target_accepts_public_http_urls() {
        assert!(warm_target("https://cdn.example/720.m3u8").is_some());
        assert!(warm_target("http://1.2.3.4/stream").is_some());
    }

    #[test]
    fn warm_target_refuses_local_and_private_hosts() {
        assert!(warm_target("file:///C:/video.mp4").is_none());
        assert!(warm_target("http://localhost:8080/").is_none());
        assert!(warm_target("http://127.0.0.1/").is_none());
        assert!(warm_target("http://192.168.1.10/").is_none());
        assert!(warm_target("http://10.0.0.5/").is_none());
        assert!(warm_target("https://[::1]/").is_none());
    }

    #[test]
    fn watch_key_command_matches_the_rust_helper() {
        assert_eq!(
            anime_lib_watch_key("animelib".to_string(), "11".to_string(), "455".to_string()),
            "stream:animelib:11:455"
        );
    }
}
