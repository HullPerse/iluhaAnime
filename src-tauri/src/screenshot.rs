use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use tauri::Manager;

/// Every pending capture lives in the OS temp dir under this prefix, so the startup sweep in
/// `lib.rs` (which deletes `iluha_*` from temp) also clears the ones a crash left behind.
const TEMP_PREFIX: &str = "iluha_screenshot_";
const MAX_CAPTURE_BYTES: u64 = 96 * 1024 * 1024;
const READ_CHUNK: usize = 1024 * 1024;
const JPEG_QUALITY: u8 = 90;
const COLLISION_LIMIT: u32 = 10_000;
const MAX_LAYER_BYTES: u64 = 48 * 1024 * 1024;
const MIN_BLUR_SIGMA: f32 = 0.5;
const MAX_BLUR_SIGMA: f32 = 64.0;
const DEFAULT_BLUR_SIGMA: f32 = 8.0;

/// Two copies inside the same millisecond would otherwise share one temp file and one of them would
/// read the other's pixels back.
static COPY_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotCapture {
    pub path: String,
    pub width: u32,
    pub height: u32,
    pub default_dir: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedScreenshot {
    pub path: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Copy, serde::Deserialize)]
pub struct CropRegion {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// The blurred region: `mask` is an image the size of the capture whose alpha marks the pixels to
/// hide, `sigma` is the blur strength in source pixels.
#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlurPatch {
    pub mask: String,
    #[serde(default = "default_blur_sigma")]
    pub sigma: f32,
}

/// Everything the frontend drew on top of the shot. Both images are base64 PNGs the size of the
/// capture, so the two sides agree on the pixels without the frontend ever touching the capture.
#[derive(Clone, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotLayers {
    #[serde(default)]
    pub drawing: Option<String>,
    #[serde(default)]
    pub blur: Option<BlurPatch>,
}

const fn default_blur_sigma() -> f32 {
    DEFAULT_BLUR_SIGMA
}

#[derive(Clone, Copy)]
pub enum ScreenshotFormat {
    Png,
    Jpeg,
}

impl ScreenshotFormat {
    fn parse(raw: &str) -> Result<Self, String> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "png" => Ok(Self::Png),
            "jpg" | "jpeg" => Ok(Self::Jpeg),
            other => Err(format!("unsupported image format: {other}")),
        }
    }

    const fn extension(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Jpeg => "jpg",
        }
    }
}

fn timestamp_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis())
        .unwrap_or_default()
}

/// Resolves the folder the save dialog starts from: the user's pictures, then home, then temp.
fn default_dir(window: &tauri::WebviewWindow) -> String {
    let resolver = window.app_handle().path();
    resolver
        .picture_dir()
        .or_else(|_| resolver.home_dir())
        .or_else(|_| resolver.temp_dir())
        .map_or_else(|_| String::new(), |dir| dir.to_string_lossy().to_string())
}

fn image_size(bytes: &[u8]) -> Result<(u32, u32), String> {
    image::ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|error| format!("read the capture header: {error}"))?
        .into_dimensions()
        .map_err(|error| format!("read the capture size: {error}"))
}

/// Strips anything that could move the write out of the chosen folder: only the last path
/// component survives, and Windows-illegal characters, control characters and trailing dots
/// or spaces are removed.
fn sanitize_name(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("the file name is empty".to_string());
    }
    let base = trimmed.rsplit(['/', '\\']).next().unwrap_or(trimmed);
    let cleaned: String = base
        .chars()
        .filter(|character| !character.is_control() && !"<>:\"/\\|?*".contains(*character))
        .collect();
    let cleaned = cleaned.trim().trim_end_matches('.').trim_end();
    if cleaned.is_empty() {
        return Err("the file name has no usable characters".to_string());
    }
    Ok(cleaned.to_string())
}

