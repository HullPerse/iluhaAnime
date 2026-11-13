use serde_json::{json, Value};

use super::rarity::{score_for, tier_for};
use super::rng::Rng;
use super::types::{CardKind, CardRarity};

pub const PER_PAGE: u32 = 50;

#[derive(Debug, Clone, PartialEq)]
pub struct CardNode {
    pub kind: CardKind,
    pub entity_id: i64,
    pub title: String,
    pub image_url: Option<String>,
    pub favourites: u32,
    pub popularity: u32,
    pub score: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SampledPage {
    pub page: u32,
    pub last_page: u32,
    pub total: i64,
    pub has_next_page: bool,
    pub nodes: Vec<CardNode>,
}

fn key_for(kind: CardKind) -> &'static str {
    match kind {
        CardKind::Anime | CardKind::Manga => "media",
        CardKind::Character => "characters",
        CardKind::Staff => "staff",
        CardKind::Studio => "studios",
    }
}

fn sort_for(kind: CardKind) -> &'static str {
    match kind {
        CardKind::Anime | CardKind::Manga => "POPULARITY_DESC",
        CardKind::Character | CardKind::Staff | CardKind::Studio => "[FAVOURITES_DESC]",
    }
}

fn filter_for(kind: CardKind) -> &'static str {
    match kind {
        CardKind::Anime => ", type: ANIME",
        CardKind::Manga => ", type: MANGA",
        CardKind::Character | CardKind::Staff | CardKind::Studio => "",
    }
}

fn selection_for(kind: CardKind) -> &'static str {
    match kind {
        CardKind::Anime | CardKind::Manga => {
            "id title { romaji english } favourites popularity coverImage { large }"
        }
        CardKind::Character => {
            "id name { full } favourites image { large } \
             media(sort: [POPULARITY_DESC], perPage: 1, type: ANIME) { nodes { popularity } }"
        }
        CardKind::Staff => "id name { full } favourites image { large }",
        CardKind::Studio => "id name favourites",
    }
}

/// Builds one request with one aliased `Page` object per page number.
pub fn page_query(kind: CardKind, pages: &[u32], per_page: u32) -> Value {
    let field = key_for(kind);
    let sort = sort_for(kind);
    let filter = filter_for(kind);
    let selection = selection_for(kind);
    let parts = pages
        .iter()
        .map(|page| {
            format!(
                "p{page}: Page(page: {page}, perPage: {per_page}) {{ \
                 pageInfo {{ total lastPage hasNextPage }} \
                 {field}(sort: {sort}{filter}) {{ {selection} }} }}"
            )
        })
        .collect::<Vec<_>>()
        .join(" ");
    json!({ "query": format!("query {{ {parts} }}") })
}

fn number(value: &Value) -> u32 {
    value.as_u64().unwrap_or(0).min(u64::from(u32::MAX)) as u32
}

fn text(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
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
    let path = match kind {
        CardKind::Anime | CardKind::Manga => &node["coverImage"]["large"],
        CardKind::Character | CardKind::Staff => &node["image"]["large"],
        CardKind::Studio => return None,
    };
    text(path)
}

fn parse_node(kind: CardKind, node: &Value) -> Option<CardNode> {
    let entity_id = node["id"].as_i64().filter(|id| *id > 0)?;
    let favourites = number(&node["favourites"]);
    let popularity = match kind {
        CardKind::Character => number(&node["media"]["nodes"][0]["popularity"]),
        _ => number(&node["popularity"]),
    };
    Some(CardNode {
        kind,
        entity_id,
        title: title_for(kind, node, entity_id),
        image_url: image_for(kind, node),
        favourites,
        popularity,
        score: score_for(kind, favourites, popularity),
    })
}

