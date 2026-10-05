//! Watch Party wire protocol (P1: types + frame codec; P2 adds the transport).
//!
//! Frame layout: u32 little-endian length, followed by a UTF-8 JSON object
//! `{"v": 1, "seq": <u64>, "t": "<type>", ...}`. The JSON payload is hard-capped
//! at [`MAX_FRAME_BYTES`]; a frame that exceeds the cap must fail with
//! [`ProtocolError::FrameTooLarge`] and the connection must be dropped with a
//! `rateLimited` error (lobby.md §3.2).
//!
//! Documented deviations from the lobby.md naming:
//! - `Hello` drops its own `v` (the frame-level `v` is the version).
//! - `TimePing`/`TimePong` use `id` instead of `seq` (seq is a frame-level field).

use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

/// Protocol version carried by every frame.
///
/// v4 adds [`PeerInfo::endpoint_id`]: every peer's dialable endpoint, so the
/// room can name a crash successor without a live channel to the dead host
/// (lobby.md §14.7).
pub const PROTOCOL_VERSION: u8 = 4;
/// Hard cap on the JSON payload of a frame (256 KiB).
pub const MAX_FRAME_BYTES: u32 = 256 * 1024;

/// Ids assigned to chat messages (stable anchors for reply/pin/react).
pub const CHAT_ID_MAX_CHARS: usize = 64;

/// Cap on one chat line, in graphemes (lobby.md §13).
pub const CHAT_TEXT_MAX_GRAPHEMES: usize = 2000;

/// Cap on a `.torrent` attached to a chat line, in raw bytes (lobby.md
/// §14.4). Sized so the base64 frame stays under [`MAX_FRAME_BYTES`]: 180 KiB
/// encodes to ~240 KiB, leaving headroom for the id/text/name JSON around it.
pub const CHAT_ATTACHMENT_MAX_BYTES: usize = 180 * 1024;

/// Cap on an attachment file name, in chars.
pub const CHAT_ATTACHMENT_NAME_MAX_CHARS: usize = 128;

/// How many chat lines one peer may send within [`CHAT_RATE_WINDOW_SEC`].
pub const CHAT_RATE_MAX: usize = 5;

/// Sliding window (seconds) for [`CHAT_RATE_MAX`].
pub const CHAT_RATE_WINDOW_SEC: f64 = 5.0;

/// Minimum spacing (seconds) between two accepted `Typing { active: true }`
/// frames from one peer; stop frames (`active: false`) are never throttled.
pub const TYPING_MIN_INTERVAL_SEC: f64 = 0.25;

/// Validate a `.torrent` attachment: a `.torrent` file name and raw bytes
/// that fit the frame. Returns the cleaned file name.
pub fn sanitize_chat_upload(name: &str, raw_len: usize) -> Option<String> {
    if raw_len == 0 || raw_len > CHAT_ATTACHMENT_MAX_BYTES {
        return None;
    }
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.chars().count() > CHAT_ATTACHMENT_NAME_MAX_CHARS {
        return None;
    }
    if trimmed
        .chars()
        .any(|c| c.is_control() || c == '/' || c == '\\')
    {
        return None;
    }
    if !trimmed.to_lowercase().ends_with(".torrent") {
        return None;
    }
    Some(trimmed.to_string())
}

/// Validate a client-supplied chat message id. An empty or malformed id is
/// replaced with a generated one so a broken peer cannot break anchors.
pub fn chat_id_or_generate(id: &str) -> String {
    let ok = !id.is_empty()
        && id.len() <= CHAT_ID_MAX_CHARS
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if ok {
        id.to_string()
    } else {
        crate::session::state::random_hex(8)
    }
}

/// Normalize one chat line: CRLF → LF, drop other control characters
/// (keeping `\n`), trim, and enforce the grapheme cap. Returns `None` when
/// the result is empty or over the cap.
pub fn sanitize_chat_text(text: &str) -> Option<String> {
    let normalized: String = text
        .replace("\r\n", "\n")
        .chars()
        .filter(|c| *c == '\n' || !c.is_control())
        .collect();
    let trimmed = normalized.trim();
    if trimmed.is_empty() {
        return None;
    }
    if unicode_segmentation::UnicodeSegmentation::graphemes(trimmed, true).count()
        > CHAT_TEXT_MAX_GRAPHEMES
    {
        return None;
    }
    Some(trimmed.to_string())
}