/// Picks `name.ext`, then `name_1.ext`, `name_2.ext` and so on while those names are taken.
fn resolve_target(dir: &Path, name: &str, extension: &str) -> PathBuf {
    let first = dir.join(format!("{name}.{extension}"));
    if !first.exists() {
        return first;
    }
    for index in 1..COLLISION_LIMIT {
        let candidate = dir.join(format!("{name}_{index}.{extension}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    dir.join(format!("{name}_{}.{extension}", timestamp_millis()))
}

fn copy_temp_path() -> PathBuf {
    let dir = std::env::temp_dir();
    let stamp = timestamp_millis();
    for _ in 0..COLLISION_LIMIT {
        let sequence = COPY_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let candidate = dir.join(format!("{TEMP_PREFIX}copy_{stamp}_{sequence}.png"));
        if !candidate.exists() {
            return candidate;
        }
    }
    dir.join(format!(
        "{TEMP_PREFIX}copy_{stamp}_{}.png",
        COPY_SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ))
}

fn same_directory(left: &Path, right: &Path) -> bool {
    match (left.canonicalize(), right.canonicalize()) {
        (Ok(left), Ok(right)) => left == right,
        _ => false,
    }
}

/// Only a pending capture in the temp dir may be read or deleted through these commands,
/// otherwise they would be a generic read-or-delete primitive over any path the webview names.
fn guard_source(source_path: &str) -> Result<PathBuf, String> {
    let path = Path::new(source_path);
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    if !name.starts_with(TEMP_PREFIX) {
        return Err("the capture is no longer available".to_string());
    }
    if !path
        .parent()
        .is_some_and(|parent| same_directory(parent, &std::env::temp_dir()))
    {
        return Err("the capture is no longer available".to_string());
    }
    if !path.is_file() {
        return Err("the capture is no longer available".to_string());
    }
    Ok(path.to_path_buf())
}

/// Clamps the requested region to the image, so a stale rect from the UI can never produce an
/// empty or out-of-range crop.
fn crop_image(
    image: &image::DynamicImage,
    region: &CropRegion,
) -> Result<image::DynamicImage, String> {
    let x = region.x.min(image.width().saturating_sub(1));
    let y = region.y.min(image.height().saturating_sub(1));
    let width = region.width.max(1).min(image.width() - x);
    let height = region.height.max(1).min(image.height() - y);
    if width == 0 || height == 0 {
        return Err("the crop area is empty".to_string());
    }
    Ok(image.crop_imm(x, y, width, height))
}

/// The frontend sends what it drew as a base64 PNG, either bare or as a `data:` URL.
fn decode_layer(data: &str, label: &str) -> Result<Vec<u8>, String> {
    let payload = data.rsplit_once(',').map_or(data, |(_, payload)| payload);
    let bytes = STANDARD
        .decode(payload.trim())
        .map_err(|error| format!("decode the {label}: {error}"))?;
    if bytes.is_empty() {
        return Err(format!("the {label} is empty"));
    }
    if bytes.len() as u64 > MAX_LAYER_BYTES {
        return Err(format!("the {label} is too large"));
    }
    Ok(bytes)
}

/// A layer has to line up with the capture pixel for pixel, so a mismatch is an error rather than a
/// silent rescale that would move the whole drawing.
fn decode_layer_image(
    data: &str,
    bounds: (u32, u32),
    label: &str,
) -> Result<image::RgbaImage, String> {
    let bytes = decode_layer(data, label)?;
    let decoded = image::load_from_memory(&bytes)
        .map_err(|error| format!("read the {label}: {error}"))?
        .to_rgba8();
    if decoded.dimensions() != bounds {
        return Err(format!("the {label} does not match the capture size"));
    }
    Ok(decoded)
}

/// Blurs a copy of the whole image and puts back only the pixels the mask marks, so the region the
/// user hid is unreadable while everything around it stays untouched.
fn blur_masked(
    image: &mut image::DynamicImage,
    patch: &BlurPatch,
    bounds: (u32, u32),
) -> Result<(), String> {
    let mask = decode_layer_image(&patch.mask, bounds, "blur mask")?;
    let sigma = if patch.sigma.is_finite() {
        patch.sigma.clamp(MIN_BLUR_SIGMA, MAX_BLUR_SIGMA)
    } else {
        DEFAULT_BLUR_SIGMA
    };
    let mut soft = image.blur(sigma).to_rgba8();
    for (x, y, pixel) in soft.enumerate_pixels_mut() {
        pixel.0[3] = mask.get_pixel(x, y).0[3];
    }
    let mut base = image.to_rgba8();
    image::imageops::overlay(&mut base, &soft, 0, 0);
    *image = image::DynamicImage::ImageRgba8(base);
    Ok(())
}

fn paint_layer(
    image: &mut image::DynamicImage,
    data: &str,
    bounds: (u32, u32),
) -> Result<(), String> {
    let layer = decode_layer_image(data, bounds, "annotation layer")?;
    let mut base = image.to_rgba8();
    image::imageops::overlay(&mut base, &layer, 0, 0);
    *image = image::DynamicImage::ImageRgba8(base);
    Ok(())
}

/// Order matters: the blur hides content, the drawing and the text go on top of it. Both happen on
/// the full capture, before any crop, so a mark outside the selection simply falls away with it.
fn bake_layers(
    image: &mut image::DynamicImage,
    layers: Option<&ScreenshotLayers>,
) -> Result<(), String> {
    let Some(layers) = layers else {
        return Ok(());
    };
    let bounds = (image.width(), image.height());
    if let Some(patch) = layers.blur.as_ref() {
        blur_masked(image, patch, bounds)?;
    }
    if let Some(drawing) = layers.drawing.as_deref() {
        paint_layer(image, drawing, bounds)?;
    }
    Ok(())
}

fn encode_to(
    path: &Path,
    image: &image::DynamicImage,
    format: ScreenshotFormat,
) -> Result<(), String> {
    let file =
        std::fs::File::create(path).map_err(|error| format!("create the screenshot: {error}"))?;
    let mut writer = std::io::BufWriter::new(file);
    let encoded = match format {
        ScreenshotFormat::Png => {
            image.write_with_encoder(image::codecs::png::PngEncoder::new(&mut writer))
        }
        ScreenshotFormat::Jpeg => image.write_with_encoder(
            image::codecs::jpeg::JpegEncoder::new_with_quality(&mut writer, JPEG_QUALITY),
        ),
    };
    if let Err(error) = encoded {
        drop(writer);
        let _ = std::fs::remove_file(path);
        return Err(format!("encode the screenshot: {error}"));
    }
    std::io::Write::flush(&mut writer).map_err(|error| format!("write the screenshot: {error}"))
}

fn save_capture(
    source_path: &str,
    dir: &str,
    name: &str,
    format: &str,
    crop: Option<&CropRegion>,
    layers: Option<&ScreenshotLayers>,
) -> Result<SavedScreenshot, String> {
    let source = guard_source(source_path)?;
    let format = ScreenshotFormat::parse(format)?;
    let target_dir = Path::new(dir);
    if !target_dir.is_dir() {
        return Err("the destination folder does not exist".to_string());
    }
    let base = sanitize_name(name)?;
    let mut image = image::open(&source).map_err(|error| format!("read the capture: {error}"))?;
    bake_layers(&mut image, layers)?;
    let image = match crop {
        Some(region) => crop_image(&image, region)?,
        None => image,
    };
    let target = resolve_target(target_dir, &base, format.extension());
    encode_to(&target, &image, format)?;
    Ok(SavedScreenshot {
        path: target.to_string_lossy().to_string(),
        width: image.width(),
        height: image.height(),
    })
}

/// Writes the region that goes to the clipboard as its own PNG. Without a region the pending
/// capture is returned as is, so the common "copy the whole shot" case never re-encodes.
fn prepare_copy(
    source_path: &str,
    crop: Option<&CropRegion>,
    layers: Option<&ScreenshotLayers>,
) -> Result<String, String> {
    let source = guard_source(source_path)?;
    let has_layers = layers.is_some_and(|layers| layers.drawing.is_some() || layers.blur.is_some());
    if crop.is_none() && !has_layers {
        return Ok(source.to_string_lossy().to_string());
    }
    let mut image = image::open(&source).map_err(|error| format!("read the capture: {error}"))?;
    bake_layers(&mut image, layers)?;
    let Some(region) = crop else {
        let target = copy_temp_path();
        encode_to(&target, &image, ScreenshotFormat::Png)?;
        return Ok(target.to_string_lossy().to_string());
    };
    let cropped = crop_image(&image, region)?;
    let target = copy_temp_path();
    encode_to(&target, &cropped, ScreenshotFormat::Png)?;
    Ok(target.to_string_lossy().to_string())
}

#[cfg(windows)]
fn read_stream(stream: &windows::Win32::System::Com::IStream) -> Result<Vec<u8>, String> {
    use windows::Win32::System::Com::STREAM_SEEK_SET;

    unsafe { stream.Seek(0, STREAM_SEEK_SET, None) }
        .map_err(|error| format!("rewind the capture: {error}"))?;
    let mut bytes = Vec::new();
    let mut buffer = vec![0u8; READ_CHUNK];
    loop {
        let mut read = 0u32;
        let result = unsafe {
            stream.Read(
                buffer.as_mut_ptr().cast(),
                READ_CHUNK as u32,
                Some(std::ptr::from_mut(&mut read)),
            )
        };
        result
            .ok()
            .map_err(|error| format!("read the capture: {error}"))?;
        if read == 0 {
            break;
        }
        bytes.extend_from_slice(&buffer[..read as usize]);
        if bytes.len() as u64 > MAX_CAPTURE_BYTES {
            return Err("the capture is too large".to_string());
        }
    }
    if bytes.is_empty() {
        return Err("the capture came back empty".to_string());
    }
    Ok(bytes)
}

/// Captures the visible part of the webview through the `WebView2` COM interface. The callback is
/// delivered over the window message queue, so `wait_with_pump` keeps dispatching messages while
/// it waits; that is why the whole call has to run on the UI thread, inside `with_webview`.
#[cfg(windows)]
fn capture_webview_png(webview: &tauri::webview::PlatformWebview) -> Result<Vec<u8>, String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2CapturePreviewCompletedHandler, COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG,
    };
    use webview2_com::{wait_with_pump, CapturePreviewCompletedHandler};
    use windows::Win32::Foundation::HGLOBAL;
    use windows::Win32::System::Com::StructuredStorage::CreateStreamOnHGlobal;

    let controller = webview.controller();
    let core = unsafe { controller.CoreWebView2() }
        .map_err(|error| format!("the webview is not ready: {error}"))?;
    let stream = unsafe { CreateStreamOnHGlobal(HGLOBAL::default(), true) }
        .map_err(|error| format!("create the capture stream: {error}"))?;
    let (sender, receiver) = std::sync::mpsc::channel::<Result<Vec<u8>, String>>();
    let reader = stream.clone();
    let handler: ICoreWebView2CapturePreviewCompletedHandler =
        CapturePreviewCompletedHandler::create(Box::new(
            move |result: windows::core::Result<()>| {
                let outcome = match result {
                    Ok(()) => read_stream(&reader),
                    Err(error) => Err(format!("capture the page: {error}")),
                };
                let _ = sender.send(outcome);
                Ok(())
            },
        ));
    unsafe {
        core.CapturePreview(
            COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG,
            &stream,
            &handler,
        )
    }
    .map_err(|error| format!("capture the page: {error}"))?;
    wait_with_pump(receiver).map_err(|error| format!("capture the page: {error}"))?
}

#[cfg(not(windows))]
fn capture_webview_png(_webview: &tauri::webview::PlatformWebview) -> Result<Vec<u8>, String> {
    Err("screenshots are only supported on Windows".to_string())
}

#[tauri::command]
pub async fn capture_screenshot(window: tauri::WebviewWindow) -> Result<ScreenshotCapture, String> {
    if !window.is_visible().unwrap_or(true) {
        return Err("the window is hidden, there is nothing to capture".to_string());
    }
    let (sender, receiver) = std::sync::mpsc::channel::<Result<Vec<u8>, String>>();
    window
        .with_webview(move |webview| {
            let _ = sender.send(capture_webview_png(&webview));
        })
        .map_err(|error| format!("capture the page: {error}"))?;
    let bytes = receiver
        .recv()
        .map_err(|_| "capture the page: the webview went away".to_string())??;
    let (width, height) = image_size(&bytes)?;
    let path = std::env::temp_dir().join(format!("{TEMP_PREFIX}{}.png", timestamp_millis()));
    std::fs::write(&path, &bytes).map_err(|error| format!("write the capture: {error}"))?;
    Ok(ScreenshotCapture {
        path: path.to_string_lossy().to_string(),
        width,
        height,
        default_dir: default_dir(&window),
    })
}

#[tauri::command]
pub async fn save_screenshot(
    source_path: String,
    dir: String,
    name: String,
    format: String,
    crop: Option<CropRegion>,
    layers: Option<ScreenshotLayers>,
) -> Result<SavedScreenshot, String> {
    tokio::task::spawn_blocking(move || {
        save_capture(
            &source_path,
            &dir,
            &name,
            &format,
            crop.as_ref(),
            layers.as_ref(),
        )
    })
    .await
    .map_err(|error| format!("save task failed: {error}"))?
}

#[tauri::command]
pub async fn copy_screenshot(
    source_path: String,
    crop: Option<CropRegion>,
    layers: Option<ScreenshotLayers>,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || prepare_copy(&source_path, crop.as_ref(), layers.as_ref()))
        .await
        .map_err(|error| format!("copy task failed: {error}"))?
}

