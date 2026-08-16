use specta_typescript::Typescript;
use tauri_specta::{collect_commands, Builder};

fn main() {
    let builder = Builder::<tauri::Wry>::new().commands(collect_commands![
        iluhaanime_lib::ipc::get_backend_capabilities
    ]);
    builder
        .export(Typescript::default(), "../src/bindings.ts")
        .expect("failed to export TypeScript IPC bindings");
}
