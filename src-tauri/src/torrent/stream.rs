//! Loopback HTTP byte server for torrent payloads.
//!
//! mpv can only open files and URLs, not an in-process random-access reader, so
//! a payload that is still downloading is exposed as a range-capable HTTP
//! resource over `librqbit`'s [`FileStream`]. The stream layer waits for missing
//! pieces and prioritizes the window the reader is in, which is what makes
//! playback of an incomplete file possible without sparse zeroes.
//!
//! Security posture: the listener binds `127.0.0.1:0`, every request must carry
//! an unguessable token that was handed out over IPC, and the handler can only
//! read the payload that token names. Unknown tokens are 404, a paused or
//! errored torrent answers 503 instead of hanging, and range parsing rejects
//! everything except a single byte range.

use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use axum::{
    body::Body,
    extract::{ConnectInfo, Path as AxumPath, State},
    http::{header, HeaderMap, HeaderValue, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncSeekExt},
    sync::Semaphore,
};
use tokio_util::io::ReaderStream;

use super::manager::TorrentManager;
use librqbit::TorrentStatsState;

const TOKEN_BYTES: usize = 16;
const MAX_TOKENS: usize = 256;
const TOKEN_TTL: Duration = Duration::from_hours(12);
const MAX_ACTIVE_REQUESTS: usize = 2;
const REQUEST_PERMIT_WAIT: Duration = Duration::from_secs(10);
const STREAM_OPEN_WAIT: Duration = Duration::from_secs(5);
const STREAM_CHUNK_BYTES: usize = 64 * 1024;

/// One file of a torrent that was asked to be streamed.
#[derive(Debug, Clone)]
pub struct StreamEntry {
    pub torrent_id: usize,
    pub file_index: usize,
    pub name: String,
    pub size: u64,
    /// The final path under the save dir. Progress, tracks and resume use it as
    /// the stable key, so streaming and a later finished file share one entry.
    pub canonical_path: String,
    pub url: String,
    created_at: Instant,
}

impl StreamEntry {
    #[must_use]
    pub fn new(
        torrent_id: usize,
        file_index: usize,
        name: String,
        size: u64,
        canonical_path: String,
    ) -> Self {
        Self {
            torrent_id,
            file_index,
            name,
            size,
            canonical_path,
            url: String::new(),
            created_at: Instant::now(),
        }
    }
}

/// What the frontend receives for each requested file.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TorrentStream {
    /// Empty for a finished file, which plays from its local path.
    pub token: Option<String>,
    pub url: Option<String>,
    /// What mpv should be given: the URL while streaming, the path once done.
    pub target: String,
    /// Stable key for watch/track state (the final path).
    pub path: String,
    pub local_path: Option<String>,
    pub name: String,
    pub size: u64,
    pub file_index: usize,
    pub streaming: bool,
}

/// Tokens and the lazily started loopback server. Managed as Tauri state.
pub struct StreamRegistry {
    inner: Arc<StreamInner>,
    addr: tokio::sync::Mutex<Option<SocketAddr>>,
}

impl Default for StreamRegistry {
    fn default() -> Self {
        Self {
            inner: Arc::new(StreamInner {
                tokens: Mutex::new(HashMap::new()),
                permits: Semaphore::new(MAX_ACTIVE_REQUESTS),
            }),
            addr: tokio::sync::Mutex::new(None),
        }
    }
}

struct StreamInner {
    tokens: Mutex<HashMap<String, StreamEntry>>,
    permits: Semaphore,
}

#[derive(Clone)]
struct ApiState {
    inner: Arc<StreamInner>,
    manager: Arc<TorrentManager>,
}

impl StreamRegistry {
    /// Bind on the first call and keep the listener for the process lifetime.
    /// The caller passes the manager so the handler can resolve torrents.
    pub async fn ensure_server(&self, manager: Arc<TorrentManager>) -> Result<SocketAddr, String> {
        let mut slot = self.addr.lock().await;
        if let Some(addr) = *slot {
            return Ok(addr);
        }
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
            .await
            .map_err(|error| format!("stream listener failed: {error}"))?;
        let addr = listener
            .local_addr()
            .map_err(|error| format!("stream listener address failed: {error}"))?;
        let state = ApiState {
            inner: Arc::clone(&self.inner),
            manager,
        };
        let app = Router::new()
            .route("/s/{token}", get(handle_stream))
            .route("/s/{token}/{*name}", get(handle_stream))
            .with_state(state);
        let service = app.into_make_service_with_connect_info::<SocketAddr>();
        tokio::spawn(async move {
            if let Err(error) = axum::serve(listener, service).await {
                tracing::warn!("torrent stream server stopped: {error:#}");
            }
        });
        *slot = Some(addr);
        drop(slot);
        tracing::debug!("torrent stream server listening on {addr}");
        Ok(addr)
    }

