// Player tab folder-scan latency bench.
//
// Models what the Player tab does to a saved folder library today:
//   1. cached folder trees trigger `rebuild_file_index` (one full walk),
//   2. `scan_video_folders` walks every saved root again for the tree,
//   3. the post-scan `rebuild_file_index` walks every root a third time,
//   4. each rebuild also persists the whole index to SQLite.
//
// The walk itself is measured through the exact production function
// (`walk_player_folder` below calls `walk_video_folder`), and the index /
// persistence pieces use the real `FileIndexer` and unified-index functions.
// The "optimized" walk variants only exist in this bench to price candidate
// changes (one metadata source instead of two, one pass instead of three).
//
// Run with:
//   cargo bench --manifest-path src-tauri/Cargo.toml --features bench-api --bench player_scan_latency

use std::collections::HashSet;
use std::hint::black_box;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use iluhaanime_lib::benchmark_api::{initialize_schema, player_scan, unified_index, FileIndexer};

const ROOTS: usize = 3;
const SEASONS_PER_ROOT: usize = 30;
const VIDEOS_PER_SEASON: usize = 80;
const OTHER_PER_SEASON: usize = 30;
const EXTENSIONS: [&str; 5] = ["mkv", "mp4", "avi", "mov", "webm"];
const RUNS: usize = 3;

fn extension_list() -> Vec<String> {
    EXTENSIONS
        .iter()
        .map(|value| (*value).to_string())
        .collect()
}

fn extension_set() -> HashSet<String> {
    EXTENSIONS
        .iter()
        .map(|value| (*value).to_string())
        .collect()
}

fn fixture_root() -> PathBuf {
    std::env::temp_dir().join(format!("iluha_player_scan_bench_{}", std::process::id()))
}

fn build_fixture(root: &Path) {
    if root.join("root-0").is_dir() {
        return;
    }
    for root_index in 0..ROOTS {
        for season in 0..SEASONS_PER_ROOT {
            let dir = root
                .join(format!("root-{root_index}"))
                .join(format!("Show {season:02}"));
            std::fs::create_dir_all(&dir).expect("bench fixture dir");
            for episode in 0..VIDEOS_PER_SEASON {
                let name = format!("[Group] Show S{season:02}E{episode:03} [1080p].mkv");
                std::fs::write(dir.join(name), b"x").expect("bench fixture video");
            }
            for other in 0..OTHER_PER_SEASON {
                std::fs::write(dir.join(format!("note_{other:02}.nfo")), b"x")
                    .expect("bench fixture side file");
            }
        }
    }
}

fn median_ms(mut samples: Vec<Duration>) -> f64 {
    samples.sort_unstable();
    samples[samples.len() / 2].as_secs_f64() * 1000.0
}

fn min_ms(samples: &[Duration]) -> f64 {
    samples
        .iter()
        .copied()
        .min()
        .unwrap_or_default()
        .as_secs_f64()
        * 1000.0
}

fn bench(name: &str, runs: usize, mut run: impl FnMut() -> usize) -> f64 {
    let mut samples = Vec::with_capacity(runs);
    let mut hits = 0usize;
    for _ in 0..runs {
        let started = Instant::now();
        hits = black_box(run());
        samples.push(started.elapsed());
    }
    let median = median_ms(samples.clone());
    println!(
        "{name:<52} median {median:>8.2} ms  min {:>8.2} ms  n={hits}",
        min_ms(&samples)
    );
    median
}

#[derive(Clone, Copy)]
enum ExtMatch {
    Linear,
    Set,
}

#[derive(Clone, Copy)]
enum SizeSource {
    EntryMetadata,
    PathMetadata,
}

/// Candidate walk: same jwalk shape, but one metadata source and optional
/// extension set. This is bench-only; production still calls
/// `walk_video_folder` through `player_scan`.
fn walk_optimized(root: &Path, ext_match: ExtMatch, size_source: SizeSource) -> (usize, u64) {
    let list = extension_list();
    let set = extension_set();
    let mut hits = 0usize;
    let mut bytes = 0u64;
    for entry in jwalk::WalkDir::new(root)
        .follow_links(false)
        .skip_hidden(true)
    {
        let entry = entry.expect("bench walk entry");
        if entry.file_type().is_dir() {
            continue;
        }
        let path = entry.path();
        let Some(extension) = path.extension().and_then(|value| value.to_str()) else {
            continue;
        };
        let matches = match ext_match {
            ExtMatch::Linear => list
                .iter()
                .any(|known| extension.eq_ignore_ascii_case(known)),
            ExtMatch::Set => set.contains(&extension.to_ascii_lowercase()),
        };
        if !matches {
            continue;
        }
        let size = match size_source {
            SizeSource::EntryMetadata => entry.metadata().expect("entry metadata").len(),
            SizeSource::PathMetadata => std::fs::metadata(&path).expect("path metadata").len(),
        };
        hits += 1;
        bytes += size;
    }
    (hits, bytes)
}

#[derive(serde::Serialize)]
struct ScanEntry<'a> {
    path: &'a str,
    name: &'a str,
    size: u64,
}

