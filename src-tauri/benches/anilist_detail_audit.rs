use iluhaanime_lib::benchmark_api::{
    anime_by_id_query, anime_by_ids_query, anime_full_query, anime_trailer_query,
    franchise_query_metrics, parse_animedia, MEDIA_CORE_SELECTION, MEDIA_DETAIL_EXTRA_SELECTION,
    MEDIA_LIST_EXTRA_SELECTION, MEDIA_RELATIONS_SELECTION, MEDIA_TRAILER_SELECTION,
};
use std::hint::black_box;
use std::time::Instant;

fn detail_fixture(id: u64) -> serde_json::Value {
    serde_json::json!({
        "id": id,
        "title": { "romaji": "Sousou no Frieren", "english": "Frieren", "native": "葬送のフリーレン" },
        "synonyms": ["Frieren at the Funeral"],
        "episodes": 28,
        "duration": 24,
        "format": "TV",
        "status": "FINISHED",
        "averageScore": 89,
        "genres": ["Adventure", "Drama", "Fantasy"],
        "tags": [{ "name": "Magic" }, { "name": "Philosophy" }],
        "description": "An elf mage revisits old bonds.",
        "coverImage": { "large": "https://img/large.jpg", "medium": "https://img/medium.jpg" },
        "bannerImage": "https://img/banner.jpg",
        "idMal": 52991,
        "trailer": { "id": "abc123", "site": "youtube" },
        "season": "FALL",
        "seasonYear": 2023,
        "startDate": { "year": 2023, "month": 9, "day": 29 },
        "endDate": { "year": 2024, "month": 3, "day": 22 },
        "studios": { "nodes": [{ "id": 222, "name": "Madhouse" }] },
        "popularity": 300_000,
        "favourites": 45000,
        "rankings": [{ "rank": 1, "type": "RATED", "context": "highest rated all time" }],
        "nextAiringEpisode": { "episode": null, "airingAt": null },
        "relations": { "edges": [
            { "relationType": "PREQUEL", "node": {
                "id": 1, "title": { "romaji": "Prequel", "english": "Prequel" },
                "coverImage": { "medium": "https://img/p.jpg" }, "episodes": 12,
                "averageScore": 80, "format": "TV", "type": "ANIME", "startDate": { "year": 2020 },
            } },
            { "relationType": "SEQUEL", "node": {
                "id": 3, "title": { "romaji": "Sequel", "english": null },
                "coverImage": { "medium": "https://img/s.jpg" }, "episodes": 24,
                "averageScore": 85, "format": "TV", "type": "ANIME", "startDate": { "year": 2025 },
            } },
        ] },
    })
}

fn block_bytes(query: &str, anchor: &str) -> usize {
    let start = query
        .find(anchor)
        .unwrap_or_else(|| panic!("query anchor not found: {anchor}"));
    let mut depth = 0i32;
    for (offset, byte) in query.as_bytes()[start..].iter().enumerate() {
        match byte {
            b'{' => depth += 1,
            b'}' => {
                assert!(depth > 0, "unbalanced closing brace after anchor: {anchor}");
                depth -= 1;
                if depth == 0 {
                    return offset + 1;
                }
            }
            _ => {}
        }
    }
    panic!("unbalanced braces after anchor: {anchor}");
}

