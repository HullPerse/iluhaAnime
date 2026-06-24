use serde::Serialize;
use tauri::Manager;
use futures::StreamExt;
use tauri::Emitter;

#[derive(Debug, Serialize)]
pub struct VideoChapter {
    pub start_time: f64,
    pub end_time: f64,
    pub title: String,
}

#[derive(Debug, Serialize)]
pub struct VideoInfo {
    pub chapters: Vec<VideoChapter>,
    pub streams: Vec<VideoStreamInfo>,
}

#[derive(Debug, Serialize)]
pub struct VideoFileEntry {
    pub path: String,
    pub name: String,
    pub size: u64,
}

#[derive(Clone, Serialize)]
struct DownloadProgress {
    downloaded: u64,
    total: u64,
    stage: String,
}

#[derive(Clone, Serialize)]
struct FolderScanProgress {
    path: String,
    current: usize,
    total: usize,
    stage: String,
}

#[derive(Debug, Serialize)]
pub struct VideoStreamInfo {
    pub index: i32,
    pub codec_type: String,
    pub codec_name: String,
    pub language: Option<String>,
    pub title: Option<String>,
    pub is_default: bool,
    pub file_path: Option<String>,
}

pub(crate) fn ffmpeg_bin_dir(app_handle: &tauri::AppHandle) -> std::path::PathBuf {
    let platform = if cfg!(target_os = "windows") { "windows" }
                   else if cfg!(target_os = "macos") { "macos" }
                   else { "linux" };
    app_handle.path().app_data_dir().unwrap_or_default().join("bin").join(platform)
}

pub(crate) fn ffprobe_exe(app_handle: &tauri::AppHandle) -> String {
    let ext = if cfg!(target_os = "windows") { ".exe" } else { "" };
    let custom = ffmpeg_bin_dir(app_handle).join(format!("ffprobe{ext}"));
    if custom.exists() { custom.to_string_lossy().to_string() } else { format!("ffprobe{ext}") }
}

pub(crate) fn ffmpeg_exe(app_handle: &tauri::AppHandle) -> String {
    let ext = if cfg!(target_os = "windows") { ".exe" } else { "" };
    let custom = ffmpeg_bin_dir(app_handle).join(format!("ffmpeg{ext}"));
    if custom.exists() { custom.to_string_lossy().to_string() } else { format!("ffmpeg{ext}") }
}

