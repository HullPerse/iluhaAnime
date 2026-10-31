use iluhaanime_lib::benchmark_api::parse_torrent_detail_html;
use std::hint::black_box;
use std::time::Instant;

// Offline benchmark for torrent details parsing (scrapers/details.rs).
//
// Run with:
//   cargo bench --manifest-path src-tauri/Cargo.toml --bench details_parse

const HTML: &str = r#"
<html><body>
<table>
  <tr><th>Date Submitted</th><td>27/03/2026 16:36</td></tr>
  <tr><th>Comment</th><td>Video Info:<br>AVC<br>Audio: AAC</td></tr>
  <tr><th>File Name (Size)</th><td><a>release.mkv</a> <span>(661.9 MB)</span></td></tr>
</table>
</body></html>
"#;

fn main() {
    let iterations = 10_000usize;
    let started = Instant::now();
    let mut files = 0usize;
    for _ in 0..iterations {
        let details =
            parse_torrent_detail_html("erai-raws", "https://animetosho.org/view/example", HTML);
        files += black_box(details.files.len());
    }
    let elapsed = started.elapsed();
    println!(
        "parse_torrent_detail_html: iterations={} total={:?} avg={:.3}us files={}",
        iterations,
        elapsed,
        elapsed.as_secs_f64() * 1_000_000.0 / iterations as f64,
        files
    );
}
