use rusqlite::{params, OptionalExtension};
use serde::Serialize;

use super::db::{MAX_PAYLOAD_BYTES, now_seconds, open_database};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppCacheRecord {
    pub namespace: String,
    pub key: String,
    pub payload: String,
    pub expires_at: Option<i64>,
    pub updated_at: i64,
}
fn validate_cache_input(namespace: &str, key: &str, payload: &str) -> Result<(), String> {
    if namespace.is_empty() || namespace.len() > 100 || key.is_empty() || key.len() > 512 {
        return Err("Cache namespace or key has an invalid length".to_string());
    }
    if payload.len() > MAX_PAYLOAD_BYTES {
        return Err(format!(
            "Cache payload exceeds {} MiB",
            MAX_PAYLOAD_BYTES / 1024 / 1024
        ));
    }
    serde_json::from_str::<serde_json::Value>(payload)
        .map_err(|error| format!("Cache payload must be valid JSON: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn get_app_cache(
    app: tauri::AppHandle,
    namespace: String,
    key: String,
) -> Result<Option<AppCacheRecord>, String> {
    let connection = open_database(&app)?;
    let record = connection
        .query_row(
            "SELECT namespace, cache_key, payload, expires_at, updated_at
             FROM cache_entries WHERE namespace = ?1 AND cache_key = ?2",
            params![namespace, key],
            |row| {
                Ok(AppCacheRecord {
                    namespace: row.get(0)?,
                    key: row.get(1)?,
                    payload: row.get(2)?,
                    expires_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            },
        )
        .optional()
        .map_err(|error| format!("read app cache: {error}"))?;

    if let Some(record) = record {
        if record
            .expires_at
            .is_some_and(|expires_at| expires_at <= now_seconds())
        {
            connection
                .execute(
                    "DELETE FROM cache_entries WHERE namespace = ?1 AND cache_key = ?2",
                    params![record.namespace, record.key],
                )
                .map_err(|error| format!("remove expired cache: {error}"))?;
            return Ok(None);
        }
        return Ok(Some(record));
    }

    Ok(None)
}

#[tauri::command]
pub fn put_app_cache(
    app: tauri::AppHandle,
    namespace: String,
    key: String,
    payload: String,
    ttl_seconds: Option<i64>,
) -> Result<(), String> {
    validate_cache_input(&namespace, &key, &payload)?;
    let connection = open_database(&app)?;
    let expires_at = ttl_seconds
        .filter(|ttl| *ttl > 0)
        .map(|ttl| now_seconds().saturating_add(ttl));
    connection
        .execute(
            "INSERT INTO cache_entries (namespace, cache_key, payload, expires_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(namespace, cache_key) DO UPDATE SET
                payload = excluded.payload,
                expires_at = excluded.expires_at,
                updated_at = excluded.updated_at",
            params![namespace, key, payload, expires_at, now_seconds()],
        )
        .map_err(|error| format!("write app cache: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn delete_app_cache(
    app: tauri::AppHandle,
    namespace: String,
    key: String,
) -> Result<(), String> {
    let connection = open_database(&app)?;
    connection
        .execute(
            "DELETE FROM cache_entries WHERE namespace = ?1 AND cache_key = ?2",
            params![namespace, key],
        )
        .map_err(|error| format!("delete app cache: {error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_input_rejects_non_json_and_oversized_payloads() {
        assert!(validate_cache_input("test", "key", "{\"ok\":true}").is_ok());
        assert!(validate_cache_input("test", "key", "not-json").is_err());
        assert!(validate_cache_input("test", "key", &"x".repeat(MAX_PAYLOAD_BYTES + 1)).is_err());
    }
}