#[tauri::command]
pub async fn get_video_chapters(app_handle: tauri::AppHandle, path: String) -> Result<Vec<VideoChapter>, String> {
    let output = std::process::Command::new(ffprobe_exe(&app_handle))
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_chapters",
            &path,
        ])
        .output()
        .map_err(|e| format!("ffprobe not found: {e}"))?;

    if !output.status.success() {
        return Err("ffprobe returned non-zero exit code".to_string());
    }

    let json: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse ffprobe output: {e}"))?;

    let chapters = json["chapters"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|ch| {
                    let start = ch["start_time"]
                        .as_str()
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(0.0);
                    let end = ch["end_time"]
                        .as_str()
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(0.0);
                    let title = ch["tags"]["title"]
                        .as_str()
                        .unwrap_or("")
                        .to_string();
                    if start == 0.0 && end == 0.0 {
                        return None;
                    }
                    Some(VideoChapter { start_time: start, end_time: end, title })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok(chapters)
}

#[tauri::command]
pub async fn get_video_streams(app_handle: tauri::AppHandle, path: String) -> Result<Vec<VideoStreamInfo>, String> {
    let output = std::process::Command::new(ffprobe_exe(&app_handle))
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_streams",
            &path,
        ])
        .output()
        .map_err(|e| format!("ffprobe not found: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe error: {stderr}"));
    }

    let json: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse ffprobe output: {e}"))?;

    let streams = json["streams"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter(|s| {
                    let t = s["codec_type"].as_str().unwrap_or("");
                    t == "audio" || t == "subtitle"
                })
                .map(|s| VideoStreamInfo {
                    index: s["index"].as_i64().unwrap_or(0) as i32,
                    codec_type: s["codec_type"].as_str().unwrap_or("").to_string(),
                    codec_name: s["codec_name"].as_str().unwrap_or("").to_string(),
                    language: s["tags"]["language"].as_str().map(|l| l.to_string()),
                    title: s["tags"]["title"].as_str().map(|t| t.to_string()),
                    is_default: s["disposition"]["default"].as_i64().unwrap_or(0) == 1,
                    file_path: None,
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok(streams)
}

#[tauri::command]
pub async fn extract_video_subtitle(app_handle: tauri::AppHandle, path: String, stream_index: usize, codec_name: Option<String>) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let is_ass = codec_name.as_deref() == Some("ass") || codec_name.as_deref() == Some("ssa");
    let ext = if is_ass { "ass" } else { "vtt" };
    let output_path = temp_dir.join(format!("iluha_sub_{}.{}", stream_index, ext));

    let _ = std::fs::remove_file(&output_path);

    let mut args = vec![
        "-y".to_string(),
        "-i".to_string(),
        path.clone(),
        "-map".to_string(),
        format!("0:{}", stream_index),
    ];
    if is_ass {
        args.extend_from_slice(&["-c:s".to_string(), "copy".to_string()]);
    } else {
        args.extend_from_slice(&["-c:s".to_string(), "webvtt".to_string()]);
    }
    args.push(output_path.to_string_lossy().to_string());

    let output = std::process::Command::new(ffmpeg_exe(&app_handle))
        .args(&args)
        .output()
        .map_err(|e| format!("ffmpeg not found: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg failed: {stderr}"));
    }

    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn remux_video_audio(app_handle: tauri::AppHandle, path: String, stream_index: usize) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let output_path = temp_dir.join(format!("iluha_audio_{}.mkv", stream_index));

    let _ = std::fs::remove_file(&output_path);

    let output = std::process::Command::new(ffmpeg_exe(&app_handle))
        .args([
            "-y",
            "-i",
            &path,
            "-map",
            "0:v",
            "-map",
            &format!("0:{}", stream_index),
            "-c",
            "copy",
            "-map_metadata",
            "0",
            &output_path.to_string_lossy().to_string(),
        ])
        .output()
        .map_err(|e| format!("ffmpeg not found: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg remux failed: {stderr}"));
    }

    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn scan_external_tracks(path: String) -> Result<Vec<VideoStreamInfo>, String> {
    let video_path = std::path::Path::new(&path);
    let parent = video_path.parent().unwrap_or(std::path::Path::new(""));
    let stem = video_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    let sub_exts = [
        "srt", "ass", "ssa", "vtt", "sub", "idx", "sup", "pgs", "stl", "ttml",
    ];
    let audio_exts = [
        "mp3", "aac", "m4a", "mka", "ac3", "eac3", "dts", "truehd", "flac",
        "ogg", "opus", "wav", "wma",
    ];

    let mut tracks: Vec<VideoStreamInfo> = Vec::new();
    let mut ext_idx: i32 = -1;
    let mut stack: Vec<std::path::PathBuf> = vec![parent.to_path_buf()];

    while let Some(dir) = stack.pop() {
        if !dir.is_dir() {
            continue;
        }
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_dir() {
                stack.push(entry_path);
                continue;
            }
            let file_stem = match entry_path.file_stem().and_then(|s| s.to_str()) {
                Some(s) => s.to_lowercase(),
                None => continue,
            };
            if file_stem != stem
                && !file_stem.starts_with(&format!("{}.", stem))
                && !file_stem.starts_with(&format!("{} - ", stem))
            {
                continue;
            }
            let ext = match entry_path.extension().and_then(|e| e.to_str()) {
                Some(e) => e.to_lowercase(),
                None => continue,
            };
            let codec_type = if sub_exts.contains(&ext.as_str()) {
                "subtitle"
            } else if audio_exts.contains(&ext.as_str()) {
                "audio"
            } else {
                continue;
            };
            let label = entry_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            tracks.push(VideoStreamInfo {
                index: ext_idx,
                codec_type: codec_type.to_string(),
                codec_name: ext,
                language: None,
                title: Some(label),
                is_default: false,
                file_path: Some(entry_path.to_string_lossy().to_string()),
            });
            ext_idx -= 1;
        }
    }

    Ok(tracks)
}

