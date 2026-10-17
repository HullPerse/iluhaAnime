use iluhaanime_lib::benchmark_api::{Chip8, Quirks};
use std::hint::black_box;
use std::time::{Duration, Instant};

// CHIP-8 core bench (game/chip8.rs), timing kind only.
//
// Budget (AMD Ryzen 7 5800X, Windows 11, rustc 1.98.0, bench profile, 2026-10-17):
//   draw_heavy tick         median <= 100 ns/cycle
//   logic tick              median <=  30 ns/cycle
//   frame packing           median <= 5.0 us/frame
//   12-cycle + pack pipeline median <= 100 us (0.6% of the 16.67 ms frame budget)
//
// The workload is the UI contract: at 60 Hz the render loop asks for the
// elapsed slice of a 720 Hz CHIP-8 clock (12 cycles per frame) and packs the
// framebuffer into the `game_tick` response. Each scenario runs five times and
// prints the median; the FNV-1a checksum of the packed frame proves the runner
// did the work and the optimizer did not delete it.
//
// Run with:
//   cargo bench --manifest-path src-tauri/Cargo.toml --bench chip8

const RUNS: usize = 5;
const FRAME_BUDGET_SECONDS: f64 = 0.016_666_7;
const CHIP8_HZ: f64 = 720.0;
const FNV_OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
const FNV_PRIME: u64 = 0x0000_0100_0000_01b3;

fn fnv1a(bytes: &[u8]) -> u64 {
    bytes.iter().fold(FNV_OFFSET, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(FNV_PRIME)
    })
}

fn pack_and_checksum(vm: &Chip8, out: &mut Vec<u8>) -> u64 {
    vm.pack_frame(out);
    fnv1a(out)
}

fn median(mut samples: Vec<Duration>) -> Duration {
    samples.sort_unstable();
    samples[samples.len() / 2]
}

/// Worst-case workload: every second cycle XOR-draws a 5-row sprite.
fn draw_heavy_rom() -> Vec<u8> {
    let mut rom = vec![
        0xA2, 0x10, // I = 0x210 (sprite)
        0xD0, 0x15, // draw 5 rows at (V0, V1)
        0x70, 0x01, // V0 += 1
        0x12, 0x02, // jmp 0x202
    ];
    rom.resize(0x10, 0x00);
    rom.extend_from_slice(&[0xFF; 5]); // 8x5 solid sprite
    rom
}

/// Light mix closer to real game logic: arithmetic, compare, branch.
fn logic_rom() -> Vec<u8> {
    vec![
        0x60, 0x01, // V0 = 1
        0x70, 0x01, // V0 += 1
        0x80, 0x04, // V0 += V0
        0x30, 0x40, // skip if V0 == 0x40
        0x12, 0x02, // jmp 0x202
        0x12, 0x00, // jmp 0x200
    ]
}

fn bench_cycles(name: &str, rom: &[u8], cycles: u64, budget_ns: f64) {
    let mut samples = Vec::with_capacity(RUNS);
    let mut digest = 0_u64;
    let mut frame = Vec::new();
    for _ in 0..RUNS {
        let mut vm = Chip8::new(Quirks::CHIP8);
        vm.load(rom).expect("bench rom loads");
        let started = Instant::now();
        for _ in 0..cycles {
            vm.tick();
        }
        samples.push(started.elapsed());
        digest = pack_and_checksum(&vm, &mut frame);
    }
    let total = median(samples);
    let per_cycle_ns = total.as_secs_f64() / cycles as f64 * 1e9;
    let max_hz = 1e9 / per_cycle_ns;
    println!(
        "{name}: cycles={cycles} median={total:?} per_cycle={per_cycle_ns:.1}ns max_hz={max_hz:.0} chip8_720hz_headroom={:.0}x budget<={budget_ns:.0}ns/cycle pass={} checksum=0x{digest:016x}",
        max_hz / CHIP8_HZ,
        if per_cycle_ns <= budget_ns { "yes" } else { "no" },
    );
}

fn bench_frame_packing(frames: usize, budget_us: f64) {
    let mut samples = Vec::with_capacity(RUNS);
    let mut digest = 0_u64;
    for _ in 0..RUNS {
        let mut vm = Chip8::new(Quirks::CHIP8);
        vm.load(&draw_heavy_rom()).expect("bench rom loads");
        // Two ticks: the first sets I, the second draws the sprite, so the
        // packed frame is not blank (checksum would match an empty buffer).
        vm.tick();
        vm.tick();
        let mut out = Vec::with_capacity(vm.frame_len());
        let started = Instant::now();
        for _ in 0..frames {
            vm.pack_frame(&mut out);
            black_box(out.as_ptr());
        }
        samples.push(started.elapsed());
        digest = fnv1a(&out);
    }
    let total = median(samples);
    let per_frame_us = total.as_secs_f64() / frames as f64 * 1e6;
    println!(
        "frame_packing: frames={frames} median={total:?} per_frame={per_frame_us:.2}us of_16.67ms_budget={:.3}% budget<={budget_us:.1}us pass={} checksum=0x{digest:016x}",
        per_frame_us * 1e-6 / FRAME_BUDGET_SECONDS * 100.0,
        if per_frame_us <= budget_us { "yes" } else { "no" },
    );
}

fn bench_frame_pipeline(budget_us: f64) {
    // One 60 Hz frame of the draw-heavy worst case at 720 cycles: the number
    // the render loop actually pays per frame.
    let rom = draw_heavy_rom();
    let frames: u32 = 200;
    let mut samples = Vec::with_capacity(RUNS);
    let mut digest = 0_u64;
    let mut out = Vec::new();
    for _ in 0..RUNS {
        let mut vm = Chip8::new(Quirks::CHIP8);
        vm.load(&rom).expect("bench rom loads");
        out.clear();
        out.reserve(vm.frame_len());
        let started = Instant::now();
        for _ in 0..frames {
            for _ in 0..12 {
                vm.tick();
            }
            vm.pack_frame(&mut out);
        }
        samples.push(started.elapsed());
        digest = fnv1a(&out);
    }
    let total = median(samples);
    let per_frame_us = total.as_secs_f64() / f64::from(frames) * 1e6;
    println!(
        "frame_pipeline(12 cycles + pack): median={total:?} per_frame={per_frame_us:.2}us of_16.67ms_budget={:.3}% budget<={budget_us:.1}us pass={} checksum=0x{digest:016x}",
        per_frame_us * 1e-6 / FRAME_BUDGET_SECONDS * 100.0,
        if per_frame_us <= budget_us { "yes" } else { "no" },
    );
}

fn main() {
    bench_cycles("draw_heavy", &draw_heavy_rom(), 2_000_000, 100.0);
    bench_cycles("logic", &logic_rom(), 10_000_000, 30.0);
    bench_frame_packing(20_000, 5.0);
    bench_frame_pipeline(100.0);
}
