use std::collections::HashSet;

use rusqlite::Connection;
use serde::Serialize;
use tauri::AppHandle;

use super::config::{
    choice_packs_for_completed, choice_packs_for_completed_manga, packs_for_completed,
    packs_for_completed_manga, starter_packs, CARDS_GRANT_ENABLED, CARD_PACK_SIZE,
    CHOICE_PACK_KIND, CHOICE_PACK_SIZE,
};
use super::packs::spawn_prepare_packs_with_proxy;
use super::rng::seed_now;
use super::types::CardKind;
use crate::anilist::auth::{check_anilist_auth, get_anilist_lists, AniListCollection};
use crate::app_db::cards::{
    insert_pack, insert_pack_grant, insert_starter_grant, starter_grant, CardPackRow, LOCAL_USER_ID,
};
use crate::app_db::db::{
    lock_app_data_write_timeout, now_seconds, open_database, APP_DATA_WRITE_TIMEOUT,
};
use crate::scrapers::clients::resolve_proxy;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrantResult {
    pub granted: bool,
    pub packs: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StarterStatus {
    pub connected: bool,
    pub user_id: u64,
    pub completed: u32,
    pub granted: bool,
    pub packs: i64,
}

fn grant_pack(
    connection: &Connection,
    source: &str,
    pack_kind: &str,
    media_id: Option<i64>,
    media_kind: Option<CardKind>,
    seed: u64,
    size: usize,
    now: i64,
) -> Result<(), String> {
    insert_pack(
        connection,
        LOCAL_USER_ID,
        &CardPackRow {
            id: format!("{source}-{seed}"),
            source: source.into(),
            pack_kind: pack_kind.into(),
            media_id,
            media_kind,
            seed: seed as i64,
            size: size as i64,
            created_at: now,
            opened_at: None,
            contents_state: super::types::CardPackContentsState::Pending,
            claimed_at: None,
            chosen_slot: None,
        },
    )
}

/// One pack per completed title, forever. The ledger row and the packs are
/// inserted in one transaction; a repeat completion inserts nothing.
pub fn grant_completion_in(
    connection: &Connection,
    media_id: i64,
    episodes: Option<u32>,
    enabled: bool,
) -> Result<GrantResult, String> {
    grant_completion_with_kind_in(
        connection,
        media_id,
        packs_for_completed(episodes),
        choice_packs_for_completed(episodes),
        "default",
        CardKind::Anime,
        enabled,
    )
}

/// Completed manga grant the same mixed pack as anime, scaled by chapters.
/// AniList media ids are unique across anime and manga, so the shared grant
/// ledger still dedupes correctly.
pub fn grant_manga_completion_in(
    connection: &Connection,
    media_id: i64,
    chapters: Option<u32>,
    enabled: bool,
) -> Result<GrantResult, String> {
    grant_completion_with_kind_in(
        connection,
        media_id,
        packs_for_completed_manga(chapters),
        choice_packs_for_completed_manga(chapters),
        "default",
        CardKind::Manga,
        enabled,
    )
}

fn grant_completion_with_kind_in(
    connection: &Connection,
    media_id: i64,
    packs: u32,
    choice_packs: u32,
    pack_kind: &str,
    media_kind: CardKind,
    enabled: bool,
) -> Result<GrantResult, String> {
    if !enabled {
        return Ok(GrantResult {
            granted: false,
            packs: 0,
        });
    }
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| format!("card grant transaction: {error}"))?;
    let now = now_seconds();
    let packs = i64::from(packs);
    if !insert_pack_grant(&transaction, LOCAL_USER_ID, media_id, now)? {
        return Ok(GrantResult {
            granted: false,
            packs: 0,
        });
    }
    for index in 0..packs {
        grant_pack(
            &transaction,
            "status",
            pack_kind,
            Some(media_id),
            None,
            seed_now() ^ index as u64,
            CARD_PACK_SIZE,
            now,
        )?;
    }
    for index in 0..choice_packs {
        grant_pack(
            &transaction,
            "status",
            CHOICE_PACK_KIND,
            Some(media_id),
            Some(media_kind),
            seed_now() ^ 0x1000 ^ index as u64,
            CHOICE_PACK_SIZE,
            now,
        )?;
    }
    transaction
        .commit()
        .map_err(|error| format!("commit card grant: {error}"))?;
    Ok(GrantResult {
        granted: true,
        packs,
    })
}

