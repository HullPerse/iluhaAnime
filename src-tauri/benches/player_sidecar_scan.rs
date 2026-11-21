// Sidecar scan latency bench.
//
// `handleFileLoaded` waits for `scan_sidecar_tracks` before it applies the
// saved file state and seeks to the resume position. This bench measures the
// exact command on a season folder with unrelated files, matching subtitles
// and a nested folder, both with and without subfolder scanning.
//
// Run with:
//   cargo bench --manifest-path src-tauri/Cargo.toml --features bench-api --bench player_sidecar_scan

use std::hint::black_box;
use std::path::PathBuf;
use std::time::Instant;

use iluhaanime_lib::benchmark_api::player_sidecar;

const RUNS: usize = 20;
const OTHER_FILES: usize = 2_000;
const SIDECARS: usize = 200;

fn fixture_root() -> PathBuf {
    std::env::temp_dir().join(format!("iluha_sidecar_scan_bench_{}", std::process::id()))
}

fn build_fixture(root: &std::path::Path) {
    std::fs::create_dir_all(root).expect("bench sidecar dir");
    std::fs::write(root.join("episode.mkv"), b"x").expect("bench video");
    for index in 0..OTHER_FILES {
        std::fs::write(root.join(format!("unrelated_{index:04}.bin")), b"x")
            .expect("bench unrelated file");
    }
    for index in 0..SIDECARS {
        std::fs::write(root.join(format!("episode {index:03}.srt")), b"x").expect("bench subtitle");
    }
    let nested = root.join("Subs");
    std::fs::create_dir_all(&nested).expect("bench nested dir");
    for index in 0..SIDECARS {
        std::fs::write(nested.join(format!("episode {index:03}.ass")), b"x")
            .expect("bench nested subtitle");
    }
}

async fn bench(name: &str, runs: usize, subfolders: bool, video: &str) {
    let audio = vec!["mka".to_string(), "aac".to_string()];
    let subtitles = vec!["srt".to_string(), "ass".to_string()];
    let mut samples = Vec::with_capacity(runs);
    let mut tracks = 0usize;
    for _ in 0..runs {
        let started = Instant::now();
        tracks = black_box(
            player_sidecar::scan(
                video.to_string(),
                audio.clone(),
                subtitles.clone(),
                subfolders,
            )
            .await
            .tracks,
        );
        samples.push(started.elapsed());
    }
    samples.sort_unstable();
    let median = samples[samples.len() / 2].as_secs_f64() * 1000.0;
    println!("{name:<44} median {median:>8.3} ms  tracks={tracks}");
}

fn main() {
    let root = fixture_root();
    build_fixture(&root);
    let video = root.join("episode.mkv").to_string_lossy().to_string();
    println!("fixture: other_files={OTHER_FILES} sidecars={SIDECARS} nested_sidecars={SIDECARS}");

    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .expect("bench sidecar runtime");
    runtime.block_on(async {
        bench("scan_sidecar_tracks subfolders=false", RUNS, false, &video).await;
        bench("scan_sidecar_tracks subfolders=true", RUNS, true, &video).await;
    });

    let _ = std::fs::remove_dir_all(&root);
}
