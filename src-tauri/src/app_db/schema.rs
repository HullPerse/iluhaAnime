use rusqlite::Connection;
use std::time::Duration;

use super::db::CURRENT_SCHEMA_VERSION;

#[allow(clippy::too_many_lines)]
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

    if version < 16 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database release date transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                ALTER TABLE collection_items ADD COLUMN release_date TEXT;
                PRAGMA user_version = 16;
                ",
            )
            .map_err(|error| format!("app database release date schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database release date commit: {error}"))?;
    }
    if version < 17 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database embeddings removal transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                DROP TABLE IF EXISTS unified_index_vec;
                PRAGMA user_version = 17;
                ",
            )
            .map_err(|error| format!("app database embeddings removal schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database embeddings removal commit: {error}"))?;
    }

    if version < 18 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database fav people cache prune transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                DELETE FROM cache_entries WHERE namespace = 'fav_people';
                PRAGMA user_version = 18;
                ",
            )
            .map_err(|error| format!("app database fav people cache prune schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database fav people cache prune commit: {error}"))?;
    }

    if version < 19 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database status kind transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                ALTER TABLE collection_statuses ADD COLUMN kind TEXT NOT NULL DEFAULT 'private';
                PRAGMA user_version = 19;
                ",
            )
            .map_err(|error| format!("app database status kind schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database status kind commit: {error}"))?;
    }
    if version < 20 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database status kind rename transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                UPDATE collection_statuses SET kind = 'public' WHERE kind = 'share';
                UPDATE collection_statuses SET kind = 'private' WHERE kind = 'normal';
                PRAGMA user_version = 20;
                ",
            )
            .map_err(|error| format!("app database status kind rename schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database status kind rename commit: {error}"))?;
    }

    if version < 21 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database game roms transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                CREATE TABLE IF NOT EXISTS game_roms (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    platform TEXT NOT NULL DEFAULT 'chip8',
                    source TEXT NOT NULL DEFAULT 'user',
                    author TEXT,
                    license TEXT,
                    size INTEGER NOT NULL,
                    added_at INTEGER NOT NULL,
                    data BLOB NOT NULL
                );
                PRAGMA user_version = 21;
                ",
            )
            .map_err(|error| format!("app database game roms schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database game roms commit: {error}"))?;
    }

    if version < 22 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database unified index value transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                CREATE INDEX IF NOT EXISTS idx_unified_index_normalized
                    ON unified_index (normalized_value);
                PRAGMA user_version = 22;
                ",
            )
            .map_err(|error| format!("app database unified index value schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database unified index value commit: {error}"))?;
    }

    if version < 23 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database streaming support transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                PRAGMA user_version = 23;
                ",
            )
            .map_err(|error| format!("app database streaming support schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database streaming support commit: {error}"))?;
    }

    if version < 24 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database stream history transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                -- v24 has never shipped, so a half-created table from an
                -- interrupted dev run is the only thing this can find. It
                -- would make the indexes below fail on a missing column;
                -- recreating it is safe because no released build wrote rows.
                DROP TABLE IF EXISTS stream_history;
                CREATE TABLE IF NOT EXISTS stream_history (
                    anime_id TEXT NOT NULL,
                    episode_id TEXT NOT NULL,
                    slug TEXT NOT NULL,
                    title TEXT NOT NULL,
                    cover TEXT,
                    anilist_id INTEGER,
                    episode_number INTEGER NOT NULL DEFAULT 0,
                    episode_title TEXT,
                    episode_cover TEXT,
                    position REAL NOT NULL DEFAULT 0,
                    duration REAL NOT NULL DEFAULT 0,
                    updated_at INTEGER NOT NULL,
                    PRIMARY KEY (anime_id, episode_id)
                );
                CREATE INDEX IF NOT EXISTS idx_stream_history_updated
                    ON stream_history (updated_at DESC);
                CREATE INDEX IF NOT EXISTS idx_stream_history_anime
                    ON stream_history (anime_id, episode_number);
                PRAGMA user_version = 24;
                ",
            )
            .map_err(|error| format!("app database stream history schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database stream history commit: {error}"))?;
    }

    if version < 25 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database collection removal transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                DROP TRIGGER IF EXISTS trg_collection_items_fts_insert;
                DROP TRIGGER IF EXISTS trg_collection_items_fts_update;
                DROP TRIGGER IF EXISTS trg_collection_items_fts_delete;
                DROP TABLE IF EXISTS collection_items_fts;
                DROP TABLE IF EXISTS collection_items;
                DROP TABLE IF EXISTS collection_items_v5;
                DROP TABLE IF EXISTS collection_events;
                DROP TABLE IF EXISTS custom_field_defs;
                DROP TABLE IF EXISTS collection_statuses;
                PRAGMA user_version = 25;
                ",
            )
            .map_err(|error| format!("app database collection removal schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database collection removal commit: {error}"))?;
    }

    if version < 26 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database cards transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                CREATE TABLE IF NOT EXISTS card_packs (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    source TEXT NOT NULL CHECK(source IN ('status','starter','test','purchase')),
                    pack_kind TEXT NOT NULL CHECK(pack_kind IN ('default','character','anime','staff','studio')),
                    media_id INTEGER,
                    seed INTEGER NOT NULL,
                    size INTEGER NOT NULL,
                    created_at INTEGER NOT NULL,
                    opened_at INTEGER
                );
                CREATE TABLE IF NOT EXISTS user_cards (
                    user_id INTEGER NOT NULL,
                    kind TEXT NOT NULL CHECK(kind IN ('anime','character','staff','studio')),
                    entity_id INTEGER NOT NULL,
                    rarity TEXT NOT NULL CHECK(rarity IN ('junk','common','rare','epic','legendary')),
                    variant TEXT NOT NULL CHECK(variant IN ('normal','foil','holo')),
                    copies INTEGER NOT NULL DEFAULT 1,
                    value INTEGER NOT NULL,
                    first_obtained_at INTEGER NOT NULL,
                    last_obtained_at INTEGER NOT NULL,
                    PRIMARY KEY (user_id, kind, entity_id, rarity, variant)
                );
                CREATE TABLE IF NOT EXISTS card_meta (
                    kind TEXT NOT NULL,
                    entity_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    image_url TEXT,
                    score INTEGER,
                    popularity INTEGER,
                    favourites INTEGER,
                    collection_anime_id INTEGER,
                    collection_title TEXT,
                    collection_cover_url TEXT,
                    collage_json TEXT,
                    fetched_at INTEGER NOT NULL,
                    PRIMARY KEY (kind, entity_id)
                );
                CREATE TABLE IF NOT EXISTS pack_grants (
                    user_id INTEGER NOT NULL,
                    media_id INTEGER NOT NULL,
                    granted_at INTEGER NOT NULL,
                    PRIMARY KEY (user_id, media_id)
                );
                CREATE TABLE IF NOT EXISTS starter_grants (
                    user_id INTEGER PRIMARY KEY,
                    packs INTEGER NOT NULL,
                    granted_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS card_openings (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    pack_id TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    entity_id INTEGER NOT NULL,
                    rarity TEXT NOT NULL,
                    variant TEXT NOT NULL,
                    at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS user_wallet (
                    user_id INTEGER PRIMARY KEY,
                    chubriks INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS chubrik_ledger (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    amount INTEGER NOT NULL,
                    reason TEXT NOT NULL,
                    at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS card_gifts (
                    id TEXT PRIMARY KEY,
                    from_user INTEGER NOT NULL,
                    kind TEXT NOT NULL,
                    entity_id INTEGER NOT NULL,
                    rarity TEXT NOT NULL,
                    variant TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    claimed_at INTEGER
                );
                CREATE INDEX IF NOT EXISTS idx_card_packs_user ON card_packs(user_id, opened_at);
                CREATE INDEX IF NOT EXISTS idx_user_cards_user ON user_cards(user_id, kind, rarity);
                CREATE INDEX IF NOT EXISTS idx_card_openings_user ON card_openings(user_id, at);
                CREATE INDEX IF NOT EXISTS idx_chubrik_ledger_user ON chubrik_ledger(user_id, at);
                CREATE INDEX IF NOT EXISTS idx_card_meta_collection ON card_meta(collection_anime_id);
                PRAGMA user_version = 26;
                ",
            )
            .map_err(|error| format!("app database cards schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database cards commit: {error}"))?;
    }

    if version < 27 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database manga cards transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                CREATE TABLE user_cards_v27 (
                    user_id INTEGER NOT NULL,
                    kind TEXT NOT NULL CHECK(kind IN ('anime','manga','character','staff','studio')),
                    entity_id INTEGER NOT NULL,
                    rarity TEXT NOT NULL CHECK(rarity IN ('junk','common','rare','epic','legendary')),
                    variant TEXT NOT NULL CHECK(variant IN ('normal','foil','holo')),
                    copies INTEGER NOT NULL DEFAULT 1,
                    value INTEGER NOT NULL,
                    first_obtained_at INTEGER NOT NULL,
                    last_obtained_at INTEGER NOT NULL,
                    PRIMARY KEY (user_id, kind, entity_id, rarity, variant)
                );
                INSERT INTO user_cards_v27
                    SELECT user_id, kind, entity_id, rarity, variant, copies, value,
                           first_obtained_at, last_obtained_at FROM user_cards;
                DROP TABLE user_cards;
                ALTER TABLE user_cards_v27 RENAME TO user_cards;
                CREATE INDEX IF NOT EXISTS idx_user_cards_user ON user_cards(user_id, kind, rarity);

                CREATE TABLE card_packs_v27 (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    source TEXT NOT NULL CHECK(source IN ('status','starter','test','purchase')),
                    pack_kind TEXT NOT NULL CHECK(pack_kind IN ('default','character','anime','manga','staff','studio')),
                    media_id INTEGER,
                    seed INTEGER NOT NULL,
                    size INTEGER NOT NULL,
                    created_at INTEGER NOT NULL,
                    opened_at INTEGER
                );
                INSERT INTO card_packs_v27
                    SELECT id, user_id, source, pack_kind, media_id, seed, size, created_at, opened_at
                    FROM card_packs;
                DROP TABLE card_packs;
                ALTER TABLE card_packs_v27 RENAME TO card_packs;
                CREATE INDEX IF NOT EXISTS idx_card_packs_user ON card_packs(user_id, opened_at);
                PRAGMA user_version = 27;
                ",
            )
            .map_err(|error| format!("app database manga cards schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database manga cards commit: {error}"))?;
    }

    if version < 28 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database card preparation transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                ALTER TABLE card_packs ADD COLUMN contents_state TEXT NOT NULL DEFAULT 'pending';
                ALTER TABLE card_packs ADD COLUMN content_ready_at INTEGER;
                ALTER TABLE card_packs ADD COLUMN prepare_attempts INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE card_packs ADD COLUMN last_prepare_error TEXT;
                ALTER TABLE card_packs ADD COLUMN notified_at INTEGER;
                UPDATE card_packs
                   SET contents_state = 'ready', content_ready_at = opened_at
                 WHERE opened_at IS NOT NULL;
                CREATE TABLE IF NOT EXISTS card_pack_cards (
                    pack_id TEXT NOT NULL REFERENCES card_packs(id) ON DELETE CASCADE,
                    slot INTEGER NOT NULL,
                    kind TEXT NOT NULL CHECK(kind IN ('anime','manga','character','staff','studio')),
                    entity_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    image_url TEXT,
                    rarity TEXT NOT NULL CHECK(rarity IN ('junk','common','rare','epic','legendary')),
                    variant TEXT NOT NULL CHECK(variant IN ('normal','foil','holo')),
                    value INTEGER NOT NULL,
                    favourites INTEGER NOT NULL DEFAULT 0,
                    popularity INTEGER NOT NULL DEFAULT 0,
                    score REAL NOT NULL DEFAULT 0,
                    collage_json TEXT NOT NULL DEFAULT '[]',
                    collection_anime_id INTEGER,
                    collection_title TEXT,
                    collection_cover_url TEXT,
                    PRIMARY KEY (pack_id, slot)
                );
                CREATE INDEX IF NOT EXISTS idx_card_packs_prepare
                    ON card_packs (user_id, opened_at, contents_state, prepare_attempts);
                PRAGMA user_version = 28;
                ",
            )
            .map_err(|error| format!("app database card preparation schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database card preparation commit: {error}"))?;
    }

    if version < 29 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database manga collection transaction: {error}"))?;
        let has_manga_column: i64 = transaction
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('card_meta')
                 WHERE name = 'collection_manga_id'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| format!("read manga collection column: {error}"))?;
        if has_manga_column == 0 {
            transaction
                .execute_batch("ALTER TABLE card_meta ADD COLUMN collection_manga_id INTEGER;")
                .map_err(|error| format!("add manga collection column: {error}"))?;
        }
        transaction
            .execute_batch(
                "
                CREATE INDEX IF NOT EXISTS idx_card_meta_manga_collection
                    ON card_meta(collection_manga_id);
                PRAGMA user_version = 29;
                ",
            )
            .map_err(|error| format!("app database manga collection schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database manga collection commit: {error}"))?;
    }

    if version < 30 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database preferred variant transaction: {error}"))?;
        transaction
            .execute_batch(
                "
                CREATE TABLE IF NOT EXISTS card_preferred_variant (
                    kind TEXT NOT NULL CHECK(kind IN ('anime','manga','character','staff','studio')),
                    entity_id INTEGER NOT NULL,
                    variant TEXT NOT NULL CHECK(variant IN ('normal','foil','holo')),
                    PRIMARY KEY (kind, entity_id)
                );
                PRAGMA user_version = 30;
                ",
            )
            .map_err(|error| format!("app database preferred variant schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database preferred variant commit: {error}"))?;
    }

    if version < 31 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database gift value transaction: {error}"))?;
        let has_value: i64 = transaction
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('card_gifts') WHERE name = 'value'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| format!("read gift value column: {error}"))?;
        if has_value == 0 {
            transaction
                .execute(
                    "ALTER TABLE card_gifts ADD COLUMN value INTEGER NOT NULL DEFAULT 0",
                    [],
                )
                .map_err(|error| format!("add gift value column: {error}"))?;
        }
        transaction
            .execute_batch(
                "
                CREATE TABLE IF NOT EXISTS card_gift_claims (
                    gift_id TEXT PRIMARY KEY,
                    kind TEXT NOT NULL CHECK(kind IN ('anime','manga','character','staff','studio')),
                    entity_id INTEGER NOT NULL,
                    rarity TEXT NOT NULL CHECK(rarity IN ('junk','common','rare','epic','legendary')),
                    variant TEXT NOT NULL CHECK(variant IN ('normal','foil','holo')),
                    value INTEGER NOT NULL,
                    claimed_at INTEGER NOT NULL
                );
                PRAGMA user_version = 31;
                ",
            )
            .map_err(|error| format!("app database gift value schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database gift value commit: {error}"))?;
    }

    if version < 32 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database card gallery transaction: {error}"))?;
        let has_preferred_image: i64 = transaction
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('card_meta')
                 WHERE name = 'preferred_image_url'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| format!("read preferred card image column: {error}"))?;
        if has_preferred_image == 0 {
            transaction
                .execute(
                    "ALTER TABLE card_meta ADD COLUMN preferred_image_url TEXT",
                    [],
                )
                .map_err(|error| format!("add preferred card image column: {error}"))?;
        }
        transaction
            .execute_batch(
                "
                CREATE TABLE IF NOT EXISTS card_gallery (
                    kind TEXT NOT NULL CHECK(kind IN ('anime','manga','character')),
                    entity_id INTEGER NOT NULL,
                    mal_id INTEGER,
                    media_mal_id INTEGER,
                    images_json TEXT NOT NULL DEFAULT '[]',
                    fetched_at INTEGER NOT NULL,
                    PRIMARY KEY (kind, entity_id)
                );
                PRAGMA user_version = 32;
                ",
            )
            .map_err(|error| format!("app database card gallery schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database card gallery commit: {error}"))?;
    }

    if version < 33 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database gift stack transaction: {error}"))?;
        let has_cards_json: i64 = transaction
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('card_gifts') WHERE name = 'cards_json'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| format!("read gift cards column: {error}"))?;
        if has_cards_json == 0 {
            transaction
                .execute("ALTER TABLE card_gifts ADD COLUMN cards_json TEXT", [])
                .map_err(|error| format!("add gift cards column: {error}"))?;
        }
        transaction
            .execute_batch("PRAGMA user_version = 33;")
            .map_err(|error| format!("app database gift stack schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database gift stack commit: {error}"))?;
    }

    if version < 34 {
        let transaction = connection
            .unchecked_transaction()
            .map_err(|error| format!("app database card favorites transaction: {error}"))?;
        let has_favorite: i64 = transaction
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('user_cards') WHERE name = 'is_favorite'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| format!("read card favorite column: {error}"))?;
        if has_favorite == 0 {
            transaction
                .execute(
                    "ALTER TABLE user_cards ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0",
                    [],
                )
                .map_err(|error| format!("add card favorite column: {error}"))?;
        }
        transaction
            .execute_batch(
                "CREATE INDEX IF NOT EXISTS idx_user_cards_favorite
                    ON user_cards(user_id, is_favorite);
                 PRAGMA user_version = 34;",
            )
            .map_err(|error| format!("app database card favorite schema: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("app database card favorite commit: {error}"))?;
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
        assert_eq!(table_count, 2);
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
    fn embeddings_vec_table_is_dropped() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema migration");
        let count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'unified_index_vec'",
                [],
                |row| row.get(0),
            )
            .expect("read vec gone");
        assert_eq!(count, 0);
        let version: i64 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("read user version");
        assert_eq!(version, CURRENT_SCHEMA_VERSION);
    }
    #[test]
    fn migration_v24_rebuilds_a_half_created_stream_history_table() {
        let connection = Connection::open_in_memory().expect("in-memory database");
        initialize_schema(&connection).expect("schema migration");
        // An interrupted v24 run left a table without `updated_at`; the
        // indexes below it would fail on that column and the app would not
        // start. No released build wrote rows, so the migration drops it.
        connection
            .execute_batch(
                "DROP TABLE IF EXISTS stream_history;
                 CREATE TABLE stream_history (anime_id TEXT NOT NULL, episode_id TEXT NOT NULL);",
            )
            .expect("create half-built table");
        connection
            .pragma_update(None, "user_version", 23)
            .expect("rewind user version");
        initialize_schema(&connection).expect("rerun migrations");
        let columns: Vec<String> = connection
            .prepare("PRAGMA table_info(stream_history)")
            .expect("read table info")
            .query_map([], |row| row.get(1))
            .expect("map table info")
            .collect::<Result<_, _>>()
            .expect("collect table info");
        assert!(columns.iter().any(|name| name == "updated_at"));
        let version: i64 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("read user version");
        assert_eq!(version, CURRENT_SCHEMA_VERSION);
    }
}
