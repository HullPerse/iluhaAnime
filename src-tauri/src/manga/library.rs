use std::collections::HashSet;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use unicode_normalization::UnicodeNormalization;

use super::sources::{
    allowed_cover, allowed_lib_cover, manga_details, ExternalIds, MangaDetails, MangaLibDomain,
    MangaSearchHit, MangaSource,
};
use crate::app_db::{lock_app_data_write_timeout, open_database, APP_DATA_WRITE_TIMEOUT};

const HISTORY_STATUS: &str = "internal:history";
const UNASSIGNED_STATUS: &str = "internal:unassigned";
const SELECT_ITEMS: &str =
    "SELECT id, source_id, source_manga_id, title, cover_url, content_rating,
    status_id, unread_count, alt_titles_json, external_ids_json,
    (SELECT COUNT(*) FROM manga_chapter_reads WHERE item_id = manga_library_items.id),
    updated_at,
    (SELECT p.updated_at FROM manga_reading_positions p WHERE p.item_id = manga_library_items.id),
    favourite
    FROM manga_library_items";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryItem {
    id: String,
    source: String,
    manga_id: String,
    title: String,
    cover: Option<String>,
    rating: String,
    status: String,
    unread: i64,
    read: i64,
    updated_at: i64,
    last_read_at: Option<i64>,
    favourite: bool,
    #[serde(skip)]
    aliases: Vec<String>,
    #[serde(skip)]
    external_ids: ExternalIds,
}

#[derive(Serialize)]
pub struct LibraryStatus {
    id: String,
    label: String,
    color: String,
}

#[derive(Serialize)]
pub struct LibrarySnapshot {
    statuses: Vec<LibraryStatus>,
    items: Vec<LibraryItem>,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SaveResult {
    Saved,
    Duplicate { item: LibraryItem },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySaveInput {
    id: String,
    source: MangaSource,
    hit: MangaSearchHit,
    status: String,
    unread: i64,
    allow_duplicate: bool,
}

fn millis() -> i64 {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    i64::try_from(elapsed.as_millis()).unwrap_or(i64::MAX)
}

async fn database<T: Send + 'static>(
    app: AppHandle,
    write: bool,
    operation: impl FnOnce(&mut Connection) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = if write {
            Some(lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?)
        } else {
            None
        };
        let mut connection = open_database(&app)?;
        operation(&mut connection)
    })
    .await
    .map_err(|_| "manga database task ended".to_owned())?
}

fn row_item(row: &Row<'_>) -> rusqlite::Result<LibraryItem> {
    let aliases: String = row.get(8)?;
    let external: String = row.get(9)?;
    Ok(LibraryItem {
        id: row.get(0)?,
        source: row.get(1)?,
        manga_id: row.get(2)?,
        title: row.get(3)?,
        cover: row.get(4)?,
        rating: row.get(5)?,
        status: row.get(6)?,
        unread: row.get(7)?,
        read: row.get(10)?,
        updated_at: row.get(11)?,
        last_read_at: row.get(12)?,
        favourite: row.get(13)?,
        aliases: serde_json::from_str(&aliases).unwrap_or_default(),
        external_ids: serde_json::from_str(&external).unwrap_or_default(),
    })
}

fn list_items(connection: &Connection, nsfw: bool) -> rusqlite::Result<Vec<LibraryItem>> {
    let mut query = connection.prepare(&format!(
        "{SELECT_ITEMS} WHERE status_id <> ?1 AND (?2 OR content_rating <> 'pornographic')
         ORDER BY updated_at DESC, id"
    ))?;
    let rows = query.query_map(params![HISTORY_STATUS, nsfw], row_item)?;
    rows.collect()
}

fn normalize(value: &str) -> String {
    value
        .nfkc()
        .flat_map(char::to_lowercase)
        .filter(|character| character.is_alphanumeric())
        .collect()
}

fn title_keys<'a>(title: &'a str, aliases: &'a [String]) -> HashSet<String> {
    std::iter::once(title)
        .chain(aliases.iter().map(String::as_str))
        .map(normalize)
        .filter(|title| !title.is_empty())
        .collect()
}

fn duplicate(hit: &MangaSearchHit, keys: &HashSet<String>, candidate: &LibraryItem) -> bool {
    let same_anilist = hit.external_ids.anilist.is_some()
        && hit.external_ids.anilist == candidate.external_ids.anilist;
    let same_mal =
        hit.external_ids.mal.is_some() && hit.external_ids.mal == candidate.external_ids.mal;
    same_anilist || same_mal || !keys.is_disjoint(&title_keys(&candidate.title, &candidate.aliases))
}

fn validate_hit(source: MangaSource, hit: &mut MangaSearchHit) -> Result<(), String> {
    if hit.id.is_empty()
        || hit.id.len() > 160
        || !hit
            .id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
        || hit.title.trim().is_empty()
        || hit.title.len() > 2048
        || !matches!(
            hit.rating.as_str(),
            "safe" | "suggestive" | "erotica" | "pornographic"
        )
    {
        return Err("invalid manga title".to_owned());
    }
    if source == MangaSource::MangaLib {
        hit.rating = "safe".to_owned();
    }
    hit.cover = hit.cover.as_deref().and_then(|cover| match source {
        MangaSource::MangaLib => allowed_lib_cover(cover),
        MangaSource::MangaDex => allowed_cover(cover, "uploads.mangadex.org"),
        MangaSource::ReadManga => allowed_cover(cover, super::sources::public_sources::READ_CDN),
        MangaSource::AsuraScans => allowed_cover(cover, super::sources::public_sources::ASURA_CDN),
        MangaSource::WaManga => allowed_cover(cover, super::sources::public_sources::WAMANGA_CDN),
    });
    hit.aliases.truncate(50);
    hit.aliases.retain(|alias| alias.len() <= 2048);
    Ok(())
}

