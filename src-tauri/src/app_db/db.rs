use super::schema::initialize_schema;
use rusqlite::Connection;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::Manager;
pub const DATABASE_FILE: &str = "app_data.sqlite3";
/// Upper bound for waiting on the shared write lock. Ordinary contention
/// resolves in milliseconds; anything beyond this means a pathological
/// holder (multi-minute VACUUM/optimize), and failing with a clear error
/// beats hanging the UI forever.
pub const APP_DATA_WRITE_TIMEOUT: Duration = Duration::from_secs(30);
pub const MAX_PAYLOAD_BYTES: usize = 8 * 1024 * 1024;
pub const CURRENT_SCHEMA_VERSION: i64 = 20;
pub fn now_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

pub fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
pub fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data dir: {error}"))?;
    Ok(directory.join(DATABASE_FILE))
}
pub fn open_database(app: &tauri::AppHandle) -> Result<Connection, String> {
    let path = database_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("create app database dir: {error}"))?;
    }
    let connection =
        Connection::open(&path).map_err(|error| format!("open app database: {error}"))?;
    let version = connection
        .pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
        .map_err(|error| format!("read app database version: {error}"))?;
    if version < CURRENT_SCHEMA_VERSION && path.is_file() {
        let backup = PathBuf::from(format!("{}.bak", path.to_string_lossy()));
        if !backup.exists() {
            connection
                .execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")
                .map_err(|error| format!("checkpoint app database before backup: {error}"))?;
            fs::copy(&path, &backup)
                .map_err(|error| format!("backup app database before migration: {error}"))?;
        }
    }
    initialize_schema(&connection)?;
    Ok(connection)
}

static APP_DATA_WRITE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

/// Serializes all writers to the shared `app_data.sqlite3` file.
///
/// Every Tauri command opens its own SQLite connection while SQLite allows
/// only a single writer per file. Overlapping write transactions (index
/// rebuild vs. prune vs. FTS optimize vs. watch saves) used to surface as
/// `upsert unified index: database is locked` once the loser exhausted its
/// 5 s busy timeout. Holding this guard for the whole write section turns
/// the race into orderly waiting instead.
///
/// The wait is bounded by `timeout`: on expiry this returns an error instead
/// of hanging the caller forever behind a pathological holder.
///
/// The guard must wrap synchronous database sections only and never be held
/// across `.await`: it is a plain blocking mutex, not an async one.
pub fn lock_app_data_write_timeout(timeout: Duration) -> Result<MutexGuard<'static, ()>, String> {
    let mutex = APP_DATA_WRITE_LOCK.get_or_init(|| Mutex::new(()));
    let deadline = Instant::now() + timeout;
    loop {
        match mutex.try_lock() {
            Ok(guard) => return Ok(guard),
            Err(std::sync::TryLockError::Poisoned(poisoned)) => return Ok(poisoned.into_inner()),
            Err(std::sync::TryLockError::WouldBlock) => {
                if Instant::now() >= deadline {
                    return Err(
                        "app database is busy: another operation holds the write lock".into(),
                    );
                }
                std::thread::sleep(Duration::from_millis(5));
            }
        }
    }
}

/// Like [`lock_app_data_write_timeout`], but only when `database` selects the
/// shared app database (the id used by the sqlite browser UI). Returns
/// `Ok(None)` for unrelated files so they keep their own concurrency.
pub fn lock_app_data_write_if_timeout(
    database: &str,
    timeout: Duration,
) -> Result<Option<MutexGuard<'static, ()>>, String> {
    if database == "app_data" {
        lock_app_data_write_timeout(timeout).map(Some)
    } else {
        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_lock_timeout_fails_fast_when_held() {
        let _held = lock_app_data_write_timeout(Duration::from_secs(5)).expect("acquire guard");
        let contested =
            std::thread::spawn(|| lock_app_data_write_timeout(Duration::from_millis(50)).map(drop));
        let error = contested
            .join()
            .expect("probe thread")
            .expect_err("must time out");
        assert!(error.contains("busy"), "unexpected error: {error}");
    }

    #[test]
    fn write_lock_timeout_succeeds_once_released() {
        let (started_tx, started_rx) = std::sync::mpsc::channel::<()>();
        let holder = std::thread::spawn(move || {
            let _held = lock_app_data_write_timeout(Duration::from_secs(5)).expect("acquire guard");
            started_tx.send(()).expect("signal holder started");
            std::thread::sleep(Duration::from_millis(150));
        });
        started_rx.recv().expect("holder started");
        let _acquired =
            lock_app_data_write_timeout(Duration::from_secs(5)).expect("acquires after release");
        holder.join().expect("holder thread");
    }

    #[test]
    fn write_lock_if_timeout_is_selective() {
        assert!(
            lock_app_data_write_if_timeout("app_data", Duration::from_secs(1))
                .expect("app_data locks")
                .is_some()
        );
        assert!(
            lock_app_data_write_if_timeout("franchise", Duration::from_secs(1))
                .expect("other files skip")
                .is_none()
        );
    }
}
