use std::collections::{HashMap, HashSet};
use std::hint::black_box;
use std::time::Instant;

// Offline benchmark for string deduplication strategies on release-style
// paths with heavy prefix duplication (groups, seasons, episodes).
// Compares owned String keys, borrowed &str keys, and an interned id pool.
// Run with:
//   cargo bench --manifest-path src-tauri/Cargo.toml --bench string_intern

const SMALL: usize = 2_000;
const LARGE: usize = 20_000;

fn build_corpus(count: usize) -> Vec<String> {
    let groups = ["Leopard-Raws", "Erai-raws", "SubsPlease", "Shakaw"];
    let shows = ["Hunter x Hunter", "Frieren", "One Piece", "Steins Gate"];
    let mut out = Vec::with_capacity(count);
    for i in 0..count {
        let season = (i % 10) + 1;
        let ep = i % 148;
        let ext = if i % 7 == 0 { "ass" } else { "mkv" };
        out.push(format!(
            "[{}] {} S{:02}E{:03} [1080p][RUS].{}",
            groups[i % groups.len()],
            shows[i % shows.len()],
            season,
            ep,
            ext
        ));
    }
    out
}

struct StringPool {
    map: HashMap<String, u32>,
    next: u32,
}

impl StringPool {
    fn new() -> Self {
        Self {
            map: HashMap::new(),
            next: 0,
        }
    }

    fn intern(&mut self, value: &str) -> u32 {
        if let Some(&id) = self.map.get(value) {
            return id;
        }
        let id = self.next;
        self.next = self.next.saturating_add(1);
        self.map.insert(value.to_string(), id);
        id
    }
}

fn dedup_owned(paths: &[String]) -> HashSet<String> {
    let mut set = HashSet::new();
    for path in paths {
        set.insert(path.clone());
    }
    set
}

fn dedup_borrowed(paths: &[String]) -> HashSet<&str> {
    let mut set = HashSet::new();
    for path in paths {
        set.insert(path.as_str());
    }
    set
}

fn dedup_interned(paths: &[String]) -> (StringPool, HashSet<u32>) {
    let mut pool = StringPool::new();
    let mut set = HashSet::new();
    for path in paths {
        set.insert(pool.intern(path));
    }
    (pool, set)
}

fn lookup_owned(set: &HashSet<String>, paths: &[String]) -> usize {
    let mut hits = 0;
    for path in paths {
        if set.contains(path) {
            hits += 1;
        }
    }
    hits
}

fn bench(name: &str, iterations: usize, mut run: impl FnMut() -> usize) {
    let mut total = 0;
    let started = Instant::now();
    for _ in 0..iterations {
        total += black_box(run());
    }
    let elapsed = started.elapsed();
    let per = elapsed.as_secs_f64() * 1000.0 / iterations as f64;
    println!("{name}: iterations={iterations} total={elapsed:?} avg={per:.3}ms checksum={total}");
}

fn main() {
    let small = build_corpus(SMALL);
    let large = build_corpus(LARGE);
    println!("corpus: small={SMALL} large={LARGE}");

    for (label, corpus, iters) in [("2k", &small, 200), ("20k", &large, 20)] {
        bench(&format!("dedup owned String {label}"), iters, || {
            dedup_owned(corpus).len()
        });
        bench(&format!("dedup borrowed &str {label}"), iters, || {
            dedup_borrowed(corpus).len()
        });
        bench(&format!("dedup interned id {label}"), iters, || {
            dedup_interned(corpus).1.len()
        });
    }

    let owned = dedup_owned(&large);
    let borrowed = dedup_borrowed(&large);
    let (mut pool, interned) = dedup_interned(&large);
    bench("lookup owned 20k warm", 50, || lookup_owned(&owned, &large));
    bench("lookup borrowed 20k warm", 50, || {
        let mut hits = 0;
        for path in &large {
            if borrowed.contains(path.as_str()) {
                hits += 1;
            }
        }
        hits
    });
    bench("lookup interned 20k warm", 50, || {
        let mut hits = 0;
        for path in &large {
            if interned.contains(&pool.intern(path)) {
                hits += 1;
            }
        }
        hits
    });
}