fn valid_id(id: &str) -> bool {
    id.len() == 36
        && id
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() || byte == b'-')
}

fn upsert_item(
    db: &Connection,
    id: &str,
    source: MangaSource,
    hit: &MangaSearchHit,
    status: &str,
    unread: i64,
) -> Result<String, String> {
    let aliases = serde_json::to_string(&hit.aliases).map_err(|error| error.to_string())?;
    let external = serde_json::to_string(&hit.external_ids).map_err(|error| error.to_string())?;
    db.query_row(
        "INSERT INTO manga_library_items
            (id, source_id, source_manga_id, title, cover_url, content_rating, status_id,
             alt_titles_json, external_ids_json, unread_count, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)
         ON CONFLICT (source_id, source_manga_id) DO UPDATE SET
           status_id = CASE WHEN excluded.status_id = 'internal:history' THEN status_id ELSE excluded.status_id END,
           unread_count = CASE WHEN excluded.status_id = 'internal:history' THEN unread_count
               ELSE MAX(0, excluded.unread_count - (SELECT count(*) FROM manga_chapter_reads WHERE item_id = manga_library_items.id)) END,
           updated_at = excluded.updated_at
         RETURNING id",
        params![id, source.id(), hit.id, hit.title, hit.cover, hit.rating, status, aliases, external, unread, millis()],
        |row| row.get(0),
    ).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn manga_library(app: AppHandle, nsfw: bool) -> Result<LibrarySnapshot, String> {
    database(app, false, move |connection| {
        let items = list_items(connection, nsfw).map_err(|error| error.to_string())?;
        let mut query = connection
            .prepare(
                "SELECT id, label, color FROM manga_statuses WHERE id <> ?1 ORDER BY order_index",
            )
            .map_err(|error| error.to_string())?;
        let statuses = query
            .query_map([HISTORY_STATUS], |row| {
                Ok(LibraryStatus {
                    id: row.get(0)?,
                    label: row.get(1)?,
                    color: row.get(2)?,
                })
            })
            .map_err(|error| error.to_string())?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|error| error.to_string())?;
        Ok(LibrarySnapshot { items, statuses })
    })
    .await
}

#[tauri::command]
pub async fn manga_library_save(
    app: AppHandle,
    mut input: LibrarySaveInput,
) -> Result<SaveResult, String> {
    validate_hit(input.source, &mut input.hit)?;
    if !valid_id(&input.id)
        || matches!(input.status.as_str(), HISTORY_STATUS | UNASSIGNED_STATUS)
        || !(0..=10_000).contains(&input.unread)
    {
        return Err("invalid library entry".to_owned());
    }
    database(app, true, move |connection| {
        if !input.allow_duplicate {
            let items = list_items(connection, input.hit.rating == "pornographic")
                .map_err(|error| error.to_string())?;
            let exact = items
                .iter()
                .any(|item| item.source == input.source.id() && item.manga_id == input.hit.id);
            if !exact {
                let keys = title_keys(&input.hit.title, &input.hit.aliases);
                if let Some(item) = items
                    .into_iter()
                    .find(|candidate| duplicate(&input.hit, &keys, candidate))
                {
                    return Ok(SaveResult::Duplicate { item });
                }
            }
        }
        upsert_item(
            connection,
            &input.id,
            input.source,
            &input.hit,
            &input.status,
            input.unread,
        )?;
        Ok(SaveResult::Saved)
    })
    .await
}

#[tauri::command]
pub async fn manga_library_remove(app: AppHandle, id: String) -> Result<(), String> {
    database(app, true, move |connection| {
        let tx = connection
            .transaction()
            .map_err(|error| error.to_string())?;
        tx.execute(
            "INSERT OR IGNORE INTO manga_statuses (id, label, color, order_index)
             VALUES (?1, '', 'text', -1)",
            [HISTORY_STATUS],
        )
        .map_err(|error| error.to_string())?;
        tx.execute(
            "UPDATE manga_library_items SET status_id = ?2, favourite = 0 WHERE id = ?1",
            params![id, HISTORY_STATUS],
        )
        .map_err(|error| error.to_string())?;
        tx.commit().map_err(|error| error.to_string())
    })
    .await
}

#[tauri::command]
pub async fn manga_library_favourite(
    app: AppHandle,
    id: String,
    favourite: bool,
) -> Result<(), String> {
    database(app, true, move |connection| {
        let changed = connection
            .execute(
                "UPDATE manga_library_items SET favourite = ?2
             WHERE id = ?1 AND status_id NOT IN (?3, ?4)",
                params![id, favourite, HISTORY_STATUS, UNASSIGNED_STATUS],
            )
            .map_err(|error| error.to_string())?;
        if changed == 0 {
            return Err("manga is not assigned to a library status".to_owned());
        }
        Ok(())
    })
    .await
}