fn print_section_breakdown() {
    let full = anime_full_query();
    let by_ids = anime_by_ids_query();
    println!("section bytes (query text only):");
    println!("  core={}", MEDIA_CORE_SELECTION.len());
    println!("  list_extra={}", MEDIA_LIST_EXTRA_SELECTION.len());
    println!("  detail_extra={}", MEDIA_DETAIL_EXTRA_SELECTION.len());
    println!("  trailer={}", MEDIA_TRAILER_SELECTION.len());
    println!("  relations={}", MEDIA_RELATIONS_SELECTION.len());
    let characters = block_bytes(&full, "characters(page: 1, perPage: 25)");
    let staff = block_bytes(&full, "staff {");
    let recs = block_bytes(
        &full,
        "recommendations(page: 1, perPage: 25, sort: RATING_DESC)",
    );
    println!("  characters={characters}");
    println!("  staff={staff}");
    println!("  recs={recs}");
    println!("  full_query={}", full.len());
    println!("  by_ids_query={}", by_ids.len());
    println!("  by_id_screen_query={}", anime_by_id_query().len());
    println!("  trailer_query={}", anime_trailer_query().len());
    let one = vec![21u64];
    let metrics = franchise_query_metrics(&one);
    println!("  franchise_query={}", metrics.query_bytes);
    let selection = MEDIA_CORE_SELECTION.len()
        + MEDIA_LIST_EXTRA_SELECTION.len()
        + MEDIA_DETAIL_EXTRA_SELECTION.len()
        + MEDIA_TRAILER_SELECTION.len()
        + MEDIA_RELATIONS_SELECTION.len();
    let chrome = full.len() - selection - characters - staff - recs;
    println!("  template_chrome={chrome}");
}

fn by_ids_body(ids: &[u64]) -> serde_json::Value {
    let chunk: Vec<i64> = ids.iter().map(|id| *id as i64).collect();
    serde_json::json!({
        "query": anime_by_ids_query(),
        "variables": { "ids": chunk },
    })
}

fn benchmark_bodies() {
    println!("by_ids single-body bytes (offline; command chunks at 25 ids per request):");
    for size in [1usize, 10, 25, 50] {
        let ids: Vec<u64> = (1..=size as u64).collect();
        let body = by_ids_body(&ids);
        let bytes = serde_json::to_vec(&body)
            .expect("by_ids body serializes")
            .len();
        let chunks = size.div_ceil(25);
        println!("  ids={size:>2} body_bytes={bytes} chunks={chunks}");
    }
    let full_body = serde_json::json!({ "query": anime_full_query(), "variables": { "id": 21 } });
    let full_bytes = serde_json::to_vec(&full_body)
        .expect("full body serializes")
        .len();
    println!("  full_detail body_bytes={full_bytes}");
    let by_id_body = serde_json::json!({ "query": anime_by_id_query(), "variables": { "id": 21 } });
    let by_id_bytes = serde_json::to_vec(&by_id_body)
        .expect("by_id screen body serializes")
        .len();
    println!("  by_id_screen body_bytes={by_id_bytes}");
    let trailer_body =
        serde_json::json!({ "query": anime_trailer_query(), "variables": { "id": 21 } });
    let trailer_bytes = serde_json::to_vec(&trailer_body)
        .expect("trailer body serializes")
        .len();
    println!("  trailer body_bytes={trailer_bytes}");
}

fn benchmark_parse(size: usize, iterations: usize) {
    let payloads: Vec<serde_json::Value> = (1..=size as u64).map(detail_fixture).collect();
    let first = parse_animedia(black_box(&payloads[0]));
    assert_eq!(first.id, 1);
    assert_eq!(first.relations.len(), 2);
    let started = Instant::now();
    let mut sink = 0usize;
    for _ in 0..iterations {
        for payload in &payloads {
            let media = parse_animedia(black_box(payload));
            sink += media.title.len() + media.titles.len() + media.relations.len();
        }
    }
    let elapsed = started.elapsed();
    let per_iteration = elapsed.as_secs_f64() * 1_000_000.0 / iterations as f64;
    let per_media = per_iteration / size as f64;
    println!(
        "parse size={size:>2} iterations={iterations:>6} avg={per_iteration:>8.2}us/iter ({per_media:.2}us/media) sink={sink}"
    );
}

fn main() {
    println!("AniList detail audit (offline; no network requests)");
    print_section_breakdown();
    benchmark_bodies();
    benchmark_parse(1, 10_000);
    benchmark_parse(25, 2_000);
    benchmark_parse(50, 2_000);
}