#[tauri::command]
pub async fn remux_with_external_audio(
    app_handle: tauri::AppHandle,
    video_path: String,
    audio_path: String,
) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let output_path = temp_dir.join("iluha_ext_audio.mkv");
    let _ = std::fs::remove_file(&output_path);

    let output = std::process::Command::new(ffmpeg_exe(&app_handle))
        .args([
            "-y",
            "-i",
            &video_path,
            "-i",
            &audio_path,
            "-map",
            "0:v",
            "-map",
            "1:a",
            "-c",
            "copy",
            "-map_metadata",
            "0",
            &output_path.to_string_lossy().to_string(),
        ])
        .output()
        .map_err(|e| format!("ffmpeg not found: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg remux failed: {stderr}"));
    }

    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn convert_external_subtitle(app_handle: tauri::AppHandle, path: String, codec_name: Option<String>) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let is_ass = codec_name.as_deref() == Some("ass") || codec_name.as_deref() == Some("ssa") || path.ends_with(".ass") || path.ends_with(".ssa");
    let ext = if is_ass { "ass" } else { "vtt" };
    let output_path = temp_dir.join(format!("iluha_ext_sub.{}", ext));
    let _ = std::fs::remove_file(&output_path);

    let mut args = vec![
        "-y".to_string(),
        "-i".to_string(),
        path.clone(),
    ];
    if is_ass {
        args.extend_from_slice(&["-c:s".to_string(), "copy".to_string()]);
    } else {
        args.extend_from_slice(&["-c:s".to_string(), "webvtt".to_string()]);
    }
    args.push(output_path.to_string_lossy().to_string());

    let output = std::process::Command::new(ffmpeg_exe(&app_handle))
        .args(&args)
        .output()
        .map_err(|e| format!("ffmpeg not found: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg subtitle convert failed: {stderr}"));
    }

    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn check_ffprobe(app_handle: tauri::AppHandle) -> Result<bool, String> {
    let probe = ffprobe_exe(&app_handle);
    let status = std::process::Command::new(&probe)
        .arg("-version")
        .output();
    match status {
        Ok(o) => Ok(o.status.success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
pub async fn get_video_info(app_handle: tauri::AppHandle, path: String) -> Result<VideoInfo, String> {
    let output = std::process::Command::new(ffprobe_exe(&app_handle))
        .args([
            "-v", "quiet",
            "-print_format", "json",
            "-show_chapters",
            "-show_streams",
            &path,
        ])
        .output()
        .map_err(|e| format!("ffprobe not found: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe error: {stderr}"));
    }

    let json: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse ffprobe output: {e}"))?;

    let chapters = json["chapters"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|ch| {
                    let start = ch["start_time"]
                        .as_str()
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(0.0);
                    let end = ch["end_time"]
                        .as_str()
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(0.0);
                    let title = ch["tags"]["title"]
                        .as_str()
                        .unwrap_or("")
                        .to_string();
                    if start == 0.0 && end == 0.0 {
                        return None;
                    }
                    Some(VideoChapter { start_time: start, end_time: end, title })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let mut streams: Vec<VideoStreamInfo> = json["streams"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter(|s| {
                    let t = s["codec_type"].as_str().unwrap_or("");
                    t == "audio" || t == "subtitle"
                })
                .map(|s| VideoStreamInfo {
                    index: s["index"].as_i64().unwrap_or(0) as i32,
                    codec_type: s["codec_type"].as_str().unwrap_or("").to_string(),
                    codec_name: s["codec_name"].as_str().unwrap_or("").to_string(),
                    language: s["tags"]["language"].as_str().map(|l| l.to_string()),
                    title: s["tags"]["title"].as_str().map(|t| t.to_string()),
                    is_default: s["disposition"]["default"].as_i64().unwrap_or(0) == 1,
                    file_path: None,
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let video_path = std::path::Path::new(&path);
    let parent = video_path.parent().unwrap_or(std::path::Path::new(""));
    let stem = video_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    let sub_exts = [
        "srt", "ass", "ssa", "vtt", "sub", "idx", "sup", "pgs", "stl", "ttml",
    ];
    let audio_exts = [
        "mp3", "aac", "m4a", "mka", "ac3", "eac3", "dts", "truehd", "flac",
        "ogg", "opus", "wav", "wma",
    ];

    let mut ext_idx: i32 = -1;
    let mut stack: Vec<std::path::PathBuf> = vec![parent.to_path_buf()];
    while let Some(dir) = stack.pop() {
        if !dir.is_dir() { continue; }
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_dir() {
                stack.push(entry_path);
                continue;
            }
            let file_stem = match entry_path.file_stem().and_then(|s| s.to_str()) {
                Some(s) => s.to_lowercase(),
                None => continue,
            };
            if file_stem != stem
                && !file_stem.starts_with(&format!("{}.", stem))
                && !file_stem.starts_with(&format!("{} - ", stem))
            {
                continue;
            }
            let ext = match entry_path.extension().and_then(|e| e.to_str()) {
                Some(e) => e.to_lowercase(),
                None => continue,
            };
            let codec_type = if sub_exts.contains(&ext.as_str()) {
                "subtitle"
            } else if audio_exts.contains(&ext.as_str()) {
                "audio"
            } else {
                continue;
            };
            let label = entry_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            streams.push(VideoStreamInfo {
                index: ext_idx,
                codec_type: codec_type.to_string(),
                codec_name: ext,
                language: None,
                title: Some(label),
                is_default: false,
                file_path: Some(entry_path.to_string_lossy().to_string()),
            });
            ext_idx -= 1;
        }
    }

    Ok(VideoInfo { chapters, streams })
}

fn download_urls() -> Result<(&'static str, &'static str, &'static str), String> {
    #[cfg(target_os = "windows")]
    return Ok((
        "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n8.1-latest-win64-gpl-8.1.zip",
        "bin/ffmpeg.exe",
        "bin/ffprobe.exe",
    ));

    #[cfg(not(any(target_os = "windows")))]
    return Err("Unsupported platform".to_string());
}

#[tauri::command]
pub async fn download_ffmpeg(app_handle: tauri::AppHandle) -> Result<String, String> {
    let dir = ffmpeg_bin_dir(&app_handle);
    std::fs::create_dir_all(&dir).map_err(|e| format!("create dir: {e}"))?;

    let (url, ffmpeg_in, ffprobe_in) = download_urls()?;

    let ffmpeg_out = dir.join(if cfg!(target_os = "windows") { "ffmpeg.exe" } else { "ffmpeg" });
    let ffprobe_out = dir.join(if cfg!(target_os = "windows") { "ffprobe.exe" } else { "ffprobe" });
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

    let cursor = std::io::Cursor::new(&bytes);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| format!("zip: {e}"))?;

    let targets = [(ffmpeg_in, &ffmpeg_out), (ffprobe_in, &ffprobe_out)];
    for (in_zip, out_path) in &targets {
        let mut found = false;
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| format!("zip entry: {e}"))?;
            let name = file.name().to_string().replace('\\', "/");
            if name.ends_with(in_zip) || name.contains(in_zip) {
                let mut outfile =
                    std::fs::File::create(out_path).map_err(|e| format!("create file: {e}"))?;
                std::io::copy(&mut file, &mut outfile).map_err(|e| format!("extract: {e}"))?;
                found = true;
                break;
            }
        }
        if !found {
            return Err(format!("{in_zip} not found in archive"));
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
    let dir = ffmpeg_bin_dir(&app_handle);
    let ffmpeg_path = dir.join(if cfg!(target_os = "windows") { "ffmpeg.exe" } else { "ffmpeg" });
    let ffprobe_path = dir.join(if cfg!(target_os = "windows") { "ffprobe.exe" } else { "ffprobe" });

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

fn count_video_files(root: &std::path::Path, exts: &[&str]) -> usize {
    let mut count = 0;
    let mut stack: Vec<std::path::PathBuf> = vec![root.to_path_buf()];

    while let Some(dir) = stack.pop() {
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    stack.push(p);
                } else if let Some(e) = p.extension().and_then(|e| e.to_str()) {
                    if exts.contains(&e.to_lowercase().as_str()) {
                        count += 1;
                    }
                }
            }
        }
    }

    count
}

#[tauri::command]
pub async fn scan_video_folder(app_handle: tauri::AppHandle, path: String) -> Result<Vec<VideoFileEntry>, String> {
    let video_exts = [
        "mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "m4v",
        "mpg", "mpeg", "ts", "m2ts", "ogv", "3gp",
    ];
    let root = std::path::Path::new(&path);
    if !root.is_dir() {
        return Err("Not a directory".to_string());
    }

    let _ = app_handle.emit(
        "folder-scan-progress",
        FolderScanProgress {
            path: path.clone(),
            current: 0,
            total: 0,
            stage: "counting".into(),
        },
    );

    let total = count_video_files(root, &video_exts);

    let _ = app_handle.emit(
        "folder-scan-progress",
        FolderScanProgress {
            path: path.clone(),
            current: 0,
            total,
            stage: "scanning".into(),
        },
    );

    let mut files: Vec<VideoFileEntry> = Vec::with_capacity(total);
    let mut stack: Vec<std::path::PathBuf> = vec![root.to_path_buf()];
    let mut current = 0usize;

    while let Some(dir) = stack.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_dir() {
                stack.push(entry_path);
                continue;
            }
            let ext = entry_path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_lowercase())
                .unwrap_or_default();
            if !video_exts.contains(&ext.as_str()) {
                continue;
            }
            let name = entry_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            let size = match entry.metadata() {
                Ok(m) => m.len(),
                Err(_) => 0,
            };
            files.push(VideoFileEntry {
                path: entry_path.to_string_lossy().to_string(),
                name,
                size,
            });
            current += 1;
            if current % 5 == 0 || current == total {
                let _ = app_handle.emit(
                    "folder-scan-progress",
                    FolderScanProgress {
                        path: path.clone(),
                        current,
                        total,
                        stage: "scanning".into(),
                    },
                );
            }
        }
    }

    let _ = app_handle.emit(
        "folder-scan-progress",
        FolderScanProgress {
            path: path.clone(),
            current: total,
            total,
            stage: "done".into(),
        },
    );

    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(files)
}
