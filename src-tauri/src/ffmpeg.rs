use futures::StreamExt;
use serde::Serialize;
use tauri::Emitter;
#[cfg(windows)]
use std::os::windows::process::CommandExt;

use super::video;

#[derive(Clone, Serialize)]
struct DownloadProgress {
    downloaded: u64,
    total: u64,
    stage: String,
}

fn download_urls() -> Result<(&'static str, &'static str, &'static str), String> {
    #[cfg(target_os = "windows")]
    return Ok((
        "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n8.1-latest-win64-gpl-8.1.zip",
        "bin/ffmpeg.exe",
        "bin/ffprobe.exe",
    ));

    #[cfg(target_os = "linux")]
    return Ok((
        "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n8.1-latest-linux64-gpl-8.1.tar.xz",
        "bin/ffmpeg",
        "bin/ffprobe",
    ));

    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    return Err("ffmpeg auto-download is only supported on Windows and Linux".to_string());
}

#[tauri::command]
pub async fn download_ffmpeg(app_handle: tauri::AppHandle) -> Result<String, String> {
    let dir = video::ffmpeg_bin_dir(&app_handle);
    std::fs::create_dir_all(&dir).map_err(|e| format!("create dir: {e}"))?;

    let (url, ffmpeg_in, ffprobe_in) = download_urls()?;

    let ffmpeg_out = dir.join(if cfg!(target_os = "windows") {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let ffprobe_out = dir.join(if cfg!(target_os = "windows") {
        "ffprobe.exe"
    } else {
        "ffprobe"
    });
    if ffmpeg_out.exists() && ffprobe_out.exists() {
        return Ok(dir.to_string_lossy().to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
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
            "ffmpeg-download-progress",
            DownloadProgress {
                downloaded,
                total,
                stage: "downloading".into(),
            },
        );
    }

    let _ = app_handle.emit(
        "ffmpeg-download-progress",
        DownloadProgress {
            downloaded,
            total,
            stage: "extracting".into(),
        },
    );

    let targets = [(ffmpeg_in, &ffmpeg_out), (ffprobe_in, &ffprobe_out)];

    #[cfg(target_os = "windows")]
    {
        let cursor = std::io::Cursor::new(&bytes);
        let mut archive = zip::ZipArchive::new(cursor).map_err(|e| format!("zip: {e}"))?;
        for (in_archive, out_path) in &targets {
            let mut found = false;
            for i in 0..archive.len() {
                let mut file = archive.by_index(i).map_err(|e| format!("zip entry: {e}"))?;
                let name = file.name().to_string().replace('\\', "/");
                if name.ends_with(in_archive) || name.contains(in_archive) {
                    let mut outfile =
                        std::fs::File::create(out_path).map_err(|e| format!("create file: {e}"))?;
                    std::io::copy(&mut file, &mut outfile).map_err(|e| format!("extract: {e}"))?;
                    found = true;
                    break;
                }
            }
            if !found {
                return Err(format!("{in_archive} not found in archive"));
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        let cursor = std::io::Cursor::new(&bytes);
        let decoder = xz2::read::XzDecoder::new(cursor);
        let mut archive = tar::Archive::new(decoder);
        for entry in archive.entries().map_err(|e| format!("tar entries: {e}"))? {
            let mut entry = entry.map_err(|e| format!("tar entry: {e}"))?;
            let path = entry.path().map_err(|e| format!("entry path: {e}"))?.to_string_lossy().to_string();
            let normalized = path.replace('\\', "/");
            for (in_archive, out_path) in &targets {
                if normalized.ends_with(in_archive) || normalized.contains(in_archive) {
                    let mut outfile =
                        std::fs::File::create(out_path).map_err(|e| format!("create file: {e}"))?;
                    std::io::copy(&mut entry, &mut outfile).map_err(|e| format!("extract: {e}"))?;
                }
            }
        }
        for (_, out_path) in &targets {
            if !out_path.exists() {
                return Err(format!("{:?} not found in archive", out_path.file_name().unwrap_or_default()));
            }
        }
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(m) = std::fs::metadata(&ffmpeg_out) {
            let mut p = m.permissions();
            p.set_mode(0o755);
            let _ = std::fs::set_permissions(&ffmpeg_out, p);
        }
        if let Ok(m) = std::fs::metadata(&ffprobe_out) {
            let mut p = m.permissions();
            p.set_mode(0o755);
            let _ = std::fs::set_permissions(&ffprobe_out, p);
        }
    }

    let _ = app_handle.emit(
        "ffmpeg-download-progress",
        DownloadProgress {
            downloaded,
            total,
            stage: "done".into(),
        },
    );

    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn remove_ffmpeg(app_handle: tauri::AppHandle) -> Result<(), String> {
    let dir = video::ffmpeg_bin_dir(&app_handle);
    let ffmpeg_path = dir.join(if cfg!(target_os = "windows") {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
    let ffprobe_path = dir.join(if cfg!(target_os = "windows") {
        "ffprobe.exe"
    } else {
        "ffprobe"
    });

    let mut removed_any = false;

    if ffmpeg_path.exists() {
        std::fs::remove_file(&ffmpeg_path).map_err(|e| format!("remove ffmpeg: {e}"))?;
        removed_any = true;
    }
    if ffprobe_path.exists() {
        std::fs::remove_file(&ffprobe_path).map_err(|e| format!("remove ffprobe: {e}"))?;
        removed_any = true;
    }

    if !removed_any {
        return Err("FFmpeg не найден".to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn check_ffprobe(app_handle: tauri::AppHandle) -> Result<bool, String> {
    let probe = video::ffprobe_exe(&app_handle);
    let mut cmd = std::process::Command::new(&probe);
    cmd.arg("-version");
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);
    let status = cmd.output();
    match status {
        Ok(o) => Ok(o.status.success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
pub async fn check_libplacebo(app_handle: tauri::AppHandle) -> bool {
    let ffmpeg = video::ffmpeg_exe(&app_handle);
    let output = std::process::Command::new(&ffmpeg)
        .args(["-filters"])
        .output();
    match output {
        Ok(o) => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            stdout.contains("libplacebo")
        }
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn download_urls_succeeds_on_windows_and_linux() {
        let result = download_urls();
        #[cfg(target_os = "windows")]
        assert!(result.is_ok());
        #[cfg(target_os = "linux")]
        assert!(result.is_ok());
        #[cfg(not(any(target_os = "windows", target_os = "linux")))]
        assert!(result.is_err());
    }

    #[test]
    fn download_urls_returns_expected_url() {
        let result = download_urls();
        #[cfg(target_os = "windows")]
        {
            let (url, _, _) = result.unwrap();
            assert!(url.contains("github.com"));
            assert!(url.contains("ffmpeg"));
        }
        #[cfg(target_os = "linux")]
        {
            let (url, _, _) = result.unwrap();
            assert!(url.contains("github.com"));
            assert!(url.contains("ffmpeg"));
        }
        #[cfg(not(any(target_os = "windows", target_os = "linux")))]
        {
            assert_eq!(result.unwrap_err(), "ffmpeg auto-download is only supported on Windows and Linux");
        }
    }
}
