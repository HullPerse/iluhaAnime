// Live batch benchmark for the torrent details pipeline (manual run only).
//
// Scope: the 12 example topics from `src/routes/test.route.tsx` through the
// production request shape of `get_torrent_details`
// (`src-tauri/src/scrapers/details.rs`): the same client builders, the same
// `acquire_scraper_slot` throttle (4 slots plus a 250 ms global spacing), the
// same 8 MB body cap, the same HTML decoding and the same
// `parse_torrent_detail_html`.
//
// Divergences from production (deliberate, a bench has no AppHandle):
// - rutracker goes through the reqwest branch (production uses the WebView2
//   `rutracker_browser_fetch` when no proxy is set); the parsed HTML is the same.
// - the rutracker `viewtorrent.php` file-tree backfill is skipped.
// - auth comes from env, never from the keyring: ILUHA_BENCH_RUTRACKER_COOKIE
//   (raw Cookie header value) and ILUHA_BENCH_NEKOBT_KEY (ssid value). Without
//   them those targets report `not-authenticated`, mirroring how production
//   refuses before any network.
// - erai-raws animetosho.org pages stay anonymous, as in production.
//
// Run: `ILUHA_BENCH_LIVE=1 cargo bench --manifest-path src-tauri/Cargo.toml
// --bench details_batch`. Without the flag the bench prints a skip note and
// exits 0 so the default suite stays offline and deterministic (TESTING.md).
// No timing asserts: live networks are nondeterministic. Budgets: none yet,
// this is the first measurement, record the environment with the numbers.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use futures::StreamExt;
use iluhaanime_lib::benchmark_api::{
    acquire_scraper_slot, build_client, build_nekobt_client, build_rutracker_client_with_ua,
    decode_rutracker_page, is_rutracker_challenge, parse_torrent_detail_html, TorrentDetails,
    RUTRACKER_DEFAULT_UA,
};
use tracing_subscriber::prelude::*;

const TARGETS: &[(&str, &str)] = &[
    ("rutracker", "https://rutracker.org/forum/viewtopic.php?t=6879823"),
    ("rutracker", "https://rutracker.org/forum/viewtopic.php?t=6442370"),
    ("rutracker", "https://rutracker.org/forum/viewtopic.php?t=6877836"),
    (
        "erai-raws",
        "https://animetosho.org/view/erai-raws-sousou-no-frieren-2nd-season-10.n2090700",
    ),
    (
        "erai-raws",
        "https://animetosho.org/view/erai-raws-touhai-densetsu-akagi-01-26-480p-multiple-subtitle.1322644",
    ),
    (
        "erai-raws",
        "https://animetosho.org/view/erai-raws-youjo-senki-01-12-1080p-multiple-subtitle.d234427",
    ),
    ("nyaa", "https://nyaa.si/view/2165245"),
    ("nyaa", "https://nyaa.si/view/2090638"),
    ("nyaa", "https://nyaa.si/view/2162609"),
    ("nekobt", "https://nekobt.to/torrents/13947047670024"),
    ("nekobt", "https://nekobt.to/torrents/8576892048134"),
    ("nekobt", "https://nekobt.to/torrents/13662079756555"),
];

const MAX_DETAIL_RESPONSE_BYTES: usize = 8 * 1024 * 1024;
const JOIN_GUARD: Duration = Duration::from_secs(180);

static EVENT_COUNT: AtomicU64 = AtomicU64::new(0);

struct CountingLayer;

impl<S> tracing_subscriber::layer::Layer<S> for CountingLayer
where
    S: tracing::Subscriber,
{
    fn on_event(
        &self,
        _event: &tracing::Event<'_>,
        _ctx: tracing_subscriber::layer::Context<'_, S>,
    ) {
        EVENT_COUNT.fetch_add(1, Ordering::Relaxed);
    }
}

#[derive(Default)]
struct TargetResult {
    source: &'static str,
    url: &'static str,
    outcome: String,
    queue_ms: u128,
    fetch_ms: u128,
    parse_ms: u128,
    body_bytes: usize,
    title_chars: usize,
    files: usize,
    screenshots: usize,
    fields: usize,
    comments: usize,
    blocks: usize,
    poster: bool,
    magnet: bool,
}

fn env_cookie(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .filter(|value| !value.trim().is_empty())
}

