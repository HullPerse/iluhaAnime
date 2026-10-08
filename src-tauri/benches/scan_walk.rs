use std::collections::HashSet;
use std::hint::black_box;
use std::time::Instant;

// Offline benchmark for the player folder-scan hot path.
// Builds a synthetic tree once, then compares jwalk walk modes and
// extension-match variants. Run with:
//   cargo bench --manifest-path src-tauri/Cargo.toml --bench scan_walk

const DIRS: usize = 30;
const VIDEO_PER_DIR: usize = 60;
const OTHER_PER_DIR: usize = 20;

fn fixture_root() -> std::path::PathBuf {
    std::env::temp_dir().join(format!("iluha_scan_bench_{}", std::process::id()))
}

fn build_fixture(root: &std::path::Path) {
    if root.exists() {
        return;
    }
    for dir in 0..DIRS {
        let dir_path = root.join(format!("Season {dir}"));
        std::fs::create_dir_all(&dir_path).expect("bench fixture dir");
        for file in 0..VIDEO_PER_DIR {
            let name = format!("[Group] Show S01E{file:03} [1080p].mkv");
            std::fs::write(dir_path.join(name), b"x").expect("bench fixture file");
        }
        for file in 0..OTHER_PER_DIR {
            std::fs::write(dir_path.join(format!("note_{file}.nfo")), b"x")
                .expect("bench fixture file");
        }
    }
}

fn ext_set() -> HashSet<String> {
    ["mkv", "mp4", "avi", "mov", "webm"]
        .into_iter()
        .map(str::to_string)
        .collect()
}

fn ext_list() -> Vec<String> {
    vec![
        "mkv".to_string(),
        "mp4".to_string(),
        "avi".to_string(),
        "mov".to_string(),
        "webm".to_string(),
    ]
}

#[allow(clippy::needless_pass_by_value)]
fn walk_hashset(root: &std::path::Path, serial: bool, ext_set: &HashSet<String>) -> usize {
    let mut walk = jwalk::WalkDir::new(root).follow_links(false);
    if serial {
        walk = walk.parallelism(jwalk::Parallelism::Serial);
    }
    let mut hits = 0;
    for entry in walk {
        let entry = entry.expect("bench walk entry");
        if entry.file_type().is_dir() {
            continue;
        }
        let path = entry.path();
        if let Some(ext) = path.extension() {
            if ext_set.contains(&ext.to_string_lossy().to_lowercase()) {
                hits += 1;
                black_box(std::fs::metadata(&path).expect("bench metadata").len());
            }
        }
    }
    hits
}

#[allow(clippy::needless_pass_by_value)]
fn walk_linear(root: &std::path::Path, serial: bool, ext_list: &[String]) -> usize {
    let mut walk = jwalk::WalkDir::new(root).follow_links(false);
    if serial {
        walk = walk.parallelism(jwalk::Parallelism::Serial);
    }
    let mut hits = 0;
    for entry in walk {
        let entry = entry.expect("bench walk entry");
        if entry.file_type().is_dir() {
            continue;
        }
        let path = entry.path();
        let matches = path
            .extension()
            .and_then(|ext| ext.to_str())
            .is_some_and(|ext| ext_list.iter().any(|known| ext.eq_ignore_ascii_case(known)));
        if matches {
            hits += 1;
            black_box(std::fs::metadata(&path).expect("bench metadata").len());
        }
    }
    hits
}

fn bench(name: &str, iterations: usize, mut run: impl FnMut() -> usize) {
    let mut hits = 0;
    let started = Instant::now();
    for _ in 0..iterations {
        hits += black_box(run());
    }
    let elapsed = started.elapsed();
    let per = elapsed.as_secs_f64() * 1000.0 / iterations as f64;
    println!("{name}: iterations={iterations} total={elapsed:?} avg={per:.2}ms hits={hits}");
}

fn bench_concurrent_busy(root: &std::path::Path) {
    let threads = 8usize;
    let started = Instant::now();
    let busy = std::thread::scope(|scope| {
        let mut handles = Vec::new();
        for _ in 0..threads {
            handles.push(scope.spawn(|| {
                let mut busy_errors = 0;
                for entry in jwalk::WalkDir::new(root).follow_links(false) {
                    match entry {
                        Ok(_) => {}
                        Err(error) if error.is_busy() => busy_errors += 1,
                        Err(error) => panic!("unexpected bench walk error: {error}"),
                    }
                }
                busy_errors
            }));
        }
        handles
            .into_iter()
            .map(|h| h.join().expect("bench thread"))
            .sum::<usize>()
    });
    let elapsed = started.elapsed();
    println!("concurrent {threads}x parallel walks: total={elapsed:?} busy_errors={busy}");
}

fn main() {
    let root = fixture_root();
    build_fixture(&root);
    let expected = DIRS * VIDEO_PER_DIR;
    println!("fixture: {} dirs, expected video hits: {expected}", DIRS);
    let set = ext_set();
    let list = ext_list();
    let iterations = 5;
    bench("parallel + hashset-lower", iterations, || {
        walk_hashset(&root, false, &set)
    });
    bench("serial + hashset-lower", iterations, || {
        walk_hashset(&root, true, &set)
    });
    bench("parallel + linear-ignore-case", iterations, || {
        walk_linear(&root, false, &list)
    });
    bench("serial + linear-ignore-case", iterations, || {
        walk_linear(&root, true, &list)
    });
    bench_concurrent_busy(&root);
}
