// Offline benchmark for the unified index recall path.
//
// The production commands open the real app database behind an AppHandle;
// `benchmark_api::unified_index` exposes the same SQL against an in-memory
// fixture. Measured here:
// - FTS (>= 3 chars) and LIKE (< 3 chars) recall at limit 8 / 48 / 60,
// - the learning projection (`list_learning_stats`) at 1k / 10k / 50k rows,
// - one feedback UPDATE.
//
// Budget (Ryzen 7 5800X, release, 8k anime + 8k aliases): FTS limit 48 under
// 8 ms, LIKE limit 48 under 5 ms, learning stats 10k under 30 ms and 50k under
// 150 ms (one startup read, not per keystroke), one feedback UPDATE under
// 50 us (the normalized_value index from schema 22 turns the old full scan into
// an index lookup). A regression over budget means the pool widening or the
// projection stopped being free.
//
// Run: cargo bench --manifest-path src-tauri/Cargo.toml --bench unified_index

use std::hint::black_box;
use std::time::Instant;

use iluhaanime_lib::benchmark_api::unified_index as ui;

const WORDS: [&str; 15] = [
    "Frieren",
    "Naruto",
    "Titan",
    "Slayer",
    "Gate",
    "Hunter",
    "Bebop",
    "Bleach",
    "Evangelion",
    "Gintama",
    "Clannad",
    "Toradora",
    "ReZero",
    "Steins",
    "Alchemist",
];

const INDEX_SIZE: usize = 8_000;
const LEARNING_CUTOFF_DAYS: i64 = 90;

fn title(index: usize) -> String {
    format!(
        "{} {} {}",
        WORDS[index % WORDS.len()],
        WORDS[(index / WORDS.len() + 1) % WORDS.len()],
        index
    )
}

fn alias(index: usize) -> String {
    format!(
        "{} {} alias {}",
        WORDS[(index * 3 + 5) % WORDS.len()],
        WORDS[(index * 11 + 2) % WORDS.len()],
        index
    )
}

fn make_index(count: usize) -> Vec<ui::UnifiedIndexEntryInput> {
    let mut entries = Vec::with_capacity(count * 2 + 200);
    for index in 0..count {
        entries.push(ui::UnifiedIndexEntryInput {
            id: format!("anime:{index}"),
            kind: "anime".to_string(),
            scope: "anilist".to_string(),
            value: title(index),
            subtitle: Some("FINISHED".to_string()),
            metadata: None,
            bump_use: false,
        });
        entries.push(ui::UnifiedIndexEntryInput {
            id: format!("anime:{index}:alias:{}", alias(index)),
            kind: "anime_alias".to_string(),
            scope: "anilist".to_string(),
            value: alias(index),
            subtitle: Some(title(index)),
            metadata: None,
            bump_use: false,
        });
    }
    for index in 0..200 {
        entries.push(ui::UnifiedIndexEntryInput {
            id: format!("history:anilist:frieren {index}"),
            kind: "history".to_string(),
            scope: "anilist".to_string(),
            value: format!("frieren {index}"),
            subtitle: None,
            metadata: None,
            bump_use: true,
        });
    }
    entries
}

fn make_learning_rows(count: usize) -> Vec<ui::UnifiedIndexEntryInput> {
    (0..count)
        .map(|index| ui::UnifiedIndexEntryInput {
            id: format!("history:anilist:learned query {index}"),
            kind: "history".to_string(),
            scope: "anilist".to_string(),
            value: format!("learned query {index}"),
            subtitle: None,
            metadata: None,
            bump_use: true,
        })
        .collect()
}

fn percentile(sorted: &[f64], ratio: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let index = ((sorted.len() as f64 * ratio) as usize).min(sorted.len() - 1);
    sorted[index]
}

fn measure(name: &str, iterations: usize, mut run: impl FnMut() -> usize) {
    for _ in 0..10 {
        black_box(run());
    }
    let mut samples = Vec::with_capacity(iterations);
    let mut hits = 0usize;
    for _ in 0..iterations {
        let started = Instant::now();
        hits += black_box(run());
        samples.push(started.elapsed().as_secs_f64() * 1000.0);
    }
    samples.sort_by(|left, right| left.partial_cmp(right).unwrap_or(std::cmp::Ordering::Equal));
    let avg = samples.iter().sum::<f64>() / samples.len() as f64;
    println!(
        "{name:<48} n={iterations:<4} avg={avg:7.3}ms p50={:7.3}ms p99={:7.3}ms hits={hits}",
        percentile(&samples, 0.5),
        percentile(&samples, 0.99)
    );
}

fn main() {
    let mut index = ui::open_fixture().expect("in-memory index");
    let entries = make_index(INDEX_SIZE);
    ui::seed(&mut index, &entries).expect("seed index");
    println!(
        "fixture: {} entries ({} anime + aliases + 200 history)",
        entries.len(),
        INDEX_SIZE
    );

    for limit in [8u32, 48, 60] {
        measure(&format!("fts frieren limit={limit}"), 200, || {
            ui::search(&index, "frieren", Some("anilist"), limit)
                .expect("fts search")
                .len()
        });
    }
    measure("fts frieren naruto limit=48", 200, || {
        ui::search(&index, "frieren naruto", Some("anilist"), 48)
            .expect("fts multi-token")
            .len()
    });
    measure("fts all scopes frieren limit=48", 200, || {
        ui::search(&index, "frieren", None, 48)
            .expect("fts no scope")
            .len()
    });
    measure("like fri limit=48 (short query path)", 200, || {
        ui::search(&index, "fri", Some("anilist"), 48)
            .expect("like search")
            .len()
    });
    measure("fts friren limit=48 (typo)", 200, || {
        ui::search(&index, "friren", Some("anilist"), 48)
            .expect("fts typo")
            .len()
    });

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("clock")
        .as_secs() as i64;
    let cutoff = now - LEARNING_CUTOFF_DAYS * 86_400;
    for count in [1_000usize, 10_000, 50_000] {
        let mut learning = ui::open_fixture().expect("in-memory learning index");
        ui::seed(&mut learning, &make_learning_rows(count)).expect("seed learning rows");
        let iterations = if count >= 50_000 { 10 } else { 50 };
        measure(&format!("learning stats rows={count}"), iterations, || {
            ui::learning_stats(&learning, cutoff)
                .expect("learning stats")
                .len()
        });
    }

    let normalized = ui::normalize(&title(0));
    let exact = ui::search(&index, &title(0), Some("anilist"), 100)
        .expect("record target search")
        .into_iter()
        .filter(|row| row.value == title(0))
        .count();
    println!(
        "record target: value={:?} normalized={:?} exact_rows={exact}",
        title(0),
        normalized
    );
    measure("record select one row", 500, || {
        ui::record_value(&index, &normalized, Some("anilist"), "selected_count", now)
            .expect("record value")
    });
}
