//! `AniList` avatar cache (lobby.md §14.5).
//!
//! Avatars are keyed by the `AniList` user id (never the nickname) and stored in
//! the existing `cache_entries` table under the `anilist_avatar` namespace with
//! a TTL. A failed or invalid fetch is never written, so a transient network
//! failure does not pin the fallback avatar forever. The frontend falls back to
//! `boring-avatars` (seeded by `avatar_seed`) whenever this returns `None`.

use rusqlite::{params, Connection, OptionalExtension};

use super::client::graphql_request;

/// `cache_entries` namespace for the avatar cache.
pub const AVATAR_CACHE_NAMESPACE: &str = "anilist_avatar";
/// Avatars change rarely; one week keeps the cache small and fresh enough.
pub const AVATAR_CACHE_TTL_SECONDS: i64 = 7 * 24 * 60 * 60;
/// Upper bound for a stored avatar URL.
pub const MAX_AVATAR_URL_CHARS: usize = 1024;

/// Threshold for the cache query: rows with an expiry at or before this are
/// ignored (and overwritten on the next successful fetch).
fn cache_now() -> i64 {
    crate::app_db::now_seconds()
}

/// Narrow an `unknown` `AniList` `Viewer` response to a usable avatar URL.
///
/// The response is untrusted input: every step is a typed narrow, and the URL
/// must be http(s) and bounded before it can enter the cache or the UI.
pub fn avatar_url_from_response(value: &serde_json::Value) -> Option<String> {
    let avatar = value.get("data")?.get("Viewer")?.get("avatar")?;
    let url = avatar
        .get("large")
        .and_then(serde_json::Value::as_str)
        .or_else(|| avatar.get("medium").and_then(serde_json::Value::as_str))?;
    validate_avatar_url(url)
}

/// Accept only a bounded http(s) URL.
pub fn validate_avatar_url(url: &str) -> Option<String> {
    let trimmed = url.trim();
    if trimmed.is_empty() || trimmed.chars().count() > MAX_AVATAR_URL_CHARS {
        return None;
    }
    if !(trimmed.starts_with("https://") || trimmed.starts_with("http://")) {
        return None;
    }
    Some(trimmed.to_string())
}

fn cached_payload_url(payload: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(payload).ok()?;
    value
        .get("url")
        .and_then(serde_json::Value::as_str)
        .and_then(validate_avatar_url)
}

/// Read a live cache entry for `anilist_id` (`None` on miss or expiry).
pub fn read_avatar(connection: &Connection, anilist_id: u64) -> Result<Option<String>, String> {
    let payload: Option<String> = connection
        .query_row(
            "SELECT payload FROM cache_entries
             WHERE namespace = ?1 AND cache_key = ?2
               AND (expires_at IS NULL OR expires_at > ?3)",
            params![AVATAR_CACHE_NAMESPACE, anilist_id.to_string(), cache_now()],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("read avatar cache: {error}"))?;
    Ok(payload.as_deref().and_then(cached_payload_url))
}

/// Write a validated avatar URL for `anilist_id`.
pub fn write_avatar(connection: &Connection, anilist_id: u64, url: &str) -> Result<(), String> {
    let payload = serde_json::json!({ "url": url }).to_string();
    let expires_at = cache_now().saturating_add(AVATAR_CACHE_TTL_SECONDS);
    connection
        .execute(
            "INSERT INTO cache_entries (namespace, cache_key, payload, expires_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(namespace, cache_key) DO UPDATE SET
                payload = excluded.payload,
                expires_at = excluded.expires_at,
                updated_at = excluded.updated_at",
            params![
                AVATAR_CACHE_NAMESPACE,
                anilist_id.to_string(),
                payload,
                expires_at,
                cache_now()
            ],
        )
        .map_err(|error| format!("write avatar cache: {error}"))?;
    Ok(())
}

/// Apply a fetch result: a valid URL is written and returned; anything else
/// (`None`, a non-URL, an over-long value) returns `None` and writes nothing.
pub fn store_fetched_avatar(
    connection: &Connection,
    anilist_id: u64,
    fetched: Option<String>,
) -> Result<Option<String>, String> {
    let Some(url) = fetched.and_then(|value| validate_avatar_url(&value)) else {
        return Ok(None);
    };
    write_avatar(connection, anilist_id, &url)?;
    Ok(Some(url))
}

