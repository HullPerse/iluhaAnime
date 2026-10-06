//! Host-side session state: identity, plan, chat, roster, and active runtime.

use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet, VecDeque};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

use crate::session::client::ClientSession;
use crate::session::host::HostSession;
use crate::session::playlist::{roster_ready_summary, ReadySummary};
use crate::session::protocol::{
    ChatMessage, MediaIdentity, MediaPlanItem, PeerInfo, PlaybackState, Role, SourceInfo,
    SourceKind, WaitingFor,
};

pub const MAX_CHAT_HISTORY: usize = 500;

/// Rows fall back to metadata.
pub const MAX_CHAT_ATTACHMENTS: usize = 8;

/// Status stays metadata-only.
#[derive(Debug, Clone)]
pub struct StoredAttachment {
    pub message_id: String,
    pub name: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTicket {
    pub session_id: String,
    pub token: String,
    pub endpoint_id: String,
}

pub fn random_hex(byte_len: usize) -> String {
    use iroh::SecretKey;
    let mut buf = Vec::with_capacity(byte_len);
    while buf.len() < byte_len {
        buf.extend_from_slice(SecretKey::generate().public().as_bytes());
    }
    buf.truncate(byte_len);
    hex::encode(buf)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SessionRole {
    Host,
    Guest,
}

pub enum SessionRuntime {
    Host(HostSession),
    Guest(ClientSession),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerReport {
    pub peer_id: String,
    pub media_time: f64,
    pub is_playing: bool,
    pub rate: f64,
    pub buffering: bool,
    pub media_id: String,
    pub ready: bool,
    pub rtt_ms: f64,
    pub drift_ms: f64,
    pub at_ms: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackState {
    pub media_id: String,
    pub audio: Option<String>,
    pub sub: Option<String>,
    pub audio_delay: f64,
    pub sub_delay: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSnapshot {
    pub playback: PlaybackState,
    pub plan: Vec<MediaPlanItem>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PinnedMessage {
    pub message_id: String,
    pub pinned_by: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReactionEntry {
    pub message_id: String,
    pub emoji: String,
    /// Sorted for stable output.
    pub peers: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStatus {
    pub role: Option<SessionRole>,
    pub session_id: Option<String>,
    /// Stable across guest reconnects.
    pub your_peer_id: Option<String>,
    pub ticket: Option<SessionTicket>,
    pub peers: Vec<PeerInfo>,
    pub chat: Vec<ChatMessage>,
    pub plan: Vec<MediaPlanItem>,
    pub ready: ReadySummary,
    /// Guest: `!host_stale` (P8 pause/resume).
    pub host_online: bool,
    /// None when nothing held.
    pub waiting: Option<WaitingFor>,
    pub paths: HashMap<String, String>,
    pub lobby_role: Role,
    pub missing: HashMap<String, Vec<String>>,
    pub pinned: Option<PinnedMessage>,
    pub reactions: Vec<ReactionEntry>,
    pub addrs: Vec<String>,
}

#[derive(Default)]
struct Inner {
    playback: PlaybackState,
    plan: Vec<MediaPlanItem>,
    paths: HashMap<String, String>,
}

#[derive(Clone, Default)]
pub struct SessionHost {
    inner: Arc<Mutex<Inner>>,
    chat: Arc<Mutex<Vec<ChatMessage>>>,
    attachments: Arc<Mutex<VecDeque<StoredAttachment>>>,
    peers: Arc<Mutex<Vec<PeerInfo>>>,
    reports: Arc<Mutex<HashMap<String, PeerReport>>>,
    runtime: Arc<Mutex<Option<SessionRuntime>>>,
    pinned: Arc<Mutex<Option<PinnedMessage>>>,
    reactions: Arc<Mutex<HashMap<String, BTreeMap<String, BTreeSet<String>>>>>,
}

impl SessionHost {
    pub fn snapshot(&self) -> SessionSnapshot {
        let inner = self.inner.lock().expect("session mutex poisoned");
        SessionSnapshot {
            playback: inner.playback.clone(),
            plan: inner.plan.clone(),
        }
    }

    pub fn set_playlist(
        &self,
        items: Vec<MediaPlanItem>,
        paths: HashMap<String, String>,
    ) -> Result<(), String> {
        validate_playlist(&items)?;
        let ids: std::collections::HashSet<&str> =
            items.iter().map(|item| item.item_id.as_str()).collect();
        let paths = paths
            .into_iter()
            .filter(|(id, _)| ids.contains(id.as_str()))
            .collect();
        let mut inner = self.inner.lock().expect("session mutex poisoned");
        inner.plan = items;
        inner.paths = paths;
        Ok(())
    }

    pub fn plan_paths(&self) -> HashMap<String, String> {
        self.inner
            .lock()
            .expect("session mutex poisoned")
            .paths
            .clone()
    }

    pub fn add_source(&self, item_id: &str, source: SourceInfo) -> Result<(), String> {
        validate_source(&source)?;
        let mut inner = self.inner.lock().expect("session mutex poisoned");
        let item = inner
            .plan
            .iter_mut()
            .find(|item| item.item_id == item_id)
            .ok_or_else(|| format!("unknown playlist item: {item_id}"))?;
        if item
            .sources
            .iter()
            .any(|existing| existing.source_id == source.source_id)
        {
            return Err(format!("duplicate source id: {}", source.source_id));
        }
        item.sources.push(source);
        Ok(())
    }

    pub fn remove_source(&self, item_id: &str, source_id: &str) -> Result<(), String> {
        let mut inner = self.inner.lock().expect("session mutex poisoned");
        let item = inner
            .plan
            .iter_mut()
            .find(|item| item.item_id == item_id)
            .ok_or_else(|| format!("unknown playlist item: {item_id}"))?;
        let before = item.sources.len();
        item.sources.retain(|source| source.source_id != source_id);
        if item.sources.len() == before {
            return Err(format!("unknown source: {source_id}"));
        }
        Ok(())
    }

    pub fn set_runtime(&self, runtime: SessionRuntime) {
        let previous = self
            .runtime
            .lock()
            .expect("session runtime poisoned")
            .replace(runtime);
        if let Some(previous) = previous {
            drop_session(previous);
        }
    }

    pub fn take_runtime(&self) -> Option<SessionRuntime> {
        self.runtime
            .lock()
            .expect("session runtime poisoned")
            .take()
    }

    pub fn has_runtime(&self) -> bool {
        self.runtime
            .lock()
            .expect("session runtime poisoned")
            .is_some()
    }

    pub fn host_session(&self) -> Option<HostSession> {
        match self
            .runtime
            .lock()
            .expect("session runtime poisoned")
            .as_ref()
        {
            Some(SessionRuntime::Host(host)) => Some(host.clone()),
            _ => None,
        }
    }

    pub fn client_session(&self) -> Option<ClientSession> {
        match self
            .runtime
            .lock()
            .expect("session runtime poisoned")
            .as_ref()
        {
            Some(SessionRuntime::Guest(client)) => Some(client.clone()),
            _ => None,
        }
    }

    pub fn add_chat(&self, message: ChatMessage) {
        let mut chat = self.chat.lock().expect("session chat poisoned");
        chat.push(message);
        let overflow = chat.len().saturating_sub(MAX_CHAT_HISTORY);
        if overflow > 0 {
            chat.drain(0..overflow);
        }
    }

    pub fn chat_log(&self) -> Vec<ChatMessage> {
        self.chat.lock().expect("session chat poisoned").clone()
    }

    /// Idempotent across host events and guest frames.
    pub fn set_pinned(&self, message_id: Option<String>, pinned_by: String) {
        let pinned = message_id.map(|message_id| PinnedMessage {
            message_id,
            pinned_by,
        });
        *self.pinned.lock().expect("session pinned poisoned") = pinned;
    }

    pub fn pinned(&self) -> Option<PinnedMessage> {
        self.pinned.lock().expect("session pinned poisoned").clone()
    }

    /// Empty sets pruned, replays are no-ops.
    pub fn apply_reaction(&self, message_id: &str, emoji: &str, peer_id: &str, add: bool) {
        let mut reactions = self.reactions.lock().expect("session reactions poisoned");
        if add {
            reactions
                .entry(message_id.to_string())
                .or_default()
                .entry(emoji.to_string())
                .or_default()
                .insert(peer_id.to_string());
            return;
        }
        let Some(kinds) = reactions.get_mut(message_id) else {
            return;
        };
        if let Some(peers) = kinds.get_mut(emoji) {
            peers.remove(peer_id);
            if peers.is_empty() {
                kinds.remove(emoji);
            }
        }
        if kinds.is_empty() {
            reactions.remove(message_id);
        }
    }

    pub fn reactions(&self) -> Vec<ReactionEntry> {
        let reactions = self.reactions.lock().expect("session reactions poisoned");
        let mut entries = Vec::new();
        for (message_id, kinds) in reactions.iter() {
            for (emoji, peers) in kinds.iter() {
                entries.push(ReactionEntry {
                    message_id: message_id.clone(),
                    emoji: emoji.clone(),
                    peers: peers.iter().cloned().collect(),
                });
            }
        }
        entries
    }

    pub fn remember_attachment(&self, message_id: String, name: String, bytes: Vec<u8>) {
        let mut attachments = self
            .attachments
            .lock()
            .expect("session attachments poisoned");
        attachments.retain(|stored| stored.message_id != message_id);
        attachments.push_back(StoredAttachment {
            message_id,
            name,
            bytes,
        });
        while attachments.len() > MAX_CHAT_ATTACHMENTS {
            attachments.pop_front();
        }
    }

    pub fn chat_attachment(&self, message_id: &str) -> Option<(String, Vec<u8>)> {
        self.attachments
            .lock()
            .expect("session attachments poisoned")
            .iter()
            .find(|stored| stored.message_id == message_id)
            .map(|stored| (stored.name.clone(), stored.bytes.clone()))
    }

    pub fn set_peers(&self, peers: Vec<PeerInfo>) {
        *self.peers.lock().expect("session peers poisoned") = peers;
    }

    pub fn peers(&self) -> Vec<PeerInfo> {
        self.peers.lock().expect("session peers poisoned").clone()
    }

    pub fn record_report(&self, report: PeerReport) {
        self.reports
            .lock()
            .expect("session reports poisoned")
            .insert(report.peer_id.clone(), report);
    }

    #[cfg(test)]
    pub fn report(&self, peer_id: &str) -> Option<PeerReport> {
        self.reports
            .lock()
            .expect("session reports poisoned")
            .get(peer_id)
            .cloned()
    }

    pub fn status(&self) -> SessionStatus {
        let state_plan = self.snapshot().plan;
        let (
            role,
            session_id,
            your_peer_id,
            ticket,
            peers,
            plan,
            host_online,
            waiting,
            paths,
            lobby_role,
            missing,
            addrs,
        ) = {
            let guard = self.runtime.lock().expect("session runtime poisoned");
            match guard.as_ref() {
                Some(SessionRuntime::Host(host)) => (
                    Some(SessionRole::Host),
                    Some(host.session_id().to_string()),
                    Some(host.host_peer_id().to_string()),
                    Some(host.ticket()),
                    host.roster(),
                    state_plan,
                    true,
                    host.waiting(),
                    self.plan_paths(),
                    Role::Host,
                    host.missing(),
                    host.bound_sockets(),
                ),
                Some(SessionRuntime::Guest(client)) => (
                    Some(SessionRole::Guest),
                    client.session_id(),
                    client.your_peer_id(),
                    None,
                    client.roster(),
                    client.plan(),
                    !client.host_stale(),
                    client.waiting(),
                    HashMap::new(),
                    client.local_role(),
                    client.missing(),
                    client.remote_addr().into_iter().collect(),
                ),
                None => (
                    None,
                    None,
                    None,
                    None,
                    self.peers(),
                    state_plan,
                    false,
                    None,
                    self.plan_paths(),
                    Role::Viewer,
                    HashMap::new(),
                    Vec::new(),
                ),
            }
        };
        let ready = roster_ready_summary(&plan, &peers);
        SessionStatus {
            role,
            session_id,
            your_peer_id,
            ticket,
            peers,
            chat: self.chat_log(),
            plan,
            ready,
            host_online,
            waiting,
            paths,
            lobby_role,
            missing,
            addrs,
            pinned: self.pinned(),
            reactions: self.reactions(),
        }
    }

    pub fn start_item(&self, item_id: &str) -> Result<crate::session::host::StartOutcome, String> {
        self.host_session()
            .ok_or_else(|| "only the host can start playback".to_string())?
            .start_item(item_id)
    }

    pub fn set_role(
        &self,
        peer_id: &str,
        role: crate::session::protocol::Role,
    ) -> Result<(), String> {
        self.host_session()
            .ok_or_else(|| "only the host can change roles".to_string())?
            .set_role(peer_id, role)
    }
}

fn drop_session(runtime: SessionRuntime) {
    match runtime {
        SessionRuntime::Host(host) => {
            if let Ok(handle) = tokio::runtime::Handle::try_current() {
                handle.spawn(async move { host.stop().await });
            }
        }
        SessionRuntime::Guest(client) => {
            if let Ok(handle) = tokio::runtime::Handle::try_current() {
                handle.spawn(async move { client.leave().await });
            }
        }
    }
}

/// Local paths never fit.
const MAX_MEDIA_ID_BYTES: usize = 128;

/// Bounded, never path-shaped (SECURITY.md).
pub(crate) fn validate_media_id(media_id: &str) -> Result<(), String> {
    if media_id.is_empty() || media_id.len() > MAX_MEDIA_ID_BYTES {
        return Err("media id must be a non-empty plan item id".to_string());
    }
    if media_id.contains(|c: char| matches!(c, '/' | '\\' | '\0')) {
        return Err("media id must not look like a local path".to_string());
    }
    Ok(())
}

fn validate_identity(identity: &MediaIdentity) -> Result<(), String> {
    if identity.sha256.len() != 64 || !identity.sha256.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err("sha256 must be 64 hex chars".to_string());
    }
    if identity.size == 0 {
        return Err("size must be greater than zero".to_string());
    }
    if !identity.duration.is_finite() || identity.duration < 0.0 {
        return Err("duration must be a finite non-negative number".to_string());
    }
    Ok(())
}

fn validate_playlist(items: &[MediaPlanItem]) -> Result<(), String> {
    let mut seen = HashSet::new();
    for item in items {
        if item.item_id.is_empty() {
            return Err("playlist item id must not be empty".to_string());
        }
        validate_media_id(&item.item_id).map_err(|e| format!("item {}: {e}", item.item_id))?;
        if item.title.is_empty() {
            return Err(format!(
                "playlist item {} title must not be empty",
                item.item_id
            ));
        }
        if !seen.insert(item.item_id.as_str()) {
            return Err(format!("duplicate playlist item id: {}", item.item_id));
        }
        validate_identity(&item.identity).map_err(|e| format!("item {}: {e}", item.item_id))?;
    }
    Ok(())
}

fn validate_source(source: &SourceInfo) -> Result<(), String> {
    if source.source_id.is_empty() {
        return Err("source id must not be empty".to_string());
    }
    if matches!(source.kind, SourceKind::File | SourceKind::Folder)
        && source.value.as_deref().unwrap_or("").is_empty()
    {
        return Err("file and folder sources need a value".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::time::Duration;

    use crate::session::client::ClientConfig;
    use crate::session::host::HostConfig;
    use crate::session::transport;

    fn identity() -> MediaIdentity {
        MediaIdentity {
            sha256: "ab".repeat(32),
            size: 100,
            duration: 90.0,
            video: None,
        }
    }

    fn item(id: &str, title: &str) -> MediaPlanItem {
        MediaPlanItem {
            item_id: id.into(),
            order: 0,
            title: title.into(),
            identity: identity(),
            sources: Vec::new(),
        }
    }

    #[test]
    fn default_snapshot_is_empty() {
        let host = SessionHost::default();
        let snapshot = host.snapshot();
        assert!(snapshot.plan.is_empty());
        assert_eq!(snapshot.playback, PlaybackState::default());
        assert!(!host.has_runtime());
        assert!(host.status().role.is_none());
        assert!(!host.status().host_online);
    }

    /// Bounded item id, never path-shaped.
    #[test]
    fn media_id_is_a_bounded_item_id_and_never_a_path() {
        assert!(validate_media_id("0f9c2a4e-8b1d-4c3a-9e7f-112233445566").is_ok());
        assert!(validate_media_id("").is_err());
        assert!(validate_media_id(&"x".repeat(MAX_MEDIA_ID_BYTES + 1)).is_err());
        assert!(validate_media_id("D:/anime/ep1.mkv").is_err());
        assert!(validate_media_id(r"D:\anime\ep1.mkv").is_err());
        assert!(validate_media_id("a\0b").is_err());
    }

    #[test]
    fn set_playlist_rejects_duplicates_and_empty_titles() {
        let host = SessionHost::default();
        host.set_playlist(vec![item("a", "A"), item("b", "B")], HashMap::new())
            .expect("valid playlist");
        assert_eq!(host.snapshot().plan.len(), 2);
        assert!(host
            .set_playlist(vec![item("a", "A"), item("a", "B")], HashMap::new())
            .is_err());
        assert!(host
            .set_playlist(vec![item("a", "")], HashMap::new())
            .is_err());
        // Path-shaped ids never reach the wire.
        let mut path_shaped = item("p", "P");
        path_shaped.item_id = r"D:\anime\ep1.mkv".into();
        assert!(host
            .set_playlist(vec![path_shaped], HashMap::new())
            .is_err());
        assert!(host
            .set_playlist(vec![item("", "A")], HashMap::new())
            .is_err());
    }

    fn source(id: &str, value: &str) -> SourceInfo {
        SourceInfo {
            source_id: id.into(),
            kind: SourceKind::File,
            label: None,
            value: Some(value.into()),
            status: crate::session::protocol::SourceStatus::Ready,
        }
    }

    #[test]
    fn source_edits_are_scoped_to_an_item() {
        let host = SessionHost::default();
        host.set_playlist(vec![item("a", "A"), item("b", "B")], HashMap::new())
            .expect("valid playlist");
        host.add_source("a", source("s1", "C:/a.mkv"))
            .expect("add source");
        assert_eq!(host.snapshot().plan[0].sources.len(), 1);
        assert!(host.add_source("a", source("s1", "C:/a.mkv")).is_err());
        assert!(host
            .add_source("missing", source("s2", "C:/b.mkv"))
            .is_err());
        let mut blank = source("s3", "");
        blank.value = None;
        assert!(host.add_source("b", blank).is_err());

        host.remove_source("a", "s1").expect("remove source");
        assert!(host.snapshot().plan[0].sources.is_empty());
        assert!(host.remove_source("a", "s1").is_err());
        assert!(host.remove_source("missing", "s1").is_err());
    }

    #[test]
    fn set_playlist_prunes_paths_to_the_plan_ids() {
        let host = SessionHost::default();
        let mut paths = HashMap::new();
        paths.insert("a".to_string(), "C:/a.mkv".to_string());
        paths.insert("gone".to_string(), "C:/gone.mkv".to_string());
        host.set_playlist(vec![item("a", "A")], paths)
            .expect("plan");
        let status = host.status();
        assert_eq!(status.paths.get("a").map(String::as_str), Some("C:/a.mkv"));
        assert!(!status.paths.contains_key("gone"));
        assert!(status.waiting.is_none());
    }

    fn peer(id: &str, ready: bool) -> PeerInfo {
        PeerInfo {
            peer_id: id.into(),
            display_name: id.into(),
            avatar_seed: id.into(),
            anilist_user_id: None,
            role: crate::session::protocol::Role::Viewer,
            connection: crate::session::protocol::ConnectionState::Direct,
            ready,
            drift_ms: 0.0,
            rtt_ms: 0.0,
            buffering: false,
            left: false,
            endpoint_id: format!("end-{id}"),
        }
    }

    #[test]
    fn ready_gate_needs_a_plan_and_every_peer() {
        let host = SessionHost::default();
        assert!(!host.status().ready.all_ready);

        host.set_playlist(vec![item("a", "A")], HashMap::new())
            .expect("plan");
        host.set_peers(vec![peer("host", true)]);
        let status = host.status();
        assert!(status.ready.all_ready);
        assert_eq!(status.ready.peers.len(), 1);
        assert_eq!(status.plan.len(), 1);

        host.set_peers(vec![peer("host", true), peer("guest", false)]);
        let status = host.status();
        assert!(!status.ready.all_ready);
        assert_eq!(status.ready.peers.len(), 2);

        host.set_peers(vec![peer("host", true), peer("guest", true)]);
        assert!(host.status().ready.all_ready);
    }

    fn chat(text: &str) -> ChatMessage {
        ChatMessage {
            id: format!("id-{text}"),
            from: "peer".into(),
            text: text.into(),
            at: 0.0,
            links: Vec::new(),
            reply_to: None,
            attachment: None,
        }
    }

    #[test]
    fn chat_log_is_bounded() {
        let host = SessionHost::default();
        for index in 0..MAX_CHAT_HISTORY + 10 {
            host.add_chat(chat(&index.to_string()));
        }
        let log = host.chat_log();
        assert_eq!(log.len(), MAX_CHAT_HISTORY);
        assert_eq!(log[0].text, "10");
    }

    #[test]
    fn attachments_evict_oldest_past_the_cap() {
        let host = SessionHost::default();
        for index in 0..MAX_CHAT_ATTACHMENTS + 3 {
            host.remember_attachment(
                format!("m{index}"),
                format!("{index}.torrent"),
                vec![index as u8],
            );
        }
        assert_eq!(host.chat_attachment("m0"), None);
        assert_eq!(host.chat_attachment("m2"), None);
        let (name, bytes) = host
            .chat_attachment(&format!("m{}", MAX_CHAT_ATTACHMENTS + 2))
            .expect("newest attachment survives");
        assert_eq!(name, format!("{}.torrent", MAX_CHAT_ATTACHMENTS + 2));
        assert_eq!(bytes, vec![(MAX_CHAT_ATTACHMENTS + 2) as u8]);
        // Re-storing replaces instead of duplicating.
        host.remember_attachment("m3".into(), "three.torrent".into(), vec![7]);
        assert_eq!(
            host.chat_attachment("m3"),
            Some(("three.torrent".into(), vec![7]))
        );
    }

    #[test]
    fn reports_are_recorded_by_peer() {
        let host = SessionHost::default();
        let report = PeerReport {
            peer_id: "guest-1".into(),
            media_time: 12.0,
            is_playing: true,
            rate: 1.0,
            buffering: false,
            media_id: "ab".into(),
            ready: true,
            rtt_ms: 24.0,
            drift_ms: 3.0,
            at_ms: 1_000,
        };
        host.record_report(report.clone());
        assert_eq!(host.report("guest-1"), Some(report));
        assert_eq!(host.report("missing"), None);
    }

    async fn offline_host_session() -> HostSession {
        let endpoint = transport::bind_offline_endpoint()
            .await
            .expect("host endpoint");
        HostSession::bind(HostConfig::generate("Host".into()), endpoint)
    }

    #[tokio::test]
    async fn host_runtime_reports_role_ticket_and_roster() {
        let session = offline_host_session().await;
        let session_id = session.session_id().to_string();
        let host_peer_id = session.host_peer_id().to_string();
        let ticket = session.ticket();

        let state = SessionHost::default();
        state.set_runtime(SessionRuntime::Host(session.clone()));

        assert!(state.has_runtime());
        assert!(state.host_session().is_some());
        assert!(state.client_session().is_none());

        let status = state.status();
        assert_eq!(status.role, Some(SessionRole::Host));
        assert_eq!(status.session_id.as_deref(), Some(session_id.as_str()));
        assert_eq!(status.ticket, Some(ticket));
        assert!(status.host_online);
        assert_eq!(status.peers.len(), 1);
        assert_eq!(status.peers[0].peer_id, host_peer_id);

        let replacement = offline_host_session().await;
        let replacement_id = replacement.session_id().to_string();
        state.set_runtime(SessionRuntime::Host(replacement.clone()));
        assert_eq!(
            state.host_session().expect("host").session_id(),
            replacement_id
        );

        let taken = state.take_runtime().expect("runtime");
        assert!(matches!(taken, SessionRuntime::Host(_)));
        assert!(!state.has_runtime());
        assert!(state.host_session().is_none());
        assert!(state.status().role.is_none());
        assert!(!state.status().host_online);

        replacement.stop().await;
        session.stop().await;
    }

    #[tokio::test]
    async fn guest_runtime_reports_joined_role_and_host_online() {
        let result = tokio::time::timeout(Duration::from_secs(20), async {
            let session = offline_host_session().await;
            let endpoint = transport::bind_offline_endpoint()
                .await
                .expect("guest endpoint");
            let client = ClientSession::connect_with(
                ClientConfig {
                    host_addr: transport::loopback_addr(session.endpoint()),
                    token: session.ticket().token,
                    peer_id: "guest-1".into(),
                    display_name: "Guest".into(),
                    anilist_user_id: Some(7),
                    app_version: env!("CARGO_PKG_VERSION").into(),
                },
                endpoint,
            );
            let expected_id = session.session_id().to_string();

            let state = SessionHost::default();
            state.set_runtime(SessionRuntime::Guest(client));

            for _ in 0..200 {
                let ready = state
                    .client_session()
                    .and_then(|client| client.session_id())
                    .is_some();
                if ready {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(25)).await;
            }

            let status = state.status();
            assert_eq!(status.role, Some(SessionRole::Guest));
            assert_eq!(status.session_id.as_deref(), Some(expected_id.as_str()));
            assert!(status.ticket.is_none());
            assert!(status.host_online);
            assert!(status.peers.iter().any(|peer| peer.peer_id == "guest-1"));

            if let Some(SessionRuntime::Guest(client)) = state.take_runtime() {
                client.leave().await;
            }
            session.stop().await;
        })
        .await;
        result.expect("guest runtime test must finish before the timeout");
    }
}
