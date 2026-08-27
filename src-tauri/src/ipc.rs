use serde::{Deserialize, Serialize};

// This is the first typed IPC boundary. Keep additions here limited to commands
// whose request/response types derive specta::Type, then expand the generated
// surface incrementally without replacing the existing handler all at once.

#[derive(Debug, Clone, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BackendCapabilities {
    pub api_version: String,
    pub typed_ipc: bool,
}

#[tauri::command]
#[specta::specta]
#[must_use]
pub fn get_backend_capabilities() -> BackendCapabilities {
    BackendCapabilities {
        api_version: "2".to_string(),
        typed_ipc: true,
    }
}
