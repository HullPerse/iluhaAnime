use tauri::AppHandle;

use super::sampling::{page_query, parse_aliased_page, SampledPage, PER_PAGE};
use super::types::CardKind;
use crate::anilist::client::graphql_request;
use crate::app_db::cache::{put_app_cache, read_cached_payload};

pub const CEILING_TTL_SECONDS: i64 = 7 * 24 * 60 * 60;
/// AniList rejects a page whose `page * perPage` passes 5000 entries.
pub const MAX_PAGE_DEPTH_ENTRIES: u32 = 5_000;
const CACHE_NAMESPACE: &str = "cards";

pub fn max_page_for(per_page: u32) -> u32 {
    (MAX_PAGE_DEPTH_ENTRIES / per_page.max(1)).max(1)
}

fn cache_key(kind: CardKind) -> String {
    format!("ceiling:{}", kind.as_str())
}

/// Last page for a kind, cached for seven days. `pageInfo.lastPage` is the
/// authoritative bound; `total` is only a hint for the payload.
pub async fn page_ceiling(
    app: &AppHandle,
    kind: CardKind,
    per_page: u32,
    token: Option<&str>,
    proxy: Option<&str>,
) -> Result<u32, String> {
    let depth_cap = max_page_for(per_page);
    if let Ok(Some(payload)) = read_cached_payload(app, CACHE_NAMESPACE, &cache_key(kind)) {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&payload) {
            if let Some(last_page) = value["lastPage"].as_u64().filter(|page| *page > 0) {
                return Ok((last_page.min(u64::from(u32::MAX)) as u32).min(depth_cap));
            }
        }
    }
    let response = graphql_request(page_query(kind, &[1], 1), token, proxy).await?;
    let page = parse_aliased_page(kind, 1, &response)?;
    let last_page = page.last_page.max(1);
    put_app_cache(
        app.clone(),
        CACHE_NAMESPACE.to_string(),
        cache_key(kind),
        serde_json::json!({ "lastPage": last_page, "total": page.total }).to_string(),
        Some(CEILING_TTL_SECONDS),
    )?;
    Ok(last_page)
}

async fn fetch_single(
    kind: CardKind,
    page: u32,
    per_page: u32,
    token: Option<&str>,
    proxy: Option<&str>,
) -> Result<SampledPage, String> {
    let response = graphql_request(page_query(kind, &[page], per_page), token, proxy).await?;
    let parsed = parse_aliased_page(kind, page, &response)?;
    if !parsed.nodes.is_empty() || page == 1 {
        return Ok(parsed);
    }
    // The cached ceiling went stale. Clamp to the last page the server named.
    let fallback = parsed.last_page.max(1).min(page);
    if fallback == page {
        return Ok(parsed);
    }
    let response = graphql_request(page_query(kind, &[fallback], per_page), token, proxy).await?;
    parse_aliased_page(kind, fallback, &response)
}

/// Fetches a page set in one aliased request. A failed alias falls back to one
/// request per missing page, and an empty page clamps to the server's last page.
pub async fn fetch_pages(
    kind: CardKind,
    pages: &[u32],
    per_page: u32,
    token: Option<&str>,
    proxy: Option<&str>,
) -> Result<Vec<SampledPage>, String> {
    if pages.is_empty() {
        return Ok(Vec::new());
    }
    let per_page = per_page.clamp(1, PER_PAGE);
    let max_page = max_page_for(per_page);
    let mut clamped: Vec<u32> = Vec::new();
    for page in pages {
        let page = (*page).clamp(1, max_page);
        if !clamped.contains(&page) {
            clamped.push(page);
        }
    }
    match graphql_request(page_query(kind, &clamped, per_page), token, proxy).await {
        Ok(response) => {
            let mut fetched = Vec::new();
            for page in &clamped {
                match parse_aliased_page(kind, *page, &response) {
                    Ok(parsed) => fetched.push(parsed),
                    Err(_) => {
                        fetched.push(fetch_single(kind, *page, per_page, token, proxy).await?)
                    }
                }
            }
            Ok(fetched)
        }
        Err(alias_error) => {
            tracing::warn!(
                kind = kind.as_str(),
                error = alias_error.as_str(),
                "card page alias request failed, falling back"
            );
            let mut fetched = Vec::new();
            for page in &clamped {
                fetched.push(fetch_single(kind, *page, per_page, token, proxy).await?);
            }
            Ok(fetched)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_cache_key_is_stable_per_kind() {
        assert_eq!(cache_key(CardKind::Anime), "ceiling:anime");
        assert_eq!(cache_key(CardKind::Studio), "ceiling:studio");
    }

    #[test]
    fn the_ttl_is_seven_days() {
        assert_eq!(CEILING_TTL_SECONDS, 604_800);
    }

    #[test]
    fn the_page_depth_cap_matches_the_anilist_limit() {
        assert_eq!(max_page_for(50), 100);
        assert_eq!(max_page_for(25), 200);
        assert_eq!(max_page_for(0), 5_000);
    }
}