/// Parses one `Page` object. Null stats become zero, a missing image becomes
/// `None`, and repeated ids inside a page are dropped.
pub fn parse_page(kind: CardKind, page: u32, value: &Value) -> Result<SampledPage, String> {
    let info = value
        .get("pageInfo")
        .ok_or_else(|| "AniList page has no pageInfo".to_string())?;
    let nodes = value[key_for(kind)]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default();
    let mut parsed: Vec<CardNode> = Vec::new();
    for node in nodes {
        let Some(card) = parse_node(kind, node) else {
            continue;
        };
        if parsed
            .iter()
            .any(|existing| existing.entity_id == card.entity_id)
        {
            continue;
        }
        parsed.push(card);
    }
    Ok(SampledPage {
        page,
        last_page: info["lastPage"]
            .as_u64()
            .unwrap_or(0)
            .min(u64::from(u32::MAX)) as u32,
        total: info["total"].as_i64().unwrap_or(0),
        has_next_page: info["hasNextPage"].as_bool().unwrap_or(false),
        nodes: parsed,
    })
}

pub fn parse_aliased_page(
    kind: CardKind,
    page: u32,
    response: &Value,
) -> Result<SampledPage, String> {
    let value = response
        .get("data")
        .and_then(|data| data.get(format!("p{page}")))
        .ok_or_else(|| format!("AniList response has no page alias p{page}"))?;
    parse_page(kind, page, value)
}

/// Merges pages in order and keeps the first node for each entity id.
pub fn merge_distinct(pages: &[SampledPage]) -> Vec<CardNode> {
    let mut merged: Vec<CardNode> = Vec::new();
    for page in pages {
        for card in &page.nodes {
            if merged
                .iter()
                .any(|existing| existing.kind == card.kind && existing.entity_id == card.entity_id)
            {
                continue;
            }
            merged.push(card.clone());
        }
    }
    merged
}

pub fn pick_distinct(pool: &[CardNode], count: usize, rng: &mut Rng) -> Vec<CardNode> {
    let mut candidates = pool.to_vec();
    rng.shuffle(&mut candidates);
    let mut picked: Vec<CardNode> = Vec::new();
    for card in candidates {
        if picked
            .iter()
            .any(|existing| existing.kind == card.kind && existing.entity_id == card.entity_id)
        {
            continue;
        }
        picked.push(card);
        if picked.len() == count {
            break;
        }
    }
    picked
}

