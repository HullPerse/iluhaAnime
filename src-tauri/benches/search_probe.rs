// Live smoke probe for the torrent search endpoints (manual run only).
//
// One request per source with the production client builders and the
// production scraper throttle, measuring status, time-to-headers, body time,
// bytes, and content type. Plus a polite single-datagram UDP handshake per
// fallback tracker (connect request only, no announce). Requests run
// sequentially to keep site load minimal; contention behavior is already
// covered by the details_batch queue timings.
//
// Run: `ILUHA_BENCH_LIVE=1 cargo bench --manifest-path src-tauri/Cargo.toml
// --bench search_probe`. Without the flag the bench prints a skip note and
// exits 0 so the default suite stays offline and deterministic (TESTING.md).
// Auth comes from env, never from the keyring: ILUHA_BENCH_RUTRACKER_COOKIE
// (raw Cookie header) and ILUHA_BENCH_NEKOBT_KEY (ssid value). Without them
// those targets report `not-authenticated`, mirroring how production refuses
// before any network.
//
// Divergences from production (deliberate, a bench has no AppHandle):
// - rutracker goes through the reqwest branch; the WebView2 browser branch
//   cannot run here and is reported as unavailable.
// - only the first attempt is measured; production retries up to 3 times.
// - probe body reads stop at an 8 MB safety cap and report truncation;
//   production search reads have no cap (see the audit findings).
// No timing asserts: live networks are nondeterministic. Budgets: none yet,
// this is the first measurement, record the environment with the numbers.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use futures::StreamExt;
use iluhaanime_lib::benchmark_api::{
    acquire_scraper_slot, build_client_inner, build_nekobt_client, build_rutracker_client_with_ua,
    RUTRACKER_DEFAULT_UA,
};
use tracing_subscriber::prelude::*;

const QUERY: &str = "Sousou no Frieren";
const PROBE_BODY_CAP: usize = 8 * 1024 * 1024;
const UDP_TIMEOUT: Duration = Duration::from_secs(5);
const JOIN_GUARD: Duration = Duration::from_secs(300);

const UDP_TRACKERS: &[&str] = &[
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.demonii.com:1337/announce",
    "udp://exodus.desync.com:6969/announce",
    "udp://explodie.org:6969/announce",
];

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

struct ProbeRow {
    source: &'static str,
    outcome: String,
    queue_ms: u128,
    headers_ms: u128,
    body_ms: u128,
    bytes: usize,
    content_type: String,
}

fn env_cookie(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .filter(|value| !value.trim().is_empty())
}

async fn probe_http(
    source: &'static str,
    client: Result<reqwest::Client, String>,
    build: impl FnOnce(reqwest::Client) -> reqwest::RequestBuilder,
) -> ProbeRow {
    let mut out = ProbeRow {
        source,
        outcome: String::new(),
        queue_ms: 0,
        headers_ms: 0,
        body_ms: 0,
        bytes: 0,
        content_type: String::new(),
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

    let sending = Instant::now();
    let response = match build(client).send().await {
        Ok(response) => response,
        Err(error) => {
            out.outcome = format!("request-error: {error}");
            return out;
        }
    };
    out.headers_ms = sending.elapsed().as_millis();
    let status = response.status().as_u16();
    out.content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();
    if !(200..300).contains(&status) {
        out.outcome = format!("http-{status}");
        return out;
    }
    let reading = Instant::now();
    let mut body = Vec::new();
    let mut truncated = false;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = match chunk {
            Ok(chunk) => chunk,
            Err(error) => {
                out.outcome = format!("read-error: {error}");
                return out;
            }
        };
        if body.len().saturating_add(chunk.len()) > PROBE_BODY_CAP {
            truncated = true;
            break;
        }
        body.extend_from_slice(&chunk);
    }
    out.body_ms = reading.elapsed().as_millis();
    out.bytes = body.len();
    out.outcome = if truncated {
        "ok-truncated-at-cap".to_string()
    } else {
        "ok".to_string()
    };
    out
}

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

async fn probe_nyaa(base: &'static str, source: &'static str, category: &'static str) -> ProbeRow {
    let client = build_client_inner(90, false, false, UA, None);
    probe_http(source, client, |client| {
        client.get(base).query(&[
            ("q", QUERY),
            ("c", category),
            ("format", "json"),
            ("p", "1"),
        ])
    })
    .await
}

async fn probe_erai() -> ProbeRow {
    let client = build_client_inner(30, false, false, UA, None);
    probe_http("erai-raws", client, |client| {
        client
            .get("https://animetosho.org/search")
            .query(&[("q", &format!("{QUERY} erai-raws"))])
    })
    .await
}

