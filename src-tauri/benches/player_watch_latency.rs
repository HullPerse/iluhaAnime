// Player watch-read latency bench.
//
// `player_load_watch` is what the player calls after `file-loaded` to recover
// the position/duration of the current file. The command opens its own SQLite
// connection, runs `initialize_schema`, selects the cache row and parses the
// JSON. This bench measures each step on a realistic app database, including
// the case where a large index write (`persist_file_index`) is in flight.
//
// Run with:
//   cargo bench --manifest-path src-tauri/Cargo.toml --features bench-api --bench player_watch_latency

use std::hint::black_box;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use iluhaanime_lib::benchmark_api::{initialize_schema, unified_index};
use rusqlite::{params, Connection, OptionalExtension};

const CACHE_ROWS: usize = 100_000;
const INDEX_ROWS: usize = 20_000;
const RUNS: usize = 200;
const WATCH_NS: &str = "player";
const WATCH_KEY: &str = "watch:C:/Anime/Show/ep001.mkv";
const WATCH_PAYLOAD: &str = r#"{"position":123.456,"duration":1440.0,"updatedAt":1700000000}"#;

#[allow(dead_code)]
#[derive(serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct WatchState {
    position: f64,
    duration: f64,
    #[serde(default)]
    audio_delay: Option<f64>,
    #[serde(default)]
    sub_delay: Option<f64>,
    updated_at: i64,
}

fn fixture_path() -> PathBuf {
    std::env::temp_dir().join(format!(
        "iluha_player_watch_bench_{}.sqlite3",
        std::process::id()
    ))
}

fn now_seconds() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn seed(path: &Path) {
    let mut connection = Connection::open(path).expect("bench watch database");
    initialize_schema(&connection).expect("bench watch schema");

    let transaction = connection.transaction().expect("cache transaction");
    {
        let mut statement = transaction
            .prepare(
                "INSERT OR REPLACE INTO cache_entries
                    (namespace, cache_key, payload, expires_at, updated_at)
                 VALUES (?1, ?2, ?3, NULL, ?4)",
            )
            .expect("cache insert");
        for index in 0..CACHE_ROWS {
            let (namespace, key, payload) = if index % 1_000 == 0 {
                (
                    WATCH_NS,
                    format!("watch:C:/Anime/Show/ep{index:04}.mkv"),
                    WATCH_PAYLOAD.to_string(),
                )
            } else {
                (
                    "anilist_media",
                    format!("media-{index}"),
                    format!(
                        r#"{{"id":{index},"title":"Title {index}","cover":"https://example.com/{index}.jpg"}}"#
                    ),
                )
            };
            statement
                .execute(params![namespace, key, payload, index as i64])
                .expect("cache row");
        }
        statement
            .execute(params![WATCH_NS, WATCH_KEY, WATCH_PAYLOAD, now_seconds()])
            .expect("watch row");
    }
    transaction.commit().expect("cache commit");

    let rows: Vec<unified_index::UnifiedIndexEntryInput> = (0..INDEX_ROWS)
        .map(|index| unified_index::UnifiedIndexEntryInput {
            id: format!("local:C:/Anime/Show/ep{index:05}.mkv"),
            kind: "local_file".to_string(),
            scope: "player".to_string(),
            value: format!("Episode {index:05}.mkv"),
            subtitle: Some(format!("C:/Anime/Show/ep{index:05}.mkv")),
            metadata: Some(serde_json::json!({ "size": 350_u64 * 1024 * 1024 })),
            bump_use: false,
        })
        .collect();

    let transaction = connection.transaction().expect("index transaction");
    let now = now_seconds();
    for chunk in rows.chunks(5_000) {
        unified_index::upsert_unified_index_batch(&transaction, chunk, now).expect("index seed");
    }
    transaction.commit().expect("index commit");
    connection
        .execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")
        .expect("cache checkpoint");
}

fn fetch_watch(connection: &Connection) -> Option<WatchState> {
    let payload: Option<String> = connection
        .query_row(
            "SELECT payload FROM cache_entries
             WHERE namespace = ?1 AND cache_key = ?2",
            params![WATCH_NS, WATCH_KEY],
            |row| row.get(0),
        )
        .optional()
        .ok()?;
    let payload = payload?;
    serde_json::from_str(&payload).ok()
}

fn median_ms(mut samples: Vec<Duration>) -> f64 {
    samples.sort_unstable();
    samples[samples.len() / 2].as_secs_f64() * 1000.0
}

fn bench(name: &str, runs: usize, mut run: impl FnMut() -> usize) -> f64 {
    let mut samples = Vec::with_capacity(runs);
    let mut hits = 0usize;
    for _ in 0..runs {
        let started = Instant::now();
        hits = black_box(run());
        samples.push(started.elapsed());
    }
    let median = median_ms(samples);
    println!("{name:<50} median {median:>8.3} ms  n={hits}");
    median
}