/// Resolve this account's avatar: cache hit first, then one `AniList` `Viewer`
/// query, storing a valid result. A network or shape failure returns `None`
/// (the frontend fallback) and creates no record.
#[tauri::command]
pub async fn anilist_avatar(
    app: tauri::AppHandle,
    anilist_id: u64,
    proxy: Option<String>,
) -> Result<Option<String>, String> {
    let connection = crate::app_db::open_database(&app)?;
    if let Some(url) = read_avatar(&connection, anilist_id)? {
        return Ok(Some(url));
    }
    let token = super::auth::optional_token(&app);
    let query = serde_json::json!({
        "query": "query { Viewer { avatar { large medium } } }"
    });
    let fetched = graphql_request(query, token.as_deref(), proxy.as_deref())
        .await
        .map_or(None, |value| avatar_url_from_response(&value));
    store_fetched_avatar(&connection, anilist_id, fetched)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn memory_database() -> Connection {
        let connection = Connection::open_in_memory().expect("in-memory database");
        crate::app_db::schema::initialize_schema(&connection).expect("schema");
        connection
    }

    #[test]
    fn viewer_response_narrows_to_a_bounded_http_url() {
        let good = serde_json::json!({
            "data": { "Viewer": { "avatar": { "large": "https://s4.anilist.co/file/x.png", "medium": "m" } } }
        });
        assert_eq!(
            avatar_url_from_response(&good).as_deref(),
            Some("https://s4.anilist.co/file/x.png")
        );

        // Medium is the fallback when large is absent.
        let medium_only = serde_json::json!({
            "data": { "Viewer": { "avatar": { "medium": "http://cdn/ava.jpg" } } }
        });
        assert_eq!(
            avatar_url_from_response(&medium_only).as_deref(),
            Some("http://cdn/ava.jpg")
        );

        // Malformed, missing, non-URL, and over-long values all narrow to None.
        assert_eq!(avatar_url_from_response(&serde_json::json!({})), None);
        assert_eq!(
            avatar_url_from_response(&serde_json::json!({ "data": { "Viewer": null } })),
            None
        );
        assert_eq!(
            avatar_url_from_response(&serde_json::json!({
                "data": { "Viewer": { "avatar": { "large": "javascript:alert(1)" } } }
            })),
            None
        );
        assert_eq!(
            validate_avatar_url(&"x".repeat(MAX_AVATAR_URL_CHARS + 1)),
            None
        );
    }

    #[test]
    fn cache_hit_is_keyed_by_anilist_id_and_survives_rereads() {
        let connection = memory_database();
        assert_eq!(read_avatar(&connection, 42).expect("miss"), None);

        write_avatar(&connection, 42, "https://s4.anilist.co/a.png").expect("write");
        assert_eq!(
            read_avatar(&connection, 42).expect("hit").as_deref(),
            Some("https://s4.anilist.co/a.png")
        );
        // A different id is a separate key.
        assert_eq!(read_avatar(&connection, 43).expect("other id"), None);
    }

    #[test]
    fn a_valid_fetch_is_written_and_a_failed_fetch_is_not() {
        let connection = memory_database();

        // Miss -> valid fetch -> write.
        let stored = store_fetched_avatar(
            &connection,
            7,
            Some("https://s4.anilist.co/seven.png".into()),
        )
        .expect("store");
        assert_eq!(stored.as_deref(), Some("https://s4.anilist.co/seven.png"));
        assert_eq!(
            read_avatar(&connection, 7).expect("hit").as_deref(),
            Some("https://s4.anilist.co/seven.png")
        );

        // Failed fetch -> no record (a later retry can succeed).
        assert_eq!(
            store_fetched_avatar(&connection, 8, None).expect("store"),
            None
        );
        assert_eq!(read_avatar(&connection, 8).expect("no record"), None);

        // Invalid shape -> no record.
        assert_eq!(
            store_fetched_avatar(&connection, 9, Some("not a url".into())).expect("store"),
            None
        );
        assert_eq!(read_avatar(&connection, 9).expect("no record"), None);
    }

    #[test]
    fn an_expired_entry_is_a_miss() {
        let connection = memory_database();
        connection
            .execute(
                "INSERT INTO cache_entries (namespace, cache_key, payload, expires_at, updated_at)
                 VALUES (?1, '5', '{\"url\":\"https://s4.anilist.co/old.png\"}', ?2, 0)",
                params![AVATAR_CACHE_NAMESPACE, cache_now() - 1],
            )
            .expect("insert expired");
        assert_eq!(read_avatar(&connection, 5).expect("expired miss"), None);
    }
}