async fn probe_nekobt() -> ProbeRow {
    let Some(key) = env_cookie("ILUHA_BENCH_NEKOBT_KEY") else {
        return ProbeRow {
            source: "nekobt",
            outcome: "not-authenticated".to_string(),
            queue_ms: 0,
            headers_ms: 0,
            body_ms: 0,
            bytes: 0,
            content_type: String::new(),
        };
    };
    let client = build_nekobt_client(None);
    probe_http("nekobt", client, |client| {
        client
            .get("https://nekobt.to/api/v1/torrents/search")
            .header("Cookie", format!("ssid={key}"))
            .query(&[
                ("query", QUERY),
                ("limit", "20"),
                ("offset", "0"),
                ("sort_by", "seeders"),
            ])
    })
    .await
}

async fn probe_rutracker() -> ProbeRow {
    let Some(cookie) = env_cookie("ILUHA_BENCH_RUTRACKER_COOKIE") else {
        return ProbeRow {
            source: "rutracker",
            outcome: "not-authenticated".to_string(),
            queue_ms: 0,
            headers_ms: 0,
            body_ms: 0,
            bytes: 0,
            content_type: String::new(),
        };
    };
    let client = build_rutracker_client_with_ua(RUTRACKER_DEFAULT_UA, None);
    probe_http("rutracker", client, |client| {
        client
            .get("https://rutracker.org/forum/tracker.php")
            .header("Cookie", cookie)
            .header("Referer", "https://rutracker.org/forum/tracker.php")
            .query(&[("nm", QUERY)])
    })
    .await
}

async fn probe_udp_tracker(url: &str) -> (String, u128) {
    let host_port = url
        .strip_prefix("udp://")
        .unwrap_or(url)
        .split('/')
        .next()
        .unwrap_or("");
    let started = Instant::now();
    let mut addrs = match tokio::net::lookup_host(host_port).await {
        Ok(addrs) => addrs,
        Err(error) => return (format!("dns-error: {error}"), 0),
    };
    let Some(addr) = addrs.next() else {
        return ("dns-empty".to_string(), 0);
    };
    let socket = match tokio::net::UdpSocket::bind("0.0.0.0:0").await {
        Ok(socket) => socket,
        Err(error) => return (format!("bind-error: {error}"), 0),
    };
    let transaction: u32 = 0x5EED_1234;
    let mut request = [0u8; 16];
    request[0..8].copy_from_slice(&0x0417_2710_1980u64.to_be_bytes());
    request[8..12].copy_from_slice(&0u32.to_be_bytes());
    request[12..16].copy_from_slice(&transaction.to_be_bytes());
    if let Err(error) = socket.send_to(&request, addr).await {
        return (format!("send-error: {error}"), 0);
    }
    let mut buf = [0u8; 16];
    let outcome = tokio::time::timeout(UDP_TIMEOUT, socket.recv(&mut buf)).await;
    let elapsed = started.elapsed().as_millis();
    match outcome {
        Err(_) => ("timeout".to_string(), elapsed),
        Ok(Err(error)) => (format!("recv-error: {error}"), elapsed),
        Ok(Ok(len)) => {
            if len >= 16 && u32::from_be_bytes([buf[0], buf[1], buf[2], buf[3]]) == 0 {
                ("ok".to_string(), elapsed)
            } else {
                ("bad-response".to_string(), elapsed)
            }
        }
    }
}

async fn run() {
    println!(
        "search_probe: live run query={QUERY:?} os={}",
        std::env::consts::OS
    );
    let wall = Instant::now();
    let rows = [
        probe_nyaa("https://nyaa.si/", "nyaa", "1_0").await,
        probe_nyaa("https://sukebei.nyaa.si/", "sukebei", "0_0").await,
        probe_erai().await,
        probe_nekobt().await,
        probe_rutracker().await,
    ];
    for row in &rows {
        println!(
            "{:<9} {:<22} q={:>5}ms headers={:>7}ms body={:>7}ms bytes={:>8} content={}",
            row.source,
            row.outcome,
            row.queue_ms,
            row.headers_ms,
            row.body_ms,
            row.bytes,
            row.content_type.chars().take(40).collect::<String>(),
        );
    }
    println!("-- udp trackers (connect handshake only, no announce) --");
    for tracker in UDP_TRACKERS {
        let (outcome, elapsed) = tokio::time::timeout(JOIN_GUARD, probe_udp_tracker(tracker))
            .await
            .unwrap_or_else(|_| ("guard-elapsed".to_string(), 0));
        println!("{tracker:<48} {outcome:<12} {elapsed}ms");
    }
    let ok = rows.iter().filter(|row| row.outcome == "ok").count();
    let events = EVENT_COUNT.load(Ordering::Relaxed);
    println!(
        "search_probe: wall={:?} ok={}/{} tracing-events={} (browser branch: unavailable, needs AppHandle)",
        wall.elapsed(),
        ok,
        rows.len(),
        events,
    );
}

fn main() {
    if std::env::var("ILUHA_BENCH_LIVE").as_deref() != Ok("1") {
        println!("search_probe: skipped (set ILUHA_BENCH_LIVE=1 to hit the live sources)");
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