fn main() {
    let path = fixture_path();
    let _ = std::fs::remove_file(&path);
    let _ = std::fs::remove_file(format!("{}-wal", path.to_string_lossy()));
    let _ = std::fs::remove_file(format!("{}-shm", path.to_string_lossy()));

    // Fresh database: this is what the first command after an app update pays.
    let fresh = path.with_extension("fresh.sqlite3");
    let _ = std::fs::remove_file(&fresh);
    let started = Instant::now();
    {
        let connection = Connection::open(&fresh).expect("fresh database");
        initialize_schema(&connection).expect("fresh schema");
    }
    println!(
        "fresh database: open + initialize_schema = {:.2} ms",
        started.elapsed().as_secs_f64() * 1000.0
    );
    let _ = std::fs::remove_file(&fresh);

    let seed_started = Instant::now();
    seed(&path);
    println!(
        "fixture: cache_rows={CACHE_ROWS} index_rows={INDEX_ROWS} seeded in {:.2} ms",
        seed_started.elapsed().as_secs_f64() * 1000.0
    );
    let db_bytes = std::fs::metadata(&path).map_or(0, |meta| meta.len());
    let wal_bytes =
        std::fs::metadata(format!("{}-wal", path.to_string_lossy())).map_or(0, |meta| meta.len());
    println!(
        "fixture size: db={:.1} MiB wal={:.1} MiB",
        db_bytes as f64 / (1024.0 * 1024.0),
        wal_bytes as f64 / (1024.0 * 1024.0)
    );

    let reader = Connection::open(&path).expect("reader database");
    let plan: String = reader
        .query_row(
            "EXPLAIN QUERY PLAN
             SELECT payload FROM cache_entries
             WHERE namespace = ?1 AND cache_key = ?2",
            params![WATCH_NS, WATCH_KEY],
            |row| row.get(3),
        )
        .expect("query plan");
    println!("cache query plan: {plan}");

    // Warm up every measured path once.
    let _ = fetch_watch(&reader);
    let _ = Connection::open(&path).expect("warm open");

    bench("Connection::open", RUNS, || {
        let connection = Connection::open(&path).expect("open");
        black_box(connection.is_autocommit()) as usize
    });
    bench("initialize_schema (existing db)", RUNS, || {
        initialize_schema(&reader).expect("schema");
        1
    });
    bench("SELECT watch payload", RUNS * 2, || {
        fetch_watch(&reader).map_or(0, |state| state.position as usize)
    });
    bench("JSON parse WatchState", RUNS * 5, || {
        serde_json::from_str::<WatchState>(WATCH_PAYLOAD)
            .expect("watch json")
            .duration as usize
    });
    bench("current player_load_watch path", RUNS, || {
        let connection = Connection::open(&path).expect("open");
        initialize_schema(&connection).expect("schema");
        fetch_watch(&connection).map_or(0, |state| state.position as usize)
    });
    bench("pooled connection + SELECT + parse", RUNS * 2, || {
        fetch_watch(&reader).map_or(0, |state| state.duration as usize)
    });

    // A writer mimicking `persist_file_index`: one big transaction on the same
    // database file. WAL lets readers through, but `open_database` also runs
    // `initialize_schema`, which sets journal_mode and may take the write lock.
    let preopened = Connection::open(&path).expect("pre-opened reader");
    let (ready_tx, ready_rx) = std::sync::mpsc::channel::<()>();
    let writer_path = path.clone();
    let writer = std::thread::spawn(move || {
        let connection = Connection::open(&writer_path).expect("writer database");
        initialize_schema(&connection).expect("writer schema");
        connection
            .execute_batch("BEGIN IMMEDIATE")
            .expect("begin writer transaction");
        {
            let mut statement = connection
                .prepare(
                    "INSERT INTO unified_index
                        (id, kind, scope, value, normalized_value, metadata_json, updated_at)
                     VALUES (?1, 'local_file', 'player', ?2, ?2, '{}', 0)",
                )
                .expect("writer insert");
            for index in 0..5_000 {
                statement
                    .execute(params![
                        format!("writer-{index}"),
                        format!("writer {index}")
                    ])
                    .expect("writer row");
            }
        }
        ready_tx.send(()).expect("writer ready");
        std::thread::sleep(Duration::from_millis(2_000));
        connection
            .execute_batch("ROLLBACK")
            .expect("writer rollback");
    });
    ready_rx.recv().expect("writer started");

    let started = Instant::now();
    let reader_result = fetch_watch(&preopened);
    println!(
        "pre-opened reader during writer txn: {:.2} ms result={}",
        started.elapsed().as_secs_f64() * 1000.0,
        reader_result.is_some()
    );

    let started = Instant::now();
    let full_result = (|| -> Result<Option<WatchState>, String> {
        let connection = Connection::open(&path).map_err(|error| error.to_string())?;
        initialize_schema(&connection)?;
        Ok(fetch_watch(&connection))
    })();
    println!(
        "open+initialize_schema+SELECT during writer txn: {:.2} ms result={}",
        started.elapsed().as_secs_f64() * 1000.0,
        full_result.as_ref().map_or(false, Option::is_some)
    );
    if let Err(error) = &full_result {
        println!("  read failed during writer txn: {error}");
    }

    writer.join().expect("writer thread");
    let started = Instant::now();
    let after = (|| -> Result<Option<WatchState>, String> {
        let connection = Connection::open(&path).map_err(|error| error.to_string())?;
        initialize_schema(&connection)?;
        Ok(fetch_watch(&connection))
    })();
    println!(
        "same read after writer rollback: {:.2} ms result={}",
        started.elapsed().as_secs_f64() * 1000.0,
        after.map_or(false, |state| state.is_some())
    );

    let _ = std::fs::remove_file(&path);
    let _ = std::fs::remove_file(format!("{}-wal", path.to_string_lossy()));
    let _ = std::fs::remove_file(format!("{}-shm", path.to_string_lossy()));
}