/// Frame encode/decode errors.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum ProtocolError {
    /// The frame carries a different protocol version.
    #[error("frame version mismatch: expected {expected}, got {actual}")]
    BadVersion { expected: u8, actual: u8 },
    /// The declared frame length exceeds [`MAX_FRAME_BYTES`].
    #[error("frame exceeds the 262144-byte cap")]
    FrameTooLarge,
    /// The frame JSON is malformed or the payload does not match its tag.
    #[error("invalid frame JSON: {0}")]
    BadJson(String),
}

/// Error codes carried by `Error` frames.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ErrorCode {
    /// The peer speaks a different protocol version.
    BadVersion,
    /// The room token was wrong.
    BadToken,
    /// The room is at capacity.
    RoomFull,
    /// Not every peer is ready.
    NotReady,
    /// The peer was kicked.
    Kicked,
    /// The peer exceeded a rate limit.
    RateLimited,
    /// An unexpected internal error.
    Internal,
}

/// Lobby role.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Role {
    Host,
    Moderator,
    Viewer,
}

/// Peer connection state / transport hint.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ConnectionState {
    Direct,
    Relay,
    Lan,
    Stale,
    Reconnecting,
    Disconnected,
}

/// How a plan item is sourced.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SourceKind {
    File,
    Folder,
    Magnet,
    Torrent,
    DeepLink,
    HostSeeded,
}

/// Source lifecycle state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SourceStatus {
    Missing,
    Resolving,
    Downloading,
    Verifying,
    Ready,
    Error,
}

/// Video stream parameters used by the compatibility report (lobby.md §14.1).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoInfo {
    pub codec: String,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub bitrate: u64,
}

/// Content identity shared between peers.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaIdentity {
    pub sha256: String,
    pub size: u64,
    /// Duration in seconds.
    pub duration: f64,
    /// Video parameters when the file has a video stream (report only).
    #[serde(default)]
    pub video: Option<VideoInfo>,
}

/// A source for a plan item.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceInfo {
    pub source_id: String,
    pub kind: SourceKind,
    pub label: Option<String>,
    /// Host-owned value (path / magnet / torrent data); filled in P5.
    pub value: Option<String>,
    pub status: SourceStatus,
}

/// One entry of the host-owned media plan.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaPlanItem {
    pub item_id: String,
    pub order: u32,
    pub title: String,
    pub identity: MediaIdentity,
    pub sources: Vec<SourceInfo>,
}

/// Per-item readiness report carried in `StateReport`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemReport {
    pub item_id: String,
    pub present: bool,
    pub verified: bool,
}

/// The item the room is holding a start on, plus who is missing it.
///
/// An empty `peer_ids` means the wait is over (everyone now has the item), but
/// the start is still manual: the host/moderator must press start again.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WaitingFor {
    pub item_id: String,
    pub peer_ids: Vec<String>,
}

/// Roster entry.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerInfo {
    pub peer_id: String,
    pub display_name: String,
    pub avatar_seed: String,
    pub anilist_user_id: Option<u64>,
    pub role: Role,
    pub connection: ConnectionState,
    pub ready: bool,
    pub drift_ms: f64,
    pub rtt_ms: f64,
    pub buffering: bool,
    /// The host marked this peer as gone past the 30 s grace window. A left
    /// peer stays in the roster (badge + resume context) and is excluded from
    /// the ready gate and the missing-file computation until it reconnects.
    #[serde(default)]
    pub left: bool,
    /// This peer's dialable endpoint id, read from the QUIC handshake on the
    /// host (never trusted from the peer's own claim). Guests keep it so that
    /// if the host dies, the elected successor can be dialed straight from the
    /// replicated roster without a channel to the dead host.
    #[serde(default)]
    pub endpoint_id: String,
}

/// A `.torrent` attached to a chat line: metadata only. The bytes travel on
/// the wire variants and land in a bounded side map, never in the polled log.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatAttachment {
    pub name: String,
    pub size: usize,
}

