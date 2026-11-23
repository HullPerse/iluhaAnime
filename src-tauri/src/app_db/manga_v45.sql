CREATE TABLE IF NOT EXISTS manga_statuses (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    color TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    is_core INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS manga_library_items (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    source_manga_id TEXT NOT NULL,
    source_url TEXT,
    title TEXT NOT NULL,
    alt_titles_json TEXT NOT NULL DEFAULT '[]',
    cover_url TEXT,
    content_rating TEXT NOT NULL DEFAULT 'safe',
    description TEXT,
    year INTEGER,
    format TEXT,
    country_of_origin TEXT,
    genres_json TEXT NOT NULL DEFAULT '[]',
    status_id TEXT NOT NULL REFERENCES manga_statuses(id),
    external_ids_json TEXT NOT NULL DEFAULT '{}',
    unread_count INTEGER NOT NULL DEFAULT 0,
    last_checked_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(source_id, source_manga_id)
);
CREATE INDEX IF NOT EXISTS idx_manga_library_status ON manga_library_items(status_id);

CREATE TABLE IF NOT EXISTS manga_chapters (
    item_id TEXT NOT NULL REFERENCES manga_library_items(id) ON DELETE CASCADE,
    source_chapter_id TEXT NOT NULL,
    volume TEXT,
    number REAL,
    number_label TEXT NOT NULL,
    chapter_key TEXT NOT NULL,
    title TEXT,
    language TEXT NOT NULL,
    group_id TEXT,
    group_name TEXT,
    page_count INTEGER,
    published_at INTEGER,
    is_locked INTEGER NOT NULL DEFAULT 0,
    lock_reason TEXT,
    available_at INTEGER,
    fetched_at INTEGER NOT NULL,
    PRIMARY KEY (item_id, source_chapter_id)
);
CREATE INDEX IF NOT EXISTS idx_manga_chapters_key ON manga_chapters(item_id, chapter_key);

CREATE TABLE IF NOT EXISTS manga_reading_positions (
    item_id TEXT PRIMARY KEY REFERENCES manga_library_items(id) ON DELETE CASCADE,
    chapter_id TEXT,
    chapter_key TEXT,
    page INTEGER NOT NULL DEFAULT 0,
    page_count INTEGER,
    scroll_offset REAL NOT NULL DEFAULT 0,
    mode TEXT,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS manga_chapter_reads (
    item_id TEXT NOT NULL REFERENCES manga_library_items(id) ON DELETE CASCADE,
    chapter_key TEXT NOT NULL,
    read_at INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',
    PRIMARY KEY (item_id, chapter_key)
);

CREATE TABLE IF NOT EXISTS manga_history (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES manga_library_items(id) ON DELETE CASCADE,
    chapter_id TEXT,
    chapter_key TEXT,
    opened_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_manga_history_opened ON manga_history(opened_at DESC);

CREATE TABLE IF NOT EXISTS manga_source_cache (
    source_id TEXT NOT NULL,
    cache_key TEXT NOT NULL,
    payload TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,
    expires_at INTEGER,
    PRIMARY KEY (source_id, cache_key)
);

CREATE TABLE IF NOT EXISTS manga_source_settings (
    source_id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 1,
    proxy_url TEXT,
    language TEXT,
    prefs_json TEXT NOT NULL DEFAULT '{}'
);

INSERT OR IGNORE INTO manga_statuses (id, label, color, order_index, is_core) VALUES
    ('reading', 'Читаю', 'highlight', 0, 1),
    ('completed', 'Прочитано', 'success', 1, 1),
    ('planned', 'В планах', 'text', 2, 1),
    ('on_hold', 'Пауза', 'warning', 3, 1),
    ('dropped', 'Брошено', 'destructive', 4, 1);

INSERT OR IGNORE INTO manga_source_settings (source_id, enabled, language) VALUES
    ('mangalib', 1, 'ru'),
    ('mangadex', 1, NULL),
    ('readmanga', 0, 'ru'),
    ('asurascans', 0, 'en'),
    ('wamanga', 0, 'ru');
