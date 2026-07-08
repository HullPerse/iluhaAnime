use axum::{
    body::Body,
    extract::{Query, Request},
    http::{header, StatusCode, HeaderMap, HeaderValue},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use serde::Deserialize;
use std::path::Path;
use std::sync::OnceLock;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio::sync::Mutex;
use tower_http::cors::CorsLayer;

static SERVER: OnceLock<ServerHandle> = OnceLock::new();

#[allow(dead_code)]
struct ServerHandle {
    port: u16,
    shutdown: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
}

#[derive(Deserialize)]
struct FileParams {
    path: String,
}

#[derive(Deserialize)]
struct RemuxParams {
    path: String,
    audio_idx: Option<i32>,
    sub_idx: Option<i32>,
}

fn content_type_for_ext(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mkv" => "video/x-matroska",
        "avi" => "video/x-msvideo",
        "mov" => "video/quicktime",
        "m4a" => "audio/mp4",
        "mp3" => "audio/mpeg",
        "flac" => "audio/flac",
        "opus" => "audio/opus",
        "ogg" => "audio/ogg",
        "wav" => "audio/wav",
        "aac" => "audio/aac",
        "ac3" => "audio/ac3",
        "eac3" => "audio/eac3",
        "dts" => "audio/dts",
        "ass" => "text/plain",
        "vtt" => "text/vtt",
        "srt" => "text/plain",
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        _ => "application/octet-stream",
    }
}

async fn handle_file(params: Query<FileParams>, req: Request<Body>) -> Response {
    let path = &params.path;
    let file_path = Path::new(path);

    if !file_path.exists() {
        return (StatusCode::NOT_FOUND, "File not found").into_response();
    }

    let metadata = match tokio::fs::metadata(file_path).await {
        Ok(m) => m,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Cannot read file").into_response(),
    };

    let file_len = metadata.len();
    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    let content_type = content_type_for_ext(ext);

    let range_header = req.headers().get(header::RANGE);
    let if_range = req.headers().get(header::IF_RANGE);
    let if_match = req.headers().get(header::IF_NONE_MATCH);

    // Etag based on inode + size + mtime — avoid sending full file when cached
    let etag = format!(
        "\"{:x}-{:x}\"",
        file_len,
        metadata
            .modified()
            .map(|t| t.duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0))
            .unwrap_or(0),
    );

    if let Some(etag_header) = if_match {
        let req_etag = etag_header.to_str().unwrap_or("");
        if req_etag == &etag {
            return (StatusCode::NOT_MODIFIED).into_response();
        }
    }

    if let Some(range_str) = range_header {
        // Validate If-Range
        if let Some(if_range_val) = if_range {
            if if_range_val != &etag {
                // If-Range doesn't match — send full file
                return serve_full(file_path, file_len, content_type, &etag).await;
            }
        }

        if let Ok(Some((start, end))) = parse_range(range_str, file_len) {
            return serve_range(file_path, start, end, file_len, content_type, &etag).await;
        }
    }

    serve_full(file_path, file_len, content_type, &etag).await
}

fn parse_range(range_str: &HeaderValue, file_len: u64) -> Result<Option<(u64, u64)>, ()> {
    let range_str = range_str.to_str().map_err(|_| ())?;
    let range_str = range_str.trim();

    if !range_str.starts_with("bytes=") {
        return Err(());
    }

    let range_val = &range_str[6..];
    if let Some(end_str) = range_val.strip_suffix('-') {
        // "bytes=N-"
        let start: u64 = end_str.parse().map_err(|_| ())?;
        if start >= file_len {
            return Err(());
        }
        Ok(Some((start, file_len - 1)))
    } else if let Some(dash_pos) = range_val.find('-') {
        // "bytes=N-M"
        let start: u64 = range_val[..dash_pos].parse().map_err(|_| ())?;
        let end: u64 = range_val[dash_pos + 1..].parse().map_err(|_| ())?;
        if start >= file_len || end >= file_len || start > end {
            return Err(());
        }
        Ok(Some((start, end.min(file_len - 1))))
    } else {
        Err(())
    }
}

async fn serve_full(
    path: &Path,
    file_len: u64,
    content_type: &str,
    etag: &str,
) -> Response {
    let file = match tokio::fs::File::open(path).await {
        Ok(f) => f,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR).into_response(),
    };

    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_str(content_type).unwrap());
    headers.insert(header::CONTENT_LENGTH, HeaderValue::from(file_len));
    headers.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    headers.insert(header::ETAG, HeaderValue::from_str(etag).unwrap());
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static("*"),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_HEADERS,
        HeaderValue::from_static("Range, If-Range, If-None-Match"),
    );
    headers.insert(
        header::ACCESS_CONTROL_EXPOSE_HEADERS,
        HeaderValue::from_static("Content-Length, Content-Range, Accept-Ranges"),
    );

    let body = Body::from_stream(tokio_util::io::ReaderStream::new(file));
    (StatusCode::OK, headers, body).into_response()
}