    /// Register a streaming target and return what the frontend needs.
    pub fn register(&self, addr: SocketAddr, entry: StreamEntry) -> TorrentStream {
        let token = self.next_token();
        let name = entry.name.clone();
        let size = entry.size;
        let file_index = entry.file_index;
        let canonical = entry.canonical_path.clone();
        let url = stream_url(addr, &token, &display_name(&name));
        let stored = StreamEntry {
            url: url.clone(),
            created_at: Instant::now(),
            ..entry
        };
        {
            let mut tokens = lock(&self.inner.tokens);
            prune_tokens(&mut tokens);
            tokens.insert(token.clone(), stored);
        }
        TorrentStream {
            token: Some(token),
            url: Some(url.clone()),
            target: url,
            path: canonical,
            local_path: None,
            name,
            size,
            file_index,
            streaming: true,
        }
    }

    pub fn release(&self, tokens: &[String]) -> Vec<StreamEntry> {
        if tokens.is_empty() {
            return Vec::new();
        }
        let mut stored = lock(&self.inner.tokens);
        tokens
            .iter()
            .filter_map(|token| stored.remove(token))
            .collect()
    }

    /// Drop every token of a torrent that is being removed.
    pub fn release_torrent(&self, torrent_id: usize) -> Vec<String> {
        let mut stored = lock(&self.inner.tokens);
        let doomed: Vec<String> = stored
            .iter()
            .filter(|(_, entry)| entry.torrent_id == torrent_id)
            .map(|(token, _)| token.clone())
            .collect();
        for token in &doomed {
            stored.remove(token);
        }
        doomed
    }

    /// The stable watch key for a target mpv is currently playing.
    #[must_use]
    pub fn canonical_for_target(&self, target: &str) -> Option<String> {
        if target.is_empty() {
            return None;
        }
        let stored = lock(&self.inner.tokens);
        stored
            .values()
            .find(|entry| entry.url == target)
            .map(|entry| entry.canonical_path.clone())
    }

    fn next_token(&self) -> String {
        loop {
            let token = hex::encode(rand::random::<[u8; TOKEN_BYTES]>());
            let stored = lock(&self.inner.tokens);
            if !stored.contains_key(&token) {
                return token;
            }
        }
    }
}

