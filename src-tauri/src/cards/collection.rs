use std::sync::atomic::{AtomicU64, Ordering};

use serde::Serialize;
use tauri::AppHandle;

use super::packs::OpenedCard;
use super::rarity::card_value;
use super::types::{CardKind, CardRarity, CardVariant};
use crate::app_db::cards::{
    add_wallet, claim_gift, count_active_gifts, delete_gift, delete_user_card_stacks, get_gift,
    get_meta, insert_gift, is_card_favorite, list_gifts, list_recent_pulls, list_user_card_stacks,
    list_user_cards, record_gift_claim, remove_one_card_copy, set_card_favorite, upsert_card,
    wallet_balance, CardGiftRow, CardMetaRow, CardPullRow, GiftCardStack, UserCardRow,
    LOCAL_USER_ID,
};
use crate::app_db::db::{
    lock_app_data_write_timeout, now_seconds, open_database, APP_DATA_WRITE_TIMEOUT,
};
use crate::cards::rng::{seed_now, Rng};
use crate::scrapers::clients::resolve_proxy;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionItem {
    pub kind: CardKind,
    pub entity_id: i64,
    pub title: String,
    pub image_url: Option<String>,
    pub collage: Vec<String>,
    pub rarity: CardRarity,
    pub variant: CardVariant,
    pub copies: i64,
    pub value: i64,
    pub total_value: i64,
    pub first_obtained_at: i64,
    pub last_obtained_at: i64,
    pub collection_anime_id: Option<i64>,
    pub collection_title: Option<String>,
    pub is_favorite: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionPage {
    pub items: Vec<CollectionItem>,
    pub total: i64,
    pub page: u32,
    pub page_size: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardPull {
    pub kind: CardKind,
    pub entity_id: i64,
    pub title: String,
    pub image_url: Option<String>,
    pub rarity: CardRarity,
    pub variant: CardVariant,
    pub value: i64,
    pub at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardsStats {
    pub total_cards: i64,
    pub unique_cards: i64,
    pub duplicates: i64,
    pub total_value: i64,
    pub legendary_cards: i64,
    pub active_gifts: i64,
    pub last_pulls: Vec<CardPull>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DustResult {
    pub remaining: i64,
    pub amount: i64,
    pub wallet: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GiftCard {
    pub kind: CardKind,
    pub entity_id: i64,
    pub title: String,
    pub image_url: Option<String>,
    pub collage: Vec<String>,
    pub rarity: CardRarity,
    pub variant: CardVariant,
    pub value: i64,
    pub copies: i64,
    pub first_obtained_at: i64,
    pub last_obtained_at: i64,
    pub collection_anime_id: Option<i64>,
    pub collection_title: Option<String>,
    pub collection_cover_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GiftItem {
    pub id: String,
    pub created_at: i64,
    pub claimed_at: Option<i64>,
    pub cards: Vec<GiftCard>,
    pub total_copies: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GiftDeleteResult {
    pub returned: bool,
}

static GIFT_SEQUENCE: AtomicU64 = AtomicU64::new(1);

fn next_gift_id(now: i64) -> String {
    let sequence = GIFT_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let mut rng = Rng::new(seed_now() ^ sequence.wrapping_mul(0x9E37_79B9_7F4A_7C15));
    format!("gift-{now}-{:016x}{:016x}", rng.next_u64(), rng.next_u64())
}

fn gift_card_from_stack(
    connection: &rusqlite::Connection,
    kind: CardKind,
    entity_id: i64,
    stack: &GiftCardStack,
) -> Result<GiftCard, String> {
    let card = opened_card_from_identity(
        connection,
        kind,
        entity_id,
        stack.rarity,
        stack.variant,
        stack.value,
    )?;
    Ok(GiftCard {
        kind: card.kind,
        entity_id: card.entity_id,
        title: card.title,
        image_url: card.image_url,
        collage: card.collage,
        rarity: card.rarity,
        variant: card.variant,
        value: card.value,
        copies: stack.copies,
        first_obtained_at: stack.first_obtained_at,
        last_obtained_at: stack.last_obtained_at,
        collection_anime_id: card.collection_anime_id,
        collection_title: card.collection_title,
        collection_cover_url: card.collection_cover_url,
    })
}

fn card_stack(card: &UserCardRow) -> GiftCardStack {
    GiftCardStack {
        rarity: card.rarity,
        variant: card.variant,
        copies: card.copies,
        value: card.value,
        first_obtained_at: card.first_obtained_at,
        last_obtained_at: card.last_obtained_at,
    }
}

fn opened_card_from_identity(
    connection: &rusqlite::Connection,
    kind: CardKind,
    entity_id: i64,
    rarity: CardRarity,
    variant: CardVariant,
    value: i64,
) -> Result<OpenedCard, String> {
    let meta = get_meta(connection, kind, entity_id)?;
    let collage = meta
        .as_ref()
        .and_then(|row| row.collage_json.as_deref())
        .and_then(|json| serde_json::from_str::<Vec<String>>(json).ok())
        .unwrap_or_default();
    Ok(OpenedCard {
        kind,
        entity_id,
        title: meta
            .as_ref()
            .map(|row| row.title.clone())
            .unwrap_or_else(|| format!("{kind} #{entity_id}", kind = kind.as_str())),
        image_url: meta.as_ref().and_then(CardMetaRow::display_image_url),
        collage,
        rarity,
        variant,
        value,
        collection_anime_id: meta.as_ref().and_then(|row| row.collection_anime_id),
        collection_title: meta.as_ref().and_then(|row| row.collection_title.clone()),
        collection_cover_url: meta
            .as_ref()
            .and_then(|row| row.collection_cover_url.clone()),
    })
}

fn gift_item(connection: &rusqlite::Connection, gift: &CardGiftRow) -> Result<GiftItem, String> {
    let cards = gift
        .cards
        .iter()
        .map(|stack| gift_card_from_stack(connection, gift.kind, gift.entity_id, stack))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(GiftItem {
        id: gift.id.clone(),
        created_at: gift.created_at,
        claimed_at: gift.claimed_at,
        total_copies: cards.iter().map(|card| card.copies).sum(),
        cards,
    })
}

fn parsed_at<T>(
    row: &rusqlite::Row<'_>,
    index: usize,
    parse: fn(&str) -> Option<T>,
) -> rusqlite::Result<T> {
    let value: String = row.get(index)?;
    parse(&value).ok_or_else(|| {
        rusqlite::Error::InvalidColumnType(index, value, rusqlite::types::Type::Text)
    })
}

pub(crate) fn collection_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<CollectionItem> {
    let kind = parsed_at(row, 0, CardKind::from_db)?;
    let entity_id: i64 = row.get(1)?;
    let value: i64 = row.get(5)?;
    let copies: i64 = row.get(4)?;
    let title: Option<String> = row.get(8)?;
    let collage = row
        .get::<_, Option<String>>(12)?
        .and_then(|json| serde_json::from_str::<Vec<String>>(&json).ok())
        .unwrap_or_default();
    Ok(CollectionItem {
        kind,
        entity_id,
        title: title.unwrap_or_else(|| format!("{kind} #{entity_id}", kind = kind.as_str())),
        image_url: row.get(9)?,
        collage,
        rarity: parsed_at(row, 2, CardRarity::from_db)?,
        variant: parsed_at(row, 3, CardVariant::from_db)?,
        copies,
        value,
        total_value: value.saturating_mul(copies),
        first_obtained_at: row.get(6)?,
        last_obtained_at: row.get(7)?,
        collection_anime_id: row.get(10)?,
        collection_title: row.get(11)?,
        is_favorite: row.get(13)?,
    })
}

/// All owned cards that belong to one media collection: the media card itself
/// plus every character whose primary media is that anime or manga.
pub(crate) fn list_media_collection_items(
    connection: &rusqlite::Connection,
    user_id: i64,
    kind: CardKind,
    media_id: i64,
) -> Result<Vec<CollectionItem>, String> {
    let mut statement = connection
        .prepare(
            "SELECT c.kind, c.entity_id, c.rarity, c.variant, c.copies, c.value,
                    c.first_obtained_at, c.last_obtained_at, m.title, COALESCE(m.preferred_image_url, m.image_url),
                    m.collection_anime_id, m.collection_title, m.collage_json, c.is_favorite
             FROM user_cards c
             LEFT JOIN card_meta m ON m.kind = c.kind AND m.entity_id = c.entity_id
             WHERE c.user_id = ?1
               AND ((?3 = 'anime' AND ((c.kind = 'anime' AND c.entity_id = ?2)
                    OR (c.kind = 'character' AND m.collection_anime_id = ?2)))
                 OR (?3 = 'manga' AND ((c.kind = 'manga' AND c.entity_id = ?2)
                    OR (c.kind = 'character' AND m.collection_manga_id = ?2))))
             ORDER BY CASE WHEN c.kind = ?3 THEN 0 ELSE 1 END,
                      c.value DESC, c.entity_id",
        )
        .map_err(|error| format!("prepare media collection: {error}"))?;
    let rows = statement
        .query_map(
            rusqlite::params![user_id, media_id, kind.as_str()],
            collection_item,
        )
        .map_err(|error| format!("query media collection: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("collect media collection: {error}"))
}

fn collection_order(sort: &str, ascending: bool) -> Option<&'static str> {
    Some(match (sort, ascending) {
        ("recent", true) => "last_at ASC, c.entity_id",
        ("recent", false) => "last_at DESC, c.entity_id",
        ("value", true) => "c.value ASC, last_at ASC",
        ("value", false) => "c.value DESC, last_at DESC",
        ("rarity", true) => {
            "CASE c.rarity
                WHEN 'legendary' THEN 5 WHEN 'epic' THEN 4 WHEN 'rare' THEN 3
                WHEN 'common' THEN 2 ELSE 1 END ASC, c.value ASC"
        }
        ("rarity", false) => {
            "CASE c.rarity
                WHEN 'legendary' THEN 5 WHEN 'epic' THEN 4 WHEN 'rare' THEN 3
                WHEN 'common' THEN 2 ELSE 1 END DESC, c.value DESC"
        }
        ("title", true) => "COALESCE(m.title, '') COLLATE NOCASE ASC, c.entity_id",
        ("title", false) => "COALESCE(m.title, '') COLLATE NOCASE DESC, c.entity_id",
        ("kind", true) => {
            "CASE c.kind
                WHEN 'anime' THEN 0 WHEN 'manga' THEN 1 WHEN 'character' THEN 2
                WHEN 'staff' THEN 3 ELSE 4 END ASC, c.entity_id"
        }
        ("kind", false) => {
            "CASE c.kind
                WHEN 'anime' THEN 0 WHEN 'manga' THEN 1 WHEN 'character' THEN 2
                WHEN 'staff' THEN 3 ELSE 4 END DESC, c.entity_id"
        }
        _ => return None,
    })
}

/// `%`/`_` from the user are escaped so a literal search stays a literal search.
fn search_pattern(query: &str) -> Option<String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return None;
    }
    let mut pattern = String::with_capacity(trimmed.len() + 4);
    pattern.push('%');
    for character in trimmed.chars().take(64) {
        if matches!(character, '\\' | '%' | '_') {
            pattern.push('\\');
        }
        pattern.push(character);
    }
    pattern.push('%');
    Some(pattern)
}

const COLLECTION_SEARCH: &str = "(?5 IS NULL OR m.title LIKE ?5 ESCAPE '\\'\n                OR m.collection_title LIKE ?5 ESCAPE '\\')";

/// Keeps one row per card: when a preferred variant exists, the other rows of
/// the same card drop out of the album page and its total.
const COLLECTION_VISIBLE_VARIANT: &str = "NOT EXISTS (
    SELECT 1 FROM card_preferred_variant p
     WHERE p.kind = c.kind AND p.entity_id = c.entity_id AND p.variant <> c.variant
  )";

fn collection_page(
    connection: &rusqlite::Connection,
    kind_filter: Option<&str>,
    rarity_filter: Option<&str>,
    variant_filter: Option<&str>,
    search: Option<&str>,
    order: &str,
    page_size: u32,
    offset: i64,
) -> Result<Vec<CollectionItem>, String> {
    let sql = format!(
        "SELECT c.kind, c.entity_id, c.rarity, c.variant, c.copies, c.value,
                (SELECT MIN(u.first_obtained_at) FROM user_cards u
                  WHERE u.user_id = c.user_id AND u.kind = c.kind
                    AND u.entity_id = c.entity_id) AS first_at,
                (SELECT MAX(u.last_obtained_at) FROM user_cards u
                  WHERE u.user_id = c.user_id AND u.kind = c.kind
                    AND u.entity_id = c.entity_id) AS last_at,
                m.title, COALESCE(m.preferred_image_url, m.image_url),
                m.collection_anime_id, m.collection_title, m.collage_json, c.is_favorite
         FROM user_cards c
         LEFT JOIN card_meta m ON m.kind = c.kind AND m.entity_id = c.entity_id
         WHERE c.user_id = ?1
           AND (?2 IS NULL OR c.kind = ?2)
           AND (?3 IS NULL OR c.rarity = ?3)
           AND (?4 IS NULL OR c.variant = ?4)
           AND {COLLECTION_SEARCH}
           AND {COLLECTION_VISIBLE_VARIANT}
         ORDER BY c.is_favorite DESC, {order} LIMIT ?6 OFFSET ?7"
    );
    let mut statement = connection
        .prepare(&sql)
        .map_err(|error| format!("prepare collection: {error}"))?;
    let rows = statement
        .query_map(
            rusqlite::params![
                LOCAL_USER_ID,
                kind_filter,
                rarity_filter,
                variant_filter,
                search,
                i64::from(page_size),
                offset
            ],
            collection_item,
        )
        .map_err(|error| format!("query collection: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("collect collection: {error}"))
}

#[tauri::command]
#[allow(clippy::too_many_arguments, non_snake_case)]
pub async fn cards_collection(
    app: AppHandle,
    kind: Option<String>,
    rarity: Option<String>,
    variant: Option<String>,
    sort: Option<String>,
    sort_dir: Option<String>,
    page: Option<u32>,
    page_size: Option<u32>,
    query: Option<String>,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<CollectionPage, String> {
    let kind = match kind.as_deref() {
        Some(value) => Some(CardKind::from_db(value).ok_or("unknown card kind")?),
        None => None,
    };
    let rarity = match rarity.as_deref() {
        Some(value) => Some(CardRarity::from_db(value).ok_or("unknown card rarity")?),
        None => None,
    };
    let variant = match variant.as_deref() {
        Some(value) => Some(CardVariant::from_db(value).ok_or("unknown card variant")?),
        None => None,
    };
    let sort = sort.as_deref().unwrap_or("recent");
    let ascending = match sort_dir.as_deref() {
        Some("asc") => true,
        Some("desc") => false,
        Some(_) => return Err("unknown card sort direction".into()),
        None => sort == "title",
    };
    let order = collection_order(sort, ascending).ok_or("unknown card sort")?;
    let page = page.unwrap_or(1).max(1);
    let page_size = page_size.unwrap_or(24).clamp(1, 100);
    let offset = i64::from(page - 1) * i64::from(page_size);
    let kind_filter = kind.map(CardKind::as_str);
    let rarity_filter = rarity.map(CardRarity::as_str);
    let variant_filter = variant.map(CardVariant::as_str);
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let search = query.as_deref().and_then(search_pattern);

    // One sorted pass per request. The page itself provides the keys for the
    // metadata refresh, so sorting no longer runs the same ORDER BY twice and
    // a cached page costs no network call at all.
    let connection = open_database(&app)?;
    let total: i64 = connection
        .query_row(
            &format!(
                "SELECT COUNT(*) FROM user_cards c
                   LEFT JOIN card_meta m ON m.kind = c.kind AND m.entity_id = c.entity_id
                 WHERE c.user_id = ?1
                   AND (?2 IS NULL OR c.kind = ?2)
                   AND (?3 IS NULL OR c.rarity = ?3)
                   AND (?4 IS NULL OR c.variant = ?4)
                   AND (?5 IS NULL OR m.title LIKE ?5 ESCAPE '\\'
                     OR m.collection_title LIKE ?5 ESCAPE '\\')
                   AND {COLLECTION_VISIBLE_VARIANT}"
            ),
            rusqlite::params![
                LOCAL_USER_ID,
                kind_filter,
                rarity_filter,
                variant_filter,
                search.as_deref()
            ],
            |row| row.get(0),
        )
        .map_err(|error| format!("count collection: {error}"))?;
    let mut items = collection_page(
        &connection,
        kind_filter,
        rarity_filter,
        variant_filter,
        search.as_deref(),
        order,
        page_size,
        offset,
    )?;
    let keys: Vec<(CardKind, i64)> = items
        .iter()
        .map(|item| (item.kind, item.entity_id))
        .collect();
    drop(connection);

    let refreshed = super::metadata::refresh_metadata(&app, &keys, proxy.as_deref())
        .await
        .unwrap_or_else(|error| {
            tracing::warn!(error = error.as_str(), "card metadata refresh failed");
            0
        });
    if refreshed > 0 {
        let connection = open_database(&app)?;
        items = collection_page(
            &connection,
            kind_filter,
            rarity_filter,
            variant_filter,
            search.as_deref(),
            order,
            page_size,
            offset,
        )?;
    }
    Ok(CollectionPage {
        items,
        total,
        page,
        page_size,
    })
}

/// Every owned copy of one card, across variants and rarities. The card detail
/// uses it to switch the shown finish without leaving the modal.
#[tauri::command]
#[allow(non_snake_case)]
pub fn cards_card_variants(
    app: AppHandle,
    kind: String,
    entity_id: i64,
) -> Result<Vec<CollectionItem>, String> {
    let kind = CardKind::from_db(kind.trim()).ok_or("unknown card kind")?;
    if entity_id <= 0 {
        return Err("invalid card entity id".into());
    }
    let connection = open_database(&app)?;
    let mut statement = connection
        .prepare(
            "SELECT c.kind, c.entity_id, c.rarity, c.variant, c.copies, c.value,
                    c.first_obtained_at, c.last_obtained_at, m.title, COALESCE(m.preferred_image_url, m.image_url),
                    m.collection_anime_id, m.collection_title, m.collage_json, c.is_favorite
             FROM user_cards c
             LEFT JOIN card_meta m ON m.kind = c.kind AND m.entity_id = c.entity_id
             WHERE c.user_id = ?1 AND c.kind = ?2 AND c.entity_id = ?3
             ORDER BY c.variant, c.rarity",
        )
        .map_err(|error| format!("prepare card variants: {error}"))?;
    let rows = statement
        .query_map(
            rusqlite::params![LOCAL_USER_ID, kind.as_str(), entity_id],
            collection_item,
        )
        .map_err(|error| format!("query card variants: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("collect card variants: {error}"))
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardsUnread {
    pub packs: i64,
    pub cards: i64,
}

#[tauri::command]
pub fn cards_unread(
    app: AppHandle,
    packs_since: i64,
    cards_since: i64,
) -> Result<CardsUnread, String> {
    let connection = open_database(&app)?;
    let packs = connection
        .query_row(
            "SELECT COUNT(*) FROM card_packs
             WHERE user_id = ?1 AND opened_at IS NULL AND created_at > ?2",
            rusqlite::params![LOCAL_USER_ID, packs_since.max(0)],
            |row| row.get(0),
        )
        .map_err(|error| format!("count unread packs: {error}"))?;
    let cards = connection
        .query_row(
            "SELECT COUNT(*) FROM user_cards
             WHERE user_id = ?1 AND first_obtained_at > ?2",
            rusqlite::params![LOCAL_USER_ID, cards_since.max(0)],
            |row| row.get(0),
        )
        .map_err(|error| format!("count unread cards: {error}"))?;
    Ok(CardsUnread { packs, cards })
}

#[tauri::command]
pub fn cards_stats(app: AppHandle) -> Result<CardsStats, String> {
    let connection = open_database(&app)?;
    let cards = list_user_cards(&connection, LOCAL_USER_ID)?;
    let unique_cards = cards.len() as i64;
    let total_cards: i64 = cards.iter().map(|card| card.copies).sum();
    let total_value: i64 = cards
        .iter()
        .map(|card| card.value.saturating_mul(card.copies))
        .sum();
    let legendary_cards: i64 = cards
        .iter()
        .filter(|card| card.rarity == CardRarity::Legendary)
        .map(|card| card.copies)
        .sum();
    let last_pulls = list_recent_pulls(&connection, LOCAL_USER_ID, 12)?
        .into_iter()
        .map(pull_from_row)
        .collect();
    Ok(CardsStats {
        total_cards,
        unique_cards,
        duplicates: total_cards.saturating_sub(unique_cards),
        total_value,
        legendary_cards,
        active_gifts: count_active_gifts(&connection, LOCAL_USER_ID)?,
        last_pulls,
    })
}

fn pull_from_row(row: CardPullRow) -> CardPull {
    CardPull {
        kind: row.kind,
        entity_id: row.entity_id,
        title: row.title.unwrap_or_else(|| {
            format!("{kind} #{id}", kind = row.kind.as_str(), id = row.entity_id)
        }),
        image_url: row.image_url,
        rarity: row.rarity,
        variant: row.variant,
        value: row.value,
        at: row.at,
    }
}

/// Removes one copy. Its value was already credited when the card was obtained.
/// Remembers which owned variant of a card the album should list.
fn store_preferred_variant(
    connection: &rusqlite::Connection,
    kind: CardKind,
    entity_id: i64,
    variant: CardVariant,
) -> Result<usize, String> {
    connection
        .execute(
            "INSERT INTO card_preferred_variant (kind, entity_id, variant)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(kind, entity_id) DO UPDATE SET variant = excluded.variant",
            rusqlite::params![kind.as_str(), entity_id, variant.as_str()],
        )
        .map_err(|error| format!("store preferred variant: {error}"))
}

#[tauri::command]
pub fn cards_set_card_variant(
    app: AppHandle,
    kind: String,
    entity_id: i64,
    variant: String,
) -> Result<usize, String> {
    let kind = CardKind::from_db(kind.trim()).ok_or("unknown card kind")?;
    let variant = CardVariant::from_db(variant.trim()).ok_or("unknown card variant")?;
    let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
    let connection = open_database(&app)?;
    let owned: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM user_cards
              WHERE user_id = ?1 AND kind = ?2 AND entity_id = ?3 AND variant = ?4",
            rusqlite::params![LOCAL_USER_ID, kind.as_str(), entity_id, variant.as_str()],
            |row| row.get(0),
        )
        .map_err(|error| format!("read owned variant: {error}"))?;
    if owned == 0 {
        return Err("this card variant is not owned".into());
    }
    store_preferred_variant(&connection, kind, entity_id, variant)
}

#[tauri::command]
pub fn cards_card_favorite(app: AppHandle, kind: String, entity_id: i64) -> Result<bool, String> {
    let kind = CardKind::from_db(kind.trim()).ok_or("unknown card kind")?;
    if entity_id <= 0 {
        return Err("invalid card entity id".into());
    }
    let connection = open_database(&app)?;
    is_card_favorite(&connection, LOCAL_USER_ID, kind, entity_id)
}

#[tauri::command]
pub fn cards_set_card_favorite(
    app: AppHandle,
    kind: String,
    entity_id: i64,
    favorite: bool,
) -> Result<bool, String> {
    let kind = CardKind::from_db(kind.trim()).ok_or("unknown card kind")?;
    if entity_id <= 0 {
        return Err("invalid card entity id".into());
    }
    let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
    let connection = open_database(&app)?;
    if !set_card_favorite(&connection, LOCAL_USER_ID, kind, entity_id, favorite)? {
        return Err("card is not owned".into());
    }
    Ok(favorite)
}

/// Wipes the collection: every owned card and the whole chubrik wallet. The
/// metadata cache stays so the album can be refilled without refetching titles.
fn reset_collection(connection: &mut rusqlite::Connection) -> Result<usize, String> {
    let transaction = connection
        .transaction()
        .map_err(|error| format!("begin collection reset: {error}"))?;
    let removed = transaction
        .execute(
            "DELETE FROM user_cards WHERE user_id = ?1",
            rusqlite::params![LOCAL_USER_ID],
        )
        .map_err(|error| format!("reset collection: {error}"))?;
    let balance = wallet_balance(&transaction, LOCAL_USER_ID)?;
    add_wallet(&transaction, LOCAL_USER_ID, -balance)?;
    transaction
        .commit()
        .map_err(|error| format!("commit collection reset: {error}"))?;
    Ok(removed)
}

#[tauri::command]
pub fn cards_reset_collection(app: AppHandle) -> Result<usize, String> {
    let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
    let mut connection = open_database(&app)?;
    reset_collection(&mut connection)
}

#[tauri::command]
pub fn cards_dust(
    app: AppHandle,
    kind: String,
    entity_id: i64,
    rarity: String,
    variant: String,
) -> Result<DustResult, String> {
    let kind = CardKind::from_db(kind.trim()).ok_or("unknown card kind")?;
    let rarity = CardRarity::from_db(rarity.trim()).ok_or("unknown card rarity")?;
    let variant = CardVariant::from_db(variant.trim()).ok_or("unknown card variant")?;
    let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
    let mut connection = open_database(&app)?;
    let transaction = connection
        .transaction()
        .map_err(|error| format!("dust card transaction: {error}"))?;
    let Some(remaining) = remove_one_card_copy(
        &transaction,
        LOCAL_USER_ID,
        kind,
        entity_id,
        rarity,
        variant,
    )?
    else {
        return Err("card not found".into());
    };
    let amount = 0;
    transaction
        .commit()
        .map_err(|error| format!("commit card dust: {error}"))?;
    Ok(DustResult {
        remaining,
        amount,
        wallet: wallet_balance(&connection, LOCAL_USER_ID)?,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedGift {
    pub id: String,
    pub cards: Vec<GiftCard>,
}

/// Transfers the whole card: every owned rarity/variant stack and all copies.
/// The row is removed from the sender in the same transaction.
pub fn create_gift_in(
    connection: &mut rusqlite::Connection,
    user_id: i64,
    kind: CardKind,
    entity_id: i64,
    gift_id: &str,
    now: i64,
) -> Result<CreatedGift, String> {
    let transaction = connection
        .transaction()
        .map_err(|error| format!("create card gift transaction: {error}"))?;
    let owned = list_user_card_stacks(&transaction, user_id, kind, entity_id)?;
    if owned.is_empty() {
        return Err("card not found".into());
    }
    let cards = owned
        .iter()
        .map(|card| {
            let stack = card_stack(card);
            gift_card_from_stack(&transaction, kind, entity_id, &stack)
        })
        .collect::<Result<Vec<_>, _>>()?;
    let lead = owned
        .iter()
        .max_by_key(|card| card.value)
        .ok_or_else(|| "card not found".to_string())?;
    let stacks = owned.iter().map(card_stack).collect::<Vec<_>>();
    delete_user_card_stacks(&transaction, user_id, kind, entity_id)?;
    insert_gift(
        &transaction,
        &CardGiftRow {
            id: gift_id.to_string(),
            from_user: user_id,
            kind,
            entity_id,
            rarity: lead.rarity,
            variant: lead.variant,
            value: lead.value,
            cards: stacks,
            created_at: now,
            claimed_at: None,
        },
    )?;
    transaction
        .commit()
        .map_err(|error| format!("commit card gift: {error}"))?;
    Ok(CreatedGift {
        id: gift_id.to_string(),
        cards,
    })
}

/// Creates a gift link payload for the whole card. The frontend builds the
/// actual `iluhaanime://card/gift/...` URL from the returned cards.
#[tauri::command]
pub fn cards_create_gift(
    app: AppHandle,
    kind: String,
    entity_id: i64,
) -> Result<CreatedGift, String> {
    let kind = CardKind::from_db(kind.trim()).ok_or("unknown card kind")?;
    if entity_id <= 0 {
        return Err("invalid card entity id".into());
    }
    let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
    let mut connection = open_database(&app)?;
    let now = now_seconds();
    let gift_id = next_gift_id(now);
    create_gift_in(
        &mut connection,
        LOCAL_USER_ID,
        kind,
        entity_id,
        &gift_id,
        now,
    )
}

fn normalized_gift_stacks(
    kind: CardKind,
    raw: Vec<GiftCardStack>,
    now: i64,
) -> Result<Vec<GiftCardStack>, String> {
    if raw.is_empty() || raw.len() > 64 {
        return Err("invalid card gift stack list".into());
    }
    let mut stacks: Vec<GiftCardStack> = Vec::with_capacity(raw.len());
    for item in raw {
        if item.copies <= 0 || item.copies > 1_000_000 {
            return Err("invalid card gift copy count".into());
        }
        let value = if item.value > 0 {
            item.value
        } else {
            i64::from(card_value(kind, item.rarity, item.variant, 0.0))
        };
        if value <= 0 {
            return Err("invalid card gift value".into());
        }
        let first = if item.first_obtained_at > 0 {
            item.first_obtained_at
        } else {
            now
        };
        let last = if item.last_obtained_at > 0 {
            item.last_obtained_at.max(first)
        } else {
            first
        };
        if let Some(existing) = stacks
            .iter_mut()
            .find(|stack| stack.rarity == item.rarity && stack.variant == item.variant)
        {
            existing.copies = existing.copies.saturating_add(item.copies);
            existing.first_obtained_at = existing.first_obtained_at.min(first);
            existing.last_obtained_at = existing.last_obtained_at.max(last);
        } else {
            stacks.push(GiftCardStack {
                rarity: item.rarity,
                variant: item.variant,
                copies: item.copies,
                value,
                first_obtained_at: first,
                last_obtained_at: last,
            });
        }
    }
    Ok(stacks)
}

/// Claims a self-contained gift link once on this install. New links carry the
/// whole card stack; older links still resolve to one copy.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn cards_claim_gift(
    app: AppHandle,
    gift_id: String,
    kind: Option<String>,
    entity_id: Option<i64>,
    cards: Option<Vec<GiftCardStack>>,
    rarity: Option<String>,
    variant: Option<String>,
    value: Option<i64>,
) -> Result<Vec<GiftCard>, String> {
    let gift_id = gift_id.trim().to_string();
    if gift_id.is_empty() || gift_id.len() > 128 {
        return Err("invalid card gift id".into());
    }
    crate::cards::require_anilist_account(&app)?;
    let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
    let mut connection = open_database(&app)?;
    let transaction = connection
        .transaction()
        .map_err(|error| format!("claim card gift transaction: {error}"))?;
    let now = now_seconds();
    let local_gift = get_gift(&transaction, &gift_id)?;

    let (kind, entity_id, stacks) = if let Some(claimed) = cards {
        let kind = kind
            .as_deref()
            .and_then(CardKind::from_db)
            .ok_or("unknown card kind")?;
        let entity_id = entity_id
            .filter(|id| *id > 0)
            .ok_or("invalid card entity id")?;
        (kind, entity_id, claimed)
    } else if let (Some(kind), Some(entity_id), Some(rarity), Some(variant)) = (
        kind.as_deref(),
        entity_id,
        rarity.as_deref(),
        variant.as_deref(),
    ) {
        let kind = CardKind::from_db(kind).ok_or("unknown card kind")?;
        let rarity = CardRarity::from_db(rarity).ok_or("unknown card rarity")?;
        let variant = CardVariant::from_db(variant).ok_or("unknown card variant")?;
        if entity_id <= 0 {
            return Err("invalid card entity id".into());
        }
        (
            kind,
            entity_id,
            vec![GiftCardStack {
                rarity,
                variant,
                copies: 1,
                value: value.unwrap_or(0),
                first_obtained_at: now,
                last_obtained_at: now,
            }],
        )
    } else {
        let Some(gift) = local_gift else {
            return Err("card gift is missing or already claimed".into());
        };
        (gift.kind, gift.entity_id, gift.cards.clone())
    };
    let stacks = normalized_gift_stacks(kind, stacks, now)?;
    let lead = stacks
        .iter()
        .max_by_key(|stack| stack.value)
        .ok_or_else(|| "card gift is missing".to_string())?;
    if !record_gift_claim(
        &transaction,
        &gift_id,
        kind,
        entity_id,
        lead.rarity,
        lead.variant,
        lead.value,
        now,
    )? {
        return Err("card gift is missing or already claimed".into());
    }
    for stack in &stacks {
        upsert_card(
            &transaction,
            LOCAL_USER_ID,
            &UserCardRow {
                kind,
                entity_id,
                rarity: stack.rarity,
                variant: stack.variant,
                copies: stack.copies,
                value: stack.value,
                first_obtained_at: stack.first_obtained_at,
                last_obtained_at: stack.last_obtained_at,
            },
        )?;
    }
    // A claim on the sender's install also settles the outbox row. On another
    // install this is simply absent and the receipt link does the same job.
    claim_gift(&transaction, &gift_id, now)?;
    let cards = stacks
        .iter()
        .map(|stack| gift_card_from_stack(&transaction, kind, entity_id, stack))
        .collect::<Result<Vec<_>, _>>()?;
    // When the link is claimed on the sender's install, the outbox row should
    // disappear at once instead of staying there as a claimed gift.
    delete_gift(&transaction, &gift_id)?;
    transaction
        .commit()
        .map_err(|error| format!("commit card gift claim: {error}"))?;
    Ok(cards)
}

#[tauri::command]
pub fn cards_gifts(app: AppHandle) -> Result<Vec<GiftItem>, String> {
    let connection = open_database(&app)?;
    list_gifts(&connection, LOCAL_USER_ID, 100)?
        .iter()
        .map(|gift| gift_item(&connection, gift))
        .collect()
}

fn settle_gift_receipt(
    connection: &mut rusqlite::Connection,
    gift_id: &str,
    now: i64,
) -> Result<GiftItem, String> {
    let transaction = connection
        .transaction()
        .map_err(|error| format!("settle card gift transaction: {error}"))?;
    let Some(gift) = get_gift(&transaction, gift_id)? else {
        return Err("card gift is missing".into());
    };
    let item = gift_item(&transaction, &gift)?;
    let _ = claim_gift(&transaction, gift_id, now)?;
    if !delete_gift(&transaction, gift_id)? {
        return Err("card gift is missing".into());
    }
    transaction
        .commit()
        .map_err(|error| format!("commit card gift receipt: {error}"))?;
    Ok(item)
}

/// Opens a receipt link on the sender's install, returns the settled card
/// snapshot, and removes the gift from the outbox.
#[tauri::command]
pub fn cards_mark_gift_claimed(app: AppHandle, gift_id: String) -> Result<GiftItem, String> {
    let gift_id = gift_id.trim().to_string();
    if gift_id.is_empty() || gift_id.len() > 128 {
        return Err("invalid card gift id".into());
    }
    let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
    let mut connection = open_database(&app)?;
    settle_gift_receipt(&mut connection, &gift_id, now_seconds())
}

fn delete_gift_in(
    connection: &mut rusqlite::Connection,
    gift_id: &str,
) -> Result<GiftDeleteResult, String> {
    let transaction = connection
        .transaction()
        .map_err(|error| format!("delete card gift transaction: {error}"))?;
    let Some(gift) = get_gift(&transaction, gift_id)? else {
        return Err("card gift is missing".into());
    };
    let returned = gift.claimed_at.is_none();
    if returned {
        let now = now_seconds();
        let stacks = normalized_gift_stacks(gift.kind, gift.cards.clone(), now)?;
        for stack in &stacks {
            upsert_card(
                &transaction,
                LOCAL_USER_ID,
                &UserCardRow {
                    kind: gift.kind,
                    entity_id: gift.entity_id,
                    rarity: stack.rarity,
                    variant: stack.variant,
                    copies: stack.copies,
                    value: stack.value,
                    first_obtained_at: stack.first_obtained_at,
                    last_obtained_at: stack.last_obtained_at,
                },
            )?;
        }
    }
    if !delete_gift(&transaction, gift_id)? {
        return Err("card gift is missing".into());
    }
    transaction
        .commit()
        .map_err(|error| format!("commit card gift delete: {error}"))?;
    Ok(GiftDeleteResult { returned })
}

/// Removes an outbox gift. An unclaimed copy goes back to the sender; a gift
/// confirmed by a receipt is only removed from the list.
#[tauri::command]
pub fn cards_delete_gift(app: AppHandle, gift_id: String) -> Result<GiftDeleteResult, String> {
    let gift_id = gift_id.trim().to_string();
    if gift_id.is_empty() || gift_id.len() > 128 {
        return Err("invalid card gift id".into());
    }
    // Deleting an unclaimed gift returns its cards, so it is another way to
    // receive cards and follows the same AniList account rule.
    crate::cards::require_anilist_account(&app)?;
    let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
    let mut connection = open_database(&app)?;
    delete_gift_in(&mut connection, &gift_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_db::cards::{get_user_card, upsert_meta, CardMetaRow};
    use crate::app_db::schema::initialize_schema;

    fn memory_db() -> rusqlite::Connection {
        let connection = rusqlite::Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema");
        connection
    }

    fn duplicate_card() -> UserCardRow {
        UserCardRow {
            kind: CardKind::Character,
            entity_id: 45627,
            rarity: CardRarity::Rare,
            variant: CardVariant::Foil,
            copies: 2,
            value: 8,
            first_obtained_at: 100,
            last_obtained_at: 100,
        }
    }

    fn normal_card() -> UserCardRow {
        UserCardRow {
            kind: CardKind::Character,
            entity_id: 45627,
            rarity: CardRarity::Rare,
            variant: CardVariant::Normal,
            copies: 1,
            value: 5,
            first_obtained_at: 150,
            last_obtained_at: 180,
        }
    }

    fn levi_meta() -> CardMetaRow {
        CardMetaRow {
            kind: CardKind::Character,
            entity_id: 45627,
            title: "Levi".into(),
            image_url: Some("https://img/levi.jpg".into()),
            score: Some(6),
            popularity: None,
            favourites: Some(38_718),
            collection_anime_id: Some(16498),
            collection_manga_id: None,
            collection_title: Some("Shingeki no Kyojin".into()),
            collection_cover_url: None,
            collage_json: None,
            fetched_at: 100,
            preferred_image_url: None,
        }
    }

    #[test]
    fn a_gift_transfers_every_variant_and_copy() {
        let mut connection = memory_db();
        upsert_card(&connection, LOCAL_USER_ID, &duplicate_card()).expect("card");
        upsert_card(&connection, LOCAL_USER_ID, &normal_card()).expect("card");
        upsert_meta(&connection, &levi_meta()).expect("meta");

        let gift = create_gift_in(
            &mut connection,
            LOCAL_USER_ID,
            CardKind::Character,
            45627,
            "gift-test-1",
            200,
        )
        .expect("create gift");
        assert_eq!(gift.id, "gift-test-1");
        assert_eq!(gift.cards.len(), 2);
        assert_eq!(gift.cards.iter().map(|card| card.copies).sum::<i64>(), 3);
        assert!(gift.cards.iter().all(|card| card.title == "Levi"));
        assert!(
            list_user_card_stacks(&connection, LOCAL_USER_ID, CardKind::Character, 45627)
                .unwrap()
                .is_empty()
        );

        let stored = get_gift(&connection, "gift-test-1").unwrap().unwrap();
        assert_eq!(stored.cards.len(), 2);
        assert_eq!(stored.cards.iter().map(|card| card.copies).sum::<i64>(), 3);
        assert!(claim_gift(&connection, "gift-test-1", 300)
            .unwrap()
            .is_some());
        assert!(claim_gift(&connection, "gift-test-1", 400)
            .unwrap()
            .is_none());
    }

    #[test]
    fn confirming_a_receipt_removes_the_gift_from_the_outbox() {
        let mut connection = memory_db();
        upsert_card(&connection, LOCAL_USER_ID, &duplicate_card()).expect("card");
        upsert_meta(&connection, &levi_meta()).expect("meta");
        create_gift_in(
            &mut connection,
            LOCAL_USER_ID,
            CardKind::Character,
            45627,
            "gift-receipt-1",
            200,
        )
        .expect("create gift");

        let settled =
            settle_gift_receipt(&mut connection, "gift-receipt-1", 300).expect("settle receipt");

        assert_eq!(settled.cards.len(), 1);
        assert_eq!(settled.cards[0].title, "Levi");
        assert_eq!(settled.total_copies, 2);
        assert!(get_gift(&connection, "gift-receipt-1").unwrap().is_none());
        assert!(list_gifts(&connection, LOCAL_USER_ID, 100)
            .unwrap()
            .is_empty());
        assert_eq!(count_active_gifts(&connection, LOCAL_USER_ID).unwrap(), 0);
    }

    #[test]
    fn gift_stacks_merge_and_keep_the_full_date_range() {
        let stacks = normalized_gift_stacks(
            CardKind::Character,
            vec![
                GiftCardStack {
                    rarity: CardRarity::Rare,
                    variant: CardVariant::Foil,
                    copies: 2,
                    value: 0,
                    first_obtained_at: 100,
                    last_obtained_at: 200,
                },
                GiftCardStack {
                    rarity: CardRarity::Rare,
                    variant: CardVariant::Foil,
                    copies: 1,
                    value: 9,
                    first_obtained_at: 50,
                    last_obtained_at: 400,
                },
            ],
            500,
        )
        .expect("stacks");
        assert_eq!(stacks.len(), 1);
        assert_eq!(stacks[0].copies, 3);
        assert_eq!(stacks[0].value, 8);
        assert_eq!(stacks[0].first_obtained_at, 50);
        assert_eq!(stacks[0].last_obtained_at, 400);
    }

    #[test]
    fn a_single_copy_can_be_gifted_without_staying_in_the_collection() {
        let mut connection = memory_db();
        let mut card = duplicate_card();
        card.copies = 1;
        upsert_card(&connection, LOCAL_USER_ID, &card).expect("card");
        let gift = create_gift_in(
            &mut connection,
            LOCAL_USER_ID,
            CardKind::Character,
            45627,
            "gift-test-2",
            200,
        )
        .expect("the whole card can be gifted");
        assert_eq!(gift.cards.len(), 1);
        assert_eq!(gift.cards[0].copies, 1);
        assert!(get_user_card(
            &connection,
            LOCAL_USER_ID,
            CardKind::Character,
            45627,
            CardRarity::Rare,
            CardVariant::Foil
        )
        .unwrap()
        .is_none());
    }

    #[test]
    fn deleting_an_unclaimed_gift_returns_every_variant() {
        let mut connection = memory_db();
        upsert_card(&connection, LOCAL_USER_ID, &duplicate_card()).expect("card");
        upsert_card(&connection, LOCAL_USER_ID, &normal_card()).expect("card");
        create_gift_in(
            &mut connection,
            LOCAL_USER_ID,
            CardKind::Character,
            45627,
            "gift-delete-1",
            200,
        )
        .expect("create gift");

        let deleted = delete_gift_in(&mut connection, "gift-delete-1").expect("delete gift");

        assert!(deleted.returned);
        assert!(get_gift(&connection, "gift-delete-1").unwrap().is_none());
        let restored =
            list_user_card_stacks(&connection, LOCAL_USER_ID, CardKind::Character, 45627).unwrap();
        assert_eq!(restored.len(), 2);
        assert_eq!(restored.iter().map(|card| card.copies).sum::<i64>(), 3);
    }

    #[test]
    fn deleting_a_receipt_confirmed_gift_does_not_return_the_card() {
        let mut connection = memory_db();
        upsert_card(&connection, LOCAL_USER_ID, &duplicate_card()).expect("card");
        create_gift_in(
            &mut connection,
            LOCAL_USER_ID,
            CardKind::Character,
            45627,
            "gift-delete-2",
            200,
        )
        .expect("create gift");
        claim_gift(&connection, "gift-delete-2", 300)
            .expect("claim")
            .expect("outbox row");

        let deleted = delete_gift_in(&mut connection, "gift-delete-2").expect("delete gift");

        assert!(!deleted.returned);
        assert!(get_user_card(
            &connection,
            LOCAL_USER_ID,
            CardKind::Character,
            45627,
            CardRarity::Rare,
            CardVariant::Foil
        )
        .unwrap()
        .is_none());
    }

    #[test]
    fn title_sort_joins_metadata_for_the_key_query() {
        let connection = memory_db();
        for (entity_id, title) in [(30_001, "Zeta"), (30_002, "Alpha")] {
            upsert_card(
                &connection,
                LOCAL_USER_ID,
                &UserCardRow {
                    kind: CardKind::Character,
                    entity_id,
                    rarity: CardRarity::Rare,
                    variant: CardVariant::Normal,
                    copies: 1,
                    value: 8,
                    first_obtained_at: 100,
                    last_obtained_at: 100,
                },
            )
            .expect("card");
            upsert_meta(
                &connection,
                &CardMetaRow {
                    kind: CardKind::Character,
                    entity_id,
                    title: title.into(),
                    image_url: None,
                    score: None,
                    popularity: None,
                    favourites: None,
                    collection_anime_id: None,
                    collection_manga_id: None,
                    collection_title: None,
                    collection_cover_url: None,
                    collage_json: None,
                    fetched_at: 100,
                    preferred_image_url: None,
                },
            )
            .expect("meta");
        }

        let order = collection_order("title", true).expect("title order");
        let items =
            collection_page(&connection, None, None, None, None, order, 10, 0).expect("title page");

        assert_eq!(
            items.iter().map(|item| item.entity_id).collect::<Vec<_>>(),
            vec![30_002, 30_001]
        );
    }

    #[test]
    fn favorite_cards_sort_before_every_other_card() {
        let connection = memory_db();
        for (entity_id, value) in [(62_001, 1), (62_002, 99)] {
            upsert_card(
                &connection,
                LOCAL_USER_ID,
                &UserCardRow {
                    kind: CardKind::Character,
                    entity_id,
                    rarity: CardRarity::Rare,
                    variant: CardVariant::Normal,
                    copies: 1,
                    value,
                    first_obtained_at: 100,
                    last_obtained_at: 100,
                },
            )
            .expect("card");
        }
        assert!(set_card_favorite(
            &connection,
            LOCAL_USER_ID,
            CardKind::Character,
            62_001,
            true
        )
        .expect("favorite"));

        let order = collection_order("value", true).expect("value order");
        let items =
            collection_page(&connection, None, None, None, None, order, 10, 0).expect("page");

        assert_eq!(items[0].entity_id, 62_001);
        assert_eq!(items[1].entity_id, 62_002);
    }

    #[test]
    fn the_search_filter_matches_titles_and_escapes_wildcards() {
        let connection = memory_db();
        for (entity_id, title) in [(40_001, "Naruto"), (40_002, "Bleach")] {
            upsert_meta(
                &connection,
                &CardMetaRow {
                    kind: CardKind::Character,
                    entity_id,
                    title: title.into(),
                    image_url: None,
                    score: None,
                    popularity: None,
                    favourites: None,
                    collection_anime_id: None,
                    collection_manga_id: None,
                    collection_title: None,
                    collection_cover_url: None,
                    collage_json: None,
                    fetched_at: 100,
                    preferred_image_url: None,
                },
            )
            .expect("meta");
            upsert_card(
                &connection,
                LOCAL_USER_ID,
                &UserCardRow {
                    kind: CardKind::Character,
                    entity_id,
                    rarity: CardRarity::Rare,
                    variant: CardVariant::Normal,
                    copies: 1,
                    value: 8,
                    first_obtained_at: 100,
                    last_obtained_at: 100,
                },
            )
            .expect("card");
        }

        let order = collection_order("recent", true).expect("order");
        let pattern = search_pattern("nar").expect("pattern");
        let matched = collection_page(&connection, None, None, None, Some(&pattern), order, 10, 0)
            .expect("search page");
        assert_eq!(
            matched
                .iter()
                .map(|item| item.entity_id)
                .collect::<Vec<_>>(),
            vec![40_001]
        );

        assert_eq!(search_pattern("   "), None);
        assert_eq!(search_pattern("a%b_c").as_deref(), Some("%a\\%b\\_c%"));
    }

    #[test]
    fn the_reset_wipes_cards_and_chubriks_together() {
        let mut connection = memory_db();
        upsert_card(
            &connection,
            LOCAL_USER_ID,
            &UserCardRow {
                kind: CardKind::Character,
                entity_id: 50_001,
                rarity: CardRarity::Rare,
                variant: CardVariant::Normal,
                copies: 3,
                value: 8,
                first_obtained_at: 100,
                last_obtained_at: 100,
            },
        )
        .expect("card");
        add_wallet(&connection, LOCAL_USER_ID, 120).expect("wallet");

        let removed = reset_collection(&mut connection).expect("reset");

        assert_eq!(removed, 1);
        assert!(list_user_cards(&connection, LOCAL_USER_ID)
            .expect("cards")
            .is_empty());
        assert_eq!(
            wallet_balance(&connection, LOCAL_USER_ID).expect("wallet"),
            0
        );
    }

    #[test]
    fn a_preferred_variant_hides_the_other_copies_from_the_album() {
        let connection = memory_db();
        for variant in [CardVariant::Normal, CardVariant::Foil] {
            upsert_card(
                &connection,
                LOCAL_USER_ID,
                &UserCardRow {
                    kind: CardKind::Character,
                    entity_id: 60_001,
                    rarity: CardRarity::Rare,
                    variant,
                    copies: 1,
                    value: 8,
                    first_obtained_at: 100,
                    last_obtained_at: 100,
                },
            )
            .expect("card");
        }
        let order = collection_order("recent", true).expect("order");
        let listed =
            collection_page(&connection, None, None, None, None, order, 10, 0).expect("page");
        assert_eq!(listed.len(), 2);

        store_preferred_variant(&connection, CardKind::Character, 60_001, CardVariant::Foil)
            .expect("preference");
        let listed =
            collection_page(&connection, None, None, None, None, order, 10, 0).expect("page");

        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].variant.as_str(), "foil");
    }

    #[test]
    fn card_dates_cover_every_variant_and_the_sort_uses_the_latest_one() {
        let connection = memory_db();
        for (variant, first, last) in [
            (CardVariant::Normal, 100_i64, 100_i64),
            (CardVariant::Foil, 300, 900),
        ] {
            upsert_card(
                &connection,
                LOCAL_USER_ID,
                &UserCardRow {
                    kind: CardKind::Character,
                    entity_id: 61_001,
                    rarity: CardRarity::Rare,
                    variant,
                    copies: 1,
                    value: 8,
                    first_obtained_at: first,
                    last_obtained_at: last,
                },
            )
            .expect("card");
        }

        let order = collection_order("recent", false).expect("order");
        let listed =
            collection_page(&connection, None, None, None, None, order, 10, 0).expect("page");
        assert_eq!(listed.len(), 2);
        for item in &listed {
            assert_eq!(item.first_obtained_at, 100);
            assert_eq!(item.last_obtained_at, 900);
        }

        store_preferred_variant(
            &connection,
            CardKind::Character,
            61_001,
            CardVariant::Normal,
        )
        .expect("preference");
        let listed =
            collection_page(&connection, None, None, None, None, order, 10, 0).expect("page");

        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].variant.as_str(), "normal");
        assert_eq!(listed[0].first_obtained_at, 100);
        assert_eq!(listed[0].last_obtained_at, 900);
    }

    #[test]
    fn an_unknown_sort_is_rejected() {
        assert!(collection_order("title", false).is_some());
        assert!(collection_order("bogus", true).is_none());
    }

    #[test]
    fn the_default_page_size_is_bounded() {
        assert_eq!(24_u32.clamp(1, 100), 24);
        assert_eq!(0_u32.clamp(1, 100), 1);
        assert_eq!(1000_u32.clamp(1, 100), 100);
    }

    #[test]
    fn dust_credits_the_frozen_value_not_a_recomputed_one() {
        assert_eq!(
            card_value(CardKind::Anime, CardRarity::Rare, CardVariant::Normal, 0.0),
            5
        );
    }
}
