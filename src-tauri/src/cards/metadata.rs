use serde_json::{json, Value};
use tauri::AppHandle;

use super::rarity::score_for;
use super::types::CardKind;
use crate::anilist::auth::optional_token;
use crate::anilist::client::graphql_request;
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

pub fn anime_query(ids: &[i64]) -> Value {
    media_query(ids, "ANIME")
}

pub fn manga_query(ids: &[i64]) -> Value {
    media_query(ids, "MANGA")
}

fn media_query(ids: &[i64], media_type: &str) -> Value {
    json!({
        "query": format!(
            "query {{ Page(page: 1, perPage: {META_CHUNK}) {{ media(id_in: [{}], type: {media_type}) {{ \
             id title {{ romaji english }} coverImage {{ large }} favourites popularity }} }} }}",
            ids_array(ids)
        )
    })
}

pub fn character_query(ids: &[i64]) -> Value {
    json!({
        "query": format!(
            "query {{ Page(page: 1, perPage: {META_CHUNK}) {{ characters(id_in: [{}]) {{ \
             id name {{ full }} image {{ large }} favourites \
             media(sort: [POPULARITY_DESC], perPage: 1, type: ANIME) {{ nodes {{ \
             id title {{ romaji }} coverImage {{ large }} popularity }} }} \
             manga: media(sort: [POPULARITY_DESC], perPage: 1, type: MANGA) {{ nodes {{ \
             title {{ romaji }} coverImage {{ large }} }} }} }} }} }}",
            ids_array(ids)
        )
    })
}

pub fn staff_query(ids: &[i64]) -> Value {
    json!({
        "query": format!(
            "query {{ Page(page: 1, perPage: {META_CHUNK}) {{ staff(id_in: [{}]) {{ \
             id name {{ full }} image {{ large }} favourites }} }} }}",
            ids_array(ids)
        )
    })
}

pub fn studio_query(id: i64) -> Value {
    json!({
        "query": format!(
            "query {{ Studio(id: {id}) {{ id name favourites \
             media(sort: [POPULARITY_DESC], perPage: {STUDIO_COLLAGE_SIZE}, type: ANIME) {{ \
             nodes {{ coverImage {{ large }} }} }} }} }}"
        )
    })
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
    let collage_json = if kind == CardKind::Studio {
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
        Some(serde_json::to_string(&covers).ok()?)
    } else {
        None
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
        fetched_at,
        preferred_image_url: None,
    })
}

async fn refresh_chunk(
    kind: CardKind,
    ids: &[i64],
    token: Option<&str>,
    proxy: Option<&str>,
    now: i64,
    rows: &mut Vec<CardMetaRow>,
) -> Result<(), String> {
    let body = match kind {
        CardKind::Anime => anime_query(ids),
        CardKind::Manga => manga_query(ids),
        CardKind::Character => character_query(ids),
        CardKind::Staff => staff_query(ids),
        CardKind::Studio => return Ok(()),
    };
    let response = graphql_request(body, token, proxy).await?;
    let key = match kind {
        CardKind::Anime | CardKind::Manga => "media",
        CardKind::Character => "characters",
        CardKind::Staff => "staff",
        CardKind::Studio => return Ok(()),
    };
    if let Some(nodes) = response["data"]["Page"][key].as_array() {
        for node in nodes {
            if let Some(meta) = parse_meta(kind, node, now) {
                rows.push(meta);
            }
        }
    }
    Ok(())
}

/// Fetches missing or stale metadata. Studios are fetched one by one because
/// `Studio(id:)` is the only query that returns the top media covers.
pub async fn refresh_metadata(
    app: &AppHandle,
    cards: &[(CardKind, i64)],
    proxy: Option<&str>,
) -> Result<usize, String> {
    let connection = open_database(app)?;
    let now = now_seconds();
    let mut stale: Vec<(CardKind, i64)> = Vec::new();
    for (kind, entity_id) in cards {
        let fresh = get_meta(&connection, *kind, *entity_id)?.is_some_and(|meta| {
            let source_missing = *kind == CardKind::Character
                && meta.collection_anime_id.is_none()
                && meta.collection_manga_id.is_none();
            is_fresh(meta.fetched_at, now) && !source_missing
        });
        if !fresh {
            stale.push((*kind, *entity_id));
        }
    }
    drop(connection);
    if stale.is_empty() {
        return Ok(0);
    }
    let token = optional_token(app);
    let mut rows: Vec<CardMetaRow> = Vec::new();
    for kind in CardKind::ALL {
        let ids: Vec<i64> = stale
            .iter()
            .filter(|(stale_kind, _)| *stale_kind == kind)
            .map(|(_, id)| *id)
            .collect();
        if kind == CardKind::Studio {
            for id in ids {
                let response = graphql_request(studio_query(id), token.as_deref(), proxy).await?;
                if let Some(meta) = parse_meta(kind, &response["data"]["Studio"], now) {
                    rows.push(meta);
                }
            }
            continue;
        }
        for chunk in chunks(&ids) {
            refresh_chunk(kind, &chunk, token.as_deref(), proxy, now, &mut rows).await?;
        }
    }
    if rows.is_empty() {
        return Ok(0);
    }
    let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
    let connection = open_database(app)?;
    for row in &rows {
        upsert_meta(&connection, row)?;
    }
    Ok(rows.len())
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
    }

    #[test]
    fn queries_send_the_expected_id_filter() {
        let query = anime_query(&[1, 2]).to_string();
        assert!(query.contains("media(id_in: [1,2], type: ANIME)"));
        let query = manga_query(&[3]).to_string();
        assert!(query.contains("media(id_in: [3], type: MANGA)"));
        let query = character_query(&[45627]).to_string();
        assert!(query.contains("characters(id_in: [45627])"));
        assert!(query.contains("type: ANIME"));
        assert!(query.contains("manga: media(sort: [POPULARITY_DESC], perPage: 1, type: MANGA)"));
        let query = studio_query(2).to_string();
        assert!(query.contains("Studio(id: 2)"));
        assert!(query.contains("perPage: 4, type: ANIME"));
    }
}
