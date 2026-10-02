fn main() {
    tauri_build::build();

    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR");
    let source_dir = std::path::Path::new(&manifest_dir).join("lib");
    let target_dir = std::env::var("CARGO_TARGET_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::path::Path::new(&manifest_dir).join("target"));

    if source_dir.exists() {
        let entries = std::fs::read_dir(&source_dir)
            .expect("read bundled lib directory");
        for entry in entries.flatten() {
            if !entry.path().is_file() {
                continue;
            }
            for profile in ["debug", "release"] {
                let destination = target_dir.join(profile).join("lib");
                if std::fs::create_dir_all(&destination).is_err() {
                    continue;
                }
                if std::fs::copy(&entry.path(), destination.join(entry.file_name())).is_err()
                {
                    continue;
                }
            }
        }
    }
}
