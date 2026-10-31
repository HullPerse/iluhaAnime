use iluhaanime_lib::benchmark_api::collection as c;
use std::hint::black_box;
use std::time::Instant;

// Offline benchmark for collection import (app_db/collection_io.rs).

fn main() {
    let connection = c::open_fixture().expect("fixture");
    let data = c::sample_export();
    let iterations = 1_000usize;
    let started = Instant::now();
    let mut imported = 0usize;
    for i in 0..iterations {
        let mut data = data.clone();
        for item in &mut data.items {
            item.id = format!("item-{i}");
            item.external_ids = serde_json::json!({"anilist": i as i64 + 1});
        }
        let summary = c::import(&connection, data, "create_new").expect("import");
        imported += summary.imported;
    }
    let elapsed = started.elapsed();
    println!(
        "collection import: iterations={} total={:?} avg={:.3}us imported={}",
        iterations,
        elapsed,
        elapsed.as_secs_f64() * 1_000_000.0 / iterations as f64,
        imported
    );
    black_box(imported);
}
