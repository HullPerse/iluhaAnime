use iluhaanime_lib::benchmark_api::anime_full_query;
use std::hint::black_box;
use std::time::Instant;

fn main() {
    println!("AniList full-detail query benchmark (offline; no network requests)");
    println!("Builds the Media(id) body with the current projection and serializes it.");
    let iterations = 10_000;
    let started = Instant::now();
    let mut serialized_bytes = 0usize;
    let mut query_bytes = 0usize;
    let mut body_bytes = 0usize;
    for _ in 0..iterations {
        let query = black_box(anime_full_query());
        query_bytes = query.len();
        let body = black_box(serde_json::json!({ "query": query, "variables": { "id": 21 } }));
        let bytes =
            serde_json::to_vec(black_box(&body)).expect("benchmark query body should serialize");
        body_bytes = bytes.len();
        serialized_bytes += bytes.len();
    }
    let elapsed = started.elapsed();
    let per_iteration = elapsed.as_secs_f64() * 1_000_000.0 / f64::from(iterations);
    println!(
        "iterations={iterations} total={elapsed:?} avg={per_iteration:>8.2}us query_bytes={query_bytes} body_bytes={body_bytes} serialized_bytes={serialized_bytes}"
    );
}
