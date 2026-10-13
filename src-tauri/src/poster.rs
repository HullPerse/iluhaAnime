//! User-initiated poster image saving from the torrent details modal.
//!
//! The renderer fetches the poster bytes itself (the poster URL is already on
//! screen, so no new backend network surface), picks the destination through
//! the system save dialog, and hands both to `save_poster_bytes`. The command
//! only writes validated image bytes to the dialog-picked path: it is not a
//! generic file writer.

use std::path::Path;

use crate::screenshot::sanitize_name;

const MAX_IMAGE_BYTES: usize = 15 * 1024 * 1024;
const ALLOWED_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg"];

fn image_extension(bytes: &[u8]) -> Result<&'static str, String> {
    // Only PNG and JPEG decoders are compiled in: anything else is normalized
    // to PNG by the renderer (canvas) before it reaches this command, so the
    // bytes here must already be one of the two.
    let format = image::ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|error| format!("read the image header: {error}"))?
        .format()
        .ok_or_else(|| "unknown image format".to_string())?;
    match format {
        image::ImageFormat::Png => Ok("png"),
        image::ImageFormat::Jpeg => Ok("jpg"),
        other => Err(format!(
            "only PNG and JPEG posters can be saved, got: {other:?}"
        )),
    }
}

#[tauri::command]
pub async fn save_poster_bytes(data: Vec<u8>, path: String) -> Result<String, String> {
    if data.is_empty() {
        return Err("the image is empty".to_string());
    }
    if data.len() > MAX_IMAGE_BYTES {
        return Err("the image exceeds the 15 MB limit".to_string());
    }
    // The bytes must decode as an image header: a hostile caller cannot use
    // this command to stash arbitrary blobs under an image extension.
    let detected = image_extension(&data)?;

    let target = Path::new(&path);
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
    let mut cleaned = sanitize_name(raw_name)?;
    let requested_extension = cleaned
        .rsplit('.')
        .next()
        .map(str::to_lowercase)
        .unwrap_or_default();
    if !ALLOWED_EXTENSIONS.contains(&requested_extension.as_str()) {
        cleaned.push('.');
        cleaned.push_str(detected);
    }
    let final_path = parent.join(cleaned);
    tokio::fs::write(&final_path, &data)
        .await
        .map_err(|error| format!("write the image file: {error}"))?;
    Ok(final_path.to_string_lossy().into_owned())
}
