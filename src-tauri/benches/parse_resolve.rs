use std::hint::black_box;
use std::time::Instant;

// Offline benchmark for the mold "parse first, resolve later" pattern on a
// scan-shaped workload. Variant A intertwines parsing with per-file
// resolution decisions; variant B parses everything first, then resolves in
// a separate pass. Both produce the same result set; only the structure
// differs, which is the point (phase 1 is pure and parallelizable).
// Self-contained: file_index is AppHandle-bound, so the corpus and the
// match index are synthetic, mirroring the release-name shapes.
// Run with:
//   cargo bench --manifest-path src-tauri/Cargo.toml --bench parse_resolve

const CORPUS_SIZES: [usize; 2] = [2_000, 20_000];
const INDEX_TITLES: [&str; 6] = [
    "sousou no frieren",
    "hunter x hunter",
    "one piece",
    "steins gate",
    "shingeki no kyojin",
    "kimetsu no yaiba",
];

fn build_corpus(count: usize) -> Vec<String> {
    let groups = ["Leopard-Raws", "Erai-raws", "SubsPlease"];
    let mut out = Vec::with_capacity(count);
    for i in 0..count {
        let ep = i % 148;
        let ext = if i % 7 == 0 { "ass" } else { "mkv" };
        out.push(format!(
            "[{}] Title{:02} - {:03} [1080p][RUS].{}",
            groups[i % groups.len()],
            i % INDEX_TITLES.len(),
            ep,
            ext
        ));
    }
    out
}

#[derive(Clone, Default, PartialEq, Eq, Debug)]
struct Parsed {
    group: String,
    title_index: usize,
    episode: u32,
}

fn parse_name(name: &str) -> Parsed {
    let group = name
        .split(']')
        .next()
        .unwrap_or_default()
        .trim_start_matches('[')
        .to_string();
    let episode = name
        .split(" - ")
        .nth(1)
        .and_then(|tail| tail.split_whitespace().next())
        .and_then(|num| num.parse::<u32>().ok())
        .unwrap_or(0);
    let title_seed = name
        .split("Title")
        .nth(1)
        .and_then(|tail| tail.split_whitespace().next())
        .and_then(|num| num.parse::<usize>().ok())
        .unwrap_or(0);
    Parsed {
        group,
        title_index: title_seed,
        episode,
    }
}

struct Matcher {
    index: Vec<Parsed>,
}

impl Matcher {
    fn new(corpus: &[String]) -> Self {
        let mut index = Vec::with_capacity(corpus.len());
        for name in corpus {
            index.push(parse_name(name));
        }
        Self { index }
    }

    fn resolve(&self, parsed: &Parsed) -> Option<usize> {
        self.index
            .iter()
            .position(|candidate| candidate.title_index == parsed.title_index)
    }
}

fn variant_intertwined(corpus: &[String], matcher: &Matcher) -> usize {
    let mut matched = 0;
    for name in corpus {
        let parsed = parse_name(name);
        if matcher.resolve(&parsed).is_some() {
            matched += 1;
        }
    }
    matched
}

fn variant_parse_then_resolve(corpus: &[String], matcher: &Matcher) -> usize {
    let parsed: Vec<Parsed> = corpus.iter().map(|name| parse_name(name)).collect();
    let mut matched = 0;
    for entry in &parsed {
        if matcher.resolve(entry).is_some() {
            matched += 1;
        }
    }
    matched
}

fn bench(name: &str, iterations: usize, mut run: impl FnMut() -> usize) {
    let mut total = 0;
    let started = Instant::now();
    for _ in 0..iterations {
        total += black_box(run());
    }
    let elapsed = started.elapsed();
    let per = elapsed.as_secs_f64() * 1000.0 / iterations as f64;
    println!("{name}: iterations={iterations} total={elapsed:?} avg={per:.3}ms matched={total}");
}

fn main() {
    println!("Parse-then-resolve benchmark (offline, synthetic corpus)");
    for size in CORPUS_SIZES {
        let corpus = build_corpus(size);
        let matcher = Matcher::new(&corpus);
        let iterations = if size >= 20_000 { 20 } else { 200 };
        println!("corpus: {size} files");
        bench("intertwined parse+resolve", iterations, || {
            variant_intertwined(&corpus, &matcher)
        });
        bench("parse-first then resolve", iterations, || {
            variant_parse_then_resolve(&corpus, &matcher)
        });
        let mixed = variant_intertwined(&corpus, &matcher);
        let split = variant_parse_then_resolve(&corpus, &matcher);
        assert_eq!(mixed, split, "variants must agree on the match count");
    }
}
