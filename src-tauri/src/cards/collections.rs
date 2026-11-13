use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::AppHandle;

use super::collection::{list_media_collection_items, CollectionItem};
use super::types::{CardKind, CardRarity};
use crate::anilist::auth::optional_token;
use crate::anilist::client::graphql_request;
use crate::app_db::cache::{put_app_cache, read_cached_payload};
use crate::app_db::cards::LOCAL_USER_ID;
use crate::app_db::db::open_database;
use crate::scrapers::clients::resolve_proxy;

pub const ROSTER_TTL_SECONDS: i64 = 7 * 24 * 60 * 60;
pub const ROSTER_PAGE_SIZE: usize = 25;
pub const ROSTER_INITIAL_PAGES: usize = 3;
const ROSTER_PAGE_NAMESPACE: &str = "cards_roster_page_v2";
const ROSTER_TOTALS_NAMESPACE: &str = "cards_roster_totals";
const ROSTER_TOTALS_BATCH: usize = 25;

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionRarityCounts {
    pub junk: i64,
    pub common: i64,
    pub rare: i64,
    pub epic: i64,
    pub legendary: i64,
}

impl CollectionRarityCounts {
    fn score(&self) -> i64 {
        self.legendary * 5 + self.epic * 4 + self.rare * 3 + self.common * 2 + self.junk
    }

