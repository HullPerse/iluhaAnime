//! AnimeLib Tauri commands.
//!
//! Commands exposed to the frontend for searching, browsing and resolving
//! AnimeLib playback sources. The catalog works without a credential: the API
//! answers anonymously, and a token stored in the OS keyring is sent only when
//! one exists. The token never travels through an IPC input.
//!
//! There is no OAuth command. A login flow against an unconfirmed client id
//! was removed on 2026-10-28 rather than left as a button that hangs; the
//! conditions for bringing one back are in `.docs/features/streaming/auth.md`.

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
const ANIMELIB_TOKEN_ACCOUNT: &str = "animelib.token";

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

#[tauri::command]
pub fn animelib_token_status() -> bool {
    stored_token().is_some()
}

#[tauri::command]
pub fn animelib_token_clear() {
    delete_secret(ANIMELIB_TOKEN_ACCOUNT);
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
    fn watch_key_command_matches_the_rust_helper() {
        assert_eq!(
            anime_lib_watch_key("animelib".to_string(), "11".to_string(), "455".to_string()),
            "stream:animelib:11:455"
        );
    }
}
