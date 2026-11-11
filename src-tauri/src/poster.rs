//! User-initiated image saving from the torrent details modal and the news
//! image viewer.
//!
//! Both commands only write validated image bytes to a dialog-picked path:
//! they are not generic file writers. `save_poster_bytes` takes bytes the
//! renderer already normalized through a canvas; `save_cached_image` copies a
//! file the user already downloaded into the remote image cache, so save does
//! not have to ship megabytes through the IPC bridge or read other files.
//! Shikimori serves WebP from `.jpg` URLs, so the final suffix always follows
//! the detected format instead of the source name.

use std::path::Path;

use crate::screenshot::sanitize_name;
use crate::user_assets::remote_images_dir;

const MAX_IMAGE_BYTES: usize = 15 * 1024 * 1024;
const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp"];

fn image_extension(bytes: &[u8]) -> Result<&'static str, String> {
    // Only decoders that are compiled in are accepted, so a hostile caller
    // cannot use this command to stash arbitrary blobs under an image name.
    let format = image::ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|error| format!("read the image header: {error}"))?
        .format()
        .ok_or_else(|| "unknown image format".to_string())?;
    match format {
        image::ImageFormat::Png => Ok("png"),
        image::ImageFormat::Jpeg => Ok("jpg"),
        image::ImageFormat::Gif => Ok("gif"),
        image::ImageFormat::WebP => Ok("webp"),
        other => Err(format!(
            "only PNG, JPEG, GIF and WebP images can be saved, got: {other:?}"
        )),
    }
}

/// Keeps the name picked in the dialog but makes the suffix match the bytes.
/// A wrong image suffix is replaced (`cover.png` + WebP becomes `cover.webp`);
/// an unrelated one is kept before the image suffix so an executable name can
/// never end up as the written file name.
fn named_for_format(name: &str, detected: &str) -> String {
    let requested = name
        .rsplit('.')
        .next()
        .map(str::to_lowercase)
        .unwrap_or_default();
    let matches = requested == detected || (detected == "jpg" && requested == "jpeg");
    if matches {
        return name.to_string();
    }
    let stem = name.rsplit_once('.').map_or("", |(stem, _)| stem);
    if IMAGE_EXTENSIONS.contains(&requested.as_str()) && !stem.is_empty() {
        return format!("{stem}.{detected}");
    }
    format!("{name}.{detected}")
}

