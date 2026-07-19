use std::path::Path;

/// Write data to a temp file, then atomically rename it to the target path.
/// Prevents partial/corrupt writes if the process crashes mid-write.
#[allow(dead_code)]
pub fn atomic_write(path: &Path, data: &[u8]) -> Result<(), String> {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let tmp_name = format!(
        ".tmp_{}_{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    );
    let tmp_path = parent.join(&tmp_name);

    std::fs::write(&tmp_path, data).map_err(|e| format!("write temp: {e}"))?;
    std::fs::rename(&tmp_path, path).map_err(|e| format!("rename: {e}"))?;
    Ok(())
}
