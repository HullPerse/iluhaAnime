use iluhaanime_lib::benchmark_api::{apply_observed_property, PlaybackSnapshot};
use serde_json::json;
use std::hint::black_box;
use std::time::Instant;

// Player property-change cache bench (player/state.rs).
// Simulates mpv pushing observed properties and measures applying those
// deltas to the cached snapshot instead of polling mpv for every field.
//
// Run with:
//   cargo bench --manifest-path src-tauri/Cargo.toml --bench player_property_cache

fn main() {
    let events = [
        ("time-pos", json!(123.456)),
        ("duration", json!(1440.0)),
        ("pause", json!(false)),
        ("eof-reached", json!(false)),
        ("speed", json!(1.0)),
        ("volume", json!(80.0)),
        ("mute", json!(false)),
        ("playlist-pos", json!(2)),
        ("playlist-count", json!(12)),
        ("path", json!("/anime/ep.mkv")),
        ("paused-for-cache", json!(false)),
        ("cache-buffering-state", json!(42.0)),
        ("cache-speed", json!(123456.0)),
        ("demuxer-cache-duration", json!(30.0)),
    ];

    let iterations = 100_000usize;
    let mut snapshot = PlaybackSnapshot::default();
    let mut mask = 0u64;
    let started = Instant::now();
    for index in 0..iterations {
        let (name, data) = &events[index % events.len()];
        black_box(apply_observed_property(
            &mut snapshot,
            &mut mask,
            name,
            data,
        ));
    }
    let elapsed = started.elapsed();
    println!(
        "apply_observed_property: iterations={} total={:?} avg={:.3}ns mask={}",
        iterations,
        elapsed,
        elapsed.as_secs_f64() * 1_000_000_000.0 / iterations as f64,
        mask
    );
    assert_eq!(mask, 0b11111111111111); // all core observed bits
    assert!(snapshot.time_pos > 0.0);
}
