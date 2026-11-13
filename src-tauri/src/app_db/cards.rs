use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::cards::types::{CardKind, CardPackContentsState, CardRarity, CardVariant};

/// The app keeps one local collection; authenticated AniList accounts are not
/// separate card owners yet.
pub const LOCAL_USER_ID: i64 = 0;

/// Card openings and the wallet ledger are pruned in the same transaction as
/// the write that overflows them.
pub const OPENINGS_RETENTION: i64 = 500;
pub const LEDGER_RETENTION: i64 = 1000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardPackRow {
    pub id: String,
    pub source: String,
    pub pack_kind: String,
    pub media_id: Option<i64>,
    pub seed: i64,
    pub size: i64,
    pub created_at: i64,
    pub opened_at: Option<i64>,
    pub contents_state: CardPackContentsState,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CardPackCardRow {
    pub pack_id: String,
    pub slot: i64,
    pub kind: CardKind,
    pub entity_id: i64,
    pub title: String,
    pub image_url: Option<String>,
    pub rarity: CardRarity,
    pub variant: CardVariant,
    pub value: i64,
    pub favourites: i64,
    pub popularity: i64,
    pub score: f64,
    pub collage_json: String,
    pub collection_anime_id: Option<i64>,
    pub collection_title: Option<String>,
    pub collection_cover_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserCardRow {
    pub kind: CardKind,
    pub entity_id: i64,
    pub rarity: CardRarity,
    pub variant: CardVariant,
    pub copies: i64,
    pub value: i64,
    pub first_obtained_at: i64,
    pub last_obtained_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardMetaRow {
    pub kind: CardKind,
    pub entity_id: i64,
    pub title: String,
    pub image_url: Option<String>,
    pub score: Option<i64>,
    pub popularity: Option<i64>,
    pub favourites: Option<i64>,
    pub collection_anime_id: Option<i64>,
    pub collection_manga_id: Option<i64>,
    pub collection_title: Option<String>,
    pub collection_cover_url: Option<String>,
    pub collage_json: Option<String>,
    pub fetched_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardOpeningRow {
    pub id: String,
    pub pack_id: String,
    pub kind: CardKind,
    pub entity_id: i64,
    pub rarity: CardRarity,
    pub variant: CardVariant,
    pub at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChubrikLedgerRow {
    pub id: String,
    pub amount: i64,
    pub reason: String,
    pub at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardPullRow {
    pub kind: CardKind,
    pub entity_id: i64,
    pub rarity: CardRarity,
    pub variant: CardVariant,
    pub value: i64,
    pub at: i64,
    pub title: Option<String>,
    pub image_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StarterGrantRow {
    pub packs: i64,
    pub granted_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardGiftRow {
    pub id: String,
    pub from_user: i64,
    pub kind: CardKind,
    pub entity_id: i64,
    pub rarity: CardRarity,
    pub variant: CardVariant,
    pub value: i64,
    pub created_at: i64,
    pub claimed_at: Option<i64>,
}

fn kind_at(row: &rusqlite::Row<'_>, index: usize) -> rusqlite::Result<CardKind> {
    let value: String = row.get(index)?;
    CardKind::from_db(&value).ok_or_else(|| {
        rusqlite::Error::InvalidColumnType(index, value, rusqlite::types::Type::Text)
    })
}

fn rarity_at(row: &rusqlite::Row<'_>, index: usize) -> rusqlite::Result<CardRarity> {
    let value: String = row.get(index)?;
    CardRarity::from_db(&value).ok_or_else(|| {
        rusqlite::Error::InvalidColumnType(index, value, rusqlite::types::Type::Text)
    })
}

fn variant_at(row: &rusqlite::Row<'_>, index: usize) -> rusqlite::Result<CardVariant> {
    let value: String = row.get(index)?;
    CardVariant::from_db(&value).ok_or_else(|| {
        rusqlite::Error::InvalidColumnType(index, value, rusqlite::types::Type::Text)
    })
}

fn pack_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<CardPackRow> {
    Ok(CardPackRow {
        id: row.get(0)?,
        source: row.get(1)?,
        pack_kind: row.get(2)?,
        media_id: row.get(3)?,
        seed: row.get(4)?,
        size: row.get(5)?,
        created_at: row.get(6)?,
        opened_at: row.get(7)?,
        contents_state: CardPackContentsState::from_db(&row.get::<_, String>(8)?)
            .ok_or_else(|| {
                rusqlite::Error::InvalidColumnType(
                    8,
                    "unknown card pack contents state".into(),
                    rusqlite::types::Type::Text,
                )
            })?,
    })
}

fn pack_card_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<CardPackCardRow> {
    Ok(CardPackCardRow {
        pack_id: row.get(0)?,
        slot: row.get(1)?,
        kind: kind_at(row, 2)?,
        entity_id: row.get(3)?,
        title: row.get(4)?,
        image_url: row.get(5)?,
        rarity: rarity_at(row, 6)?,
        variant: variant_at(row, 7)?,
        value: row.get(8)?,
        favourites: row.get(9)?,
        popularity: row.get(10)?,
        score: row.get(11)?,
        collage_json: row.get(12)?,
        collection_anime_id: row.get(13)?,
        collection_title: row.get(14)?,
        collection_cover_url: row.get(15)?,
    })
}

fn card_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<UserCardRow> {
    Ok(UserCardRow {
        kind: kind_at(row, 0)?,
        entity_id: row.get(1)?,
        rarity: rarity_at(row, 2)?,
        variant: variant_at(row, 3)?,
        copies: row.get(4)?,
        value: row.get(5)?,
        first_obtained_at: row.get(6)?,
        last_obtained_at: row.get(7)?,
    })
}

fn meta_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<CardMetaRow> {
    Ok(CardMetaRow {
        kind: kind_at(row, 0)?,
        entity_id: row.get(1)?,
        title: row.get(2)?,
        image_url: row.get(3)?,
        score: row.get(4)?,
        popularity: row.get(5)?,
        favourites: row.get(6)?,
        collection_anime_id: row.get(7)?,
        collection_manga_id: row.get(8)?,
        collection_title: row.get(9)?,
        collection_cover_url: row.get(10)?,
        collage_json: row.get(11)?,
        fetched_at: row.get(12)?,
    })
}

fn opening_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<CardOpeningRow> {
    Ok(CardOpeningRow {
        id: row.get(0)?,
        pack_id: row.get(1)?,
        kind: kind_at(row, 2)?,
        entity_id: row.get(3)?,
        rarity: rarity_at(row, 4)?,
        variant: variant_at(row, 5)?,
        at: row.get(6)?,
    })
}

fn gift_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<CardGiftRow> {
    Ok(CardGiftRow {
        id: row.get(0)?,
        from_user: row.get(1)?,
        kind: kind_at(row, 2)?,
        entity_id: row.get(3)?,
        rarity: rarity_at(row, 4)?,
        variant: variant_at(row, 5)?,
        value: row.get(6)?,
        created_at: row.get(7)?,
        claimed_at: row.get(8)?,
    })
}

pub fn insert_pack(connection: &Connection, user_id: i64, pack: &CardPackRow) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO card_packs (
                id, user_id, source, pack_kind, media_id, seed, size, created_at, opened_at,
                contents_state
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                pack.id,
                user_id,
                pack.source,
                pack.pack_kind,
                pack.media_id,
                pack.seed,
                pack.size,
                pack.created_at,
                pack.opened_at,
                pack.contents_state.as_str()
            ],
        )
        .map_err(|error| format!("insert card pack: {error}"))?;
    Ok(())
}

pub fn get_pack(
    connection: &Connection,
    user_id: i64,
    pack_id: &str,
) -> Result<Option<CardPackRow>, String> {
    connection
        .query_row(
            "SELECT id, source, pack_kind, media_id, seed, size, created_at, opened_at,
                    contents_state
             FROM card_packs WHERE id = ?1 AND user_id = ?2",
            params![pack_id, user_id],
            pack_from_row,
        )
        .optional()
        .map_err(|error| format!("read card pack: {error}"))
}

pub fn list_packs(
    connection: &Connection,
    user_id: i64,
    limit: i64,
) -> Result<Vec<CardPackRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, source, pack_kind, media_id, seed, size, created_at, opened_at,
                    contents_state
             FROM card_packs WHERE user_id = ?1
             ORDER BY created_at DESC, id DESC LIMIT ?2",
        )
        .map_err(|error| format!("prepare card packs: {error}"))?;
    let rows = statement
        .query_map(params![user_id, limit], pack_from_row)
        .map_err(|error| format!("query card packs: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("collect card packs: {error}"))
}

pub fn list_packs_to_prepare(
    connection: &Connection,
    user_id: i64,
    limit: i64,
    max_attempts: i64,
) -> Result<Vec<CardPackRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, source, pack_kind, media_id, seed, size, created_at, opened_at,
                    contents_state
             FROM card_packs
             WHERE user_id = ?1 AND opened_at IS NULL
               AND contents_state IN ('pending','failed')
               AND prepare_attempts < ?2
             ORDER BY created_at ASC, id ASC LIMIT ?3",
        )
        .map_err(|error| format!("prepare card pack list: {error}"))?;
    let rows = statement
        .query_map(params![user_id, max_attempts, limit], pack_from_row)
        .map_err(|error| format!("query card packs to prepare: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("collect card packs to prepare: {error}"))
}

pub fn mark_pack_prepare_started(
    connection: &Connection,
    user_id: i64,
    pack_id: &str,
    max_attempts: i64,
) -> Result<bool, String> {
    let changed = connection
        .execute(
            "UPDATE card_packs
                SET prepare_attempts = prepare_attempts + 1,
                    last_prepare_error = NULL
              WHERE id = ?1 AND user_id = ?2 AND opened_at IS NULL
                AND contents_state IN ('pending','failed')
                AND prepare_attempts < ?3",
            params![pack_id, user_id, max_attempts],
        )
        .map_err(|error| format!("claim card pack preparation: {error}"))?;
    Ok(changed > 0)
}

pub fn mark_pack_prepare_failed(
    connection: &Connection,
    user_id: i64,
    pack_id: &str,
    error: &str,
) -> Result<(), String> {
    connection
        .execute(
            "UPDATE card_packs
                SET contents_state = 'failed', last_prepare_error = ?3
              WHERE id = ?1 AND user_id = ?2 AND opened_at IS NULL",
            params![pack_id, user_id, error],
        )
        .map_err(|error| format!("mark card pack preparation failed: {error}"))?;
    Ok(())
}

pub fn list_pack_cards(
    connection: &Connection,
    pack_id: &str,
) -> Result<Vec<CardPackCardRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT pack_id, slot, kind, entity_id, title, image_url, rarity, variant,
                    value, favourites, popularity, score, collage_json,
                    collection_anime_id, collection_title, collection_cover_url
             FROM card_pack_cards WHERE pack_id = ?1 ORDER BY slot",
        )
        .map_err(|error| format!("prepare card pack cards: {error}"))?;
    let rows = statement
        .query_map([pack_id], pack_card_from_row)
        .map_err(|error| format!("query card pack cards: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("collect card pack cards: {error}"))
}

/// Writes the frozen pack contents and marks the pack ready in one transaction.
/// Returns false when the pack was already opened (or belongs to another user).
pub fn save_pack_cards(
    connection: &mut Connection,
    user_id: i64,
    pack_id: &str,
    cards: &[CardPackCardRow],
    ready_at: i64,
) -> Result<bool, String> {
    let transaction = connection
        .transaction()
        .map_err(|error| format!("save card pack contents transaction: {error}"))?;
    let changed = transaction
        .execute(
            "UPDATE card_packs
                SET contents_state = 'ready', content_ready_at = ?3, last_prepare_error = NULL
              WHERE id = ?1 AND user_id = ?2 AND opened_at IS NULL",
            params![pack_id, user_id, ready_at],
        )
        .map_err(|error| format!("mark card pack ready: {error}"))?;
    if changed == 0 {
        return Ok(false);
    }
    transaction
        .execute("DELETE FROM card_pack_cards WHERE pack_id = ?1", [pack_id])
        .map_err(|error| format!("clear card pack contents: {error}"))?;
    for card in cards {
        transaction
            .execute(
                "INSERT INTO card_pack_cards (
                    pack_id, slot, kind, entity_id, title, image_url, rarity, variant,
                    value, favourites, popularity, score, collage_json,
                    collection_anime_id, collection_title, collection_cover_url
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
                params![
                    card.pack_id,
                    card.slot,
                    card.kind.as_str(),
                    card.entity_id,
                    card.title,
                    card.image_url,
                    card.rarity.as_str(),
                    card.variant.as_str(),
                    card.value,
                    card.favourites,
                    card.popularity,
                    card.score,
                    card.collage_json,
                    card.collection_anime_id,
                    card.collection_title,
                    card.collection_cover_url
                ],
            )
            .map_err(|error| format!("insert card pack card: {error}"))?;
    }
    transaction
        .commit()
        .map_err(|error| format!("commit card pack contents: {error}"))?;
    Ok(true)
}

pub fn ready_unnotified_count(connection: &Connection, user_id: i64) -> Result<i64, String> {
    connection
        .query_row(
            "SELECT COUNT(*) FROM card_packs
             WHERE user_id = ?1 AND opened_at IS NULL
               AND contents_state = 'ready' AND notified_at IS NULL",
            [user_id],
            |row| row.get(0),
        )
        .map_err(|error| format!("count prepared card packs: {error}"))
}

pub fn acknowledge_ready_packs(connection: &Connection, user_id: i64, at: i64) -> Result<usize, String> {
    connection
        .execute(
            "UPDATE card_packs SET notified_at = ?2
             WHERE user_id = ?1 AND opened_at IS NULL
               AND contents_state = 'ready' AND notified_at IS NULL",
            params![user_id, at],
        )
        .map_err(|error| format!("acknowledge prepared card packs: {error}"))
}

pub fn unopened_pack_count(connection: &Connection, user_id: i64) -> Result<i64, String> {
    connection
        .query_row(
            "SELECT COUNT(*) FROM card_packs WHERE user_id = ?1 AND opened_at IS NULL",
            [user_id],
            |row| row.get(0),
        )
        .map_err(|error| format!("count open card packs: {error}"))
}

pub fn mark_pack_opened(
    connection: &Connection,
    user_id: i64,
    pack_id: &str,
    opened_at: i64,
) -> Result<bool, String> {
    let changed = connection
        .execute(
            "UPDATE card_packs
                SET opened_at = ?3, contents_state = 'ready',
                    content_ready_at = COALESCE(content_ready_at, ?3)
              WHERE id = ?1 AND user_id = ?2 AND opened_at IS NULL",
            params![pack_id, user_id, opened_at],
        )
        .map_err(|error| format!("open card pack: {error}"))?;
    Ok(changed > 0)
}

pub fn upsert_card(
    connection: &Connection,
    user_id: i64,
    card: &UserCardRow,
) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO user_cards (
                user_id, kind, entity_id, rarity, variant, copies, value,
                first_obtained_at, last_obtained_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(user_id, kind, entity_id, rarity, variant) DO UPDATE SET
                copies = user_cards.copies + excluded.copies,
                last_obtained_at = MAX(user_cards.last_obtained_at, excluded.last_obtained_at)",
            params![
                user_id,
                card.kind.as_str(),
                card.entity_id,
                card.rarity.as_str(),
                card.variant.as_str(),
                card.copies,
                card.value,
                card.first_obtained_at,
                card.last_obtained_at
            ],
        )
        .map_err(|error| format!("upsert user card: {error}"))?;
    Ok(())
}

pub fn get_user_card(
    connection: &Connection,
    user_id: i64,
    kind: CardKind,
    entity_id: i64,
    rarity: CardRarity,
    variant: CardVariant,
) -> Result<Option<UserCardRow>, String> {
    connection
        .query_row(
            "SELECT kind, entity_id, rarity, variant, copies, value,
                    first_obtained_at, last_obtained_at
             FROM user_cards
             WHERE user_id = ?1 AND kind = ?2 AND entity_id = ?3
               AND rarity = ?4 AND variant = ?5",
            params![
                user_id,
                kind.as_str(),
                entity_id,
                rarity.as_str(),
                variant.as_str()
            ],
            card_from_row,
        )
        .optional()
        .map_err(|error| format!("read user card: {error}"))
}

pub fn list_user_cards(connection: &Connection, user_id: i64) -> Result<Vec<UserCardRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT kind, entity_id, rarity, variant, copies, value,
                    first_obtained_at, last_obtained_at
             FROM user_cards WHERE user_id = ?1
             ORDER BY last_obtained_at DESC, kind, entity_id",
        )
        .map_err(|error| format!("prepare user cards: {error}"))?;
    let rows = statement
        .query_map([user_id], card_from_row)
        .map_err(|error| format!("query user cards: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("collect user cards: {error}"))
}

/// Removes one copy and returns the remaining count. `None` means the card is
/// absent. The row disappears with its last copy.
pub fn remove_one_card_copy(
    connection: &Connection,
    user_id: i64,
    kind: CardKind,
    entity_id: i64,
    rarity: CardRarity,
    variant: CardVariant,
) -> Result<Option<i64>, String> {
    let Some(card) = get_user_card(connection, user_id, kind, entity_id, rarity, variant)? else {
        return Ok(None);
    };
    if card.copies <= 1 {
        connection
            .execute(
                "DELETE FROM user_cards
                 WHERE user_id = ?1 AND kind = ?2 AND entity_id = ?3
                   AND rarity = ?4 AND variant = ?5",
                params![
                    user_id,
                    kind.as_str(),
                    entity_id,
                    rarity.as_str(),
                    variant.as_str()
                ],
            )
            .map_err(|error| format!("delete user card: {error}"))?;
        Ok(Some(0))
    } else {
        connection
            .execute(
                "UPDATE user_cards SET copies = copies - 1
                 WHERE user_id = ?1 AND kind = ?2 AND entity_id = ?3
                   AND rarity = ?4 AND variant = ?5",
                params![
                    user_id,
                    kind.as_str(),
                    entity_id,
                    rarity.as_str(),
                    variant.as_str()
                ],
            )
            .map_err(|error| format!("decrement user card: {error}"))?;
        Ok(Some(card.copies - 1))
    }
}

pub fn upsert_meta(connection: &Connection, meta: &CardMetaRow) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO card_meta (
                kind, entity_id, title, image_url, score, popularity, favourites,
                collection_anime_id, collection_manga_id, collection_title,
                collection_cover_url, collage_json, fetched_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
             ON CONFLICT(kind, entity_id) DO UPDATE SET
                title = excluded.title,
                image_url = excluded.image_url,
                score = excluded.score,
                popularity = excluded.popularity,
                favourites = excluded.favourites,
                collection_anime_id = excluded.collection_anime_id,
                collection_manga_id = excluded.collection_manga_id,
                collection_title = excluded.collection_title,
                collection_cover_url = excluded.collection_cover_url,
                collage_json = excluded.collage_json,
                fetched_at = excluded.fetched_at",
            params![
                meta.kind.as_str(),
                meta.entity_id,
                meta.title,
                meta.image_url,
                meta.score,
                meta.popularity,
                meta.favourites,
                meta.collection_anime_id,
                meta.collection_manga_id,
                meta.collection_title,
                meta.collection_cover_url,
                meta.collage_json,
                meta.fetched_at
            ],
        )
        .map_err(|error| format!("upsert card meta: {error}"))?;
    Ok(())
}

pub fn get_meta(
    connection: &Connection,
    kind: CardKind,
    entity_id: i64,
) -> Result<Option<CardMetaRow>, String> {
    connection
        .query_row(
            "SELECT kind, entity_id, title, image_url, score, popularity, favourites,
                    collection_anime_id, collection_manga_id, collection_title,
                    collection_cover_url, collage_json, fetched_at
             FROM card_meta WHERE kind = ?1 AND entity_id = ?2",
            params![kind.as_str(), entity_id],
            meta_from_row,
        )
        .optional()
        .map_err(|error| format!("read card meta: {error}"))
}

pub fn insert_opening(
    connection: &Connection,
    user_id: i64,
    opening: &CardOpeningRow,
) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO card_openings (id, user_id, pack_id, kind, entity_id, rarity, variant, at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                opening.id,
                user_id,
                opening.pack_id,
                opening.kind.as_str(),
                opening.entity_id,
                opening.rarity.as_str(),
                opening.variant.as_str(),
                opening.at
            ],
        )
        .map_err(|error| format!("insert card opening: {error}"))?;
    Ok(())
}

pub fn list_openings_for_pack(
    connection: &Connection,
    user_id: i64,
    pack_id: &str,
) -> Result<Vec<CardOpeningRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, pack_id, kind, entity_id, rarity, variant, at
             FROM card_openings WHERE user_id = ?1 AND pack_id = ?2
             ORDER BY at, id",
        )
        .map_err(|error| format!("prepare pack openings: {error}"))?;
    let rows = statement
        .query_map(params![user_id, pack_id], opening_from_row)
        .map_err(|error| format!("query pack openings: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("collect pack openings: {error}"))
}

pub fn trim_openings(
    connection: &Connection,
    user_id: i64,
    keep: i64,
) -> Result<usize, String> {
    connection
        .execute(
            "DELETE FROM card_openings
             WHERE user_id = ?1
               AND id NOT IN (
                   SELECT id FROM card_openings
                   WHERE user_id = ?1
                   ORDER BY at DESC, id DESC
                   LIMIT ?2
               )",
            params![user_id, keep],
        )
        .map_err(|error| format!("trim card openings: {error}"))
}

pub fn wallet_balance(connection: &Connection, user_id: i64) -> Result<i64, String> {
    connection
        .query_row(
            "SELECT chubriks FROM user_wallet WHERE user_id = ?1",
            [user_id],
            |row| row.get(0),
        )
        .optional()
        .map(|value| value.unwrap_or(0))
        .map_err(|error| format!("read wallet: {error}"))
}

pub fn add_wallet(connection: &Connection, user_id: i64, amount: i64) -> Result<i64, String> {
    connection
        .execute(
            "INSERT INTO user_wallet (user_id, chubriks) VALUES (?1, ?2)
             ON CONFLICT(user_id) DO UPDATE SET
                chubriks = user_wallet.chubriks + excluded.chubriks",
            params![user_id, amount],
        )
        .map_err(|error| format!("add wallet: {error}"))?;
    wallet_balance(connection, user_id)
}

/// Returns false when the wallet cannot cover the amount. The caller writes the
/// ledger row in the same transaction.
pub fn spend_wallet(connection: &Connection, user_id: i64, amount: i64) -> Result<bool, String> {
    if amount <= 0 {
        return Err("wallet spend must be positive".into());
    }
    connection
        .execute(
            "INSERT OR IGNORE INTO user_wallet (user_id, chubriks) VALUES (?1, 0)",
            [user_id],
        )
        .map_err(|error| format!("prepare wallet: {error}"))?;
    let changed = connection
        .execute(
            "UPDATE user_wallet SET chubriks = chubriks - ?2
             WHERE user_id = ?1 AND chubriks >= ?2",
            params![user_id, amount],
        )
        .map_err(|error| format!("spend wallet: {error}"))?;
    Ok(changed > 0)
}

pub fn insert_ledger(
    connection: &Connection,
    user_id: i64,
    entry: &ChubrikLedgerRow,
) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO chubrik_ledger (id, user_id, amount, reason, at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![entry.id, user_id, entry.amount, entry.reason, entry.at],
        )
        .map_err(|error| format!("insert wallet ledger: {error}"))?;
    Ok(())
}

pub fn trim_ledger(connection: &Connection, user_id: i64, keep: i64) -> Result<usize, String> {
    connection
        .execute(
            "DELETE FROM chubrik_ledger
             WHERE user_id = ?1
               AND id NOT IN (
                   SELECT id FROM chubrik_ledger
                   WHERE user_id = ?1
                   ORDER BY at DESC, id DESC
                   LIMIT ?2
               )",
            params![user_id, keep],
        )
        .map_err(|error| format!("trim wallet ledger: {error}"))
}

#[cfg(test)]
pub fn list_ledger(
    connection: &Connection,
    user_id: i64,
    limit: i64,
) -> Result<Vec<ChubrikLedgerRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, amount, reason, at FROM chubrik_ledger
             WHERE user_id = ?1 ORDER BY at DESC, id DESC LIMIT ?2",
        )
        .map_err(|error| format!("prepare wallet ledger: {error}"))?;
    let rows = statement
        .query_map(params![user_id, limit], |row| {
            Ok(ChubrikLedgerRow {
                id: row.get(0)?,
                amount: row.get(1)?,
                reason: row.get(2)?,
                at: row.get(3)?,
            })
        })
        .map_err(|error| format!("query wallet ledger: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("collect wallet ledger: {error}"))
}

pub fn insert_pack_grant(
    connection: &Connection,
    user_id: i64,
    media_id: i64,
    granted_at: i64,
) -> Result<bool, String> {
    let changed = connection
        .execute(
            "INSERT OR IGNORE INTO pack_grants (user_id, media_id, granted_at)
             VALUES (?1, ?2, ?3)",
            params![user_id, media_id, granted_at],
        )
        .map_err(|error| format!("insert pack grant: {error}"))?;
    Ok(changed > 0)
}

#[cfg(test)]
pub fn pack_granted(
    connection: &Connection,
    user_id: i64,
    media_id: i64,
) -> Result<bool, String> {
    connection
        .query_row(
            "SELECT 1 FROM pack_grants WHERE user_id = ?1 AND media_id = ?2",
            params![user_id, media_id],
            |_| Ok(()),
        )
        .optional()
        .map(|value| value.is_some())
        .map_err(|error| format!("read pack grant: {error}"))
}

pub fn insert_starter_grant(
    connection: &Connection,
    user_id: i64,
    packs: i64,
    granted_at: i64,
) -> Result<bool, String> {
    let changed = connection
        .execute(
            "INSERT OR IGNORE INTO starter_grants (user_id, packs, granted_at)
             VALUES (?1, ?2, ?3)",
            params![user_id, packs, granted_at],
        )
        .map_err(|error| format!("insert starter grant: {error}"))?;
    Ok(changed > 0)
}

pub fn starter_grant(
    connection: &Connection,
    user_id: i64,
) -> Result<Option<StarterGrantRow>, String> {
    connection
        .query_row(
            "SELECT packs, granted_at FROM starter_grants WHERE user_id = ?1",
            [user_id],
            |row| {
                Ok(StarterGrantRow {
                    packs: row.get(0)?,
                    granted_at: row.get(1)?,
                })
            },
        )
        .optional()
        .map_err(|error| format!("read starter grant: {error}"))
}

pub fn list_recent_pulls(
    connection: &Connection,
    user_id: i64,
    limit: i64,
) -> Result<Vec<CardPullRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT o.kind, o.entity_id, o.rarity, o.variant,
                    COALESCE(c.value, 0), o.at, m.title, m.image_url
             FROM card_openings o
             LEFT JOIN user_cards c
               ON c.user_id = o.user_id AND c.kind = o.kind
              AND c.entity_id = o.entity_id AND c.rarity = o.rarity
              AND c.variant = o.variant
             LEFT JOIN card_meta m ON m.kind = o.kind AND m.entity_id = o.entity_id
             WHERE o.user_id = ?1
             ORDER BY o.at DESC, o.id DESC LIMIT ?2",
        )
        .map_err(|error| format!("prepare recent pulls: {error}"))?;
    let rows = statement
        .query_map(params![user_id, limit], |row| {
            Ok(CardPullRow {
                kind: kind_at(row, 0)?,
                entity_id: row.get(1)?,
                rarity: rarity_at(row, 2)?,
                variant: variant_at(row, 3)?,
                value: row.get(4)?,
                at: row.get(5)?,
                title: row.get(6)?,
                image_url: row.get(7)?,
            })
        })
        .map_err(|error| format!("query recent pulls: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("collect recent pulls: {error}"))
}

pub fn insert_gift(connection: &Connection, gift: &CardGiftRow) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO card_gifts (
                id, from_user, kind, entity_id, rarity, variant, value, created_at, claimed_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                gift.id,
                gift.from_user,
                gift.kind.as_str(),
                gift.entity_id,
                gift.rarity.as_str(),
                gift.variant.as_str(),
                gift.value,
                gift.created_at,
                gift.claimed_at
            ],
        )
        .map_err(|error| format!("insert card gift: {error}"))?;
    Ok(())
}

