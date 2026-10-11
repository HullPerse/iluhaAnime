// Request-side cost of trimming the shared AniList list projection.
// Compares the current media_list_selection (src-tauri/src/anilist/media.rs:
// MEDIA_CORE_SELECTION plus MEDIA_LIST_EXTRA_SELECTION, copied verbatim)
// against a trimmed variant that drops only fields with zero UI hits in
// list surfaces: coverImage { large } and studios { nodes { id name } }.
// description stays: discovery.random renders media.description from list
// rows. tags/synonyms/genres stay: the collection wizard maps altTitles,
// genres, and tags from search rows for matching and auto-tag. season,
// status, nextAiringEpisode stay: browse cards render them.
// Measures serialized search-body bytes at perPage 50 plus build time.
// Response-side bytes need a live authenticated session and are not
// measured here.

use std::hint::black_box;
use std::time::Instant;

const CURRENT_SELECTION: &str = "id title { romaji english native } coverImage { medium } episodes averageScore format type startDate { year month day } synonyms duration status genres tags { name } description(asHtml: false) coverImage { large } season seasonYear studios { nodes { id name } } nextAiringEpisode { episode airingAt }";

const TRIMMED_SELECTION: &str = "id title { romaji english native } coverImage { medium } episodes averageScore format type startDate { year month day } synonyms duration status genres tags { name } description(asHtml: false) season seasonYear nextAiringEpisode { episode airingAt }";

fn search_body(selection: &str) -> serde_json::Value {
    serde_json::json!({
        "query": format!("query ($page: Int, $perPage: Int) {{ Page(page: $page, perPage: $perPage) {{ media {{ {selection} }} }} }}"),
        "variables": { "page": 1, "perPage": 50 },
    })
}

fn main() {
    println!("AniList list-trim benchmark (offline; no network requests)");
    let current = search_body(CURRENT_SELECTION);
    let trimmed = search_body(TRIMMED_SELECTION);
    let current_bytes = serde_json::to_vec(&current).expect("current body serializes").len();
    let trimmed_bytes = serde_json::to_vec(&trimmed).expect("trimmed body serializes").len();
    println!("current request body bytes={current_bytes}");
    println!("trimmed request body bytes={trimmed_bytes}");
    println!(
        "saved per request bytes={} ({:.1}%)",
        current_bytes - trimmed_bytes,
        (current_bytes - trimmed_bytes) as f64 / current_bytes as f64 * 100.0
    );
    for (name, selection) in [("current", CURRENT_SELECTION), ("trimmed", TRIMMED_SELECTION)] {
        let iterations = 10_000;
        let started = Instant::now();
        let mut sink = 0usize;
        for _ in 0..iterations {
            let body = black_box(search_body(black_box(selection)));
            sink += serde_json::to_vec(black_box(&body))
                .expect("bench body serializes")
                .len();
        }
        let elapsed = started.elapsed();
        let per_iteration = elapsed.as_secs_f64() * 1_000_000.0 / f64::from(iterations);
        println!("{name}: iterations={iterations} avg={per_iteration:.2}us sink={sink}");
    }
}
