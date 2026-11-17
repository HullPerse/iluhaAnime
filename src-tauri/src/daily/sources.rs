use std::collections::HashSet;
use std::io::Cursor;
use std::sync::Arc;
use std::time::Duration;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::{imageops::FilterType, DynamicImage, GenericImageView, RgbImage};
use serde::Deserialize;

use crate::scrapers::clients::{read_body_capped, Ipv4FirstResolver};

use super::pool::PoolEntry;

pub(crate) const SHIKIMORI_API_BASES: &[&str] = &[
    "https://shikimori.io/api/animes",
    "https://shikimori.one/api/animes",
    "https://shikimori.tv/api/animes",
];
pub(crate) const SHIKIMORI_IMAGE_HOSTS: &[&str] =
    &["shikimori.one", "shikimori.tv", "shikimori.io"];
const MAX_BODY_BYTES: usize = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES: usize = 12 * 1024 * 1024;
const DISPLAY_WIDTH: u32 = 960;
const DISPLAY_HEIGHT: u32 = 540;
const FULL_FRAME_MAX_WIDTH: u32 = 1920;
const FULL_FRAME_MAX_HEIGHT: u32 = 1080;
const JPEG_QUALITY: u8 = 80;
const FULL_FRAME_JPEG_QUALITY: u8 = 90;
const FIRST_CROP_SHARE: f64 = 0.30;
const CROP_STEP: f64 = 0.14;
const FULL_FRAME_SLOT: u32 = 5;
const MIN_SCREENSHOTS: usize = 6;
const MIN_VARIANCE: f64 = 120.0;
const CROP_POSITIONS: u32 = 6;
const BLACK_LEVEL: f64 = 18.0;
const MAX_EDGE_TRIM: f64 = 0.20;

#[derive(Debug, Deserialize)]
struct ShikimoriShot {
    original: String,
    #[serde(default)]
    preview: Option<String>,
}

fn client(proxy: Option<&str>) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .user_agent(format!(
            "iluhaAnime/{} (desktop client)",
            env!("CARGO_PKG_VERSION")
        ))
        .timeout(Duration::from_secs(20))
        .connect_timeout(Duration::from_secs(10))
        .dns_resolver(Arc::new(Ipv4FirstResolver));
    if let Some(proxy) = proxy {
        builder = builder
            .proxy(reqwest::Proxy::all(proxy).map_err(|error| format!("image proxy: {error}"))?);
    }
    builder
        .build()
        .map_err(|error| format!("image client: {error}"))
}

/// Shikimori first, then Tenrai episode stills for the shortfall. Both lists
/// are deduplicated and only HTTPS image URLs survive.
pub async fn screenshot_urls(
    entry: &PoolEntry,
    proxy: Option<&str>,
) -> Result<Vec<String>, String> {
    if entry.mal_id <= 0 {
        return Err("daily candidate has no MAL id".into());
    }
    let mut urls = Vec::new();
    let mut shikimori_usable = false;
    match shikimori_screenshots(entry.mal_id, proxy).await {
        Ok(mut shots) => {
            shikimori_usable = shots.len() >= MIN_SCREENSHOTS;
            urls.append(&mut shots);
        }
        Err(error) => tracing::warn!(
            mal_id = entry.mal_id,
            error = error.as_str(),
            "shikimori screenshots unavailable"
        ),
    }
    if shikimori_usable && !urls.is_empty() {
        shikimori_usable = image_host_reachable(&urls[0], proxy).await;
        if !shikimori_usable {
            tracing::warn!(
                mal_id = entry.mal_id,
                "shikimori image host is unreachable, adding tenrai stills"
            );
        }
    }
    if !shikimori_usable {
        match crate::tenrai::episode_images(entry.mal_id, proxy).await {
            Ok(extra) => urls.extend(extra),
            Err(error) => tracing::warn!(
                mal_id = entry.mal_id,
                error = error.as_str(),
                "tenrai episode images unavailable"
            ),
        }
    }
    let mut seen = HashSet::new();
    urls.retain(|url| is_image_url(url) && seen.insert(url.clone()));
    if urls.is_empty() {
        return Err("no screenshot source returned images".into());
    }
    Ok(urls)
}

async fn shikimori_screenshots(mal_id: i64, proxy: Option<&str>) -> Result<Vec<String>, String> {
    let client = client(proxy)?;
    let mut last_error = String::from("shikimori request failed");
    for base in SHIKIMORI_API_BASES {
        match shikimori_host_screenshots(&client, base, mal_id).await {
            Ok(urls) => return Ok(urls),
            Err(error) => {
                tracing::warn!(
                    host = *base,
                    error = error.as_str(),
                    "shikimori screenshot host unavailable"
                );
                last_error = error;
            }
        }
    }
    Err(last_error)
}