#[derive(Serialize)]
pub struct SourceSetting {
    id: String,
    enabled: bool,
}

#[tauri::command]
pub async fn manga_sources_list(app: AppHandle) -> Result<Vec<SourceSetting>, String> {
    database(app, false, |connection| {
        let mut query = connection.prepare("SELECT source_id, enabled FROM manga_source_settings WHERE source_id IN ('mangalib','mangadex','readmanga','asurascans','wamanga')")
            .map_err(|error| error.to_string())?;
        let rows = query.query_map([], |row| Ok(SourceSetting { id: row.get(0)?, enabled: row.get(1)? }))
            .map_err(|error| error.to_string())?;
        rows.collect::<rusqlite::Result<_>>().map_err(|error| error.to_string())
    }).await
}

#[tauri::command]
pub async fn manga_source_enable(
    app: AppHandle,
    source: MangaSource,
    enabled: bool,
) -> Result<(), String> {
    database(app, true, move |connection| {
        connection
            .execute(
                "UPDATE manga_source_settings SET enabled = ?2 WHERE source_id = ?1",
                params![source.id(), enabled],
            )
            .map_err(|error| error.to_string())?;
        Ok(())
    })
    .await
}

#[derive(Default, Deserialize, Serialize)]
struct NotificationSnapshot {
    status: Option<String>,
    chapters: HashSet<String>,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MangaNotification {
    new_chapters: usize,
    status_change: Option<[String; 2]>,
}

fn observe_notifications(
    previous: Option<NotificationSnapshot>,
    library_status: &str,
    publication_status: Option<&str>,
    chapters: impl Iterator<Item = String>,
) -> (NotificationSnapshot, MangaNotification) {
    let initialized = previous.is_some();
    let mut snapshot = previous.unwrap_or_default();
    let added = chapters
        .filter(|key| snapshot.chapters.insert(key.clone()))
        .count();
    let mut notification = MangaNotification::default();
    if initialized && library_status == "reading" {
        notification.new_chapters = added;
    }
    if let Some(status) = publication_status {
        let old = snapshot.status.replace(status.to_owned());
        if library_status == "planned" {
            notification.status_change = old
                .filter(|old| old != status)
                .map(|old| [old, status.to_owned()]);
        }
    }
    (snapshot, notification)
}

fn update_chapters(
    connection: &mut Connection,
    source: MangaSource,
    details: &mut MangaDetails,
    background: bool,
) -> Result<bool, String> {
    let tx = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    let Some((id, status, snapshot)) = tx
        .query_row(
            "SELECT id, status_id, notification_snapshot FROM manga_library_items
             WHERE source_id = ?1 AND source_manga_id = ?2",
            params![source.id(), details.title.id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            },
        )
        .optional()
        .map_err(|error| error.to_string())?
    else {
        return Ok(false);
    };
    if background && status != HISTORY_STATUS {
        let previous = snapshot
            .as_deref()
            .map(serde_json::from_str)
            .transpose()
            .map_err(|error| error.to_string())?;
        let (snapshot, notification) = observe_notifications(
            previous,
            &status,
            details.publication_status.as_deref(),
            details
                .chapters
                .iter()
                .filter(|chapter| !chapter.locked)
                .map(|chapter| chapter.key.clone()),
        );
        let snapshot = serde_json::to_string(&snapshot).map_err(|error| error.to_string())?;
        tx.execute(
            "UPDATE manga_library_items SET notification_snapshot = ?2 WHERE id = ?1",
            params![id, snapshot],
        )
        .map_err(|error| error.to_string())?;
        details.notification = Some(notification);
    }
    let now = millis();
    tx.execute("DELETE FROM manga_chapters WHERE item_id = ?1", [&id])
        .map_err(|error| error.to_string())?;
    {
        let mut statement = tx.prepare(
            "INSERT OR IGNORE INTO manga_chapters
             (item_id, source_chapter_id, volume, number, number_label, chapter_key, title, language, group_name, is_locked, lock_reason, fetched_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)"
        ).map_err(|error| error.to_string())?;
        for chapter in &details.chapters {
            let number = chapter
                .number
                .parse::<f64>()
                .ok()
                .filter(|value| value.is_finite());
            statement
                .execute(params![
                    id,
                    chapter.id,
                    chapter.volume,
                    number,
                    chapter.number,
                    chapter.key,
                    chapter.title,
                    chapter.language,
                    chapter.group,
                    chapter.locked,
                    chapter.lock_reason,
                    now
                ])
                .map_err(|error| error.to_string())?;
        }
    }
    tx.execute(
        "UPDATE manga_library_items SET last_checked_at = ?2,
             cover_url = COALESCE(?3, cover_url),
             unread_count = (SELECT count(DISTINCT chapter_key) FROM manga_chapters c WHERE c.item_id = ?1 AND c.is_locked = 0
             AND NOT EXISTS (SELECT 1 FROM manga_chapter_reads r WHERE r.item_id = ?1 AND r.chapter_key = c.chapter_key))
         WHERE id = ?1",
        params![id, now, details.title.cover],
    ).map_err(|error| error.to_string())?;
    tx.commit().map_err(|error| error.to_string())?;
    Ok(true)
}

fn valid_source_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 160
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
}

fn details_cache_key(id: &str) -> String {
    format!("details:{id}")
}

