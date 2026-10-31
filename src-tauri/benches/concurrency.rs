use std::hint::black_box;
use std::thread;
use std::time::Instant;

// Concurrency overhead benchmark. Measures thread spawn cost and the
// break-even point where parallel work beats serial work.

const N: usize = 100_000;

fn work(items: &[u64]) -> u64 {
    items
        .iter()
        .fold(0u64, |acc, x| acc.wrapping_add(x.wrapping_mul(31)))
}

fn main() {
    let data: Vec<u64> = (0..N as u64).collect();

    // Serial baseline
    let started = Instant::now();
    let serial = work(&data);
    let serial_ms = started.elapsed().as_secs_f64() * 1000.0;
    println!("serial: {:.3} ms result={}", serial_ms, serial);

    // Thread spawn overhead (empty body)
    let started = Instant::now();
    let mut handles = Vec::with_capacity(8);
    for _ in 0..8 {
        handles.push(thread::spawn(|| black_box(0u64)));
    }
    for h in handles {
        let _ = h.join();
    }
    let spawn_ms = started.elapsed().as_secs_f64() * 1000.0;
    println!("spawn 8 empty threads: {:.3} ms", spawn_ms);

    // Parallel 8 chunks
    let started = Instant::now();
    let chunk = N / 8;
    let mut par = 0u64;
    thread::scope(|s| {
        let mut handles = Vec::with_capacity(8);
        for i in 0..8 {
            let slice = &data[i * chunk..(i + 1) * chunk];
            handles.push(s.spawn(move || work(slice)));
        }
        for h in handles {
            par = par.wrapping_add(h.join().unwrap());
        }
    });
    let par_ms = started.elapsed().as_secs_f64() * 1000.0;
    println!(
        "parallel 8 chunks: {:.3} ms result={} speedup={:.2}x",
        par_ms,
        par,
        serial_ms / par_ms
    );
}