pub fn get_gift(
    connection: &Connection,
    gift_id: &str,
) -> Result<Option<CardGiftRow>, String> {
    connection
        .query_row(
            "SELECT id, from_user, kind, entity_id, rarity, variant, value, created_at, claimed_at
             FROM card_gifts WHERE id = ?1",
            [gift_id],
            gift_from_row,
        )
        .optional()
        .map_err(|error| format!("read card gift: {error}"))
}

/// Claims an unclaimed gift. A second claim returns `None`.
pub fn claim_gift(
    connection: &Connection,
    gift_id: &str,
    claimed_at: i64,
) -> Result<Option<CardGiftRow>, String> {
    let changed = connection
        .execute(
            "UPDATE card_gifts SET claimed_at = ?2 WHERE id = ?1 AND claimed_at IS NULL",
            params![gift_id, claimed_at],
        )
        .map_err(|error| format!("claim card gift: {error}"))?;
    if changed == 0 {
        return Ok(None);
    }
    get_gift(connection, gift_id)
}

pub fn list_gifts(
    connection: &Connection,
    from_user: i64,
    limit: i64,
) -> Result<Vec<CardGiftRow>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, from_user, kind, entity_id, rarity, variant, value, created_at, claimed_at
             FROM card_gifts WHERE from_user = ?1
             ORDER BY created_at DESC, id DESC LIMIT ?2",
        )
        .map_err(|error| format!("prepare card gifts: {error}"))?;
    let rows = statement
        .query_map(params![from_user, limit], gift_from_row)
        .map_err(|error| format!("query card gifts: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("collect card gifts: {error}"))
}

pub fn delete_gift(connection: &Connection, gift_id: &str) -> Result<bool, String> {
    let changed = connection
        .execute("DELETE FROM card_gifts WHERE id = ?1", [gift_id])
        .map_err(|error| format!("delete card gift: {error}"))?;
    Ok(changed > 0)
}

/// Recipient-side replay guard. Each install may claim a shared link once;
/// there is no global authority without a server.
pub fn record_gift_claim(
    connection: &Connection,
    gift_id: &str,
    kind: CardKind,
    entity_id: i64,
    rarity: CardRarity,
    variant: CardVariant,
    value: i64,
    claimed_at: i64,
) -> Result<bool, String> {
    let changed = connection
        .execute(
            "INSERT OR IGNORE INTO card_gift_claims (
                gift_id, kind, entity_id, rarity, variant, value, claimed_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                gift_id,
                kind.as_str(),
                entity_id,
                rarity.as_str(),
                variant.as_str(),
                value,
                claimed_at
            ],
        )
        .map_err(|error| format!("record card gift claim: {error}"))?;
    Ok(changed > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_db::schema::initialize_schema;

    fn memory_db() -> Connection {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema migration");
        connection
    }

    fn pack(id: &str, created_at: i64) -> CardPackRow {
        CardPackRow {
            id: id.into(),
            source: "test".into(),
            pack_kind: "default".into(),
            media_id: None,
            seed: 42,
            size: 7,
            created_at,
            opened_at: None,
            contents_state: CardPackContentsState::Pending,
        }
    }

    fn card(entity_id: i64) -> UserCardRow {
        UserCardRow {
            kind: CardKind::Character,
            entity_id,
            rarity: CardRarity::Rare,
            variant: CardVariant::Foil,
            copies: 1,
            value: 8,
            first_obtained_at: 100,
            last_obtained_at: 100,
        }
    }

    fn meta(entity_id: i64) -> CardMetaRow {
        CardMetaRow {
            kind: CardKind::Character,
            entity_id,
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
        }
    }

    #[test]
    fn migration_28_creates_every_card_table_from_scratch() {
        let connection = memory_db();
        let version: i64 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("read user version");
        assert_eq!(version, crate::app_db::db::CURRENT_SCHEMA_VERSION);
        let tables: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master
                 WHERE type = 'table' AND name IN (
                    'card_packs','card_pack_cards','user_cards','card_meta','pack_grants',
                    'starter_grants','card_openings','user_wallet','chubrik_ledger','card_gifts')",
                [],
                |row| row.get(0),
            )
            .expect("count card tables");
        assert_eq!(tables, 10);
        let manga_column: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('card_meta')
                 WHERE name = 'collection_manga_id'",
                [],
                |row| row.get(0),
            )
            .expect("read manga collection column");
        assert_eq!(manga_column, 1);
    }

    #[test]
    fn migration_28_upgrades_a_v24_database() {
        let connection = memory_db();
        connection
            .execute_batch(
                "DROP TABLE card_pack_cards;
                 DROP TABLE card_packs;
                 DROP TABLE user_cards;
                 DROP TABLE card_meta;
                 DROP TABLE pack_grants;
                 DROP TABLE starter_grants;
                 DROP TABLE card_openings;
                 DROP TABLE user_wallet;
                 DROP TABLE chubrik_ledger;
                 DROP TABLE card_gifts;
                 PRAGMA user_version = 24;",
            )
            .expect("rewind to v24");
        initialize_schema(&connection).expect("rerun migrations");
        let version: i64 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("read user version");
        assert_eq!(version, crate::app_db::db::CURRENT_SCHEMA_VERSION);
        let exists: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master
                 WHERE type = 'table' AND name = 'user_cards'",
                [],
                |row| row.get(0),
            )
            .expect("read user_cards");
        assert_eq!(exists, 1);
    }

    #[test]
    fn prepared_contents_are_durable_and_acknowledged_once() {
        let mut connection = memory_db();
        insert_pack(&connection, LOCAL_USER_ID, &pack("prepared-pack", 10)).expect("pack");
        let row = CardPackCardRow {
            pack_id: "prepared-pack".into(),
            slot: 0,
            kind: CardKind::Character,
            entity_id: 88414,
            title: "Uta".into(),
            image_url: Some("https://img/uta.jpg".into()),
            rarity: CardRarity::Epic,
            variant: CardVariant::Normal,
            value: 18,
            favourites: 2_041,
            popularity: 754_505,
            score: 8.16,
            collage_json: "[]".into(),
            collection_anime_id: Some(20605),
            collection_title: Some("Tokyo Ghoul".into()),
            collection_cover_url: None,
        };
        assert!(save_pack_cards(&mut connection, LOCAL_USER_ID, "prepared-pack", &[row], 20)
            .expect("save contents"));
        assert_eq!(
            get_pack(&connection, LOCAL_USER_ID, "prepared-pack")
                .expect("get pack")
                .expect("pack exists")
                .contents_state,
            CardPackContentsState::Ready
        );
        assert_eq!(list_pack_cards(&connection, "prepared-pack").unwrap().len(), 1);
        assert_eq!(ready_unnotified_count(&connection, LOCAL_USER_ID).unwrap(), 1);
        assert_eq!(acknowledge_ready_packs(&connection, LOCAL_USER_ID, 30).unwrap(), 1);
        assert_eq!(ready_unnotified_count(&connection, LOCAL_USER_ID).unwrap(), 0);
    }

    #[test]
    fn schema_28_stores_manga_cards_and_manga_packs() {
        let connection = memory_db();
        let mut manga = card(77);
        manga.kind = CardKind::Manga;
        upsert_card(&connection, LOCAL_USER_ID, &manga).expect("insert manga card");

        let mut manga_pack = pack("manga-pack", 10);
        manga_pack.pack_kind = "manga".into();
        insert_pack(&connection, LOCAL_USER_ID, &manga_pack).expect("insert manga pack");

        let cards: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM user_cards WHERE kind = 'manga'",
                [],
                |row| row.get(0),
            )
            .expect("count manga cards");
        let packs: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM card_packs WHERE pack_kind = 'manga'",
                [],
                |row| row.get(0),
            )
            .expect("count manga packs");
        assert_eq!(cards, 1);
        assert_eq!(packs, 1);
    }

    #[test]
    fn pack_roundtrip_and_opened_marker() {
        let connection = memory_db();
        insert_pack(&connection, LOCAL_USER_ID, &pack("pack-1", 10)).expect("insert pack");
        insert_pack(&connection, LOCAL_USER_ID, &pack("pack-2", 20)).expect("insert pack");
        assert_eq!(unopened_pack_count(&connection, LOCAL_USER_ID).unwrap(), 2);
        assert!(mark_pack_opened(&connection, LOCAL_USER_ID, "pack-1", 30).unwrap());
        assert!(!mark_pack_opened(&connection, LOCAL_USER_ID, "pack-1", 40).unwrap());
        assert_eq!(unopened_pack_count(&connection, LOCAL_USER_ID).unwrap(), 1);
        let packs = list_packs(&connection, LOCAL_USER_ID, 10).unwrap();
        assert_eq!(packs.len(), 2);
        assert_eq!(packs[0].id, "pack-2");
        assert_eq!(get_pack(&connection, LOCAL_USER_ID, "pack-1").unwrap().unwrap().opened_at, Some(30));
    }

    #[test]
    fn card_upsert_stacks_copies_and_the_last_copy_deletes_the_row() {
        let connection = memory_db();
        upsert_card(&connection, LOCAL_USER_ID, &card(1)).expect("insert card");
        let mut duplicate = card(1);
        duplicate.last_obtained_at = 200;
        upsert_card(&connection, LOCAL_USER_ID, &duplicate).expect("duplicate card");
        let stored = get_user_card(
            &connection,
            LOCAL_USER_ID,
            CardKind::Character,
            1,
            CardRarity::Rare,
            CardVariant::Foil,
        )
        .unwrap()
        .unwrap();
        assert_eq!(stored.copies, 2);
        assert_eq!(stored.last_obtained_at, 200);
        assert_eq!(stored.first_obtained_at, 100);
        assert_eq!(
            remove_one_card_copy(
                &connection,
                LOCAL_USER_ID,
                CardKind::Character,
                1,
                CardRarity::Rare,
                CardVariant::Foil
            )
            .unwrap(),
            Some(1)
        );
        assert_eq!(
            remove_one_card_copy(
                &connection,
                LOCAL_USER_ID,
                CardKind::Character,
                1,
                CardRarity::Rare,
                CardVariant::Foil
            )
            .unwrap(),
            Some(0)
        );
        assert!(list_user_cards(&connection, LOCAL_USER_ID).unwrap().is_empty());
    }

    #[test]
    fn meta_roundtrip_keeps_the_collection_source() {
        let connection = memory_db();
        upsert_meta(&connection, &meta(1)).expect("insert meta");
        let mut updated = meta(1);
        updated.title = "Levi Ackerman".into();
        updated.fetched_at = 200;
        upsert_meta(&connection, &updated).expect("update meta");
        let stored = get_meta(&connection, CardKind::Character, 1)
            .unwrap()
            .unwrap();
        assert_eq!(stored.title, "Levi Ackerman");
        assert_eq!(stored.collection_anime_id, Some(16498));
        assert_eq!(stored.fetched_at, 200);
    }

    #[test]
    fn wallet_spend_is_guarded_and_the_ledger_trims_to_the_newest_rows() {
        let connection = memory_db();
        assert_eq!(wallet_balance(&connection, LOCAL_USER_ID).unwrap(), 0);
        assert_eq!(add_wallet(&connection, LOCAL_USER_ID, 25).unwrap(), 25);
        assert!(!spend_wallet(&connection, LOCAL_USER_ID, 30).unwrap());
        assert!(spend_wallet(&connection, LOCAL_USER_ID, 10).unwrap());
        assert_eq!(wallet_balance(&connection, LOCAL_USER_ID).unwrap(), 15);
        for index in 0..4 {
            insert_ledger(
                &connection,
                LOCAL_USER_ID,
                &ChubrikLedgerRow {
                    id: format!("ledger-{index}"),
                    amount: 1,
                    reason: "dust".into(),
                    at: index,
                },
            )
            .unwrap();
        }
        assert_eq!(trim_ledger(&connection, LOCAL_USER_ID, 2).unwrap(), 2);
        let rows = list_ledger(&connection, LOCAL_USER_ID, 10).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].id, "ledger-3");
    }

    #[test]
    fn grants_are_idempotent() {
        let connection = memory_db();
        assert!(insert_pack_grant(&connection, LOCAL_USER_ID, 16498, 10).unwrap());
        assert!(!insert_pack_grant(&connection, LOCAL_USER_ID, 16498, 20).unwrap());
        assert!(pack_granted(&connection, LOCAL_USER_ID, 16498).unwrap());
        assert!(insert_starter_grant(&connection, LOCAL_USER_ID, 3, 10).unwrap());
        assert!(!insert_starter_grant(&connection, LOCAL_USER_ID, 5, 20).unwrap());
        assert_eq!(
            starter_grant(&connection, LOCAL_USER_ID)
                .unwrap()
                .unwrap()
                .packs,
            3
        );
    }

    #[test]
    fn openings_trim_to_the_retention_limit() {
        let connection = memory_db();
        insert_pack(&connection, LOCAL_USER_ID, &pack("pack-1", 10)).unwrap();
        for index in 0..4 {
            insert_opening(
                &connection,
                LOCAL_USER_ID,
                &CardOpeningRow {
                    id: format!("opening-{index}"),
                    pack_id: "pack-1".into(),
                    kind: CardKind::Anime,
                    entity_id: index,
                    rarity: CardRarity::Common,
                    variant: CardVariant::Normal,
                    at: index,
                },
            )
            .unwrap();
        }
        assert_eq!(trim_openings(&connection, LOCAL_USER_ID, 2).unwrap(), 2);
        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM card_openings", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 2);
    }

    #[test]
    fn a_gift_can_only_be_claimed_once() {
        let connection = memory_db();
        let gift = CardGiftRow {
            id: "gift-1".into(),
            from_user: 7,
            kind: CardKind::Studio,
            entity_id: 2,
            rarity: CardRarity::Epic,
            variant: CardVariant::Holo,
            value: 45,
            created_at: 10,
            claimed_at: None,
        };
        insert_gift(&connection, &gift).unwrap();
        assert!(claim_gift(&connection, "gift-1", 20).unwrap().is_some());
        assert!(claim_gift(&connection, "gift-1", 30).unwrap().is_none());
        assert_eq!(list_gifts(&connection, 7, 10).unwrap().len(), 1);
        assert_eq!(list_gifts(&connection, 7, 10).unwrap()[0].value, 45);
        assert!(delete_gift(&connection, "gift-1").unwrap());
        assert!(get_gift(&connection, "gift-1").unwrap().is_none());
    }

    #[test]
    fn a_gift_claim_is_recorded_once_per_install() {
        let connection = memory_db();
        assert!(record_gift_claim(
            &connection,
            "gift-claim-1",
            CardKind::Character,
            45627,
            CardRarity::Rare,
            CardVariant::Foil,
            12,
            100,
        )
        .unwrap());
        assert!(!record_gift_claim(
            &connection,
            "gift-claim-1",
            CardKind::Character,
            45627,
            CardRarity::Rare,
            CardVariant::Foil,
            12,
            200,
        )
        .unwrap());
    }
}
