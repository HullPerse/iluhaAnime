use iluhaanime_lib::benchmark_api::{franchise_query_body, franchise_query_metrics};
use std::hint::black_box;
use std::time::Instant;

fn benchmark_batch(size: usize, iterations: usize) {
    let ids: Vec<u64> = (1..=size as u64).collect();
    let metrics = franchise_query_metrics(&ids);
    let started = Instant::now();
    let mut serialized_bytes = 0usize;

    for _ in 0..iterations {
        let body = black_box(franchise_query_body(&ids));
        serialized_bytes += serde_json::to_vec(black_box(&body))
            .expect("benchmark query body should serialize")
            .len();
    }

    let elapsed = started.elapsed();
    let per_iteration = elapsed.as_secs_f64() * 1_000_000.0 / iterations as f64;
    println!(
        "batch={size:>2} iterations={iterations:>6} total={elapsed:?} avg={per_iteration:>8.2}us query_bytes={} body_bytes={} serialized_bytes={serialized_bytes}",
        metrics.query_bytes, metrics.body_bytes
    );
}

fn main() {
    println!("AniList franchise query benchmark (offline; no network requests)");
    println!("Each batch uses Page.media(id_in: $ids) and the current relation projection.");
    for size in [1, 4, 8, 16, 32, 50] {
        benchmark_batch(size, 10_000);
    }
}
