use iluhaanime_lib::benchmark_api::{
    ignored_payload_paths, part_file_path, FolderWatcher, PayloadFile,
};
use std::hint::black_box;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

// Torrent payload path bench (torrent/manager.rs), timing the watcher ignore
// set and the hidden-attribute pass.
//
// Budget (AMD Ryzen 7 5800X, Windows 11, rustc 1.98.0, bench profile, 2026-10-22):
//   ignore paths, 5000 files      median <= 5 ms
//   ignore paths, cached layout  median <= 5 ms
//   watcher ignore set           median <= 5 ms
//   hidden pass stat             median <= 20 ms
//   hidden pass stat, twins      median <= 1 ms
//
// The watcher ignore set is rebuilt every tick (1 s) while a torrent
// downloads, and the hidden-attribute pass runs every tenth tick. Both walk
// the payload list of the torrent, so the numbers have to stay far below the
// tick budget. Each scenario runs five times and prints the median; the
// FNV-1a checksum of the produced paths proves the runner did the work and
// the optimizer did not delete it.
//
// Run with:
//   cargo bench --manifest-path src-tauri/Cargo.toml --bench torrent_payloads

const RUNS: usize = 5;
const FILES: usize = 5000;
const UNFINISHED: usize = 1000;
const FNV_OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
const FNV_PRIME: u64 = 0x0000_0100_0000_01b3;
const SAVE_DIR: &str = "D:/Anime/Show S01";
const FILE_LEN: u64 = 4 * 1024 * 1024;

fn fnv1a(bytes: &[u8]) -> u64 {
    bytes.iter().fold(FNV_OFFSET, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(FNV_PRIME)
    })
}

fn median(mut samples: Vec<Duration>) -> Duration {
    samples.sort_unstable();
    samples[samples.len() / 2]
}

/// The payload names of a season: `Show S01/Episode 01.mkv` and so on.
fn payload_names(count: usize) -> Vec<PathBuf> {
    (0..count)
        .map(|index| PathBuf::from(format!("Show S01/Episode {index:03}.mkv")))
        .collect()
}

/// The progress of the payloads: the first `UNFINISHED` files are still
/// downloading, the rest are finished.
fn progress(names: &[PathBuf]) -> Vec<u64> {
    names
        .iter()
        .enumerate()
        .map(
            |(index, _)| {
                if index < UNFINISHED {
                    1024
                } else {
                    FILE_LEN
                }
            },
        )
        .collect()
}

fn payload_files<'a>(names: &'a [PathBuf], progress: &'a [u64]) -> Vec<PayloadFile<'a>> {
    names
        .iter()
        .zip(progress.iter())
        .map(|(relative_filename, progress)| PayloadFile {
            relative_filename,
            progress: *progress,
            len: FILE_LEN,
        })
        .collect()
}

/// The current shape: every tick rebuilds the path strings of the unfinished
/// payloads.
fn ignore_paths_rebuild(names: &[PathBuf], progress: &[u64]) -> Vec<String> {
    ignored_payload_paths(SAVE_DIR, &payload_files(names, progress))
}

/// The candidate shape: the layout never changes, so the path strings are
/// built once and the tick only picks the unfinished ones.
struct CachedLayout {
    final_paths: Vec<String>,
    part_paths: Vec<String>,
}

impl CachedLayout {
    fn build(names: &[PathBuf]) -> Self {
        let mut final_paths = Vec::with_capacity(names.len());
        let mut part_paths = Vec::with_capacity(names.len());
        for name in names {
            let full_path = Path::new(SAVE_DIR).join(name);
            final_paths.push(full_path.to_string_lossy().to_string());
            part_paths.push(part_file_path(&full_path).to_string_lossy().to_string());
        }
        Self {
            final_paths,
            part_paths,
        }
    }

