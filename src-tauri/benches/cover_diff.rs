use iluhaanime_lib::benchmark_api::{compare_cover_bytes, CoverDiff};
use std::hint::black_box;
use std::time::Instant;

// Offline benchmark for the cover pixel-diff gate in user_assets.rs.
// Encodes synthetic covers once, then measures compare throughput on the
// 64px common size plus the cost of decoding production-sized JPEG thumbs.
// Run with:
//   cargo bench --manifest-path src-tauri/Cargo.toml --bench cover_diff

fn solid_png(width: u32, height: u32, pixel: [u8; 3]) -> Vec<u8> {
    let rgb = image::RgbImage::from_pixel(width, height, image::Rgb(pixel));
    let mut bytes = Vec::new();
    rgb.write_with_encoder(image::codecs::png::PngEncoder::new(&mut bytes))
        .expect("bench png encode");
    bytes
}

fn solid_jpeg(width: u32, height: u32, pixel: [u8; 3]) -> Vec<u8> {
    let rgb = image::RgbImage::from_pixel(width, height, image::Rgb(pixel));
    let mut bytes = Vec::new();
    rgb.write_with_encoder(image::codecs::jpeg::JpegEncoder::new_with_quality(
        &mut bytes, 90,
    ))
    .expect("bench jpeg encode");
    bytes
}

fn bench(name: &str, iterations: usize, mut run: impl FnMut() -> CoverDiff) {
    let mut same = 0usize;
    let started = Instant::now();
    for _ in 0..iterations {
        if black_box(run()) == CoverDiff::Same {
            same += 1;
        }
    }
    let elapsed = started.elapsed();
    let per = elapsed.as_secs_f64() * 1_000_000.0 / iterations as f64;
    println!("{name}: iterations={iterations} total={elapsed:?} avg={per:.1}us same={same}");
}

fn main() {
    let red = solid_png(64, 64, [200, 30, 40]);
    let red_copy = red.clone();
    let blue = solid_png(64, 64, [30, 40, 200]);
    let thumb = solid_jpeg(336, 480, [200, 30, 40]);
    let thumb_copy = thumb.clone();
    assert_eq!(
        compare_cover_bytes(&red, &red_copy),
        Ok(CoverDiff::Same)
    );
    assert_eq!(compare_cover_bytes(&red, &blue), Ok(CoverDiff::Different));

    bench("png64 same", 200, || {
        compare_cover_bytes(&red, &red_copy).expect("bench compare")
    });
    bench("png64 different", 200, || {
        compare_cover_bytes(&red, &blue).expect("bench compare")
    });
    bench("jpeg336 same", 50, || {
        compare_cover_bytes(&thumb, &thumb_copy).expect("bench compare")
    });
}
