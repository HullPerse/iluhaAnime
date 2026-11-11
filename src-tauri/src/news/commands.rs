use serde::Serialize;

use crate::news::client;
use crate::news::models::NewsPage;
use crate::scrapers::clients::resolve_proxy;

#[allow(non_snake_case)]
#[tauri::command]
pub async fn news_feed(
    page: u32,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<NewsPage, String> {
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    client::fetch_page(page, proxy).await
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsAnimeLink {
    pub anilist_id: u64,
    pub mal_id: u64,
}

/// Resolves a Shikimori anime to its AniList entry through the MyAnimeList id.
#[allow(non_snake_case)]
#[tauri::command]
pub async fn news_anime_link(
    shikimori_id: u64,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
    anilist_proxy_url: Option<String>,
    anilistProxyUrl: Option<String>,
) -> Result<Option<NewsAnimeLink>, String> {
    let news_proxy = resolve_proxy(proxy_url, proxyUrl);
    let Some(mal_id) = client::fetch_mal_id(shikimori_id, news_proxy).await? else {
        return Ok(None);
    };
    let anilist_proxy = resolve_proxy(anilist_proxy_url, anilistProxyUrl);
    let anilist_id = crate::anilist::media::anime_id_by_mal(mal_id, anilist_proxy).await?;
    Ok(anilist_id.map(|anilist_id| NewsAnimeLink { anilist_id, mal_id }))
}
