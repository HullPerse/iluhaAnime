use std::collections::HashMap;

use tauri::AppHandle;

use super::sampling::{
    batch_page_query, page_query, parse_aliased_page, parse_batch_page, SampledPage, PER_PAGE,
};
use super::types::CardKind;
use crate::anilist::client::graphql_request_background;
use crate::app_db::cache::{put_app_cache, read_cached_payload};

pub(super) fn can_retry_smaller_query(error: &str) -> bool {
    error.starts_with("AniList HTTP 400")
        || error.starts_with("AniList HTTP 413")
        || error.starts_with("AniList GraphQL error:")
        || error.starts_with("AniList GraphQL error 400:")
}

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

/// The ceiling query asks for one item per page, so `PageInfo.lastPage` is the
/// total item count, not the last page at the caller's page size. Store and
/// convert the total instead; the old `lastPage` payload is still read as a
/// total so an existing cache survives the upgrade.
fn ceiling_pages(total: u64, per_page: u32) -> u32 {
    let per_page = per_page.max(1);
    let pages = total.div_ceil(u64::from(per_page));
    (pages.min(u64::from(u32::MAX)) as u32).clamp(1, max_page_for(per_page))
}

fn ceiling_from_payload(payload: &str, per_page: u32) -> Option<u32> {
    let value = serde_json::from_str::<serde_json::Value>(payload).ok()?;
    let total = value["total"]
        .as_u64()
        .or_else(|| value["lastPage"].as_u64())?;
    Some(ceiling_pages(total, per_page))
}

fn cached_ceiling(app: &AppHandle, kind: CardKind, per_page: u32) -> Option<u32> {
    let payload = read_cached_payload(app, CACHE_NAMESPACE, &cache_key(kind)).ok()??;
    ceiling_from_payload(&payload, per_page)
}

fn store_ceiling(app: &AppHandle, kind: CardKind, total: u32) -> Result<(), String> {
    put_app_cache(
        app.clone(),
        CACHE_NAMESPACE.to_string(),
        cache_key(kind),
        serde_json::json!({ "total": total }).to_string(),
        Some(CEILING_TTL_SECONDS),
    )
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
    if let Some(cached) = cached_ceiling(app, kind, per_page) {
        return Ok(cached);
    }
    let response = graphql_request_background(page_query(kind, &[1], 1), token, proxy).await?;
    let page = parse_aliased_page(kind, 1, &response)?;
    let total = u32::try_from(page.total.max(1)).unwrap_or(u32::MAX);
    store_ceiling(app, kind, total)?;
    Ok(ceiling_pages(u64::from(total), per_page))
}

/// Resolves several kind ceilings with one aliased request and refills the
/// seven-day cache. Only cache misses are fetched in the batch.
pub async fn batch_page_ceilings(
    app: &AppHandle,
    kinds: &[CardKind],
    per_page: u32,
    proxy: Option<&str>,
) -> Result<HashMap<CardKind, u32>, String> {
    let mut ceilings: HashMap<CardKind, u32> = HashMap::new();
    let mut missing: Vec<CardKind> = Vec::new();
    for kind in kinds {
        match cached_ceiling(app, *kind, per_page) {
            Some(value) => {
                ceilings.insert(*kind, value);
            }
            None => {
                if !missing.contains(kind) {
                    missing.push(*kind);
                }
            }
        }
    }
    if missing.is_empty() {
        return Ok(ceilings);
    }
    let entries: Vec<(CardKind, u32)> = missing.iter().map(|kind| (*kind, 1)).collect();
    let response = graphql_request_background(batch_page_query(&entries, 1), None, proxy).await?;
    for kind in missing {
        let page = parse_batch_page(kind, 1, &response)?;
        let total = u32::try_from(page.total.max(1)).unwrap_or(u32::MAX);
        store_ceiling(app, kind, total)?;
        ceilings.insert(kind, ceiling_pages(u64::from(total), per_page));
    }
    Ok(ceilings)
}

async fn fetch_single(
    kind: CardKind,
    page: u32,
    per_page: u32,
    token: Option<&str>,
    proxy: Option<&str>,
) -> Result<SampledPage, String> {
    let response =
        graphql_request_background(page_query(kind, &[page], per_page), token, proxy).await?;
    let parsed = parse_aliased_page(kind, page, &response)?;
    if !parsed.nodes.is_empty() || page == 1 {
        return Ok(parsed);
    }
    // The cached ceiling went stale. Clamp to the last page the server named.
    let fallback = parsed.last_page.max(1).min(page);
    if fallback == page {
        return Ok(parsed);
    }
    let response =
        graphql_request_background(page_query(kind, &[fallback], per_page), token, proxy).await?;
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
    match graphql_request_background(page_query(kind, &clamped, per_page), token, proxy).await {
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
        Err(alias_error) if can_retry_smaller_query(&alias_error) => {
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
        Err(error) => Err(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transport_and_rate_limit_failures_do_not_trigger_smaller_batches() {
        for error in [
            "AniList rate limit exceeded",
            "AniList request failed: timed out",
            "AniList HTTP 503 Service Unavailable",
            "AniList HTTP 403",
            "AniList GraphQL error 429: Too many requests",
        ] {
            assert!(!can_retry_smaller_query(error), "{error}");
        }
        assert!(can_retry_smaller_query(
            "AniList HTTP 413 Payload Too Large"
        ));
        assert!(can_retry_smaller_query(
            "AniList GraphQL error 400: Query is too complex"
        ));
    }

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

    #[test]
    fn a_ceiling_is_derived_from_the_total_and_page_size() {
        assert_eq!(ceiling_pages(0, 25), 1);
        assert_eq!(ceiling_pages(1, 25), 1);
        assert_eq!(ceiling_pages(75, 25), 3);
        assert_eq!(ceiling_pages(76, 25), 4);
        assert_eq!(ceiling_pages(5_000, 50), 100);
        assert_eq!(ceiling_pages(5_001, 25), 200);
    }

    #[test]
    fn an_old_last_page_payload_is_read_as_a_total() {
        assert_eq!(ceiling_from_payload(r#"{"lastPage":200}"#, 25), Some(8));
        assert_eq!(ceiling_from_payload(r#"{"total":200}"#, 25), Some(8));
    }
}