/// Attachment bytes on the wire, base64: a `Vec<u8>` would serialize as a
/// JSON number array and blow the frame cap on its own.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatUpload {
    pub name: String,
    pub data: String,
}

/// Chat message stored in session state.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    /// Stable message id (client-generated, host-validated): the anchor for
    /// replies, pins, and reactions.
    pub id: String,
    pub from: String,
    pub text: String,
    /// Wall-clock seconds.
    pub at: f64,
    pub links: Vec<String>,
    /// Id of the message this one replies to.
    pub reply_to: Option<String>,
    /// Attached `.torrent` metadata (`None` = text only). Missing on frames
    /// from older peers, which never send attachments.
    #[serde(default)]
    pub attachment: Option<ChatAttachment>,
}

/// The authoritative playback snapshot broadcast by the host.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackState {
    pub revision: u64,
    pub media_id: String,
    pub position: f64,
    pub is_playing: bool,
    pub rate: f64,
    /// Monotonic milliseconds on the host clock.
    pub updated_at_mono: f64,
}

/// Shared shape of control actions, used by `Command` and `RequestControl`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "a", rename_all = "camelCase")]
pub enum ControlAction {
    Play,
    Pause,
    Seek {
        position: f64,
    },
    SetRate {
        rate: f64,
    },
    Load {
        #[serde(rename = "mediaId")]
        media_id: String,
    },
}

/// Guest → host messages (lobby.md §3.2).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "t", rename_all = "camelCase")]
pub enum ClientMessage {
    #[serde(rename_all = "camelCase")]
    Hello {
        peer_id: String,
        display_name: String,
        token: String,
        anilist_user_id: Option<u64>,
        /// Sender's app version; empty from peers older than this field.
        #[serde(default)]
        app_version: String,
    },
    #[serde(rename_all = "camelCase")]
    TimePing {
        id: u64,
        t1: f64,
    },
    #[serde(rename_all = "camelCase")]
    StateReport {
        media_time: f64,
        is_playing: bool,
        rate: f64,
        buffering: bool,
        media_id: String,
        ready: bool,
        items: Vec<ItemReport>,
    },
    #[serde(rename_all = "camelCase")]
    RequestControl {
        action: ControlAction,
    },
    /// A host or moderator asks the host to start a plan item.
    #[serde(rename_all = "camelCase")]
    RequestStart {
        item_id: String,
    },
    RequestTrackSync,
    /// The successor of a host handover confirms its new host session is
    /// listening; `endpoint_id` is the endpoint everyone must dial next.
    #[serde(rename_all = "camelCase")]
    HandoverReady {
        endpoint_id: String,
    },
    #[serde(rename_all = "camelCase")]
    TrackPick {
        audio: Option<String>,
        sub: Option<String>,
        audio_delay: f64,
        sub_delay: f64,
    },
    #[serde(rename_all = "camelCase")]
    Chat {
        /// Client-generated message id; the host echoes it back untouched.
        id: String,
        text: String,
        reply_to: Option<String>,
        /// Attached `.torrent` (host/moderator only); missing on lines from
        /// older peers. The host validates and strips viewers' uploads.
        #[serde(default)]
        attachment: Option<ChatUpload>,
    },
    /// The peer started/stopped typing (throttled client-side).
    #[serde(rename_all = "camelCase")]
    Typing {
        active: bool,
    },
    /// Pin (`Some`) or unpin (`None`) a message; host/moderator only.
    #[serde(rename_all = "camelCase")]
    Pin {
        message_id: Option<String>,
    },
    /// Add (`add: true`) or remove (`add: false`) a reaction on a message.
    #[serde(rename_all = "camelCase")]
    React {
        message_id: String,
        emoji: String,
        add: bool,
    },
    Bye,
}