fn cache_details(
    connection: &Connection,
    source: MangaSource,
    details: &MangaDetails,
) -> Result<(), String> {
    let payload = serde_json::to_string(details).map_err(|error| error.to_string())?;
    connection
        .execute(
            "INSERT INTO manga_source_cache (source_id, cache_key, payload, fetched_at, expires_at)
             VALUES (?1, ?2, ?3, ?4, NULL)
             ON CONFLICT(source_id, cache_key) DO UPDATE SET
               payload = excluded.payload, fetched_at = excluded.fetched_at",
            params![
                source.id(),
                details_cache_key(&details.title.id),
                payload,
                millis()
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn local_library_details(
    connection: &Connection,
    source: MangaSource,
    manga_id: &str,
) -> Result<Option<MangaDetails>, String> {
    let item = connection
        .query_row(
            "SELECT id, title, cover_url, content_rating, description, year, genres_json,
                    alt_titles_json, external_ids_json
             FROM manga_library_items
             WHERE source_id = ?1 AND source_manga_id = ?2 AND status_id <> ?3",
            params![source.id(), manga_id, HISTORY_STATUS],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<i64>>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, String>(8)?,
                ))
            },
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let Some((item_id, title, cover, rating, description, year, genres, aliases, external)) = item
    else {
        return Ok(None);
    };
    let mut query = connection
        .prepare(
            "SELECT source_chapter_id, volume, number_label, chapter_key, title, language,
                    group_name, is_locked, lock_reason
             FROM manga_chapters WHERE item_id = ?1 ORDER BY rowid",
        )
        .map_err(|error| error.to_string())?;
    let chapters = query
        .query_map([item_id.as_str()], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "volume": row.get::<_, Option<String>>(1)?,
                "number": row.get::<_, String>(2)?,
                "key": row.get::<_, String>(3)?,
                "title": row.get::<_, Option<String>>(4)?,
                "language": row.get::<_, String>(5)?,
                "group": row.get::<_, Option<String>>(6)?,
                "locked": row.get::<_, bool>(7)?,
                "lockReason": row.get::<_, Option<String>>(8)?,
                "availableAt": null,
                "branch": null,
            }))
        })
        .map_err(|error| error.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| error.to_string())?;
    let details = serde_json::json!({
        "title": {
            "id": manga_id,
            "title": title,
            "cover": cover,
            "status": null,
            "chapters": null,
            "suggestive": rating != "safe",
            "rating": rating,
            "aliases": serde_json::from_str::<serde_json::Value>(&aliases).unwrap_or_default(),
            "externalIds": serde_json::from_str::<serde_json::Value>(&external).unwrap_or_default(),
        },
        "description": description,
        "authors": [],
        "artists": [],
        "genres": serde_json::from_str::<serde_json::Value>(&genres).unwrap_or_default(),
        "release": year.map(|year| year.to_string()),
        "chapters": chapters,
    });
    serde_json::from_value(details)
        .map(Some)
        .map_err(|error| format!("local manga details: {error}"))
}