    fn ignored(&self, progress: &[u64]) -> Vec<String> {
        let mut files = Vec::new();
        for (index, progress) in progress.iter().enumerate() {
            if *progress >= FILE_LEN {
                continue;
            }
            files.push(self.final_paths[index].clone());
            files.push(self.part_paths[index].clone());
        }
        files
    }
}

/// The hidden-attribute pass: one stat per unfinished payload, because the
/// payload of a new download lives in the `.part` twin and the final name
/// does not exist.
fn hidden_pass_stat(dir: &Path, names: &[PathBuf]) -> usize {
    let mut hits = 0;
    for name in names.iter().take(UNFINISHED) {
        if std::fs::metadata(dir.join(name)).is_ok_and(|meta| meta.is_file()) {
            hits += 1;
        }
    }
    hits
}

/// The optimized pass: the payloads that live in the `.part` twin are
/// remembered, so the pass stops asking the filesystem about them.
fn hidden_pass_stat_twins(dir: &Path, names: &[PathBuf], twins: &[bool]) -> usize {
    let mut hits = 0;
    for (index, name) in names.iter().take(UNFINISHED).enumerate() {
        if twins[index] {
            continue;
        }
        if std::fs::metadata(dir.join(name)).is_ok_and(|meta| meta.is_file()) {
            hits += 1;
        }
    }
    hits
}

fn bench_paths(name: &str, budget_ms: f64, run: impl Fn() -> Vec<String>) {
    let mut samples = Vec::with_capacity(RUNS);
    let mut checksum = 0u64;
    for _ in 0..RUNS {
        let started = Instant::now();
        let paths = run();
        samples.push(started.elapsed());
        for path in &paths {
            checksum ^= fnv1a(path.as_bytes());
        }
        black_box(&paths);
    }
    let median = median(samples);
    let millis = median.as_secs_f64() * 1000.0;
    let verdict = if millis <= budget_ms {
        "ok"
    } else {
        "OVER BUDGET"
    };
    println!(
        "{name:<28} median {millis:>8.3} ms (budget {budget_ms:.1} ms) {verdict} checksum {checksum:016x}"
    );
}

fn bench_stat(name: &str, budget_ms: f64, run: impl Fn() -> usize) {
    let mut samples = Vec::with_capacity(RUNS);
    let mut hits = 0;
    for _ in 0..RUNS {
        let started = Instant::now();
        hits = run();
        samples.push(started.elapsed());
    }
    let median = median(samples);
    let millis = median.as_secs_f64() * 1000.0;
    let verdict = if millis <= budget_ms {
        "ok"
    } else {
        "OVER BUDGET"
    };
    println!("{name:<28} median {millis:>8.3} ms (budget {budget_ms:.1} ms) {verdict} hits {hits}");
}

fn main() {
    let names = payload_names(FILES);
    let progress = progress(&names);

    bench_paths("ignore paths rebuild", 5.0, || {
        ignore_paths_rebuild(&names, &progress)
    });
    let layout = CachedLayout::build(&names);
    bench_paths("ignore paths cached", 5.0, || layout.ignored(&progress));

    let paths = ignore_paths_rebuild(&names, &progress);
    let watcher = FolderWatcher::new();
    bench_paths("watcher ignore set", 5.0, || {
        watcher.set_ignored_paths(vec![SAVE_DIR.to_string()], paths.clone());
        paths.clone()
    });

    let dir = std::env::temp_dir().join(format!("iluha_payload_bench_{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(dir.join("Show S01")).expect("bench fixture dir");
    for name in names.iter().take(UNFINISHED) {
        std::fs::write(dir.join(name), b"").expect("bench fixture file");
    }
    bench_stat("hidden pass stat", 20.0, || hidden_pass_stat(&dir, &names));
    let twins = vec![true; UNFINISHED];
    bench_stat("hidden pass stat, twins", 1.0, || {
        hidden_pass_stat_twins(&dir, &names, &twins)
    });
    let _ = std::fs::remove_dir_all(&dir);
}