fn discard_capture(source_path: &str) -> Result<(), String> {
    let Ok(path) = guard_source(source_path) else {
        return Ok(());
    };
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("discard the capture: {error}")),
    }
}

#[tauri::command]
pub async fn discard_screenshot(source_path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || discard_capture(&source_path))
        .await
        .map_err(|error| format!("discard task failed: {error}"))?
}

#[cfg(test)]
mod tests {
    use image::GenericImageView;

    use super::*;

    fn temp_dir_for(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "iluha_screenshot_test_{name}_{}",
            timestamp_millis()
        ));
        std::fs::create_dir_all(&dir).expect("create test dir");
        dir
    }

    #[test]
    fn format_parsing_accepts_png_and_both_jpeg_spellings() {
        assert!(matches!(
            ScreenshotFormat::parse("png"),
            Ok(ScreenshotFormat::Png)
        ));
        assert!(matches!(
            ScreenshotFormat::parse("PNG"),
            Ok(ScreenshotFormat::Png)
        ));
        assert!(matches!(
            ScreenshotFormat::parse(" jpeg "),
            Ok(ScreenshotFormat::Jpeg)
        ));
        assert!(matches!(
            ScreenshotFormat::parse("jpg"),
            Ok(ScreenshotFormat::Jpeg)
        ));
        assert!(ScreenshotFormat::parse("webp").is_err());
        assert!(ScreenshotFormat::parse("").is_err());
    }

    #[test]
    fn name_sanitizing_keeps_only_the_last_component() {
        assert_eq!(sanitize_name("shot").expect("plain"), "shot");
        assert_eq!(
            sanitize_name(r"C:\Users\me\Pictures\shot").expect("path"),
            "shot"
        );
        assert_eq!(
            sanitize_name("../../etc/passwd").expect("traversal"),
            "passwd"
        );
        assert_eq!(sanitize_name("a:b?c*d").expect("illegal"), "abcd");
        assert_eq!(sanitize_name("trailing.").expect("dot"), "trailing");
        assert!(sanitize_name("   ").is_err());
        assert!(sanitize_name("../").is_err());
    }

    #[test]
    fn target_resolution_suffixes_only_on_collision() {
        let dir = temp_dir_for("collision");
        let first = resolve_target(&dir, "iluhaAnime_screenshot", "png");
        assert_eq!(
            first.file_name().and_then(|n| n.to_str()),
            Some("iluhaAnime_screenshot.png")
        );
        std::fs::write(&first, b"x").expect("seed first");
        let second = resolve_target(&dir, "iluhaAnime_screenshot", "png");
        assert_eq!(
            second.file_name().and_then(|n| n.to_str()),
            Some("iluhaAnime_screenshot_1.png")
        );
        std::fs::write(&second, b"x").expect("seed second");
        let third = resolve_target(&dir, "iluhaAnime_screenshot", "png");
        assert_eq!(
            third.file_name().and_then(|n| n.to_str()),
            Some("iluhaAnime_screenshot_2.png")
        );
        let other = resolve_target(&dir, "iluhaAnime_screenshot", "jpg");
        assert_eq!(
            other.file_name().and_then(|n| n.to_str()),
            Some("iluhaAnime_screenshot.jpg")
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn source_guard_only_accepts_pending_captures_in_temp() {
        let pending = std::env::temp_dir().join(format!("{TEMP_PREFIX}guard.png"));
        std::fs::write(&pending, b"x").expect("seed pending");
        assert!(guard_source(&pending.to_string_lossy()).is_ok());
        assert!(guard_source(r"C:\Windows\System32\drivers\etc\hosts").is_err());
        assert!(guard_source(&std::env::temp_dir().join("other.png").to_string_lossy()).is_err());
        assert!(guard_source(
            &std::env::temp_dir()
                .join(format!("{TEMP_PREFIX}missing.png"))
                .to_string_lossy()
        )
        .is_err());
        let _ = std::fs::remove_file(&pending);
    }

    fn seed_source(name: &str, width: u32, height: u32) -> (PathBuf, PathBuf) {
        let dir = temp_dir_for(name);
        let source = std::env::temp_dir().join(format!("{TEMP_PREFIX}{name}.png"));
        image::RgbaImage::from_pixel(width, height, image::Rgba([9, 9, 9, 255]))
            .save(&source)
            .expect("write source");
        (dir, source)
    }

    #[test]
    fn saving_writes_the_extension_that_was_asked_for() {
        let (dir, source) = seed_source("save", 4, 2);
        let source_path = source.to_string_lossy().to_string();
        let dir_path = dir.to_string_lossy().to_string();

        let png =
            save_capture(&source_path, &dir_path, "shot", "png", None, None).expect("save png");
        assert_eq!(png.width, 4);
        assert_eq!(png.height, 2);
        assert!(png.path.ends_with("shot.png"));
        let jpeg =
            save_capture(&source_path, &dir_path, "shot", "jpeg", None, None).expect("save jpeg");
        assert!(jpeg.path.ends_with("shot.jpg"));
        assert!(image::open(&jpeg.path).is_ok());

        assert!(save_capture(&source_path, &dir_path, "shot", "webp", None, None).is_err());
        assert!(save_capture(
            &source_path,
            &dir.join("nope").to_string_lossy(),
            "shot",
            "png",
            None,
            None
        )
        .is_err());
        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_file(&source);
    }

    #[test]
    fn saving_a_region_writes_only_that_region() {
        let (dir, source) = seed_source("crop", 20, 10);
        let source_path = source.to_string_lossy().to_string();
        let dir_path = dir.to_string_lossy().to_string();
        let region = CropRegion {
            x: 4,
            y: 2,
            width: 6,
            height: 3,
        };

        let saved = save_capture(&source_path, &dir_path, "part", "png", Some(&region), None)
            .expect("save region");
        assert_eq!(saved.width, 6);
        assert_eq!(saved.height, 3);
        assert_eq!(
            image::open(&saved.path).expect("open region").dimensions(),
            (6, 3)
        );

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_file(&source);
    }

    #[test]
    fn a_region_beyond_the_image_is_clamped_instead_of_failing() {
        let (dir, source) = seed_source("clamp", 10, 10);
        let source_path = source.to_string_lossy().to_string();
        let dir_path = dir.to_string_lossy().to_string();
        let region = CropRegion {
            x: 8,
            y: 8,
            width: 100,
            height: 100,
        };

        let saved = save_capture(
            &source_path,
            &dir_path,
            "clamped",
            "png",
            Some(&region),
            None,
        )
        .expect("save clamped region");
        assert_eq!(saved.width, 2);
        assert_eq!(saved.height, 2);

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_file(&source);
    }

    #[test]
    fn copying_without_a_region_reuses_the_pending_capture() {
        let (dir, source) = seed_source("copy-full", 4, 4);
        let source_path = source.to_string_lossy().to_string();
        assert_eq!(
            prepare_copy(&source_path, None, None).expect("copy full"),
            source_path
        );
        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_file(&source);
    }

    fn layer_png(layer: &image::RgbaImage) -> String {
        let mut bytes = Vec::new();
        layer
            .write_with_encoder(image::codecs::png::PngEncoder::new(&mut bytes))
            .expect("encode layer");
        format!("data:image/png;base64,{}", STANDARD.encode(&bytes))
    }

    fn black_canvas(width: u32, height: u32) -> image::DynamicImage {
        image::DynamicImage::ImageRgba8(image::RgbaImage::from_pixel(
            width,
            height,
            image::Rgba([0, 0, 0, 255]),
        ))
    }

    #[test]
    fn a_drawing_layer_paints_only_what_it_carries() {
        let mut image = black_canvas(4, 4);
        let mut layer = image::RgbaImage::new(4, 4);
        layer.put_pixel(1, 1, image::Rgba([255, 0, 0, 255]));
        layer.put_pixel(2, 2, image::Rgba([0, 0, 255, 128]));

        paint_layer(&mut image, &layer_png(&layer), (4, 4)).expect("paint layer");
        let out = image.to_rgba8();
        assert_eq!(out.get_pixel(1, 1).0, [255, 0, 0, 255]);
        let half = out.get_pixel(2, 2).0;
        assert!(
            half[2] > 100 && half[2] < 255,
            "half alpha blends: {half:?}"
        );
        assert_eq!(out.get_pixel(3, 3).0, [0, 0, 0, 255]);
    }

    #[test]
    fn a_blur_patch_hides_only_the_masked_pixels() {
        let mut base = image::RgbaImage::from_pixel(16, 16, image::Rgba([0, 0, 0, 255]));
        base.put_pixel(2, 8, image::Rgba([255, 255, 255, 255]));
        base.put_pixel(13, 8, image::Rgba([255, 255, 255, 255]));
        let mut image = image::DynamicImage::ImageRgba8(base);
        let mut mask = image::RgbaImage::new(16, 16);
        for x in 0..8 {
            mask.put_pixel(x, 8, image::Rgba([0, 0, 0, 255]));
        }
        let patch = BlurPatch {
            mask: layer_png(&mask),
            sigma: 3.0,
        };

        blur_masked(&mut image, &patch, (16, 16)).expect("blur mask");
        let out = image.to_rgba8();
        assert!(
            out.get_pixel(2, 8).0[0] < 200,
            "the masked pixel lost its contrast: {:?}",
            out.get_pixel(2, 8).0
        );
        assert_eq!(out.get_pixel(13, 8).0, [255, 255, 255, 255]);
        assert_eq!(out.get_pixel(0, 0).0, [0, 0, 0, 255]);
    }

    #[test]
    fn a_layer_that_does_not_match_the_capture_is_rejected() {
        let mut image = black_canvas(4, 4);
        let small = image::RgbaImage::new(2, 2);
        assert!(paint_layer(&mut image, &layer_png(&small), (4, 4)).is_err());
        assert!(decode_layer("not base64 !!", "annotation layer").is_err());
        assert!(decode_layer("", "annotation layer").is_err());
        assert!(decode_layer_image("aGVsbG8=", (4, 4), "annotation layer").is_err());
    }

    #[test]
    fn the_blur_is_baked_before_the_drawing() {
        let mut image = black_canvas(8, 8);
        let mut drawing = image::RgbaImage::new(8, 8);
        drawing.put_pixel(4, 4, image::Rgba([255, 0, 0, 255]));
        let mask = image::RgbaImage::from_pixel(8, 8, image::Rgba([0, 0, 0, 255]));
        let layers = ScreenshotLayers {
            drawing: Some(layer_png(&drawing)),
            blur: Some(BlurPatch {
                mask: layer_png(&mask),
                sigma: 2.0,
            }),
        };

        bake_layers(&mut image, Some(&layers)).expect("bake layers");
        let out = image.to_rgba8();
        assert_eq!(out.get_pixel(4, 4).0, [255, 0, 0, 255]);
        assert_eq!(out.get_pixel(3, 4).0, [0, 0, 0, 255]);
        assert_eq!(out.get_pixel(4, 3).0, [0, 0, 0, 255]);
    }

    #[test]
    fn saving_bakes_the_layers_before_it_crops() {
        let (dir, source) = seed_source("layers", 20, 20);
        let source_path = source.to_string_lossy().to_string();
        let dir_path = dir.to_string_lossy().to_string();
        let region = CropRegion {
            x: 5,
            y: 5,
            width: 10,
            height: 10,
        };
        let mut drawing = image::RgbaImage::new(20, 20);
        drawing.put_pixel(6, 6, image::Rgba([255, 0, 0, 255]));
        drawing.put_pixel(1, 1, image::Rgba([0, 255, 0, 255]));
        let layers = ScreenshotLayers {
            drawing: Some(layer_png(&drawing)),
            blur: None,
        };

        let saved = save_capture(
            &source_path,
            &dir_path,
            "marked",
            "png",
            Some(&region),
            Some(&layers),
        )
        .expect("save marked region");
        assert_eq!(saved.width, 10);
        assert_eq!(saved.height, 10);
        let out = image::open(&saved.path).expect("open marked").to_rgba8();
        assert_eq!(out.get_pixel(1, 1).0, [255, 0, 0, 255]);
        let green = image::Rgba([0, 255, 0, 255]);
        assert!(!out.pixels().any(|pixel| pixel.0 == green.0));

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_file(&source);
    }

    #[test]
    fn copying_with_layers_writes_them_into_the_copy() {
        let (_dir, source) = seed_source("copy-layers", 8, 8);
        let source_path = source.to_string_lossy().to_string();
        let mut drawing = image::RgbaImage::new(8, 8);
        drawing.put_pixel(2, 2, image::Rgba([255, 0, 0, 255]));
        let layers = ScreenshotLayers {
            drawing: Some(layer_png(&drawing)),
            blur: None,
        };

        let copy_path = prepare_copy(&source_path, None, Some(&layers)).expect("copy layers");
        assert_ne!(copy_path, source_path);
        let out = image::open(&copy_path).expect("open copy").to_rgba8();
        assert_eq!(out.get_pixel(2, 2).0, [255, 0, 0, 255]);

        let _ = std::fs::remove_file(&copy_path);
        let _ = std::fs::remove_file(&source);
    }

    #[test]
    fn copying_a_region_writes_a_separate_temp_file_of_that_size() {
        let (_dir, source) = seed_source("copy-region", 12, 6);
        let source_path = source.to_string_lossy().to_string();
        let region = CropRegion {
            x: 1,
            y: 1,
            width: 5,
            height: 4,
        };

        let copy_path = prepare_copy(&source_path, Some(&region), None).expect("copy region");
        assert_ne!(copy_path, source_path);
        assert_eq!(
            image::open(&copy_path).expect("open copy").dimensions(),
            (5, 4)
        );
        assert!(copy_path.contains(TEMP_PREFIX));

        let _ = std::fs::remove_file(&copy_path);
        let _ = std::fs::remove_file(&source);
    }
}
