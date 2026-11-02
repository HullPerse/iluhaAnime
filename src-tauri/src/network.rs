//! Reachability probe for the offline banner.
//!
//! `navigator.onLine` only says that Windows has a network interface. A VPN
//! that drops traffic or a resolver that stopped answering still reports
//! "online", leaving the user with failing tabs and no explanation. This probe
//! tests the two hosts the app actually needs, through the same proxies.

use std::time::Duration;

use crate::scrapers::clients::resolve_proxy;

fn probe_client(proxy: Option<String>) -> Option<reqwest::Client> {
    let mut builder = reqwest::Client::builder()
        .connect_timeout(Duration::from_millis(2500))
        .timeout(Duration::from_millis(4000));
    if let Some(proxy) = proxy {
        builder = builder.proxy(reqwest::Proxy::all(&proxy).ok()?);
    }
    builder.build().ok()
}

async fn anilist_answers(proxy: Option<String>) -> bool {
    let Some(client) = probe_client(proxy) else {
        return false;
    };
    match client
        .post("https://graphql.anilist.co")
        .json(&serde_json::json!({ "query": "{__typename}" }))
        .send()
        .await
    {
        Ok(response) => response.status().is_success(),
        Err(_) => false,
    }
}

async fn animelib_answers(proxy: Option<String>) -> bool {
    let Some(client) = probe_client(proxy) else {
        return false;
    };
    match client.get("https://animelib.org/").send().await {
        Ok(response) => response.status().is_success(),
        Err(_) => false,
    }
}

/// True when either catalog host answers. Both are tried in parallel so a
/// blocked AniList does not report the whole connection as dead.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn network_probe(
    anilist_proxy_url: Option<String>,
    anilistProxyUrl: Option<String>,
    animelib_proxy_url: Option<String>,
    animelibProxyUrl: Option<String>,
) -> bool {
    let anilist = resolve_proxy(anilist_proxy_url, anilistProxyUrl);
    let animelib = resolve_proxy(animelib_proxy_url, animelibProxyUrl);
    let (anilist, animelib) = tokio::join!(anilist_answers(anilist), animelib_answers(animelib));
    anilist || animelib
}
