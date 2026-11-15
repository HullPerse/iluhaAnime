fn main() {
    tauri_build::build();

    // Test harnesses do not inherit the Tauri app manifest. Loading comctl32
    // lazily lets them start without the Common-Controls v6 manifest; the
    // packaged app still has the Tauri manifest, and a dialog only resolves
    // comctl32 when it is actually opened.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        println!("cargo:rustc-link-arg=/DELAYLOAD:comctl32.dll");
        println!("cargo:rustc-link-arg=delayimp.lib");
    }

    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR");
    let source_dir = std::path::Path::new(&manifest_dir).join("lib");
    let target_dir = std::env::var("CARGO_TARGET_DIR").map_or_else(
        |_| std::path::Path::new(&manifest_dir).join("target"),
        std::path::PathBuf::from,
    );

    if source_dir.exists() {
        let entries = std::fs::read_dir(&source_dir).expect("read bundled lib directory");
        for entry in entries.flatten() {
            if !entry.path().is_file() {
                continue;
            }
            for profile in ["debug", "release"] {
                let destination = target_dir.join(profile).join("lib");
                if std::fs::create_dir_all(&destination).is_err() {
                    continue;
                }
                if std::fs::copy(entry.path(), destination.join(entry.file_name())).is_err() {
                    continue;
                }
            }
        }
    }
}
