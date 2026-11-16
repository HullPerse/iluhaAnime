// Real-library scan latency for the Player folder walk.
//
// This bench is intentionally path-agnostic: pass the library root through
// `ILUHA_SCAN_ROOT`. Optional knobs:
//   ILUHA_SCAN_RUNS=1       runs per thread setting
//   ILUHA_SCAN_THREADS=0,1  comma-separated scan thread settings
//
// Run with:
//   ILUHA_SCAN_ROOT="D:/Anime & Movies" ILUHA_SCAN_RUNS=1 \
//     cargo bench --manifest-path src-tauri/Cargo.toml \
//     --features bench-api --bench player_real_scan

use std::hint::black_box;
use std::time::{Duration, Instant};

use iluhaanime_lib::benchmark_api::player_scan;

const EXTENSIONS: [&str; 5] = ["mkv", "mp4", "avi", "mov", "webm"];

fn extensions() -> Vec<String> {
    EXTENSIONS.iter().map(|value| (*value).to_string()).collect()
}

fn env_usize(name: &str, fallback: usize) -> usize {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(fallback)
}

fn thread_settings() -> Vec<usize> {
    let Some(raw) = std::env::var("ILUHA_SCAN_THREADS").ok() else {
        return vec![0, 1, 2, 4];
    };
    let parsed: Vec<usize> = raw
        .split(',')
        .filter_map(|value| value.trim().parse().ok())
        .collect();
    if parsed.is_empty() {
        vec![0]
    } else {
        parsed
    }
}

fn median_ms(mut samples: Vec<Duration>) -> f64 {
    samples.sort_unstable();
    samples[samples.len() / 2].as_secs_f64() * 1000.0
}

fn main() {
    let root = std::env::var("ILUHA_SCAN_ROOT")
        .expect("set ILUHA_SCAN_ROOT to the folder that should be scanned");
    let runs = env_usize("ILUHA_SCAN_RUNS", 1).max(1);
    let ext = extensions();
    println!("root: {root}");
    println!("runs per thread setting: {runs}");

    for threads in thread_settings() {
        let mut samples = Vec::with_capacity(runs);
        for run in 1..=runs {
            let started = Instant::now();
            let outcome = black_box(player_scan::walk_player_folder(&root, ext.clone(), threads));
            let elapsed = started.elapsed();
            println!(
                "threads={threads:<2} run={run:<2} {:>8.2} ms  files={}  skipped={}  bytes={}  progress={}",
                elapsed.as_secs_f64() * 1000.0,
                outcome.files,
                outcome.skipped,
                outcome.bytes,
                outcome.progress_events
            );
            samples.push(elapsed);
        }
        println!(
            "threads={threads:<2} median {:>8.2} ms",
            median_ms(samples)
        );
    }
}
