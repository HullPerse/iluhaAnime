//! Watch Party host runtime over iroh: owns the room (token, roles, 6 s stale / 30 s drop liveness) and fans out `ServerMessage`s.

use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet, VecDeque};
use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use iroh::endpoint::{Connection, Incoming};
use iroh::Endpoint;
use serde::Serialize;
use tokio::sync::{broadcast, mpsc, oneshot, Notify};
use tokio::task::JoinHandle;

#[cfg(test)]
use crate::session::playlist::ReadySummary;
use crate::session::playlist::{peer_is_ready, PeerReport};
use crate::session::protocol::{
    chat_id_or_generate, sanitize_chat_links, sanitize_chat_text, sanitize_chat_upload,
    valid_chat_id, ChatAttachment, ChatMessage, ChatUpload, ClientMessage, ConnectionState,
    ControlAction, ErrorCode, ItemReport, MediaPlanItem, PeerInfo, PlaybackState, ProtocolError,
    Role, ServerMessage, WaitingFor, CHAT_ID_MAX_CHARS, CHAT_RATE_MAX, CHAT_RATE_WINDOW_SEC,
    PROTOCOL_VERSION, REACTION_EMOJI_MAX_CHARS, REACTION_MAX_KINDS, TYPING_MIN_INTERVAL_SEC,
};
use crate::session::state::{random_hex, SessionTicket, TrackState};
use crate::session::transport::{
    self, now_ms, FrameSender, LIVENESS_GRACE_MS, LIVENESS_TIMEOUT_MS,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};

pub const DEFAULT_MAX_PEERS: usize = 8;
const LIVENESS_TICK_MS: u64 = 500;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostConfig {
    pub session_id: String,
    pub token: String,
    pub host_peer_id: String,
    pub display_name: String,
    pub max_peers: usize,
}

