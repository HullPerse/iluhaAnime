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
pub struct FolderTrackScan {
    pub audio: Vec<String>,
    pub subtitles: Vec<String>,
}

fn scan_dir(dir: &std::path::Path, audio_out: &mut Vec<String>, sub_out: &mut Vec<String>) {
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
        let full = path.to_string_lossy().to_string();

        if AUDIO_EXTS.contains(&ext.as_str()) {
            audio_out.push(full);
        } else if SUB_EXTS.contains(&ext.as_str()) {
            sub_out.push(full);
        }
    }
}

fn scan_priority_dirs(parent: &std::path::Path, priority: &[&str], audio_out: &mut Vec<String>, sub_out: &mut Vec<String>) {
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
            scan_dir(&path, audio_out, sub_out);
        }
    }
}

#[tauri::command]
pub fn scan_folder_for_tracks(path: String) -> Result<FolderTrackScan, String> {
    let dir = std::path::Path::new(&path);
    if !dir.is_dir() {
        return Err("Not a directory".to_string());
    }

    let mut audio = Vec::new();
    let mut subtitles = Vec::new();

    // 1. Scan priority sub-folders first
    scan_priority_dirs(dir, PRIORITY_DIRS, &mut audio, &mut subtitles);

    // 2. Also scan the same directory as the video
    scan_dir(dir, &mut audio, &mut subtitles);

    Ok(FolderTrackScan { audio, subtitles })
}