async fn write_validated_image(data: &[u8], path: &str) -> Result<String, String> {
    if data.is_empty() {
        return Err("the image is empty".to_string());
    }
    if data.len() > MAX_IMAGE_BYTES {
        return Err("the image exceeds the 15 MB limit".to_string());
    }
    let detected = image_extension(data)?;

    let target = Path::new(path);
    let parent = target
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .ok_or_else(|| "the destination has no folder".to_string())?;
    if !parent.is_dir() {
        return Err("the destination folder does not exist".to_string());
    }
    let raw_name = target
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "the file name is not valid unicode".to_string())?;
    let cleaned = sanitize_name(raw_name)?;
    let final_path = parent.join(named_for_format(&cleaned, detected));
    tokio::fs::write(&final_path, data)
        .await
        .map_err(|error| format!("write the image file: {error}"))?;
    Ok(final_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn save_poster_bytes(data: Vec<u8>, path: String) -> Result<String, String> {
    write_validated_image(&data, &path).await
}

#[tauri::command]
pub async fn save_cached_image(
    app: tauri::AppHandle,
    source: String,
    path: String,
) -> Result<String, String> {
    copy_cached_image(&remote_images_dir(&app)?, &source, &path).await
}

/// `cache_dir` is the only directory the source may resolve inside, so the
/// command cannot be turned into a reader for arbitrary files.
async fn copy_cached_image(cache_dir: &Path, source: &str, path: &str) -> Result<String, String> {
    let cache_dir = std::fs::canonicalize(cache_dir)
        .map_err(|error| format!("locate the image cache: {error}"))?;
    let cached = std::fs::canonicalize(source)
        .map_err(|error| format!("locate the cached image: {error}"))?;
    if !cached.starts_with(&cache_dir) {
        return Err("the cached image is outside the image cache".to_string());
    }
    let metadata = tokio::fs::metadata(&cached)
        .await
        .map_err(|error| format!("read the cached image: {error}"))?;
    if !metadata.is_file() {
        return Err("the cached image is not a file".to_string());
    }
    if metadata.len() > MAX_IMAGE_BYTES as u64 {
        return Err("the image exceeds the 15 MB limit".to_string());
    }
    let data = tokio::fs::read(&cached)
        .await
        .map_err(|error| format!("read the cached image: {error}"))?;
    write_validated_image(&data, path).await
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicU64, Ordering};

    use super::*;
    use std::path::PathBuf;

    static SEQUENCE: AtomicU64 = AtomicU64::new(0);

    fn tiny_png() -> Vec<u8> {
        let image = image::DynamicImage::new_rgba8(2, 2);
        let mut bytes = Vec::with_capacity(4096);
        image
            .write_with_encoder(image::codecs::png::PngEncoder::new(&mut bytes))
            .expect("encode test png");
        bytes
    }

    fn tiny_webp() -> Vec<u8> {
        let image = image::DynamicImage::new_rgba8(2, 2);
        let mut bytes = Vec::with_capacity(4096);
        image
            .write_with_encoder(image::codecs::webp::WebPEncoder::new_lossless(&mut bytes))
            .expect("encode test webp");
        bytes
    }

    fn case_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "iluha_poster_test_{}_{}",
            std::process::id(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&dir).expect("create poster test dir");
        dir
    }

    #[tokio::test]
    async fn writes_valid_png_bytes() {
        let dir = case_dir();
        let target = dir.join("cover.png");
        let saved = save_poster_bytes(tiny_png(), target.to_string_lossy().into_owned())
            .await
            .expect("save poster");
        assert_eq!(saved, target.to_string_lossy());
        assert_eq!(std::fs::read(&target).expect("read back"), tiny_png());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn rejects_empty_and_oversize_payloads() {
        let dir = case_dir();
        let target = dir.join("cover.png").to_string_lossy().into_owned();
        assert!(save_poster_bytes(Vec::new(), target.clone()).await.is_err());
        assert!(save_poster_bytes(vec![0u8; MAX_IMAGE_BYTES + 1], target)
            .await
            .is_err());
        assert!(!dir.join("cover.png").exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn rejects_non_image_bytes() {
        let dir = case_dir();
        let target = dir.join("cover.png").to_string_lossy().into_owned();
        assert!(save_poster_bytes(b"not an image".to_vec(), target)
            .await
            .is_err());
        assert!(!dir.join("cover.png").exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn writes_webp_bytes_with_their_own_suffix() {
        let dir = case_dir();
        let target = dir.join("cover.png").to_string_lossy().into_owned();
        let saved = save_poster_bytes(tiny_webp(), target)
            .await
            .expect("save webp");
        assert!(saved.ends_with("cover.webp"), "got: {saved}");
        assert_eq!(
            std::fs::read(dir.join("cover.webp")).expect("read back"),
            tiny_webp()
        );
        assert!(!dir.join("cover.png").exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn keeps_a_matching_suffix_and_replaces_a_wrong_one() {
        assert_eq!(named_for_format("cover.png", "png"), "cover.png");
        assert_eq!(named_for_format("cover.jpeg", "jpg"), "cover.jpeg");
        assert_eq!(named_for_format("cover", "png"), "cover.png");
        assert_eq!(named_for_format("cover.jpg", "webp"), "cover.webp");
        assert_eq!(named_for_format("evil.exe", "gif"), "evil.exe.gif");
    }

    #[tokio::test]
    async fn copies_a_cached_image_and_refuses_sources_outside_the_cache() {
        let cache = case_dir().join("cache");
        let out = case_dir();
        std::fs::create_dir_all(&cache).expect("create cache");
        let cached = cache.join("abc123.webp");
        std::fs::write(&cached, tiny_webp()).expect("write cached webp");
        let outside = out.join("outside.webp");
        std::fs::write(&outside, tiny_webp()).expect("write outside webp");

        let source = cached.to_string_lossy().into_owned();
        let target = out.join("news.png").to_string_lossy().into_owned();
        let saved = copy_cached_image(&cache, &source, &target)
            .await
            .expect("copy cached image");
        assert!(saved.ends_with("news.webp"), "got: {saved}");
        assert_eq!(std::fs::read(&saved).expect("read back"), tiny_webp());

        let escaped = outside.to_string_lossy().into_owned();
        let refused_target = out.join("escape.png").to_string_lossy().into_owned();
        let refused = copy_cached_image(&cache, &escaped, &refused_target).await;
        assert!(refused.is_err());
        assert!(!out.join("escape.webp").exists());
        std::fs::remove_dir_all(&cache).ok();
        std::fs::remove_dir_all(&out).ok();
    }

    /// "Copy image" hands the cached file path to the clipboard plugin, which
    /// decodes it with `tauri::image`, so the export formats must stay inside
    /// the decoders this crate compiles.
    #[test]
    fn the_clipboard_image_loader_accepts_a_cached_webp() {
        let dir = case_dir();
        let path = dir.join("cached.webp");
        std::fs::write(&path, tiny_webp()).expect("write webp");
        let decoded = tauri::image::Image::from_path(&path).expect("clipboard loader decodes webp");
        assert_eq!((decoded.width(), decoded.height()), (2, 2));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn appends_an_image_extension_to_executable_names() {
        let dir = case_dir();
        let target = dir.join("evil.exe").to_string_lossy().into_owned();
        let saved = save_poster_bytes(tiny_png(), target)
            .await
            .expect("save poster");
        assert!(saved.ends_with("evil.exe.png"), "got: {saved}");
        assert!(dir.join("evil.exe.png").exists());
        assert!(!dir.join("evil.exe").exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn refuses_missing_folders_and_keeps_dotted_names_inside() {
        let dir = case_dir();
        let missing = dir
            .join("nope")
            .join("cover.png")
            .to_string_lossy()
            .into_owned();
        assert!(save_poster_bytes(tiny_png(), missing).await.is_err());
        // A `..` inside a dialog-picked path resolves under the same folder:
        // the file name is only ever the last component.
        let dotted = dir
            .join("sub")
            .join("..")
            .join("ok.png")
            .to_string_lossy()
            .into_owned();
        let saved = save_poster_bytes(tiny_png(), dotted)
            .await
            .expect("save poster");
        assert!(
            saved.starts_with(dir.to_string_lossy().as_ref()),
            "got: {saved}"
        );
        assert!(dir.join("ok.png").exists());
        std::fs::remove_dir_all(&dir).ok();
    }
}
