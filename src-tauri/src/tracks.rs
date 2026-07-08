use serde::Serialize;

const PRIORITY_DIRS: &[&str] = &[
    "sub", "subs", "audio", "audios", "sound", "subtitles",
    "субтитры", "озвучка",
];

const AUDIO_EXTS: &[&str] = &[
    "mp3", "aac", "m4a", "mka", "ac3", "eac3", "dts", "truehd", "flac", "ogg", "opus", "wav", "wma",
];

const SUB_EXTS: &[&str] = &["srt", "ass", "ssa", "vtt", "sub", "idx", "sup", "pgs"];

#[derive(Serialize)]
pub struct TrackFileInfo {
    pub path: String,
    pub file_name: String,
}

#[derive(Serialize)]
pub struct FolderTrackScan {
    pub audio: Vec<TrackFileInfo>,
    pub subtitles: Vec<TrackFileInfo>,
}

fn is_track_match(file_stem: &str, video_stem: &str) -> bool {
    let f = file_stem.to_lowercase();
    let v = video_stem.to_lowercase();
    if f == v {
        return true;
    }
    if f.starts_with(&format!("{}.", v)) {
        return true;
    }
    if f.starts_with(&format!("{} - ", v)) {
        return true;
    }
    if f.starts_with(&format!("{}_", v)) {
        return true;
    }
    false
}

fn classify_ext(ext: &str) -> Option<&'static str> {
    let e = ext.to_lowercase();
    if AUDIO_EXTS.contains(&e.as_str()) {
        Some("audio")
    } else if SUB_EXTS.contains(&e.as_str()) {
        Some("subtitle")
    } else {
        None
    }
}

fn scan_dir(
    dir: &std::path::Path,
    video_stem: Option<&str>,
    audio_out: &mut Vec<TrackFileInfo>,
    sub_out: &mut Vec<TrackFileInfo>,
) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();
        let kind = match classify_ext(&ext) {
            Some(k) => k,
            None => continue,
        };
        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        let file_stem = path
            .file_stem()
            .and_then(|n| n.to_str())
            .map(|n| n.to_lowercase())
            .unwrap_or_default();

        if let Some(vs) = video_stem {
            if !is_track_match(&file_stem, vs) {
                continue;
            }
        }

        let info = TrackFileInfo {
            path: path.to_string_lossy().to_string(),
            file_name,
        };
        if kind == "audio" {
            audio_out.push(info);
        } else {
            sub_out.push(info);
        }
    }
}

fn scan_priority_dirs(
    parent: &std::path::Path,
    priority: &[&str],
    video_stem: Option<&str>,
    audio_out: &mut Vec<TrackFileInfo>,
    sub_out: &mut Vec<TrackFileInfo>,
) {
    let entries = match std::fs::read_dir(parent) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let dir_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.to_lowercase())
            .unwrap_or_default();

        if priority.contains(&dir_name.as_str()) {
            scan_dir(&path, video_stem, audio_out, sub_out);
        }
    }
}

#[tauri::command]
pub fn scan_folder_for_tracks(video_path: String) -> Result<FolderTrackScan, String> {
    let video = std::path::Path::new(&video_path);
    let parent = video.parent().ok_or("No parent directory")?;
    let stem = video
        .file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())
        .ok_or("Invalid video filename")?;

    let mut audio = Vec::new();
    let mut subtitles = Vec::new();

    // 1. Scan priority sub-folders first
    scan_priority_dirs(parent, PRIORITY_DIRS, Some(&stem), &mut audio, &mut subtitles);

    // 2. Also scan the same directory as the video
    scan_dir(parent, Some(&stem), &mut audio, &mut subtitles);

    Ok(FolderTrackScan { audio, subtitles })
}
