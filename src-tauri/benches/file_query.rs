use iluhaanime_lib::benchmark_api::{parse_file_query, FileIndexer};
use std::hint::black_box;
use std::time::Instant;

// Offline benchmark for the file_index.rs constraint parser and search.
// Measures parse overhead per query plus search latency over rebuilt
// synthetic trees, proving the parser adds no meaningful cost to the
// scoring hot path. Run with:
//   cargo bench --manifest-path src-tauri/Cargo.toml --bench file_query

const QUERIES: [&str; 6] = [
    "frieren s01e01",
    "frieren !sample/",
    "*.mkv frieren",
    "ext:mp4,avi one piece",
    "*.{mkv,mp4} !*.nfo attack on titan",
    "naruto !sample/ !*.srt",
];

const SHOWS: [&str; 5] = [
    "Frieren",
    "Naruto Shippuden",
    "One Piece",
    "Attack on Titan",
    "Steins Gate",
];

fn fixture_root(size: usize) -> std::path::PathBuf {
    std::env::temp_dir().join(format!("iluha_query_bench_{size}"))
}

fn build_fixture(root: &std::path::Path, count: usize) {
    if root.exists() {
        return;
    }
    for index in 0..count {
        let show = SHOWS[index % SHOWS.len()];
        let dir = if index % 11 == 0 { "sample" } else { "main" };
        let ext = if index % 7 == 0 { "nfo" } else { "mkv" };
        let dir_path = root.join(show).join(dir);
        std::fs::create_dir_all(&dir_path).expect("bench fixture dir");
        std::fs::write(dir_path.join(format!("{show} ep{index:04}.{ext}")), b"x")
            .expect("bench fixture file");
    }
}

fn bench(name: &str, iterations: usize, mut run: impl FnMut() -> usize) {
    let mut hits = 0usize;
    let started = Instant::now();
    for _ in 0..iterations {
        hits += black_box(run());
    }
    let elapsed = started.elapsed();
    let per = elapsed.as_secs_f64() * 1000.0 / iterations as f64;
    println!("{name}: iterations={iterations} total={elapsed:?} avg={per:.2}ms hits={hits}");
}

fn main() {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("bench runtime");

    bench("parse x6 queries", 20_000, || {
        let mut fields = 0;
        for query in QUERIES {
            let parsed = parse_file_query(black_box(query));
            fields += parsed.text.len() + parsed.extensions.len() + parsed.excludes.len();
        }
        fields
    });

    for size in [5_000usize, 20_000usize] {
        let root = fixture_root(size);
        build_fixture(&root, size);
        let indexer = FileIndexer::new();
        runtime
            .block_on(indexer.rebuild(
                vec![root.to_string_lossy().to_string()],
                vec!["mkv".to_string(), "nfo".to_string()],
                0,
            ))
            .expect("bench rebuild");
        for query in QUERIES {
            bench(&format!("search n={size} q={query:?}"), 20, || {
                runtime
                    .block_on(indexer.search(black_box(query), &[], black_box(50)))
                    .len()
            });
        }
    }
}
