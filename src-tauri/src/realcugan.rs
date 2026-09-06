use futures::StreamExt;
use serde::Serialize;
use tauri::Emitter;

use super::video;

const REALCUGAN_WIN: &str = "https://github.com/nihui/realcugan-ncnn-vulkan/releases/download/20220728/realcugan-ncnn-vulkan-20220728-windows.zip";
const REALCUGAN_LINUX: &str = "https://github.com/nihui/realcugan-ncnn-vulkan/releases/download/20220728/realcugan-ncnn-vulkan-20220728-ubuntu.zip";

#[derive(Clone, Serialize)]
struct DownloadProgress {
    downloaded: u64,
    total: u64,
    stage: String,
}

pub fn realcugan_bin_dir(app_handle: &tauri::AppHandle) -> std::path::PathBuf {
    video::ffmpeg_bin_dir(app_handle).join("realcugan")
}

pub fn realcugan_exe(app_handle: &tauri::AppHandle) -> String {
    let ext = if cfg!(target_os = "windows") {
        ".exe"
    } else {
        ""
    };
    let custom = realcugan_bin_dir(app_handle).join(format!("realcugan-ncnn-vulkan{ext}"));
    if custom.exists() {
        custom.to_string_lossy().to_string()
    } else {
        format!("realcugan-ncnn-vulkan{ext}")
    }
}

pub fn realcugan_models_dir(app_handle: &tauri::AppHandle) -> std::path::PathBuf {
    realcugan_bin_dir(app_handle).join("models-se")
}

pub fn denoise_level(quality: &str) -> i32 {
    match quality {
        "ultrafast" => -1,
        "fast" => 1,
        "slow" => 2,
        _ => 3,
    }
}

#[tauri::command]
pub async fn check_realcugan(app_handle: tauri::AppHandle) -> Result<bool, String> {
    let dir = realcugan_bin_dir(&app_handle);
    let exe = if cfg!(target_os = "windows") {
        "realcugan-ncnn-vulkan.exe"
    } else {
        "realcugan-ncnn-vulkan"
    };
    Ok(dir.join(exe).exists() && realcugan_models_dir(&app_handle).exists())
}

#[tauri::command]
pub async fn download_realcugan(app_handle: tauri::AppHandle) -> Result<String, String> {
    let dir = realcugan_bin_dir(&app_handle);
    std::fs::create_dir_all(&dir).map_err(|e| format!("create dir: {e}"))?;

    let url = if cfg!(target_os = "windows") {
        REALCUGAN_WIN
    } else if cfg!(target_os = "linux") {
        REALCUGAN_LINUX
    } else {
        return Err("RealCUGAN auto-download is only supported on Windows and Linux".to_string());
    };

    let exe_name = if cfg!(target_os = "windows") {
        "realcugan-ncnn-vulkan.exe"
    } else {
        "realcugan-ncnn-vulkan"
    };
    if dir.join(exe_name).exists() && realcugan_models_dir(&app_handle).exists() {
        return Ok(dir.to_string_lossy().to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_mins(10))
        .build()
        .map_err(|e| format!("client: {e}"))?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("download: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }

    let total = response.content_length().unwrap_or(0);
    let mut downloaded = 0u64;
    let mut stream = response.bytes_stream();
    let mut bytes: Vec<u8> = Vec::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("stream: {e}"))?;
        downloaded += chunk.len() as u64;
        bytes.extend_from_slice(&chunk);
        let _ = app_handle.emit(
            "realcugan-download-progress",
            DownloadProgress {
                downloaded,
                total,
                stage: "downloading".into(),
            },
        );
    }

    let _ = app_handle.emit(
        "realcugan-download-progress",
        DownloadProgress {
            downloaded,
            total,
            stage: "extracting".into(),
        },
    );

    let cursor = std::io::Cursor::new(&bytes);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| format!("zip: {e}"))?;
    let mut found_exe = false;
    let mut found_models = false;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| format!("zip entry: {e}"))?;
        let name = file.name().to_string().replace('\\', "/");
        if name.ends_with(exe_name) {
            let mut outfile = std::fs::File::create(dir.join(exe_name))
                .map_err(|e| format!("create file: {e}"))?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| format!("extract: {e}"))?;
            found_exe = true;
        } else if name.contains("models-se/") && !name.ends_with('/') {
            let short = name.rsplit('/').next().unwrap_or(&name).to_string();
            let out_path = realcugan_models_dir(&app_handle).join(short);
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| format!("create dir: {e}"))?;
            }
            let mut outfile =
                std::fs::File::create(&out_path).map_err(|e| format!("create file: {e}"))?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| format!("extract: {e}"))?;
            found_models = true;
        } else if cfg!(target_os = "windows") && name.ends_with("vcomp140.dll") {
            let mut outfile = std::fs::File::create(dir.join("vcomp140.dll"))
                .map_err(|e| format!("create file: {e}"))?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| format!("extract: {e}"))?;
        }
    }
    if !found_exe {
        return Err(format!("{exe_name} not found in archive"));
    }
    if !found_models {
        return Err("models-se not found in archive".to_string());
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(m) = std::fs::metadata(dir.join(exe_name)) {
            let mut p = m.permissions();
            p.set_mode(0o755);
            let _ = std::fs::set_permissions(dir.join(exe_name), p);
        }
    }

    let _ = app_handle.emit(
        "realcugan-download-progress",
        DownloadProgress {
            downloaded,
            total,
            stage: "done".into(),
        },
    );

    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn remove_realcugan(app_handle: tauri::AppHandle) -> Result<(), String> {
    let dir = realcugan_bin_dir(&app_handle);
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| format!("remove: {e}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn denoise_level_maps_quality() {
        assert_eq!(denoise_level("ultrafast"), -1);
        assert_eq!(denoise_level("fast"), 1);
        assert_eq!(denoise_level("slow"), 2);
        assert_eq!(denoise_level("veryslow"), 3);
        assert_eq!(denoise_level("unknown"), 3);
    }
}
