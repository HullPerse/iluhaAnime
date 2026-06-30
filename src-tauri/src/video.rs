use serde::Serialize;
use tauri::Manager;

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
    let platform = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    };
    app_handle
        .path()
        .app_data_dir()
        .unwrap_or_default()
        .join("bin")
        .join(platform)
}

pub(crate) fn ffprobe_exe(app_handle: &tauri::AppHandle) -> String {
    let ext = if cfg!(target_os = "windows") {
        ".exe"
    } else {
        ""
    };
    let custom = ffmpeg_bin_dir(app_handle).join(format!("ffprobe{ext}"));
    if custom.exists() {
        custom.to_string_lossy().to_string()
    } else {
        format!("ffprobe{ext}")
    }
}

pub(crate) fn ffmpeg_exe(app_handle: &tauri::AppHandle) -> String {
    let ext = if cfg!(target_os = "windows") {
        ".exe"
    } else {
        ""
    };
    let custom = ffmpeg_bin_dir(app_handle).join(format!("ffmpeg{ext}"));
    if custom.exists() {
        custom.to_string_lossy().to_string()
    } else {
        format!("ffmpeg{ext}")
    }
}

#[tauri::command]
pub async fn extract_video_subtitle(
    app_handle: tauri::AppHandle,
    path: String,
    stream_index: usize,
    codec_name: Option<String>,
) -> Result<String, String> {
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
pub async fn remux_video_audio(
    app_handle: tauri::AppHandle,
    path: String,
    stream_index: usize,
) -> Result<String, String> {
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
pub async fn convert_external_subtitle(
    app_handle: tauri::AppHandle,
    path: String,
    codec_name: Option<String>,
) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let is_ass = codec_name.as_deref() == Some("ass")
        || codec_name.as_deref() == Some("ssa")
        || path.ends_with(".ass")
        || path.ends_with(".ssa");
    let ext = if is_ass { "ass" } else { "vtt" };
    let output_path = temp_dir.join(format!("iluha_ext_sub.{}", ext));
    let _ = std::fs::remove_file(&output_path);

    let mut args = vec!["-y".to_string(), "-i".to_string(), path.clone()];
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
pub async fn get_video_info(
    app_handle: tauri::AppHandle,
    path: String,
) -> Result<VideoInfo, String> {
    let output = std::process::Command::new(ffprobe_exe(&app_handle))
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_chapters",
            "-show_streams",
            &path,
        ])
        .output()
        .map_err(|e| format!("ffprobe not found: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe failed: {stderr}"));
    }

    #[derive(serde::Deserialize)]
    struct FfprobeOutput {
        chapters: Option<Vec<FfprobeChapter>>,
        streams: Vec<FfprobeStream>,
    }

    #[derive(serde::Deserialize)]
    struct FfprobeChapter {
        start_time: Option<String>,
        end_time: Option<String>,
        tags: Option<FfprobeChapterTags>,
    }

    #[derive(serde::Deserialize)]
    struct FfprobeChapterTags {
        title: Option<String>,
    }

    #[derive(serde::Deserialize)]
    struct FfprobeStream {
        index: i32,
        codec_type: String,
        codec_name: Option<String>,
        tags: Option<FfprobeStreamTags>,
        disposition: Option<FfprobeDisposition>,
    }

    #[derive(serde::Deserialize)]
    struct FfprobeStreamTags {
        language: Option<String>,
        title: Option<String>,
    }

    #[derive(serde::Deserialize)]
    struct FfprobeDisposition {
        default: Option<i32>,
    }

    let parsed: FfprobeOutput =
        serde_json::from_slice(&output.stdout).map_err(|e| format!("parse ffprobe: {e}"))?;

    let chapters = parsed
        .chapters
        .unwrap_or_default()
        .into_iter()
        .filter_map(|c| {
            let start = c.start_time?.parse::<f64>().ok()?;
            let end = c.end_time?.parse::<f64>().ok()?;
            Some(VideoChapter {
                start_time: start,
                end_time: end,
                title: c.tags.and_then(|t| t.title).unwrap_or_default(),
            })
        })
        .collect();

    let mut streams: Vec<VideoStreamInfo> = parsed
        .streams
        .into_iter()
        .map(|s| {
            let is_default = s
                .disposition
                .and_then(|d| d.default)
                .map(|v| v == 1)
                .unwrap_or(false);
            VideoStreamInfo {
                index: s.index,
                codec_type: s.codec_type,
                codec_name: s.codec_name.unwrap_or_default(),
                language: s.tags.as_ref().and_then(|t| t.language.clone()),
                title: s.tags.as_ref().and_then(|t| t.title.clone()),
                is_default,
                file_path: None,
            }
        })
        .collect();

    let video_path = std::path::Path::new(&path);
    if let (Some(parent), Some(stem)) = (video_path.parent(), video_path.file_stem()) {
        let stem = stem.to_string_lossy().to_lowercase();
        let sub_exts = ["ass", "ssa", "srt", "vtt", "sup", "idx", "sub", "pgs"];
        let audio_exts = ["mka", "aac", "mp3", "ac3", "dts", "flac", "opus", "ogg", "wav", "eac3"];

        let mut ext_idx = -1i32;
        let entries = match std::fs::read_dir(parent) {
            Ok(e) => e,
            Err(_) => return Ok(VideoInfo { chapters, streams }),
        };
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_dir() {
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
