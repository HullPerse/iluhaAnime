// Offline benchmark for the stream history reads.
//
// The production commands open the real app database behind an AppHandle;
// `benchmark_api::stream_history` exposes the same SQL against an in-memory
// fixture built from the real schema (user_version 24). Measured here:
// - `recent(50)` and `recent(200)` — the "История просмотра" modal,
// - `for_anime` for a 1000 episode title — the detail modal's row states,
// - `progress` — the hover badge on a catalog card.
//
// Budget (Ryzen 7 5800X, release, 20k rows / 400 titles): recent(50) under
// 1 ms, recent(200) under 3 ms, for_anime under 1 ms, progress under 1 ms.
// The reads are all index-backed; a regression over budget means an index was
// dropped or the ORDER BY stopped using `idx_stream_history_updated`.
//
// Run: cargo bench --manifest-path src-tauri/Cargo.toml --bench stream_history

use std::hint::black_box;
use std::time::Instant;

use iluhaanime_lib::benchmark_api::stream_history as sh;

const ROWS: usize = 20_000;
const TITLES: usize = 400;

fn bench(name: &str, iterations: usize, mut run: impl FnMut() -> usize) {
    let mut hits = 0usize;
    let started = Instant::now();
    for _ in 0..iterations {
        hits += black_box(run());
    }
    let elapsed = started.elapsed();
    let per_us = elapsed.as_secs_f64() * 1_000_000.0 / iterations as f64;
    println!("{name}: iterations={iterations} total={elapsed:?} avg={per_us:.1}us hits={hits}");
}

fn main() {
    let connection = sh::open_fixture().expect("fixture database");
    sh::seed(&connection, ROWS, TITLES).expect("seed fixture");

    let count: i64 = connection
        .query_row("SELECT COUNT(*) FROM stream_history", [], |row| row.get(0))
        .expect("fixture count");
    println!("fixture: rows={count} titles={TITLES}");

    bench("recent(50)", 2_000, || {
        sh::recent_in(&connection, 50).expect("recent 50").len()
    });
    bench("recent(200)", 2_000, || {
        sh::recent_in(&connection, 200).expect("recent 200").len()
    });
    bench("for_anime(1000 rows)", 2_000, || {
        sh::for_anime_in(&connection, "0")
            .expect("episodes of one title")
            .len()
    });
    bench("progress(one title)", 2_000, || {
        sh::progress_in(&connection, "0")
            .expect("progress")
            .map_or(0, |progress| progress.watched as usize)
    });
    bench("last_for_anime(one title)", 2_000, || {
        sh::last_for_anime_in(&connection, "0")
            .expect("last")
            .is_some() as usize
    });
}
