How Shiru's Player Works (What We Learned)
Shiru uses Electron + WebTorrent. Its architecture is:
Main Window (Svelte UI)
    ↓
Hidden Window: WebTorrent (Node.js)
    ↓
torrent.createServer() → HTTP server on localhost
    ↓
<video src="http://localhost:PORT/...">
Key points from Shiru's source:
- WebTorrent runs in a separate hidden BrowserWindow with nodeIntegration: true
- webtorrent-client npm package creates an HTTP server with byte-range support automatically
- The Svelte player consumes that HTTP URL in a <video> tag
- Extensions are JS modules loaded via extension:// protocol. They return direct media URLs (MP4/HLS) that bypass WebTorrent entirely
Shiru's packages (from their client/package.json):
- webtorrent — BitTorrent engine with built-in HTTP server
- bittorrent-tracker — Tracker client
- parse-torrent — Magnet/torrent parsing
How YOUR Player Would Work (Tauri + librqbit)
Your stack is fundamentally different but capable of the same result. Here's the architecture:
React Player UI
    ↓
Tauri Command: start_stream_server(torrent_id, file_idx)
    ↓
librqbit::Api::api_stream() → FileStream (AsyncRead + AsyncSeek)
    ↓
Wrap FileStream in a tiny HTTP server (axum/hyper)
    ↓
<video src="http://localhost:PORT/torrent/123/file/0">
The Streaming Pipeline
librqbit already has streaming support via api_stream():
// This already exists in librqbit
let stream = api.api_stream(torrent_id, file_id)?; // returns FileStream
FileStream implements:
- AsyncRead — read bytes on demand
- AsyncSeek — jump to any position (for video seeking)
- Drop — cleans up when the stream ends
What YOU need to build: A thin HTTP wrapper around FileStream that speaks the protocol browsers expect:
Feature	librqbit Provides?	You Build?
Torrent download	Yes	No
On-demand piece fetching	Yes	No
Byte-range seeking	Yes (AsyncSeek)	No
HTTP server	No	Yes
MIME type detection	Yes (torrent_file_mime_type)	No
CORS headers	No	Yes
The HTTP Server You Need
You need a small Axum/Hyper server running inside the Tauri backend:
// Pseudocode for your new Rust module: src-tauri/src/stream_server.rs

use axum::{
    extract::Path,
    response::IntoResponse,
    routing::get,
    Router,
};
use librqbit::Api;
use std::sync::Arc;
use tokio_util::io::ReaderStream;

async fn stream_file(
    Path((torrent_id, file_id)): Path<(usize, usize)>,
    api: axum::extract::State<Arc<Api>>,
    range: Option<axum::headers::Range>,
) -> impl IntoResponse {
    let mut file_stream = api.api_stream(torrent_id, file_id).unwrap();
    
    // Handle HTTP Range header for video seeking
    if let Some(range) = range {
        let (start, end) = parse_range(range, file_stream.len());
        file_stream.set_position(start);
        // Return 206 Partial Content
    }
    
    let stream = ReaderStream::new(file_stream);
    (
        [
            ("Content-Type", api.torrent_file_mime_type(file_id).unwrap_or("video/mp4")),
            ("Accept-Ranges", "bytes"),
        ],
        axum::body::Body::from_stream(stream),
    )
}

pub fn start_server(api: Arc<Api>, port: u16) {
    let app = Router::new()
        .route("/torrent/:id/file/:idx", get(stream_file))
        .with_state(api);
    
    tokio::spawn(axum::Server::bind(&format!("127.0.0.1:{}", port).parse().unwrap())
        .serve(app.into_make_service()));
}
Exact Crates You Need to Add
Rust (src-tauri/Cargo.toml)
Crate	Purpose	Already Have?
librqbit	Torrent engine + FileStream	Yes
axum	HTTP server framework	No
tokio-util	ReaderStream to bridge AsyncRead → HTTP body	No
tower-http	CORS layer + range request helpers	No
discord-rich-presence	Discord RPC (optional, separate feature)	No
[dependencies]
axum = "0.7"
tokio-util = { version = "0.7", features = ["io"] }
tower-http = { version = "0.5", features = ["cors"] }
discord-rich-presence = "0.2" # optional
Frontend (package.json)
Package	Purpose
video.js or native <video>	For basic playback, native HTML5 <video> is enough
hls.js	If you want to support HLS streams from extensions
You do NOT need: webtorrent, bittorrent-tracker, parse-torrent. librqbit handles all of that in Rust.
Extension Support: Can You Stream Instantly Like Shiru?
Yes, but the architecture is different.
Shiru's "extensions" do one thing: they return a direct video URL (MP4, HLS, or DASH). The player then loads that URL directly — no torrent involved. This is "instant streaming."
Two Types of Extensions
Type	What It Returns	Example
Torrent source	Magnet link / .torrent file	Nyaa, Erai-raws
Direct stream source	Direct MP4/HLS URL	Personal media server, custom CDN
Your app already handles Type 1 (torrent sources). For Type 2, you need:
Minimal Extension System
Instead of Shiru's full JS extension runtime, you can start with a JSON-based provider system:
// src/extensions/my-extension.json
{
  "name": "My Media Server",
  "type": "direct",
  "searchUrl": "https://my-server.com/api/search?q={query}",
  "resultMapper": {
    "title": "name",
    "videoUrl": "stream_url",
    "poster": "thumbnail"
  }
}
When user clicks a result:
1. Extension returns { videoUrl: "https://my-server.com/video/123.mp4" }
2. Your player loads <video src="https://my-server.com/video/123.mp4"> directly
3. Instant playback — no torrent, no download
Advanced: JS Extensions (Like Shiru)
If you want true Shiru parity with JS extensions:
Approach	Crate	Effort
QuickJS runtime	rquickjs	Medium — embed JS engine in Rust
Deno runtime	deno_core	High — full V8 engine, heavy binary
Recommendation: Start with JSON extensions. They cover 90% of use cases (RSS feeds, simple APIs). Only add JS runtime if users actually demand it.
Streaming Comparison: Shiru vs Your App
Feature	Shiru (WebTorrent)	Your App (librqbit)
HTTP server	Built-in to WebTorrent	You build with Axum
Byte-range seeking	Automatic	Manual range header parsing
Piece prioritization	Automatic	Automatic (librqbit handles it)
Stream while downloading	Yes	Yes
Multiple concurrent streams	Yes	Yes (one FileStream per request)
Subtitle extraction	Built-in	Needs FFmpeg (you already have it)
Chromecast/AirPlay	Manual	Same complexity
Extension direct URLs	Yes	Yes — easier, since you're not tied to WebTorrent
Summary: What You Actually Need to Build
For Torrent Streaming
1. Rust HTTP server (axum + tokio-util) wrapping librqbit::api_stream()
2. Tauri command to start/stop the server per torrent
3. React <video> component pointing to http://localhost:PORT/...
4. CORS + range request handling in Axum (about 100 lines of Rust)
For Extensions / Instant Streaming
1. JSON extension manifest format (no new crates)
2. Extension loader in React that fetches search results via HTTP
3. Player mode switcher: torrent stream vs direct URL
Difficulty Estimate
Component	Lines of Code	Time
Axum stream server	~150 Rust	1-2 days
React video player UI	~300 TSX	2-3 days
Subtitle overlay (VTT)	~100 TSX	1 day
JSON extension system	~200 TS	1-2 days
Total MVP player	 	1-2 weeks
This is much simpler than Shiru's player because librqbit is a proper Rust library (not a JS hack like WebTorrent), and Tauri gives you native Rust access without hidden windows.
