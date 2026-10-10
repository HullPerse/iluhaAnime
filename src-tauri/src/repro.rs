use std::io::Write;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::Manager;

pub const FRONTEND_JSON_MAX_BYTES: usize = 256 * 1024;
pub const STORAGE_ENTRIES_MAX: usize = 200;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReproMeta {
    pub app_version: String,
    pub os: String,
    pub arch: String,
    pub generated_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageEntry {
    pub name: String,
    pub is_dir: bool,
    pub size_bytes: u64,
    pub modified_ms: Option<u64>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .map_or(0, |ms| u64::try_from(ms).unwrap_or(0))
}

fn file_time_ms(time: std::time::SystemTime) -> Option<u64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .map(|d| u64::try_from(d.as_millis()).unwrap_or(0))
}

pub fn build_meta() -> ReproMeta {
    ReproMeta {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        generated_ms: now_ms(),
    }
}

pub fn build_readme(meta: &ReproMeta) -> String {
    format!(
        "iluhaAnime repro bundle\n\
         generated_ms: {}\n\
         app_version: {}\n\
         os/arch: {}/{}\n\
         \n\
         Contents:\n\
         - meta.json: app version, OS, arch, generation time.\n\
         - frontend.json: sanitized UI snapshot (versions, settings without secrets, counts).\n\
         - storage.json: top-level app-data listing (names, sizes, mtimes, capped).\n\
         \n\
         Privacy: no media files, no database rows, no tokens, keys, or cookies.\n",
        meta.generated_ms, meta.app_version, meta.os, meta.arch
    )
}

pub fn validated_frontend_json(raw: &str) -> Result<String, String> {
    if raw.len() > FRONTEND_JSON_MAX_BYTES {
        return Err(format!(
            "frontend snapshot too large: {} bytes, cap is {FRONTEND_JSON_MAX_BYTES}",
            raw.len()
        ));
    }
    let value: serde_json::Value =
        serde_json::from_str(raw).map_err(|e| format!("frontend snapshot is not JSON: {e}"))?;
    serde_json::to_string_pretty(&value).map_err(|e| format!("serialize frontend snapshot: {e}"))
}

pub fn list_storage_entries(dir: &Path, max: usize) -> Vec<StorageEntry> {
    let mut entries = Vec::new();
    let read = std::fs::read_dir(dir);
    let Ok(read) = read else {
        return entries;
    };
    for entry in read.flatten().take(max.saturating_add(1)) {
        let path = entry.path();
        let Some(name) = path
            .file_name()
            .and_then(|n| n.to_str())
            .map(str::to_string)
        else {
            continue;
        };
        let metadata = entry.metadata().ok();
        let is_dir = metadata.as_ref().is_some_and(std::fs::Metadata::is_dir);
        entries.push(StorageEntry {
            name,
            is_dir,
            size_bytes: if is_dir {
                0
            } else {
                metadata.as_ref().map_or(0, std::fs::Metadata::len)
            },
            modified_ms: metadata
                .as_ref()
                .and_then(|m| m.modified().ok())
                .and_then(file_time_ms),
        });
        if entries.len() >= max {
            break;
        }
    }
    entries.sort_by(|a, b| a.name.cmp(&b.name));
    entries
}

fn zip_options() -> zip::write::SimpleFileOptions {
    zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated)
}

fn write_entry(
    zip: &mut zip::ZipWriter<std::fs::File>,
    name: &str,
    bytes: &[u8],
) -> Result<(), String> {
    zip.start_file(name, zip_options())
        .map_err(|e| format!("zip {name}: {e}"))?;
    zip.write_all(bytes)
        .map_err(|e| format!("write {name}: {e}"))?;
    Ok(())
}

pub fn validated_out_path(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim().to_string();
    if trimmed.is_empty() {
        return Err("output path is empty".to_string());
    }
    Ok(trimmed)
}

#[tauri::command]
pub async fn collect_repro_bundle(
    app: tauri::AppHandle,
    out_path: String,
    frontend_json: String,
) -> Result<String, String> {
    let out_path = validated_out_path(&out_path)?;
    let frontend = validated_frontend_json(&frontend_json)?;
    let meta = build_meta();
    let meta_json =
        serde_json::to_string_pretty(&meta).map_err(|e| format!("serialize meta: {e}"))?;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("resolve app data dir: {e}"))?;
    let storage = list_storage_entries(&dir, STORAGE_ENTRIES_MAX);
    let storage_json =
        serde_json::to_string_pretty(&storage).map_err(|e| format!("serialize storage: {e}"))?;
    let file = std::fs::File::create(&out_path).map_err(|e| format!("create bundle file: {e}"))?;
    let mut zip = zip::ZipWriter::new(file);
    write_entry(&mut zip, "meta.json", meta_json.as_bytes())?;
    write_entry(&mut zip, "frontend.json", frontend.as_bytes())?;
    write_entry(&mut zip, "storage.json", storage_json.as_bytes())?;
    write_entry(&mut zip, "README.txt", build_readme(&meta).as_bytes())?;
    zip.finish().map_err(|e| format!("finalize bundle: {e}"))?;
    Ok(out_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn meta_carries_version_and_platform() {
        let meta = build_meta();
        assert!(!meta.app_version.is_empty());
        assert!(!meta.os.is_empty());
        assert!(!meta.arch.is_empty());
    }

    #[test]
    fn readme_names_contents_and_privacy() {
        let meta = build_meta();
        let readme = build_readme(&meta);
        assert!(readme.contains("meta.json"));
        assert!(readme.contains("frontend.json"));
        assert!(readme.contains("storage.json"));
        assert!(readme.contains(&meta.app_version));
    }

    #[test]
    fn oversized_frontend_snapshot_rejected() {
        let big = "x".repeat(FRONTEND_JSON_MAX_BYTES + 1);
        assert!(validated_frontend_json(&big).is_err());
    }

    #[test]
    fn non_json_frontend_snapshot_rejected() {
        assert!(validated_frontend_json("not json").is_err());
    }

    #[test]
    fn valid_frontend_snapshot_pretty_printed() {
        let out = validated_frontend_json(r#"{"a":1}"#).expect("valid json");
        assert!(out.contains("\"a\": 1"));
    }

    #[test]
    fn storage_listing_sorted_and_capped() {
        let dir = std::env::temp_dir().join("iluha_repro_bench_probe");
        std::fs::create_dir_all(&dir).expect("probe dir");
        std::fs::write(dir.join("b.txt"), b"b").expect("probe file");
        std::fs::write(dir.join("a.txt"), b"a").expect("probe file");
        let entries = list_storage_entries(&dir, 1);
        assert_eq!(entries.len(), 1);
        let entries = list_storage_entries(&dir, 10);
        assert_eq!(entries.len(), 2);
        assert!(entries[0].name <= entries[1].name);
        std::fs::remove_dir_all(&dir).expect("probe cleanup");
    }

    #[test]
    fn missing_dir_lists_nothing() {
        let entries = list_storage_entries(Path::new("/nonexistent-iluha-repro-dir"), 10);
        assert!(entries.is_empty());
    }

    #[test]
    fn empty_out_path_rejected() {
        assert!(validated_out_path("").is_err());
        assert!(validated_out_path("   ").is_err());
    }

    #[test]
    fn out_path_trimmed() {
        assert_eq!(
            validated_out_path("  C:\\tmp\\repro.zip  ").expect("valid path"),
            "C:\\tmp\\repro.zip"
        );
    }
}