/// Host → guest messages (lobby.md §3.2).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "t", rename_all = "camelCase")]
pub enum ServerMessage {
    #[serde(rename_all = "camelCase")]
    Welcome {
        protocol: u8,
        session_id: String,
        host_id: String,
        your_peer_id: String,
        roster: Vec<PeerInfo>,
        media_plan: Vec<MediaPlanItem>,
    },
    #[serde(rename_all = "camelCase")]
    Roster {
        peers: Vec<PeerInfo>,
    },
    #[serde(rename_all = "camelCase")]
    MediaPlan {
        items: Vec<MediaPlanItem>,
    },
    #[serde(rename_all = "camelCase")]
    PlaybackState {
        revision: u64,
        media_id: String,
        position: f64,
        is_playing: bool,
        rate: f64,
        updated_at_mono: f64,
    },
    #[serde(rename_all = "camelCase")]
    Command {
        revision: u64,
        action: ControlAction,
    },
    #[serde(rename_all = "camelCase")]
    TimePong {
        id: u64,
        t1: f64,
        t2: f64,
    },
    #[serde(rename_all = "camelCase")]
    TrackSync {
        media_id: String,
        audio: Option<String>,
        sub: Option<String>,
        audio_delay: f64,
        sub_delay: f64,
    },
    #[serde(rename_all = "camelCase")]
    SourceUpdate {
        item_id: String,
        source_id: String,
        kind: SourceKind,
        value: Option<String>,
        status: SourceStatus,
    },
    #[serde(rename_all = "camelCase")]
    ReadyState {
        peer_id: String,
        ready: bool,
        items: Vec<ItemReport>,
    },
    /// The room is holding a start until the listed peers obtain `item_id`.
    /// An empty `peer_ids` means the wait is over.
    #[serde(rename_all = "camelCase")]
    WaitingFor {
        item_id: String,
        peer_ids: Vec<String>,
    },
    #[serde(rename_all = "camelCase")]
    Chat {
        id: String,
        from: String,
        text: String,
        at: f64,
        links: Vec<String>,
        reply_to: Option<String>,
        /// Attached `.torrent` bytes (base64); missing on text-only lines and
        /// on frames from older hosts. Receivers keep the bytes in a bounded
        /// side map; the polled log carries metadata only.
        #[serde(default)]
        attachment: Option<ChatUpload>,
    },
    /// Broadcast typing state for one peer.
    #[serde(rename_all = "camelCase")]
    Typing {
        peer_id: String,
        active: bool,
    },
    /// The room's single pinned message changed (`None` = no pin).
    #[serde(rename_all = "camelCase")]
    Pin {
        message_id: Option<String>,
        pinned_by: String,
    },
    /// A reaction was added or removed by `peer_id`.
    #[serde(rename_all = "camelCase")]
    React {
        message_id: String,
        emoji: String,
        peer_id: String,
        add: bool,
    },
    #[serde(rename_all = "camelCase")]
    Kick {
        reason: String,
    },
    /// The host hands the room over to the recipient: it must start hosting on
    /// the same `session_id`/`token` and answer with `HandoverReady`. Carries
    /// the current playback so position/pause survive the move.
    #[serde(rename_all = "camelCase")]
    HostHandover {
        session_id: String,
        token: String,
        playback: Option<PlaybackState>,
    },
    /// The room moved; every guest must reconnect to `endpoint_id`. Sent right
    /// before the old host stops, carrying the successor's ticket.
    #[serde(rename_all = "camelCase")]
    Migrate {
        session_id: String,
        token: String,
        endpoint_id: String,
        host_id: String,
    },
    #[serde(rename_all = "camelCase")]
    Error {
        code: ErrorCode,
        message: String,
    },
    Bye,
}

/// A decoded frame: header fields plus the JSON payload.
#[derive(Debug, Clone, PartialEq)]
pub struct DecodedFrame {
    /// The frame-level protocol version.
    pub version: u8,
    /// The frame-level sequence number.
    pub seq: u64,
    /// The message tag (the `t` field).
    pub tag: String,
    /// The full JSON payload.
    pub payload: Value,
}

impl DecodedFrame {
    /// Deserialize the payload as a guest → host message.
    pub fn client(&self) -> Result<ClientMessage, ProtocolError> {
        serde_json::from_value(self.payload.clone())
            .map_err(|e| ProtocolError::BadJson(e.to_string()))
    }

    /// Deserialize the payload as a host → guest message.
    pub fn server(&self) -> Result<ServerMessage, ProtocolError> {
        serde_json::from_value(self.payload.clone())
            .map_err(|e| ProtocolError::BadJson(e.to_string()))
    }
}

