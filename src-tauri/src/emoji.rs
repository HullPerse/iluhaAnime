use serde::Serialize;
use std::fs;
use std::path::Path;
use tauri::Manager;

/// Custom lobby emoji: `iluha_*.{png,jpg,jpeg,webp,gif,ico}` dropped into
/// `<app data>/emoji`. `name` is the lowercased file stem — the shortcode is
/// `:<name>:`; `path` is absolute so the frontend can run `convertFileSrc`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmojiFile {
    pub name: String,
    pub path: String,
}

const EMOJI_PREFIX: &str = "iluha_";
const EMOJI_EXTENSIONS: [&str; 6] = ["png", "jpg", "jpeg", "webp", "gif", "ico"];

/// Pure filename filter: `Some(lowercased stem)` for a custom emoji file,
/// `None` for anything else. Case-insensitive prefix and extension.
fn emoji_name(path: &Path) -> Option<String> {
    let ext = path.extension()?.to_str()?;
    if !EMOJI_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()) {
        return None;
    }
    let name = path.file_stem()?.to_str()?.to_lowercase();
    name.starts_with(EMOJI_PREFIX).then_some(name)
}

/// List custom emoji files. A missing directory means "no custom emoji" (the
/// picker hides the section) — never an error: the pipeline must work before
/// any asset exists. No user input reaches the filesystem, so this cannot
/// escape the emoji directory.
#[tauri::command]
pub fn emoji_list(app: tauri::AppHandle) -> Result<Vec<EmojiFile>, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir: {e}"))?
        .join("emoji");
    let mut files = Vec::new();
    let Ok(entries) = fs::read_dir(&dir) else {
        return Ok(files);
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = emoji_name(&path) else {
            continue;
        };
        files.push(EmojiFile {
            name,
            path: path.to_string_lossy().into_owned(),
        });
    }
    files.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| a.path.cmp(&b.path)));
    files.dedup_by(|a, b| a.name == b.name);
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_prefixed_image_files_case_insensitively() {
        assert_eq!(
            emoji_name(Path::new("C:/emoji/iluha_cat.png")).as_deref(),
            Some("iluha_cat")
        );
        assert_eq!(
            emoji_name(Path::new("C:/emoji/Iluha_Cat.GIF")).as_deref(),
            Some("iluha_cat")
        );
        assert_eq!(
            emoji_name(Path::new("C:/emoji/iluha_2.webp")).as_deref(),
            Some("iluha_2")
        );
        assert_eq!(
            emoji_name(Path::new("C:/emoji/iluha_x.ico")).as_deref(),
            Some("iluha_x")
        );
    }

    #[test]
    fn rejects_foreign_names_and_extensions() {
        assert_eq!(emoji_name(Path::new("C:/emoji/cat.png")), None);
        assert_eq!(emoji_name(Path::new("C:/emoji/iluha_cat.txt")), None);
        assert_eq!(emoji_name(Path::new("C:/emoji/notiluha_cat.png")), None);
        assert_eq!(emoji_name(Path::new("C:/emoji/iluha_cat")), None);
        assert_eq!(emoji_name(Path::new("C:/emoji/.png")), None);
        assert_eq!(emoji_name(Path::new("C:/emoji/iluha_cat.bmp")), None);
    }
}