async fn serve_range(
    path: &Path,
    start: u64,
    end: u64,
    file_len: u64,
    content_type: &str,
    etag: &str,
) -> Response {
    let mut file = match tokio::fs::File::open(path).await {
        Ok(f) => f,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR).into_response(),
    };

    // Seek to the requested byte offset before streaming
    if file.seek(std::io::SeekFrom::Start(start)).await.is_err() {
        return (StatusCode::INTERNAL_SERVER_ERROR).into_response();
    }

    let range_len = end - start + 1;

    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_str(content_type).unwrap());
    headers.insert(header::CONTENT_LENGTH, HeaderValue::from(range_len));
    headers.insert(
        header::CONTENT_RANGE,
        HeaderValue::from_str(&format!("bytes {}-{}/{}", start, end, file_len)).unwrap(),
    );
    headers.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    headers.insert(header::ETAG, HeaderValue::from_str(etag).unwrap());
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static("*"),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_HEADERS,
        HeaderValue::from_static("Range, If-Range, If-None-Match"),
    );
    headers.insert(
        header::ACCESS_CONTROL_EXPOSE_HEADERS,
        HeaderValue::from_static("Content-Length, Content-Range, Accept-Ranges"),
    );

    let limited = file.take(range_len);
    let body = Body::from_stream(tokio_util::io::ReaderStream::new(limited));
    (StatusCode::PARTIAL_CONTENT, headers, body).into_response()
}

async fn handle_remux(params: Query<RemuxParams>, _req: Request<Body>) -> Response {
    use crate::video;
    use tokio::process::Command;

    // Acquire the global ffmpeg semaphore before spawning
    let _permit = match video::FFMPEG_SEM.acquire().await {
        Ok(p) => p,
        Err(_) => {
            return (StatusCode::SERVICE_UNAVAILABLE, "server busy").into_response();
        }
    };

    let path = &params.path;
    let file_path = Path::new(path);
    if !file_path.exists() {
        return (StatusCode::NOT_FOUND, "File not found").into_response();
    }

    let mut args = vec![
        "-hwaccel".to_string(),
        "auto".to_string(),
        "-i".to_string(),
        path.clone(),
        "-map".to_string(),
        "0:v?".to_string(),
    ];

    // Add audio track if specified
    if let Some(audio_idx) = params.audio_idx {
        args.push("-map".to_string());
        args.push(format!("0:a:{}?", audio_idx));
        args.push("-c:a".to_string());
        args.push("copy".to_string());
    }

    // Add subtitle track if specified
    if let Some(sub_idx) = params.sub_idx {
        args.push("-map".to_string());
        args.push(format!("0:s:{}?", sub_idx));
        args.push("-c:s".to_string());
        args.push("copy".to_string());
    }

    // Fallback: include all audio if no selection
    if params.audio_idx.is_none() && params.sub_idx.is_none() {
        args.push("-map".to_string());
        args.push("0:a?".to_string());
        args.push("-c:a".to_string());
        args.push("copy".to_string());
    }

    args.extend_from_slice(&[
        "-c:v".to_string(),
        "copy".to_string(),
        "-f".to_string(),
        "mp4".to_string(),
        "-movflags".to_string(),
        "empty_moov+frag_keyframe+default_base_moof".to_string(),
        "-progress".to_string(),
        "pipe:1".to_string(),
        "-nostats".to_string(),
        "pipe:1".to_string(),
    ]);

    let exe = video::ffmpeg_exe_static();
    let mut cmd = Command::new(&exe);
    cmd.args(&args);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::null());

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR).into_response(),
    };

    let stdout = match child.stdout.take() {
        Some(s) => s,
        None => return (StatusCode::INTERNAL_SERVER_ERROR).into_response(),
    };

    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("video/mp4"),
    );
    headers.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static("*"),
    );

    // We don't know the final size, so omit Content-Length for chunked transfer
    let body = Body::from_stream(tokio_util::io::ReaderStream::new(stdout));

    // Spawn a task to wait for the child to finish and collect stderr
    tokio::spawn(async move {
        let _ = child.wait().await;
    });

    (StatusCode::OK, headers, body).into_response()
}

pub async fn init() -> Result<u16, String> {
    if SERVER.get().is_some() {
        return Ok(SERVER.get().unwrap().port);
    }

    let app = Router::new()
        .route("/file", get(handle_file))
        .route("/remux", get(handle_remux))
        .layer(CorsLayer::permissive());

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("bind stream server: {e}"))?;
    let port = listener.local_addr().map_err(|e| format!("get port: {e}"))?.port();

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();

    let handle = ServerHandle {
        port,
        shutdown: Mutex::new(Some(shutdown_tx)),
    };
    let _ = SERVER.set(handle);

    tokio::spawn(async move {
        axum::serve(listener, app)
            .with_graceful_shutdown(async {
                let _ = shutdown_rx.await;
            })
            .await
            .ok();
    });

    Ok(port)
}

pub fn server_port() -> Option<u16> {
    SERVER.get().map(|h| h.port)
}

#[allow(dead_code)]
pub fn shutdown() {
    if let Some(handle) = SERVER.get() {
        let mut guard = handle.shutdown.blocking_lock();
        if let Some(tx) = guard.take() {
            let _ = tx.send(());
        }
    }
}
