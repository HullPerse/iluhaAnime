// Player tab torrent-file latency bench.
//
// `get_running_torrent_files` rebuilds the file list on every call. For each
// file it stats the payload twice: once for `exists` and once through
// `allocated_bytes`, then serializes the whole list. The Player tab asks for
// every torrent separately on mount and batches them every 10 s, so the cost
// is paid for the full library on each sweep.
//
// This bench prices the per-file syscalls, the clone into `files_cache` and
// the JSON payload on a synthetic 50-torrent library.
//
// Run with:
//   cargo bench --manifest-path src-tauri/Cargo.toml --features bench-api --bench player_torrent_files

use std::hint::black_box;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use iluhaanime_lib::benchmark_api::{
    allocated_bytes, FilePriority, TorrentFileInfo, TorrentFilesBatchEntry,
};

const TORRENTS: usize = 50;
const FILES_PER_TORRENT: usize = 50;
const FILE_SIZE: u64 = 350 * 1024 * 1024;
const RUNS: usize = 5;

fn fixture_root() -> PathBuf {
    std::env::temp_dir().join(format!("iluha_torrent_files_bench_{}", std::process::id()))
}

fn build_fixture(root: &Path) {
    if root.join("torrent-0").is_dir() {
        return;
    }
    for torrent in 0..TORRENTS {
        let dir = root
            .join(format!("torrent-{torrent:02}"))
            .join("Show S01");
        std::fs::create_dir_all(&dir).expect("bench torrent dir");
        for file in 0..FILES_PER_TORRENT {
            std::fs::write(dir.join(format!("Episode {file:03}.mkv")), b"x")
                .expect("bench torrent file");
        }
    }
}

fn file_name(index: usize) -> String {
    format!("Show S01/Episode {index:03}.mkv")
}

fn build_files(dir: &Path, stat: bool, allocated: bool, clone_for_cache: bool) -> Vec<TorrentFileInfo> {
    let files: Vec<TorrentFileInfo> = (0..FILES_PER_TORRENT)
        .map(|index| {
            let name = file_name(index);
            let full = dir.join(&name);
            let exists = stat
                && std::fs::metadata(&full)
                    .is_ok_and(|meta| meta.is_file() && meta.len() > 0);
            let on_disk_bytes = if allocated {
                allocated_bytes(&full).unwrap_or(0)
            } else {
                0
            };
            TorrentFileInfo {
                index,
                name,
                size: FILE_SIZE,
                progress_bytes: FILE_SIZE,
                on_disk_bytes,
                completed: true,
                selected: true,
                priority: FilePriority::Normal,
                exists,
            }
        })
        .collect();
    if clone_for_cache {
        black_box(files.clone());
    }
    black_box(files.len());
    files
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
    println!("{name:<52} median {median:>8.2} ms  n={hits}");
    median
}

fn main() {
    let root = fixture_root();
    build_fixture(&root);
    let dirs: Vec<PathBuf> = (0..TORRENTS)
        .map(|torrent| root.join(format!("torrent-{torrent:02}")))
        .collect();
    let total_files = TORRENTS * FILES_PER_TORRENT;
    println!("fixture: torrents={TORRENTS} files_per_torrent={FILES_PER_TORRENT} files={total_files}");

    let warm = build_files(&dirs[0], true, true, true);
    println!(
        "prod-shaped file row: exists={} on_disk_bytes={} name={}",
        warm[0].exists, warm[0].on_disk_bytes, warm[0].name
    );

    let build_only = bench("build structs only (no syscalls)", RUNS, || {
        dirs.iter()
            .map(|dir| build_files(dir, false, false, false).len())
            .sum()
    });
    let metadata_only = bench("build + exists metadata", RUNS, || {
        dirs.iter()
            .map(|dir| build_files(dir, true, false, false).len())
            .sum()
    });
    let current = bench("current: metadata + allocated + cache clone", RUNS, || {
        dirs.iter()
            .map(|dir| build_files(dir, true, true, true).len())
            .sum()
    });

    let allocated_only = bench("allocated_bytes only", RUNS, || {
        let mut hits = 0usize;
        for dir in &dirs {
            for index in 0..FILES_PER_TORRENT {
                if allocated_bytes(&dir.join(file_name(index))).is_some() {
                    hits += 1;
                }
            }
        }
        hits
    });

    let one_payload = serde_json::to_vec(&warm).expect("one torrent json");
    let batch: Vec<TorrentFilesBatchEntry> = dirs
        .iter()
        .enumerate()
        .map(|(id, dir)| TorrentFilesBatchEntry {
            id,
            files: Some(build_files(dir, true, true, false)),
            error: None,
        })
        .collect();
    let batch_bytes = serde_json::to_vec(&batch).expect("batch json").len();

    let one_json = bench("JSON one torrent (50 files)", RUNS, || {
        serde_json::to_vec(&warm).expect("one torrent json").len()
    });
    let n_json = bench("JSON N separate invokes (50 x 50)", RUNS, || {
        dirs.iter()
            .map(|dir| {
                let files = build_files(dir, true, true, false);
                serde_json::to_vec(&files).expect("torrent json").len()
            })
            .sum()
    });
    let batch_json = bench("JSON one batch (50 torrents)", RUNS, || {
        serde_json::to_vec(&batch).expect("batch json").len()
    });

    let per_file_us = current * 1000.0 / total_files as f64;
    let projected_10k = per_file_us * 10_000.0 / 1000.0;
    println!(
        "one payload: {:.2} KiB; batch payload: {:.2} MiB",
        one_payload.len() as f64 / 1024.0,
        batch_bytes as f64 / (1024.0 * 1024.0)
    );
    println!(
        "per-file current cost: {per_file_us:.1} us; projected 10k files: {projected_10k:.1} ms"
    );
    println!(
        "poll projection: build {current:.1} ms + batch JSON {batch_json:.1} ms = {:.1} ms every 10 s",
        current + batch_json
    );
    println!(
        "mount projection: build {current:.1} ms + N JSON {n_json:.1} ms = {:.1} ms",
        current + n_json
    );
    println!(
        "split: structs {build_only:.1} ms, metadata {:.1} ms, allocated {allocated_only:.1} ms, one JSON {one_json:.1} ms",
        metadata_only
    );

    let _ = std::fs::remove_dir_all(&root);
}