/// Starter packs from the completed count. One starter grant per local profile.
pub fn grant_starter_in(
    connection: &Connection,
    completed: u32,
    enabled: bool,
) -> Result<GrantResult, String> {
    if !enabled {
        return Ok(GrantResult {
            granted: false,
            packs: 0,
        });
    }
    let transaction = connection
        .unchecked_transaction()
        .map_err(|error| format!("starter grant transaction: {error}"))?;
    if let Some(existing) = starter_grant(&transaction, LOCAL_USER_ID)? {
        return Ok(GrantResult {
            granted: false,
            packs: existing.packs,
        });
    }
    let now = now_seconds();
    let packs = i64::from(starter_packs(completed));
    if !insert_starter_grant(&transaction, LOCAL_USER_ID, packs, now)? {
        return Ok(GrantResult {
            granted: false,
            packs: 0,
        });
    }
    for index in 0..packs {
        grant_pack(
            &transaction,
            "starter",
            "default",
            None,
            None,
            seed_now() ^ index as u64,
            CARD_PACK_SIZE,
            now,
        )?;
    }
    transaction
        .commit()
        .map_err(|error| format!("commit starter grant: {error}"))?;
    Ok(GrantResult {
        granted: true,
        packs,
    })
}

pub fn grant_for_completion(
    app: &AppHandle,
    media_id: u64,
    episodes: Option<i32>,
    enabled: bool,
) -> Result<GrantResult, String> {
    if !enabled {
        return Ok(GrantResult {
            granted: false,
            packs: 0,
        });
    }
    let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
    let connection = open_database(app)?;
    grant_completion_in(
        &connection,
        media_id as i64,
        episodes.and_then(|value| u32::try_from(value).ok()),
        enabled,
    )
}

pub fn grant_for_manga_completion(
    app: &AppHandle,
    media_id: u64,
    chapters: Option<i32>,
    enabled: bool,
) -> Result<GrantResult, String> {
    if !enabled {
        return Ok(GrantResult {
            granted: false,
            packs: 0,
        });
    }
    let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
    let connection = open_database(app)?;
    grant_manga_completion_in(
        &connection,
        media_id as i64,
        chapters.and_then(|value| u32::try_from(value).ok()),
        enabled,
    )
}

pub fn completed_media_ids(lists: &[AniListCollection]) -> HashSet<u64> {
    lists
        .iter()
        .flat_map(|list| list.entries.iter())
        .filter(|entry| entry.list_status.eq_ignore_ascii_case("COMPLETED"))
        .map(|entry| entry.media.id)
        .collect()
}

/// The profile state for the manual starter claim. It never grants anything.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn cards_starter_status(
    app: AppHandle,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<StarterStatus, String> {
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let Some(user) = check_anilist_auth(app.clone(), proxy.clone(), None).await? else {
        return Ok(StarterStatus {
            connected: false,
            user_id: 0,
            completed: 0,
            granted: false,
            packs: 0,
        });
    };
    let lists = get_anilist_lists(app.clone(), user.id, Some(true), None, proxy, None).await?;
    let completed = completed_media_ids(&lists).len() as u32;
    let connection = open_database(&app)?;
    let granted = starter_grant(&connection, LOCAL_USER_ID)?;
    Ok(StarterStatus {
        connected: true,
        user_id: user.id,
        completed,
        granted: granted.is_some(),
        packs: granted.map_or(0, |row| row.packs),
    })
}