/// Returns the last details fetched for a saved title so the detail modal can
/// paint from local data before the background refresh lands. Older library
/// entries without a details payload are rebuilt from the saved chapters.
#[tauri::command]
pub async fn manga_cached_details(
    app: AppHandle,
    source: MangaSource,
    id: String,
) -> Result<Option<MangaDetails>, String> {
    if !valid_source_id(&id) {
        return Ok(None);
    }
    database(app, false, move |connection| {
        let payload: Option<String> = connection
            .query_row(
                "SELECT payload FROM manga_source_cache WHERE source_id = ?1 AND cache_key = ?2",
                params![source.id(), details_cache_key(&id)],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;
        if let Some(payload) = payload {
            let mut details: MangaDetails = serde_json::from_str(&payload)
                .map_err(|error| format!("cached manga details: {error}"))?;
            details.notification = None;
            return Ok(Some(details));
        }
        local_library_details(connection, source, &id)
    })
    .await
}

#[tauri::command]
pub async fn manga_refresh_chapters(
    app: AppHandle,
    source: MangaSource,
    id: String,
    nsfw: bool,
    proxy_url: Option<String>,
    manga_lib_domain: Option<MangaLibDomain>,
    background: Option<bool>,
) -> Result<MangaDetails, String> {
    let mut details = manga_details(source, id, nsfw, proxy_url, manga_lib_domain)
        .await
        .map_err(|error| format!("{error:?}"))?;
    database(app, true, move |connection| {
        let saved = update_chapters(
            connection,
            source,
            &mut details,
            background.unwrap_or(false),
        )?;
        if saved {
            cache_details(connection, source, &details)?;
        }
        Ok(details)
    })
    .await
}

#[tauri::command]
pub async fn manga_status_create(
    app: AppHandle,
    id: String,
    label: String,
    color: Option<String>,
) -> Result<(), String> {
    let label = label.trim().to_owned();
    if !valid_id(&id) || label.is_empty() || label.chars().count() > 40 {
        return Err("invalid manga status".to_owned());
    }
    if color
        .as_deref()
        .is_some_and(|value| !valid_status_color(value))
    {
        return Err("invalid manga status color".to_owned());
    }
    let color = color.unwrap_or_else(|| "text".to_owned());
    database(app, true, move |connection| {
        connection
            .execute(
                "INSERT INTO manga_statuses (id, label, color, order_index)
             SELECT ?1, ?2, ?3, COALESCE(MAX(order_index), 0) + 1 FROM manga_statuses",
                params![format!("custom:{id}"), label, color],
            )
            .map_err(|error| error.to_string())?;
        Ok(())
    })
    .await
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum StatusChange {
    Edit {
        label: String,
        color: Option<String>,
    },
    Move {
        up: bool,
    },
    MoveTo {
        target: String,
    },
    Delete,
}

#[tauri::command]
pub async fn manga_status_manage(
    app: AppHandle,
    id: String,
    change: StatusChange,
) -> Result<(), String> {
    if !valid_custom_status_id(&id) {
        return Err("invalid custom manga status".to_owned());
    }
    database(app, true, move |connection| {
        let tx = connection.transaction().map_err(|error| error.to_string())?;
        let index: i64 = tx.query_row(
            "SELECT order_index FROM manga_statuses WHERE id = ?1 AND is_core = 0",
            [&id],
            |row| row.get(0),
        ).map_err(|error| error.to_string())?;
        match change {
            StatusChange::Edit { label, color } => {
                let label = label.trim();
                if label.is_empty() || label.chars().count() > 40 || color.as_deref().is_some_and(|value| !valid_status_color(value)) {
                    return Err("invalid manga status".to_owned());
                }
                tx.execute("UPDATE manga_statuses SET label = ?2, color = COALESCE(?3, color) WHERE id = ?1", params![id, label, color])
                    .map_err(|error| error.to_string())?;
            }
            StatusChange::Move { up } => {
                let sql = if up {
                    "SELECT order_index FROM manga_statuses WHERE is_core = 0 AND id GLOB 'custom:*' AND order_index < ?1 ORDER BY order_index DESC LIMIT 1"
                } else {
                    "SELECT order_index FROM manga_statuses WHERE is_core = 0 AND id GLOB 'custom:*' AND order_index > ?1 ORDER BY order_index LIMIT 1"
                };
                if let Some(target) = tx.query_row(sql, [index], |row| row.get(0))
                    .optional().map_err(|error| error.to_string())? {
                    move_custom_status(&tx, index, target)?;
                }
            }
            StatusChange::MoveTo { target } => {
                if !valid_custom_status_id(&target) {
                    return Err("invalid target manga status".to_owned());
                }
                let target_index = tx.query_row(
                    "SELECT order_index FROM manga_statuses WHERE id = ?1 AND is_core = 0",
                    [&target],
                    |row| row.get(0),
                ).map_err(|error| error.to_string())?;
                move_custom_status(&tx, index, target_index)?;
            }
            StatusChange::Delete => {
                tx.execute(
                    "INSERT OR IGNORE INTO manga_statuses (id, label, color, order_index, is_core)
                     VALUES (?1, ?2, 'text', -1, 1)",
                    params![UNASSIGNED_STATUS, "Без статуса"],
                ).map_err(|error| error.to_string())?;
                tx.execute("UPDATE manga_library_items SET status_id = ?2, favourite = 0 WHERE status_id = ?1", params![id, UNASSIGNED_STATUS])
                    .map_err(|error| error.to_string())?;
                tx.execute("DELETE FROM manga_statuses WHERE id = ?1", [&id])
                    .map_err(|error| error.to_string())?;
            }
        }
        tx.commit().map_err(|error| error.to_string())
    }).await
}

fn move_custom_status(connection: &Connection, from: i64, to: i64) -> Result<(), String> {
    connection
        .execute(
            "UPDATE manga_statuses
         SET order_index = CASE
             WHEN order_index = ?1 THEN ?2
             WHEN ?1 < ?2 THEN order_index - 1
             ELSE order_index + 1
         END
         WHERE is_core = 0 AND id GLOB 'custom:*'
           AND order_index BETWEEN min(?1, ?2) AND max(?1, ?2)",
            params![from, to],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn valid_custom_status_id(id: &str) -> bool {
    id.strip_prefix("custom:").is_some_and(valid_id)
}

fn valid_status_color(color: &str) -> bool {
    color.len() == 7
        && color.starts_with('#')
        && color.bytes().skip(1).all(|byte| byte.is_ascii_hexdigit())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryRow {
    item_id: String,
    source: String,
    manga_id: String,
    title: String,
    cover: Option<String>,
    rating: String,
    chapter_key: String,
    chapter_id: String,
    opened_at: i64,
}

#[tauri::command]
pub async fn manga_history_list(app: AppHandle, nsfw: bool) -> Result<Vec<HistoryRow>, String> {
    database(app, false, move |connection| {
        let mut query = connection
            .prepare(
                "SELECT i.id, i.source_id, i.source_manga_id, i.title, h.chapter_key, h.opened_at, h.chapter_id, i.cover_url, i.content_rating
             FROM manga_history h JOIN manga_library_items i ON i.id = h.item_id
             WHERE ?1 OR i.content_rating <> 'pornographic' ORDER BY h.opened_at DESC LIMIT 200",
            )
            .map_err(|error| error.to_string())?;
        let rows = query
            .query_map([nsfw], |row| {
                Ok(HistoryRow {
                    item_id: row.get(0)?,
                    source: row.get(1)?,
                    manga_id: row.get(2)?,
                    title: row.get(3)?,
                    chapter_key: row.get(4)?,
                    opened_at: row.get(5)?,
                    chapter_id: row.get(6)?,
                    cover: row.get(7)?,
                    rating: row.get(8)?,
                })
            })
            .map_err(|error| error.to_string())?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|error| error.to_string())
    })
    .await
}

#[tauri::command]
pub async fn manga_history_clear(app: AppHandle) -> Result<(), String> {
    database(app, true, |connection| {
        connection
            .execute("DELETE FROM manga_history", [])
            .map_err(|error| error.to_string())?;
        Ok(())
    })
    .await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReaderState {
    id: String,
    page: i64,
    scroll_offset: f64,
    read_keys: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackOpenInput {
    id: String,
    source: MangaSource,
    hit: MangaSearchHit,
    chapter_id: String,
    chapter_key: String,
}

#[tauri::command]
pub async fn manga_track_open(
    app: AppHandle,
    mut input: TrackOpenInput,
) -> Result<ReaderState, String> {
    validate_hit(input.source, &mut input.hit)?;
    if !valid_id(&input.id) || input.chapter_id.len() > 160 || input.chapter_key.len() > 80 {
        return Err("invalid manga chapter".to_owned());
    }
    database(app, true, move |connection| {
        let tx = connection.transaction().map_err(|error| error.to_string())?;
        tx.execute("INSERT OR IGNORE INTO manga_statuses (id, label, color, order_index) VALUES (?1, '', 'text', -1)", [HISTORY_STATUS])
            .map_err(|error| error.to_string())?;
        let id = upsert_item(&tx, &input.id, input.source, &input.hit, HISTORY_STATUS, 0)?;
        tx.execute(
            "INSERT INTO manga_history (id, item_id, chapter_id, chapter_key, opened_at) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT (id) DO UPDATE SET chapter_id = excluded.chapter_id, opened_at = excluded.opened_at",
            params![format!("{id}:{}", input.chapter_key), id, input.chapter_id, input.chapter_key, millis()],
        ).map_err(|error| error.to_string())?;
        let (page, scroll_offset) = tx.query_row(
            "SELECT page, scroll_offset FROM manga_reading_positions WHERE item_id = ?1 AND chapter_key = ?2",
            params![id, input.chapter_key], |row| Ok((row.get(0)?, row.get(1)?)),
        ).optional().map_err(|error| error.to_string())?.unwrap_or((0, 0.0));
        let read_keys = read_keys(&tx, &id)?;
        tx.commit().map_err(|error| error.to_string())?;
        Ok(ReaderState { id, page, scroll_offset, read_keys })
    }).await
}

fn read_keys(connection: &Connection, id: &str) -> Result<Vec<String>, String> {
    let mut query = connection
        .prepare("SELECT chapter_key FROM manga_chapter_reads WHERE item_id = ?1")
        .map_err(|error| error.to_string())?;
    let rows = query
        .query_map([id], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn manga_read_keys(
    app: AppHandle,
    source: MangaSource,
    manga_id: String,
) -> Result<Vec<String>, String> {
    database(app, false, move |connection| {
        let id: Option<String> = connection
            .query_row(
                "SELECT id FROM manga_library_items WHERE source_id = ?1 AND source_manga_id = ?2",
                params![source.id(), manga_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;
        id.map_or_else(|| Ok(vec![]), |id| read_keys(connection, &id))
    })
    .await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterReadChange {
    id: String,
    source: MangaSource,
    hit: MangaSearchHit,
    keys: Vec<String>,
    read: bool,
}

#[tauri::command]
pub async fn manga_set_chapters_read(
    app: AppHandle,
    mut input: ChapterReadChange,
) -> Result<Vec<String>, String> {
    validate_hit(input.source, &mut input.hit)?;
    if !valid_id(&input.id)
        || input.keys.len() > 10_000
        || input
            .keys
            .iter()
            .any(|key| key.trim().is_empty() || key.len() > 80)
    {
        return Err("invalid manga chapter selection".to_owned());
    }
    database(app, true, move |connection| {
        let tx = connection.transaction().map_err(|error| error.to_string())?;
        let existing = tx.query_row(
            "SELECT id FROM manga_library_items WHERE source_id = ?1 AND source_manga_id = ?2",
            params![input.source.id(), input.hit.id],
            |row| row.get::<_, String>(0),
        ).optional().map_err(|error| error.to_string())?;
        let id = match existing {
            Some(id) => id,
            None if !input.read || input.keys.is_empty() => return Ok(vec![]),
            None => {
                tx.execute(
                    "INSERT OR IGNORE INTO manga_statuses (id, label, color, order_index) VALUES (?1, '', 'text', -1)",
                    [HISTORY_STATUS],
                ).map_err(|error| error.to_string())?;
                upsert_item(&tx, &input.id, input.source, &input.hit, HISTORY_STATUS, 0)?
            }
        };
        apply_chapter_read_change(&tx, &id, &input.keys, input.read)?;
        let keys = read_keys(&tx, &id)?;
        tx.commit().map_err(|error| error.to_string())?;
        Ok(keys)
    }).await
}

fn apply_chapter_read_change(
    connection: &Connection,
    id: &str,
    keys: &[String],
    read: bool,
) -> Result<(), String> {
    let mut changed = 0_i64;
    let now = millis();
    for key in keys {
        let count = if read {
            connection.execute(
                "INSERT OR IGNORE INTO manga_chapter_reads (item_id, chapter_key, read_at, source) VALUES (?1, ?2, ?3, 'manual')",
                params![id, key, now],
            )
        } else {
            connection.execute(
                "DELETE FROM manga_chapter_reads WHERE item_id = ?1 AND chapter_key = ?2",
                params![id, key],
            )
        }.map_err(|error| error.to_string())?;
        changed += i64::from(count > 0);
    }
    let delta = if read { -changed } else { changed };
    connection
        .execute(
            "UPDATE manga_library_items SET unread_count = MAX(0, unread_count + ?2) WHERE id = ?1",
            params![id, delta],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingPosition {
    id: String,
    chapter_id: String,
    chapter_key: String,
    page: i64,
    page_count: i64,
    scroll_offset: f64,
    mode: String,
    at: i64,
    read: Vec<String>,
}

#[tauri::command]
pub async fn manga_track_position(app: AppHandle, input: ReadingPosition) -> Result<(), String> {
    if !valid_id(&input.id)
        || input.chapter_id.len() > 160
        || input.chapter_key.len() > 80
        || input.read.len() > 10_000
        || input.page < 0
        || input.page >= input.page_count
        || !input.scroll_offset.is_finite()
        || input.scroll_offset < 0.0
        || input.mode.len() > 24
        || input.read.iter().any(|key| key.len() > 80)
    {
        return Err("invalid manga reading position".to_owned());
    }
    database(app, true, move |connection| {
        let tx = connection.transaction().map_err(|error| error.to_string())?;
        tx.execute(
            "INSERT INTO manga_reading_positions (item_id, chapter_id, chapter_key, page, page_count, mode, updated_at, scroll_offset)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) ON CONFLICT(item_id) DO UPDATE SET
             chapter_id = excluded.chapter_id, chapter_key = excluded.chapter_key, page = excluded.page,
             page_count = excluded.page_count, mode = excluded.mode, updated_at = excluded.updated_at,
             scroll_offset = excluded.scroll_offset
             WHERE excluded.updated_at >= updated_at",
            params![input.id, input.chapter_id, input.chapter_key, input.page, input.page_count, input.mode, input.at, input.scroll_offset],
        ).map_err(|error| error.to_string())?;
        let mut added = 0_i64;
        for key in &input.read {
            added += i64::from(tx.execute(
                "INSERT OR IGNORE INTO manga_chapter_reads (item_id, chapter_key, read_at, source) VALUES (?1, ?2, ?3, 'auto')",
                params![input.id, key, input.at],
            ).map_err(|error| error.to_string())? > 0);
        }
        tx.execute("UPDATE manga_library_items SET unread_count = MAX(0, unread_count - ?2) WHERE id = ?1", params![input.id, added])
            .map_err(|error| error.to_string())?;
        tx.commit().map_err(|error| error.to_string())
    }).await
}

#[cfg(test)]
mod notification_tests {
    use super::*;

    fn keys<'a>(values: &'a [&'a str]) -> impl Iterator<Item = String> + 'a {
        values.iter().map(|value| (*value).to_owned())
    }

    #[test]
    fn manual_chapter_marks_update_unread_only_for_changed_keys() {
        let connection = Connection::open_in_memory().expect("database");
        connection
            .execute_batch(include_str!("../app_db/manga_v45.sql"))
            .expect("manga tables");
        connection
            .execute_batch(
                "INSERT INTO manga_library_items
                 (id, source_id, source_manga_id, title, status_id, unread_count, created_at, updated_at)
                 VALUES ('item', 'mangadex', 'source-item', 'Sample', 'reading', 3, 0, 0);
                 INSERT INTO manga_history (id, item_id, chapter_id, chapter_key, opened_at)
                 VALUES ('history', 'item', 'chapter-id', '1', 5);",
            )
            .expect("existing title and history");
        let unread = || {
            connection
                .query_row(
                    "SELECT unread_count FROM manga_library_items WHERE id = 'item'",
                    [],
                    |row| row.get::<_, i64>(0),
                )
                .expect("unread count")
        };

        let marked = vec!["1".to_owned(), "2".to_owned(), "2".to_owned()];
        apply_chapter_read_change(&connection, "item", &marked, true).expect("mark previous");
        assert_eq!(unread(), 1);
        apply_chapter_read_change(&connection, "item", &marked, true).expect("repeat mark");
        assert_eq!(unread(), 1);
        apply_chapter_read_change(&connection, "item", &["1".into()], false).expect("mark unread");
        assert_eq!(unread(), 2);
        assert_eq!(read_keys(&connection, "item").expect("keys"), vec!["2"]);
        assert_eq!(
            connection
                .query_row("SELECT COUNT(*) FROM manga_history", [], |row| row
                    .get::<_, i64>(0))
                .expect("history"),
            1,
        );
    }

    #[test]
    fn reading_counts_only_previously_unseen_chapter_keys() {
        let (initial, first) =
            observe_notifications(None, "reading", Some("ongoing"), keys(&["1"]));
        let (next, update) = observe_notifications(
            Some(initial),
            "reading",
            Some("completed"),
            keys(&["2", "2"]),
        );
        let (_, repeated) = observe_notifications(Some(next), "reading", None, keys(&["1", "2"]));

        assert_eq!(first.new_chapters, 0);
        assert_eq!(update.new_chapters, 1);
        assert_eq!(update.status_change, None);
        assert_eq!(repeated.new_chapters, 0);
    }

    #[test]
    fn planned_ignores_chapters_and_preserves_the_last_known_status() {
        let (initial, first) = observe_notifications(None, "planned", Some("ongoing"), keys(&[]));
        let (next, unavailable) =
            observe_notifications(Some(initial), "planned", None, keys(&["1"]));
        let (_, changed) =
            observe_notifications(Some(next), "planned", Some("completed"), keys(&["1", "2"]));

        assert_eq!(first.status_change, None);
        assert_eq!(unavailable.status_change, None);
        assert_eq!(
            changed.status_change,
            Some(["ongoing".to_owned(), "completed".to_owned()])
        );
        assert_eq!(changed.new_chapters, 0);
    }
}

#[cfg(test)]
mod cache_tests {
    use super::*;

    #[test]
    fn cached_details_round_trip_keeps_chapters_and_people() {
        let payload = r#"{
          "title": {
            "id": "test",
            "title": "Sample",
            "cover": null,
            "status": "ongoing",
            "chapters": 10,
            "suggestive": false,
            "rating": "safe",
            "aliases": [],
            "externalIds": {"anilist": null, "mal": null}
          },
          "description": "Desc",
          "authors": ["Author"],
          "artists": ["Artist"],
          "genres": ["Action"],
          "release": "2020",
          "chapters": [{
            "id": "c1",
            "number": "1",
            "volume": null,
            "key": "1",
            "title": null,
            "language": "ru",
            "group": null,
            "locked": false,
            "lockReason": null,
            "availableAt": null,
            "branch": null
          }]
        }"#;
        let details: MangaDetails = serde_json::from_str(payload).expect("cached details");
        let restored: MangaDetails =
            serde_json::from_str(&serde_json::to_string(&details).expect("serialize"))
                .expect("deserialize");

        assert_eq!(restored.title.status.as_deref(), Some("ongoing"));
        assert_eq!(restored.chapters[0].language, "ru");
        assert!(restored.notification.is_none());
        let value = serde_json::to_value(&restored).expect("json");
        assert_eq!(value["authors"], serde_json::json!(["Author"]));
        assert!(value.get("authorKeys").is_none());
    }

    #[test]
    fn cache_ids_reject_path_like_values() {
        assert!(valid_source_id("206--one-piece"));
        assert!(valid_source_id("0a580438-bc72-4503-940b-12a5da881b56"));
        assert!(!valid_source_id("../details"));
        assert!(!valid_source_id(""));
        assert_eq!(
            details_cache_key("206--one-piece"),
            "details:206--one-piece"
        );
    }
}

#[cfg(test)]
mod local_details_tests {
    use super::*;

    #[test]
    fn library_details_are_rebuilt_from_saved_rows_before_the_first_refresh() {
        let connection = Connection::open_in_memory().expect("database");
        connection
            .execute_batch(include_str!("../app_db/manga_v45.sql"))
            .expect("manga tables");
        connection
            .execute_batch(
                "INSERT INTO manga_library_items
                 (id, source_id, source_manga_id, title, cover_url, content_rating, description,
                  year, genres_json, alt_titles_json, external_ids_json, status_id, unread_count,
                  created_at, updated_at)
                 VALUES ('item', 'mangadex', 'source-item', 'Sample', NULL, 'suggestive', 'Desc',
                         2020, '[\"Action\"]', '[]', '{}', 'reading', 1, 0, 0);
                 INSERT INTO manga_chapters
                 (item_id, source_chapter_id, volume, number, number_label, chapter_key, title,
                  language, group_name, is_locked, lock_reason, fetched_at)
                 VALUES ('item', 'chapter-1', NULL, 1, '1', '1', NULL, 'ru', 'Team', 0, NULL, 0);",
            )
            .expect("saved title and chapter");

        let details = local_library_details(&connection, MangaSource::MangaDex, "source-item")
            .expect("local details")
            .expect("saved title");
        assert_eq!(details.title.id, "source-item");
        assert_eq!(details.chapters.len(), 1);
        assert_eq!(details.chapters[0].key, "1");
        assert_eq!(details.chapters[0].group.as_deref(), Some("Team"));
        let value = serde_json::to_value(&details).expect("json");
        assert_eq!(value["title"]["suggestive"], true);
        assert_eq!(value["description"], "Desc");
        assert_eq!(value["genres"], serde_json::json!(["Action"]));
        assert_eq!(value["release"], "2020");
    }

    #[test]
    fn history_titles_do_not_produce_local_details() {
        let connection = Connection::open_in_memory().expect("database");
        connection
            .execute_batch(include_str!("../app_db/manga_v45.sql"))
            .expect("manga tables");
        connection
            .execute_batch(
                "INSERT INTO manga_statuses (id, label, color, order_index)
                 VALUES ('internal:history', '', 'text', -1);
                 INSERT INTO manga_library_items
                 (id, source_id, source_manga_id, title, status_id, created_at, updated_at)
                 VALUES ('item', 'mangadex', 'source-item', 'Sample', 'internal:history', 0, 0);",
            )
            .expect("history title");
        assert!(
            local_library_details(&connection, MangaSource::MangaDex, "source-item")
                .expect("local details")
                .is_none()
        );
    }
}
