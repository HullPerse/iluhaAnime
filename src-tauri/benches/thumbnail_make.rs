use iluhaanime_lib::benchmark_api::make_thumb336;
use std::hint::black_box;
use std::time::{Duration, Instant};

// Thumbnail generation bench (user_assets::make_thumb336).
// Builds one wide JPEG in memory, then decodes/resizes/encodes it many
// times to keep the hot path (decode + resize + JPEG encode) measurable.
//
// Run with:
//   cargo bench --manifest-path src-tauri/Cargo.toml --bench thumbnail_make

fn make_jpeg(width: u32, height: u32) -> Vec<u8> {
    let image = image::DynamicImage::new_rgb8(width, height);
    let mut out = Vec::new();
    image
        .write_with_encoder(image::codecs::jpeg::JpegEncoder::new_with_quality(
            &mut out, 90,
        ))
        .expect("encode fixture jpeg");
    out
}

fn main() {
    let bytes = make_jpeg(800, 400);
    let iterations = 20usize;
    let mut samples = Vec::with_capacity(iterations);
    let mut checksum = 0u64;
    for _ in 0..iterations {
        let started = Instant::now();
        let thumb = make_thumb336(&bytes).expect("thumbnail");
        samples.push(started.elapsed());
        checksum = checksum.wrapping_add(thumb.len() as u64);
        black_box(&thumb);
    }
    samples.sort_unstable();
    let median = samples[samples.len() / 2];
    let total: Duration = samples.iter().copied().sum();
    let avg = total / iterations as u32;
    println!(
        "make_thumb336: iterations={} median={:?} avg={:?} checksum={}",
        iterations, median, avg, checksum
    );
}
