use tauri::Manager;

use crate::{anilist, app_db, auth};

/// Deletes local user data and credentials, then clears the in-memory caches.
#[tauri::command]
pub async fn reset_sqlite_data(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?;
    let mut removed = Vec::new();
    let databases = [
        (
            "AniList franchise cache",
            app_dir.join("franchise_relations_cache.sqlite3"),
        ),
        ("Uploaded user images", app_dir.join("user_assets.sqlite3")),
    ];
    for account in [
        "anilist.access_token",
        "rutracker.cookies",
        "rutracker.user_agent",
        "nekobt.api_key",
        "erai-raws.cookies",
    ] {
        auth::delete_secret(account);
    }
    removed.push("Tracker credentials".to_string());
    for file in [
        "anilist_token.txt",
        "rutracker_cookies.json",
        "nekobt_key.json",
        "torrent_limits.json",
        "session_config.json",
    ] {
        match std::fs::remove_file(app_dir.join(file)) {
            Ok(()) => removed.push(file.to_string()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("remove {file}: {error}")),
        }
    }
    match std::fs::remove_dir_all(app_dir.join("session")) {
        Ok(()) => removed.push("session".to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(format!("remove session dir: {error}")),
    }
    match std::fs::remove_dir_all(app_dir.join("images")) {
        Ok(()) => removed.push("Stored image files".to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(format!("remove images dir: {error}")),
    }
    for (label, path) in databases {
        let mut removed_this = false;
        for suffix in ["", "-wal", "-shm"] {
            let candidate = if suffix.is_empty() {
                path.clone()
            } else {
                std::path::PathBuf::from(format!("{}{}", path.to_string_lossy(), suffix))
            };
            match std::fs::remove_file(&candidate) {
                Ok(()) => removed_this = true,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(format!("remove {}: {error}", candidate.display())),
            }
        }
        if removed_this {
            removed.push(label.to_string());
        }
    }
    if app_db::remove_database(&app_handle)? {
        removed.push("Shared app cache and metadata".to_string());
    }
    anilist::clear_franchise_cache_memory();
    Ok(removed)
}