/// Manual starter claim from the Collection header. The automatic completion
/// grant stays behind `CARDS_GRANT_ENABLED`; this command is the only starter path.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn cards_grant_starter(
    app: AppHandle,
    user_id: u64,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<GrantResult, String> {
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let lists =
        get_anilist_lists(app.clone(), user_id, Some(true), None, proxy.clone(), None).await?;
    let completed = completed_media_ids(&lists).len() as u32;
    if completed == 0 {
        return Ok(GrantResult {
            granted: false,
            packs: 0,
        });
    }
    let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
    let connection = open_database(&app)?;
    let result = grant_starter_in(&connection, completed, true)?;
    drop(connection);
    if result.granted {
        spawn_prepare_packs_with_proxy(app, proxy);
    }
    Ok(result)
}

/// Called from `save_anilist_entry` only when the compile-time flag is on.
pub fn maybe_grant_for_completion(
    app: &AppHandle,
    media_id: u64,
    episodes: Option<i32>,
    proxy: Option<&str>,
) {
    if !CARDS_GRANT_ENABLED {
        return;
    }
    match grant_for_completion(app, media_id, episodes, CARDS_GRANT_ENABLED) {
        Ok(result) if result.granted => {
            spawn_prepare_packs_with_proxy(app.clone(), proxy.map(str::to_string))
        }
        Ok(_) => {}
        Err(error) => tracing::warn!(
            media_id,
            error = error.as_str(),
            "card completion grant failed"
        ),
    }
}