fn now_seconds() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn main() {
    let root = fixture_root();
    build_fixture(&root);
    let roots: Vec<String> = (0..ROOTS)
        .map(|index| {
            root.join(format!("root-{index}"))
                .to_string_lossy()
                .to_string()
        })
        .collect();
    let expected_videos = ROOTS * SEASONS_PER_ROOT * VIDEOS_PER_SEASON;
    let expected_files = ROOTS * SEASONS_PER_ROOT * (VIDEOS_PER_SEASON + OTHER_PER_SEASON);
    println!(
        "fixture: roots={ROOTS} dirs={} files={expected_files} videos={expected_videos}",
        ROOTS * SEASONS_PER_ROOT
    );

    // Warm the directory cache once, like a second app start.
    let warm = player_scan::walk_player_folder(&roots[0], extension_list(), 0);
    println!(
        "prod walk root-0: files={} skipped={} progress_events={}",
        warm.files, warm.skipped, warm.progress_events
    );

    let mut prod_scan_ms = 0.0;
    for root_path in &roots {
        prod_scan_ms += bench(
            &format!(
                "prod scan_video_folder {}",
                root_path.rsplit('/').next().unwrap_or(root_path)
            ),
            RUNS,
            || player_scan::walk_player_folder(root_path, extension_list(), 0).files,
        );
    }

    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .expect("bench tokio runtime");
    let indexer = FileIndexer::new();
    let mut rebuild_samples = Vec::with_capacity(RUNS);
    for run in 0..RUNS {
        let started = Instant::now();
        runtime
            .block_on(indexer.rebuild(roots.clone(), extension_list(), 0))
            .expect("index rebuild");
        let elapsed = started.elapsed();
        println!(
            "index rebuild_file_index run {}: {:.2} ms",
            run + 1,
            elapsed.as_secs_f64() * 1000.0
        );
        rebuild_samples.push(elapsed);
    }
    let rebuild_ms = median_ms(rebuild_samples.clone());
    println!(
        "index rebuild median {rebuild_ms:.2} ms  min {:.2} ms",
        min_ms(&rebuild_samples)
    );

    let snapshot = runtime.block_on(indexer.snapshot());
    println!("index entries: {}", snapshot.len());

    let rows: Vec<unified_index::UnifiedIndexEntryInput> = snapshot
        .iter()
        .map(|entry| unified_index::UnifiedIndexEntryInput {
            id: format!("local:{}", entry.path),
            kind: "local_file".to_string(),
            scope: "player".to_string(),
            value: entry.name().to_string(),
            subtitle: Some(entry.path.to_string()),
            metadata: Some(serde_json::json!({ "size": entry.size })),
            bump_use: false,
        })
        .collect();

    let db_path = root.join("player_index_bench.sqlite3");
    let _ = std::fs::remove_file(&db_path);
    let mut persist_samples = Vec::with_capacity(RUNS);
    for run in 0..RUNS {
        let started = Instant::now();
        let mut connection = rusqlite::Connection::open(&db_path).expect("bench index database");
        initialize_schema(&connection).expect("bench index schema");
        let transaction = connection.transaction().expect("bench index transaction");
        let now = now_seconds();
        for chunk in rows.chunks(5_000) {
            unified_index::upsert_unified_index_batch(&transaction, chunk, now)
                .expect("bench index upsert");
        }
        let keep: HashSet<&str> = rows.iter().map(|row| row.id.as_str()).collect();
        unified_index::prune_unified_index_scope_inner(&transaction, "player", &keep)
            .expect("bench index prune");
        transaction.commit().expect("bench index commit");
        let elapsed = started.elapsed();
        println!(
            "persist_file_index run {}: {:.2} ms",
            run + 1,
            elapsed.as_secs_f64() * 1000.0
        );
        persist_samples.push(elapsed);
    }
    let persist_ms = median_ms(persist_samples);
    let db_bytes = std::fs::metadata(&db_path).map_or(0, |meta| meta.len());
    println!(
        "persist_file_index median {persist_ms:.2} ms  db={:.1} MiB",
        db_bytes as f64 / (1024.0 * 1024.0)
    );

    let scan_entries: Vec<ScanEntry> = snapshot
        .iter()
        .map(|entry| ScanEntry {
            path: &entry.path,
            name: entry.name(),
            size: entry.size,
        })
        .collect();
    let payload_bytes = serde_json::to_vec(&scan_entries)
        .expect("bench scan json")
        .len();
    bench("scan result JSON encode", 5, || {
        serde_json::to_vec(&scan_entries)
            .expect("bench scan json")
            .len()
    });
    println!(
        "scan result payload: {} entries, {:.2} MiB JSON",
        scan_entries.len(),
        payload_bytes as f64 / (1024.0 * 1024.0)
    );

    // One root keeps the candidate comparison cheap and directly comparable
    // with the per-root production number above.
    let one_root = root.join("root-0");
    bench("optimized walk: entry.metadata + linear", RUNS, || {
        walk_optimized(&one_root, ExtMatch::Linear, SizeSource::EntryMetadata).0
    });
    bench("optimized walk: entry.metadata + hashset", RUNS, || {
        walk_optimized(&one_root, ExtMatch::Set, SizeSource::EntryMetadata).0
    });
    bench("candidate walk: path.metadata + linear", RUNS, || {
        walk_optimized(&one_root, ExtMatch::Linear, SizeSource::PathMetadata).0
    });
    bench("candidate walk: path.metadata + hashset", RUNS, || {
        walk_optimized(&one_root, ExtMatch::Set, SizeSource::PathMetadata).0
    });

    let current_startup = rebuild_ms + prod_scan_ms + rebuild_ms + persist_ms * 2.0;
    let single_pass_startup = prod_scan_ms + persist_ms;
    println!(
        "startup projection: current={current_startup:.2} ms \
         (rebuild + scan + rebuild + 2 persists), single-pass={single_pass_startup:.2} ms, \
         ratio={:.2}x",
        current_startup / single_pass_startup.max(0.01)
    );

    let _ = std::fs::remove_dir_all(&root);
}
