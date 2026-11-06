//! Streaming source integration for `AnimeLib`.
//!
//! Direct Rust HTTP client that resolves `AnimeLib` episodes into playable media
//! URLs and feeds them into the existing libmpv player integration

pub mod anime_lib_client;
pub mod anime_lib_models;
pub mod anime_lib_resolver;
pub mod commands;
pub mod kodik;
pub mod prefs;

pub use commands::*;

#[cfg(test)]
mod live_route_tests {
    use std::time::Duration;

    use super::anime_lib_client::{AnimeLibClient, USER_AGENT};
    use super::anime_lib_models::StreamVariant;

    async fn measure(proxy: Option<&str>, source: &StreamVariant) -> Option<(u128, u16)> {
        let mut builder = reqwest::Client::builder()
            .timeout(Duration::from_secs(12))
            .user_agent(USER_AGENT);
        if let Some(proxy) = proxy {
            builder = builder.proxy(reqwest::Proxy::all(proxy).ok()?);
        }
        let client = builder.build().ok()?;
        let mut request = client.get(&source.url).header("Range", "bytes=0-65535");
        for (name, value) in &source.headers {
            let Ok(name) = reqwest::header::HeaderName::from_bytes(name.as_bytes()) else {
                continue;
            };
            let Ok(value) = value.parse::<reqwest::header::HeaderValue>() else {
                continue;
            };
            request = request.header(name, value);
        }
        let started = std::time::Instant::now();
        let response = request.send().await.ok()?;
        Some((started.elapsed().as_millis(), response.status().as_u16()))
    }

    /// Live route measurement: resolve one Kodik source through the proxy, then
    /// time the first 64 KiB direct and through the proxy.
    ///
    /// Run with:
    /// `ILUHA_TEST_PROXY=socks5h://127.0.0.1:10808 cargo test --lib live_route_probe -- --ignored --nocapture`
    #[tokio::test]
    #[ignore = "live network check: set ILUHA_TEST_PROXY to a working proxy"]
    async fn live_route_probe() {
        let proxy = std::env::var("ILUHA_TEST_PROXY").expect("set ILUHA_TEST_PROXY");
        let client = AnimeLibClient::with_proxy(Some(proxy.clone())).expect("client");
        let players = client.players("117295").await.expect("players");
        let row = players
            .iter()
            .find(|row| row.player == "Kodik")
            .or_else(|| players.first())
            .expect("a player row");
        let variant = format!("{}:{}", row.player, row.id);
        let sources = client
            .resolve_episode_variant("117295", &variant)
            .await
            .expect("sources");
        let source = sources.first().expect("a source");

        println!("source: {} {}", source.label, source.url);
        let direct = measure(None, source).await;
        let proxied = measure(Some(&proxy), source).await;
        println!("direct: {direct:?}");
        println!("proxy:  {proxied:?}");
        assert!(
            direct.is_some() || proxied.is_some(),
            "neither route answered"
        );
    }
}
