//! Watch Party wire protocol: u32 LE length + UTF-8 JSON `{"v", "seq", "t", ...}`,
//! capped at `MAX_FRAME_BYTES` (oversize drops the connection with `rateLimited`, lobby.md §3.2).
//! Deviations: `Hello` drops its own `v`; `TimePing`/`TimePong` use `id`, not `seq`.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

/// v4 adds `PeerInfo::endpoint_id` so the room can name a crash successor (lobby.md §14.7).
pub const PROTOCOL_VERSION: u8 = 4;
pub const MAX_FRAME_BYTES: u32 = 256 * 1024;

pub const CHAT_ID_MAX_CHARS: usize = 64;

pub const CHAT_TEXT_MAX_GRAPHEMES: usize = 2000;

/// Raw 180 KiB so base64 (~240 KiB) stays under `MAX_FRAME_BYTES`.
pub const CHAT_ATTACHMENT_MAX_BYTES: usize = 180 * 1024;

pub const CHAT_ATTACHMENT_NAME_MAX_CHARS: usize = 128;

pub const CHAT_RATE_MAX: usize = 5;

pub const CHAT_RATE_WINDOW_SEC: f64 = 5.0;

/// Stop frames (active: false) are never throttled.
pub const TYPING_MIN_INTERVAL_SEC: f64 = 0.25;

/// Past-cap adds are dropped silently; removals always pass.
pub const REACTION_MAX_KINDS: usize = 5;

/// Emoji or :shortcode:; longer tokens are dropped.
pub const REACTION_EMOJI_MAX_CHARS: usize = 32;

/// Accept a fitting .torrent name + byte size; return the cleaned name.
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

/// Non-empty, within `CHAT_ID_MAX_CHARS`, anchor alphabet only.
pub fn valid_chat_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= CHAT_ID_MAX_CHARS
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Malformed ids are replaced with a generated one so anchors never break.
pub fn chat_id_or_generate(id: &str) -> String {
    if valid_chat_id(id) {
        id.to_string()
    } else {
        crate::session::state::random_hex(8)
    }
}

/// CRLF→LF, drop other controls, trim, enforce the grapheme cap; None when empty/over.
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

pub const CHAT_LINKS_MAX: usize = 4;

pub const CHAT_LINK_MAX_CHARS: usize = 64;

/// Exactly https://anilist.co/anime/<digits>, the only share anchor.
fn is_anilist_anime_url(link: &str) -> bool {
    let Some(rest) = link.strip_prefix("https://anilist.co/anime/") else {
        return false;
    };
    !rest.is_empty() && rest.len() <= 10 && rest.bytes().all(|b| b.is_ascii_digit())
}