/// Called from `save_anilist_entry` for a completed manga when the flag is on.
pub fn maybe_grant_for_manga_completion(
    app: &AppHandle,
    media_id: u64,
    chapters: Option<i32>,
    proxy: Option<&str>,
) {
    if !CARDS_GRANT_ENABLED {
        return;
    }
    match grant_for_manga_completion(app, media_id, chapters, CARDS_GRANT_ENABLED) {
        Ok(result) if result.granted => {
            spawn_prepare_packs_with_proxy(app.clone(), proxy.map(str::to_string))
        }
        Ok(_) => {}
        Err(error) => tracing::warn!(
            media_id,
            error = error.as_str(),
            "manga card completion grant failed"
        ),
    }
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

    fn pack_count(connection: &Connection) -> i64 {
        connection
            .query_row("SELECT COUNT(*) FROM card_packs", [], |row| row.get(0))
            .expect("count packs")
    }

    fn pack_count_of(connection: &Connection, kind: &str) -> i64 {
        connection
            .query_row(
                "SELECT COUNT(*) FROM card_packs WHERE pack_kind = ?1",
                [kind],
                |row| row.get(0),
            )
            .expect("count packs by kind")
    }

    #[test]
    fn the_flag_off_inserts_nothing() {
        let connection = memory_db();
        let completion = grant_completion_in(&connection, 16498, Some(24), false).unwrap();
        assert!(!completion.granted);
        assert_eq!(pack_count(&connection), 0);
        let starter = grant_starter_in(&connection, 16, false).unwrap();
        assert!(!starter.granted);
        assert_eq!(pack_count(&connection), 0);
    }

    #[test]
    fn a_first_completion_grants_packs_and_a_repeat_grants_none() {
        let connection = memory_db();
        let first = grant_completion_in(&connection, 16498, Some(24), true).unwrap();
        assert_eq!(first.packs, 2);
        assert_eq!(pack_count_of(&connection, "default"), 2);
        assert_eq!(pack_count_of(&connection, "choice"), 2);
        let repeat = grant_completion_in(&connection, 16498, Some(24), true).unwrap();
        assert!(!repeat.granted);
        assert_eq!(pack_count(&connection), 4);
    }

    #[test]
    fn episode_counts_scale_and_clamp() {
        let connection = memory_db();
        for (media_id, episodes, expected) in [
            (1, None, 1),
            (2, Some(0), 1),
            (3, Some(12), 1),
            (4, Some(13), 2),
            (5, Some(49), 5),
            (6, Some(1000), 5),
        ] {
            let result = grant_completion_in(&connection, media_id, episodes, true).unwrap();
            assert_eq!(result.packs, expected, "media {media_id}");
        }
        assert_eq!(pack_count_of(&connection, "default"), 15);
    }

    #[test]
    fn a_rewatch_of_the_same_media_is_the_same_ledger_row() {
        let connection = memory_db();
        grant_completion_in(&connection, 7, Some(12), true).unwrap();
        grant_completion_in(&connection, 7, Some(12), true).unwrap();
        let grants: i64 = connection
            .query_row("SELECT COUNT(*) FROM pack_grants", [], |row| row.get(0))
            .unwrap();
        assert_eq!(grants, 1);
        assert_eq!(pack_count(&connection), 2);
        assert_eq!(pack_count_of(&connection, "choice"), 1);
    }

    #[test]
    fn a_completed_manga_grants_default_packs_once() {
        let connection = memory_db();
        let first = grant_manga_completion_in(&connection, 30013, Some(60), true).unwrap();
        assert!(first.granted);
        assert_eq!(first.packs, 5);
        assert_eq!(pack_count_of(&connection, "default"), 5);
        assert_eq!(pack_count_of(&connection, "choice"), 3);
        let repeat = grant_manga_completion_in(&connection, 30013, Some(60), true).unwrap();
        assert!(!repeat.granted);
        assert_eq!(pack_count(&connection), 8);
    }

    #[test]
    fn manga_chapter_counts_scale_and_clamp() {
        let connection = memory_db();
        for (media_id, chapters, expected) in [
            (1, None, 1),
            (2, Some(0), 1),
            (3, Some(12), 1),
            (4, Some(13), 2),
            (5, Some(49), 5),
            (6, Some(5000), 5),
        ] {
            let result = grant_manga_completion_in(&connection, media_id, chapters, true).unwrap();
            assert_eq!(result.packs, expected, "media {media_id}");
        }
        assert_eq!(pack_count_of(&connection, "default"), 15);
    }

    #[test]
    fn choice_pack_counts_scale_from_a_single_pack() {
        for (episodes, expected) in [
            (None, 1),
            (Some(0), 1),
            (Some(8), 1),
            (Some(12), 1),
            (Some(13), 2),
            (Some(24), 2),
            (Some(25), 3),
            (Some(48), 4),
            (Some(49), 5),
            (Some(1000), 5),
        ] {
            assert_eq!(
                choice_packs_for_completed(episodes),
                expected,
                "episodes {episodes:?}"
            );
        }
        for (chapters, expected) in [
            (None, 1),
            (Some(0), 1),
            (Some(1), 1),
            (Some(25), 1),
            (Some(26), 2),
            (Some(50), 2),
            (Some(51), 3),
            (Some(5000), 5),
        ] {
            assert_eq!(
                choice_packs_for_completed_manga(chapters),
                expected,
                "chapters {chapters:?}"
            );
        }
    }

    #[test]
    fn the_starter_grant_is_once_per_profile() {
        let connection = memory_db();
        let first = grant_starter_in(&connection, 16, true).unwrap();
        assert_eq!(first.packs, 5);
        assert_eq!(pack_count(&connection), 5);
        let repeat = grant_starter_in(&connection, 100, true).unwrap();
        assert!(!repeat.granted);
        assert_eq!(repeat.packs, 5);
        assert_eq!(pack_count(&connection), 5);
    }

    #[test]
    fn starter_counts_follow_the_square_root_formula() {
        for (completed, expected) in [(0, 1), (1, 2), (4, 3), (9, 4), (16, 5), (100, 5)] {
            assert_eq!(starter_packs(completed), expected, "completed {completed}");
        }
    }
}
