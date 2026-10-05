//! Benchmark for the guest-side Watch Party sync engine (P3).
//!
//! Follows the `anilist_queries` pattern: `harness = false` and a plain `main`
//! that times the pure math with `std::time::Instant`. No network and no player,
//! so it runs anywhere. The "2-player" part is numeric: a guest starts 350 ms
//! ahead of the host snapshot and the controller has to pull it into the drift
//! deadband.

use std::hint::black_box;
use std::time::Instant;

use iluhaanime_lib::benchmark_api::{
    LagStatus, PlaybackState, SyncController, SyncInstruction, SyncRuntime, EVAL_INTERVAL_MS,
};

fn snapshot(position: f64, is_playing: bool) -> PlaybackState {
    PlaybackState {
        revision: 1,
        media_id: "bench".into(),
        position,
        is_playing,
        rate: 1.0,
        updated_at_mono: 0.0,
    }
}

fn primed_runtime() -> SyncRuntime {
    let mut runtime = SyncRuntime::default();
    runtime.on_host_state(snapshot(100.0, true));
    runtime.on_ping(1);
    // Host clock == guest clock, 20 ms RTT.
    runtime.on_pong(1, 0.0, 10.0, 20.0);
    runtime
}

fn bench_sample(iterations: usize, local_offset_ms: f64) {
    let mut runtime = primed_runtime();
    // At `now` the expected host position is ~100.99 s; keep the guest offset flat.
    let now = 1_000.0;
    let local_position = 100.0 + local_offset_ms / 1000.0;
    let started = Instant::now();
    let mut last_instruction = None;
    for _ in 0..iterations {
        last_instruction =
            black_box(runtime.sample(black_box(now), black_box(local_position), "bench"));
    }
    let elapsed = started.elapsed();
    println!(
        "sample offset={local_offset_ms:>7.0}ms iterations={iterations} total={elapsed:?} avg={:>8.1}ns instruction={last_instruction:?} lag={:?}",
        elapsed.as_nanos() as f64 / iterations as f64,
        runtime.lag_status()
    );
}

fn bench_controller(iterations: usize) {
    let mut controller = SyncController::default();
    let started = Instant::now();
    for index in 0..iterations {
        // Alternate inside and just outside the deadband so the EWMA keeps moving.
        let drift = if index % 2 == 0 { 120.0 } else { 320.0 };
        let _ = black_box(controller.on_sample(black_box(drift)));
    }
    let elapsed = started.elapsed();
    println!(
        "controller iterations={iterations} total={elapsed:?} avg={:>8.1}ns correction={:.5}",
        elapsed.as_nanos() as f64 / iterations as f64,
        controller.correction()
    );
}

fn bench_convergence() {
    let mut guest = primed_runtime();
    let mut local_position = 100.35;
    let mut now_ms = 20.0;
    let mut rate = 1.0;
    let mut steps = 0usize;
    let started = Instant::now();
    loop {
        now_ms += EVAL_INTERVAL_MS as f64;
        local_position += (EVAL_INTERVAL_MS as f64) / 1000.0 * rate;
        match guest.sample(now_ms, local_position, "bench") {
            Some(SyncInstruction::SetRate(next)) => rate = next,
            Some(SyncInstruction::Seek(position)) => {
                local_position = position;
                guest.on_playback_restart();
                rate = 1.0;
            }
            None => {}
        }
        steps += 1;
        if steps >= 1_000 || guest.drift_ms().abs() <= 150.0 {
            break;
        }
    }
    let elapsed = started.elapsed();
    assert_eq!(guest.lag_status(), LagStatus::Good);
    println!(
        "convergence steps={steps} sim={:.2}s wall={elapsed:?} final_drift={:.3}ms rate={rate:.5}",
        now_ms / 1000.0,
        guest.drift_ms()
    );
}

fn main() {
    println!("Watch Party sync benchmark (pure math; no network, no player)");
    let iterations = 1_000_000;
    bench_sample(iterations, 0.0);
    bench_sample(iterations, 300.0);
    bench_sample(iterations, 1_500.0);
    bench_controller(iterations);
    for _ in 0..3 {
        bench_convergence();
    }
}
