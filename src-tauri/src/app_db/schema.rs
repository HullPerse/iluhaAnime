use rusqlite::Connection;
use std::time::Duration;

use super::db::CURRENT_SCHEMA_VERSION;

pub fn initialize_schema(connection: &Connection) -> Result<(), String> {
    connection
        .busy_timeout(Duration::from_secs(5))
        .map_err(|error| format!("app database timeout: {error}"))?;
    connection
        .pragma_update(None, "journal_mode", "WAL")
        .map_err(|error| format!("app database journal mode: {error}"))?;
    connection
        .pragma_update(None, "synchronous", "NORMAL")
        .map_err(|error| format!("app database synchronous mode: {error}"))?;
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| format!("app database foreign keys: {error}"))?;

    let version = connection
        .pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
        .map_err(|error| format!("app database version: {error}"))?;

    if version < 1 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database migration transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                CREATE TABLE IF NOT EXISTS cache_entries (
                    namespace TEXT NOT NULL,
                    cache_key TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    expires_at INTEGER,
                    updated_at INTEGER NOT NULL,
                    PRIMARY KEY (namespace, cache_key)
                );
                CREATE INDEX IF NOT EXISTS idx_cache_entries_expiry
                    ON cache_entries (namespace, expires_at);

                CREATE TABLE IF NOT EXISTS media_records (
                    path TEXT PRIMARY KEY,
                    identity_json TEXT,
                    metadata_json TEXT,
                    scanned_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS release_analysis (
                    release_id TEXT PRIMARY KEY,
                    payload TEXT NOT NULL,
                    analyzed_at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS anime_statistics (
                    scope TEXT NOT NULL,
                    stat_key TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    updated_at INTEGER NOT NULL,
                    PRIMARY KEY (scope, stat_key)
                );

                PRAGMA user_version = 1;
                ",
            )
            .map_err(|error| format!("app database schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database migration commit: {error}"))?;
    }

    if version < 2 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database index migration transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                CREATE TABLE IF NOT EXISTS unified_index (
                    id TEXT PRIMARY KEY,
                    kind TEXT NOT NULL,
                    scope TEXT NOT NULL,
                    value TEXT NOT NULL,
                    normalized_value TEXT NOT NULL,
                    subtitle TEXT,
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    use_count INTEGER NOT NULL DEFAULT 0,
                    selected_count INTEGER NOT NULL DEFAULT 0,
                    ignored_count INTEGER NOT NULL DEFAULT 0,
                    last_used_at INTEGER NOT NULL DEFAULT 0,
                    updated_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_unified_index_scope_normalized
                    ON unified_index (scope, normalized_value);
                CREATE INDEX IF NOT EXISTS idx_unified_index_kind_normalized
                    ON unified_index (kind, normalized_value);
                PRAGMA user_version = 2;
                ",
            )
            .map_err(|error| format!("app database index schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database index migration commit: {error}"))?;
    }

    if version < 3 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database fts migration transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                CREATE VIRTUAL TABLE IF NOT EXISTS unified_index_fts USING fts5(
                    normalized_value,
                    tokenize='trigram'
                );
                CREATE TRIGGER IF NOT EXISTS trg_unified_index_fts_insert
                AFTER INSERT ON unified_index BEGIN
                    INSERT INTO unified_index_fts(rowid, normalized_value)
                    VALUES (new.rowid, new.normalized_value);
                END;
                CREATE TRIGGER IF NOT EXISTS trg_unified_index_fts_update
                AFTER UPDATE OF normalized_value ON unified_index BEGIN
                    DELETE FROM unified_index_fts WHERE rowid = old.rowid;
                    INSERT INTO unified_index_fts(rowid, normalized_value)
                    VALUES (new.rowid, new.normalized_value);
                END;
                CREATE TRIGGER IF NOT EXISTS trg_unified_index_fts_delete
                AFTER DELETE ON unified_index BEGIN
                    DELETE FROM unified_index_fts WHERE rowid = old.rowid;
                END;
                INSERT INTO unified_index_fts(rowid, normalized_value)
                SELECT rowid, normalized_value FROM unified_index;
                PRAGMA user_version = 3;
                ",
            )
            .map_err(|error| format!("app database fts schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database fts migration commit: {error}"))?;
    }

    if version < 4 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database collection migration transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                CREATE TABLE IF NOT EXISTS collection_items (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    alt_titles_json TEXT NOT NULL DEFAULT '[]',
                    type TEXT NOT NULL CHECK(type IN ('anime','movie','series','custom')),
                    status TEXT NOT NULL CHECK(status IN ('planned','watching','completed','paused','dropped','rewatching')),
                    progress_value INTEGER NOT NULL DEFAULT 0,
                    progress_total INTEGER,
                    progress_unit TEXT NOT NULL CHECK(progress_unit IN ('episodes','seasons','minutes','pages')),
                    duration_minutes INTEGER,
                    rating INTEGER CHECK(rating BETWEEN 0 AND 10),
                    priority TEXT NOT NULL CHECK(priority IN ('low','normal','high')),
                    is_favorite INTEGER NOT NULL DEFAULT 0,
                    year INTEGER,
                    genres_json TEXT NOT NULL DEFAULT '[]',
                    studio TEXT,
                    description TEXT,
                    notes TEXT,
                    cover_url TEXT,
                    cover_blob_id TEXT,
                    thumb_blob_id TEXT,
                    external_ids_json TEXT NOT NULL DEFAULT '{}',
                    custom_fields_json TEXT NOT NULL DEFAULT '{}',
                    local_path TEXT,
                    local_kind TEXT CHECK(local_kind IN ('file','folder')),
                    started_at INTEGER,
                    finished_at INTEGER,
                    last_watched_at INTEGER,
                    rewatch_count INTEGER NOT NULL DEFAULT 0,
                    added_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS collection_events (
                    id TEXT PRIMARY KEY,
                    item_id TEXT REFERENCES collection_items(id) ON DELETE SET NULL,
                    kind TEXT NOT NULL,
                    from_value TEXT,
                    to_value TEXT,
                    at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS custom_field_defs (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    field_type TEXT NOT NULL CHECK(field_type IN ('text','number','select','date')),
                    options_json TEXT
                );
                CREATE VIRTUAL TABLE IF NOT EXISTS collection_items_fts USING fts5(
                    title, alt_titles_json, description, notes, genres_json, studio, tokenize='trigram'
                );
                CREATE TRIGGER IF NOT EXISTS trg_collection_items_fts_insert
                AFTER INSERT ON collection_items BEGIN
                    INSERT INTO collection_items_fts(rowid, title, alt_titles_json, description, notes, genres_json, studio)
                    VALUES (new.rowid, new.title, new.alt_titles_json, new.description, new.notes, new.genres_json, new.studio);
                END;
                CREATE TRIGGER IF NOT EXISTS trg_collection_items_fts_update
                AFTER UPDATE ON collection_items BEGIN
                    DELETE FROM collection_items_fts WHERE rowid = old.rowid;
                    INSERT INTO collection_items_fts(rowid, title, alt_titles_json, description, notes, genres_json, studio)
                    VALUES (new.rowid, new.title, new.alt_titles_json, new.description, new.notes, new.genres_json, new.studio);
                END;
                CREATE TRIGGER IF NOT EXISTS trg_collection_items_fts_delete
                AFTER DELETE ON collection_items BEGIN
                    DELETE FROM collection_items_fts WHERE rowid = old.rowid;
                END;
                CREATE INDEX IF NOT EXISTS idx_collection_items_status ON collection_items(status);
                CREATE INDEX IF NOT EXISTS idx_collection_items_rating ON collection_items(rating);
                CREATE INDEX IF NOT EXISTS idx_collection_items_year ON collection_items(year);
                CREATE INDEX IF NOT EXISTS idx_collection_items_favorite ON collection_items(is_favorite);
                CREATE INDEX IF NOT EXISTS idx_collection_events_item ON collection_events(item_id);
                CREATE INDEX IF NOT EXISTS idx_collection_events_at ON collection_events(at);
                PRAGMA user_version = 4;
                ",
            )
            .map_err(|error| format!("app database collection schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database collection migration commit: {error}"))?;
    }

    if version < 5 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database statuses migration transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                CREATE TABLE IF NOT EXISTS collection_statuses (
                    id TEXT PRIMARY KEY,
                    label TEXT NOT NULL,
                    color TEXT NOT NULL,
                    order_index INTEGER NOT NULL,
                    is_core INTEGER NOT NULL DEFAULT 0
                );
                INSERT OR IGNORE INTO collection_statuses (id, label, color, order_index, is_core) VALUES
                    ('favorites','Favorites','#ec4899',0,1),
                    ('planned','Planned','#9ca3af',1,1),
                    ('watching','Watching','#3b82f6',2,1),
                    ('completed','Completed','#22c55e',3,1),
                    ('paused','Paused','#f59e0b',4,1),
                    ('dropped','Dropped','#ef4444',5,1),
                    ('rewatching','Rewatching','#a855f7',6,1);
                CREATE TABLE collection_items_v5 (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    alt_titles_json TEXT NOT NULL DEFAULT '[]',
                    type TEXT NOT NULL CHECK(type IN ('anime','movie','series','custom')),
                    status TEXT NOT NULL,
                    progress_value INTEGER NOT NULL DEFAULT 0,
                    progress_total INTEGER,
                    progress_unit TEXT NOT NULL CHECK(progress_unit IN ('episodes','seasons','minutes','pages')),
                    duration_minutes INTEGER,
                    rating INTEGER CHECK(rating BETWEEN 0 AND 10),
                    priority TEXT NOT NULL CHECK(priority IN ('low','normal','high')),
                    is_favorite INTEGER NOT NULL DEFAULT 0,
                    year INTEGER,
                    genres_json TEXT NOT NULL DEFAULT '[]',
                    studio TEXT,
                    description TEXT,
                    notes TEXT,
                    cover_url TEXT,
                    cover_blob_id TEXT,
                    thumb_blob_id TEXT,
                    external_ids_json TEXT NOT NULL DEFAULT '{}',
                    custom_fields_json TEXT NOT NULL DEFAULT '{}',
                    local_path TEXT,
                    local_kind TEXT CHECK(local_kind IN ('file','folder')),
                    started_at INTEGER,
                    finished_at INTEGER,
                    last_watched_at INTEGER,
                    rewatch_count INTEGER NOT NULL DEFAULT 0,
                    added_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                INSERT INTO collection_items_v5 (
                    id, title, alt_titles_json, type, status, progress_value, progress_total,
                    progress_unit, duration_minutes, rating, priority, is_favorite, year,
                    genres_json, studio, description, notes, cover_url, cover_blob_id,
                    thumb_blob_id, external_ids_json, custom_fields_json, local_path, local_kind,
                    started_at, finished_at, last_watched_at, rewatch_count, added_at, updated_at
                )
                SELECT
                    id, title, alt_titles_json, type, status, progress_value, progress_total,
                    progress_unit, duration_minutes, rating, priority, is_favorite, year,
                    genres_json, studio, description, notes, cover_url, cover_blob_id,
                    thumb_blob_id, external_ids_json, custom_fields_json, local_path, local_kind,
                    started_at, finished_at, last_watched_at, rewatch_count, added_at, updated_at
                FROM collection_items;
                DROP TABLE collection_items;
                ALTER TABLE collection_items_v5 RENAME TO collection_items;
                CREATE TRIGGER IF NOT EXISTS trg_collection_items_fts_insert
                AFTER INSERT ON collection_items BEGIN
                    INSERT INTO collection_items_fts(rowid, title, alt_titles_json, description, notes, genres_json, studio)
                    VALUES (new.rowid, new.title, new.alt_titles_json, new.description, new.notes, new.genres_json, new.studio);
                END;
                CREATE TRIGGER IF NOT EXISTS trg_collection_items_fts_update
                AFTER UPDATE ON collection_items BEGIN
                    DELETE FROM collection_items_fts WHERE rowid = old.rowid;
                    INSERT INTO collection_items_fts(rowid, title, alt_titles_json, description, notes, genres_json, studio)
                    VALUES (new.rowid, new.title, new.alt_titles_json, new.description, new.notes, new.genres_json, new.studio);
                END;
                CREATE TRIGGER IF NOT EXISTS trg_collection_items_fts_delete
                AFTER DELETE ON collection_items BEGIN
                    DELETE FROM collection_items_fts WHERE rowid = old.rowid;
                END;
                CREATE INDEX IF NOT EXISTS idx_collection_items_status ON collection_items(status);
                CREATE INDEX IF NOT EXISTS idx_collection_items_rating ON collection_items(rating);
                CREATE INDEX IF NOT EXISTS idx_collection_items_year ON collection_items(year);
                CREATE INDEX IF NOT EXISTS idx_collection_items_favorite ON collection_items(is_favorite);
                PRAGMA user_version = 5;
                ",
            )
            .map_err(|error| format!("app database statuses schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database statuses migration commit: {error}"))?;
    }

    if version < 6 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database fts trigger fix transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                DROP TRIGGER IF EXISTS trg_collection_items_fts_update;
                DROP TRIGGER IF EXISTS trg_collection_items_fts_delete;
                CREATE TRIGGER trg_collection_items_fts_update
                AFTER UPDATE ON collection_items BEGIN
                    DELETE FROM collection_items_fts WHERE rowid = old.rowid;
                    INSERT INTO collection_items_fts(rowid, title, alt_titles_json, description, notes, genres_json, studio)
                    VALUES (new.rowid, new.title, new.alt_titles_json, new.description, new.notes, new.genres_json, new.studio);
                END;
                CREATE TRIGGER trg_collection_items_fts_delete
                AFTER DELETE ON collection_items BEGIN
                    DELETE FROM collection_items_fts WHERE rowid = old.rowid;
                END;
                DROP TRIGGER IF EXISTS trg_unified_index_fts_update;
                DROP TRIGGER IF EXISTS trg_unified_index_fts_delete;
                CREATE TRIGGER trg_unified_index_fts_update
                AFTER UPDATE OF normalized_value ON unified_index BEGIN
                    DELETE FROM unified_index_fts WHERE rowid = old.rowid;
                    INSERT INTO unified_index_fts(rowid, normalized_value)
                    VALUES (new.rowid, new.normalized_value);
                END;
                CREATE TRIGGER trg_unified_index_fts_delete
                AFTER DELETE ON unified_index BEGIN
                    DELETE FROM unified_index_fts WHERE rowid = old.rowid;
                END;
                PRAGMA user_version = 6;
                ",
            )
            .map_err(|error| format!("app database fts trigger fix schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database fts trigger fix commit: {error}"))?;
    }

    if version < 7 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database collections removal transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                DROP TABLE IF EXISTS collection_members;
                DROP TABLE IF EXISTS collection_lists;
                PRAGMA user_version = 7;
                ",
            )
            .map_err(|error| format!("app database collections removal schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database collections removal commit: {error}"))?;
    }

    if version < 8 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database vault removal transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                DROP TABLE IF EXISTS media_records;
                PRAGMA user_version = 8;
                ",
            )
            .map_err(|error| format!("app database vault removal schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database vault removal commit: {error}"))?;
    }

    if version < 9 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database tracker parity transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                ALTER TABLE collection_items ADD COLUMN sites_to_view TEXT NOT NULL DEFAULT '[]';
                ALTER TABLE collection_items ADD COLUMN tv_current_season INTEGER;
                ALTER TABLE collection_items ADD COLUMN tv_current_episode INTEGER;
                ALTER TABLE collection_items ADD COLUMN details_json TEXT;
                PRAGMA user_version = 9;
                ",
            )
            .map_err(|error| format!("app database tracker parity schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database tracker parity commit: {error}"))?;
    }

    if version < 10 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database embeddings transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                CREATE TABLE IF NOT EXISTS unified_index_vec (
                    id TEXT PRIMARY KEY,
                    embedding BLOB NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                PRAGMA user_version = 10;
                ",
            )
            .map_err(|error| format!("app database embeddings schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database embeddings commit: {error}"))?;
    }
    if version < 11 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database favorites status transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                UPDATE collection_statuses SET order_index = order_index + 1
                    WHERE id IN ('planned','watching','completed','paused','dropped','rewatching');
                INSERT OR IGNORE INTO collection_statuses (id, label, color, order_index, is_core) VALUES
                    ('favorites','Favorites','#ec4899',0,1);
                PRAGMA user_version = 11;
                ",
            )
            .map_err(|error| format!("app database favorites status schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database favorites status commit: {error}"))?;
    }
    if version < 12 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database dead tables transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                DROP TABLE IF EXISTS collection_events;
                DROP TABLE IF EXISTS release_analysis;
                DROP TABLE IF EXISTS anime_statistics;
                DROP TABLE IF EXISTS playback_events;
                DROP TABLE IF EXISTS room_sessions;
                PRAGMA user_version = 12;
                ",
            )
            .map_err(|error| format!("app database dead tables schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database dead tables commit: {error}"))?;
    }
    if version < 13 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database reviews removal transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                DROP TABLE IF EXISTS collection_reviews;
                PRAGMA user_version = 13;
                ",
            )
            .map_err(|error| format!("app database reviews removal schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database reviews removal commit: {error}"))?;
    }

    if version < 14 {
        let transaction = connection.unchecked_transaction().map_err(|error| {
            format!("app database release subscriptions removal transaction: {error}")
        })?;
        transaction
            .execute_batch(
                "
                DROP TABLE IF EXISTS release_subscriptions;
                DROP INDEX IF EXISTS idx_release_subscriptions_media;
                PRAGMA user_version = 14;
                ",
            )
            .map_err(|error| {
                format!("app database release subscriptions removal schema: {error}")
            })?;
        transaction.commit().map_err(|error| {
            format!("app database release subscriptions removal commit: {error}")
        })?;
    }

    if version < 15 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database updated_at timebase transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                UPDATE collection_items
                   SET updated_at = updated_at * 1000
                 WHERE updated_at >= 1000000000 AND updated_at < 100000000000;
                PRAGMA user_version = 15;
                ",
            )
            .map_err(|error| format!("app database updated_at timebase schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database updated_at timebase commit: {error}"))?;
    }

    if version > CURRENT_SCHEMA_VERSION {
        return Err(format!(
            "app database is newer than this application ({version} > {CURRENT_SCHEMA_VERSION})"
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    #[test]
    fn migration_creates_cache_and_metadata_tables() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema migration");
        let table_count: i64 = connection
            .query_row(
                "            SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('cache_entries', 'unified_index', 'collection_items', 'custom_field_defs')",
                [],
                |row| row.get(0),
            )
            .expect("table count");
        assert_eq!(table_count, 4);
        let vault_gone: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'media_records'",
                [],
                |row| row.get(0),
            )
            .expect("vault table gone");
        assert_eq!(vault_gone, 0);
    }
    #[test]
    fn media_records_table_is_dropped() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema migration");
        let count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'media_records'",
                [],
                |row| row.get(0),
            )
            .expect("read vault gone");
        assert_eq!(count, 0);
    }
    #[test]
    fn migration_v15_rewrites_seconds_scale_updated_at_to_milliseconds() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema migration");
        connection
            .execute(
                "INSERT INTO collection_items (
                    id, title, alt_titles_json, type, status, progress_value, progress_total,
                    progress_unit, duration_minutes, rating, priority, is_favorite, year,
                    genres_json, studio, description, notes, cover_url, cover_blob_id,
                    thumb_blob_id, external_ids_json, custom_fields_json, local_path, local_kind,
                    started_at, finished_at, last_watched_at, rewatch_count, added_at, updated_at
                 ) VALUES (
                    'item_sec', 'Serial Experiments Lain', '[]', 'anime', 'completed', 13, 13,
                    'episodes', 23, 10, 'normal', 0, 1998, '[\"Drama\"]', 'TV Tokyo', NULL, NULL,
                    NULL, NULL, NULL, '{\"anilist\":339}', '{}', NULL, NULL, NULL, NULL, NULL,
                    0, 1000, 1750000000
                 )",
                [],
            )
            .expect("insert item");
        connection
            .execute(
                "UPDATE collection_items SET updated_at = 1750000000000 WHERE id = 'item_sec'",
                [],
            )
            .expect("set ms row");
        connection
            .execute(
                "INSERT INTO collection_items (
                    id, title, alt_titles_json, type, status, progress_value, progress_total,
                    progress_unit, duration_minutes, rating, priority, is_favorite, year,
                    genres_json, studio, description, notes, cover_url, cover_blob_id,
                    thumb_blob_id, external_ids_json, custom_fields_json, local_path, local_kind,
                    started_at, finished_at, last_watched_at, rewatch_count, added_at, updated_at
                 ) VALUES (
                    'item_sec2', 'Ergo Proxy', '[]', 'anime', 'completed', 23, 23,
                    'episodes', 25, 9, 'normal', 0, 2006, '[\"Drama\"]', 'Manglobe', NULL, NULL,
                    NULL, NULL, NULL, '{\"anilist\":50}', '{}', NULL, NULL, NULL, NULL, NULL,
                    0, 1000, 1750000000
                 )",
                [],
            )
            .expect("insert seconds row");

        connection
            .pragma_update(None, "user_version", 14)
            .expect("rewind user version");
        initialize_schema(&connection).expect("rerun migrations");

        let ms: i64 = connection
            .query_row(
                "SELECT updated_at FROM collection_items WHERE id = 'item_sec'",
                [],
                |row| row.get(0),
            )
            .expect("read ms row");
        assert_eq!(ms, 1_750_000_000_000, "ms-scale row untouched");
        let seconds: i64 = connection
            .query_row(
                "SELECT updated_at FROM collection_items WHERE id = 'item_sec2'",
                [],
                |row| row.get(0),
            )
            .expect("read seconds row");
        assert_eq!(
            seconds, 1_750_000_000_000,
            "seconds-scale row rewritten to ms"
        );
    }
}