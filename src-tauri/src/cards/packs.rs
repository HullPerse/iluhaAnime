use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};

use futures::{stream, StreamExt};
use serde::Serialize;
use tauri::AppHandle;

use super::ceilings::{batch_page_ceilings, can_retry_smaller_query, fetch_pages, page_ceiling};
use super::config::{pick_variant, shop_pack, CHOICE_PACK_KIND, CHOICE_PACK_SIZE};
use super::metadata::{refresh_metadata, studio_collage_missing};
use super::rarity::{card_value, score_for, tier_for};
use super::rng::Rng;
use super::sampling::{
    batch_page_query, batch_page_query_with_max, max_id_query, merge_distinct, parse_batch_page,
    parse_id_response, parse_max_id, pick_distinct, random_id_query, CardNode,
};
use super::types::{CardKind, CardPackContentsState, CardRarity, CardVariant};
use crate::anilist::client::graphql_request;
use crate::app_db::cards::{
    acknowledge_ready_packs, add_wallet, claim_pack_card, get_meta, get_pack, get_user_card,
    insert_ledger, insert_opening, list_openings_for_pack, list_pack_cards, list_packs,
    list_packs_to_prepare, list_user_card_stacks, list_user_cards, mark_pack_opened,
    mark_pack_prepare_failed, mark_pack_prepare_started, ready_unnotified_count, save_pack_cards,
    trim_ledger, trim_openings, upsert_card, upsert_meta, CardMetaRow, CardOpeningRow,
    CardPackCardRow, CardPackRow, ChubrikLedgerRow, UserCardRow, LEDGER_RETENTION, LOCAL_USER_ID,
    OPENINGS_RETENTION,
};
use crate::app_db::db::{
    lock_app_data_write_timeout, now_seconds, open_database, APP_DATA_WRITE_TIMEOUT,
};
use crate::scrapers::clients::resolve_proxy;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedCard {
    pub kind: CardKind,
    pub entity_id: i64,
    pub title: String,
    pub image_url: Option<String>,
    pub collage: Vec<String>,
    pub rarity: CardRarity,
    pub variant: CardVariant,
    pub value: i64,
    pub collection_anime_id: Option<i64>,
    pub collection_title: Option<String>,
    pub collection_cover_url: Option<String>,
}

/// Packs use an id prefix as their guarantee marker; the pack row stays exactly
/// the same shape as every other pack.
const PREPARE_BATCH: i64 = 5;
const PREPARE_MAX_ATTEMPTS: i64 = 5;
const PREPARE_IMAGE_LIMIT: usize = 24;
/// Image warmup is a cache fill, never a reason to keep a pack unready, so the
/// whole batch shares one bounded queue instead of waiting per pack.
const PREPARE_IMAGE_BATCH_LIMIT: usize = PREPARE_IMAGE_LIMIT * 5;
/// Sample one page from each popularity band so rare tiers remain available.
fn sampled_pages(kind: CardKind, ceiling: u32, rng: &mut Rng) -> Vec<u32> {
    let ceiling = ceiling.max(1);
    let mut pages = Vec::new();
    if kind == CardKind::Studio {
        for (low, high) in [(1_u32, 4_u32), (6, 14), (15, 27), (30, 58), (60, 100)] {
            let start = low.min(ceiling);
            let end = high.clamp(start, ceiling);
            let page = start + rng.next_below(u64::from(end - start + 1)) as u32;
            if !pages.contains(&page) {
                pages.push(page);
            }
        }
        return pages;
    }
    for (low, high) in [(0_u32, 2_u32), (2, 11), (11, 30), (30, 65), (65, 100)] {
        let start = (ceiling * low / 100 + 1).min(ceiling);
        let end = (ceiling * high).div_ceil(100).clamp(start, ceiling);
        let page = start + rng.next_below(u64::from(end - start + 1)) as u32;
        if !pages.contains(&page) {
            pages.push(page);
        }
    }
    pages
}

/// Merged page nodes per kind, shared by every pack of one prepare run.
type PoolCache = HashMap<CardKind, Vec<CardNode>>;

static PACK_PREPARE_RUNNING: AtomicBool = AtomicBool::new(false);

struct PrepareRunningGuard;

impl PrepareRunningGuard {
    fn acquire() -> Option<Self> {
        (!PACK_PREPARE_RUNNING.swap(true, Ordering::AcqRel)).then_some(Self)
    }
}

impl Drop for PrepareRunningGuard {
    fn drop(&mut self) {
        PACK_PREPARE_RUNNING.store(false, Ordering::Release);
    }
}

/// Duplicate payouts grow with the number of copies already owned, from 1x on
/// the first copy towards 2.3x. The curve is deliberately soft: the first
/// duplicate is 1.33x, the tenth is 2x, and the cap keeps legendary holo pulls
/// from printing chubriks. The frozen per-copy value itself never changes.
const DUPLICATE_PAYOUT_GROWTH: f64 = 1.3;
const DUPLICATE_PAYOUT_SOFTNESS: f64 = 3.0;
const DUPLICATE_PAYOUT_MAX: f64 = 2.3;

