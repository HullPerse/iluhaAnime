fn main() {
    let path = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "../src-tauri/target/ipc-pilot.generated.ts".to_string());
    iluhaanime_lib::ipc_bindings::export(&path).expect("export IPC bindings");
    println!("IPC bindings written to {path}");
}