/// Serialize a message into a length-prefixed frame.
pub fn encode_frame<T: Serialize>(msg: &T, seq: u64) -> Vec<u8> {
    let mut value = serde_json::to_value(msg).expect("session message must serialize to an object");
    if let Some(object) = value.as_object_mut() {
        object.insert("v".to_string(), Value::from(PROTOCOL_VERSION));
        object.insert("seq".to_string(), Value::from(seq));
    }
    let body = serde_json::to_vec(&value).expect("session JSON must serialize");
    let mut out = Vec::with_capacity(4 + body.len());
    out.extend_from_slice(&(body.len() as u32).to_le_bytes());
    out.extend_from_slice(&body);
    out
}

fn parse_payload(payload: &[u8], expected_version: u8) -> Result<DecodedFrame, ProtocolError> {
    let value: Value =
        serde_json::from_slice(payload).map_err(|e| ProtocolError::BadJson(e.to_string()))?;
    let object = value
        .as_object()
        .ok_or_else(|| ProtocolError::BadJson(String::from("frame is not a JSON object")))?;
    let version = object
        .get("v")
        .and_then(Value::as_u64)
        .and_then(|v| u8::try_from(v).ok())
        .ok_or_else(|| ProtocolError::BadJson(String::from("frame has no valid v")))?;
    if version != expected_version {
        return Err(ProtocolError::BadVersion {
            expected: expected_version,
            actual: version,
        });
    }
    let seq = object.get("seq").and_then(Value::as_u64).unwrap_or(0);
    let tag = object
        .get("t")
        .and_then(Value::as_str)
        .ok_or_else(|| ProtocolError::BadJson(String::from("frame has no t tag")))?
        .to_string();
    Ok(DecodedFrame {
        version,
        seq,
        tag,
        payload: value,
    })
}

/// Incremental frame decoder: feed bytes in, pull complete frames out.
#[derive(Debug, Default)]
pub struct FrameDecoder {
    buf: Vec<u8>,
}

impl FrameDecoder {
    /// Append newly received bytes to the internal buffer.
    pub fn feed(&mut self, bytes: &[u8]) {
        self.buf.extend_from_slice(bytes);
    }