fn payout_for(value: i64, copies_before: i64) -> i64 {
    let copies = copies_before.max(0) as f64;
    let multiplier = (1.0
        + DUPLICATE_PAYOUT_GROWTH * copies / (copies + DUPLICATE_PAYOUT_SOFTNESS))
        .min(DUPLICATE_PAYOUT_MAX);
    (value as f64 * multiplier * 0.9).round().max(1.0) as i64
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackOpening {
    pub pack_id: String,
    pub cards: Vec<OpenedCard>,
    pub value: i64,
    /// Set for choice packs once a card has been picked.
    pub chosen_slot: Option<i64>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackPreparation {
    pub prepared: usize,
    pub failed: usize,
    /// Studio collages refreshed for cards the user already owns.
    pub repaired: usize,
    pub unnotified: i64,
}

struct GeneratedCard {
    node: CardNode,
    card: OpenedCard,
}

/// A generated card plus the metadata needed to write the frozen pack contents
/// and the eventual `user_cards` row without another network request.
struct PreparedCard {
    card: OpenedCard,
    favourites: u32,
    popularity: u32,
    score: f64,
    /// AniList art kept separately from the frozen pack art so saving a pack
    /// never rewrites the metadata default with the user's MAL choice.
    meta_image_url: Option<String>,
    meta_fetched_at: i64,
    collage_expected: Option<i64>,
}

impl PreparedCard {
    fn from_row(row: CardPackCardRow) -> Self {
        let collage = serde_json::from_str::<Vec<String>>(&row.collage_json).unwrap_or_default();
        Self {
            card: OpenedCard {
                kind: row.kind,
                entity_id: row.entity_id,
                title: row.title,
                image_url: row.image_url,
                collage,
                rarity: row.rarity,
                variant: row.variant,
                value: row.value,
                collection_anime_id: row.collection_anime_id,
                collection_title: row.collection_title,
                collection_cover_url: row.collection_cover_url,
            },
            favourites: u32::try_from(row.favourites).unwrap_or(0),
            popularity: u32::try_from(row.popularity).unwrap_or(0),
            score: row.score,
            meta_image_url: None,
            meta_fetched_at: 1,
            collage_expected: None,
        }
    }

    fn row(&self, pack_id: &str, slot: usize) -> CardPackCardRow {
        CardPackCardRow {
            pack_id: pack_id.to_string(),
            slot: slot as i64,
            kind: self.card.kind,
            entity_id: self.card.entity_id,
            title: self.card.title.clone(),
            image_url: self.card.image_url.clone(),
            rarity: self.card.rarity,
            variant: self.card.variant,
            value: self.card.value,
            favourites: i64::from(self.favourites),
            popularity: i64::from(self.popularity),
            score: self.score,
            collage_json: serde_json::to_string(&self.card.collage)
                .unwrap_or_else(|_| "[]".to_string()),
            collection_anime_id: self.card.collection_anime_id,
            collection_title: self.card.collection_title.clone(),
            collection_cover_url: self.card.collection_cover_url.clone(),
        }
    }

    fn meta_row(&self, now: i64) -> CardMetaRow {
        CardMetaRow {
            kind: self.card.kind,
            entity_id: self.card.entity_id,
            title: self.card.title.clone(),
            image_url: self.meta_image_url.clone(),
            score: Some(self.score.round() as i64),
            popularity: Some(i64::from(self.popularity)),
            favourites: Some(i64::from(self.favourites)),
            collection_anime_id: self.card.collection_anime_id,
            collection_manga_id: None,
            collection_title: self.card.collection_title.clone(),
            collection_cover_url: self.card.collection_cover_url.clone(),
            collage_json: Some(
                serde_json::to_string(&self.card.collage).unwrap_or_else(|_| "[]".to_string()),
            ),
            fetched_at: if self.meta_fetched_at > 0 { now } else { 0 },
            preferred_image_url: None,
            collage_expected: self.collage_expected,
        }
    }
}

/// Number of cards per kind for a pack, read from the one shared definition.
/// Fixed packs use `contents`; the standard pack rolls every card through
/// `chances` (75% character / 15% anime / 10% manga by default).
pub fn pack_needs(
    pack_kind: &str,
    size: usize,
    rng: &mut Rng,
) -> Result<Vec<(CardKind, usize)>, String> {
    let pack =
        shop_pack(pack_kind).ok_or_else(|| format!("unknown card pack kind: {pack_kind}"))?;
    if size != pack.size {
        return Err(format!(
            "{pack_kind} pack size must be {}, got {size}",
            pack.size
        ));
    }
    if pack.chances.is_empty() {
        let total: usize = pack.contents.iter().map(|slot| slot.count).sum();
        if total != size {
            return Err(format!(
                "{pack_kind} contents total {total}, expected {size}"
            ));
        }
        return Ok(pack
            .contents
            .iter()
            .map(|slot| (slot.kind, slot.count))
            .collect());
    }
    let total_weight: u32 = pack.chances.iter().map(|chance| chance.weight).sum();
    if total_weight == 0 {
        return Err(format!("{pack_kind} chances have zero weight"));
    }
    let mut counts: Vec<(CardKind, usize)> = Vec::new();
    for _ in 0..size {
        let roll = rng.next_below(u64::from(total_weight)) as u32;
        let mut cursor = 0;
        let mut picked = pack.chances.last().map(|chance| chance.kind);
        for chance in pack.chances {
            cursor += chance.weight;
            if roll < cursor {
                picked = Some(chance.kind);
                break;
            }
        }
        let Some(kind) = picked else { continue };
        if let Some((_, count)) = counts.iter_mut().find(|(entry, _)| *entry == kind) {
            *count += 1;
        } else {
            counts.push((kind, 1));
        }
    }
    Ok(counts)
}

async fn sample_pool(
    app: &AppHandle,
    kind: CardKind,
    count: usize,
    rng: &mut Rng,
    proxy: Option<&str>,
    pools: &mut PoolCache,
) -> Result<Vec<CardNode>, String> {
    let pool = match pools.get(&kind) {
        Some(cached) if cached.len() >= count => cached.clone(),
        _ => {
            let ceiling = page_ceiling(app, kind, 25, None, proxy).await?;
            let pages = sampled_pages(kind, ceiling, rng);
            let fetched = fetch_pages(kind, &pages, 25, None, proxy).await?;
            let merged = merge_distinct(&fetched);
            pools.insert(kind, merged.clone());
            merged
        }
    };
    let picked = pick_distinct(&pool, count, rng);
    if picked.len() < count {
        return Err(format!(
            "AniList returned {} of {count} needed {kind} cards",
            picked.len(),
            kind = kind.as_str()
        ));
    }
    Ok(picked)
}

const RANDOM_ID_BATCH: usize = 200;
const RANDOM_ID_ROUNDS: usize = 5;

fn guaranteed_rarity(rng: &mut Rng) -> CardRarity {
    if rng.next_below(100) < 2 {
        CardRarity::Legendary
    } else {
        CardRarity::Rare
    }
}

fn cached_max_id(app: &AppHandle, kind: CardKind) -> Option<u32> {
    let key = format!("max-id:{}", kind.as_str());
    crate::app_db::cache::read_cached_payload(app, "cards", &key)
        .ok()
        .flatten()?
        .parse::<u32>()
        .ok()
        .filter(|id| *id > 0)
}

fn store_max_id(app: &AppHandle, kind: CardKind, id: u32) {
    let key = format!("max-id:{}", kind.as_str());
    if let Err(error) = crate::app_db::cache::put_app_cache(
        app.clone(),
        "cards".into(),
        key,
        id.to_string(),
        Some(24 * 60 * 60),
    ) {
        tracing::warn!(error = error.as_str(), "card ID ceiling cache failed");
    }
}

async fn maximum_entity_id(
    app: &AppHandle,
    kind: CardKind,
    proxy: Option<&str>,
) -> Result<u32, String> {
    if let Some(id) = cached_max_id(app, kind) {
        return Ok(id);
    }
    let response = graphql_request(max_id_query(kind), None, proxy).await?;
    let nodes = parse_id_response(kind, &response, 1)?;
    let id = nodes
        .first()
        .and_then(|node| u32::try_from(node.entity_id).ok())
        .filter(|id| *id > 0)
        .ok_or("AniList returned no maximum card ID")?;
    store_max_id(app, kind, id);
    Ok(id)
}

async fn sample_random_ids(
    app: &AppHandle,
    kind: CardKind,
    count: usize,
    rng: &mut Rng,
    proxy: Option<&str>,
    excluded: &[CardNode],
) -> Result<Vec<CardNode>, String> {
    if count == 0 {
        return Ok(Vec::new());
    }
    let maximum = maximum_entity_id(app, kind, proxy).await?;
    let mut result = Vec::new();
    let mut attempted = std::collections::HashSet::new();
    for _ in 0..RANDOM_ID_ROUNDS {
        let limit = RANDOM_ID_BATCH.min(maximum as usize - attempted.len());
        if limit == 0 {
            break;
        }
        let mut ids = Vec::with_capacity(limit);
        while ids.len() < limit {
            let id = 1 + rng.next_below(u64::from(maximum)) as u32;
            if attempted.insert(id) {
                ids.push(id);
            }
        }
        let response = graphql_request(random_id_query(kind, &ids), None, proxy).await?;
        let mut nodes = parse_id_response(kind, &response, ids.len().div_ceil(50))?;
        rng.shuffle(&mut nodes);
        for card in nodes {
            if excluded
                .iter()
                .chain(result.iter())
                .any(|old: &CardNode| old.kind == card.kind && old.entity_id == card.entity_id)
            {
                continue;
            }
            result.push(card);
            if result.len() == count {
                return Ok(result);
            }
        }
    }
    Err(format!(
        "AniList returned {} of {count} random {} cards",
        result.len(),
        kind.as_str()
    ))
}

async fn sample_cards(
    app: &AppHandle,
    needs: &[(CardKind, usize)],
    seed: u64,
    proxy: Option<&str>,
    pools: &mut PoolCache,
) -> Result<Vec<CardNode>, String> {
    let mut rng = Rng::new(seed);
    let target = guaranteed_rarity(&mut rng);
    let connection = open_database(app)?;
    let owned = list_user_cards(&connection, LOCAL_USER_ID)?;
    drop(connection);
    let mut selected: Vec<CardNode> = Vec::new();
    for (kind, count) in needs {
        let mut random_count = *count;
        if selected.is_empty() && random_count > 0 {
            let mut guaranteed = None;
            for attempt in 0..3 {
                if attempt > 0 {
                    pools.remove(kind);
                }
                sample_pool(app, *kind, 1, &mut rng, proxy, pools).await?;
                let candidates = pools.get(kind).ok_or("card pool missing")?;
                let eligible: Vec<&CardNode> = candidates
                    .iter()
                    .filter(|card| {
                        let rarity = owned
                            .iter()
                            .filter(|row| row.kind == card.kind && row.entity_id == card.entity_id)
                            .min_by_key(|row| row.first_obtained_at)
                            .map_or_else(|| tier_for(card.kind, card.score), |row| row.rarity);
                        rarity == target
                    })
                    .collect();
                if !eligible.is_empty() {
                    guaranteed =
                        Some(eligible[rng.next_below(eligible.len() as u64) as usize].clone());
                    break;
                }
            }
            selected.push(guaranteed.ok_or_else(|| {
                format!(
                    "no {} candidates of required rarity {}",
                    kind.as_str(),
                    target.as_str()
                )
            })?);
            random_count -= 1;
        }
        let cards = sample_random_ids(app, *kind, random_count, &mut rng, proxy, &selected).await?;
        selected.extend(cards);
    }
    if let Some(card) = selected.first() {
        if let Some(pool) = pools.get_mut(&card.kind) {
            pool.retain(|node| node.entity_id != card.entity_id);
        }
    }
    Ok(selected)
}

fn card_node_from_meta(meta: &CardMetaRow) -> CardNode {
    let favourites = meta.favourites.unwrap_or(0).clamp(0, i64::from(u32::MAX)) as u32;
    let popularity = meta.popularity.unwrap_or(0).clamp(0, i64::from(u32::MAX)) as u32;
    CardNode {
        kind: meta.kind,
        entity_id: meta.entity_id,
        title: meta.title.clone(),
        image_url: meta.display_image_url(),
        favourites,
        popularity,
        score: score_for(meta.kind, favourites, popularity),
    }
}

/// Daily packs promise the answer anime. If the random draw missed it, swap the
/// last slot for a generated card of that exact anime and reshuffle.
fn replace_with_guaranteed(
    generated: &mut [GeneratedCard],
    node: CardNode,
    seed: u64,
    protected: Option<(CardKind, i64)>,
) -> Result<(), String> {
    if generated
        .iter()
        .any(|item| item.card.kind == node.kind && item.card.entity_id == node.entity_id)
    {
        return Ok(());
    }
    if generated.is_empty() {
        return Err("daily reward pack has no slots".into());
    }
    let mut replacement = generate_cards(vec![node], seed ^ 0xDA11_CA5E);
    let Some(card) = replacement.pop() else {
        return Err("could not generate the daily answer card".into());
    };
    let slot = generated
        .iter_mut()
        .rev()
        .find(|slot| protected != Some((slot.card.kind, slot.card.entity_id)))
        .ok_or("daily reward has no replaceable slot")?;
    *slot = card;
    let mut rng = Rng::new(seed ^ 0xD1A1_1E55);
    rng.shuffle(generated);
    Ok(())
}

async fn ensure_daily_guarantee(
    app: &AppHandle,
    pack: &CardPackRow,
    generated: &mut Vec<GeneratedCard>,
    protected: (CardKind, i64),
    proxy: Option<&str>,
) -> Result<(), String> {
    if pack.source != "daily" {
        return Ok(());
    }
    let Some(media_id) = pack.media_id.filter(|id| *id > 0) else {
        return Err("daily reward pack has no answer media id".into());
    };
    if generated
        .iter()
        .any(|item| item.card.kind == CardKind::Anime && item.card.entity_id == media_id)
    {
        return Ok(());
    }
    refresh_metadata(app, &[(CardKind::Anime, media_id)], proxy).await?;
    let connection = open_database(app)?;
    let meta = get_meta(&connection, CardKind::Anime, media_id)?
        .ok_or_else(|| format!("daily answer metadata missing for {media_id}"))?;
    drop(connection);
    replace_with_guaranteed(
        generated,
        card_node_from_meta(&meta),
        pack.seed as u64,
        Some(protected),
    )
}

fn generate_cards(nodes: Vec<CardNode>, seed: u64) -> Vec<GeneratedCard> {
    let mut rng = Rng::new(seed ^ 0xA5A5_A5A5_5A5A_5A5A);
    let mut generated: Vec<GeneratedCard> = nodes
        .into_iter()
        .map(|node| {
            let rarity = tier_for(node.kind, node.score);
            let mut variant = pick_variant(&mut rng);
            if variant == CardVariant::Holo && rarity < CardRarity::Rare {
                variant = CardVariant::Foil;
            }
            let value = i64::from(card_value(node.kind, rarity, variant, node.score));
            GeneratedCard {
                card: OpenedCard {
                    kind: node.kind,
                    entity_id: node.entity_id,
                    title: node.title.clone(),
                    image_url: node.image_url.clone(),
                    collage: Vec::new(),
                    rarity,
                    variant,
                    value,
                    collection_anime_id: None,
                    collection_title: None,
                    collection_cover_url: None,
                },
                node,
            }
        })
        .collect();
    // Kinds are sampled in groups; shuffle so a pack does not end with an
    // anime-only tail that reads as a second, anime-themed pack.
    rng.shuffle(&mut generated);
    generated
}

/// The composition of a pack, derived from its seed. Kept separate from
/// generation so a prepare batch can prefetch every kind it will need.
fn planned_needs(pack: &CardPackRow) -> Result<Vec<(CardKind, usize)>, String> {
    // The choice pack draws its media card and character from one title, so it
    // has no kind mix to prefetch ahead of time.
    if pack.pack_kind == CHOICE_PACK_KIND {
        return Ok(Vec::new());
    }
    let mut plan_rng = Rng::new(pack.seed as u64 ^ 0x9E37_79B9_7F4A_7C15);
    pack_needs(&pack.pack_kind, pack.size as usize, &mut plan_rng)
}

/// Builds each choice pack from the completed title's roster only.
async fn generate_choice_contents(
    app: &AppHandle,
    pack: &CardPackRow,
    proxy: Option<&str>,
) -> Result<Vec<GeneratedCard>, String> {
    let media_id = pack
        .media_id
        .filter(|id| *id > 0)
        .ok_or("choice pack has no media id")?;
    let media_kind = match pack.media_kind {
        Some(kind @ (CardKind::Anime | CardKind::Manga)) => kind,
        _ => return Err("choice pack has no anime or manga kind".into()),
    };
    if pack.size != CHOICE_PACK_SIZE as i64 {
        return Err("choice pack size does not match its contents".into());
    }
    refresh_metadata(app, &[(media_kind, media_id)], proxy).await?;
    let popularity = get_meta(&open_database(app)?, media_kind, media_id)?
        .and_then(|meta| meta.popularity)
        .and_then(|value| u32::try_from(value).ok())
        .unwrap_or_default();
    let seed = pack.seed as u64;
    let nodes =
        super::collections::roster_choice_characters(app, media_id, popularity, seed, proxy)
            .await?;
    Ok(generate_cards(nodes, seed))
}

async fn generate_pack_contents(
    app: &AppHandle,
    pack: &CardPackRow,
    proxy: Option<&str>,
    pools: &mut PoolCache,
) -> Result<Vec<GeneratedCard>, String> {
    if pack.pack_kind == CHOICE_PACK_KIND {
        return generate_choice_contents(app, pack, proxy).await;
    }
    let needs = planned_needs(pack)?;
    let nodes = sample_cards(app, &needs, pack.seed as u64, proxy, pools).await?;
    let protected = nodes
        .first()
        .map(|node| (node.kind, node.entity_id))
        .ok_or("card pack has no guarantee")?;
    let mut generated = generate_cards(nodes, pack.seed as u64);
    if pack.source == "daily" {
        ensure_daily_guarantee(app, pack, &mut generated, protected, proxy).await?;
    }
    if generated.len() != pack.size as usize {
        return Err("card pack size changed while preparing".into());
    }
    Ok(generated)
}

/// Fills the metadata cache for generated cards. The caller batches every
/// pack of a prepare run into a single pass so five packs share one set of
/// AniList requests instead of repeating them per pack.
async fn refresh_generated_metadata(
    app: &AppHandle,
    generated: &[GeneratedCard],
    proxy: Option<&str>,
) {
    let mut meta_keys: Vec<(CardKind, i64)> = generated
        .iter()
        .map(|item| (item.card.kind, item.card.entity_id))
        .collect();
    if meta_keys.is_empty() {
        return;
    }
    meta_keys.sort_unstable_by_key(|(kind, entity_id)| (kind.as_str(), *entity_id));
    meta_keys.dedup();
    if let Err(error) = refresh_metadata(app, &meta_keys, proxy).await {
        tracing::warn!(
            error = error.as_str(),
            "card metadata refresh after prepare failed"
        );
    }
}

fn prepare_generated(
    connection: &rusqlite::Connection,
    generated: Vec<GeneratedCard>,
) -> Result<Vec<PreparedCard>, String> {
    generated
        .into_iter()
        .map(|generated| {
            let GeneratedCard { node, mut card } = generated;
            if let Some(existing) =
                list_user_card_stacks(connection, LOCAL_USER_ID, card.kind, card.entity_id)?
                    .into_iter()
                    .min_by_key(|row| row.first_obtained_at)
            {
                card.rarity = existing.rarity;
                card.value =
                    i64::from(card_value(card.kind, card.rarity, card.variant, node.score));
            }
            let meta = get_meta(connection, card.kind, card.entity_id)?;
            let meta_image_url = meta
                .as_ref()
                .and_then(|row| row.image_url.clone())
                .or_else(|| card.image_url.clone());
            let collage = meta
                .as_ref()
                .and_then(|row| row.collage_json.as_deref())
                .and_then(|json| serde_json::from_str::<Vec<String>>(json).ok())
                .unwrap_or_default();
            let collage_expected = meta.as_ref().and_then(|row| row.collage_expected);
            if let Some(row) = &meta {
                if !row.title.trim().is_empty() {
                    card.title = row.title.clone();
                }
                if let Some(image_url) = row.display_image_url() {
                    card.image_url = Some(image_url);
                }
                card.collection_anime_id = row.collection_anime_id;
                card.collection_title = row.collection_title.clone();
                card.collection_cover_url = row.collection_cover_url.clone();
            }
            card.collage = collage;
            Ok(PreparedCard {
                card,
                favourites: node.favourites,
                popularity: node.popularity,
                score: node.score,
                meta_image_url,
                meta_fetched_at: meta.as_ref().map_or(0, |row| row.fetched_at),
                collage_expected,
            })
        })
        .collect()
}

async fn prepare_pack(
    app: &AppHandle,
    pack: &CardPackRow,
    proxy: Option<&str>,
) -> Result<Vec<PreparedCard>, String> {
    let mut pools = PoolCache::new();
    let generated = generate_pack_contents(app, pack, proxy, &mut pools).await?;
    refresh_generated_metadata(app, &generated, proxy).await;
    let connection = open_database(app)?;
    let prepared = prepare_generated(&connection, generated)?;
    drop(connection);
    Ok(prepared)
}

fn save_prepared(
    app: &AppHandle,
    pack_id: &str,
    prepared: &[PreparedCard],
) -> Result<bool, String> {
    let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
    let mut connection = open_database(app)?;
    let now = now_seconds();
    for card in prepared {
        if get_meta(&connection, card.card.kind, card.card.entity_id)?.is_none() {
            upsert_meta(&connection, &card.meta_row(now))?;
        }
    }
    let rows: Vec<CardPackCardRow> = prepared
        .iter()
        .enumerate()
        .map(|(slot, card)| card.row(pack_id, slot))
        .collect();
    save_pack_cards(&mut connection, LOCAL_USER_ID, pack_id, &rows, now)
}

/// Adds one pack card to the collection and returns its chubrik payout.
fn grant_pack_card(
    connection: &rusqlite::Connection,
    pack_id: &str,
    slot: usize,
    card: &mut OpenedCard,
    score: f64,
    now: i64,
) -> Result<i64, String> {
    if let Some(existing) =
        list_user_card_stacks(connection, LOCAL_USER_ID, card.kind, card.entity_id)?
            .into_iter()
            .min_by_key(|row| row.first_obtained_at)
    {
        if card.rarity != existing.rarity {
            card.rarity = existing.rarity;
            card.value = i64::from(card_value(card.kind, card.rarity, card.variant, score));
            connection
                .execute(
                    "UPDATE card_pack_cards SET rarity = ?1, value = ?2 WHERE pack_id = ?3 AND slot = ?4",
                    rusqlite::params![card.rarity.as_str(), card.value, pack_id, slot as i64],
                )
                .map_err(|error| format!("update card rarity: {error}"))?;
        }
    }
    let copies_before = get_user_card(
        connection,
        LOCAL_USER_ID,
        card.kind,
        card.entity_id,
        card.rarity,
        card.variant,
    )?
    .map_or(0, |row| row.copies);
    let payout = payout_for(card.value, copies_before);
    upsert_card(
        connection,
        LOCAL_USER_ID,
        &UserCardRow {
            kind: card.kind,
            entity_id: card.entity_id,
            rarity: card.rarity,
            variant: card.variant,
            copies: 1,
            value: card.value,
            first_obtained_at: now,
            last_obtained_at: now,
        },
    )?;
    // Do not overwrite shared metadata with the frozen pack row here: an old
    // pack may carry a stale source, and opening must not undo a newer
    // metadata refresh. `save_prepared` already writes metadata when the pack
    // is prepared.
    insert_opening(
        connection,
        LOCAL_USER_ID,
        &CardOpeningRow {
            id: format!("{pack_id}:{slot:02}"),
            pack_id: pack_id.to_string(),
            kind: card.kind,
            entity_id: card.entity_id,
            rarity: card.rarity,
            variant: card.variant,
            at: now,
        },
    )?;
    Ok(payout)
}

fn open_prepared(
    app: &AppHandle,
    pack_id: &str,
    prepared: &[PreparedCard],
) -> Result<PackOpening, String> {
    let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
    let mut connection = open_database(app)?;
    let transaction = connection
        .transaction()
        .map_err(|error| format!("open card pack transaction: {error}"))?;
    let now = now_seconds();
    if !mark_pack_opened(&transaction, LOCAL_USER_ID, pack_id, now)? {
        drop(transaction);
        let cards = opened_from_db(&connection, pack_id)?;
        return Ok(PackOpening {
            pack_id: pack_id.to_string(),
            cards,
            value: 0,
            chosen_slot: None,
        });
    }
    let mut value = 0i64;
    for (index, prepared) in prepared.iter().enumerate() {
        let mut opened_card = prepared.card.clone();
        value = value.saturating_add(grant_pack_card(
            &transaction,
            pack_id,
            index,
            &mut opened_card,
            prepared.score,
            now,
        )?);
    }
    trim_openings(&transaction, LOCAL_USER_ID, OPENINGS_RETENTION)?;
    if value > 0 {
        add_wallet(&transaction, LOCAL_USER_ID, value)?;
        insert_ledger(
            &transaction,
            LOCAL_USER_ID,
            &ChubrikLedgerRow {
                id: format!("pack-{pack_id}-{now}"),
                amount: value,
                reason: "pack".into(),
                at: now,
            },
        )?;
        trim_ledger(&transaction, LOCAL_USER_ID, LEDGER_RETENTION)?;
    }
    transaction
        .commit()
        .map_err(|error| format!("commit card pack: {error}"))?;
    let cards = opened_from_db(&connection, pack_id)?;
    Ok(PackOpening {
        pack_id: pack_id.to_string(),
        cards,
        value,
        chosen_slot: None,
    })
}

fn prepared_image_urls(prepared: &[PreparedCard]) -> Vec<String> {
    prepared
        .iter()
        .flat_map(|item| {
            std::iter::once(item.card.image_url.clone())
                .chain(std::iter::once(item.card.collection_cover_url.clone()))
                .chain(item.card.collage.iter().cloned().map(Some))
        })
        .flatten()
        .filter(|url| !url.trim().is_empty())
        .collect()
}

fn studio_card_keys<I>(cards: I) -> Vec<(CardKind, i64)>
where
    I: IntoIterator<Item = (CardKind, i64)>,
{
    let mut keys: Vec<(CardKind, i64)> = cards
        .into_iter()
        .filter(|(kind, _)| *kind == CardKind::Studio)
        .collect();
    keys.sort_unstable_by_key(|(_, entity_id)| *entity_id);
    keys.dedup();
    keys
}

async fn repair_pack_studio_metadata(
    app: &AppHandle,
    keys: &[(CardKind, i64)],
    proxy: Option<&str>,
) {
    if keys.is_empty() {
        return;
    }
    if let Err(error) = refresh_metadata(app, keys, proxy).await {
        tracing::warn!(
            error = error.as_str(),
            "pack studio collage metadata refresh failed"
        );
    }
}

/// Refreshes studio metadata with an empty collage for cards the user already
/// owns. The old studio query was rejected by AniList, so those rows can stay
/// broken after the query fix; once healed this is only a database read.
async fn repair_owned_studio_metadata(app: &AppHandle, proxy: Option<&str>) -> usize {
    let keys = {
        let Ok(connection) = open_database(app) else {
            return 0;
        };
        let Ok(owned) = list_user_cards(&connection, LOCAL_USER_ID) else {
            return 0;
        };
        let mut keys: Vec<(CardKind, i64)> = Vec::new();
        for card in owned {
            if card.kind != CardKind::Studio {
                continue;
            }
            let missing = get_meta(&connection, card.kind, card.entity_id)
                .ok()
                .flatten()
                .map_or(true, |meta| {
                    studio_collage_missing(
                        meta.kind,
                        meta.collage_json.as_deref(),
                        meta.collage_expected,
                    )
                });
            if missing {
                keys.push((card.kind, card.entity_id));
            }
        }
        keys.sort_unstable_by_key(|(_, entity_id)| *entity_id);
        keys.dedup();
        keys
    };
    let mut repaired = 0;
    // One alias per studio id: keep each request small enough for AniList.
    for batch in keys.chunks(25) {
        match refresh_metadata(app, batch, proxy).await {
            Ok(count) => repaired += count,
            Err(error) => {
                tracing::warn!(
                    error = error.as_str(),
                    "owned studio collage metadata refresh failed"
                );
            }
        }
    }
    repaired
}

const WARM_IMAGE_CONCURRENCY: usize = 4;

async fn warm_images(app: &AppHandle, urls: Vec<String>, proxy: Option<&str>) {
    let proxy = proxy.map(str::to_string);
    let results = stream::iter(urls)
        .map(|url| {
            let app = app.clone();
            let proxy = proxy.clone();
            async move {
                crate::user_assets::fetch_remote_image(app, url, proxy, None, None, None).await
            }
        })
        .buffer_unordered(WARM_IMAGE_CONCURRENCY)
        .collect::<Vec<_>>()
        .await;
    for result in results {
        if let Err(error) = result {
            tracing::debug!(error = error.as_str(), "card pack image warmup failed");
        }
    }
}

fn opened_from_db(
    connection: &rusqlite::Connection,
    pack_id: &str,
) -> Result<Vec<OpenedCard>, String> {
    // A pack is a snapshot: its cards keep the art frozen when the pack was
    // prepared. Only packs from before this table existed fall back to the
    // current preferred art.
    let frozen_images: std::collections::HashMap<
        (CardKind, i64, CardRarity, CardVariant),
        Option<String>,
    > = list_pack_cards(connection, pack_id)?
        .into_iter()
        .map(|row| {
            (
                (row.kind, row.entity_id, row.rarity, row.variant),
                row.image_url,
            )
        })
        .collect();
    let mut cards = Vec::new();
    for opening in list_openings_for_pack(connection, LOCAL_USER_ID, pack_id)? {
        let Some(stored) = get_user_card(
            connection,
            LOCAL_USER_ID,
            opening.kind,
            opening.entity_id,
            opening.rarity,
            opening.variant,
        )?
        else {
            continue;
        };
        let meta = get_meta(connection, opening.kind, opening.entity_id)?;
        let collage = meta
            .as_ref()
            .and_then(|row| row.collage_json.as_deref())
            .and_then(|json| serde_json::from_str::<Vec<String>>(json).ok())
            .unwrap_or_default();
        cards.push(OpenedCard {
            kind: opening.kind,
            entity_id: opening.entity_id,
            title: meta
                .as_ref()
                .map(|row| row.title.clone())
                .unwrap_or_default(),
            image_url: frozen_images
                .get(&(
                    opening.kind,
                    opening.entity_id,
                    opening.rarity,
                    opening.variant,
                ))
                .cloned()
                .flatten()
                .or_else(|| meta.as_ref().and_then(CardMetaRow::display_image_url)),
            collage,
            rarity: opening.rarity,
            variant: opening.variant,
            value: stored.value,
            collection_anime_id: meta.as_ref().and_then(|row| row.collection_anime_id),
            collection_title: meta.as_ref().and_then(|row| row.collection_title.clone()),
            collection_cover_url: meta
                .as_ref()
                .and_then(|row| row.collection_cover_url.clone()),
        });
    }
    Ok(cards)
}

#[tauri::command]
pub fn cards_packs(app: AppHandle) -> Result<Vec<CardPackRow>, String> {
    let connection = open_database(&app)?;
    list_packs(&connection, LOCAL_USER_ID, 50)
}

/// Warms the shared pool for every kind the batch will sample, using two
/// batched AniList requests (ceilings, then pages) instead of two per kind.
/// A failed batch leaves the cache empty and `sample_pool` falls back to the
/// per-kind path, so functionality never depends on the optimization.
async fn prefill_pools(
    app: &AppHandle,
    packs: &[CardPackRow],
    proxy: Option<&str>,
    pools: &mut PoolCache,
) -> Result<(), String> {
    let mut kinds: Vec<CardKind> = Vec::new();
    for pack in packs {
        let Ok(needs) = planned_needs(pack) else {
            continue;
        };
        for (kind, _) in needs {
            if !kinds.contains(&kind) && !pools.contains_key(&kind) {
                kinds.push(kind);
            }
        }
    }
    if kinds.is_empty() {
        return Ok(());
    }
    let ceilings = match batch_page_ceilings(app, &kinds, 25, proxy).await {
        Ok(ceilings) => ceilings,
        Err(error) if can_retry_smaller_query(&error) => {
            tracing::warn!(error = error.as_str(), "card ceiling batch failed");
            return Ok(());
        }
        Err(error) => return Err(error),
    };
    let mut rng =
        Rng::new(packs.first().map_or(1, |pack| pack.seed as u64) ^ 0xC0FF_EE00_1234_5678);
    let mut entries: Vec<(CardKind, u32)> = Vec::new();
    for kind in &kinds {
        let ceiling = ceilings.get(kind).copied().unwrap_or(1).max(1);
        let pages = sampled_pages(*kind, ceiling, &mut rng);
        entries.extend(pages.into_iter().map(|page| (*kind, page)));
    }
    let missing_max: Vec<CardKind> = kinds
        .iter()
        .copied()
        .filter(|kind| cached_max_id(app, *kind).is_none())
        .collect();
    let query = if missing_max.is_empty() {
        batch_page_query(&entries, 25)
    } else {
        batch_page_query_with_max(&entries, &missing_max)
    };
    let response = match graphql_request(query, None, proxy).await {
        Ok(response) => response,
        Err(error) if !missing_max.is_empty() && can_retry_smaller_query(&error) => {
            tracing::warn!(
                error = error.as_str(),
                "combined card page and max ID request failed, retrying pages only"
            );
            match graphql_request(batch_page_query(&entries, 25), None, proxy).await {
                Ok(response) => response,
                Err(error) if can_retry_smaller_query(&error) => {
                    tracing::warn!(
                        error = error.as_str(),
                        "card page batch failed, falling back to per-kind fetches"
                    );
                    return Ok(());
                }
                Err(error) => return Err(error),
            }
        }
        Err(error) if can_retry_smaller_query(&error) => {
            tracing::warn!(
                error = error.as_str(),
                "card page batch failed, falling back to per-kind fetches"
            );
            return Ok(());
        }
        Err(error) => return Err(error),
    };
    for kind in missing_max {
        if let Some(id) = parse_max_id(kind, &response) {
            store_max_id(app, kind, id);
        }
    }
    for kind in kinds {
        let mut pages = Vec::new();
        for (entry_kind, page) in &entries {
            if *entry_kind != kind {
                continue;
            }
            if let Ok(parsed) = parse_batch_page(kind, *page, &response) {
                pages.push(parsed);
            }
        }
        let merged = merge_distinct(&pages);
        if !merged.is_empty() {
            pools.insert(kind, merged);
        }
    }
    Ok(())
}

async fn prepare_packs_inner(
    app: &AppHandle,
    proxy: Option<&str>,
) -> Result<PackPreparation, String> {
    // Old studio rows keep an empty collage until they are explicitly
    // refreshed; do that before preparing new packs so the album heals too.
    let repaired = repair_owned_studio_metadata(app, proxy).await;
    let packs = {
        let connection = open_database(app)?;
        list_packs_to_prepare(
            &connection,
            LOCAL_USER_ID,
            PREPARE_BATCH,
            PREPARE_MAX_ATTEMPTS,
        )?
    };
    let mut pools = PoolCache::new();
    prefill_pools(app, &packs, proxy, &mut pools).await?;
    let mut claimed_packs: Vec<CardPackRow> = Vec::new();
    for pack in packs {
        let claimed = {
            let connection = open_database(app)?;
            mark_pack_prepare_started(&connection, LOCAL_USER_ID, &pack.id, PREPARE_MAX_ATTEMPTS)?
        };
        if claimed {
            claimed_packs.push(pack);
        }
    }
    let mut staged: Vec<(CardPackRow, Vec<GeneratedCard>)> = Vec::new();
    let mut failed = 0;
    for pack in claimed_packs {
        match generate_pack_contents(app, &pack, proxy, &mut pools).await {
            Ok(cards) => staged.push((pack, cards)),
            Err(error) => {
                failed += 1;
                tracing::warn!(
                    pack_id = pack.id,
                    error = error.as_str(),
                    "card pack preparation failed"
                );
                let connection = open_database(app)?;
                mark_pack_prepare_failed(&connection, LOCAL_USER_ID, &pack.id, &error)?;
            }
        }
    }

    // One metadata pass for the whole batch: the same five starter packs share
    // three card kinds and would otherwise repeat the same AniList requests.
    let batch_keys: Vec<(CardKind, i64)> = staged
        .iter()
        .flat_map(|(_, cards)| {
            cards
                .iter()
                .map(|item| (item.card.kind, item.card.entity_id))
        })
        .collect();
    if !batch_keys.is_empty() {
        let mut keys = batch_keys;
        keys.sort_unstable_by_key(|(kind, entity_id)| (kind.as_str(), *entity_id));
        keys.dedup();
        if let Err(error) = refresh_metadata(app, &keys, proxy).await {
            tracing::warn!(error = error.as_str(), "card batch metadata refresh failed");
        }
    }

    let mut prepared = 0;
    let mut images: Vec<String> = Vec::new();
    for (pack, generated) in staged {
        let cards = {
            let connection = open_database(app)?;
            prepare_generated(&connection, generated)
        };
        let cards = match cards {
            Ok(cards) => cards,
            Err(error) => {
                failed += 1;
                tracing::warn!(
                    pack_id = pack.id,
                    error = error.as_str(),
                    "card pack contents failed"
                );
                let connection = open_database(app)?;
                mark_pack_prepare_failed(&connection, LOCAL_USER_ID, &pack.id, &error)?;
                continue;
            }
        };
        match save_prepared(app, &pack.id, &cards) {
            Ok(true) => {
                prepared += 1;
                images.extend(prepared_image_urls(&cards));
            }
            Ok(false) => {}
            Err(error) => {
                failed += 1;
                tracing::warn!(
                    pack_id = pack.id,
                    error = error.as_str(),
                    "card pack save failed"
                );
                let connection = open_database(app)?;
                mark_pack_prepare_failed(&connection, LOCAL_USER_ID, &pack.id, &error)?;
            }
        }
    }
    images.sort_unstable();
    images.dedup();
    images.truncate(PREPARE_IMAGE_BATCH_LIMIT);
    if !images.is_empty() {
        let warm_app = app.clone();
        let warm_proxy = proxy.map(str::to_string);
        tauri::async_runtime::spawn(async move {
            warm_images(&warm_app, images, warm_proxy.as_deref()).await;
        });
    }
    let connection = open_database(app)?;
    Ok(PackPreparation {
        prepared,
        failed,
        repaired,
        unnotified: ready_unnotified_count(&connection, LOCAL_USER_ID)?,
    })
}

async fn prepare_packs_guarded(
    app: &AppHandle,
    proxy: Option<&str>,
) -> Result<PackPreparation, String> {
    let Some(_guard) = PrepareRunningGuard::acquire() else {
        return Ok(PackPreparation::default());
    };
    prepare_packs_inner(app, proxy).await
}

/// Starts background preparation using the proxy resolved by its caller.
pub fn spawn_prepare_packs_with_proxy(app: AppHandle, proxy: Option<String>) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = prepare_packs_guarded(&app, proxy.as_deref()).await {
            tracing::warn!(
                error = error.as_str(),
                "card pack background preparation failed"
            );
        }
    });
}

