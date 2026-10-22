use iluhaanime_lib::benchmark_api::{
    content_type, encode_path_segment, parse_range, StreamEntry, StreamRegistry,
};
use std::hint::black_box;
use std::net::SocketAddr;
use std::time::{Duration, Instant};

// Torrent streaming bench (torrent/stream.rs), timing the work the loopback
// handler does per request and per watch tick.
//
// Budget (bench profile, this machine, 2026-10-22):
//   range parse            1M requests median <= 250 ms
//   path segment encode    200k names  median <= 150 ms
//   token lookup           200k lookups median <= 300 ms
//
// mpv issues a range request for every seek and during normal playback the
// handler only parses one header and looks up one token; the range parser and
// the percent encoder are pure CPU on that path. The watch key resolves a URL
// to its stable path by scanning the token map (the registry caps it at 256
// entries), so one lookup has to stay far below the 1 s watch tick. Each
// scenario runs five times and prints the median; a checksum proves the work
// was not optimized away.
//
// Run with:
//   cargo bench --manifest-path src-tauri/Cargo.toml --bench torrent_stream

const RUNS: usize = 5;
const RANGE_OPS: usize = 1_000_000;
const LOOKUP_OPS: usize = 200_000;
const ENCODE_OPS: usize = 200_000;
const TOKENS: usize = 256;
const PAYLOAD_LEN: u64 = 8 * 1024 * 1024 * 1024;

const RANGES: [Option<&str>; 7] = [
    None,
    Some("bytes=0-"),
    Some("bytes=1048576-2097151"),
    Some("bytes=-65536"),
    Some("bytes=4294967296-"),
    Some("bytes=0-0"),
    Some("bytes=8388607999-"),
];

const NAMES: [&str; 4] = [
    "Show S01 - 01 [1080p].mkv",
    "Сезон 2/Серия 12 — финал.mkv",
    "Episode 003.ts",
    "SUB/English forced.ass",
];

fn fnv1a(bytes: &[u8], mut hash: u64) -> u64 {
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

fn median(mut samples: Vec<Duration>) -> Duration {
    samples.sort_unstable();
    samples[samples.len() / 2]
}

fn bench(name: &str, budget_ms: f64, runs: usize, mut run: impl FnMut() -> u64) {
    let mut samples = Vec::with_capacity(RUNS);
    let mut checksum = 0u64;
    for _ in 0..RUNS {
        let started = Instant::now();
        checksum ^= run();
        samples.push(started.elapsed());
    }
    let median = median(samples);
    let millis = median.as_secs_f64() * 1000.0;
    let verdict = if millis <= budget_ms {
        "ok"
    } else {
        "OVER BUDGET"
    };
    println!(
        "{name:<28} median {millis:>8.3} ms (budget {budget_ms:.1} ms) {verdict} runs {runs} checksum {checksum:016x}"
    );
}

fn range_parse_checksum() -> u64 {
    let mut checksum = 0u64;
    for index in 0..RANGE_OPS {
        let header = RANGES[index % RANGES.len()];
        let parsed = black_box(parse_range(header, PAYLOAD_LEN));
        checksum = checksum.wrapping_add(match parsed {
            Ok(Some((start, end))) => start ^ end,
            Ok(None) => 1,
            Err(_) => 2,
        });
    }
    checksum
}

fn encode_checksum() -> u64 {
    let mut checksum = 0u64;
    for index in 0..ENCODE_OPS {
        let name = NAMES[index % NAMES.len()];
        checksum = fnv1a(encode_path_segment(name).as_bytes(), checksum);
        checksum = fnv1a(content_type(name).as_bytes(), checksum);
    }
    checksum
}

fn lookup_checksum(registry: &StreamRegistry, url: &str) -> u64 {
    let mut checksum = 0u64;
    for _ in 0..LOOKUP_OPS {
        if let Some(path) = black_box(registry.canonical_for_target(black_box(url))) {
            checksum = fnv1a(path.as_bytes(), checksum);
        }
    }
    checksum
}

fn main() {
    bench("range parse", 250.0, RANGE_OPS, range_parse_checksum);
    bench("path encode and mime", 150.0, ENCODE_OPS, encode_checksum);

    let registry = StreamRegistry::default();
    let addr: SocketAddr = "127.0.0.1:45999".parse().expect("bench fixture addr");
    let mut last_url = String::new();
    for index in 0..TOKENS {
        let entry = StreamEntry::new(
            index % 4,
            index,
            format!("Show S01/Episode {index:03}.mkv"),
            PAYLOAD_LEN,
            format!("C:/Anime/Show S01/Episode {index:03}.mkv"),
        );
        last_url = registry.register(addr, entry).url.unwrap_or_default();
    }
    black_box(&registry);
    bench("token lookup", 300.0, LOOKUP_OPS, || {
        lookup_checksum(&registry, &last_url)
    });
}