/// Keep the map bounded: expired entries first, then the oldest.
fn prune_tokens(tokens: &mut HashMap<String, StreamEntry>) {
    if tokens.len() >= MAX_TOKENS {
        tokens.retain(|_, entry| entry.created_at.elapsed() < TOKEN_TTL);
        while tokens.len() >= MAX_TOKENS {
            let oldest = tokens
                .iter()
                .min_by_key(|(_, entry)| entry.created_at)
                .map(|(token, _)| token.clone());
            match oldest {
                Some(token) => {
                    tokens.remove(&token);
                }
                None => break,
            }
        }
    }
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

fn display_name(name: &str) -> String {
    name.rsplit(['/', '\\']).next().unwrap_or(name).to_string()
}

fn stream_url(addr: SocketAddr, token: &str, name: &str) -> String {
    format!("http://{addr}/s/{token}/{}", encode_path_segment(name))
}

/// Percent-encode one path segment: mpv shows the last segment as the title, so
/// the real file name has to survive the URL unchanged after decoding.
#[must_use]
pub fn encode_path_segment(value: &str) -> String {
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    let mut out = String::with_capacity(value.len());
    for &byte in value.as_bytes() {
        let keep = byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~');
        if keep {
            out.push(char::from(byte));
        } else {
            out.push('%');
            out.push(char::from(HEX[usize::from(byte >> 4)]));
            out.push(char::from(HEX[usize::from(byte & 0x0F)]));
        }
    }
    out
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RangeError {
    Malformed,
    Unsatisfiable,
}

/// Parse a single `Range: bytes=...` header into inclusive bounds.
/// Multiple ranges are rejected: mpv/ffmpeg never asks for them.
pub fn parse_range(header: Option<&str>, len: u64) -> Result<Option<(u64, u64)>, RangeError> {
    let Some(value) = header else {
        return Ok(None);
    };
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    let spec = value
        .strip_prefix("bytes=")
        .ok_or(RangeError::Malformed)?
        .trim();
    if spec.contains(',') {
        return Err(RangeError::Malformed);
    }
    let (start, end) = spec.split_once('-').ok_or(RangeError::Malformed)?;
    let start = start.trim();
    let end = end.trim();
    if start.is_empty() {
        let suffix: u64 = end.parse().map_err(|_| RangeError::Malformed)?;
        if suffix == 0 || len == 0 {
            return Err(RangeError::Unsatisfiable);
        }
        return Ok(Some((len.saturating_sub(suffix), len - 1)));
    }
    let start: u64 = start.parse().map_err(|_| RangeError::Malformed)?;
    if len == 0 || start >= len {
        return Err(RangeError::Unsatisfiable);
    }
    if end.is_empty() {
        return Ok(Some((start, len - 1)));
    }
    let end: u64 = end.parse().map_err(|_| RangeError::Malformed)?;
    if end < start {
        return Err(RangeError::Unsatisfiable);
    }
    Ok(Some((start, end.min(len - 1))))
}

/// Container MIME type by extension. mpv probes by content anyway; the header
/// keeps ffmpeg from guessing on a URL that carries no extension.
#[must_use]
pub fn content_type(name: &str) -> &'static str {
    let extension = name
        .rsplit_once('.')
        .map(|(_, extension)| extension.to_ascii_lowercase())
        .unwrap_or_default();
    match extension.as_str() {
        "mkv" => "video/x-matroska",
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        "avi" => "video/x-msvideo",
        "mov" => "video/quicktime",
        "wmv" => "video/x-ms-wmv",
        "ts" | "m2ts" | "mts" => "video/mp2t",
        "flv" => "video/x-flv",
        "ogv" | "ogg" => "video/ogg",
        "mka" => "audio/x-matroska",
        "m4a" => "audio/mp4",
        "mp3" => "audio/mpeg",
        "flac" => "audio/flac",
        "opus" => "audio/ogg",
        "srt" => "application/x-subrip",
        "ass" | "ssa" => "text/x-ssa",
        "vtt" => "text/vtt",
        _ => "application/octet-stream",
    }
}

fn error_response(status: StatusCode, message: &str) -> Response {
    (
        status,
        [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
        message.to_string(),
    )
        .into_response()
}

async fn handle_stream(
    State(state): State<ApiState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    AxumPath(params): AxumPath<HashMap<String, String>>,
    method: Method,
    headers: HeaderMap,
) -> Response {
    if !peer.ip().is_loopback() {
        return error_response(StatusCode::FORBIDDEN, "loopback only");
    }
    let Some(token) = params.get("token") else {
        return error_response(StatusCode::BAD_REQUEST, "missing token");
    };
    let entry = {
        let stored = lock(&state.inner.tokens);
        stored.get(token).cloned()
    };
    let Some(entry) = entry else {
        return error_response(StatusCode::NOT_FOUND, "unknown stream");
    };
    if entry.created_at.elapsed() >= TOKEN_TTL {
        lock(&state.inner.tokens).remove(token);
        return error_response(StatusCode::GONE, "stream expired");
    }
    let Some(handle) = state.manager.torrent_handle(entry.torrent_id) else {
        return error_response(StatusCode::NOT_FOUND, "torrent is gone");
    };
    if state.manager.torrent_is_paused(entry.torrent_id) {
        return error_response(StatusCode::SERVICE_UNAVAILABLE, "torrent is paused");
    }
    let torrent_stats = handle.stats();
    if torrent_stats.error.is_some() {
        return error_response(StatusCode::SERVICE_UNAVAILABLE, "torrent has an error");
    }
    if matches!(torrent_stats.state, TorrentStatsState::Initializing { .. }) {
        return error_response(StatusCode::SERVICE_UNAVAILABLE, "torrent is checking files");
    }
    // A token can outlive the selection that created it: if the user turns the
    // file off, answer instead of blocking forever on pieces that never arrive.
    let progress = torrent_stats
        .file_progress
        .get(entry.file_index)
        .copied()
        .unwrap_or_default();
    let selected = handle
        .only_files()
        .is_none_or(|files| files.contains(&entry.file_index));
    if !selected && progress < entry.size {
        return error_response(
            StatusCode::SERVICE_UNAVAILABLE,
            "file is not selected for download",
        );
    }

    let range = match parse_range(
        headers
            .get(header::RANGE)
            .and_then(|value| value.to_str().ok()),
        entry.size,
    ) {
        Ok(range) => range,
        Err(RangeError::Unsatisfiable) => {
            return error_response(StatusCode::RANGE_NOT_SATISFIABLE, "bad range");
        }
        Err(RangeError::Malformed) => {
            return error_response(StatusCode::BAD_REQUEST, "malformed range");
        }
    };

    let (start, end) = range.unwrap_or_else(|| (0, entry.size.saturating_sub(1)));
    let length = end.saturating_sub(start) + 1;
    let partial = range.is_some();
    let status = if partial {
        StatusCode::PARTIAL_CONTENT
    } else {
        StatusCode::OK
    };

    if entry.size == 0 {
        let mut response = Response::new(Body::empty());
        response
            .headers_mut()
            .insert(header::CONTENT_LENGTH, HeaderValue::from_static("0"));
        return response;
    }

    if method == Method::HEAD {
        let mut response = Response::new(Body::empty());
        *response.status_mut() = status;
        set_stream_headers(&mut response, &entry, start, end, length, partial);
        return response;
    }

    let permit = match tokio::time::timeout(REQUEST_PERMIT_WAIT, state.inner.permits.acquire())
        .await
    {
        Ok(Ok(permit)) => permit,
        Ok(Err(_)) => return error_response(StatusCode::SERVICE_UNAVAILABLE, "server is closed"),
        Err(_) => return error_response(StatusCode::SERVICE_UNAVAILABLE, "server is busy"),
    };

    let mut stream =
        match tokio::time::timeout(STREAM_OPEN_WAIT, handle.stream(entry.file_index)).await {
            Ok(Ok(stream)) => stream,
            Ok(Err(error)) => {
                tracing::debug!(
                    "stream open failed for torrent {}: {error:#}",
                    entry.torrent_id
                );
                return error_response(StatusCode::SERVICE_UNAVAILABLE, "file is not readable yet");
            }
            Err(_) => {
                return error_response(StatusCode::SERVICE_UNAVAILABLE, "file is not readable yet")
            }
        };

    if start > 0 && stream.seek(std::io::SeekFrom::Start(start)).await.is_err() {
        return error_response(StatusCode::INTERNAL_SERVER_ERROR, "seek failed");
    }

    let reader: Box<dyn AsyncRead + Send + Unpin> = Box::new(stream.take(length));
    let body = Body::from_stream(ReaderStream::with_capacity(reader, STREAM_CHUNK_BYTES));
    let mut response = Response::new(body);
    *response.status_mut() = status;
    set_stream_headers(&mut response, &entry, start, end, length, partial);
    drop(permit);
    response
}

fn set_stream_headers(
    response: &mut Response,
    entry: &StreamEntry,
    start: u64,
    end: u64,
    length: u64,
    partial: bool,
) {
    let headers = response.headers_mut();
    headers.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static(content_type(&entry.name)),
    );
    headers.insert(
        header::CONTENT_LENGTH,
        HeaderValue::from_maybe_shared(length.to_string())
            .unwrap_or_else(|_| HeaderValue::from_static("0")),
    );
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    if partial {
        if let Ok(value) =
            HeaderValue::from_maybe_shared(format!("bytes {start}-{end}/{}", entry.size))
        {
            headers.insert(header::CONTENT_RANGE, value);
        }
    }
}

#[cfg(test)]
mod tests {
    use std::net::SocketAddr;

    use super::*;

    #[test]
    fn parse_range_reads_the_forms_mpv_sends() {
        assert_eq!(parse_range(None, 100), Ok(None));
        assert_eq!(parse_range(Some(""), 100), Ok(None));
        assert_eq!(parse_range(Some("bytes=0-9"), 100), Ok(Some((0, 9))));
        assert_eq!(parse_range(Some("bytes=10-"), 100), Ok(Some((10, 99))));
        assert_eq!(parse_range(Some("bytes=-10"), 100), Ok(Some((90, 99))));
        assert_eq!(parse_range(Some("bytes=-1000"), 100), Ok(Some((0, 99))));
        assert_eq!(parse_range(Some("bytes=90-1000"), 100), Ok(Some((90, 99))));
    }

    #[test]
    fn parse_range_rejects_garbage_and_unsatisfiable_ranges() {
        assert_eq!(
            parse_range(Some("bytes=10-5"), 100),
            Err(RangeError::Unsatisfiable)
        );
        assert_eq!(
            parse_range(Some("bytes=100-"), 100),
            Err(RangeError::Unsatisfiable)
        );
        assert_eq!(
            parse_range(Some("bytes=-0"), 100),
            Err(RangeError::Unsatisfiable)
        );
        assert_eq!(
            parse_range(Some("bytes=0-1,5-6"), 100),
            Err(RangeError::Malformed)
        );
        assert_eq!(
            parse_range(Some("items=0-1"), 100),
            Err(RangeError::Malformed)
        );
        assert_eq!(
            parse_range(Some("bytes=abc-1"), 100),
            Err(RangeError::Malformed)
        );
        assert_eq!(
            parse_range(Some("bytes=0-"), 0),
            Err(RangeError::Unsatisfiable)
        );
    }

    #[test]
    fn content_type_maps_video_and_sidecar_extensions() {
        assert_eq!(content_type("Show - 01.mkv"), "video/x-matroska");
        assert_eq!(content_type("Show - 01.MP4"), "video/mp4");
        assert_eq!(content_type("Show - 01.ts"), "video/mp2t");
        assert_eq!(content_type("Show - 01.srt"), "application/x-subrip");
        assert_eq!(
            content_type("Show - 01.something"),
            "application/octet-stream"
        );
        assert_eq!(content_type("no-extension"), "application/octet-stream");
    }

    #[test]
    fn path_segment_keeps_the_display_name_decodable() {
        assert_eq!(encode_path_segment("Show - 01.mkv"), "Show%20-%2001.mkv");
        assert_eq!(
            encode_path_segment("Аниме 01.mkv"),
            "%D0%90%D0%BD%D0%B8%D0%BC%D0%B5%2001.mkv"
        );
        assert_eq!(encode_path_segment("a%20b"), "a%2520b");
    }

    #[test]
    fn registry_bounds_tokens_and_resolves_the_watch_key() {
        let registry = StreamRegistry::default();
        let addr: SocketAddr = "127.0.0.1:9".parse().expect("addr");
        let mut last = None;
        for index in 0..MAX_TOKENS + 4 {
            last = Some(registry.register(
                addr,
                StreamEntry::new(
                    1,
                    index,
                    format!("Show - {index:02}.mkv"),
                    10,
                    format!("C:/T/Show - {index:02}.mkv"),
                ),
            ));
        }
        let tokens = lock(&registry.inner.tokens);
        assert_eq!(tokens.len(), MAX_TOKENS);
        drop(tokens);
        let last = last.expect("the loop registers");
        let expected = format!("C:/T/Show - {:02}.mkv", MAX_TOKENS + 3);
        assert_eq!(
            registry
                .canonical_for_target(last.target.as_str())
                .as_deref(),
            Some(expected.as_str())
        );
        registry.release(&[last.token.expect("a stream has a token")]);
        assert!(registry
            .canonical_for_target(last.target.as_str())
            .is_none());
    }

    #[test]
    fn releasing_a_torrent_drops_only_its_tokens() {
        let registry = StreamRegistry::default();
        let addr: SocketAddr = "127.0.0.1:9".parse().expect("addr");
        for (torrent_id, index) in [(1, 0), (1, 1), (2, 0)] {
            registry.register(
                addr,
                StreamEntry::new(
                    torrent_id,
                    index,
                    "Show.mkv".to_string(),
                    1,
                    "C:/T/Show.mkv".to_string(),
                ),
            );
        }
        assert_eq!(registry.release_torrent(1).len(), 2);
        assert_eq!(lock(&registry.inner.tokens).len(), 1);
    }
}
