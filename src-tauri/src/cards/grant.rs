use std::collections::HashSet;

use rusqlite::Connection;
use serde::Serialize;
use tauri::AppHandle;

use super::config::{packs_for_completed, starter_packs, CARDS_GRANT_ENABLED, CARD_PACK_SIZE};
use super::packs::spawn_prepare_packs_with_proxy;
use super::rng::seed_now;
use crate::anilist::auth::{get_anilist_lists, AniListCollection};
use crate::anilist::client::graphql_request;
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

fn grant_pack(
    connection: &Connection,
    source: &str,
    pack_kind: &str,
    media_id: Option<i64>,
    seed: u64,
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
            seed: seed as i64,
            size: CARD_PACK_SIZE as i64,
            created_at: now,
            opened_at: None,
            contents_state: super::types::CardPackContentsState::Pending,
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
    let packs = i64::from(packs_for_completed(episodes));
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
            "default",
            Some(media_id),
            seed_now() ^ index as u64,
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
            seed_now() ^ index as u64,
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

pub fn completed_media_ids(lists: &[AniListCollection]) -> HashSet<u64> {
    lists
        .iter()
        .flat_map(|list| list.entries.iter())
        .filter(|entry| entry.list_status.eq_ignore_ascii_case("COMPLETED"))
        .map(|entry| entry.media.id)
        .collect()
}

pub async fn fetch_episode_count(
    token: &str,
    media_id: u64,
    proxy: Option<&str>,
) -> Result<Option<i32>, String> {
    let response = graphql_request(
        serde_json::json!({
            "query": "query ($id: Int) { Media(id: $id) { episodes } }",
            "variables": { "id": media_id }
        }),
        Some(token),
        proxy,
    )
    .await?;
    Ok(response["data"]["Media"]["episodes"]
        .as_i64()
        .and_then(|value| i32::try_from(value).ok()))
}

#[tauri::command]
#[allow(non_snake_case)]
pub async fn cards_grant_starter(
    app: AppHandle,
    user_id: u64,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<GrantResult, String> {
    if !CARDS_GRANT_ENABLED {
        return Ok(GrantResult {
            granted: false,
            packs: 0,
        });
    }
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    let lists = get_anilist_lists(app.clone(), user_id, Some(true), proxy.clone(), None).await?;
    let completed = completed_media_ids(&lists).len() as u32;
    let _write = lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)?;
    let connection = open_database(&app)?;
    let result = grant_starter_in(&connection, completed, CARDS_GRANT_ENABLED)?;
    drop(connection);
    if result.granted {
        spawn_prepare_packs_with_proxy(app, proxy);
    }
    Ok(result)
}

/// Called from `save_anilist_entry` only when the compile-time flag is on.
pub async fn maybe_grant_for_completion(
    app: &AppHandle,
    media_id: u64,
    token: &str,
    proxy: Option<&str>,
) {
    if !CARDS_GRANT_ENABLED {
        return;
    }
    let episodes = fetch_episode_count(token, media_id, proxy)
        .await
        .ok()
        .flatten();
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
        assert_eq!(pack_count(&connection), 2);
        let repeat = grant_completion_in(&connection, 16498, Some(24), true).unwrap();
        assert!(!repeat.granted);
        assert_eq!(pack_count(&connection), 2);
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
        assert_eq!(pack_count(&connection), 15);
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
        assert_eq!(pack_count(&connection), 1);
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