async fn fetch_one(source: &'static str, url: &'static str) -> TargetResult {
    let mut out = TargetResult {
        source,
        url,
        ..TargetResult::default()
    };
    let cookie: Option<String> = match source {
        "rutracker" => {
            let Some(value) = env_cookie("ILUHA_BENCH_RUTRACKER_COOKIE") else {
                out.outcome = "not-authenticated".to_string();
                return out;
            };
            Some(value)
        }
        "nekobt" => {
            let Some(value) = env_cookie("ILUHA_BENCH_NEKOBT_KEY") else {
                out.outcome = "not-authenticated".to_string();
                return out;
            };
            Some(format!("ssid={value}"))
        }
        _ => None,
    };
    let client = match source {
        "nekobt" => build_nekobt_client(None),
        "rutracker" => build_rutracker_client_with_ua(RUTRACKER_DEFAULT_UA, None),
        _ => build_client(None),
    };
    let client = match client {
        Ok(client) => client,
        Err(error) => {
            out.outcome = format!("client-error: {error}");
            return out;
        }
    };

    let queued = Instant::now();
    let Ok(_slot) = acquire_scraper_slot().await else {
        out.outcome = "slot-closed".to_string();
        return out;
    };
    out.queue_ms = queued.elapsed().as_millis();

    let fetching = Instant::now();
    let mut request = client.get(url);
    if let Some(cookie) = cookie {
        request = request.header("Cookie", cookie);
    }
    let response = match request.send().await {
        Ok(response) => response,
        Err(error) => {
            out.outcome = format!("request-error: {error}");
            return out;
        }
    };
    let status = response.status().as_u16();
    if !(200..300).contains(&status) {
        out.outcome = format!("http-{status}");
        return out;
    }
    let mut body = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = match chunk {
            Ok(chunk) => chunk,
            Err(error) => {
                out.outcome = format!("read-error: {error}");
                return out;
            }
        };
        if body.len().saturating_add(chunk.len()) > MAX_DETAIL_RESPONSE_BYTES {
            out.outcome = "too-large".to_string();
            return out;
        }
        body.extend_from_slice(&chunk);
    }
    out.fetch_ms = fetching.elapsed().as_millis();
    out.body_bytes = body.len();

    let html = if source == "rutracker" {
        std::borrow::Cow::Owned(decode_rutracker_page(&body))
    } else {
        String::from_utf8_lossy(&body)
    };
    if source == "rutracker" && is_rutracker_challenge(&html) {
        out.outcome = "challenge".to_string();
        return out;
    }
    let parsing = Instant::now();
    let details: TorrentDetails = parse_torrent_detail_html(source, url, &html);
    out.parse_ms = parsing.elapsed().as_millis();
    out.title_chars = details.title.chars().count();
    out.files = details.files.len();
    out.screenshots = details.screenshots.len();
    out.fields = details.fields.len();
    out.comments = details.comments.len();
    out.blocks = details.description_blocks.len();
    out.poster = details.poster.is_some();
    out.magnet = !details.magnet.is_empty();
    out.outcome = "ok".to_string();
    out
}

const fn yes_no(value: bool) -> &'static str {
    if value {
        "yes"
    } else {
        "no"
    }
}

async fn run() {
    println!(
        "details_batch: live run targets={} os={}",
        TARGETS.len(),
        std::env::consts::OS
    );
    let wall = Instant::now();
    let mut handles = Vec::with_capacity(TARGETS.len());
    for (source, url) in TARGETS {
        handles.push(tokio::spawn(fetch_one(source, url)));
    }
    let mut results = Vec::with_capacity(handles.len());
    for handle in handles {
        match tokio::time::timeout(JOIN_GUARD, handle).await {
            Ok(Ok(result)) => results.push(result),
            Ok(Err(error)) => eprintln!("details_batch: task failed: {error:?}"),
            Err(_) => eprintln!("details_batch: join guard elapsed"),
        }
    }
    for result in &results {
        println!(
            "{:<9} {:<72} {:<18} q={:>5}ms fetch={:>7}ms parse={:>4}ms bytes={:>8} title={:>4} files={:>4} shots={:>3} fields={:>3} comments={:>3} blocks={:>3} poster={:<3} magnet={:<3}",
            result.source,
            result.url,
            result.outcome,
            result.queue_ms,
            result.fetch_ms,
            result.parse_ms,
            result.body_bytes,
            result.title_chars,
            result.files,
            result.screenshots,
            result.fields,
            result.comments,
            result.blocks,
            yes_no(result.poster),
            yes_no(result.magnet),
        );
    }
    let ok = results
        .iter()
        .filter(|result| result.outcome == "ok")
        .count();
    let worst = results
        .iter()
        .map(|result| result.queue_ms + result.fetch_ms + result.parse_ms)
        .max()
        .unwrap_or(0);
    let events = EVENT_COUNT.load(Ordering::Relaxed);
    println!(
        "details_batch: wall={:?} ok={}/{} worst-single={}ms tracing-events={}",
        wall.elapsed(),
        ok,
        results.len(),
        worst,
        events,
    );
}

fn main() {
    if std::env::var("ILUHA_BENCH_LIVE").as_deref() != Ok("1") {
        println!("details_batch: skipped (set ILUHA_BENCH_LIVE=1 to hit the live sources)");
        return;
    }
    let filter = tracing_subscriber::EnvFilter::new("iluhaanime=info,tauri=warn");
    let _ = tracing_subscriber::registry()
        .with(CountingLayer)
        .with(filter)
        .try_init();
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("bench runtime starts");
    runtime.block_on(run());
}