/// Replaces the weakest pick with the best available Rare+ candidate when the
/// random draw produced no guaranteed slot.
pub fn ensure_rare_plus(selected: &mut [CardNode], pool: &[CardNode]) {
    if selected
        .iter()
        .any(|card| tier_for(card.kind, card.score) >= CardRarity::Rare)
    {
        return;
    }
    let best = pool
        .iter()
        .filter(|card| {
            tier_for(card.kind, card.score) >= CardRarity::Rare
                && !selected
                    .iter()
                    .any(|picked| picked.kind == card.kind && picked.entity_id == card.entity_id)
        })
        .max_by(|left, right| {
            left.score
                .partial_cmp(&right.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .cloned();
    let Some(best) = best else {
        return;
    };
    if let Some((index, _)) = selected.iter().enumerate().min_by(|(_, left), (_, right)| {
        left.score
            .partial_cmp(&right.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    }) {
        selected[index] = best;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_cards(entries: &[(i64, Option<i64>, Option<&str>)]) -> Value {
        let nodes: Vec<Value> = entries
            .iter()
            .map(|(id, favourites, image)| {
                json!({
                    "id": id,
                    "name": { "full": format!("Character {id}") },
                    "favourites": favourites,
                    "image": image.map(|url| json!({ "large": url })),
                })
            })
            .collect();
        json!({
            "pageInfo": { "total": 1000, "lastPage": 20, "hasNextPage": true },
            "characters": nodes,
        })
    }

    #[test]
    fn query_aliases_every_requested_page() {
        let query = page_query(CardKind::Character, &[2, 7], 10);
        let source = query["query"].as_str().unwrap();
        assert!(source.contains("p2: Page(page: 2, perPage: 10)"));
        assert!(source.contains("p7: Page(page: 7, perPage: 10)"));
        assert!(source.contains("characters(sort: [FAVOURITES_DESC])"));
    }

    #[test]
    fn anime_pages_are_restricted_to_the_anime_type() {
        let query = page_query(CardKind::Anime, &[1], 25);
        let source = query["query"].as_str().unwrap();
        assert!(source.contains("media(sort: POPULARITY_DESC, type: ANIME)"));
        let manga = page_query(CardKind::Manga, &[1], 25);
        assert!(manga["query"]
            .as_str()
            .unwrap()
            .contains("media(sort: POPULARITY_DESC, type: MANGA)"));
        let characters = page_query(CardKind::Character, &[1], 25);
        let source = characters["query"].as_str().unwrap();
        assert!(source.contains("media(sort: [POPULARITY_DESC], perPage: 1, type: ANIME)"));
        assert_eq!(source.matches("type: ANIME").count(), 1);
    }

    #[test]
    fn a_full_page_parses_stats_and_images() {
        let page = parse_page(
            CardKind::Character,
            1,
            &fixture_cards(&[
                (1, Some(30_000), Some("https://img/one.jpg")),
                (2, Some(20_000), None),
            ]),
        )
        .unwrap();
        assert_eq!(page.nodes.len(), 2);
        assert_eq!(page.total, 1000);
        assert_eq!(page.last_page, 20);
        assert!(page.has_next_page);
        assert_eq!(page.nodes[0].title, "Character 1");
        assert_eq!(
            page.nodes[0].image_url.as_deref(),
            Some("https://img/one.jpg")
        );
        assert!(page.nodes[0].score > page.nodes[1].score);
        assert!(page.nodes[1].image_url.is_none());
    }

    #[test]
    fn a_character_score_uses_the_primary_anime_popularity() {
        let fixture = json!({
            "pageInfo": { "total": 1, "lastPage": 1, "hasNextPage": false },
            "characters": [{
                "id": 88414,
                "name": { "full": "Uta" },
                "favourites": 2_041,
                "image": { "large": "https://img/uta.jpg" },
                "media": { "nodes": [{ "popularity": 754_505 }] }
            }],
        });
        let page = parse_page(CardKind::Character, 1, &fixture).unwrap();
        assert_eq!(page.nodes[0].popularity, 754_505);
        assert!((page.nodes[0].score - 8.16).abs() < 0.01);
    }

    #[test]
    fn a_short_last_page_keeps_the_end_marker() {
        let mut fixture = fixture_cards(&[(9, Some(10), None)]);
        fixture["pageInfo"] = json!({ "total": 101, "lastPage": 3, "hasNextPage": false });
        let page = parse_page(CardKind::Character, 3, &fixture).unwrap();
        assert_eq!(page.nodes.len(), 1);
        assert!(!page.has_next_page);
    }

    #[test]
    fn an_empty_page_is_valid() {
        let fixture = json!({
            "pageInfo": { "total": 50, "lastPage": 1, "hasNextPage": false },
            "characters": [],
        });
        let page = parse_page(CardKind::Character, 2, &fixture).unwrap();
        assert!(page.nodes.is_empty());
        assert_eq!(page.last_page, 1);
    }

    #[test]
    fn duplicate_ids_inside_a_page_collapse() {
        let fixture = fixture_cards(&[(5, Some(1), None), (5, Some(2), None), (6, Some(3), None)]);
        let page = parse_page(CardKind::Character, 1, &fixture).unwrap();
        assert_eq!(page.nodes.len(), 2);
        assert_eq!(page.nodes[0].entity_id, 5);
    }

    #[test]
    fn null_stats_score_zero_and_missing_ids_are_skipped() {
        let fixture = json!({
            "pageInfo": { "total": 2, "lastPage": 1, "hasNextPage": false },
            "characters": [
                { "id": 1, "name": { "full": "No stats" }, "favourites": null, "image": null },
                { "id": 0, "name": { "full": "Bad id" }, "favourites": 5 }
            ],
        });
        let page = parse_page(CardKind::Character, 1, &fixture).unwrap();
        assert_eq!(page.nodes.len(), 1);
        assert_eq!(page.nodes[0].favourites, 0);
        assert!((page.nodes[0].score - 0.0).abs() < 1e-9);
        assert!(page.nodes[0].image_url.is_none());
    }

    #[test]
    fn anime_title_prefers_romaji_and_studios_have_no_image() {
        let anime = json!({
            "pageInfo": { "total": 1, "lastPage": 1, "hasNextPage": false },
            "media": [{
                "id": 16498,
                "title": { "romaji": "Shingeki no Kyojin", "english": "Attack on Titan" },
                "favourites": 80_784,
                "popularity": 1_077_853,
                "coverImage": { "large": "https://img/aot.jpg" }
            }],
        });
        let parsed = parse_page(CardKind::Anime, 1, &anime).unwrap();
        assert_eq!(parsed.nodes[0].title, "Shingeki no Kyojin");
        assert!(parsed.nodes[0].score > 0.0);

        let studio = json!({
            "pageInfo": { "total": 1, "lastPage": 1, "hasNextPage": false },
            "studios": [{ "id": 2, "name": "Kyoto Animation", "favourites": 23_496 }],
        });
        let parsed = parse_page(CardKind::Studio, 1, &studio).unwrap();
        assert_eq!(parsed.nodes[0].title, "Kyoto Animation");
        assert!(parsed.nodes[0].image_url.is_none());
    }

    #[test]
    fn aliased_response_selects_the_matching_page() {
        let response = json!({
            "data": {
                "p2": fixture_cards(&[(7, Some(1), None)]),
                "p3": fixture_cards(&[(8, Some(1), None)]),
            }
        });
        let page = parse_aliased_page(CardKind::Character, 3, &response).unwrap();
        assert_eq!(page.nodes[0].entity_id, 8);
        assert!(parse_aliased_page(CardKind::Character, 4, &response).is_err());
    }

    #[test]
    fn merging_pages_dedupes_across_aliases() {
        let first = parse_page(
            CardKind::Character,
            1,
            &fixture_cards(&[(1, Some(1), None)]),
        )
        .unwrap();
        let second = parse_page(
            CardKind::Character,
            2,
            &fixture_cards(&[(1, Some(1), None), (2, Some(1), None)]),
        )
        .unwrap();
        let merged = merge_distinct(&[first, second]);
        assert_eq!(merged.len(), 2);
    }

    #[test]
    fn pick_distinct_returns_unique_cards() {
        let page = parse_page(
            CardKind::Character,
            1,
            &fixture_cards(&[(1, Some(1), None), (2, Some(1), None), (3, Some(1), None)]),
        )
        .unwrap();
        let mut rng = Rng::new(5);
        let picked = pick_distinct(&page.nodes, 3, &mut rng);
        assert_eq!(picked.len(), 3);
        let mut ids: Vec<i64> = picked.iter().map(|card| card.entity_id).collect();
        ids.sort_unstable();
        assert_eq!(ids, vec![1, 2, 3]);
    }

    #[test]
    fn the_guarantee_replaces_the_weakest_pick_when_needed() {
        let weak = parse_page(
            CardKind::Character,
            1,
            &fixture_cards(&[(1, Some(0), None), (2, Some(1), None)]),
        )
        .unwrap();
        let strong = parse_page(
            CardKind::Character,
            1,
            &fixture_cards(&[(3, Some(2_000_000), None)]),
        )
        .unwrap();
        let mut selected = weak.nodes.clone();
        let mut pool = weak.nodes.clone();
        pool.extend(strong.nodes.clone());
        ensure_rare_plus(&mut selected, &pool);
        assert!(selected
            .iter()
            .any(|card| tier_for(card.kind, card.score) >= CardRarity::Rare));
    }

    #[test]
    fn the_guarantee_leaves_an_existing_rare_pick_alone() {
        let strong = parse_page(
            CardKind::Character,
            1,
            &fixture_cards(&[(3, Some(2_000_000), None)]),
        )
        .unwrap();
        let mut selected = strong.nodes.clone();
        ensure_rare_plus(&mut selected, &strong.nodes);
        assert_eq!(selected.len(), 1);
    }
}