/// Keep only `AniList` anime anchors (capped, deduped); drop the rest so peers cannot smuggle URLs.
#[must_use]
pub fn sanitize_chat_links(links: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    for link in links {
        if out.len() >= CHAT_LINKS_MAX {
            break;
        }
        let trimmed = link.trim();
        if trimmed.len() > CHAT_LINK_MAX_CHARS || !is_anilist_anime_url(trimmed) {
            continue;
        }
        let owned = trimmed.to_string();
        if !out.contains(&owned) {
            out.push(owned);
        }
    }
    out
}

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum ProtocolError {
    #[error("frame version mismatch: expected {expected}, got {actual}")]
    BadVersion { expected: u8, actual: u8 },
    #[error("frame exceeds the 262144-byte cap")]
    FrameTooLarge,
    #[error("invalid frame JSON: {0}")]
    BadJson(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ErrorCode {
    BadVersion,
    BadToken,
    RoomFull,
    NotReady,
    Kicked,
    RateLimited,
    Internal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Role {
    Host,
    Moderator,
    Viewer,
}

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

/// Used by the compatibility report (lobby.md §14.1).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoInfo {
    pub codec: String,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub bitrate: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaIdentity {
    pub sha256: String,
    pub size: u64,
    pub duration: f64,
    /// Populated on reports only.
    #[serde(default)]
    pub video: Option<VideoInfo>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceInfo {
    pub source_id: String,
    pub kind: SourceKind,
    pub label: Option<String>,
    /// Host-owned value; filled in P5.
    pub value: Option<String>,
    pub status: SourceStatus,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaPlanItem {
    pub item_id: String,
    pub order: u32,
    pub title: String,
    pub identity: MediaIdentity,
    pub sources: Vec<SourceInfo>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemReport {
    pub item_id: String,
    pub present: bool,
    pub verified: bool,
}

/// Empty `peer_ids` = wait over, but the start stays manual.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WaitingFor {
    pub item_id: String,
    pub peer_ids: Vec<String>,
}

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
    /// Past the 30 s grace window; stays listed but leaves the ready gate and missing-file math.
    #[serde(default)]
    pub left: bool,
    /// From the QUIC handshake, never peer-claimed; lets guests dial the elected successor.
    #[serde(default)]
    pub endpoint_id: String,
}

/// Metadata only; bytes travel the wire variants into a bounded side map.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatAttachment {
    pub name: String,
    pub size: usize,
}

/// Base64: a Vec<u8> would serialize as a JSON number array and blow the cap alone.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatUpload {
    pub name: String,
    pub data: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    /// Client-generated, host-validated anchor for reply/pin/react.
    pub id: String,
    pub from: String,
    pub text: String,
    pub at: f64,
    pub links: Vec<String>,
    pub reply_to: Option<String>,
    /// None = text only; missing on pre-attachment peers.
    #[serde(default)]
    pub attachment: Option<ChatAttachment>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackState {
    pub revision: u64,
    pub media_id: String,
    pub position: f64,
    pub is_playing: bool,
    pub rate: f64,
    pub updated_at_mono: f64,
}

/// Shared by Command and `RequestControl`.
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "t", rename_all = "camelCase")]
pub enum ClientMessage {
    #[serde(rename_all = "camelCase")]
    Hello {
        peer_id: String,
        display_name: String,
        token: String,
        anilist_user_id: Option<u64>,
        /// Empty on peers older than this field.
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
    #[serde(rename_all = "camelCase")]
    RequestStart {
        item_id: String,
    },
    RequestTrackSync,
    /// `endpoint_id` is the endpoint everyone must dial next.
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
        /// The host echoes it back untouched.
        id: String,
        text: String,
        /// `AniList` anime URLs; host re-validates and caps.
        #[serde(default)]
        links: Vec<String>,
        reply_to: Option<String>,
        /// Host/moderator only; host strips viewers' uploads.
        #[serde(default)]
        attachment: Option<ChatUpload>,
    },
    #[serde(rename_all = "camelCase")]
    Typing {
        active: bool,
    },
    #[serde(rename_all = "camelCase")]
    Pin {
        message_id: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    React {
        message_id: String,
        emoji: String,
        add: bool,
    },
    Bye,
}

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
    /// Empty `peer_ids` = wait over.
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
        /// `AniList` anime URLs; receivers re-validate before rendering.
        #[serde(default)]
        links: Vec<String>,
        reply_to: Option<String>,
        /// Base64 bytes in a bounded side map; the log carries metadata only.
        #[serde(default)]
        attachment: Option<ChatUpload>,
    },
    #[serde(rename_all = "camelCase")]
    Typing {
        peer_id: String,
        active: bool,
    },
    #[serde(rename_all = "camelCase")]
    Pin {
        message_id: Option<String>,
        pinned_by: String,
    },
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
    /// Same `session_id`/`token`, answer with `HandoverReady`; carries playback so position survives.
    #[serde(rename_all = "camelCase")]
    HostHandover {
        session_id: String,
        token: String,
        playback: Option<PlaybackState>,
    },
    /// Sent before the old host stops; carries the successor's ticket.
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

#[derive(Debug, Clone, PartialEq)]
pub struct DecodedFrame {
    pub version: u8,
    pub seq: u64,
    pub tag: String,
    pub payload: Value,
}

impl DecodedFrame {
    pub fn client(&self) -> Result<ClientMessage, ProtocolError> {
        serde_json::from_value(self.payload.clone())
            .map_err(|e| ProtocolError::BadJson(e.to_string()))
    }

    pub fn server(&self) -> Result<ServerMessage, ProtocolError> {
        serde_json::from_value(self.payload.clone())
            .map_err(|e| ProtocolError::BadJson(e.to_string()))
    }
}

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

#[derive(Debug, Default)]
pub struct FrameDecoder {
    buf: Vec<u8>,
}

impl FrameDecoder {
    pub fn feed(&mut self, bytes: &[u8]) {
        self.buf.extend_from_slice(bytes);
    }

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
                links: vec!["https://anilist.co/anime/21".into()],
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
    fn chat_links_keep_only_anilist_anime_urls() {
        let links = vec![
            "https://anilist.co/anime/21".to_string(),
            " https://anilist.co/anime/999 ".to_string(),
            "https://evil.example/anime/21".to_string(),
            "http://anilist.co/anime/21".to_string(),
            "https://anilist.co/anime/21/episode/1".to_string(),
            "https://anilist.co/anime/notanid".to_string(),
            "https://anilist.co/anime/21".to_string(),
        ];
        assert_eq!(
            sanitize_chat_links(&links),
            vec![
                "https://anilist.co/anime/21".to_string(),
                "https://anilist.co/anime/999".to_string()
            ]
        );
        assert!(sanitize_chat_links(&[]).is_empty());
    }

    #[test]
    fn chat_links_cap_the_list_and_each_item() {
        let many: Vec<String> = (1..=10)
            .map(|id| format!("https://anilist.co/anime/{id}"))
            .collect();
        let capped = sanitize_chat_links(&many);
        assert_eq!(capped.len(), CHAT_LINKS_MAX);
        assert_eq!(capped[0], "https://anilist.co/anime/1");

        let long = format!(
            "https://anilist.co/anime/{}",
            "1".repeat(CHAT_LINK_MAX_CHARS)
        );
        assert!(sanitize_chat_links(&[long]).is_empty());
        assert!(sanitize_chat_links(&["https://anilist.co/anime/".to_string()]).is_empty());
    }

    #[test]
    fn chat_frame_without_links_decodes_with_empty_links() {
        // Older peers never send the field; the frame must still parse.
        let mut value = serde_json::json!({
            "t": "chat",
            "id": "m1",
            "text": "hi",
            "replyTo": null,
            "attachment": null,
        });
        value["v"] = serde_json::Value::from(PROTOCOL_VERSION);
        let payload = serde_json::to_vec(&value).expect("payload must serialize");
        let mut bytes = u32::try_from(payload.len())
            .expect("small")
            .to_le_bytes()
            .to_vec();
        bytes.extend_from_slice(&payload);
        let frames = decode_all(&bytes).expect("frame must decode");
        match frames[0].client().expect("chat") {
            ClientMessage::Chat { links, .. } => assert!(links.is_empty()),
            other => panic!("unexpected: {other:?}"),
        }
    }

    #[test]
    fn server_chat_frame_without_links_decodes_with_empty_links() {
        // Older hosts never send the field; the guest must still parse the line.
        let mut value = serde_json::json!({
            "t": "chat",
            "id": "m1",
            "from": "peer",
            "text": "hi",
            "at": 1.0,
            "replyTo": null,
            "attachment": null,
        });
        value["v"] = serde_json::Value::from(PROTOCOL_VERSION);
        let payload = serde_json::to_vec(&value).expect("payload must serialize");
        let mut bytes = u32::try_from(payload.len())
            .expect("small")
            .to_le_bytes()
            .to_vec();
        bytes.extend_from_slice(&payload);
        let frames = decode_all(&bytes).expect("frame must decode");
        match frames[0].server().expect("chat") {
            ServerMessage::Chat { links, .. } => assert!(links.is_empty()),
            other => panic!("unexpected: {other:?}"),
        }
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
            links: Vec::new(),
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
