use iluhaanime_lib::benchmark_api::collect_titles;
use serde_json::json;
use std::hint::black_box;
use std::time::Instant;

// Offline benchmark for AniList title collection (anilist/media.rs).
//
// Run with:
//   cargo bench --manifest-path src-tauri/Cargo.toml --bench collect_titles

fn main() {
    let synonyms: Vec<String> = (0..100).map(|i| format!("Synonym {i}")).collect();
    let media = json!({
        "title": { "english": "Main Title", "native": "Native Title" },
        "synonyms": synonyms,
    });

    let iterations = 100_000usize;
    let started = Instant::now();
    let mut total = 0usize;
    for _ in 0..iterations {
        total += black_box(collect_titles(&media, "Main Title")).len();
    }
    let elapsed = started.elapsed();
    println!(
        "collect_titles: iterations={} total={:?} avg={:.3}ns titles={}",
        iterations,
        elapsed,
        elapsed.as_secs_f64() * 1_000_000_000.0 / iterations as f64,
        total / iterations
    );
}