    fn add(&mut self, rarity: CardRarity) {
        match rarity {
            CardRarity::Junk => self.junk += 1,
            CardRarity::Common => self.common += 1,
            CardRarity::Rare => self.rare += 1,
            CardRarity::Epic => self.epic += 1,
            CardRarity::Legendary => self.legendary += 1,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionShelfItem {
    pub anime_id: i64,
    pub kind: CardKind,
    pub title: String,
    pub cover_url: Option<String>,
    pub owned: i64,
    pub rarity: CollectionRarityCounts,
    pub total_value: i64,
    pub last_obtained_at: i64,
    pub total: Option<i64>,
}

#[derive(Clone)]
struct ShelfRow {
    anime_id: i64,
    collection_kind: CardKind,
    title: String,
    cover_url: Option<String>,
    rarity: CardRarity,
    value: i64,
    copies: i64,
    last_obtained_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RosterCharacter {
    pub entity_id: i64,
    pub title: String,
    pub image_url: Option<String>,
    pub favourites: i64,
    pub owned: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimeCollectionPage {
    pub anime_id: i64,
    pub kind: CardKind,
    pub title: String,
    pub cover_url: Option<String>,
    pub owned: i64,
    pub rarity: CollectionRarityCounts,
    pub items: Vec<CollectionItem>,
    pub roster: Vec<RosterCharacter>,
    pub roster_total: usize,
    pub roster_page: usize,
    pub roster_has_more: bool,
    pub roster_available: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionRosterPage {
    pub page: usize,
    pub total: usize,
    pub has_more: bool,
    pub available: bool,
    pub characters: Vec<RosterCharacter>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RosterMeta {
    entity_id: i64,
    title: String,
    image_url: Option<String>,
    favourites: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RosterPageCache {
    characters: Vec<RosterMeta>,
    has_next: bool,
    total: Option<usize>,
}

fn text(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn parse_roster_node(node: &Value) -> Option<RosterMeta> {
    let entity_id = node["id"].as_i64().filter(|id| *id > 0)?;
    Some(RosterMeta {
        entity_id,
        title: text(&node["name"]["full"]).unwrap_or_else(|| format!("Character {entity_id}")),
        image_url: text(&node["image"]["large"]),
        favourites: node["favourites"].as_i64().unwrap_or(0),
    })
}

fn parse_roster_page(response: &Value) -> (Vec<RosterMeta>, bool, Option<usize>) {
    let block = &response["data"]["Media"]["characters"];
    let characters = block["nodes"]
        .as_array()
        .map(|nodes| nodes.iter().filter_map(parse_roster_node).collect())
        .unwrap_or_default();
    let has_next = block["pageInfo"]["hasNextPage"].as_bool().unwrap_or(false);
    let total = block["pageInfo"]["total"]
        .as_u64()
        .and_then(|value| usize::try_from(value).ok());
    (characters, has_next, total)
}

fn roster_query(anime_id: i64, page: usize) -> Value {
    json!({
        "query": "query ($id: Int, $page: Int, $perPage: Int) { \
            Media(id: $id) { characters(page: $page, perPage: $perPage) { \
            pageInfo { hasNextPage total } nodes { id name { full } image { large } favourites } } } }",
        "variables": { "id": anime_id, "page": page, "perPage": ROSTER_PAGE_SIZE }
    })
}

fn is_invalid_token(error: &str) -> bool {
    let lower = error.to_ascii_lowercase();
    lower.contains("invalid token")
        || lower.contains("http 401")
        || lower.contains("http 403")
        || lower.contains("unauthorized")
}

fn roster_page_is_valid(response: &Value) -> bool {
    !response["data"]["Media"].is_null() && !response["data"]["Media"]["characters"].is_null()
}

fn roster_page_has_next_but_no_characters(characters: &[RosterMeta], has_next: bool) -> bool {
    characters.is_empty() && has_next
}

async fn fetch_roster_page(
    app: &AppHandle,
    media_id: i64,
    page: usize,
    proxy: Option<&str>,
) -> Result<RosterPageCache, String> {
    let token = optional_token(app);
    let query = roster_query(media_id, page);
    let response = match graphql_request(query.clone(), token.as_deref(), proxy).await {
        Ok(response) => response,
        Err(error) if token.is_some() && is_invalid_token(&error) => {
            tracing::warn!(
                error = error.as_str(),
                media_id,
                page,
                "card roster token rejected; retrying anonymously"
            );
            graphql_request(query, None, proxy)
                .await
                .map_err(|error| format!("card roster request: {error}"))?
        }
        Err(error) => return Err(format!("card roster request: {error}")),
    };
    if !roster_page_is_valid(&response) {
        return Err("card roster response is missing media or characters".into());
    }
    let (characters, has_next, total) = parse_roster_page(&response);
    if roster_page_has_next_but_no_characters(&characters, has_next) {
        return Err("card roster page is empty but claims another page".into());
    }
    Ok(RosterPageCache {
        characters,
        has_next,
        total,
    })
}

async fn cached_roster_page(
    app: &AppHandle,
    media_id: i64,
    page: usize,
    proxy: Option<&str>,
) -> Result<RosterPageCache, String> {
    let key = format!("{media_id}:{page}");
    if let Ok(Some(payload)) = read_cached_payload(app, ROSTER_PAGE_NAMESPACE, &key) {
        if let Ok(cache) = serde_json::from_str::<RosterPageCache>(&payload) {
            return Ok(cache);
        }
    }
    let cache = fetch_roster_page(app, media_id, page, proxy).await?;
    if let Ok(payload) = serde_json::to_string(&cache) {
        if let Err(error) = put_app_cache(
            app.clone(),
            ROSTER_PAGE_NAMESPACE.to_string(),
            key,
            payload,
            Some(ROSTER_TTL_SECONDS),
        ) {
            tracing::warn!(
                error = error.as_str(),
                media_id,
                page,
                "card roster cache write failed"
            );
        }
    }
    Ok(cache)
}

async fn initial_roster(
    app: &AppHandle,
    media_id: i64,
    proxy: Option<&str>,
) -> Result<(Vec<RosterMeta>, usize, bool, Option<usize>), String> {
    let mut characters = Vec::new();
    let mut last_page = 0;
    let mut has_more = false;
    let mut total = None;
    for page in 1..=ROSTER_INITIAL_PAGES {
        let cache = match cached_roster_page(app, media_id, page, proxy).await {
            Ok(cache) => cache,
            Err(error) if page == 1 => return Err(error),
            Err(error) => {
                tracing::warn!(
                    error = error.as_str(),
                    media_id,
                    page,
                    "card roster page unavailable; keeping earlier pages"
                );
                has_more = true;
                break;
            }
        };
        if total.is_none() {
            total = cache.total;
        }
        has_more = cache.has_next;
        last_page = page;
        characters.extend(cache.characters);
        if !cache.has_next {
            break;
        }
    }
    Ok((characters, last_page, has_more, total))
}

fn shelf_from_rows(
    rows: impl Iterator<Item = ShelfRow>,
    sort: &str,
    sort_dir: Option<&str>,
) -> Result<Vec<CollectionShelfItem>, String> {
    let mut grouped: Vec<CollectionShelfItem> = Vec::new();
    for row in rows {
        let index = grouped
            .iter()
            .position(|item| item.anime_id == row.anime_id && item.kind == row.collection_kind);
        let item = if let Some(index) = index {
            &mut grouped[index]
        } else {
            grouped.push(CollectionShelfItem {
                anime_id: row.anime_id,
                kind: row.collection_kind,
                title: row.title.clone(),
                cover_url: row.cover_url.clone(),
                owned: 0,
                rarity: CollectionRarityCounts::default(),
                total_value: 0,
                last_obtained_at: 0,
                total: None,
            });
            grouped.last_mut().expect("just pushed shelf item")
        };
        item.owned += 1;
        item.rarity.add(row.rarity);
        item.total_value += row.value * row.copies;
        item.last_obtained_at = item.last_obtained_at.max(row.last_obtained_at);
    }
    let default_dir = if sort == "title" { "asc" } else { "desc" };
    let ascending = match sort_dir.unwrap_or(default_dir) {
        "asc" => true,
        "desc" => false,
        _ => return Err("unknown collection sort direction".into()),
    };
    match sort {
        "recent" => grouped.sort_by(|left, right| {
            left.last_obtained_at
                .cmp(&right.last_obtained_at)
                .then(left.title.cmp(&right.title))
        }),
        "value" => grouped.sort_by(|left, right| {
            left.total_value
                .cmp(&right.total_value)
                .then(left.owned.cmp(&right.owned))
                .then(left.title.cmp(&right.title))
        }),
        "rarity" => grouped.sort_by(|left, right| {
            left.rarity
                .score()
                .cmp(&right.rarity.score())
                .then(left.owned.cmp(&right.owned))
                .then(left.title.cmp(&right.title))
        }),
        "title" => grouped.sort_by(|left, right| left.title.cmp(&right.title)),
        "kind" => grouped.sort_by(|left, right| {
            kind_rank(left.kind)
                .cmp(&kind_rank(right.kind))
                .then(left.title.cmp(&right.title))
        }),
        // Needs roster totals, so the command sorts it after the totals load.
        "completion" => {}
        "owned" => grouped.sort_by(|left, right| {
            left.owned
                .cmp(&right.owned)
                .then(left.title.cmp(&right.title))
        }),
        _ => return Err("unknown collection sort".into()),
    }
    if !ascending {
        grouped.reverse();
    }
    Ok(grouped)
}

fn sort_by_completion(shelf: &mut Vec<CollectionShelfItem>, ascending: bool) {
    let (mut known, mut unknown): (Vec<_>, Vec<_>) = std::mem::take(shelf)
        .into_iter()
        .partition(|item| item.total.is_some_and(|total| total > 0));
    known.sort_by(|left, right| {
        let left_total = left.total.unwrap_or(1);
        let right_total = right.total.unwrap_or(1);
        (left.owned * right_total)
            .cmp(&(right.owned * left_total))
            .then(left.title.cmp(&right.title))
    });
    if !ascending {
        known.reverse();
    }
    known.append(&mut unknown);
    *shelf = known;
}

fn kind_rank(kind: CardKind) -> u8 {
    match kind {
        CardKind::Anime => 0,
        CardKind::Manga => 1,
        CardKind::Character => 2,
        CardKind::Staff => 3,
        CardKind::Studio => 4,
    }
}

fn cached_roster_totals(app: &AppHandle, ids: &[i64]) -> HashMap<i64, i64> {
    let mut totals = HashMap::new();
    for id in ids {
        if let Ok(Some(payload)) =
            read_cached_payload(app, ROSTER_TOTALS_NAMESPACE, &id.to_string())
        {
            if let Ok(total) = payload.parse::<i64>() {
                totals.insert(*id, total);
            }
        }
    }
    totals
}

async fn fetch_roster_totals(
    app: &AppHandle,
    ids: &[i64],
    proxy: Option<&str>,
) -> HashMap<i64, i64> {
    let token = optional_token(app);
    let mut totals = HashMap::new();
    for chunk in ids.chunks(ROSTER_TOTALS_BATCH) {
        let fields = chunk
            .iter()
            .enumerate()
            .map(|(index, id)| {
                format!(
                    "a{index}: Media(id: {id}) {{ characters(perPage: 1) {{ pageInfo {{ total }} }} }}"
                )
            })
            .collect::<String>();
        let query = format!("query {{ {fields} }}");
        let response =
            match graphql_request(json!({ "query": query }), token.as_deref(), proxy).await {
                Ok(response) => response,
                Err(error) => {
                    tracing::warn!(error = error.as_str(), "card roster totals unavailable");
                    continue;
                }
            };
        for (index, id) in chunk.iter().enumerate() {
            let total =
                response["data"][format!("a{index}")]["characters"]["pageInfo"]["total"].as_i64();
            if let Some(total) = total {
                totals.insert(*id, total);
                let _ = put_app_cache(
                    app.clone(),
                    ROSTER_TOTALS_NAMESPACE.to_string(),
                    id.to_string(),
                    total.to_string(),
                    Some(ROSTER_TTL_SECONDS),
                );
            }
        }
    }
    totals
}

fn shelf_rows(app: &AppHandle) -> Result<Vec<ShelfRow>, String> {
    let connection = open_database(app)?;
    let mut statement = connection
        .prepare(
            "SELECT collection_kind, collection_id, MAX(title), MAX(cover_url), kind,
                    entity_id, rarity, value, copies, last_obtained_at
             FROM (
                SELECT 'anime' AS collection_kind, c.entity_id AS collection_id,
                       COALESCE(m.title, '') AS title,
                       COALESCE(m.preferred_image_url, m.image_url) AS cover_url,
                       c.kind, c.entity_id, c.rarity, c.value, c.copies, c.last_obtained_at
                FROM user_cards c
                LEFT JOIN card_meta m ON m.kind = c.kind AND m.entity_id = c.entity_id
                WHERE c.user_id = ?1 AND c.kind = 'anime'
                UNION ALL
                SELECT 'manga', c.entity_id,
                       COALESCE(m.title, ''), COALESCE(m.preferred_image_url, m.image_url),
                       c.kind, c.entity_id, c.rarity, c.value, c.copies, c.last_obtained_at
                FROM user_cards c
                LEFT JOIN card_meta m ON m.kind = c.kind AND m.entity_id = c.entity_id
                WHERE c.user_id = ?1 AND c.kind = 'manga'
                UNION ALL
                SELECT 'anime', m.collection_anime_id,
                       COALESCE(m.collection_title, ''), m.collection_cover_url,
                       c.kind, c.entity_id, c.rarity, c.value, c.copies, c.last_obtained_at
                FROM user_cards c
                JOIN card_meta m ON m.kind = c.kind AND m.entity_id = c.entity_id
                WHERE c.user_id = ?1 AND c.kind = 'character'
                  AND m.collection_anime_id IS NOT NULL
                UNION ALL
                SELECT 'manga', m.collection_manga_id,
                       COALESCE(m.collection_title, ''), m.collection_cover_url,
                       c.kind, c.entity_id, c.rarity, c.value, c.copies, c.last_obtained_at
                FROM user_cards c
                JOIN card_meta m ON m.kind = c.kind AND m.entity_id = c.entity_id
                WHERE c.user_id = ?1 AND c.kind = 'character'
                  AND m.collection_manga_id IS NOT NULL
             )
             GROUP BY collection_kind, collection_id, kind, entity_id, rarity
             ORDER BY collection_kind, collection_id",
        )
        .map_err(|error| format!("prepare card collections: {error}"))?;
    let rows = statement
        .query_map([LOCAL_USER_ID], |row| {
            let collection_kind: String = row.get(0)?;
            let rarity: String = row.get(6)?;
            Ok(ShelfRow {
                anime_id: row.get(1)?,
                collection_kind: CardKind::from_db(&collection_kind).ok_or_else(|| {
                    rusqlite::Error::InvalidColumnType(
                        0,
                        collection_kind,
                        rusqlite::types::Type::Text,
                    )
                })?,
                title: row.get(2)?,
                cover_url: row.get(3)?,
                rarity: CardRarity::from_db(&rarity).ok_or_else(|| {
                    rusqlite::Error::InvalidColumnType(6, rarity, rusqlite::types::Type::Text)
                })?,
                value: row.get(7)?,
                copies: row.get(8)?,
                last_obtained_at: row.get(9)?,
            })
        })
        .map_err(|error| format!("query card collections: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("collect card collections: {error}"))
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn cards_collections(
    app: AppHandle,
    sort: Option<String>,
    sort_dir: Option<String>,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<Vec<CollectionShelfItem>, String> {
    let rows = shelf_rows(&app)?;
    let mut shelf = shelf_from_rows(
        rows.into_iter(),
        sort.as_deref().unwrap_or("owned"),
        sort_dir.as_deref(),
    )?;
    let ids: Vec<i64> = shelf.iter().map(|item| item.anime_id).collect();
    let mut totals = cached_roster_totals(&app, &ids);
    let missing: Vec<i64> = ids
        .iter()
        .copied()
        .filter(|id| !totals.contains_key(id))
        .collect();
    if !missing.is_empty() {
        let proxy = resolve_proxy(proxy_url, proxyUrl);
        totals.extend(fetch_roster_totals(&app, &missing, proxy.as_deref()).await);
    }
    for item in &mut shelf {
        item.total = totals.get(&item.anime_id).map(|total| 1 + *total);
    }
    if sort.as_deref() == Some("completion") {
        sort_by_completion(&mut shelf, sort_dir.as_deref() == Some("asc"));
    }
    Ok(shelf)
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn cards_anime_collection(
    app: AppHandle,
    anime_id: i64,
    kind: Option<String>,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<AnimeCollectionPage, String> {
    if anime_id <= 0 {
        return Err("invalid media id".into());
    }
    let kind = match kind.as_deref() {
        Some("manga") => CardKind::Manga,
        Some("anime") | None => CardKind::Anime,
        Some(_) => return Err("unknown collection kind".into()),
    };
    let (collection_column, media_kind) = match kind {
        CardKind::Manga => ("collection_manga_id", "manga"),
        _ => ("collection_anime_id", "anime"),
    };
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let connection = open_database(&app)?;
    let items = list_media_collection_items(&connection, LOCAL_USER_ID, kind, anime_id)?;
    let title: String = connection
        .query_row(
            &format!(
                "SELECT COALESCE(
                (SELECT collection_title FROM card_meta
                 WHERE {collection_column} = ?1 AND collection_title IS NOT NULL
                 LIMIT 1),
                (SELECT title FROM card_meta WHERE kind = ?2 AND entity_id = ?1),
                ''
             )"
            ),
            rusqlite::params![anime_id, media_kind],
            |row| row.get(0),
        )
        .unwrap_or_default();
    let cover_url: Option<String> = connection
        .query_row(
            &format!(
                "SELECT COALESCE(
                (SELECT collection_cover_url FROM card_meta
                 WHERE {collection_column} = ?1 AND collection_cover_url IS NOT NULL
                 LIMIT 1),
                (SELECT COALESCE(preferred_image_url, image_url) FROM card_meta WHERE kind = ?2 AND entity_id = ?1)
             )"
            ),
            rusqlite::params![anime_id, media_kind],
            |row| row.get(0),
        )
        .ok()
        .flatten();
    drop(connection);

    let mut rarity = CollectionRarityCounts::default();
    let mut seen = std::collections::HashSet::new();
    for item in &items {
        if seen.insert(item.entity_id) {
            rarity.add(item.rarity);
        }
    }
    let owned = seen.len() as i64;
    let mut roster_available = true;
    let roster = match initial_roster(&app, anime_id, proxy.as_deref()).await {
        Ok((characters, page, has_more, total)) => {
            let owned_ids: std::collections::HashSet<i64> =
                items.iter().map(|item| item.entity_id).collect();
            let characters = characters
                .into_iter()
                .map(|character| RosterCharacter {
                    owned: owned_ids.contains(&character.entity_id),
                    entity_id: character.entity_id,
                    title: character.title,
                    image_url: character.image_url,
                    favourites: character.favourites,
                })
                .collect::<Vec<_>>();
            let roster_total = total.unwrap_or(characters.len()).max(characters.len());
            (characters, roster_total, page, has_more)
        }
        Err(error) => {
            tracing::warn!(error = error.as_str(), anime_id, "card roster unavailable");
            roster_available = false;
            (Vec::new(), 0, 0, false)
        }
    };

    Ok(AnimeCollectionPage {
        anime_id,
        kind,
        title: if title.trim().is_empty() {
            items
                .iter()
                .find_map(|item| item.collection_title.clone())
                .unwrap_or_else(|| format!("Anime #{anime_id}"))
        } else {
            title
        },
        cover_url,
        owned,
        rarity,
        roster_total: roster.1,
        roster_page: roster.2,
        roster_has_more: roster.3,
        roster_available,
        roster: roster.0,
        items,
    })
}

fn owned_character_ids(
    app: &AppHandle,
    media_id: i64,
    kind: CardKind,
) -> Result<std::collections::HashSet<i64>, String> {
    let connection = open_database(app)?;
    let items = list_media_collection_items(&connection, LOCAL_USER_ID, kind, media_id)?;
    Ok(items
        .into_iter()
        .filter(|item| item.kind == CardKind::Character)
        .map(|item| item.entity_id)
        .collect())
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn cards_collection_roster(
    app: AppHandle,
    media_id: i64,
    kind: Option<String>,
    page: usize,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<CollectionRosterPage, String> {
    if media_id <= 0 {
        return Err("invalid media id".into());
    }
    if page == 0 {
        return Err("invalid roster page".into());
    }
    let kind = match kind.as_deref() {
        Some("manga") => CardKind::Manga,
        Some("anime") | None => CardKind::Anime,
        Some(_) => return Err("unknown collection kind".into()),
    };
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let cache = cached_roster_page(&app, media_id, page, proxy.as_deref()).await?;
    let owned = owned_character_ids(&app, media_id, kind)?;
    let characters = cache
        .characters
        .into_iter()
        .map(|character| RosterCharacter {
            owned: owned.contains(&character.entity_id),
            entity_id: character.entity_id,
            title: character.title,
            image_url: character.image_url,
            favourites: character.favourites,
        })
        .collect::<Vec<_>>();
    Ok(CollectionRosterPage {
        page,
        total: cache
            .total
            .unwrap_or(characters.len())
            .max(characters.len()),
        has_more: cache.has_next,
        available: true,
        characters,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_empty_roster_page_is_only_rejected_when_it_promises_more() {
        // AniList returns `nodes: []` with `hasNextPage: false` past the shown
        // window (and even a page-scoped `total`), which is the end of the
        // roster, not a failure.
        assert!(!roster_page_has_next_but_no_characters(&[], false));
        assert!(roster_page_has_next_but_no_characters(&[], true));
    }

    #[test]
    fn roster_query_braces_balance_so_anilist_accepts_it() {
        let query = roster_query(20789, 1);
        let text = query["query"].as_str().expect("roster query string");
        let mut depth = 0i32;
        for character in text.chars() {
            match character {
                '{' => depth += 1,
                '}' => depth -= 1,
                _ => {}
            }
            assert!(depth >= 0, "roster query closes before it opens: {text}");
        }
        assert_eq!(depth, 0, "roster query is unbalanced: {text}");
        assert!(text.contains("nodes { id name { full } image { large } favourites }"));
    }

    #[test]
    fn roster_parses_one_page_and_reads_the_next_marker() {
        let response = json!({
            "data": { "Media": { "characters": {
                "pageInfo": { "hasNextPage": true, "total": 212 },
                "nodes": [
                    { "id": 1, "name": { "full": "Levi" },
                      "image": { "large": "https://img/levi.jpg" }, "favourites": 10 },
                    { "id": 2, "name": { "full": "  " }, "favourites": 0 }
                ]
            } } }
        });
        let (characters, has_next, total) = parse_roster_page(&response);
        assert!(has_next);
        assert_eq!(total, Some(212));
        assert_eq!(characters.len(), 2);
        assert_eq!(characters[0].title, "Levi");
        assert_eq!(
            characters[0].image_url.as_deref(),
            Some("https://img/levi.jpg")
        );
        assert_eq!(characters[1].title, "Character 2");
    }

    #[test]
    fn only_auth_errors_trigger_the_public_roster_retry() {
        assert!(is_invalid_token("Invalid token"));
        assert!(is_invalid_token("AniList HTTP 401 Unauthorized"));
        assert!(is_invalid_token("AniList HTTP 403"));
        assert!(!is_invalid_token("AniList rate limit exceeded"));
        assert!(!is_invalid_token("AniList request failed: timed out"));
    }

    #[test]
    fn an_empty_or_null_roster_media_is_rejected_before_caching() {
        assert!(!roster_page_is_valid(&json!({ "data": { "Media": null } })));
        assert!(!roster_page_is_valid(&json!({ "data": { "Media": {} } })));
        assert!(roster_page_is_valid(&json!({
            "data": { "Media": { "characters": { "nodes": [] } } }
        })));
    }

    fn shelf_row(
        anime_id: i64,
        title: &str,
        rarity: CardRarity,
        value: i64,
        copies: i64,
        last_obtained_at: i64,
    ) -> ShelfRow {
        ShelfRow {
            anime_id,
            collection_kind: CardKind::Anime,
            title: title.to_string(),
            cover_url: None,
            rarity,
            value,
            copies,
            last_obtained_at,
        }
    }

    #[test]
    fn shelf_groups_variants_into_one_anime_and_keeps_rarity_counts() {
        let rows = vec![
            shelf_row(1, "Anime", CardRarity::Rare, 5, 2, 10),
            shelf_row(1, "Anime", CardRarity::Rare, 5, 2, 10),
            shelf_row(1, "Anime", CardRarity::Epic, 15, 1, 20),
            shelf_row(2, "Other", CardRarity::Junk, 1, 1, 30),
        ];
        let shelf = shelf_from_rows(rows.into_iter(), "owned", None).expect("shelf");
        assert_eq!(shelf.len(), 2);
        assert_eq!(shelf[0].anime_id, 1);
        assert_eq!(shelf[0].owned, 3);
        assert_eq!(shelf[0].rarity.rare, 2);
        assert_eq!(shelf[0].rarity.epic, 1);
        assert_eq!(shelf[0].total_value, 35);
        assert_eq!(shelf[0].last_obtained_at, 20);
    }

    #[test]
    fn shelf_sorts_by_value_recent_rarity_and_title() {
        let rows = vec![
            shelf_row(1, "Zeta", CardRarity::Common, 3, 5, 10),
            shelf_row(2, "Alpha", CardRarity::Legendary, 40, 1, 30),
            shelf_row(3, "Beta", CardRarity::Rare, 5, 2, 20),
        ];
        let by_value =
            shelf_from_rows(rows.clone().into_iter(), "value", None).expect("value shelf");
        assert_eq!(by_value[0].anime_id, 2);
        assert_eq!(by_value[2].anime_id, 3);

        let by_recent =
            shelf_from_rows(rows.clone().into_iter(), "recent", None).expect("recent shelf");
        assert_eq!(by_recent[0].anime_id, 2);
        assert_eq!(by_recent[2].anime_id, 1);

        let by_rarity =
            shelf_from_rows(rows.clone().into_iter(), "rarity", None).expect("rarity shelf");
        assert_eq!(by_rarity[0].anime_id, 2);

        let by_title =
            shelf_from_rows(rows.clone().into_iter(), "title", None).expect("title shelf");
        assert_eq!(by_title[0].anime_id, 2);

        let mut owned_rows = rows.clone();
        owned_rows.push(shelf_row(3, "Beta", CardRarity::Common, 1, 1, 25));
        owned_rows.push(shelf_row(3, "Beta", CardRarity::Epic, 1, 1, 26));
        let by_owned =
            shelf_from_rows(owned_rows.into_iter(), "owned", Some("desc")).expect("owned shelf");
        assert_eq!(by_owned[0].anime_id, 3);
        assert_eq!(by_owned[0].owned, 3);

        let by_value_asc = shelf_from_rows(rows.clone().into_iter(), "value", Some("asc"))
            .expect("ascending value shelf");
        assert_eq!(by_value_asc[0].anime_id, 3);
        let newest_title_desc = shelf_from_rows(rows.clone().into_iter(), "title", Some("desc"))
            .expect("descending title shelf");
        assert_eq!(newest_title_desc[0].anime_id, 1);
        let mut kind_rows = rows.clone();
        let mut manga = shelf_row(4, "Manga", CardRarity::Common, 1, 1, 5);
        manga.collection_kind = CardKind::Manga;
        kind_rows.push(manga);
        let by_kind =
            shelf_from_rows(kind_rows.into_iter(), "kind", Some("asc")).expect("kind shelf");
        assert_eq!(by_kind.last().map(|item| item.anime_id), Some(4));
        assert_eq!(by_kind[0].kind, CardKind::Anime);
        assert!(shelf_from_rows(rows.clone().into_iter(), "bogus", None).is_err());
        assert!(shelf_from_rows(rows.into_iter(), "value", Some("sideways")).is_err());
    }

    #[test]
    fn completion_sort_puts_full_collections_first_in_both_directions() {
        let mut shelf = vec![
            CollectionShelfItem {
                anime_id: 1,
                kind: CardKind::Anime,
                title: "Half".into(),
                cover_url: None,
                owned: 5,
                rarity: CollectionRarityCounts::default(),
                total_value: 0,
                last_obtained_at: 0,
                total: Some(10),
            },
            CollectionShelfItem {
                anime_id: 2,
                kind: CardKind::Anime,
                title: "Full".into(),
                cover_url: None,
                owned: 10,
                rarity: CollectionRarityCounts::default(),
                total_value: 0,
                last_obtained_at: 0,
                total: Some(10),
            },
            CollectionShelfItem {
                anime_id: 3,
                kind: CardKind::Manga,
                title: "Unknown".into(),
                cover_url: None,
                owned: 1,
                rarity: CollectionRarityCounts::default(),
                total_value: 0,
                last_obtained_at: 0,
                total: None,
            },
        ];
        sort_by_completion(&mut shelf, false);
        assert_eq!(
            shelf.iter().map(|item| item.anime_id).collect::<Vec<_>>(),
            vec![2, 1, 3]
        );
        sort_by_completion(&mut shelf, true);
        assert_eq!(
            shelf.iter().map(|item| item.anime_id).collect::<Vec<_>>(),
            vec![1, 2, 3]
        );
    }

    #[test]
    fn roster_starts_with_three_pages_of_the_anilist_maximum() {
        assert_eq!(ROSTER_PAGE_SIZE, 25);
        assert_eq!(ROSTER_INITIAL_PAGES, 3);
        assert_eq!(ROSTER_PAGE_SIZE * ROSTER_INITIAL_PAGES, 75);
        assert_eq!(ROSTER_TTL_SECONDS, 7 * 24 * 60 * 60);
    }
}