impl HostConfig {
    pub fn generate(display_name: String) -> Self {
        Self {
            session_id: random_hex(8),
            token: random_hex(16),
            host_peer_id: random_hex(8),
            display_name,
            max_peers: DEFAULT_MAX_PEERS,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum HostEvent {
    Roster {
        peers: Vec<PeerInfo>,
    },
    Chat {
        message: ChatMessage,
        /// Base64 bytes live in the bounded side map; the message carries metadata only.
        attachment: Option<ChatUpload>,
    },
    PeerJoined {
        peer_id: String,
        display_name: String,
    },
    PeerLeft {
        peer_id: String,
    },
    /// The host applies it locally too.
    Control {
        revision: u64,
        action: ControlAction,
    },
    Track {
        track: TrackState,
    },
    /// The frontend opens path in the player.
    StartItem {
        item_id: String,
        path: Option<String>,
    },
    /// Empty `peer_ids` clears the wait.
    Waiting {
        item_id: String,
        peer_ids: Vec<String>,
    },
    Pin {
        message_id: Option<String>,
        pinned_by: String,
    },
    React {
        message_id: String,
        emoji: String,
        peer_id: String,
        add: bool,
    },
    Typing {
        peer_id: String,
        active: bool,
    },
}

struct PeerEntry {
    peer_id: String,
    display_name: String,
    anilist_user_id: Option<u64>,
    role: Role,
    ready: bool,
    stale: bool,
    /// Past the 30 s grace window; stays listed but leaves the ready gate and missing-file math. Cleared on next Hello.
    left: bool,
    /// From the QUIC handshake; lets guests reach the elected successor.
    endpoint_id: String,
    last_seen_ms: Arc<AtomicU64>,
    outbound: mpsc::UnboundedSender<ServerMessage>,
}

struct HostInner {
    endpoint: Endpoint,
    config: HostConfig,
    peers: Mutex<HashMap<String, PeerEntry>>,
    events: broadcast::Sender<HostEvent>,
    revision: AtomicU64,
    playback: Mutex<Option<PlaybackState>>,
    track: Mutex<Option<TrackState>>,
    plan: Mutex<Vec<MediaPlanItem>>,
    reports: Mutex<HashMap<String, PeerReport>>,
    /// Never sent to guests.
    paths: Mutex<HashMap<String, String>>,
    waiting: Mutex<Option<WaitingFor>>,
    /// Who was asked plus the channel resolving on `HandoverReady`.
    handover: Mutex<Option<HandoverWaiter>>,
    /// Roles/ready re-applied as stable-id peers reconnect, so the roster survives migration.
    carried: Mutex<Vec<PeerInfo>>,
    chat_stamps: Mutex<HashMap<String, VecDeque<f64>>>,
    /// Per peer; keeps Typing floods off room UIs.
    typing_stamps: Mutex<HashMap<String, f64>>,
    pinned: Mutex<Option<PinEntry>>,
    /// `BTree` ordering keeps join replay and tests deterministic.
    reactions: Mutex<HashMap<String, BTreeMap<String, BTreeSet<String>>>>,
    shutdown: AtomicBool,
    shutdown_notify: Notify,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PinEntry {
    message_id: String,
    pinned_by: String,
}

struct HandoverWaiter {
    peer_id: String,
    tx: oneshot::Sender<Result<Handover, String>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Handover {
    pub host_id: String,
    /// The ticket guests must dial.
    pub endpoint_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum StartOutcome {
    Started {
        item_id: String,
        path: Option<String>,
    },
    Waiting {
        item_id: String,
        peer_ids: Vec<String>,
    },
}

impl HostInner {
    fn peer_info(entry: &PeerEntry) -> PeerInfo {
        PeerInfo {
            peer_id: entry.peer_id.clone(),
            display_name: entry.display_name.clone(),
            avatar_seed: entry.peer_id.clone(),
            anilist_user_id: entry.anilist_user_id,
            role: entry.role,
            connection: if entry.left {
                ConnectionState::Disconnected
            } else if entry.stale {
                ConnectionState::Stale
            } else {
                ConnectionState::Direct
            },
            ready: entry.ready,
            drift_ms: 0.0,
            rtt_ms: 0.0,
            buffering: false,
            left: entry.left,
            endpoint_id: entry.endpoint_id.clone(),
        }
    }

    fn host_info(&self) -> PeerInfo {
        PeerInfo {
            peer_id: self.config.host_peer_id.clone(),
            display_name: self.config.display_name.clone(),
            avatar_seed: self.config.host_peer_id.clone(),
            anilist_user_id: None,
            role: Role::Host,
            connection: ConnectionState::Direct,
            ready: true,
            drift_ms: 0.0,
            rtt_ms: 0.0,
            buffering: false,
            left: false,
            endpoint_id: self.endpoint.id().to_string(),
        }
    }

    fn roster(&self) -> Vec<PeerInfo> {
        let peers = self.peers.lock().expect("session peers poisoned");
        let mut out = Vec::with_capacity(peers.len() + 1);
        out.push(self.host_info());
        out.extend(peers.values().map(Self::peer_info));
        out
    }

    fn broadcast(&self, message: ServerMessage) {
        let peers = self.peers.lock().expect("session peers poisoned");
        for entry in peers.values() {
            let _ = entry.outbound.send(message.clone());
        }
    }

    fn send_to(&self, peer_id: &str, message: ServerMessage) {
        let peers = self.peers.lock().expect("session peers poisoned");
        if let Some(entry) = peers.get(peer_id) {
            let _ = entry.outbound.send(message);
        }
    }

    fn broadcast_roster(&self) {
        let peers = self.roster();
        self.broadcast(ServerMessage::Roster {
            peers: peers.clone(),
        });
        let _ = self.events.send(HostEvent::Roster { peers });
    }

    fn add_chat(
        &self,
        id: String,
        from: String,
        text: String,
        links: Vec<String>,
        reply_to: Option<String>,
        upload: Option<(String, Vec<u8>)>,
    ) -> ChatMessage {
        let (meta, wire) = match upload {
            Some((name, bytes)) => (
                Some(ChatAttachment {
                    name: name.clone(),
                    size: bytes.len(),
                }),
                Some(ChatUpload {
                    name,
                    data: STANDARD.encode(&bytes),
                }),
            ),
            None => (None, None),
        };
        let message = ChatMessage {
            id,
            from,
            text,
            links,
            at: now_ms() as f64 / 1000.0,
            reply_to,
            attachment: meta,
        };
        self.broadcast(ServerMessage::Chat {
            id: message.id.clone(),
            from: message.from.clone(),
            text: message.text.clone(),
            at: message.at,
            links: message.links.clone(),
            reply_to: message.reply_to.clone(),
            attachment: wire.clone(),
        });
        let _ = self.events.send(HostEvent::Chat {
            message: message.clone(),
            attachment: wire,
        });
        message
    }

    /// Sliding-window rate check; records now, reports whether inside the cap.
    fn allow_chat(&self, peer_id: &str, now: f64) -> bool {
        let mut stamps = self
            .chat_stamps
            .lock()
            .expect("session chat stamps poisoned");
        let queue = stamps.entry(peer_id.to_string()).or_default();
        while queue
            .front()
            .is_some_and(|oldest| now - *oldest > CHAT_RATE_WINDOW_SEC)
        {
            queue.pop_front();
        }
        if queue.len() >= CHAT_RATE_MAX {
            return false;
        }
        queue.push_back(now);
        true
    }

    /// To every peer except one (a sender never hears its own echo).
    fn broadcast_except(&self, except: &str, message: ServerMessage) {
        let peers = self.peers.lock().expect("session peers poisoned");
        for (peer_id, entry) in peers.iter() {
            if peer_id != except {
                let _ = entry.outbound.send(message.clone());
            }
        }
    }

    /// Stop frames always pass; start frames need spacing.
    fn allow_typing(&self, peer_id: &str, active: bool, now: f64) -> bool {
        if !active {
            return true;
        }
        let mut stamps = self
            .typing_stamps
            .lock()
            .expect("session typing stamps poisoned");
        if stamps
            .get(peer_id)
            .is_some_and(|last| now - *last < TYPING_MIN_INTERVAL_SEC)
        {
            return false;
        }
        stamps.insert(peer_id.to_string(), now);
        true
    }

    fn can_pin(&self, peer_id: &str) -> bool {
        matches!(self.role_of(peer_id), Some(Role::Host | Role::Moderator))
    }

    /// Host/moderator only, well-formed anchor only; None when refused.
    fn set_pin(
        &self,
        peer_id: &str,
        message_id: Option<String>,
    ) -> Option<(Option<String>, String)> {
        if !self.can_pin(peer_id) {
            return None;
        }
        let entry = match message_id {
            Some(id) if valid_chat_id(&id) => Some(PinEntry {
                message_id: id,
                pinned_by: peer_id.to_string(),
            }),
            Some(_) => return None,
            None => None,
        };
        let out = (
            entry.as_ref().map(|entry| entry.message_id.clone()),
            peer_id.to_string(),
        );
        *self.pinned.lock().expect("session pinned poisoned") = entry;
        Some(out)
    }

    /// New kinds past the cap are dropped silently, removals always pass; None when refused or unchanged.
    fn react(
        &self,
        peer_id: &str,
        message_id: String,
        emoji: String,
        add: bool,
    ) -> Option<(String, String)> {
        if !valid_chat_id(&message_id)
            || emoji.is_empty()
            || emoji.chars().count() > REACTION_EMOJI_MAX_CHARS
            || emoji.chars().any(char::is_control)
        {
            return None;
        }
        let mut reactions = self.reactions.lock().expect("session reactions poisoned");
        let kinds = reactions.entry(message_id.clone()).or_default();
        let changed = if add {
            // New kinds need room under the cap; re-adding a held kind always passes.
            let is_new = !kinds.contains_key(&emoji);
            if is_new && kinds.len() >= REACTION_MAX_KINDS {
                return None;
            }
            let peers = kinds.entry(emoji.clone()).or_default();
            peers.insert(peer_id.to_string())
        } else {
            kinds
                .get_mut(&emoji)
                .is_some_and(|peers| peers.remove(peer_id))
        };
        if !changed {
            return None;
        }
        if !add && kinds.get(&emoji).is_some_and(BTreeSet::is_empty) {
            kinds.remove(&emoji);
        }
        if kinds.is_empty() {
            reactions.remove(&message_id);
        }
        Some((message_id, emoji))
    }

    /// None = nothing to replay.
    fn pin_snapshot(&self) -> Option<ServerMessage> {
        self.pinned
            .lock()
            .expect("session pinned poisoned")
            .as_ref()
            .map(|entry| ServerMessage::Pin {
                message_id: Some(entry.message_id.clone()),
                pinned_by: entry.pinned_by.clone(),
            })
    }

    /// Deterministic order; only messages carrying reactions.
    fn reaction_snapshots(&self) -> Vec<ServerMessage> {
        let reactions = self.reactions.lock().expect("session reactions poisoned");
        let mut frames = Vec::new();
        for (message_id, kinds) in reactions.iter() {
            for (emoji, peers) in kinds.iter() {
                for peer in peers.iter() {
                    frames.push(ServerMessage::React {
                        message_id: message_id.clone(),
                        emoji: emoji.clone(),
                        peer_id: peer.clone(),
                        add: true,
                    });
                }
            }
        }
        frames
    }

    fn remove_peer(&self, peer_id: &str) {
        let removed = self
            .peers
            .lock()
            .expect("session peers poisoned")
            .remove(peer_id);
        if let Some(entry) = removed {
            let _ = self.events.send(HostEvent::PeerLeft {
                peer_id: entry.peer_id,
            });
            self.broadcast_roster();
            self.recheck_waiting();
        }
    }

    /// Mark newly stale/left; left peers stop gating so the held start is re-evaluated. Returns peers that crossed into left (never auto-resumes).
    fn apply_liveness(&self, now: u64) -> Vec<String> {
        let mut newly_left = Vec::new();
        let changed = {
            let mut peers = self.peers.lock().expect("session peers poisoned");
            let mut changed = false;
            for entry in peers.values_mut() {
                match peer_liveness(now, entry.last_seen_ms.load(Ordering::Relaxed), entry.stale) {
                    PeerLiveness::Drop => {
                        if !entry.left {
                            entry.left = true;
                            entry.stale = true;
                            newly_left.push(entry.peer_id.clone());
                            changed = true;
                        }
                    }
                    PeerLiveness::Stale => {
                        if !entry.stale {
                            entry.stale = true;
                            changed = true;
                        }
                    }
                    PeerLiveness::Alive => {}
                }
            }
            changed
        };
        if changed {
            self.broadcast_roster();
        }
        if !newly_left.is_empty() {
            // Clearing never starts anything.
            self.recheck_waiting();
            // Pauses playback for everyone (no auto-resume).
            self.pause_for_departures();
        }
        newly_left
    }

    /// Never resumes: resume arrives as an explicit host/moderator command (lobby.md §14.3).
    fn pause_for_departures(&self) {
        let state = self
            .playback
            .lock()
            .expect("session playback poisoned")
            .clone();
        let Some(state) = state else {
            return;
        };
        if !state.is_playing || state.media_id.is_empty() {
            return;
        }
        let elapsed = (now_ms() as f64 - state.updated_at_mono).max(0.0) / 1000.0;
        let position = (state.position + elapsed * state.rate).max(0.0);
        self.publish_position(state.media_id, position, false, state.rate);
    }

    fn next_revision(&self) -> u64 {
        self.revision.fetch_add(1, Ordering::SeqCst) + 1
    }

    fn relay_control(&self, action: ControlAction) -> u64 {
        let revision = self.next_revision();
        self.broadcast(ServerMessage::Command {
            revision,
            action: action.clone(),
        });
        let _ = self.events.send(HostEvent::Control { revision, action });
        revision
    }

    fn publish_playback(&self, state: &PlaybackState) {
        *self.playback.lock().expect("session playback poisoned") = Some(state.clone());
        self.broadcast(ServerMessage::PlaybackState {
            revision: state.revision,
            media_id: state.media_id.clone(),
            position: state.position,
            is_playing: state.is_playing,
            rate: state.rate,
            updated_at_mono: state.updated_at_mono,
        });
    }

    /// Host clock is authoritative: guests align against it, the frontend must not supply its own.
    fn publish_position(
        &self,
        media_id: String,
        position: f64,
        is_playing: bool,
        rate: f64,
    ) -> PlaybackState {
        let state = PlaybackState {
            revision: self.next_revision(),
            media_id,
            position,
            is_playing,
            rate,
            updated_at_mono: now_ms() as f64,
        };
        self.publish_playback(&state);
        state
    }

    fn set_track(&self, track: TrackState) {
        self.broadcast(ServerMessage::TrackSync {
            media_id: track.media_id.clone(),
            audio: track.audio.clone(),
            sub: track.sub.clone(),
            audio_delay: track.audio_delay,
            sub_delay: track.sub_delay,
        });
        let _ = self.events.send(HostEvent::Track {
            track: track.clone(),
        });
        *self.track.lock().expect("session track poisoned") = Some(track);
    }

    fn last_track(&self) -> Option<TrackState> {
        self.track.lock().expect("session track poisoned").clone()
    }

    fn plan(&self) -> Vec<MediaPlanItem> {
        self.plan.lock().expect("session plan poisoned").clone()
    }

    /// paths pruned to the plan ids, never sent to guests.
    fn set_plan(&self, items: Vec<MediaPlanItem>, paths: HashMap<String, String>) {
        let ids: HashSet<&str> = items.iter().map(|item| item.item_id.as_str()).collect();
        let paths = paths
            .into_iter()
            .filter(|(id, _)| ids.contains(id.as_str()))
            .collect();
        *self.plan.lock().expect("session plan poisoned") = items.clone();
        *self.paths.lock().expect("session paths poisoned") = paths;
        self.broadcast(ServerMessage::MediaPlan { items });
        self.recompute_readiness();
    }

    fn item_path(&self, item_id: &str) -> Option<String> {
        self.paths
            .lock()
            .expect("session paths poisoned")
            .get(item_id)
            .cloned()
    }

    /// Left peers ignored: they no longer gate the room.
    fn missing_map(&self) -> HashMap<String, Vec<String>> {
        let peer_ids: Vec<String> = self
            .peers
            .lock()
            .expect("session peers poisoned")
            .values()
            .filter(|entry| !entry.left)
            .map(|entry| entry.peer_id.clone())
            .collect();
        let item_reports: HashMap<String, Vec<ItemReport>> = self
            .reports
            .lock()
            .expect("session reports poisoned")
            .iter()
            .map(|(peer_id, report)| (peer_id.clone(), report.items.clone()))
            .collect();
        crate::session::playlist::missing_by_item(&self.plan(), &peer_ids, &item_reports)
    }

    fn missing_peers(&self, item_id: &str) -> Vec<String> {
        let reports = self.reports.lock().expect("session reports poisoned");
        let peers = self.peers.lock().expect("session peers poisoned");
        let mut missing: Vec<String> = peers
            .values()
            .filter(|entry| !entry.left)
            .filter(|entry| {
                !reports
                    .get(&entry.peer_id)
                    .and_then(|report| report.items.iter().find(|entry| entry.item_id == item_id))
                    .is_some_and(|entry| entry.present)
            })
            .map(|entry| entry.peer_id.clone())
            .collect();
        missing.sort();
        missing
    }

    /// The host is always `Role::Host`.
    fn role_of(&self, peer_id: &str) -> Option<Role> {
        if peer_id == self.config.host_peer_id {
            return Some(Role::Host);
        }
        self.peers
            .lock()
            .expect("session peers poisoned")
            .get(peer_id)
            .map(|entry| entry.role)
    }

    fn can_start(&self, peer_id: &str) -> bool {
        matches!(self.role_of(peer_id), Some(Role::Host | Role::Moderator))
    }

    /// Kept separate from `can_start` so the rights can diverge later.
    fn can_attach(&self, peer_id: &str) -> bool {
        matches!(self.role_of(peer_id), Some(Role::Host | Role::Moderator))
    }

    /// Host/moderator only; viewers' uploads stripped (None) while text goes through.
    fn accept_upload(
        &self,
        peer_id: &str,
        attachment: Option<ChatUpload>,
    ) -> Option<(String, Vec<u8>)> {
        let upload = attachment?;
        if !self.can_attach(peer_id) {
            return None;
        }
        let bytes = STANDARD.decode(&upload.data).ok()?;
        let name = sanitize_chat_upload(&upload.name, bytes.len())?;
        Some((name, bytes))
    }

    fn carried_entry(&self, peer_id: &str) -> Option<PeerInfo> {
        self.carried
            .lock()
            .expect("session carried roster poisoned")
            .iter()
            .find(|peer| peer.peer_id == peer_id)
            .cloned()
    }

    /// Roles/ready survive the move.
    fn set_carried(&self, roster: Vec<PeerInfo>) {
        *self
            .carried
            .lock()
            .expect("session carried roster poisoned") = roster;
    }

    fn begin_handover(
        &self,
        peer_id: &str,
    ) -> Result<oneshot::Receiver<Result<Handover, String>>, String> {
        if peer_id == self.config.host_peer_id {
            return Err("the host cannot hand the room over to itself".to_string());
        }
        let (tx, rx) = oneshot::channel();
        {
            let peers = self.peers.lock().expect("session peers poisoned");
            if !peers.contains_key(peer_id) {
                return Err(format!("no peer {peer_id}"));
            }
        }
        let mut pending = self.handover.lock().expect("session handover poisoned");
        if pending.is_some() {
            return Err("a handover is already in progress".to_string());
        }
        *pending = Some(HandoverWaiter {
            peer_id: peer_id.to_string(),
            tx,
        });
        drop(pending);
        let playback = self
            .playback
            .lock()
            .expect("session playback poisoned")
            .clone();
        self.send_to(
            peer_id,
            ServerMessage::HostHandover {
                session_id: self.config.session_id.clone(),
                token: self.config.token.clone(),
                playback,
            },
        );
        Ok(rx)
    }

    fn resolve_handover(&self, peer_id: &str, endpoint_id: String) -> bool {
        let mut pending = self.handover.lock().expect("session handover poisoned");
        // Wrong peer or none: leave the waiter untouched.
        if !matches!(&*pending, Some(waiter) if waiter.peer_id == peer_id) {
            return false;
        }
        let Some(waiter) = pending.take() else {
            return false;
        };
        drop(pending);
        let _ = waiter.tx.send(Ok(Handover {
            host_id: peer_id.to_string(),
            endpoint_id,
        }));
        true
    }

    /// Sent before the old host stops.
    fn announce_migration(&self, handover: &Handover) {
        self.broadcast(ServerMessage::Migrate {
            session_id: self.config.session_id.clone(),
            token: self.config.token.clone(),
            endpoint_id: handover.endpoint_id.clone(),
            host_id: handover.host_id.clone(),
        });
    }

    fn set_role(&self, peer_id: &str, role: Role) -> Result<(), String> {
        if peer_id == self.config.host_peer_id {
            return Err("the host role cannot be changed".to_string());
        }
        if role == Role::Host {
            return Err("a guest cannot be promoted to host".to_string());
        }
        let changed = {
            let mut peers = self.peers.lock().expect("session peers poisoned");
            match peers.get_mut(peer_id) {
                Some(entry) if entry.role != role => {
                    entry.role = role;
                    true
                }
                Some(_) => false,
                None => return Err(format!("no peer {peer_id}")),
            }
        };
        if changed {
            self.broadcast_roster();
        }
        Ok(())
    }

    /// Holds the start while peers miss the item.
    fn start_item(&self, item_id: &str) -> Result<StartOutcome, String> {
        let item = self
            .plan()
            .into_iter()
            .find(|item| item.item_id == item_id)
            .ok_or_else(|| format!("no plan item {item_id}"))?;
        let missing = self.missing_peers(item_id);
        if missing.is_empty() {
            *self.waiting.lock().expect("session waiting poisoned") = None;
            self.broadcast(ServerMessage::WaitingFor {
                item_id: item.item_id.clone(),
                peer_ids: Vec::new(),
            });
            let _ = self.events.send(HostEvent::Waiting {
                item_id: item.item_id.clone(),
                peer_ids: Vec::new(),
            });
            self.publish_position(item.item_id.clone(), 0.0, true, 1.0);
            self.broadcast(ServerMessage::Command {
                revision: self.next_revision(),
                action: ControlAction::Load {
                    media_id: item.item_id.clone(),
                },
            });
            let path = self.item_path(item_id);
            let _ = self.events.send(HostEvent::StartItem {
                item_id: item.item_id.clone(),
                path: path.clone(),
            });
            Ok(StartOutcome::Started {
                item_id: item.item_id,
                path,
            })
        } else {
            *self.waiting.lock().expect("session waiting poisoned") = Some(WaitingFor {
                item_id: item.item_id.clone(),
                peer_ids: missing.clone(),
            });
            self.broadcast(ServerMessage::WaitingFor {
                item_id: item.item_id.clone(),
                peer_ids: missing.clone(),
            });
            let _ = self.events.send(HostEvent::Waiting {
                item_id: item.item_id.clone(),
                peer_ids: missing.clone(),
            });
            self.publish_position(item.item_id.clone(), 0.0, false, 1.0);
            Ok(StartOutcome::Waiting {
                item_id: item.item_id,
                peer_ids: missing,
            })
        }
    }

    fn waiting_state(&self) -> Option<WaitingFor> {
        self.waiting
            .lock()
            .expect("session waiting poisoned")
            .clone()
    }

    /// Never auto-starts: an emptied missing set only clears the wait.
    fn recheck_waiting(&self) {
        let Some(waiting) = self.waiting_state() else {
            return;
        };
        let missing = self.missing_peers(&waiting.item_id);
        if missing == waiting.peer_ids {
            return;
        }
        if missing.is_empty() {
            *self.waiting.lock().expect("session waiting poisoned") = None;
        } else {
            *self.waiting.lock().expect("session waiting poisoned") = Some(WaitingFor {
                item_id: waiting.item_id.clone(),
                peer_ids: missing.clone(),
            });
        }
        self.broadcast(ServerMessage::WaitingFor {
            item_id: waiting.item_id.clone(),
            peer_ids: missing.clone(),
        });
        let _ = self.events.send(HostEvent::Waiting {
            item_id: waiting.item_id,
            peer_ids: missing,
        });
    }

    fn record_state_report(&self, peer_id: &str, ready: bool, items: Vec<ItemReport>) {
        let verdict = {
            let plan = self.plan();
            let report = PeerReport {
                peer_id: peer_id.to_string(),
                items: items.clone(),
                ready,
            };
            let verdict = peer_is_ready(&report, &plan);
            self.reports
                .lock()
                .expect("session reports poisoned")
                .insert(peer_id.to_string(), report);
            verdict
        };
        self.broadcast(ServerMessage::ReadyState {
            peer_id: peer_id.to_string(),
            ready: verdict,
            items,
        });
        let changed = {
            let mut peers = self.peers.lock().expect("session peers poisoned");
            match peers.get_mut(peer_id) {
                Some(entry) if entry.ready != verdict => {
                    entry.ready = verdict;
                    true
                }
                _ => false,
            }
        };
        if changed {
            self.broadcast_roster();
        }
        self.recheck_waiting();
    }

    fn recompute_readiness(&self) {
        let plan = self.plan();
        let reports = self
            .reports
            .lock()
            .expect("session reports poisoned")
            .clone();
        let mut changed = false;
        {
            let mut peers = self.peers.lock().expect("session peers poisoned");
            for (peer_id, report) in &reports {
                let verdict = peer_is_ready(report, &plan);
                if let Some(entry) = peers.get_mut(peer_id) {
                    if entry.ready != verdict {
                        entry.ready = verdict;
                        changed = true;
                    }
                }
            }
        }
        if changed {
            self.broadcast_roster();
        }
    }

    #[cfg(test)]
    fn ready_summary(&self) -> ReadySummary {
        crate::session::playlist::roster_ready_summary(&self.plan(), &self.roster())
    }

    #[cfg(test)]
    fn insert_test_peer(&self, peer_id: &str, role: Role) {
        let (out_tx, _out_rx) = mpsc::unbounded_channel();
        self.peers.lock().expect("session peers poisoned").insert(
            peer_id.to_string(),
            PeerEntry {
                peer_id: peer_id.to_string(),
                display_name: peer_id.to_string(),
                anilist_user_id: None,
                role,
                ready: true,
                stale: false,
                left: false,
                endpoint_id: String::new(),
                last_seen_ms: Arc::new(AtomicU64::new(now_ms())),
                outbound: out_tx,
            },
        );
    }
}

#[derive(Clone)]
pub struct HostSession {
    inner: Arc<HostInner>,
    accept_task: Arc<JoinHandle<()>>,
    liveness_task: Arc<JoinHandle<()>>,
}

impl HostSession {
    /// port pins the local UDP port; None lets the OS assign one.
    pub async fn start(config: HostConfig, port: Option<u16>) -> Result<Self, String> {
        let endpoint = transport::bind_endpoint(port).await?;
        Ok(Self::bind(config, endpoint))
    }

    pub fn bind(config: HostConfig, endpoint: Endpoint) -> Self {
        let (events, _) = broadcast::channel(128);
        let inner = Arc::new(HostInner {
            endpoint,
            config,
            peers: Mutex::new(HashMap::new()),
            events,
            revision: AtomicU64::new(0),
            playback: Mutex::new(None),
            track: Mutex::new(None),
            plan: Mutex::new(Vec::new()),
            reports: Mutex::new(HashMap::new()),
            paths: Mutex::new(HashMap::new()),
            waiting: Mutex::new(None),
            handover: Mutex::new(None),
            carried: Mutex::new(Vec::new()),
            chat_stamps: Mutex::new(HashMap::new()),
            typing_stamps: Mutex::new(HashMap::new()),
            pinned: Mutex::new(None),
            reactions: Mutex::new(HashMap::new()),
            shutdown: AtomicBool::new(false),
            shutdown_notify: Notify::new(),
        });
        let accept_task = Arc::new(tokio::spawn(run_accept(inner.clone())));
        let liveness_task = Arc::new(tokio::spawn(run_liveness(inner.clone())));
        Self {
            inner,
            accept_task,
            liveness_task,
        }
    }

    pub fn ticket(&self) -> SessionTicket {
        SessionTicket {
            session_id: self.inner.config.session_id.clone(),
            token: self.inner.config.token.clone(),
            endpoint_id: self.inner.endpoint.id().to_string(),
        }
    }

    /// Tests dial it directly.
    pub fn endpoint(&self) -> &Endpoint {
        &self.inner.endpoint
    }

    pub fn bound_sockets(&self) -> Vec<String> {
        self.inner
            .endpoint
            .bound_sockets()
            .iter()
            .map(SocketAddr::to_string)
            .collect()
    }

    pub fn session_id(&self) -> &str {
        &self.inner.config.session_id
    }

    pub fn host_peer_id(&self) -> &str {
        &self.inner.config.host_peer_id
    }

    pub fn display_name(&self) -> &str {
        &self.inner.config.display_name
    }

    /// No local event: the host's own UI never shows its own typing line.
    pub fn broadcast_typing(&self, active: bool) {
        self.inner.broadcast(ServerMessage::Typing {
            peer_id: self.inner.config.host_peer_id.clone(),
            active,
        });
    }

    /// A malformed anchor errors for the local caller instead of a silent wire drop.
    pub fn set_pin(&self, message_id: Option<String>) -> Result<(), String> {
        let host_id = self.inner.config.host_peer_id.clone();
        let Some((message_id, pinned_by)) = self.inner.set_pin(&host_id, message_id) else {
            return Err("cannot pin that message".to_string());
        };
        self.inner.broadcast(ServerMessage::Pin {
            message_id: message_id.clone(),
            pinned_by: pinned_by.clone(),
        });
        let _ = self.inner.events.send(HostEvent::Pin {
            message_id,
            pinned_by,
        });
        Ok(())
    }

    /// A refused reaction errors for the local caller.
    pub fn react(&self, message_id: String, emoji: String, add: bool) -> Result<(), String> {
        let host_id = self.inner.config.host_peer_id.clone();
        let Some((message_id, emoji)) = self.inner.react(&host_id, message_id, emoji, add) else {
            return Err("reaction refused".to_string());
        };
        self.inner.broadcast(ServerMessage::React {
            message_id: message_id.clone(),
            emoji: emoji.clone(),
            peer_id: host_id.clone(),
            add,
        });
        let _ = self.inner.events.send(HostEvent::React {
            message_id,
            emoji,
            peer_id: host_id,
            add,
        });
        Ok(())
    }

    #[cfg(test)]
    pub fn peer_count(&self) -> usize {
        self.inner
            .peers
            .lock()
            .expect("session peers poisoned")
            .len()
    }

    pub fn subscribe(&self) -> broadcast::Receiver<HostEvent> {
        self.inner.events.subscribe()
    }

    pub fn roster(&self) -> Vec<PeerInfo> {
        self.inner.roster()
    }

    /// Caller mirrors the bytes; the wire form is derived here.
    pub fn add_chat(
        &self,
        id: String,
        from: String,
        text: String,
        links: Vec<String>,
        reply_to: Option<String>,
        upload: Option<(String, Vec<u8>)>,
    ) -> ChatMessage {
        self.inner.add_chat(id, from, text, links, reply_to, upload)
    }

    pub fn relay_control(&self, action: ControlAction) -> u64 {
        self.inner.relay_control(action)
    }

    #[cfg(test)]
    pub fn publish_playback(&self, state: PlaybackState) {
        self.inner.publish_playback(&state);
    }

    pub fn publish_position(
        &self,
        media_id: String,
        position: f64,
        is_playing: bool,
        rate: f64,
    ) -> PlaybackState {
        self.inner
            .publish_position(media_id, position, is_playing, rate)
    }

    pub fn sync_tracks(&self, track: TrackState) {
        self.inner.set_track(track);
    }

    pub fn last_playback(&self) -> Option<PlaybackState> {
        self.inner
            .playback
            .lock()
            .expect("session playback poisoned")
            .clone()
    }

    #[cfg(test)]
    pub fn last_track(&self) -> Option<TrackState> {
        self.inner.last_track()
    }

    #[cfg(test)]
    pub fn plan(&self) -> Vec<MediaPlanItem> {
        self.inner.plan()
    }

    /// paths stored on the host only, never sent to guests.
    pub fn set_plan(&self, items: Vec<MediaPlanItem>, paths: HashMap<String, String>) {
        self.inner.set_plan(items, paths);
    }

    pub fn set_role(&self, peer_id: &str, role: Role) -> Result<(), String> {
        self.inner.set_role(peer_id, role)
    }

    /// Resolves on `HandoverReady`, or errors on reported failure.
    pub fn begin_handover(
        &self,
        peer_id: &str,
    ) -> Result<oneshot::Receiver<Result<Handover, String>>, String> {
        self.inner.begin_handover(peer_id)
    }

    /// Roster (roles/ready re-applied on reconnect), held start, playback position/pause survive.
    pub fn adopt_state(
        &self,
        roster: Vec<PeerInfo>,
        waiting: Option<WaitingFor>,
        playback: Option<PlaybackState>,
    ) {
        self.inner.set_carried(roster);
        *self.inner.waiting.lock().expect("session waiting poisoned") = waiting;
        // Seed the revision counter from the carried snapshot: the successor's
        // own counter starts at 0, so without this its first snapshot would be
        // dropped by every guest as a stale revision (lobby.md §14.7).
        if let Some(state) = &playback {
            self.inner
                .revision
                .fetch_max(state.revision, Ordering::SeqCst);
        }
        *self
            .inner
            .playback
            .lock()
            .expect("session playback poisoned") = playback;
    }

    /// Flush beat, then the old host can rejoin as guest.
    pub async fn finish_handover(&self, handover: &Handover) {
        self.inner.announce_migration(handover);
        // Per-peer writer tasks drain their queues asynchronously; give them a
        // beat before closing the endpoint drops the connections.
        tokio::time::sleep(Duration::from_millis(300)).await;
        self.stop().await;
    }

    /// Holds until peers have the file.
    pub fn start_item(&self, item_id: &str) -> Result<StartOutcome, String> {
        self.inner.start_item(item_id)
    }

    pub fn waiting(&self) -> Option<WaitingFor> {
        self.inner.waiting_state()
    }

    pub fn missing(&self) -> HashMap<String, Vec<String>> {
        self.inner.missing_map()
    }

    #[cfg(test)]
    pub fn ready_summary(&self) -> ReadySummary {
        self.inner.ready_summary()
    }

    pub async fn stop(&self) {
        self.inner.shutdown.store(true, Ordering::SeqCst);
        self.inner.shutdown_notify.notify_waiters();
        self.inner
            .peers
            .lock()
            .expect("session peers poisoned")
            .clear();
        self.inner.endpoint.close().await;
        self.accept_task.abort();
        self.liveness_task.abort();
    }
}

async fn run_accept(inner: Arc<HostInner>) {
    loop {
        if inner.shutdown.load(Ordering::SeqCst) {
            break;
        }
        tokio::select! {
            incoming = inner.endpoint.accept() => {
                let Some(incoming) = incoming else { break };
                let inner = inner.clone();
                tokio::spawn(async move { handle_connection(inner, incoming).await });
            }
            () = inner.shutdown_notify.notified() => {}
        }
    }
}

async fn run_liveness(inner: Arc<HostInner>) {
    loop {
        tokio::time::sleep(Duration::from_millis(LIVENESS_TICK_MS)).await;
        if inner.shutdown.load(Ordering::SeqCst) {
            break;
        }
        inner.apply_liveness(now_ms());
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PeerLiveness {
    Alive,
    Stale,
    Drop,
}

pub fn peer_liveness(now: u64, last_seen: u64, stale: bool) -> PeerLiveness {
    let age = now.saturating_sub(last_seen);
    if age > LIVENESS_GRACE_MS {
        PeerLiveness::Drop
    } else if age > LIVENESS_TIMEOUT_MS && !stale {
        PeerLiveness::Stale
    } else {
        PeerLiveness::Alive
    }
}

async fn reject(connection: &Connection, sender: &mut FrameSender, code: ErrorCode, message: &str) {
    let _ = sender
        .send(&ServerMessage::Error {
            code,
            message: message.to_string(),
        })
        .await;
    let _ = sender.send(&ServerMessage::Bye).await;
    sender.finish();
    // Let the peer drain the rejection frames first; hard-closing would discard the stream.
    let _ = tokio::time::timeout(Duration::from_secs(2), connection.closed()).await;
    connection.close(1u32.into(), b"rejected");
}

async fn handle_connection(inner: Arc<HostInner>, incoming: Incoming) {
    let Ok(connection) = incoming.await else {
        return;
    };
    let (send, recv) = match connection.accept_bi().await {
        Ok(pair) => pair,
        Err(_) => {
            connection.close(0u32.into(), b"no stream");
            return;
        }
    };
    let (mut sender, mut reader) = transport::channel(send, recv);

    let frame = match reader.recv().await {
        Ok(frame) => frame,
        Err(_) => return,
    };
    let hello = match frame.client() {
        Ok(ClientMessage::Hello {
            peer_id,
            display_name,
            token,
            anilist_user_id,
            app_version,
        }) => (peer_id, display_name, token, anilist_user_id, app_version),
        Ok(_) => {
            reject(
                &connection,
                &mut sender,
                ErrorCode::Internal,
                "expected hello",
            )
            .await;
            return;
        }
        Err(_) => {
            reject(&connection, &mut sender, ErrorCode::Internal, "bad hello").await;
            return;
        }
    };
    let (peer_id, display_name, token, anilist_user_id, app_version) = hello;

    if token != inner.config.token {
        reject(&connection, &mut sender, ErrorCode::BadToken, "bad token").await;
        return;
    }

    // Mixed versions break the room silently later; refuse them at the door.
    if app_version != env!("CARGO_PKG_VERSION") {
        let message = format!(
            "app version mismatch: host {}, peer {}",
            env!("CARGO_PKG_VERSION"),
            if app_version.is_empty() {
                "pre-versioning"
            } else {
                app_version.as_str()
            }
        );
        reject(&connection, &mut sender, ErrorCode::BadVersion, &message).await;
        return;
    }

    let room_full = {
        let peers = inner.peers.lock().expect("session peers poisoned");
        let active = peers.values().filter(|entry| !entry.left).count();
        active >= inner.config.max_peers && !peers.contains_key(&peer_id)
    };
    if room_full {
        reject(&connection, &mut sender, ErrorCode::RoomFull, "room full").await;
        return;
    }

    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<ServerMessage>();
    let last_seen = Arc::new(AtomicU64::new(now_ms()));
    // QUIC handshake, never a peer field: the id is the peer's public key.
    let endpoint_id = connection.remote_id().to_string();
    // Reconnects keep role/ready after a handover.
    let prior = inner.carried_entry(&peer_id);
    {
        let mut peers = inner.peers.lock().expect("session peers poisoned");
        peers.insert(
            peer_id.clone(),
            PeerEntry {
                peer_id: peer_id.clone(),
                display_name: display_name.clone(),
                anilist_user_id,
                role: prior.as_ref().map_or(Role::Viewer, |peer| peer.role),
                ready: prior.as_ref().is_some_and(|peer| peer.ready),
                stale: false,
                left: false,
                endpoint_id,
                last_seen_ms: last_seen.clone(),
                outbound: out_tx,
            },
        );
    }
    let _ = inner.events.send(HostEvent::PeerJoined {
        peer_id: peer_id.clone(),
        display_name: display_name.clone(),
    });

    let welcome = ServerMessage::Welcome {
        protocol: PROTOCOL_VERSION,
        session_id: inner.config.session_id.clone(),
        host_id: inner.config.host_peer_id.clone(),
        your_peer_id: peer_id.clone(),
        roster: inner.roster(),
        media_plan: inner.plan(),
    };
    if sender.send(&welcome).await.is_err() {
        inner.remove_peer(&peer_id);
        return;
    }
    inner.broadcast_roster();

    // Lands (re)joins on the current position/pause; keeps rooms paused across crash promotion (lobby.md §14.7).
    if let Some(state) = inner
        .playback
        .lock()
        .expect("session playback poisoned")
        .clone()
    {
        inner.send_to(
            &peer_id,
            ServerMessage::PlaybackState {
                revision: state.revision,
                media_id: state.media_id,
                position: state.position,
                is_playing: state.is_playing,
                rate: state.rate,
                updated_at_mono: state.updated_at_mono,
            },
        );
    }

    if let Some(waiting) = inner.waiting_state() {
        inner.send_to(
            &peer_id,
            ServerMessage::WaitingFor {
                item_id: waiting.item_id,
                peer_ids: waiting.peer_ids,
            },
        );
    }

    // Same chat state for (re)joins; rides existing frames, no version bump.
    if let Some(pin) = inner.pin_snapshot() {
        inner.send_to(&peer_id, pin);
    }
    for frame in inner.reaction_snapshots() {
        inner.send_to(&peer_id, frame);
    }

    let writer = tokio::spawn(async move {
        while let Some(message) = out_rx.recv().await {
            if sender.send(&message).await.is_err() {
                break;
            }
        }
        sender.finish();
    });

    while let Ok(frame) = reader.recv().await {
        last_seen.store(now_ms(), Ordering::Relaxed);
        let outgoing = match frame.client() {
            Ok(ClientMessage::TimePing { id, t1 }) => Some(ServerMessage::TimePong {
                id,
                t1,
                t2: now_ms() as f64,
            }),
            Ok(ClientMessage::Chat {
                id,
                text,
                links,
                reply_to,
                attachment,
            }) => {
                // Sanitize, bound, anchor; drop spammers silently.
                if inner.allow_chat(&peer_id, now_ms() as f64 / 1000.0) {
                    if let Some(text) = sanitize_chat_text(&text) {
                        let id = chat_id_or_generate(&id);
                        let links = sanitize_chat_links(&links);
                        let reply_to =
                            reply_to.filter(|r| !r.is_empty() && r.len() <= CHAT_ID_MAX_CHARS);
                        // Viewers talk but never attach.
                        let upload = inner.accept_upload(&peer_id, attachment);
                        inner.add_chat(id, display_name.clone(), text, links, reply_to, upload);
                    }
                }
                None
            }
            Ok(ClientMessage::RequestControl { action }) => {
                inner.relay_control(action);
                None
            }
            Ok(ClientMessage::Typing { active }) => {
                // Never back to the sender; stop frames unthrottled so indicators clear.
                if inner.allow_typing(&peer_id, active, now_ms() as f64 / 1000.0) {
                    inner.broadcast_except(
                        &peer_id,
                        ServerMessage::Typing {
                            peer_id: peer_id.clone(),
                            active,
                        },
                    );
                    let _ = inner.events.send(HostEvent::Typing {
                        peer_id: peer_id.clone(),
                        active,
                    });
                }
                None
            }
            Ok(ClientMessage::RequestStart { item_id }) => {
                if inner.can_start(&peer_id) {
                    let _ = inner.start_item(&item_id);
                }
                None
            }
            Ok(ClientMessage::Pin { message_id }) => {
                // Refused pins change nothing; every peer hears accepted frames.
                if let Some((message_id, pinned_by)) = inner.set_pin(&peer_id, message_id) {
                    inner.broadcast(ServerMessage::Pin {
                        message_id: message_id.clone(),
                        pinned_by: pinned_by.clone(),
                    });
                    let _ = inner.events.send(HostEvent::Pin {
                        message_id,
                        pinned_by,
                    });
                }
                None
            }
            Ok(ClientMessage::React {
                message_id,
                emoji,
                add,
            }) => {
                // Drops are silent; accepted reach everyone including the reactor.
                if let Some((message_id, emoji)) = inner.react(&peer_id, message_id, emoji, add) {
                    inner.broadcast(ServerMessage::React {
                        message_id: message_id.clone(),
                        emoji: emoji.clone(),
                        peer_id: peer_id.clone(),
                        add,
                    });
                    let _ = inner.events.send(HostEvent::React {
                        message_id,
                        emoji,
                        peer_id: peer_id.clone(),
                        add,
                    });
                }
                None
            }
            Ok(ClientMessage::HandoverReady { endpoint_id }) => {
                // Unmatched replies are ignored.
                inner.resolve_handover(&peer_id, endpoint_id);
                None
            }
            Ok(ClientMessage::RequestTrackSync) => {
                inner.last_track().map(|track| ServerMessage::TrackSync {
                    media_id: track.media_id,
                    audio: track.audio,
                    sub: track.sub,
                    audio_delay: track.audio_delay,
                    sub_delay: track.sub_delay,
                })
            }
            Ok(ClientMessage::TrackPick {
                audio,
                sub,
                audio_delay,
                sub_delay,
            }) => {
                let media_id = inner
                    .playback
                    .lock()
                    .expect("session playback poisoned")
                    .as_ref()
                    .map_or_else(String::new, |state| state.media_id.clone());
                inner.set_track(TrackState {
                    media_id,
                    audio,
                    sub,
                    audio_delay,
                    sub_delay,
                });
                None
            }
            Ok(ClientMessage::StateReport { ready, items, .. }) => {
                inner.record_state_report(&peer_id, ready, items);
                None
            }
            Ok(ClientMessage::Bye) => break,
            Err(ProtocolError::FrameTooLarge) => Some(ServerMessage::Error {
                code: ErrorCode::RateLimited,
                message: "frame too large".to_string(),
            }),
            _ => None,
        };
        if let Some(message) = outgoing {
            inner.send_to(&peer_id, message);
        }
    }

    inner.remove_peer(&peer_id);
    connection.close(0u32.into(), b"bye");
    let _ = writer.await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_config_is_well_formed() {
        let config = HostConfig::generate("Host".into());
        assert_eq!(config.session_id.len(), 16);
        assert_eq!(config.token.len(), 32);
        assert_eq!(config.host_peer_id.len(), 16);
        assert_eq!(config.max_peers, DEFAULT_MAX_PEERS);
        assert_ne!(config.token, HostConfig::generate("Host".into()).token);
    }

    #[tokio::test]
    async fn roster_starts_with_only_the_host() {
        let endpoint = transport::bind_offline_endpoint().await.expect("endpoint");
        let session = HostSession::bind(HostConfig::generate("Host".into()), endpoint);
        let roster = session.roster();
        assert_eq!(roster.len(), 1);
        assert_eq!(roster[0].role, Role::Host);
        assert_eq!(roster[0].peer_id, session.host_peer_id());
        assert_eq!(session.peer_count(), 0);
        session.stop().await;
    }

    #[tokio::test]
    async fn handover_rejects_self_and_unknown_peers() {
        let endpoint = transport::bind_offline_endpoint().await.expect("endpoint");
        let session = HostSession::bind(HostConfig::generate("Host".into()), endpoint);
        assert!(session.begin_handover(session.host_peer_id()).is_err());
        assert!(session.begin_handover("nobody").is_err());
        session.stop().await;
    }

    #[tokio::test]
    async fn peers_past_grace_are_marked_left_and_pause_the_room() {
        let endpoint = transport::bind_offline_endpoint().await.expect("endpoint");
        let session = HostSession::bind(HostConfig::generate("Host".into()), endpoint);
        let inner = session.inner.clone();
        inner.insert_test_peer("guest-1", Role::Viewer);
        session.publish_position("ep1".into(), 30.0, true, 1.0);

        let now = now_ms();
        assert!(inner.apply_liveness(now).is_empty());
        assert!(!session.roster().iter().any(|peer| peer.left));

        let left = inner.apply_liveness(now + LIVENESS_GRACE_MS + 1);
        assert_eq!(left, vec!["guest-1".to_string()]);
        let peer = session
            .roster()
            .into_iter()
            .find(|peer| peer.peer_id == "guest-1")
            .expect("a left peer stays in the roster");
        assert!(peer.left);
        assert_eq!(peer.connection, ConnectionState::Disconnected);
        assert!(!session.last_playback().expect("snapshot").is_playing);
        assert!(inner.apply_liveness(now + LIVENESS_GRACE_MS + 2).is_empty());

        inner.insert_test_peer("guest-1", Role::Viewer);
        let peer = session
            .roster()
            .into_iter()
            .find(|peer| peer.peer_id == "guest-1")
            .expect("peer");
        assert!(!peer.left);

        session.stop().await;
    }

    #[tokio::test]
    async fn a_left_peer_clears_the_hold_without_starting() {
        let endpoint = transport::bind_offline_endpoint().await.expect("endpoint");
        let session = HostSession::bind(HostConfig::generate("Host".into()), endpoint);
        let inner = session.inner.clone();
        inner.insert_test_peer("guest-1", Role::Viewer);
        session.set_plan(vec![plan_item("a")], std::collections::HashMap::new());

        assert!(matches!(
            session.start_item("a").expect("hold"),
            StartOutcome::Waiting { .. }
        ));
        assert!(session.waiting().is_some());

        inner.apply_liveness(now_ms() + LIVENESS_GRACE_MS + 1);
        // Cleared but not started: the last snapshot is the paused hold.
        assert!(session.waiting().is_none());
        let playback = session.last_playback().expect("paused hold snapshot");
        assert!(!playback.is_playing);

        session.stop().await;
    }

    fn plan_item(id: &str) -> MediaPlanItem {
        MediaPlanItem {
            item_id: id.into(),
            order: 0,
            title: id.into(),
            identity: crate::session::protocol::MediaIdentity {
                sha256: "0".repeat(64),
                size: 1,
                duration: 1.0,
                video: None,
            },
            sources: Vec::new(),
        }
    }

    #[tokio::test]
    async fn chat_rate_limit_opens_a_sliding_window_per_peer() {
        let endpoint = transport::bind_offline_endpoint().await.expect("endpoint");
        let session = HostSession::bind(HostConfig::generate("Host".into()), endpoint);
        let inner = session.inner.clone();

        let now = 1_000.0;
        for _ in 0..CHAT_RATE_MAX {
            assert!(inner.allow_chat("peer-a", now));
        }
        assert!(!inner.allow_chat("peer-a", now));
        assert!(inner.allow_chat("peer-b", now));
        assert!(inner.allow_chat("peer-a", now + CHAT_RATE_WINDOW_SEC + 1.0));
        session.stop().await;
    }

    #[tokio::test]
    async fn typing_frames_throttle_starts_but_never_stops() {
        let endpoint = transport::bind_offline_endpoint().await.expect("endpoint");
        let session = HostSession::bind(HostConfig::generate("Host".into()), endpoint);
        let inner = session.inner.clone();

        let now = 1_000.0;
        assert!(inner.allow_typing("peer-a", true, now));
        assert!(!inner.allow_typing("peer-a", true, now + 0.1));
        assert!(inner.allow_typing("peer-a", false, now + 0.1));
        assert!(inner.allow_typing("peer-a", true, now + TYPING_MIN_INTERVAL_SEC + 0.1));
        assert!(inner.allow_typing("peer-b", true, now + 0.1));
        session.stop().await;
    }

    #[tokio::test]
    async fn plan_starts_empty_and_opens_the_solo_gate() {
        let endpoint = transport::bind_offline_endpoint().await.expect("endpoint");
        let session = HostSession::bind(HostConfig::generate("Host".into()), endpoint);
        assert!(session.plan().is_empty());
        assert!(!session.ready_summary().all_ready);

        session.set_plan(
            vec![plan_item("a"), plan_item("b")],
            std::collections::HashMap::new(),
        );
        assert_eq!(session.plan().len(), 2);
        assert_eq!(session.plan()[0].item_id, "a");
        let summary = session.ready_summary();
        assert!(summary.all_ready);
        assert_eq!(summary.peers.len(), 1);
        assert!(summary.peers[0].ready);
        session.stop().await;
    }

    #[tokio::test]
    async fn publish_position_stamps_revision_and_clock() {
        let endpoint = transport::bind_offline_endpoint().await.expect("endpoint");
        let session = HostSession::bind(HostConfig::generate("Host".into()), endpoint);
        let first = session.publish_position("ep1".into(), 12.0, true, 1.0);
        let second = session.publish_position("ep1".into(), 13.0, false, 1.5);
        assert!(second.revision > first.revision);
        assert!(first.updated_at_mono > 0.0);
        assert_eq!(
            session.last_playback().map(|state| state.position),
            Some(13.0)
        );
        session.stop().await;
    }

    #[test]
    fn liveness_boundaries_match_the_locked_windows() {
        let now = 1_000_000;
        assert_eq!(peer_liveness(now, now - 1_000, false), PeerLiveness::Alive);
        assert_eq!(
            peer_liveness(now, now - LIVENESS_TIMEOUT_MS, false),
            PeerLiveness::Alive
        );
        assert_eq!(
            peer_liveness(now, now - LIVENESS_TIMEOUT_MS - 1, false),
            PeerLiveness::Stale
        );
        // Stale input stays Alive: no re-trigger.
        assert_eq!(
            peer_liveness(now, now - LIVENESS_TIMEOUT_MS - 1, true),
            PeerLiveness::Alive
        );
        assert_eq!(
            peer_liveness(now, now - LIVENESS_GRACE_MS, true),
            PeerLiveness::Alive
        );
        assert_eq!(
            peer_liveness(now, now - LIVENESS_GRACE_MS - 1, true),
            PeerLiveness::Drop
        );
    }

    #[tokio::test]
    async fn control_relay_bumps_revision_and_emits_events() {
        let endpoint = transport::bind_offline_endpoint().await.expect("endpoint");
        let session = HostSession::bind(HostConfig::generate("Host".into()), endpoint);
        let mut events = session.subscribe();

        let first = session.relay_control(ControlAction::Pause);
        let second = session.relay_control(ControlAction::Play);
        assert!(second > first, "revision must advance across relays");
        assert!(matches!(
            events.recv().await.expect("control event"),
            HostEvent::Control {
                revision,
                action: ControlAction::Pause
            } if revision == first
        ));
        assert!(matches!(
            events.recv().await.expect("control event"),
            HostEvent::Control {
                revision,
                action: ControlAction::Play
            } if revision == second
        ));

        session.stop().await;
    }

    #[tokio::test]
    async fn publish_playback_stores_without_restamping_the_revision() {
        let endpoint = transport::bind_offline_endpoint().await.expect("endpoint");
        let session = HostSession::bind(HostConfig::generate("Host".into()), endpoint);

        session.publish_playback(PlaybackState {
            revision: 9,
            media_id: "ep1".into(),
            position: 5.0,
            is_playing: false,
            rate: 1.0,
            updated_at_mono: 42.0,
        });
        let stored = session.last_playback().expect("stored playback");
        assert_eq!(stored.revision, 9);
        assert_eq!(stored.position, 5.0);
        assert_eq!(stored.media_id, "ep1");

        session.stop().await;
    }

    #[tokio::test]
    async fn track_sync_stores_and_emits_the_selection() {
        let endpoint = transport::bind_offline_endpoint().await.expect("endpoint");
        let session = HostSession::bind(HostConfig::generate("Host".into()), endpoint);
        let mut events = session.subscribe();

        session.sync_tracks(TrackState {
            media_id: "ep1".into(),
            audio: Some("jpn".into()),
            sub: Some("eng".into()),
            audio_delay: 0.0,
            sub_delay: 2.0,
        });
        assert!(matches!(
            events.recv().await.expect("track event"),
            HostEvent::Track { track } if track.sub.as_deref() == Some("eng")
        ));
        assert_eq!(
            session.last_track().and_then(|track| track.audio),
            Some("jpn".into())
        );

        session.stop().await;
    }

    #[tokio::test]
    async fn roles_gate_start_and_paths_stay_host_local() {
        let endpoint = transport::bind_offline_endpoint().await.expect("endpoint");
        let session = HostSession::bind(HostConfig::generate("Host".into()), endpoint);

        let mut paths = HashMap::new();
        paths.insert("a".to_string(), "C:/a.mkv".to_string());
        paths.insert("stale".to_string(), "C:/stale.mkv".to_string());
        session.set_plan(vec![plan_item("a")], paths);
        assert_eq!(session.inner.item_path("a").as_deref(), Some("C:/a.mkv"));
        assert_eq!(session.inner.item_path("stale"), None);

        session.inner.insert_test_peer("guest-1", Role::Viewer);
        assert!(!session.inner.can_start("guest-1"));
        session
            .set_role("guest-1", Role::Moderator)
            .expect("promote");
        assert!(session.inner.can_start("guest-1"));
        let host_id = session.host_peer_id().to_string();
        assert!(session.set_role(&host_id, Role::Viewer).is_err());
        assert!(session.set_role("guest-1", Role::Host).is_err());
        session.set_role("guest-1", Role::Viewer).expect("demote");
        assert!(!session.inner.can_start("guest-1"));
        assert!(session.set_role("missing", Role::Moderator).is_err());

        session.stop().await;
    }

    #[tokio::test]
    async fn chat_uploads_need_host_or_moderator_rights() {
        let endpoint = transport::bind_offline_endpoint().await.expect("endpoint");
        let session = HostSession::bind(HostConfig::generate("Host".into()), endpoint);
        session.inner.insert_test_peer("guest-1", Role::Viewer);

        let upload = || {
            Some(ChatUpload {
                name: "show.torrent".into(),
                data: STANDARD.encode(b"d8:announce4:test e"),
            })
        };
        assert!(!session.inner.can_attach("guest-1"));
        assert_eq!(session.inner.accept_upload("guest-1", upload()), None);
        session
            .set_role("guest-1", Role::Moderator)
            .expect("promote");
        assert!(session.inner.can_attach("guest-1"));
        let (name, bytes) = session
            .inner
            .accept_upload("guest-1", upload())
            .expect("moderator upload accepted");
        assert_eq!(name, "show.torrent");
        assert_eq!(bytes, b"d8:announce4:test e");
        assert_eq!(
            session.inner.accept_upload(
                "guest-1",
                Some(ChatUpload {
                    name: "show.torrent".into(),
                    data: "!!!".into(),
                })
            ),
            None
        );
        assert_eq!(
            session.inner.accept_upload(
                "guest-1",
                Some(ChatUpload {
                    name: "clip.mkv".into(),
                    data: STANDARD.encode(b"x"),
                })
            ),
            None
        );
        assert_eq!(session.inner.accept_upload("missing", upload()), None);

        let message = session.inner.add_chat(
            "m1".into(),
            "Host".into(),
            String::new(),
            Vec::new(),
            None,
            Some(("show.torrent".into(), b"bytes".to_vec())),
        );
        assert_eq!(
            message.attachment,
            Some(ChatAttachment {
                name: "show.torrent".into(),
                size: 5,
            })
        );

        session.stop().await;
    }

    #[tokio::test]
    async fn start_item_holds_until_missing_peers_report_then_never_auto_starts() {
        let endpoint = transport::bind_offline_endpoint().await.expect("endpoint");
        let session = HostSession::bind(HostConfig::generate("Host".into()), endpoint);
        let mut events = session.subscribe();
        session.set_plan(vec![plan_item("a")], HashMap::new());
        session.inner.insert_test_peer("guest-1", Role::Viewer);

        let outcome = session.start_item("a").expect("start");
        assert!(matches!(
            outcome,
            StartOutcome::Waiting { item_id, ref peer_ids }
                if item_id == "a" && peer_ids == &vec!["guest-1".to_string()]
        ));
        assert_eq!(
            session.waiting().map(|waiting| waiting.peer_ids),
            Some(vec!["guest-1".to_string()])
        );
        assert!(matches!(
            events.recv().await.expect("waiting event"),
            HostEvent::Waiting { ref peer_ids, .. } if peer_ids == &vec!["guest-1".to_string()]
        ));

        session.inner.record_state_report(
            "guest-1",
            true,
            vec![ItemReport {
                item_id: "a".into(),
                present: true,
                verified: true,
            }],
        );
        assert!(session.waiting().is_none());
        assert!(matches!(
            events.recv().await.expect("clear event"),
            HostEvent::Waiting { ref peer_ids, .. } if peer_ids.is_empty()
        ));

        let mut paths = HashMap::new();
        paths.insert("a".to_string(), "C:/a.mkv".to_string());
        session.set_plan(vec![plan_item("a")], paths);
        let outcome = session.start_item("a").expect("start");
        assert!(matches!(
            outcome,
            StartOutcome::Started { ref item_id, ref path }
                if item_id == "a" && path.as_deref() == Some("C:/a.mkv")
        ));
        // Clears the banner first, then starts.
        assert!(matches!(
            events.recv().await.expect("clear event"),
            HostEvent::Waiting { ref peer_ids, .. } if peer_ids.is_empty()
        ));
        assert!(matches!(
            events.recv().await.expect("start event"),
            HostEvent::StartItem { ref item_id, ref path }
                if item_id == "a" && path.as_deref() == Some("C:/a.mkv")
        ));
        assert!(session.start_item("missing").is_err());

        session.stop().await;
    }

    #[tokio::test]
    async fn stop_is_idempotent_and_keeps_the_solo_roster() {
        let endpoint = transport::bind_offline_endpoint().await.expect("endpoint");
        let session = HostSession::bind(HostConfig::generate("Host".into()), endpoint);
        assert_eq!(session.peer_count(), 0);

        session.stop().await;
        session.stop().await;

        let roster = session.roster();
        assert_eq!(roster.len(), 1);
        assert_eq!(roster[0].peer_id, session.host_peer_id());
    }

    #[tokio::test]
    async fn pin_gates_on_role_and_anchor_shape() {
        let endpoint = transport::bind_offline_endpoint().await.expect("endpoint");
        let session = HostSession::bind(HostConfig::generate("Host".into()), endpoint);
        let inner = session.inner.clone();
        let host_id = session.host_peer_id().to_string();
        inner.insert_test_peer("guest-1", Role::Viewer);

        assert!(!inner.can_pin("guest-1"));
        assert!(!inner.can_pin("stranger"));
        session
            .set_role("guest-1", Role::Moderator)
            .expect("promote");
        assert!(inner.can_pin("guest-1"));

        assert!(inner.set_pin(&host_id, Some("bad id".into())).is_none());
        assert!(inner.set_pin(&host_id, Some("x".repeat(65))).is_none());

        assert_eq!(
            inner.set_pin("guest-1", Some("m1".into())),
            Some((Some("m1".into()), "guest-1".into()))
        );
        assert_eq!(
            inner.set_pin(&host_id, Some("m2".into())),
            Some((Some("m2".into()), host_id.clone()))
        );
        assert_eq!(
            inner.pin_snapshot(),
            Some(ServerMessage::Pin {
                message_id: Some("m2".into()),
                pinned_by: host_id.clone(),
            })
        );
        assert_eq!(inner.set_pin(&host_id, None), Some((None, host_id.clone())));
        assert!(inner.pin_snapshot().is_none());
        session.set_role("guest-1", Role::Viewer).expect("demote");
        assert!(inner.set_pin("guest-1", Some("m1".into())).is_none());
        assert!(inner.pin_snapshot().is_none());

        session.stop().await;
    }

    #[tokio::test]
    async fn reaction_caps_kinds_and_validates() {
        let endpoint = transport::bind_offline_endpoint().await.expect("endpoint");
        let session = HostSession::bind(HostConfig::generate("Host".into()), endpoint);
        let inner = session.inner.clone();

        assert!(inner
            .react("guest", "bad id".into(), "👍".into(), true)
            .is_none());
        assert!(inner
            .react("guest", "m1".into(), String::new(), true)
            .is_none());
        assert!(inner
            .react("guest", "m1".into(), "\u{7f}".into(), true)
            .is_none());
        let too_long = "e".repeat(REACTION_EMOJI_MAX_CHARS + 1);
        assert!(inner.react("guest", "m1".into(), too_long, true).is_none());

        // First five kinds pass; a sixth is dropped.
        for emoji in ["👍", "❤️", "😂", "😮", "🎉"] {
            assert_eq!(
                inner.react("guest-1", "m1".into(), emoji.to_string(), true),
                Some(("m1".into(), emoji.to_string())),
                "kind {emoji} passes"
            );
        }
        assert!(inner
            .react("guest-1", "m1".into(), "😢".into(), true)
            .is_none());
        // At the cap, joining an existing kind still passes.
        assert_eq!(
            inner.react("guest-2", "m1".into(), "👍".into(), true),
            Some(("m1".into(), "👍".into()))
        );
        assert!(inner
            .react("guest-1", "m1".into(), "👍".into(), true)
            .is_none());

        assert_eq!(
            inner.react("guest-2", "m1".into(), "👍".into(), false),
            Some(("m1".into(), "👍".into()))
        );
        assert!(inner
            .react("nobody", "m1".into(), "👍".into(), false)
            .is_none());
        // No-op removal creates nothing.
        assert!(inner
            .react("guest", "unknown".into(), "🙂".into(), false)
            .is_none());

        session.stop().await;
    }

    #[tokio::test]
    async fn reaction_removal_prunes_empty_buckets() {
        let endpoint = transport::bind_offline_endpoint().await.expect("endpoint");
        let session = HostSession::bind(HostConfig::generate("Host".into()), endpoint);
        let inner = session.inner.clone();

        assert_eq!(
            inner.react("guest-1", "m1".into(), "👍".into(), true),
            Some(("m1".into(), "👍".into()))
        );
        assert_eq!(
            inner.react("guest-1", "m1".into(), "❤️".into(), true),
            Some(("m1".into(), "❤️".into()))
        );
        assert_eq!(
            inner.react("guest-1", "m1".into(), "❤️".into(), false),
            Some(("m1".into(), "❤️".into()))
        );
        let frames: Vec<String> = inner
            .reaction_snapshots()
            .into_iter()
            .filter_map(|frame| match frame {
                ServerMessage::React { emoji, .. } => Some(emoji),
                _ => None,
            })
            .collect();
        assert_eq!(frames, vec!["👍".to_string()]);
        assert_eq!(
            inner.react("guest-1", "m1".into(), "👍".into(), false),
            Some(("m1".into(), "👍".into()))
        );
        assert!(inner.reaction_snapshots().is_empty());

        session.stop().await;
    }

    #[tokio::test]
    async fn pin_and_reaction_snapshots_replay_in_deterministic_order() {
        let endpoint = transport::bind_offline_endpoint().await.expect("endpoint");
        let session = HostSession::bind(HostConfig::generate("Host".into()), endpoint);
        let inner = session.inner.clone();
        let host_id = session.host_peer_id().to_string();

        inner.set_pin(&host_id, Some("m1".into())).expect("pin");
        inner.react("guest-b", "m1".into(), "🙂".into(), true);
        inner.react("guest-a", "m1".into(), "😀".into(), true);
        inner.react("guest-a", "m2".into(), "👍".into(), true);

        // Kinds and peers replay in BTree order, not insert order; across messages the test sorts by message first.
        assert_eq!(
            inner.pin_snapshot(),
            Some(ServerMessage::Pin {
                message_id: Some("m1".into()),
                pinned_by: host_id.clone(),
            })
        );
        let mut frames: Vec<(String, String, String)> = inner
            .reaction_snapshots()
            .into_iter()
            .map(|frame| match frame {
                ServerMessage::React {
                    message_id,
                    emoji,
                    peer_id,
                    ..
                } => (message_id, emoji, peer_id),
                _ => panic!("reaction replay carries only React frames"),
            })
            .collect();
        // Emission order is BTree-deterministic within one message.
        let m1_kinds: Vec<&str> = frames
            .iter()
            .filter(|frame| frame.0 == "m1")
            .map(|frame| frame.1.as_str())
            .collect();
        assert_eq!(m1_kinds, vec!["😀", "🙂"]);
        frames.sort();
        assert_eq!(
            frames,
            vec![
                ("m1".to_string(), "😀".to_string(), "guest-a".to_string()),
                ("m1".to_string(), "🙂".to_string(), "guest-b".to_string()),
                ("m2".to_string(), "👍".to_string(), "guest-a".to_string()),
            ]
        );

        session.stop().await;
    }
}