/// Prepares a bounded batch of unopened packs. Safe to call on every app start:
/// `notified_at` prevents repeating the same ready notification.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn cards_prepare_packs(
    app: AppHandle,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<PackPreparation, String> {
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    prepare_packs_guarded(&app, proxy.as_deref()).await
}

#[tauri::command]
pub fn cards_ack_prepared_packs(app: AppHandle) -> Result<usize, String> {
    let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
    let connection = open_database(&app)?;
    acknowledge_ready_packs(&connection, LOCAL_USER_ID, now_seconds())
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn cards_open_pack(
    app: AppHandle,
    pack_id: String,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<PackOpening, String> {
    let pack_id = pack_id.trim().to_string();
    if pack_id.is_empty() || pack_id.len() > 128 {
        return Err("invalid card pack id".into());
    }
    crate::cards::require_anilist_account(&app)?;
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let connection = open_database(&app)?;
    let Some(pack) = get_pack(&connection, LOCAL_USER_ID, &pack_id)? else {
        return Err("card pack not found".into());
    };
    if pack.opened_at.is_some() {
        if pack.pack_kind == CHOICE_PACK_KIND {
            let cards = list_pack_cards(&connection, &pack_id)?
                .into_iter()
                .map(|row| PreparedCard::from_row(row).card)
                .collect();
            return Ok(PackOpening {
                pack_id,
                cards,
                value: 0,
                chosen_slot: pack.chosen_slot,
            });
        }
        let keys = studio_card_keys(
            list_openings_for_pack(&connection, LOCAL_USER_ID, &pack_id)?
                .into_iter()
                .map(|opening| (opening.kind, opening.entity_id)),
        );
        drop(connection);
        repair_pack_studio_metadata(&app, &keys, proxy.as_deref()).await;
        let connection = open_database(&app)?;
        let cards = opened_from_db(&connection, &pack_id)?;
        return Ok(PackOpening {
            pack_id,
            cards,
            value: 0,
            chosen_slot: None,
        });
    }
    let ready_cards = if pack.contents_state == CardPackContentsState::Ready {
        let rows = list_pack_cards(&connection, &pack_id)?;
        if rows.len() == pack.size as usize {
            Some(
                rows.into_iter()
                    .map(PreparedCard::from_row)
                    .collect::<Vec<_>>(),
            )
        } else {
            None
        }
    } else {
        None
    };
    drop(connection);

    let prepared = match ready_cards {
        Some(cards) => cards,
        None => {
            let cards = prepare_pack(&app, &pack, proxy.as_deref()).await?;
            if !save_prepared(&app, &pack_id, &cards)? {
                let connection = open_database(&app)?;
                let cards = opened_from_db(&connection, &pack_id)?;
                return Ok(PackOpening {
                    pack_id,
                    cards,
                    value: 0,
                    chosen_slot: None,
                });
            }
            cards
        }
    };
    if prepared.len() != pack.size as usize {
        return Err("card pack size changed while opening".into());
    }
    // A choice pack stops at the reveal: nothing is granted until the user
    // picks one of the two cards.
    if pack.pack_kind == CHOICE_PACK_KIND {
        return Ok(PackOpening {
            pack_id,
            cards: prepared.into_iter().map(|card| card.card).collect(),
            value: 0,
            chosen_slot: None,
        });
    }
    // A ready pack was frozen while the studio query could still fail. Repair
    // its studio metadata before open_prepared reads the cards back for the
    // reveal, otherwise the collage stays empty even after the query fix.
    let studio_keys = studio_card_keys(
        prepared
            .iter()
            .map(|card| (card.card.kind, card.card.entity_id)),
    );
    repair_pack_studio_metadata(&app, &studio_keys, proxy.as_deref()).await;
    open_prepared(&app, &pack_id, &prepared)
}

/// Grants exactly the picked card of a choice pack. The other card stays in
/// the frozen pack contents but never enters the collection.
#[tauri::command]
#[allow(non_snake_case)]
pub fn cards_claim_pack_card(
    app: AppHandle,
    pack_id: String,
    slot: i64,
) -> Result<PackOpening, String> {
    let pack_id = pack_id.trim().to_string();
    if pack_id.is_empty() || pack_id.len() > 128 {
        return Err("invalid card pack id".into());
    }
    crate::cards::require_anilist_account(&app)?;
    let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
    let mut connection = open_database(&app)?;
    claim_choice_pack_in(&mut connection, &pack_id, slot)
}

fn claim_choice_pack_in(
    connection: &mut rusqlite::Connection,
    pack_id: &str,
    slot: i64,
) -> Result<PackOpening, String> {
    let Some(pack) = get_pack(connection, LOCAL_USER_ID, pack_id)? else {
        return Err("card pack not found".into());
    };
    if pack.pack_kind != CHOICE_PACK_KIND {
        return Err("card pack has no choice".into());
    }
    let pack_id = pack_id.to_string();
    if pack.claimed_at.is_some() {
        let cards = list_pack_cards(connection, &pack_id)?
            .into_iter()
            .map(|row| PreparedCard::from_row(row).card)
            .collect();
        return Ok(PackOpening {
            pack_id,
            cards,
            value: 0,
            chosen_slot: pack.chosen_slot,
        });
    }
    let row = list_pack_cards(connection, &pack_id)?
        .into_iter()
        .find(|row| row.slot == slot)
        .ok_or("invalid choice slot")?;
    let prepared = PreparedCard::from_row(row);
    let transaction = connection
        .transaction()
        .map_err(|error| format!("claim card pack transaction: {error}"))?;
    let now = now_seconds();
    if !claim_pack_card(&transaction, LOCAL_USER_ID, &pack_id, slot, now)? {
        drop(transaction);
        let cards = list_pack_cards(connection, &pack_id)?
            .into_iter()
            .map(|row| PreparedCard::from_row(row).card)
            .collect();
        let chosen_slot =
            get_pack(connection, LOCAL_USER_ID, &pack_id)?.and_then(|pack| pack.chosen_slot);
        return Ok(PackOpening {
            pack_id,
            cards,
            value: 0,
            chosen_slot,
        });
    }
    let mut card = prepared.card.clone();
    let value = grant_pack_card(
        &transaction,
        &pack_id,
        slot as usize,
        &mut card,
        prepared.score,
        now,
    )?;
    trim_openings(&transaction, LOCAL_USER_ID, OPENINGS_RETENTION)?;
    if value > 0 {
        add_wallet(&transaction, LOCAL_USER_ID, value)?;
        insert_ledger(
            &transaction,
            LOCAL_USER_ID,
            &ChubrikLedgerRow {
                id: format!("pack-{pack_id}-{now}"),
                amount: value,
                reason: "pack".into(),
                at: now,
            },
        )?;
        trim_ledger(&transaction, LOCAL_USER_ID, LEDGER_RETENTION)?;
    }
    transaction
        .commit()
        .map_err(|error| format!("commit card pack claim: {error}"))?;
    let cards = list_pack_cards(connection, &pack_id)?
        .into_iter()
        .map(|row| PreparedCard::from_row(row).card)
        .collect();
    Ok(PackOpening {
        pack_id,
        cards,
        value,
        chosen_slot: Some(slot),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_db::cards::insert_pack;
    use crate::cards::config::CARD_PACK_SIZE;

    #[test]
    fn the_default_pack_rolls_characters_anime_and_manga_per_card() {
        let mut rng = Rng::new(7);
        let needs = pack_needs("default", 7, &mut rng).unwrap();
        assert_eq!(needs.iter().map(|(_, count)| count).sum::<usize>(), 7);
        assert!(needs.iter().all(|(kind, _)| {
            matches!(
                kind,
                CardKind::Character | CardKind::Anime | CardKind::Manga
            )
        }));
        assert!(pack_needs("default", 8, &mut Rng::new(7)).is_err());
    }

    #[test]
    fn the_default_pack_is_about_seventy_five_percent_characters() {
        let mut rng = Rng::new(99);
        let mut characters = 0;
        for _ in 0..10_000 {
            for (kind, count) in pack_needs("default", 7, &mut rng).unwrap() {
                if kind == CardKind::Character {
                    characters += count;
                }
            }
        }
        assert!((0.72..=0.78).contains(&(characters as f64 / 70_000.0)));
    }

    #[test]
    fn themed_packs_contain_only_their_kind() {
        for (pack_kind, kind) in [
            ("character", CardKind::Character),
            ("anime", CardKind::Anime),
            ("manga", CardKind::Manga),
            ("staff", CardKind::Staff),
            ("studio", CardKind::Studio),
        ] {
            assert_eq!(
                pack_needs(pack_kind, 7, &mut Rng::new(1)).unwrap(),
                vec![(kind, 7)]
            );
        }
        assert!(pack_needs("default", CARD_PACK_SIZE, &mut Rng::new(1)).is_ok());
        assert!(pack_needs("default", CARD_PACK_SIZE + 1, &mut Rng::new(1)).is_err());
        assert!(pack_needs("mystery", 7, &mut Rng::new(1)).is_err());
    }

    fn node(entity_id: i64, score: f64) -> CardNode {
        CardNode {
            kind: CardKind::Character,
            entity_id,
            title: format!("Card {entity_id}"),
            image_url: None,
            favourites: 0,
            popularity: 0,
            score,
        }
    }

    fn anime_node(entity_id: i64) -> CardNode {
        CardNode {
            kind: CardKind::Anime,
            entity_id,
            title: format!("Anime {entity_id}"),
            image_url: None,
            favourites: 80_784,
            popularity: 1_077_853,
            score: 8.0,
        }
    }

    #[test]
    fn daily_answer_replaces_a_missing_slot() {
        let mut cards = generate_cards(vec![node(1, 1.0), node(2, 2.0), node(3, 3.0)], 7);
        replace_with_guaranteed(&mut cards, anime_node(16498), 11, None).expect("guarantee");
        assert_eq!(cards.len(), 3);
        assert_eq!(
            cards
                .iter()
                .filter(|item| item.card.kind == CardKind::Anime && item.card.entity_id == 16498)
                .count(),
            1
        );
    }

    #[test]
    fn daily_answer_does_not_replace_the_guaranteed_card() {
        let mut cards = generate_cards(vec![node(1, 9.0), node(2, 1.0)], 7);
        replace_with_guaranteed(
            &mut cards,
            anime_node(16498),
            11,
            Some((CardKind::Character, 1)),
        )
        .unwrap();
        assert!(cards
            .iter()
            .any(|item| item.card.kind == CardKind::Character && item.card.entity_id == 1));
        assert!(cards
            .iter()
            .any(|item| item.card.kind == CardKind::Anime && item.card.entity_id == 16498));
    }

    #[test]
    fn daily_answer_is_not_duplicated_when_already_present() {
        let answer = anime_node(16498);
        let mut cards = generate_cards(vec![answer.clone(), node(1, 1.0)], 7);
        let before: Vec<(CardKind, i64)> = cards
            .iter()
            .map(|item| (item.card.kind, item.card.entity_id))
            .collect();
        replace_with_guaranteed(&mut cards, answer, 11, None).expect("guarantee");
        let after: Vec<(CardKind, i64)> = cards
            .iter()
            .map(|item| (item.card.kind, item.card.entity_id))
            .collect();
        assert_eq!(before, after);
    }

    fn choice_pack_row() -> CardPackRow {
        CardPackRow {
            id: "status-choice".into(),
            source: "status".into(),
            pack_kind: CHOICE_PACK_KIND.into(),
            media_id: Some(16498),
            media_kind: Some(CardKind::Anime),
            seed: 1,
            size: 2,
            created_at: 1,
            opened_at: None,
            contents_state: CardPackContentsState::Ready,
            claimed_at: None,
            chosen_slot: None,
        }
    }

    fn choice_frozen_card(slot: i64, kind: CardKind, entity_id: i64) -> CardPackCardRow {
        CardPackCardRow {
            pack_id: "status-choice".into(),
            slot,
            kind,
            entity_id,
            title: format!("Card {entity_id}"),
            image_url: None,
            rarity: CardRarity::Rare,
            variant: CardVariant::Normal,
            value: 5,
            favourites: 10,
            popularity: 1000,
            score: 7.0,
            collage_json: "[]".into(),
            collection_anime_id: None,
            collection_title: None,
            collection_cover_url: None,
        }
    }

    #[test]
    fn claiming_a_choice_pack_grants_only_the_picked_card() {
        let mut connection = rusqlite::Connection::open_in_memory().unwrap();
        crate::app_db::schema::initialize_schema(&connection).unwrap();
        insert_pack(&connection, LOCAL_USER_ID, &choice_pack_row()).unwrap();
        save_pack_cards(
            &mut connection,
            LOCAL_USER_ID,
            "status-choice",
            &[
                choice_frozen_card(0, CardKind::Anime, 16498),
                choice_frozen_card(1, CardKind::Character, 500),
            ],
            2,
        )
        .unwrap();

        let opening = claim_choice_pack_in(&mut connection, "status-choice", 1).unwrap();
        assert_eq!(opening.chosen_slot, Some(1));
        assert_eq!(opening.cards.len(), 2);
        assert!(opening.value > 0);

        let owned: Vec<(String, i64)> = connection
            .prepare("SELECT kind, entity_id FROM user_cards ORDER BY entity_id")
            .unwrap()
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(owned, vec![("character".to_string(), 500)]);

        let repeat = claim_choice_pack_in(&mut connection, "status-choice", 0).unwrap();
        assert_eq!(repeat.chosen_slot, Some(1));
        assert_eq!(repeat.value, 0);
        let openings: i64 = connection
            .query_row("SELECT COUNT(*) FROM card_openings", [], |row| row.get(0))
            .unwrap();
        assert_eq!(openings, 1);
    }

    #[test]
    fn a_choice_pack_rejects_an_unknown_slot() {
        let mut connection = rusqlite::Connection::open_in_memory().unwrap();
        crate::app_db::schema::initialize_schema(&connection).unwrap();
        insert_pack(&connection, LOCAL_USER_ID, &choice_pack_row()).unwrap();
        save_pack_cards(
            &mut connection,
            LOCAL_USER_ID,
            "status-choice",
            &[choice_frozen_card(0, CardKind::Anime, 16498)],
            2,
        )
        .unwrap();
        assert!(claim_choice_pack_in(&mut connection, "status-choice", 3).is_err());
        let owned: i64 = connection
            .query_row("SELECT COUNT(*) FROM user_cards", [], |row| row.get(0))
            .unwrap();
        assert_eq!(owned, 0);
    }

    #[test]
    fn generation_is_deterministic_for_a_pack_seed() {
        let cards = vec![node(1, 1.0), node(2, 9.0), node(3, 5.0)];
        let first = generate_cards(cards.clone(), 99);
        let second = generate_cards(cards, 99);
        assert_eq!(
            first.iter().map(|item| &item.card).collect::<Vec<_>>(),
            second.iter().map(|item| &item.card).collect::<Vec<_>>()
        );
        assert_ne!(
            first.iter().map(|item| &item.card).collect::<Vec<_>>(),
            generate_cards(vec![node(1, 1.0), node(2, 9.0), node(3, 5.0)], 100)
                .iter()
                .map(|item| &item.card)
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn prepared_duplicate_keeps_earliest_owned_rarity() {
        let connection = rusqlite::Connection::open_in_memory().unwrap();
        crate::app_db::schema::initialize_schema(&connection).unwrap();
        upsert_card(
            &connection,
            LOCAL_USER_ID,
            &UserCardRow {
                kind: CardKind::Character,
                entity_id: 1,
                rarity: CardRarity::Legendary,
                variant: CardVariant::Normal,
                copies: 1,
                value: 40,
                first_obtained_at: 1,
                last_obtained_at: 1,
            },
        )
        .unwrap();
        let prepared =
            prepare_generated(&connection, generate_cards(vec![node(1, 0.0)], 7)).unwrap();
        assert_eq!(prepared[0].card.rarity, CardRarity::Legendary);
    }

    #[test]
    fn sample_pages_cover_each_popularity_band() {
        let pages = sampled_pages(CardKind::Character, 200, &mut Rng::new(42));
        assert_eq!(pages.len(), 5);
        for (page, (start, end)) in
            pages
                .into_iter()
                .zip([(1, 4), (5, 22), (23, 60), (61, 130), (131, 200)])
        {
            assert!((start..=end).contains(&page));
        }
    }

    #[test]
    fn guaranteed_roll_is_only_rare_or_legendary() {
        let mut rng = Rng::new(42);
        let legendary = (0..100_000)
            .filter(|_| guaranteed_rarity(&mut rng) == CardRarity::Legendary)
            .count();
        assert!((1800..2200).contains(&legendary));
    }

    #[test]
    fn generated_values_follow_the_rarity_and_variant() {
        for generated in generate_cards(vec![node(1, 9.0)], 7) {
            assert!(generated.card.value >= 1);
            assert!(
                generated.card.rarity >= CardRarity::Junk
                    && generated.card.rarity <= CardRarity::Legendary
            );
        }
    }

    #[test]
    fn holo_is_never_generated_below_rare() {
        let junk = vec![node(1, 0.0), node(2, 1.0), node(3, 2.0)];
        for seed in 0..200 {
            for generated in generate_cards(junk.clone(), seed) {
                if generated.card.variant == CardVariant::Holo {
                    assert!(generated.card.rarity >= CardRarity::Rare);
                }
            }
        }
    }

    #[test]
    fn duplicate_payout_grows_from_one_x_to_the_cap() {
        assert_eq!(payout_for(20, 0), 18);
        assert_eq!(payout_for(20, 1), 24);
        assert_eq!(payout_for(20, 5), 33);
        assert_eq!(payout_for(20, 10), 36);
        assert_eq!(payout_for(20, 100), 41);
        assert_eq!(payout_for(40, 1), 48);
        assert_eq!(payout_for(120, 1), 143);
        assert_eq!(payout_for(120, 1_000), 248);
        assert_eq!(payout_for(1, 0), 1);
        assert_eq!(payout_for(1, 1), 1);
    }

    #[test]
    fn a_prepared_card_roundtrips_through_the_pack_row() {
        let card = PreparedCard {
            card: OpenedCard {
                kind: CardKind::Character,
                entity_id: 88414,
                title: "Uta".into(),
                image_url: Some("https://img/uta.jpg".into()),
                collage: Vec::new(),
                rarity: CardRarity::Epic,
                variant: CardVariant::Normal,
                value: 18,
                collection_anime_id: Some(20605),
                collection_title: Some("Tokyo Ghoul".into()),
                collection_cover_url: Some("https://img/tg.jpg".into()),
            },
            favourites: 2_041,
            popularity: 754_505,
            score: 8.16,
            meta_image_url: Some("https://img/uta.jpg".into()),
            meta_fetched_at: 100,
            collage_expected: None,
        };
        assert_eq!(
            card.meta_row(100).image_url.as_deref(),
            Some("https://img/uta.jpg")
        );
        let row = card.row("pack-1", 3);
        assert_eq!(row.pack_id, "pack-1");
        assert_eq!(row.slot, 3);
        assert_eq!(row.kind, CardKind::Character);
        assert_eq!(row.popularity, 754_505);
        let restored = PreparedCard::from_row(row);
        assert_eq!(restored.card.title, "Uta");
        assert_eq!(restored.card.rarity, CardRarity::Epic);
        assert_eq!(restored.card.collection_anime_id, Some(20605));
    }
}
