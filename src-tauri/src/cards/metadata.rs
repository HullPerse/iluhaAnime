use serde_json::{json, Value};
use tauri::AppHandle;

use super::rarity::score_for;
use super::types::CardKind;
use crate::anilist::auth::optional_token;
use crate::anilist::client::{graphql_request, graphql_request_background};
use crate::app_db::cards::{get_meta, upsert_meta, CardMetaRow};
use crate::app_db::db::{
    lock_app_data_write_timeout, now_seconds, open_database, APP_DATA_WRITE_TIMEOUT,
};

pub const META_TTL_SECONDS: i64 = 7 * 24 * 60 * 60;
pub const META_CHUNK: usize = 25;
pub const STUDIO_COLLAGE_SIZE: usize = 4;

pub fn is_fresh(fetched_at: i64, now: i64) -> bool {
    fetched_at >= now.saturating_sub(META_TTL_SECONDS)
}

/// Anime and manga metadata can be written from the `CardNode` that was
/// already sampled. Characters still need their primary collection link and
/// studios need their collage, so only those kinds require a remote refresh.
pub fn needs_remote_metadata(kind: CardKind) -> bool {
    matches!(kind, CardKind::Character | CardKind::Studio)
}

/// Studios store their 2x2 collage in the shared metadata row. A cached row
/// with an empty or legacy collage is not usable, even when its timestamp is
/// fresh. `expected` records how many covers a successful fetch returned, so
/// studios with fewer than four works are cached as complete instead of being
/// refreshed on every preparation pass.
pub fn studio_collage_missing(
    kind: CardKind,
    collage_json: Option<&str>,
    expected: Option<i64>,
) -> bool {
    if kind != CardKind::Studio {
        return false;
    }
    let Some(expected) = expected.filter(|count| *count >= 0) else {
        return true;
    };
    let Some(covers) = collage_json.and_then(|json| serde_json::from_str::<Vec<String>>(json).ok())
    else {
        return true;
    };
    let covers = covers
        .iter()
        .filter(|cover| !cover.trim().is_empty())
        .count();
    covers as i64 != expected
}

/// Deduplicated id chunks of at most 25.
pub fn chunks(ids: &[i64]) -> Vec<Vec<i64>> {
    let mut unique: Vec<i64> = Vec::new();
    for id in ids {
        if *id > 0 && !unique.contains(id) {
            unique.push(*id);
        }
    }
    unique.chunks(META_CHUNK).map(<[i64]>::to_vec).collect()
}

fn ids_array(ids: &[i64]) -> String {
    ids.iter().map(i64::to_string).collect::<Vec<_>>().join(",")
}

fn media_fragment(ids: &[i64], media_type: &str) -> String {
    format!(
        "Page(page: 1, perPage: {META_CHUNK}) {{ media(id_in: [{}], type: {media_type}) {{ \
         id title {{ romaji english }} coverImage {{ large }} favourites popularity }} }}",
        ids_array(ids)
    )
}

fn character_fragment(ids: &[i64]) -> String {
    format!(
        "Page(page: 1, perPage: {META_CHUNK}) {{ characters(id_in: [{}]) {{ \
         id name {{ full }} image {{ large }} favourites \
         media(sort: [POPULARITY_DESC], perPage: 1, type: ANIME) {{ nodes {{ \
         id title {{ romaji }} coverImage {{ large }} popularity }} }} \
         manga: media(sort: [POPULARITY_DESC], perPage: 1, type: MANGA) {{ nodes {{ \
         id title {{ romaji }} coverImage {{ large }} }} }} }} }}",
        ids_array(ids)
    )
}

fn staff_fragment(ids: &[i64]) -> String {
    format!(
        "Page(page: 1, perPage: {META_CHUNK}) {{ staff(id_in: [{}]) {{ \
         id name {{ full }} image {{ large }} favourites }} }}",
        ids_array(ids)
    )
}