/// A URL list is not enough: the API can answer while the image host is
/// blocked. Probe the first screenshot before trusting the whole list, so the
/// Tenrai stills are still tried when the host is filtered.
async fn image_host_reachable(url: &str, proxy: Option<&str>) -> bool {
    let Ok(client) = client(proxy) else {
        return false;
    };
    let referer_host = reqwest::Url::parse(url)
        .ok()
        .and_then(|url| url.host_str().map(str::to_string))
        .unwrap_or_else(|| "shikimori.one".to_string());
    let request = client
        .head(url)
        .header(reqwest::header::REFERER, format!("https://{referer_host}/"));
    match tokio::time::timeout(Duration::from_secs(6), request.send()).await {
        Ok(Ok(response)) => {
            let status = response.status();
            if status == reqwest::StatusCode::METHOD_NOT_ALLOWED {
                return true;
            }
            if status == reqwest::StatusCode::FORBIDDEN || status.is_server_error() {
                return false;
            }
            response
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|value| value.to_str().ok())
                .map_or(true, |kind| kind.to_ascii_lowercase().starts_with("image/"))
        }
        _ => false,
    }
}

async fn shikimori_host_screenshots(
    client: &reqwest::Client,
    base: &str,
    mal_id: i64,
) -> Result<Vec<String>, String> {
    let response = client
        .get(format!("{base}/{mal_id}/screenshots"))
        .send()
        .await
        .map_err(|error| format!("shikimori request: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("shikimori answered {status}"));
    }
    let body = read_body_capped(response, MAX_BODY_BYTES)
        .await
        .map_err(|error| format!("shikimori body: {error:?}"))?;
    let shots: Vec<ShikimoriShot> =
        serde_json::from_slice(&body).map_err(|error| format!("shikimori parse: {error}"))?;
    let mut seen = HashSet::new();
    let mut urls = Vec::new();
    for shot in shots {
        for raw in std::iter::once(shot.original).chain(shot.preview) {
            let url = normalize_url(&raw);
            if is_image_url(&url) && seen.insert(url.clone()) {
                urls.push(url);
            }
        }
    }
    Ok(urls)
}

/// Shikimori returns screenshot paths relative to its site, while Tenrai
/// returns absolute URLs. Normalize both before validating and downloading.
fn normalize_url(raw: &str) -> String {
    let raw = raw.trim();
    if raw.starts_with("//") {
        format!("https:{raw}")
    } else if raw.starts_with('/') {
        format!("https://shikimori.one{raw}")
    } else {
        raw.to_string()
    }
}

/// Shikimori mirrors the same screenshot paths on several hosts. When one
/// host is blocked by the ISP, the download retries the same path on another
/// host instead of failing the whole candidate.
fn image_url_variants(raw: &str) -> Vec<String> {
    let Ok(url) = reqwest::Url::parse(raw.trim()) else {
        return vec![raw.to_string()];
    };
    let Some(host) = url.host_str() else {
        return vec![raw.to_string()];
    };
    if !SHIKIMORI_IMAGE_HOSTS.contains(&host) {
        return vec![raw.to_string()];
    }
    SHIKIMORI_IMAGE_HOSTS
        .iter()
        .map(|candidate| {
            if *candidate == host {
                raw.to_string()
            } else {
                let mut copy = url.clone();
                let _ = copy.set_host(Some(*candidate));
                copy.to_string()
            }
        })
        .collect()
}

fn is_image_url(raw: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(raw.trim()) else {
        return false;
    };
    if url.scheme() != "https" {
        return false;
    }
    let path = url.path().to_ascii_lowercase();
    [".jpg", ".jpeg", ".png", ".webp"]
        .iter()
        .any(|extension| path.ends_with(extension))
}

async fn download_bytes(url: &str, proxy: Option<&str>) -> Result<Vec<u8>, String> {
    let client = client(proxy)?;
    let mut last_error = String::from("frame download failed");
    for candidate in image_url_variants(url) {
        let referer_host = reqwest::Url::parse(&candidate)
            .ok()
            .and_then(|url| url.host_str().map(str::to_string))
            .unwrap_or_else(|| "shikimori.one".to_string());
        match download_one(&client, &candidate, &referer_host).await {
            Ok(bytes) => return Ok(bytes),
            Err(error) => {
                tracing::debug!(error = error.as_str(), "daily frame host unavailable");
                last_error = error;
            }
        }
    }
    Err(last_error)
}

async fn download_one(
    client: &reqwest::Client,
    url: &str,
    referer_host: &str,
) -> Result<Vec<u8>, String> {
    let response = client
        .get(url)
        .header(reqwest::header::REFERER, format!("https://{referer_host}/"))
        .send()
        .await
        .map_err(|error| format!("frame download: {error}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("frame host answered {status}"));
    }
    if let Some(kind) = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
    {
        if !kind.to_ascii_lowercase().starts_with("image/") {
            return Err(format!("frame host returned {kind}"));
        }
    }
    read_body_capped(response, MAX_IMAGE_BYTES)
        .await
        .map_err(|error| format!("frame body: {error:?}"))
}

pub async fn download_frame(
    url: &str,
    seed: u64,
    slot: u32,
    proxy: Option<&str>,
) -> Result<String, String> {
    let bytes = download_bytes(url, proxy).await?;
    let image =
        image::load_from_memory(&bytes).map_err(|error| format!("decode frame: {error}"))?;
    crop_and_encode(&image, seed, slot)
}

/// The reveal screen needs the whole screenshot, not the progressive crop.
/// Keep the source framing and only bound the stored copy to a useful modal
/// size; small screenshots are left untouched instead of being upscaled.
pub async fn download_full_frame(url: &str, proxy: Option<&str>) -> Result<String, String> {
    let bytes = download_bytes(url, proxy).await?;
    let image =
        image::load_from_memory(&bytes).map_err(|error| format!("decode frame: {error}"))?;
    encode_full_frame_hq(&trim_black_bars(&image))
}

/// The first frame is a tight 30 percent crop. Each next frame opens up
/// another step, and the sixth frame is the full screenshot without a crop.
fn crop_share(slot: u32) -> f64 {
    if slot >= FULL_FRAME_SLOT {
        1.0
    } else {
        FIRST_CROP_SHARE + f64::from(slot) * CROP_STEP
    }
}

/// One real crop per frame, zooming out as the round advances.
pub fn crop_and_encode(image: &DynamicImage, seed: u64, slot: u32) -> Result<String, String> {
    let image = trim_black_bars(image);
    let (width, height) = image.dimensions();
    if width < 64 || height < 64 {
        return Err("frame is too small to crop".into());
    }
    let share = crop_share(slot);
    if share >= 1.0 {
        return encode_full_frame(&image);
    }
    let mut crop_width = (f64::from(width) * share).round() as u32;
    let mut crop_height = (f64::from(crop_width) * 9.0 / 16.0).round() as u32;
    if crop_height > height {
        crop_height = (f64::from(height) * share).round() as u32;
        crop_width = (f64::from(crop_height) * 16.0 / 9.0).round() as u32;
    }
    let crop_width = crop_width.clamp(32, width);
    let crop_height = crop_height.clamp(18, height);
    let max_x = width - crop_width;
    let max_y = height - crop_height;

    let mut best: Option<(DynamicImage, f64)> = None;
    for position in 0..CROP_POSITIONS {
        let x = (unit(seed, slot, position * 2) * f64::from(max_x)).floor() as u32;
        let y = (unit(seed, slot, position * 2 + 1) * f64::from(max_y)).floor() as u32;
        let crop = image.crop_imm(x, y, crop_width, crop_height);
        let variance = luminance_variance(&crop);
        if best
            .as_ref()
            .is_none_or(|(_, best_variance)| variance > *best_variance)
        {
            best = Some((crop, variance));
        }
        if variance >= MIN_VARIANCE {
            break;
        }
    }
    let Some((crop, _)) = best else {
        return Err("frame crop failed".into());
    };
    let resized = crop.resize_exact(DISPLAY_WIDTH, DISPLAY_HEIGHT, FilterType::Lanczos3);
    encode_jpeg(&resized)
}

/// The final frame is the whole screenshot, letterboxed into the same 16:9
/// canvas instead of being cropped.
fn encode_full_frame(image: &DynamicImage) -> Result<String, String> {
    let resized = image.resize(DISPLAY_WIDTH, DISPLAY_HEIGHT, FilterType::Lanczos3);
    let mut canvas =
        image::RgbaImage::from_pixel(DISPLAY_WIDTH, DISPLAY_HEIGHT, image::Rgba([0, 0, 0, 255]));
    let top = resized.to_rgba8();
    let x = i64::from((DISPLAY_WIDTH - top.width()) / 2);
    let y = i64::from((DISPLAY_HEIGHT - top.height()) / 2);
    image::imageops::overlay(&mut canvas, &top, x, y);
    encode_jpeg(&DynamicImage::ImageRgba8(canvas))
}

/// Full-frame copy for the result modal. It is never cropped or zoomed; the
/// long edge is capped so a 4K screenshot does not turn into a multi-megabyte
/// IPC payload.
fn encode_full_frame_hq(image: &DynamicImage) -> Result<String, String> {
    let (width, height) = image.dimensions();
    let bounded = if width > FULL_FRAME_MAX_WIDTH || height > FULL_FRAME_MAX_HEIGHT {
        image.thumbnail(FULL_FRAME_MAX_WIDTH, FULL_FRAME_MAX_HEIGHT)
    } else {
        image.clone()
    };
    encode_jpeg_with_quality(&bounded, FULL_FRAME_JPEG_QUALITY)
}

fn encode_jpeg(image: &DynamicImage) -> Result<String, String> {
    encode_jpeg_with_quality(image, JPEG_QUALITY)
}

fn encode_jpeg_with_quality(image: &DynamicImage, quality: u8) -> Result<String, String> {
    let mut bytes = Vec::new();
    let mut encoder =
        image::codecs::jpeg::JpegEncoder::new_with_quality(Cursor::new(&mut bytes), quality);
    encoder
        .encode_image(image)
        .map_err(|error| format!("encode frame: {error}"))?;
    Ok(format!("data:image/jpeg;base64,{}", STANDARD.encode(bytes)))
}

pub(crate) fn unit(seed: u64, slot: u32, salt: u32) -> f64 {
    let mut value =
        seed ^ (u64::from(slot) << 32) ^ u64::from(salt).wrapping_mul(0x9E37_79B9_7F4A_7C15);
    value ^= value >> 30;
    value = value.wrapping_mul(0xBF58_476D_1CE4_E5B9);
    value ^= value >> 27;
    value = value.wrapping_mul(0x94D0_49BB_1331_11EB);
    value ^= value >> 31;
    (value % 10_000) as f64 / 10_000.0
}

fn luminance_variance(image: &DynamicImage) -> f64 {
    let (width, height) = image.dimensions();
    let mut sum = 0.0;
    let mut sum_squared = 0.0;
    let mut count = 0.0;
    for y in (0..height).step_by(8) {
        for x in (0..width).step_by(8) {
            let pixel = image.get_pixel(x, y);
            let luminance = 0.2126 * f64::from(pixel[0])
                + 0.7152 * f64::from(pixel[1])
                + 0.0722 * f64::from(pixel[2]);
            sum += luminance;
            sum_squared += luminance * luminance;
            count += 1.0;
        }
    }
    if count == 0.0 {
        0.0
    } else {
        (sum_squared / count - (sum / count).powi(2)).max(0.0)
    }
}

/// Trims near-black letterbox bars, bounded to 20 percent per edge so a dark
/// scene is never eaten whole.
fn trim_black_bars(image: &DynamicImage) -> DynamicImage {
    let rgb = image.to_rgb8();
    let (width, height) = rgb.dimensions();
    let max_rows = (f64::from(height) * MAX_EDGE_TRIM).round() as u32;
    let max_columns = (f64::from(width) * MAX_EDGE_TRIM).round() as u32;
    let mut top = 0;
    while top < max_rows && row_luminance(&rgb, top) < BLACK_LEVEL {
        top += 1;
    }
    let mut bottom = 0;
    while bottom < max_rows && row_luminance(&rgb, height - 1 - bottom) < BLACK_LEVEL {
        bottom += 1;
    }
    let mut left = 0;
    while left < max_columns && column_luminance(&rgb, left, top, bottom) < BLACK_LEVEL {
        left += 1;
    }
    let mut right = 0;
    while right < max_columns
        && column_luminance(&rgb, width - 1 - right, top, bottom) < BLACK_LEVEL
    {
        right += 1;
    }
    let trimmed_width = width.saturating_sub(left + right).max(32);
    let trimmed_height = height.saturating_sub(top + bottom).max(32);
    image.crop_imm(left, top, trimmed_width, trimmed_height)
}

fn row_luminance(image: &RgbImage, y: u32) -> f64 {
    let width = image.width();
    let step = (width / 64).max(1);
    let mut sum = 0.0;
    let mut count = 0.0;
    for x in (0..width).step_by(step as usize) {
        let pixel = image.get_pixel(x, y);
        sum += 0.2126 * f64::from(pixel[0])
            + 0.7152 * f64::from(pixel[1])
            + 0.0722 * f64::from(pixel[2]);
        count += 1.0;
    }
    if count == 0.0 {
        0.0
    } else {
        sum / count
    }
}

fn column_luminance(image: &RgbImage, x: u32, top: u32, bottom: u32) -> f64 {
    let height = image.height();
    let start = top.min(height.saturating_sub(1));
    let end = height.saturating_sub(bottom).max(start + 1);
    let step = ((end - start) / 64).max(1);
    let mut sum = 0.0;
    let mut count = 0.0;
    for y in (start..end).step_by(step as usize) {
        let pixel = image.get_pixel(x, y);
        sum += 0.2126 * f64::from(pixel[0])
            + 0.7152 * f64::from(pixel[1])
            + 0.0722 * f64::from(pixel[2]);
        count += 1.0;
    }
    if count == 0.0 {
        0.0
    } else {
        sum / count
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gradient(width: u32, height: u32) -> DynamicImage {
        DynamicImage::ImageRgb8(RgbImage::from_fn(width, height, |x, y| {
            image::Rgb([(x % 256) as u8, (y % 256) as u8, ((x + y) % 256) as u8])
        }))
    }

    #[test]
    fn the_crop_is_a_jpeg_data_url_at_the_display_size() {
        let url = crop_and_encode(&gradient(640, 360), 7, 0).expect("crop");
        assert!(url.starts_with("data:image/jpeg;base64,"));
        let encoded = url.trim_start_matches("data:image/jpeg;base64,");
        let bytes = STANDARD.decode(encoded).expect("base64");
        let decoded = image::load_from_memory(&bytes).expect("jpeg");
        assert_eq!(decoded.dimensions(), (DISPLAY_WIDTH, DISPLAY_HEIGHT));
    }

    #[test]
    fn every_frame_opens_up_and_the_last_one_is_full() {
        let shares: Vec<f64> = (0..6).map(crop_share).collect();
        assert!(shares.windows(2).all(|pair| pair[0] < pair[1]));
        assert_eq!(shares.last().copied(), Some(1.0));
    }

    #[test]
    fn the_full_reveal_frame_keeps_the_whole_picture_at_source_size() {
        let url = encode_full_frame_hq(&gradient(1600, 900)).expect("full frame");
        assert!(url.starts_with("data:image/jpeg;base64,"));
        let encoded = url.trim_start_matches("data:image/jpeg;base64,");
        let bytes = STANDARD.decode(encoded).expect("base64");
        let decoded = image::load_from_memory(&bytes).expect("jpeg");
        assert_eq!(decoded.dimensions(), (1600, 900));
    }

    #[test]
    fn black_bars_are_trimmed_before_cropping() {
        let mut rgb = RgbImage::from_pixel(640, 360, image::Rgb([255, 255, 255]));
        for y in 0..60 {
            for x in 0..640 {
                rgb.put_pixel(x, y, image::Rgb([0, 0, 0]));
                rgb.put_pixel(x, 359 - y, image::Rgb([0, 0, 0]));
            }
        }
        let trimmed = trim_black_bars(&DynamicImage::ImageRgb8(rgb));
        assert!(trimmed.height() <= 240, "height {}", trimmed.height());
    }

    #[test]
    fn relative_shikimori_paths_become_absolute() {
        assert_eq!(
            normalize_url("/system/screenshots/a.jpg?1"),
            "https://shikimori.one/system/screenshots/a.jpg?1"
        );
        assert_eq!(
            normalize_url("//cdn.example/a.webp"),
            "https://cdn.example/a.webp"
        );
        assert_eq!(
            normalize_url("https://cdn.example/a.jpg"),
            "https://cdn.example/a.jpg"
        );
    }

    #[test]
    fn blocked_shikimori_hosts_have_image_mirrors() {
        let variants = image_url_variants("https://shikimori.one/system/screenshots/a.jpg");
        assert_eq!(variants.len(), SHIKIMORI_IMAGE_HOSTS.len());
        assert!(variants
            .iter()
            .any(|url| url.starts_with("https://shikimori.tv/")));
        assert_eq!(
            image_url_variants("https://cdn.example/a.jpg"),
            vec!["https://cdn.example/a.jpg"]
        );
    }

    #[test]
    fn only_https_image_urls_pass() {
        assert!(is_image_url("https://shikimori.one/a.jpg"));
        assert!(!is_image_url("http://shikimori.one/a.jpg"));
        assert!(!is_image_url("https://example.com/a.html"));
        assert!(!is_image_url("not a url"));
    }
}
