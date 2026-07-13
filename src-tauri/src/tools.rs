use serde::Serialize;
use std::path::PathBuf;
use tauri::{Emitter, Manager};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub download_size_mb: u64,
    pub download_size_bytes: u64,
    pub version: String,
    pub installed: bool,
}

#[derive(Debug, Clone)]
pub struct Tool {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub download_url_win: &'static str,
    pub download_url_linux: &'static str,
    pub download_size: u64,
    pub version: &'static str,
    pub exec_names: &'static [&'static str],
}


fn tool_download_url(tool: &Tool) -> &'static str {
    if cfg!(target_os = "windows") {
        tool.download_url_win
    } else {
        tool.download_url_linux
    }
}

const TOOLS: &[Tool] = &[
    Tool {
        id: "realesrgan",
        name: "Real-ESRGAN",
        description: "AI upscaler with anime model. Best quality for anime upscaling. ncnn-vulkan port — runs on any GPU.",
        download_url_win: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip",
        download_url_linux: "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-ubuntu.zip",
        download_size: 15_000_000,
        version: "0.2.5.0",
        exec_names: &["realesrgan-ncnn-vulkan.exe", "realesrgan-ncnn-vulkan"],
    },
    Tool {
        id: "waifu2x",
        name: "waifu2x",
        description: "Faster AI upscaler. Softer results than Real-ESRGAN but 2-3x faster.",
        download_url_win: "https://github.com/nihui/waifu2x-ncnn-vulkan/releases/download/20250915/waifu2x-ncnn-vulkan-20250915-windows.zip",
        download_url_linux: "https://github.com/nihui/waifu2x-ncnn-vulkan/releases/download/20250915/waifu2x-ncnn-vulkan-20250915-linux.zip",
        download_size: 10_000_000,
        version: "20250915",
        exec_names: &["waifu2x-ncnn-vulkan.exe", "waifu2x-ncnn-vulkan"],
    },
];

pub fn tools_dir(app_handle: &tauri::AppHandle) -> PathBuf {
    let platform = if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    };
    app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("iluha"))
        .join("bin")
        .join(platform)
        .join("tools")
}

pub fn tool_install_dir(app_handle: &tauri::AppHandle, tool_id: &str) -> PathBuf {
    tools_dir(app_handle).join(tool_id)
}

fn find_file_recursively(dir: &std::path::Path, name: &str) -> Option<PathBuf> {
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries {
        let entry = entry.ok()?;
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_file_recursively(&path, name) {
                return Some(found);
            }
        } else if path.file_name().and_then(|n| n.to_str()) == Some(name) {
            return Some(path);
        }
    }
    None
}

pub fn tool_exec_path(app_handle: &tauri::AppHandle, tool_id: &str) -> Option<String> {
    let tool = TOOLS.iter().find(|t| t.id == tool_id)?;
    let dir = tool_install_dir(app_handle, tool_id);
    if !dir.exists() {
        return None;
    }
    for name in tool.exec_names {
        if let Some(p) = find_file_recursively(&dir, name) {
            return Some(p.to_string_lossy().to_string());
        }
    }
    None
}

pub fn check_tool(app_handle: &tauri::AppHandle, tool_id: &str) -> bool {
    tool_exec_path(app_handle, tool_id).is_some()
}

pub fn list_tools(app_handle: &tauri::AppHandle) -> Vec<ToolInfo> {
    TOOLS
        .iter()
        .map(|t| ToolInfo {
            id: t.id.to_string(),
            name: t.name.to_string(),
            description: t.description.to_string(),
            download_size_mb: t.download_size / 1_000_000,
            download_size_bytes: t.download_size,
            version: t.version.to_string(),
            installed: check_tool(app_handle, t.id),
        })
        .collect()
}

#[tauri::command]
pub async fn download_tool(
    app_handle: tauri::AppHandle,
    tool_id: String,
) -> Result<(), String> {
    let tool = TOOLS
        .iter()
        .find(|t| t.id == tool_id)
        .ok_or_else(|| format!("unknown tool: {tool_id}"))?;

    let install_dir = tool_install_dir(&app_handle, &tool_id);
    std::fs::create_dir_all(&install_dir).map_err(|e| format!("create install dir: {e}"))?;

    let temp_dir = std::env::temp_dir().join(format!("iluha_tool_{}", tool_id));
    let _ = std::fs::remove_dir_all(&temp_dir);
    std::fs::create_dir_all(&temp_dir).map_err(|e| format!("create temp dir: {e}"))?;

    // Download the file
    let client = reqwest::Client::builder()
        .user_agent("iluhaAnime/1.0")
        .build()
        .map_err(|e| format!("build client: {e}"))?;

    let response = client
        .get(tool_download_url(tool))
        .send()
        .await
        .map_err(|e| format!("download {tool_id}: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!(
            "download {tool_id}: server returned {status}",
        ));
    }

    let total = response.content_length().unwrap_or(tool.download_size);
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();

    use futures::StreamExt;
    let archive_path = temp_dir.join(format!("{tool_id}.zip"));
    let mut file = tokio::fs::File::create(&archive_path)
        .await
        .map_err(|e| format!("create file: {e}"))?;

    use tokio::io::AsyncWriteExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("download chunk: {e}"))?;
        downloaded += chunk.len() as u64;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("write chunk: {e}"))?;

        let _ = app_handle.emit(
            "tool-download-progress",
            serde_json::json!({
                "toolId": tool_id,
                "downloaded": downloaded,
                "total": total,
            }),
        );
    }
    file.flush().await.map_err(|e| format!("flush: {e}"))?;
    drop(file);

    // Extract
    let file = std::fs::File::open(&archive_path)
        .map_err(|e| format!("open archive: {e}"))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("read zip: {e}"))?;
    archive
        .extract(&install_dir)
        .map_err(|e| format!("extract zip: {e}"))?;

    // Cleanup temp
    let _ = std::fs::remove_dir_all(&temp_dir);

    let _ = app_handle.emit(
        "tool-download-progress",
        serde_json::json!({
            "toolId": tool_id,
            "downloaded": total,
            "total": total,
        }),
    );

    Ok(())
}

#[tauri::command]
pub async fn check_tool_installed(app_handle: tauri::AppHandle, tool_id: String) -> bool {
    check_tool(&app_handle, &tool_id)
}

#[tauri::command]
pub fn get_tool_path(
    app_handle: tauri::AppHandle,
    tool_id: String,
) -> Option<String> {
    tool_exec_path(&app_handle, &tool_id)
}

#[tauri::command]
pub fn list_available_tools(app_handle: tauri::AppHandle) -> Vec<ToolInfo> {
    list_tools(&app_handle)
}

#[tauri::command]
pub fn remove_tool(app_handle: tauri::AppHandle, tool_id: String) -> Result<(), String> {
    let dir = tool_install_dir(&app_handle, &tool_id);
    if !dir.exists() {
        return Err(format!("Инструмент '{tool_id}' не найден"));
    }
    std::fs::remove_dir_all(&dir).map_err(|e| format!("remove {tool_id}: {e}"))
}