fn studio_fragment(id: i64) -> String {
    format!(
        "Studio(id: {id}) {{ id name favourites \
         media(sort: [POPULARITY_DESC], perPage: {STUDIO_COLLAGE_SIZE}) {{ \
         nodes {{ coverImage {{ large }} }} }} }}"
    )
}

fn page_fragment(kind: CardKind, ids: &[i64]) -> String {
    match kind {
        CardKind::Anime => media_fragment(ids, "ANIME"),
        CardKind::Manga => media_fragment(ids, "MANGA"),
        CardKind::Character => character_fragment(ids),
        CardKind::Staff => staff_fragment(ids),
        CardKind::Studio => String::new(),
    }
}

fn text(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn favourites(node: &Value) -> u32 {
    node["favourites"]
        .as_u64()
        .unwrap_or(0)
        .min(u64::from(u32::MAX)) as u32
}

fn popularity(node: &Value) -> u32 {
    node["popularity"]
        .as_u64()
        .unwrap_or(0)
        .min(u64::from(u32::MAX)) as u32
}

fn media_popularity(node: &Value) -> u32 {
    popularity(&node["media"]["nodes"][0])
}

fn popularity_for(kind: CardKind, node: &Value) -> u32 {
    match kind {
        CardKind::Character => media_popularity(node),
        _ => popularity(node),
    }
}

fn score(kind: CardKind, node: &Value) -> i64 {
    score_for(kind, favourites(node), popularity_for(kind, node)).round() as i64
}

fn title_for(kind: CardKind, node: &Value, id: i64) -> String {
    match kind {
        CardKind::Anime | CardKind::Manga => text(&node["title"]["romaji"])
            .or_else(|| text(&node["title"]["english"]))
            .unwrap_or_else(|| format!("Media {id}")),
        CardKind::Character | CardKind::Staff => {
            text(&node["name"]["full"]).unwrap_or_else(|| format!("Entity {id}"))
        }
        CardKind::Studio => text(&node["name"]).unwrap_or_else(|| format!("Studio {id}")),
    }
}

fn image_for(kind: CardKind, node: &Value) -> Option<String> {
    match kind {
        CardKind::Anime | CardKind::Manga => text(&node["coverImage"]["large"]),
        CardKind::Character | CardKind::Staff => text(&node["image"]["large"]),
        CardKind::Studio => None,
    }
}

fn primary_media(node: &Value) -> (Option<i64>, Option<String>, Option<String>) {
    let media = &node["media"]["nodes"][0];
    (
        media["id"].as_i64().filter(|id| *id > 0),
        text(&media["title"]["romaji"]),
        text(&media["coverImage"]["large"]),
    )
}

fn primary_manga(node: &Value) -> (Option<i64>, Option<String>, Option<String>) {
    let media = &node["manga"]["nodes"][0];
    (
        media["id"].as_i64().filter(|id| *id > 0),
        text(&media["title"]["romaji"]),
        text(&media["coverImage"]["large"]),
    )
}

pub fn parse_meta(kind: CardKind, node: &Value, fetched_at: i64) -> Option<CardMetaRow> {
    let entity_id = node["id"].as_i64().filter(|id| *id > 0)?;
    let (collection_anime_id, collection_manga_id, collection_title, collection_cover_url) =
        match kind {
            CardKind::Character => {
                let anime = primary_media(node);
                if anime.0.is_some() || anime.1.is_some() || anime.2.is_some() {
                    (anime.0, None, anime.1, anime.2)
                } else {
                    // Manga-only characters keep a display-only source. The
                    // anime id stays empty so they never create an anime
                    // collection; the manga id creates a manga collection.
                    let manga = primary_manga(node);
                    (None, manga.0, manga.1, manga.2)
                }
            }
            _ => (None, None, None, None),
        };
    let (collage_json, collage_expected) = if kind == CardKind::Studio {
        let covers: Vec<String> = node["media"]["nodes"]
            .as_array()
            .map(|nodes| {
                nodes
                    .iter()
                    .filter_map(|node| text(&node["coverImage"]["large"]))
                    .take(STUDIO_COLLAGE_SIZE)
                    .collect()
            })
            .unwrap_or_default();
        (
            Some(serde_json::to_string(&covers).ok()?),
            Some(covers.len() as i64),
        )
    } else {
        (None, None)
    };
    Some(CardMetaRow {
        kind,
        entity_id,
        title: title_for(kind, node, entity_id),
        image_url: image_for(kind, node),
        score: Some(score(kind, node)),
        popularity: Some(i64::from(popularity_for(kind, node))),
        favourites: Some(i64::from(favourites(node))),
        collection_anime_id,
        collection_manga_id,
        collection_title,
        collection_cover_url,
        collage_json,
        collage_expected,
        fetched_at,
        preferred_image_url: None,
    })
}

/// Fetches missing or stale metadata. One request carries every kind chunk and
/// every studio alias of the batch, so five starter packs cost one metadata
/// round trip instead of one per kind (and one per studio).
pub async fn refresh_metadata(
    app: &AppHandle,
    cards: &[(CardKind, i64)],
    proxy: Option<&str>,
) -> Result<usize, String> {
    refresh_metadata_impl(app, cards, proxy, true)
        .await
        .map(|(count, _)| count)
}

pub(super) async fn refresh_metadata_with_changes(
    app: &AppHandle,
    cards: &[(CardKind, i64)],
    proxy: Option<&str>,
) -> Result<(usize, bool), String> {
    refresh_metadata_impl(app, cards, proxy, false).await
}

async fn refresh_metadata_impl(
    app: &AppHandle,
    cards: &[(CardKind, i64)],
    proxy: Option<&str>,
    background: bool,
) -> Result<(usize, bool), String> {
    let connection = open_database(app)?;
    let now = now_seconds();
    let mut stale: Vec<(CardKind, i64)> = Vec::new();
    for (kind, entity_id) in cards {
        let fresh = get_meta(&connection, *kind, *entity_id)?.is_some_and(|meta| {
            let source_missing = *kind == CardKind::Character
                && meta.collection_anime_id.is_none()
                && meta.collection_manga_id.is_none();
            let collage_missing =
                studio_collage_missing(*kind, meta.collage_json.as_deref(), meta.collage_expected);
            is_fresh(meta.fetched_at, now) && !source_missing && !collage_missing
        });
        if !fresh {
            stale.push((*kind, *entity_id));
        }
    }
    drop(connection);
    if stale.is_empty() {
        return Ok((0, false));
    }
    let token = optional_token(app);
    let mut parts: Vec<String> = Vec::new();
    let mut page_aliases: Vec<(String, CardKind)> = Vec::new();
    let mut studio_aliases: Vec<String> = Vec::new();
    for kind in CardKind::ALL {
        let ids: Vec<i64> = stale
            .iter()
            .filter(|(stale_kind, _)| *stale_kind == kind)
            .map(|(_, id)| *id)
            .collect();
        if ids.is_empty() {
            continue;
        }
        if kind == CardKind::Studio {
            for id in ids {
                let alias = format!("studio_{id}");
                parts.push(format!("{alias}: {}", studio_fragment(id)));
                studio_aliases.push(alias);
            }
            continue;
        }
        for (index, chunk) in chunks(&ids).into_iter().enumerate() {
            let alias = format!("{}_{index}", kind.as_str());
            parts.push(format!("{alias}: {}", page_fragment(kind, &chunk)));
            page_aliases.push((alias, kind));
        }
    }
    let body = json!({ "query": format!("query {{ {} }}", parts.join(" ")) });
    let response = if background {
        graphql_request_background(body, token.as_deref(), proxy).await?
    } else {
        graphql_request(body, token.as_deref(), proxy).await?
    };
    let mut rows: Vec<CardMetaRow> = Vec::new();
    for (alias, kind) in page_aliases {
        let value = &response["data"][alias.as_str()];
        let key = match kind {
            CardKind::Anime | CardKind::Manga => "media",
            CardKind::Character => "characters",
            CardKind::Staff => "staff",
            CardKind::Studio => continue,
        };
        if let Some(nodes) = value[key].as_array() {
            for node in nodes {
                if let Some(meta) = parse_meta(kind, node, now) {
                    rows.push(meta);
                }
            }
        }
    }
    for alias in studio_aliases {
        if let Some(meta) = parse_meta(CardKind::Studio, &response["data"][alias.as_str()], now) {
            rows.push(meta);
        }
    }
    if rows.is_empty() {
        return Ok((0, false));
    }
    let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
    let connection = open_database(app)?;
    let mut changed = false;
    for row in &rows {
        if !changed {
            changed = get_meta(&connection, row.kind, row.entity_id)?.is_none_or(|mut previous| {
                previous.fetched_at = row.fetched_at;
                previous
                    .preferred_image_url
                    .clone_from(&row.preferred_image_url);
                previous != *row
            });
        }
        upsert_meta(&connection, row)?;
    }
    Ok((rows.len(), changed))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn freshness_expires_after_seven_days() {
        let now = 1_000_000;
        assert!(is_fresh(now, now));
        assert!(is_fresh(now - META_TTL_SECONDS, now));
        assert!(!is_fresh(now - META_TTL_SECONDS - 1, now));
    }

    #[test]
    fn chunks_dedupe_and_split_at_twenty_five() {
        let ids: Vec<i64> = (1..=30).chain([5, 0, -1]).collect();
        let chunks = chunks(&ids);
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].len(), 25);
        assert_eq!(chunks[1], vec![26, 27, 28, 29, 30]);
    }

    #[test]
    fn anime_metadata_parses_title_cover_and_stats() {
        let node = json!({
            "id": 16498,
            "title": { "romaji": "Shingeki no Kyojin", "english": "Attack on Titan" },
            "coverImage": { "large": "https://img/aot.jpg" },
            "favourites": 80_784,
            "popularity": 1_077_853
        });
        let meta = parse_meta(CardKind::Anime, &node, 100).unwrap();
        assert_eq!(meta.title, "Shingeki no Kyojin");
        assert_eq!(meta.image_url.as_deref(), Some("https://img/aot.jpg"));
        assert_eq!(meta.favourites, Some(80_784));
        assert!(meta.score.unwrap() > 0);
        assert!(meta.collection_anime_id.is_none());
        assert!(meta.collection_manga_id.is_none());
    }

    #[test]
    fn character_metadata_keeps_its_primary_anime() {
        let node = json!({
            "id": 45627,
            "name": { "full": "Levi" },
            "image": { "large": "https://img/levi.jpg" },
            "favourites": 38_718,
            "media": { "nodes": [{
                "id": 16498,
                "title": { "romaji": "Shingeki no Kyojin" },
                "coverImage": { "large": "https://img/aot.jpg" },
                "popularity": 1_077_853
            }] }
        });
        let meta = parse_meta(CardKind::Character, &node, 100).unwrap();
        assert_eq!(meta.popularity, Some(1_077_853));
        assert_eq!(meta.collection_anime_id, Some(16498));
        assert!(meta.collection_manga_id.is_none());
        assert_eq!(meta.collection_title.as_deref(), Some("Shingeki no Kyojin"));
        assert_eq!(
            meta.collection_cover_url.as_deref(),
            Some("https://img/aot.jpg")
        );
        assert!(meta.image_url.is_some());
    }

    #[test]
    fn character_metadata_falls_back_to_the_primary_manga() {
        let node = json!({
            "id": 270493,
            "name": { "full": "Manga-only character" },
            "image": { "large": "https://img/character.jpg" },
            "favourites": 142,
            "media": { "nodes": [] },
            "manga": { "nodes": [{
                "id": 13,
                "title": { "romaji": "One Piece" },
                "coverImage": { "large": "https://img/one-piece.jpg" }
            }] }
        });
        let meta = parse_meta(CardKind::Character, &node, 100).unwrap();
        assert!(meta.collection_anime_id.is_none());
        assert_eq!(meta.collection_manga_id, Some(13));
        assert_eq!(meta.collection_title.as_deref(), Some("One Piece"));
        assert_eq!(
            meta.collection_cover_url.as_deref(),
            Some("https://img/one-piece.jpg")
        );
    }

    #[test]
    fn studio_metadata_builds_the_collage_and_has_no_image() {
        let node = json!({
            "id": 2,
            "name": "Kyoto Animation",
            "favourites": 23_496,
            "media": { "nodes": [
                { "coverImage": { "large": "https://img/1.jpg" } },
                { "coverImage": { "large": "https://img/2.jpg" } },
                { "coverImage": { "large": "https://img/3.jpg" } },
                { "coverImage": { "large": "https://img/4.jpg" } },
                { "coverImage": { "large": "https://img/5.jpg" } }
            ] }
        });
        let meta = parse_meta(CardKind::Studio, &node, 100).unwrap();
        assert!(meta.image_url.is_none());
        let covers: Vec<String> =
            serde_json::from_str(meta.collage_json.as_deref().unwrap()).unwrap();
        assert_eq!(covers.len(), 4);
        assert_eq!(covers[0], "https://img/1.jpg");
        assert_eq!(meta.collage_expected, Some(4));
    }

    #[test]
    fn studio_metadata_keeps_fewer_than_four_covers() {
        let node = json!({
            "id": 123,
            "name": "Small Studio",
            "favourites": 10,
            "media": { "nodes": [
                { "coverImage": { "large": "https://img/1.jpg" } },
                { "coverImage": { "large": "https://img/2.jpg" } }
            ] }
        });
        let meta = parse_meta(CardKind::Studio, &node, 100).unwrap();
        let covers: Vec<String> =
            serde_json::from_str(meta.collage_json.as_deref().unwrap()).unwrap();
        assert_eq!(covers, vec!["https://img/1.jpg", "https://img/2.jpg"]);
        assert_eq!(meta.collage_expected, Some(2));
        assert!(!studio_collage_missing(
            meta.kind,
            meta.collage_json.as_deref(),
            meta.collage_expected
        ));
    }

    #[test]
    fn fragments_send_the_expected_id_filter() {
        let anime = media_fragment(&[1, 2], "ANIME");
        assert!(anime.contains("media(id_in: [1,2], type: ANIME)"));
        let manga = media_fragment(&[3], "MANGA");
        assert!(manga.contains("media(id_in: [3], type: MANGA)"));
        let character = character_fragment(&[45627]);
        assert!(character.contains("characters(id_in: [45627])"));
        assert!(character.contains("type: ANIME"));
        assert!(
            character.contains("manga: media(sort: [POPULARITY_DESC], perPage: 1, type: MANGA)")
        );
        assert!(character.contains("nodes { id title { romaji } coverImage { large } }"));
        let studio = studio_fragment(2);
        assert!(studio.contains("Studio(id: 2)"));
        assert!(studio.contains("media(sort: [POPULARITY_DESC], perPage: 4)"));
        // Studio.media accepts sort/isMain/onList/page/perPage, not MediaType.
        assert!(!studio.contains("type: ANIME"));
    }

    #[test]
    fn studio_collage_completeness_uses_the_expected_count() {
        assert!(!studio_collage_missing(CardKind::Anime, Some("[]"), None));
        assert!(studio_collage_missing(CardKind::Studio, None, Some(0)));
        assert!(studio_collage_missing(CardKind::Studio, Some("[]"), None));
        assert!(studio_collage_missing(
            CardKind::Studio,
            Some("[]"),
            Some(1)
        ));
        assert!(!studio_collage_missing(
            CardKind::Studio,
            Some("[]"),
            Some(0)
        ));
        assert!(studio_collage_missing(
            CardKind::Studio,
            Some("[\"https://img/1.jpg\"]"),
            Some(4)
        ));
        assert!(!studio_collage_missing(
            CardKind::Studio,
            Some("[\"https://img/1.jpg\"]"),
            Some(1)
        ));
        assert!(!studio_collage_missing(
            CardKind::Studio,
            Some("[\"https://img/1.jpg\",\"\"]"),
            Some(1)
        ));
    }
}
