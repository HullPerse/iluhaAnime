use specta_typescript::Typescript;
use tauri_specta::{collect_commands, Builder};

/// Exports the typed command bindings for the first cards pilot.
///
/// The pilot is intentionally small: it proves the Rust -> TypeScript contract
/// on the commands that already have stable payload types. More command
/// modules can be added to this list without touching the runtime handler.
pub fn export(path: &str) -> Result<(), String> {
    Builder::<tauri::Wry>::new()
        .commands(collect_commands![
            crate::cards::gallery::cards_gallery,
            crate::cards::gallery::cards_set_preferred_image,
        ])
        .export(Typescript::default(), path)
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    #[test]
    #[ignore = "writes the pilot TypeScript contract; run explicitly after changing commands"]
    fn export_pilot_bindings() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/target/ipc-pilot.generated.ts");
        super::export(path).expect("export IPC bindings");
    }
}
