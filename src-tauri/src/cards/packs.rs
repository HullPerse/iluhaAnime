use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;
use tauri::AppHandle;

use super::ceilings::{fetch_pages, page_ceiling};
use super::config::{pick_variant, shop_pack, CARD_PACK_SIZE};
use super::metadata::refresh_metadata;
use super::rarity::{card_value, tier_for};
use super::rng::{seed_now, Rng};
use super::sampling::{
    ensure_rare_plus, merge_distinct, pick_distinct, CardNode,
};
use super::types::{CardKind, CardPackContentsState, CardRarity, CardVariant};
use crate::app_db::cards::{
    acknowledge_ready_packs, add_wallet, get_meta, get_pack, get_user_card, insert_ledger,
    insert_opening, insert_pack, list_openings_for_pack, list_pack_cards, list_packs,
    list_packs_to_prepare, mark_pack_opened, mark_pack_prepare_failed, mark_pack_prepare_started,
    ready_unnotified_count, save_pack_cards, trim_ledger, trim_openings, upsert_card, upsert_meta,
    CardMetaRow, CardOpeningRow, CardPackCardRow, CardPackRow, ChubrikLedgerRow, UserCardRow,
    LEDGER_RETENTION, LOCAL_USER_ID, OPENINGS_RETENTION,
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

/// Test packs use an id prefix as their guarantee marker; the pack row stays
/// exactly the same shape as every other pack.
const TEST_LEGENDARY_PREFIX: &str = "legendary-test-";
const TEST_EFFECTS_PREFIX: &str = "effects-test-";
const PREPARE_BATCH: i64 = 5;
const PREPARE_MAX_ATTEMPTS: i64 = 5;
const PREPARE_IMAGE_LIMIT: usize = 24;

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

fn is_test_legendary_pack(pack_id: &str) -> bool {
    pack_id.starts_with(TEST_LEGENDARY_PREFIX)
}

fn is_test_effects_pack(pack_id: &str) -> bool {
    pack_id.starts_with(TEST_EFFECTS_PREFIX)
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
    let multiplier = (1.0 + DUPLICATE_PAYOUT_GROWTH * copies / (copies + DUPLICATE_PAYOUT_SOFTNESS))
        .min(DUPLICATE_PAYOUT_MAX);
    (value as f64 * multiplier).round() as i64
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackOpening {
    pub pack_id: String,
    pub cards: Vec<OpenedCard>,
    pub value: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackPreparation {
    pub prepared: usize,
    pub failed: usize,
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
    meta_fetched_at: i64,
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
            meta_fetched_at: 1,
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
            image_url: self.card.image_url.clone(),
            score: Some(self.score.round() as i64),
            popularity: Some(i64::from(self.popularity)),
            favourites: Some(i64::from(self.favourites)),
            collection_anime_id: self.card.collection_anime_id,
            collection_manga_id: None,
            collection_title: self.card.collection_title.clone(),
            collection_cover_url: self.card.collection_cover_url.clone(),
            collage_json: Some(
                serde_json::to_string(&self.card.collage)
                    .unwrap_or_else(|_| "[]".to_string()),
            ),
            fetched_at: if self.meta_fetched_at > 0 { now } else { 0 },
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
    let pack = shop_pack(pack_kind).ok_or_else(|| format!("unknown card pack kind: {pack_kind}"))?;
    if size != pack.size {
        return Err(format!(
            "{pack_kind} pack size must be {}, got {size}",
            pack.size
        ));
    }
    if pack.chances.is_empty() {
        let total: usize = pack.contents.iter().map(|slot| slot.count).sum();
        if total != size {
            return Err(format!("{pack_kind} contents total {total}, expected {size}"));
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
) -> Result<Vec<CardNode>, String> {
    let ceiling = page_ceiling(app, kind, 25, None, proxy).await?;
    let mut pages = vec![1 + rng.next_below(u64::from(ceiling)) as u32];
    if ceiling > 1 {
        let mut second = 1 + rng.next_below(u64::from(ceiling)) as u32;
        if second == pages[0] {
            second = if pages[0] == 1 { 2 } else { 1 };
        }
        pages.push(second);
    }
    let fetched = fetch_pages(kind, &pages, 25, None, proxy).await?;
    let pool = merge_distinct(&fetched);
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

async fn sample_cards(
    app: &AppHandle,
    needs: &[(CardKind, usize)],
    seed: u64,
    proxy: Option<&str>,
) -> Result<Vec<CardNode>, String> {
    let mut rng = Rng::new(seed);
    let mut selected = Vec::new();
    let mut pool = Vec::new();
    for (kind, count) in needs {
        let picked = sample_pool(app, *kind, *count, &mut rng, proxy).await?;
        pool.extend(picked.iter().cloned());
        selected.extend(picked);
    }
    ensure_rare_plus(&mut selected, &pool);
    Ok(selected)
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

/// Test-only pity. It upgrades the highest-tier card in place and rebuilds its
/// salvage value from the same frozen score used by the normal generator.
fn guarantee_minimum_rarity(cards: &mut [GeneratedCard], minimum: CardRarity) {
    if cards.iter().any(|card| card.card.rarity >= minimum) {
        return;
    }
    let Some(index) = cards
        .iter()
        .enumerate()
        .max_by(|(_, left), (_, right)| {
            left.card
                .rarity
                .cmp(&right.card.rarity)
                .then_with(|| {
                    left.node
                        .score
                        .partial_cmp(&right.node.score)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
        })
        .map(|(index, _)| index)
    else {
        return;
    };
    let card = &mut cards[index];
    card.card.rarity = minimum;
    card.card.value = i64::from(card_value(
        card.card.kind,
        minimum,
        card.card.variant,
        card.node.score,
    ));
}

/// Test-only: lay the new finishes out across the pack instead of leaving them
/// to the random variant roll. The anime card moves to slot 0 so the frosted
/// art edge is visible without hunting for it.
fn arrange_effects_showcase(cards: &mut [GeneratedCard]) {
    if let Some(index) = cards.iter().position(|card| card.card.kind == CardKind::Anime) {
        cards.swap(0, index);
    }
    const SHOWCASE: [(CardRarity, CardVariant); 7] = [
        (CardRarity::Common, CardVariant::Foil),
        (CardRarity::Epic, CardVariant::Foil),
        (CardRarity::Legendary, CardVariant::Foil),
        (CardRarity::Rare, CardVariant::Holo),
        (CardRarity::Epic, CardVariant::Holo),
        (CardRarity::Legendary, CardVariant::Holo),
        (CardRarity::Legendary, CardVariant::Normal),
    ];
    for (card, (rarity, variant)) in cards.iter_mut().zip(SHOWCASE.into_iter()) {
        card.card.rarity = rarity;
        card.card.variant = variant;
        card.card.value = i64::from(card_value(
            card.card.kind,
            rarity,
            variant,
            card.node.score,
        ));
    }
}

async fn generate_pack_contents(
    app: &AppHandle,
    pack: &CardPackRow,
    proxy: Option<&str>,
) -> Result<Vec<GeneratedCard>, String> {
    let mut plan_rng = Rng::new(pack.seed as u64 ^ 0x9E37_79B9_7F4A_7C15);
    let needs = if is_test_effects_pack(&pack.id) {
        vec![
            (CardKind::Anime, 1),
            (CardKind::Character, pack.size.saturating_sub(1) as usize),
        ]
    } else {
        pack_needs(&pack.pack_kind, pack.size as usize, &mut plan_rng)?
    };
    let nodes = sample_cards(app, &needs, pack.seed as u64, proxy).await?;
    let mut generated = generate_cards(nodes, pack.seed as u64);
    if is_test_legendary_pack(&pack.id) {
        guarantee_minimum_rarity(&mut generated, CardRarity::Legendary);
    }
    if is_test_effects_pack(&pack.id) {
        arrange_effects_showcase(&mut generated);
    }
    if generated.len() != pack.size as usize {
        return Err("card pack size changed while preparing".into());
    }
    let meta_keys: Vec<(CardKind, i64)> = generated
        .iter()
        .map(|item| (item.card.kind, item.card.entity_id))
        .collect();
    if let Err(error) = refresh_metadata(app, &meta_keys, proxy).await {
        tracing::warn!(error = error.as_str(), "card metadata refresh after prepare failed");
    }
    Ok(generated)
}

fn prepare_generated(
    connection: &rusqlite::Connection,
    generated: Vec<GeneratedCard>,
) -> Result<Vec<PreparedCard>, String> {
    generated
        .into_iter()
        .map(|generated| {
            let GeneratedCard { node, mut card } = generated;
            let meta = get_meta(connection, card.kind, card.entity_id)?;
            let collage = meta
                .as_ref()
                .and_then(|row| row.collage_json.as_deref())
                .and_then(|json| serde_json::from_str::<Vec<String>>(json).ok())
                .unwrap_or_default();
            if let Some(row) = &meta {
                if !row.title.trim().is_empty() {
                    card.title = row.title.clone();
                }
                if card.image_url.is_none() {
                    card.image_url = row.image_url.clone();
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
                meta_fetched_at: meta.as_ref().map_or(0, |row| row.fetched_at),
            })
        })
        .collect()
}

async fn prepare_pack(
    app: &AppHandle,
    pack: &CardPackRow,
    proxy: Option<&str>,
) -> Result<Vec<PreparedCard>, String> {
    let generated = generate_pack_contents(app, pack, proxy).await?;
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
        upsert_meta(&connection, &card.meta_row(now))?;
    }
    let rows: Vec<CardPackCardRow> = prepared
        .iter()
        .enumerate()
        .map(|(slot, card)| card.row(pack_id, slot))
        .collect();
    save_pack_cards(&mut connection, LOCAL_USER_ID, pack_id, &rows, now)
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
        });
    }
    let mut value = 0i64;
    for (index, prepared) in prepared.iter().enumerate() {
        let card = &prepared.card;
        let copies_before = get_user_card(
            &transaction,
            LOCAL_USER_ID,
            card.kind,
            card.entity_id,
            card.rarity,
            card.variant,
        )?
        .map_or(0, |row| row.copies);
        value = value.saturating_add(payout_for(card.value, copies_before));
        upsert_card(
            &transaction,
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
        // Do not overwrite shared metadata with the frozen pack row here: an
        // old pack may carry a stale source, and opening must not undo a newer
        // metadata refresh. `save_prepared` already writes metadata when the
        // pack is prepared.
        insert_opening(
            &transaction,
            LOCAL_USER_ID,
            &CardOpeningRow {
                id: format!("{pack_id}:{index:02}"),
                pack_id: pack_id.to_string(),
                kind: card.kind,
                entity_id: card.entity_id,
                rarity: card.rarity,
                variant: card.variant,
                at: now,
            },
        )?;
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
    })
}

async fn warm_pack_images(app: &AppHandle, prepared: &[PreparedCard], proxy: Option<&str>) {
    let mut urls: Vec<String> = prepared
        .iter()
        .flat_map(|item| {
            std::iter::once(item.card.image_url.clone())
                .chain(std::iter::once(item.card.collection_cover_url.clone()))
                .chain(item.card.collage.iter().cloned().map(Some))
        })
        .flatten()
        .filter(|url| !url.trim().is_empty())
        .collect();
    urls.sort();
    urls.dedup();
    for url in urls.into_iter().take(PREPARE_IMAGE_LIMIT) {
        if let Err(error) = crate::user_assets::fetch_remote_image(
            app.clone(),
            url,
            proxy.map(str::to_string),
            None,
            None,
            None,
        )
        .await
        {
            tracing::debug!(error = error.as_str(), "card pack image warmup failed");
        }
    }
}

fn opened_from_db(
    connection: &rusqlite::Connection,
    pack_id: &str,
) -> Result<Vec<OpenedCard>, String> {
    let mut cards = Vec::new();
    for opening in list_openings_for_pack(connection, LOCAL_USER_ID, pack_id)? {
        let Some(stored) = get_user_card(
            connection,
            LOCAL_USER_ID,
            opening.kind,
            opening.entity_id,
            opening.rarity,
            opening.variant,
        )? else {
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
            title: meta.as_ref().map(|row| row.title.clone()).unwrap_or_default(),
            image_url: meta.as_ref().and_then(|row| row.image_url.clone()),
            collage,
            rarity: opening.rarity,
            variant: opening.variant,
            value: stored.value,
            collection_anime_id: meta.as_ref().and_then(|row| row.collection_anime_id),
            collection_title: meta.as_ref().and_then(|row| row.collection_title.clone()),
            collection_cover_url: meta.as_ref().and_then(|row| row.collection_cover_url.clone()),
        });
    }
    Ok(cards)
}

#[tauri::command]
pub fn cards_packs(app: AppHandle) -> Result<Vec<CardPackRow>, String> {
    let connection = open_database(&app)?;
    list_packs(&connection, LOCAL_USER_ID, 50)
}

async fn prepare_packs_inner(
    app: &AppHandle,
    proxy: Option<&str>,
) -> Result<PackPreparation, String> {
    let packs = {
        let connection = open_database(app)?;
        list_packs_to_prepare(
            &connection,
            LOCAL_USER_ID,
            PREPARE_BATCH,
            PREPARE_MAX_ATTEMPTS,
        )?
    };
    let mut prepared = 0;
    let mut failed = 0;
    for pack in packs {
        let claimed = {
            let connection = open_database(app)?;
            mark_pack_prepare_started(
                &connection,
                LOCAL_USER_ID,
                &pack.id,
                PREPARE_MAX_ATTEMPTS,
            )?
        };
        if !claimed {
            continue;
        }
        match prepare_pack(app, &pack, proxy).await {
            Ok(cards) => match save_prepared(app, &pack.id, &cards) {
                Ok(true) => {
                    prepared += 1;
                    warm_pack_images(app, &cards, proxy).await;
                }
                Ok(false) => {}
                Err(error) => {
                    failed += 1;
                    tracing::warn!(pack_id = pack.id, error = error.as_str(), "card pack save failed");
                    let connection = open_database(app)?;
                    mark_pack_prepare_failed(
                        &connection,
                        LOCAL_USER_ID,
                        &pack.id,
                        &error,
                    )?;
                }
            },
            Err(error) => {
                failed += 1;
                tracing::warn!(pack_id = pack.id, error = error.as_str(), "card pack preparation failed");
                let connection = open_database(app)?;
                mark_pack_prepare_failed(&connection, LOCAL_USER_ID, &pack.id, &error)?;
            }
        }
    }
    let connection = open_database(app)?;
    Ok(PackPreparation {
        prepared,
        failed,
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

/// Starts background preparation without blocking a grant, purchase or open.
pub fn spawn_prepare_packs(app: AppHandle) {
    spawn_prepare_packs_with_proxy(app, None);
}

/// Same as [`spawn_prepare_packs`], but keeps the user's AniList proxy for
/// grants that already resolved one.
pub fn spawn_prepare_packs_with_proxy(app: AppHandle, proxy: Option<String>) {
    tauri::async_runtime::spawn(async move {
        if let Err(error) = prepare_packs_guarded(&app, proxy.as_deref()).await {
            tracing::warn!(error = error.as_str(), "card pack background preparation failed");
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

fn grant_test_pack(app: AppHandle, id_prefix: &str) -> Result<CardPackRow, String> {
    let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
    let connection = open_database(&app)?;
    let seed = seed_now();
    let now = now_seconds();
    let pack = CardPackRow {
        id: format!("{id_prefix}{seed}"),
        source: "test".into(),
        pack_kind: "default".into(),
        media_id: None,
        seed: seed as i64,
        size: CARD_PACK_SIZE as i64,
        created_at: now,
        opened_at: None,
        contents_state: CardPackContentsState::Pending,
    };
    insert_pack(&connection, LOCAL_USER_ID, &pack)?;
    Ok(pack)
}

/// Test tools grant exactly one pack, never the episode count.
#[tauri::command]
pub fn cards_grant_test_pack(app: AppHandle) -> Result<CardPackRow, String> {
    let pack = grant_test_pack(app.clone(), "test-")?;
    spawn_prepare_packs(app);
    Ok(pack)
}

/// A test pack that always contains a legendary card.
#[tauri::command]
pub fn cards_grant_test_legendary_pack(app: AppHandle) -> Result<CardPackRow, String> {
    let pack = grant_test_pack(app.clone(), TEST_LEGENDARY_PREFIX)?;
    spawn_prepare_packs(app);
    Ok(pack)
}

/// A test pack that always shows every new finish: matte and gold foil, holo,
/// pressed legendary text and frosted anime art.
#[tauri::command]
pub fn cards_grant_test_effects_pack(app: AppHandle) -> Result<CardPackRow, String> {
    let pack = grant_test_pack(app.clone(), TEST_EFFECTS_PREFIX)?;
    spawn_prepare_packs(app);
    Ok(pack)
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
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let connection = open_database(&app)?;
    let Some(pack) = get_pack(&connection, LOCAL_USER_ID, &pack_id)? else {
        return Err("card pack not found".into());
    };
    if pack.opened_at.is_some() {
        let cards = opened_from_db(&connection, &pack_id)?;
        return Ok(PackOpening { pack_id, cards, value: 0 });
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
                return Ok(PackOpening { pack_id, cards, value: 0 });
            }
            cards
        }
    };
    if prepared.len() != pack.size as usize {
        return Err("card pack size changed while opening".into());
    }
    open_prepared(&app, &pack_id, &prepared)
}

#[cfg(test)]
mod tests {
    use super::*;

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
        assert_eq!(payout_for(20, 0), 20);
        assert_eq!(payout_for(20, 1), 27);
        assert_eq!(payout_for(20, 5), 36);
        assert_eq!(payout_for(20, 10), 40);
        assert_eq!(payout_for(20, 100), 45);
        assert_eq!(payout_for(40, 1), 53);
        assert_eq!(payout_for(120, 1), 159);
        assert_eq!(payout_for(120, 1_000), 276);
        assert_eq!(payout_for(1, 0), 1);
        assert_eq!(payout_for(1, 1), 1);
    }

    #[test]
    fn the_legendary_test_pack_id_is_recognisable() {
        assert!(is_test_legendary_pack("legendary-test-123"));
        assert!(!is_test_legendary_pack("test-123"));
        assert!(!is_test_legendary_pack("buy-123"));
    }

    #[test]
    fn the_effects_test_pack_id_is_recognisable() {
        assert!(is_test_effects_pack("effects-test-123"));
        assert!(!is_test_effects_pack("test-123"));
        assert!(!is_test_effects_pack("legendary-test-123"));
    }

    #[test]
    fn the_effects_test_pack_shows_every_finish() {
        let nodes = (1..=7).map(|id| node(id, 5.0)).collect();
        let mut cards = generate_cards(nodes, 7);
        arrange_effects_showcase(&mut cards);

        assert_eq!(cards[0].card.rarity, CardRarity::Common);
        assert_eq!(cards[0].card.variant, CardVariant::Foil);
        assert_eq!(cards[2].card.variant, CardVariant::Foil);
        assert_eq!(cards[2].card.rarity, CardRarity::Legendary);
        assert_eq!(cards[3].card.variant, CardVariant::Holo);
        assert_eq!(cards[5].card.rarity, CardRarity::Legendary);
        assert_eq!(cards[5].card.variant, CardVariant::Holo);
        assert_eq!(cards[6].card.rarity, CardRarity::Legendary);
        assert_eq!(cards[6].card.variant, CardVariant::Normal);
        assert!(cards.iter().all(|card| card.card.value >= 1));
        assert!(
            cards[5].card.value > cards[3].card.value,
            "holo value must follow its new rarity"
        );
    }

    #[test]
    fn the_legendary_test_pack_upgrades_exactly_one_card() {
        let mut cards = generate_cards(vec![node(1, 0.0), node(2, 1.0), node(3, 2.0)], 7);
        guarantee_minimum_rarity(&mut cards, CardRarity::Legendary);
        assert_eq!(
            cards
                .iter()
                .filter(|card| card.card.rarity == CardRarity::Legendary)
                .count(),
            1
        );
        assert!(cards.iter().any(|card| card.card.value >= 40));
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
            meta_fetched_at: 100,
        };
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