    /// Pull the next complete frame, or `Ok(None)` when more bytes are needed.
    pub fn next(&mut self, expected_version: u8) -> Result<Option<DecodedFrame>, ProtocolError> {
        if self.buf.len() < 4 {
            return Ok(None);
        }
        let mut len_bytes = [0u8; 4];
        len_bytes.copy_from_slice(&self.buf[..4]);
        let payload_len = u32::from_le_bytes(len_bytes);
        if payload_len > MAX_FRAME_BYTES {
            return Err(ProtocolError::FrameTooLarge);
        }
        let total = 4 + payload_len as usize;
        if self.buf.len() < total {
            return Ok(None);
        }
        let payload = self.buf[4..total].to_vec();
        self.buf.drain(..total);
        parse_payload(&payload, expected_version).map(Some)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn client_samples() -> Vec<ClientMessage> {
        vec![
            ClientMessage::Hello {
                peer_id: "p1".into(),
                display_name: "Alice".into(),
                token: "tok".into(),
                anilist_user_id: Some(42),
                app_version: env!("CARGO_PKG_VERSION").into(),
            },
            ClientMessage::TimePing { id: 7, t1: 1.5 },
            ClientMessage::StateReport {
                media_time: 10.0,
                is_playing: true,
                rate: 1.0,
                buffering: false,
                media_id: "m1".into(),
                ready: true,
                items: vec![ItemReport {
                    item_id: "i1".into(),
                    present: true,
                    verified: true,
                }],
            },
            ClientMessage::RequestControl {
                action: ControlAction::Seek { position: 5.0 },
            },
            ClientMessage::RequestStart {
                item_id: "i1".into(),
            },
            ClientMessage::RequestTrackSync,
            ClientMessage::HandoverReady {
                endpoint_id: "end".into(),
            },
            ClientMessage::TrackPick {
                audio: Some("ja".into()),
                sub: None,
                audio_delay: 0.1,
                sub_delay: 0.0,
            },
            ClientMessage::Chat {
                id: "m1".into(),
                text: "hi".into(),
                reply_to: Some("m0".into()),
                attachment: None,
            },
            ClientMessage::Typing { active: true },
            ClientMessage::Pin {
                message_id: Some("m1".into()),
            },
            ClientMessage::React {
                message_id: "m1".into(),
                emoji: "🔥".into(),
                add: true,
            },
            ClientMessage::Bye,
        ]
    }

    fn server_samples() -> Vec<ServerMessage> {
        vec![
            ServerMessage::Welcome {
                protocol: PROTOCOL_VERSION,
                session_id: "s".into(),
                host_id: "h".into(),
                your_peer_id: "g".into(),
                roster: vec![],
                media_plan: vec![],
            },
            ServerMessage::Roster { peers: vec![] },
            ServerMessage::MediaPlan { items: vec![] },
            ServerMessage::PlaybackState {
                revision: 3,
                media_id: "m".into(),
                position: 1.0,
                is_playing: true,
                rate: 2.0,
                updated_at_mono: 4.0,
            },
            ServerMessage::Command {
                revision: 5,
                action: ControlAction::Pause,
            },
            ServerMessage::TimePong {
                id: 1,
                t1: 0.0,
                t2: 10.0,
            },
            ServerMessage::TrackSync {
                media_id: "m".into(),
                audio: None,
                sub: Some("ru".into()),
                audio_delay: 0.0,
                sub_delay: 0.2,
            },
            ServerMessage::SourceUpdate {
                item_id: "i".into(),
                source_id: "s".into(),
                kind: SourceKind::Magnet,
                value: None,
                status: SourceStatus::Downloading,
            },
            ServerMessage::ReadyState {
                peer_id: "g".into(),
                ready: true,
                items: vec![],
            },
            ServerMessage::WaitingFor {
                item_id: "i".into(),
                peer_ids: vec!["g".into()],
            },
            ServerMessage::Chat {
                id: "m1".into(),
                from: "h".into(),
                text: "yo".into(),
                at: 1.0,
                links: vec![],
                reply_to: None,
                attachment: None,
            },
            ServerMessage::Typing {
                peer_id: "g".into(),
                active: false,
            },
            ServerMessage::Pin {
                message_id: Some("m1".into()),
                pinned_by: "h".into(),
            },
            ServerMessage::React {
                message_id: "m1".into(),
                emoji: "🔥".into(),
                peer_id: "g".into(),
                add: true,
            },
            ServerMessage::Kick {
                reason: "spam".into(),
            },
            ServerMessage::HostHandover {
                session_id: "s".into(),
                token: "tok".into(),
                playback: None,
            },
            ServerMessage::Migrate {
                session_id: "s".into(),
                token: "tok".into(),
                endpoint_id: "end".into(),
                host_id: "h2".into(),
            },
            ServerMessage::Error {
                code: ErrorCode::BadToken,
                message: "nope".into(),
            },
            ServerMessage::Bye,
        ]
    }

    fn decode_all(bytes: &[u8]) -> Result<Vec<DecodedFrame>, ProtocolError> {
        let mut decoder = FrameDecoder::default();
        decoder.feed(bytes);
        let mut out = Vec::new();
        while let Some(frame) = decoder.next(PROTOCOL_VERSION)? {
            out.push(frame);
        }
        Ok(out)
    }

    #[test]
    fn client_messages_round_trip() {
        let messages = client_samples();
        let bytes: Vec<u8> = messages
            .iter()
            .enumerate()
            .flat_map(|(index, message)| encode_frame(message, index as u64))
            .collect();
        let frames = decode_all(&bytes).expect("frames must decode");
        assert_eq!(frames.len(), messages.len());
        for (frame, expected) in frames.iter().zip(messages.iter()) {
            assert_eq!(
                &frame.client().expect("client message must parse"),
                expected
            );
        }
        assert_eq!(frames[0].seq, 0);
        assert_eq!(frames[1].tag, "timePing");
    }

    #[test]
    fn server_messages_round_trip() {
        let messages = server_samples();
        let bytes: Vec<u8> = messages
            .iter()
            .enumerate()
            .flat_map(|(index, message)| encode_frame(message, index as u64))
            .collect();
        let frames = decode_all(&bytes).expect("frames must decode");
        assert_eq!(frames.len(), messages.len());
        for (frame, expected) in frames.iter().zip(messages.iter()) {
            assert_eq!(
                &frame.server().expect("server message must parse"),
                expected
            );
        }
    }

    #[test]
    fn multiple_frames_in_one_chunk() {
        let mut combined = encode_frame(&ClientMessage::Bye, 1);
        let second = encode_frame(&ClientMessage::Bye, 2);
        combined.extend_from_slice(&second);
        let frames = decode_all(&combined).expect("both frames must decode");
        assert_eq!(frames.len(), 2);
        assert_eq!(frames[0].seq, 1);
        assert_eq!(frames[1].seq, 2);
    }

    #[test]
    fn partial_frames_wait_for_more_bytes() {
        let bytes = encode_frame(&ClientMessage::Bye, 9);
        let mut decoder = FrameDecoder::default();
        decoder.feed(&bytes[..3]);
        assert!(decoder.next(PROTOCOL_VERSION).expect("must wait").is_none());
        decoder.feed(&bytes[3..]);
        let frame = decoder
            .next(PROTOCOL_VERSION)
            .expect("must decode")
            .expect("frame expected");
        assert_eq!(frame.seq, 9);
    }

    #[test]
    fn frame_with_wrong_version_is_rejected() {
        let mut value = serde_json::to_value(ClientMessage::Bye).expect("must serialize");
        value["v"] = Value::from(PROTOCOL_VERSION + 1);
        value["seq"] = Value::from(0u64);
        let body = serde_json::to_vec(&value).expect("must serialize");
        let mut bytes = (body.len() as u32).to_le_bytes().to_vec();
        bytes.extend_from_slice(&body);
        match decode_all(&bytes) {
            Err(ProtocolError::BadVersion { expected, actual }) => {
                assert_eq!((expected, actual), (PROTOCOL_VERSION, PROTOCOL_VERSION + 1));
            }
            other => panic!("expected BadVersion, got {other:?}"),
        }
    }

    #[test]
    fn over_cap_frame_is_rejected() {
        let mut bytes = (MAX_FRAME_BYTES + 1).to_le_bytes().to_vec();
        bytes.extend_from_slice(b"{}");
        match decode_all(&bytes) {
            Err(ProtocolError::FrameTooLarge) => {}
            other => panic!("expected FrameTooLarge, got {other:?}"),
        }
    }

    #[test]
    fn malformed_payload_is_rejected() {
        let body = b"{not json";
        let mut bytes = (body.len() as u32).to_le_bytes().to_vec();
        bytes.extend_from_slice(body);
        match decode_all(&bytes) {
            Err(ProtocolError::BadJson(_)) => {}
            other => panic!("expected BadJson, got {other:?}"),
        }
    }

    #[test]
    fn frame_without_v_is_rejected() {
        let body =
            serde_json::to_vec(&serde_json::json!({"seq": 0, "t": "bye"})).expect("must serialize");
        let mut bytes = (body.len() as u32).to_le_bytes().to_vec();
        bytes.extend_from_slice(&body);
        match decode_all(&bytes) {
            Err(ProtocolError::BadJson(_)) => {}
            other => panic!("expected BadJson, got {other:?}"),
        }
    }

    #[test]
    fn server_tag_does_not_decode_as_client() {
        let bytes = encode_frame(&ServerMessage::Kick { reason: "x".into() }, 0);
        let frames = decode_all(&bytes).expect("frame must decode");
        assert_eq!(frames.len(), 1);
        assert!(frames[0].client().is_err());
        assert!(frames[0].server().is_ok());
    }

    #[test]
    fn wire_names_are_camel_case() {
        let bytes = encode_frame(
            &ClientMessage::Hello {
                peer_id: "p1".into(),
                display_name: "A".into(),
                token: "t".into(),
                anilist_user_id: Some(1),
                app_version: "4.1.3".into(),
            },
            0,
        );
        let raw = String::from_utf8(bytes[4..].to_vec()).expect("utf8");
        assert!(raw.contains("\"t\":\"hello\""), "tag must be camel: {raw}");
        assert!(
            raw.contains("\"peerId\":\"p1\""),
            "field must be camel: {raw}"
        );
        assert!(
            raw.contains("\"anilistUserId\":1"),
            "field must be camel: {raw}"
        );
        assert!(
            raw.contains(&format!("\"v\":{PROTOCOL_VERSION}")),
            "version must be present: {raw}"
        );
    }

    #[test]
    fn sanitize_chat_text_strips_controls_and_crlf() {
        assert_eq!(
            sanitize_chat_text("  a\u{0000}b\r\nc  ").as_deref(),
            Some("ab\nc")
        );
        assert_eq!(sanitize_chat_text("   \n  "), None);
        assert_eq!(sanitize_chat_text("\u{0007}"), None);
    }

    #[test]
    fn sanitize_chat_text_caps_graphemes_not_code_points() {
        let emoji = "\u{1F1EF}\u{1F1F5}"; // 🇯🇵 flag = 2 code points, 1 grapheme
        let under: String = emoji.repeat(CHAT_TEXT_MAX_GRAPHEMES);
        assert!(sanitize_chat_text(&under).is_some());
        let over: String = emoji.repeat(CHAT_TEXT_MAX_GRAPHEMES + 1);
        assert!(sanitize_chat_text(&over).is_none());
    }

    #[test]
    fn chat_ids_are_validated_or_replaced() {
        assert_eq!(chat_id_or_generate("aBc-123_x"), "aBc-123_x");
        assert_eq!(
            chat_id_or_generate(&"x".repeat(CHAT_ID_MAX_CHARS + 1)).len(),
            16
        );
        let generated = chat_id_or_generate("bad id!");
        assert_eq!(generated.len(), 16);
        assert!(generated.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn chat_uploads_accept_a_sized_torrent_name() {
        assert_eq!(
            sanitize_chat_upload(" Show.torrent ", 1024).as_deref(),
            Some("Show.torrent")
        );
        assert_eq!(
            sanitize_chat_upload("SHOW.TORRENT", 1).as_deref(),
            Some("SHOW.TORRENT")
        );
        assert_eq!(
            sanitize_chat_upload("ok.torrent", CHAT_ATTACHMENT_MAX_BYTES).as_deref(),
            Some("ok.torrent")
        );
    }

    #[test]
    fn chat_uploads_reject_wrong_names_and_sizes() {
        assert_eq!(sanitize_chat_upload("ok.torrent", 0), None);
        assert_eq!(
            sanitize_chat_upload("ok.torrent", CHAT_ATTACHMENT_MAX_BYTES + 1),
            None
        );
        assert_eq!(sanitize_chat_upload("clip.mkv", 1024), None);
        assert_eq!(sanitize_chat_upload("", 1024), None);
        assert_eq!(sanitize_chat_upload("../evil.torrent", 1024), None);
        assert_eq!(sanitize_chat_upload("a/b.torrent", 1024), None);
        assert_eq!(sanitize_chat_upload("bad\0.torrent", 1024), None);
        assert_eq!(
            sanitize_chat_upload(
                &format!("{}.torrent", "n".repeat(CHAT_ATTACHMENT_NAME_MAX_CHARS)),
                1024
            ),
            None
        );
    }

    #[test]
    fn largest_chat_upload_still_fits_the_frame() {
        // Worst case on the wire: max text, id, and name around max bytes.
        let text = "é".repeat(CHAT_TEXT_MAX_GRAPHEMES);
        let data = "A".repeat(CHAT_ATTACHMENT_MAX_BYTES.div_ceil(3) * 4);
        let message = ClientMessage::Chat {
            id: "i".repeat(CHAT_ID_MAX_CHARS),
            text,
            reply_to: None,
            attachment: Some(ChatUpload {
                name: format!("{}.torrent", "n".repeat(120)),
                data,
            }),
        };
        let frame = encode_frame(&message, 1);
        assert!(
            frame.len() - 4 <= MAX_FRAME_BYTES as usize,
            "frame is {} bytes over the cap",
            frame.len().saturating_sub(4 + MAX_FRAME_BYTES as usize)
        );
        let frames = decode_all(&frame).expect("fits, so it decodes");
        assert!(matches!(
            frames[0].client().expect("chat"),
            ClientMessage::Chat { .. }
        ));
    }
}
