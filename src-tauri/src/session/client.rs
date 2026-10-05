//! Watch Party guest runtime (P2): connect, handshake, heartbeat, and
//! reconnect with exponential backoff.
//!
//! The guest opens one bi-stream to the host, reports itself with `Hello`,
//! waits for `Welcome`, then runs two tasks: a 1 s heartbeat sender and a
//! reader that fans host messages out to subscribers. A dropped connection is
//! retried with exponential backoff until the session is left or rejected.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use iroh::{Endpoint, EndpointAddr, EndpointId};
use tokio::sync::{broadcast, mpsc, Notify};
use tokio::task::JoinHandle;
use tokio::time::MissedTickBehavior;

use crate::session::host::{HostConfig, HostSession, DEFAULT_MAX_PEERS};
use crate::session::protocol::{
    ClientMessage, ControlAction, ErrorCode, ItemReport, MediaPlanItem, PeerInfo, PlaybackState,
    Role, ServerMessage, WaitingFor,
};
use crate::session::state::TrackState;
use crate::session::sync::{SyncRuntime, SyncSample, PING_INTERVAL_MS};
use crate::session::transport::{self, now_ms, TransportError, ALPN, LIVENESS_TIMEOUT_MS};

/// Initial reconnect backoff.
pub const RECONNECT_BASE_MS: u64 = 500;
/// Maximum reconnect backoff.
pub const RECONNECT_MAX_MS: u64 = 10_000;

/// Double a backoff value, clamped to [`RECONNECT_MAX_MS`].
pub fn next_backoff(current: u64) -> u64 {
    current.saturating_mul(2).min(RECONNECT_MAX_MS)
}

/// Everything the guest needs to join.
#[derive(Debug, Clone)]
pub struct ClientConfig {
    pub host_addr: EndpointAddr,
    pub token: String,
    pub peer_id: String,
    pub display_name: String,
    pub anilist_user_id: Option<u64>,
    /// This build's version; the host refuses a peer whose version differs.
    pub app_version: String,
}

struct ClientInner {
    endpoint: Endpoint,
    /// The dial target and identity; `host_addr`/`token` are rewritten when the
    /// room migrates to a new host.
    config: Mutex<ClientConfig>,
    events: broadcast::Sender<ServerMessage>,
    out_tx: Mutex<Option<mpsc::UnboundedSender<ClientMessage>>>,
    roster: Mutex<Vec<PeerInfo>>,
    plan: Mutex<Vec<MediaPlanItem>>,
    waiting: Mutex<Option<WaitingFor>>,
    session_id: Mutex<Option<String>>,
    your_peer_id: Mutex<Option<String>>,
    item_reports: Mutex<HashMap<String, Vec<ItemReport>>>,
    /// A `HostHandover` from the outgoing host, awaiting acceptance by
    /// `session_accept_handover` (room id, token, and playback to take over).
    handover: Mutex<Option<(String, String, Option<PlaybackState>)>>,
    sync: Mutex<SyncRuntime>,
    command_revision: AtomicU64,
    host_last_seen: AtomicU64,
    /// Set once the room announced a new host: the guest re-dials `host_addr`
    /// instead of treating the broken connection as a session end.
    migrated: AtomicBool,
    shutdown: AtomicBool,
    /// Set when this guest is elected to take the room over after the host
    /// died: the endpoint is handed to the new host session and must not be
    /// closed by the guest teardown.
    detached: AtomicBool,
    shutdown_notify: Notify,
    /// First-handshake outcome: `Some(Ok(()))` once `Welcome` arrives, or the
    /// rejection (`ErrorCode`, message) that ended the join attempt.
    handshake: Mutex<Option<Result<(), (ErrorCode, String)>>>,
}

/// A running guest session.
#[derive(Clone)]
pub struct ClientSession {
    inner: Arc<ClientInner>,
    task: Arc<JoinHandle<()>>,
}

impl ClientSession {
    /// Bind the public n0 endpoint and join `config.host_addr`.
    pub async fn join(config: ClientConfig) -> Result<Self, String> {
        let endpoint = transport::bind_endpoint().await?;
        Ok(Self::connect_with(config, endpoint))
    }

    /// Join using an already-bound endpoint (tests/harness).
    pub fn connect_with(config: ClientConfig, endpoint: Endpoint) -> Self {
        let (events, _) = broadcast::channel(128);
        let inner = Arc::new(ClientInner {
            endpoint,
            config: Mutex::new(config),
            events,
            out_tx: Mutex::new(None),
            roster: Mutex::new(Vec::new()),
            plan: Mutex::new(Vec::new()),
            waiting: Mutex::new(None),
            session_id: Mutex::new(None),
            your_peer_id: Mutex::new(None),
            item_reports: Mutex::new(HashMap::new()),
            handover: Mutex::new(None),
            sync: Mutex::new(SyncRuntime::default()),
            command_revision: AtomicU64::new(0),
            host_last_seen: AtomicU64::new(now_ms()),
            migrated: AtomicBool::new(false),
            shutdown: AtomicBool::new(false),
            detached: AtomicBool::new(false),
            shutdown_notify: Notify::new(),
            handshake: Mutex::new(None),
        });
        let task = Arc::new(tokio::spawn(run(inner.clone())));
        Self { inner, task }
    }

    /// Subscribe to host messages.
    pub fn subscribe(&self) -> broadcast::Receiver<ServerMessage> {
        self.inner.events.subscribe()
    }

    /// The latest roster received from the host.
    pub fn roster(&self) -> Vec<PeerInfo> {
        self.inner
            .roster
            .lock()
            .expect("client roster poisoned")
            .clone()
    }

    /// The host session id, once `Welcome` has arrived.
    pub fn session_id(&self) -> Option<String> {
        self.inner
            .session_id
            .lock()
            .expect("client session poisoned")
            .clone()
    }

    /// This guest's own peer id, once `Welcome` has arrived.
    pub fn your_peer_id(&self) -> Option<String> {
        self.inner
            .your_peer_id
            .lock()
            .expect("client peer id poisoned")
            .clone()
    }

    /// The latest media plan received from the host.
    pub fn plan(&self) -> Vec<MediaPlanItem> {
        self.inner
            .plan
            .lock()
            .expect("client plan poisoned")
            .clone()
    }

    /// The start the room is currently holding, if any (empty `peer_ids` means
    /// the wait is over but the host has not started yet).
    pub fn waiting(&self) -> Option<WaitingFor> {
        self.inner
            .waiting
            .lock()
            .expect("client waiting poisoned")
            .clone()
    }

    /// Ask the host to start a plan item (host/moderator only server-side).
    pub fn request_start(&self, item_id: &str) -> Result<(), String> {
        self.send(ClientMessage::RequestStart {
            item_id: item_id.to_string(),
        })
    }

    /// The pending `HostHandover` awaiting acceptance: room id, token, and the
    /// playback snapshot the outgoing host leaves behind.
    pub fn take_handover(&self) -> Option<(String, String, Option<PlaybackState>)> {
        self.inner
            .handover
            .lock()
            .expect("client handover poisoned")
            .take()
    }

    /// This guest's stable identity, reused by the host session it takes over.
    pub fn handover_identity(&self) -> (String, String) {
        let config = self.inner.config.lock().expect("client config poisoned");
        (config.peer_id.clone(), config.display_name.clone())
    }

    /// The room secret this guest joined with; a crash successor reuses it so
    /// the same room code/token keep working.
    pub fn token(&self) -> String {
        self.inner
            .config
            .lock()
            .expect("client config poisoned")
            .token
            .clone()
    }

    /// The newest authoritative snapshot seen from the host, if any. A crash
    /// successor seeds its own playback from it (lobby.md §14.7).
    pub fn last_playback(&self) -> Option<PlaybackState> {
        self.inner
            .sync
            .lock()
            .expect("client sync poisoned")
            .snapshot()
            .cloned()
    }

    /// Whether the host has been silent past the 30 s grace window: the point
    /// at which the room is treated as hostless and an election runs.
    pub fn host_gone(&self) -> bool {
        now_ms().saturating_sub(self.inner.host_last_seen.load(Ordering::Relaxed))
            > crate::session::transport::LIVENESS_GRACE_MS
    }

    /// Retarget the dial at a new host on the same room identity. Refuses our
    /// own endpoint (a guest never dials itself). Returns whether it changed.
    pub fn retarget_to(&self, endpoint_id: &str) -> bool {
        let Ok(endpoint_id) = endpoint_id.parse::<EndpointId>() else {
            return false;
        };
        if endpoint_id == self.inner.endpoint.id() {
            return false;
        }
        let mut config = self.inner.config.lock().expect("client config poisoned");
        config.host_addr = EndpointAddr::new(endpoint_id);
        drop(config);
        self.inner.migrated.store(true, Ordering::SeqCst);
        true
    }

    /// Hand this guest's endpoint to a new host session without closing it.
    ///
    /// The endpoint id is already in every peer's roster, so the successor must
    /// keep listening on it: rebinding would give it an id nobody could learn
    /// without a channel to the dead host. Stops the guest run loop.
    pub fn detach_endpoint(&self) -> Endpoint {
        self.inner.detached.store(true, Ordering::SeqCst);
        self.inner.shutdown.store(true, Ordering::SeqCst);
        self.inner.shutdown_notify.notify_waiters();
        self.task.abort();
        self.inner.endpoint.clone()
    }

    /// Take the room over on this guest's own endpoint after the host died.
    ///
    /// Stops the guest runtime but keeps the endpoint (its id is already in
    /// every roster, so nobody must learn a new one), then returns a host
    /// session carrying the room identity and the last replicated state. The
    /// room starts paused: a resume is an explicit command, never automatic
    /// (lobby.md §14.7). `paths` is this instance's local item id → file path
    /// map, which the successor now owns as host. Returns `None` when the room
    /// has not been welcomed yet (no session id to carry).
    pub fn take_over(&self, paths: HashMap<String, String>) -> Option<HostSession> {
        let session_id = self.session_id()?;
        let (peer_id, display_name) = self.handover_identity();
        let token = self.token();
        let plan = self.plan();
        let roster = self.roster();
        let waiting = self.waiting();
        let playback = self.last_playback().map(paused_snapshot);
        let endpoint = self.detach_endpoint();
        let session = HostSession::bind(
            HostConfig {
                session_id,
                token,
                host_peer_id: peer_id,
                display_name,
                max_peers: DEFAULT_MAX_PEERS,
            },
            endpoint,
        );
        session.set_plan(plan, paths);
        session.adopt_state(roster, waiting, playback);
        Some(session)
    }

    /// Test-only: retarget the dial at a full address. Production carries only
    /// the endpoint id (resolved through discovery); loopback endpoints have
    /// discovery disabled, so the test points at the bound sockets directly.
    #[cfg(test)]
    pub fn retarget_addr(&self, addr: EndpointAddr) -> bool {
        let mut config = self.inner.config.lock().expect("client config poisoned");
        config.host_addr = addr;
        drop(config);
        self.inner.migrated.store(true, Ordering::SeqCst);
        true
    }

    /// Test-only: pretend the host has been silent past the grace window so a
    /// crash promotion can be exercised without waiting 30 s.
    #[cfg(test)]
    pub fn mark_host_gone(&self) {
        let gone = now_ms().saturating_sub(crate::session::transport::LIVENESS_GRACE_MS + 1);
        self.inner.host_last_seen.store(gone, Ordering::Relaxed);
    }

    /// Tell the outgoing host where the room now listens. Must run before this
    /// guest's connection is torn down.
    pub fn handover_ready(&self, endpoint_id: &str) -> Result<(), String> {
        self.send(ClientMessage::HandoverReady {
            endpoint_id: endpoint_id.to_string(),
        })
    }

    /// This guest's lobby role, read from its own roster entry (defaults to
    /// viewer until `Welcome` or the first roster arrives).
    pub fn local_role(&self) -> Role {
        let your_id = self
            .inner
            .your_peer_id
            .lock()
            .expect("client peer id poisoned")
            .clone();
        let Some(your_id) = your_id else {
            return Role::Viewer;
        };
        self.roster()
            .into_iter()
            .find(|peer| peer.peer_id == your_id)
            .map(|peer| peer.role)
            .unwrap_or(Role::Viewer)
    }

    /// For each plan item, the peer ids (non-host) that have not reported it
    /// present, from the `ReadyState` broadcasts the host fans out.
    pub fn missing(&self) -> HashMap<String, Vec<String>> {
        let peer_ids: Vec<String> = self
            .roster()
            .into_iter()
            .filter(|peer| peer.role != Role::Host && !peer.left)
            .map(|peer| peer.peer_id)
            .collect();
        let reports = self
            .inner
            .item_reports
            .lock()
            .expect("client reports poisoned")
            .clone();
        crate::session::playlist::missing_by_item(&self.plan(), &peer_ids, &reports)
    }

    /// Whether the host has been silent past the liveness timeout.
    pub fn host_stale(&self) -> bool {
        now_ms().saturating_sub(self.inner.host_last_seen.load(Ordering::Relaxed))
            > LIVENESS_TIMEOUT_MS
    }

    /// Send a message to the host, if connected.
    pub fn send(&self, message: ClientMessage) -> Result<(), String> {
        let guard = self.inner.out_tx.lock().expect("client outbox poisoned");
        match guard.as_ref() {
            Some(tx) => tx
                .send(message)
                .map_err(|_| "session is not connected".to_string()),
            None => Err("session is not connected".to_string()),
        }
    }

    /// Request a control action from the host.
    pub fn request_control(&self, action: ControlAction) -> Result<(), String> {
        self.send(ClientMessage::RequestControl { action })
    }

    /// Ask the host for its current track selection.
    #[cfg(test)]
    pub fn request_track_sync(&self) -> Result<(), String> {
        self.send(ClientMessage::RequestTrackSync)
    }

    /// Publish a track pick to the host.
    pub fn pick_track(&self, track: TrackState) -> Result<(), String> {
        self.send(ClientMessage::TrackPick {
            audio: track.audio,
            sub: track.sub,
            audio_delay: track.audio_delay,
            sub_delay: track.sub_delay,
        })
    }

    /// Report readiness and per-item presence to the host (ready gate, D4).
    pub fn set_ready(&self, ready: bool, items: Vec<ItemReport>) -> Result<(), String> {
        self.send(ClientMessage::StateReport {
            media_time: 0.0,
            is_playing: false,
            rate: 1.0,
            buffering: false,
            media_id: String::new(),
            ready,
            items,
        })
    }

    /// Evaluate one sync tick against the guest's local position (seconds).
    ///
    /// `local_media_id` is the plan item the local player shows (`None` when
    /// it is not on a room item): a snapshot for any other media is refused.
    pub fn sample_sync(&self, local_position: f64, local_media_id: Option<String>) -> SyncSample {
        self.inner
            .sync
            .lock()
            .expect("client sync poisoned")
            .sample_report(
                now_ms() as f64,
                local_position,
                &local_media_id.unwrap_or_default(),
            )
    }

    /// Set the guest release offset (ms) applied to the expected position.
    pub fn set_sync_offset(&self, offset_ms: f64) -> f64 {
        let mut sync = self.inner.sync.lock().expect("client sync poisoned");
        sync.set_offset_ms(offset_ms);
        sync.offset_ms()
    }

    /// Clear the seek-resync latch once the local player restarted.
    ///
    /// [`Self::sample_sync`] latches `awaiting_restart` when it hands out a
    /// `Hard` seek and then refuses to evaluate again until the player confirms
    /// it restarted. Without this call the guest stops correcting after the
    /// first hard resync.
    pub fn mark_restarted(&self) {
        self.inner
            .sync
            .lock()
            .expect("client sync poisoned")
            .on_playback_restart();
    }

    /// Leave the session and close the endpoint.
    pub async fn leave(&self) {
        self.inner.shutdown.store(true, Ordering::SeqCst);
        let _ = self.send(ClientMessage::Bye);
        self.inner.shutdown_notify.notify_waiters();
        // A detached endpoint now belongs to the host session that took over;
        // closing it would kill the room the successor is carrying.
        if !self.inner.detached.load(Ordering::SeqCst) {
            self.inner.endpoint.close().await;
        }
        self.task.abort();
    }

    /// Await the first-handshake outcome: `Ok(())` once `Welcome` arrives,
    /// the host's rejection `(code, message)` otherwise. A silent or
    /// unreachable host times out with `ErrorCode::Internal` instead of
    /// hanging the join forever.
    pub async fn wait_handshake(&self, timeout: Duration) -> Result<(), (ErrorCode, String)> {
        let deadline = tokio::time::Instant::now() + timeout;
        loop {
            let outcome = self
                .inner
                .handshake
                .lock()
                .expect("client handshake poisoned")
                .clone();
            if let Some(outcome) = outcome {
                return outcome;
            }
            if tokio::time::Instant::now() >= deadline {
                return Err((
                    ErrorCode::Internal,
                    "timed out joining the room".to_string(),
                ));
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    }
}

async fn run(inner: Arc<ClientInner>) {
    let mut backoff = RECONNECT_BASE_MS;
    loop {
        if inner.shutdown.load(Ordering::SeqCst) {
            break;
        }
        let retry = connect_once(&inner).await;
        if inner.shutdown.load(Ordering::SeqCst) || !retry {
            break;
        }
        // A migrated room has a fresh successor, not a flapping host: retry at
        // once instead of climbing the backoff ladder.
        if inner.take_migrated() {
            backoff = RECONNECT_BASE_MS;
        }
        tokio::time::sleep(Duration::from_millis(backoff)).await;
        backoff = next_backoff(backoff);
    }
    {
        let mut slot = inner.handshake.lock().expect("client handshake poisoned");
        if slot.is_none() {
            *slot = Some(Err((ErrorCode::Internal, "connection closed".to_string())));
        }
    }
    // A detached endpoint has been handed to a successor host session (crash
    // promotion); closing it here would tear that session down.
    if !inner.detached.load(Ordering::SeqCst) {
        inner.endpoint.close().await;
    }
}

/// Freeze a snapshot at the moment of a host change: extrapolate the position
/// to now and clear `is_playing` (lobby.md §14.7 forbids auto-resume).
fn paused_snapshot(state: PlaybackState) -> PlaybackState {
    if !state.is_playing {
        return state;
    }
    let elapsed = (now_ms() as f64 - state.updated_at_mono).max(0.0) / 1000.0;
    PlaybackState {
        position: (state.position + elapsed * state.rate).max(0.0),
        is_playing: false,
        ..state
    }
}

/// Run one connection. Returns `true` when the caller should retry.
impl ClientInner {
    /// Re-target the dial at the room's new host. Refuses a move onto our own
    /// endpoint (the successor never receives one; a stray frame must not make
    /// us dial ourselves).
    fn apply_migration(&self, token: String, endpoint_id: String) {
        let Ok(endpoint_id) = endpoint_id.parse::<EndpointId>() else {
            return;
        };
        if endpoint_id == self.endpoint.id() {
            return;
        }
        let mut config = self.config.lock().expect("client config poisoned");
        config.host_addr = EndpointAddr::new(endpoint_id);
        config.token = token;
        drop(config);
        self.migrated.store(true, Ordering::SeqCst);
    }

    /// Reset the reconnect backoff after a migration: the successor is fresh,
    /// not a flapping host, so retry immediately.
    pub fn take_migrated(&self) -> bool {
        self.migrated.swap(false, Ordering::SeqCst)
    }

    /// Apply a `Welcome`: overwrite the session identity, roster, and plan.
    ///
    /// Runs on every `Welcome` (the first handshake and any resync after the
    /// host came back), always replacing the previous state rather than
    /// merging it, and resolves the first-handshake outcome once.
    fn apply_welcome(
        &self,
        session_id: &str,
        your_peer_id: &str,
        roster: &[PeerInfo],
        media_plan: &[MediaPlanItem],
    ) {
        *self.roster.lock().expect("client roster poisoned") = roster.to_vec();
        *self.plan.lock().expect("client plan poisoned") = media_plan.to_vec();
        *self.session_id.lock().expect("client session poisoned") = Some(session_id.to_string());
        *self.your_peer_id.lock().expect("client peer id poisoned") =
            Some(your_peer_id.to_string());
        let mut slot = self.handshake.lock().expect("client handshake poisoned");
        if slot.is_none() {
            *slot = Some(Ok(()));
        }
    }
}

async fn connect_once(inner: &Arc<ClientInner>) -> bool {
    let host_addr = inner
        .config
        .lock()
        .expect("client config poisoned")
        .host_addr
        .clone();
    let connection = match inner.endpoint.connect(host_addr, ALPN).await {
        Ok(connection) => connection,
        Err(_) => return true,
    };
    let (send, recv) = match connection.open_bi().await {
        Ok(pair) => pair,
        Err(_) => {
            connection.close(0u32.into(), b"no stream");
            return true;
        }
    };
    let (sender, mut reader) = transport::channel(send, recv);

    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<ClientMessage>();
    *inner.out_tx.lock().expect("client outbox poisoned") = Some(out_tx.clone());

    let writer = tokio::spawn(async move {
        let mut sender = sender;
        while let Some(message) = out_rx.recv().await {
            if sender.send(&message).await.is_err() {
                break;
            }
        }
        sender.finish();
    });

    let hello = {
        let config = inner.config.lock().expect("client config poisoned");
        ClientMessage::Hello {
            peer_id: config.peer_id.clone(),
            display_name: config.display_name.clone(),
            token: config.token.clone(),
            anilist_user_id: config.anilist_user_id,
            app_version: config.app_version.clone(),
        }
    };
    let _ = out_tx.send(hello);

    let pinger = {
        let out_tx = out_tx.clone();
        let inner = inner.clone();
        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(Duration::from_millis(PING_INTERVAL_MS));
            ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);
            let mut id = 0u64;
            loop {
                ticker.tick().await;
                if inner.shutdown.load(Ordering::SeqCst) {
                    break;
                }
                id += 1;
                inner.sync.lock().expect("client sync poisoned").on_ping(id);
                if out_tx
                    .send(ClientMessage::TimePing {
                        id,
                        t1: now_ms() as f64,
                    })
                    .is_err()
                {
                    break;
                }
            }
        })
    };

    let retry = loop {
        if inner.shutdown.load(Ordering::SeqCst) {
            break false;
        }
        tokio::select! {
            frame = reader.recv() => {
                match frame {
                    Ok(frame) => {
                        inner.host_last_seen.store(now_ms(), Ordering::Relaxed);
                        if let Ok(message) = frame.server() {
                            // Drop already-applied commands (lobby.md §3.2 revisions).
                            if let ServerMessage::Command { revision, .. } = &message {
                                if *revision <= inner.command_revision.load(Ordering::SeqCst) {
                                    continue;
                                }
                                inner.command_revision.store(*revision, Ordering::SeqCst);
                            }
                            match &message {
                                ServerMessage::Welcome {
                                    roster,
                                    session_id,
                                    media_plan,
                                    your_peer_id,
                                    ..
                                } => {
                                    inner.apply_welcome(
                                        session_id,
                                        your_peer_id,
                                        roster,
                                        media_plan,
                                    );
                                }
                                ServerMessage::Roster { peers } => {
                                    *inner.roster.lock().expect("client roster poisoned") =
                                        peers.clone();
                                }
                                ServerMessage::MediaPlan { items } => {
                                    *inner.plan.lock().expect("client plan poisoned") =
                                        items.clone();
                                }
                                ServerMessage::HostHandover {
                                    session_id,
                                    token,
                                    playback,
                                } => {
                                    *inner.handover.lock().expect("client handover poisoned") =
                                        Some((
                                            session_id.clone(),
                                            token.clone(),
                                            playback.clone(),
                                        ));
                                }
                                ServerMessage::Migrate {
                                    token,
                                    endpoint_id,
                                    ..
                                } => {
                                    inner.apply_migration(token.clone(), endpoint_id.clone());
                                }
                                ServerMessage::WaitingFor { item_id, peer_ids } => {
                                    *inner.waiting.lock().expect("client waiting poisoned") =
                                        if peer_ids.is_empty() {
                                            None
                                        } else {
                                            Some(WaitingFor {
                                                item_id: item_id.clone(),
                                                peer_ids: peer_ids.clone(),
                                            })
                                        };
                                }
                                ServerMessage::ReadyState {
                                    peer_id,
                                    items,
                                    ..
                                } => {
                                    inner
                                        .item_reports
                                        .lock()
                                        .expect("client reports poisoned")
                                        .insert(peer_id.clone(), items.clone());
                                }
                                ServerMessage::PlaybackState {
                                    revision,
                                    media_id,
                                    position,
                                    is_playing,
                                    rate,
                                    updated_at_mono,
                                } => {
                                    inner.sync.lock().expect("client sync poisoned").on_host_state(
                                        PlaybackState {
                                            revision: *revision,
                                            media_id: media_id.clone(),
                                            position: *position,
                                            is_playing: *is_playing,
                                            rate: *rate,
                                            updated_at_mono: *updated_at_mono,
                                        },
                                    );
                                }
                                ServerMessage::TimePong { id, t1, t2 } => {
                                    inner
                                        .sync
                                        .lock()
                                        .expect("client sync poisoned")
                                        .on_pong(*id, *t1, *t2, now_ms() as f64);
                                }
                                ServerMessage::Error { code, message } => {
                                    let mut slot = inner
                                        .handshake
                                        .lock()
                                        .expect("client handshake poisoned");
                                    if slot.is_none() {
                                        *slot = Some(Err((*code, message.clone())));
                                    }
                                }
                                _ => {}
                            }
                            let fatal = matches!(
                                message,
                                ServerMessage::Error { .. } | ServerMessage::Kick { .. }
                            );
                            let bye = matches!(message, ServerMessage::Bye);
                            let _ = inner.events.send(message);
                            if fatal || bye {
                                break false;
                            }
                        }
                    }
                    // A migrated room drops the old connection on purpose: the
                    // guest must re-dial the successor instead of giving up.
                    Err(TransportError::Closed) => {
                        break inner.migrated.load(Ordering::Relaxed)
                    }
                    Err(_) => break true,
                }
            }
            () = inner.shutdown_notify.notified() => break false,
        }
    };

    pinger.abort();
    *inner.out_tx.lock().expect("client outbox poisoned") = None;
    let _ = out_tx.send(ClientMessage::Bye);
    drop(out_tx);
    let _ = tokio::time::timeout(Duration::from_millis(200), writer).await;
    connection.close(0u32.into(), b"bye");
    retry
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::elect::{crash_action, CrashAction};
    use crate::session::host::{HostConfig, HostEvent, HostSession};
    use crate::session::protocol::PlaybackState;

    const TEST_TIMEOUT: Duration = Duration::from_secs(20);

    async fn wait_for<T, F>(rx: &mut broadcast::Receiver<T>, mut pred: F) -> T
    where
        T: Clone,
        F: FnMut(&T) -> bool,
    {
        loop {
            match rx.recv().await {
                Ok(message) if pred(&message) => return message,
                Ok(_) | Err(broadcast::error::RecvError::Lagged(_)) => {}
                Err(broadcast::error::RecvError::Closed) => panic!("event stream closed"),
            }
        }
    }

    async fn wait_until<F: Fn() -> bool>(pred: F) {
        for _ in 0..200 {
            if pred() {
                return;
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
        panic!("condition was not met in time");
    }

    async fn offline_host() -> HostSession {
        let endpoint = transport::bind_offline_endpoint()
            .await
            .expect("host endpoint");
        HostSession::bind(HostConfig::generate("Host".into()), endpoint)
    }

    async fn offline_guest(host: &HostSession, token: String) -> ClientSession {
        let endpoint = transport::bind_offline_endpoint()
            .await
            .expect("guest endpoint");
        ClientSession::connect_with(
            ClientConfig {
                host_addr: transport::loopback_addr(host.endpoint()),
                token,
                peer_id: "guest-1".into(),
                display_name: "Guest".into(),
                anilist_user_id: Some(42),
                app_version: env!("CARGO_PKG_VERSION").into(),
            },
            endpoint,
        )
    }

    #[tokio::test]
    async fn handover_moves_the_room_and_the_guest_retargets_the_dial() {
        let host = offline_host().await;
        host.publish_playback(PlaybackState {
            revision: 3,
            media_id: "ep1".into(),
            position: 42.5,
            is_playing: false,
            rate: 1.0,
            updated_at_mono: 0.0,
        });
        let guest = offline_guest(&host, host.ticket().token).await;
        let mut rx = guest.subscribe();
        wait_for(&mut rx, |m| matches!(m, ServerMessage::Welcome { .. })).await;
        wait_until(|| host.peer_count() == 1).await;

        // The host asks the guest to take the room over; the offer carries the
        // room identity and the playback snapshot position/pause.
        let waiter = host.begin_handover("guest-1").expect("begin handover");
        let offer = wait_for(&mut rx, |m| matches!(m, ServerMessage::HostHandover { .. })).await;
        let ServerMessage::HostHandover {
            session_id,
            token,
            playback,
        } = offer
        else {
            unreachable!("filtered above");
        };
        assert_eq!(session_id, host.session_id());
        assert_eq!(token, host.ticket().token);
        assert_eq!(playback.as_ref().map(|state| state.position), Some(42.5));
        let stored = guest.take_handover().expect("pending handover");
        assert_eq!(stored.0, session_id);
        assert_eq!(stored.2, playback);
        // A second handover cannot start while one is pending.
        assert!(host.begin_handover("guest-1").is_err());

        // The successor binds its own endpoint on the same room identity...
        let endpoint = transport::bind_offline_endpoint().await.expect("endpoint");
        let new_host = HostSession::bind(
            HostConfig {
                session_id,
                token,
                host_peer_id: "guest-1".into(),
                display_name: "Guest".into(),
                max_peers: crate::session::host::DEFAULT_MAX_PEERS,
            },
            endpoint,
        );
        let new_endpoint_id = new_host.endpoint().id().to_string();
        guest.handover_ready(&new_endpoint_id).expect("ready");
        let handover = tokio::time::timeout(TEST_TIMEOUT, waiter)
            .await
            .expect("handover timed out")
            .expect("handover dropped")
            .expect("handover failed");
        assert_eq!(handover.host_id, "guest-1");
        assert_eq!(handover.endpoint_id, new_endpoint_id);

        // Every guest learns where the room moved; the old host then stops.
        host.finish_handover(&handover).await;
        let migrate = wait_for(&mut rx, |m| matches!(m, ServerMessage::Migrate { .. })).await;
        match migrate {
            ServerMessage::Migrate {
                session_id: moved_session,
                token: moved_token,
                endpoint_id: moved_endpoint,
                host_id,
            } => {
                assert_eq!(moved_session, host.session_id());
                assert_eq!(moved_token, host.ticket().token);
                assert_eq!(moved_endpoint, new_endpoint_id);
                assert_eq!(host_id, "guest-1");
            }
            _ => unreachable!("filtered above"),
        }
        // The old host stopped hosting: no connected peers remain.
        assert_eq!(host.peer_count(), 0);

        guest.leave().await;
        new_host.stop().await;
    }

    #[test]
    fn backoff_doubles_and_clamps() {
        assert_eq!(next_backoff(RECONNECT_BASE_MS), 1000);
        assert_eq!(next_backoff(1000), 2000);
        assert_eq!(next_backoff(8000), RECONNECT_MAX_MS);
        assert_eq!(next_backoff(RECONNECT_MAX_MS), RECONNECT_MAX_MS);
    }

    #[test]
    fn client_config_clones_its_fields() {
        let config = ClientConfig {
            host_addr: EndpointAddr::new(iroh::SecretKey::generate().public()),
            token: "t".into(),
            peer_id: "g".into(),
            display_name: "Guest".into(),
            anilist_user_id: Some(7),
            app_version: env!("CARGO_PKG_VERSION").into(),
        };
        let clone = config.clone();
        assert_eq!(clone.display_name, "Guest");
        assert_eq!(clone.anilist_user_id, Some(7));
        assert_eq!(config.peer_id, "g");
    }

    #[tokio::test]
    async fn loopback_join_chat_ping_and_leave() {
        let result = tokio::time::timeout(TEST_TIMEOUT, async {
            let host = offline_host().await;
            let mut host_events = host.subscribe();
            let guest = offline_guest(&host, host.ticket().token).await;
            let mut rx = guest.subscribe();

            let welcome = wait_for(&mut rx, |m| matches!(m, ServerMessage::Welcome { .. })).await;
            match welcome {
                ServerMessage::Welcome {
                    your_peer_id,
                    roster,
                    ..
                } => {
                    assert_eq!(your_peer_id, "guest-1");
                    assert_eq!(roster.len(), 2);
                    assert!(roster
                        .iter()
                        .any(|peer| peer.role == crate::session::protocol::Role::Host));
                }
                _ => unreachable!(),
            }

            wait_until(|| host.peer_count() == 1).await;

            // Guest -> host chat is re-broadcast to everyone.
            guest
                .send(ClientMessage::Chat {
                    id: "m1".into(),
                    text: "hi".into(),
                    reply_to: None,
                    attachment: None,
                })
                .expect("guest send");
            let echoed = wait_for(&mut rx, |m| matches!(m, ServerMessage::Chat { .. })).await;
            assert!(matches!(echoed, ServerMessage::Chat { text, .. } if text == "hi"));
            let host_chat =
                wait_for(&mut host_events, |m| matches!(m, HostEvent::Chat { .. })).await;
            assert!(matches!(host_chat, HostEvent::Chat { message, .. } if message.text == "hi"));

            // Host -> guest chat.
            host.add_chat("m1".into(), "Host".into(), "hello".into(), None, None);
            let hosted = wait_for(&mut rx, |m| matches!(m, ServerMessage::Chat { .. })).await;
            assert!(matches!(hosted, ServerMessage::Chat { text, .. } if text == "hello"));

            // Heartbeat keeps the host live for the guest.
            let pong = wait_for(&mut rx, |m| matches!(m, ServerMessage::TimePong { .. })).await;
            assert!(matches!(pong, ServerMessage::TimePong { .. }));
            assert!(!guest.host_stale());

            guest.leave().await;
            wait_until(|| host.peer_count() == 0).await;
            host.stop().await;
        })
        .await;
        result.expect("loopback session test must finish before the timeout");
    }

    #[tokio::test]
    async fn loopback_control_relay_and_track_sync() {
        let result = tokio::time::timeout(TEST_TIMEOUT, async {
            let host = offline_host().await;
            let mut host_events = host.subscribe();
            let guest = offline_guest(&host, host.ticket().token).await;
            let mut rx = guest.subscribe();
            wait_for(&mut rx, |m| matches!(m, ServerMessage::Welcome { .. })).await;
            wait_until(|| host.peer_count() == 1).await;

            // Host publishes a snapshot; every guest receives it.
            host.publish_playback(PlaybackState {
                revision: 1,
                media_id: "ep1".into(),
                position: 12.0,
                is_playing: true,
                rate: 1.0,
                updated_at_mono: 0.0,
            });
            let playback = wait_for(&mut rx, |m| {
                matches!(m, ServerMessage::PlaybackState { .. })
            })
            .await;
            assert!(matches!(
                playback,
                ServerMessage::PlaybackState {
                    revision: 1,
                    position,
                    ..
                } if (position - 12.0).abs() < 1e-9
            ));

            // Guest requests control; the host relays it and sees its own event.
            guest
                .request_control(ControlAction::Pause)
                .expect("request control");
            let command = wait_for(&mut rx, |m| matches!(m, ServerMessage::Command { .. })).await;
            assert!(matches!(
                command,
                ServerMessage::Command {
                    revision: 1,
                    action: ControlAction::Pause
                }
            ));
            let host_control =
                wait_for(&mut host_events, |m| matches!(m, HostEvent::Control { .. })).await;
            assert!(matches!(
                host_control,
                HostEvent::Control {
                    revision: 1,
                    action: ControlAction::Pause
                }
            ));

            // Host relays another control; the revision increments.
            host.relay_control(ControlAction::Play);
            let command = wait_for(&mut rx, |m| matches!(m, ServerMessage::Command { .. })).await;
            assert!(matches!(
                command,
                ServerMessage::Command {
                    revision: 2,
                    action: ControlAction::Play
                }
            ));

            // Guest picks a track; the host stores and re-broadcasts it.
            guest
                .pick_track(TrackState {
                    media_id: "ep1".into(),
                    audio: Some("jpn".into()),
                    sub: Some("eng".into()),
                    audio_delay: 0.0,
                    sub_delay: 1.5,
                })
                .expect("pick track");
            let track = wait_for(&mut rx, |m| matches!(m, ServerMessage::TrackSync { .. })).await;
            assert!(matches!(
                track,
                ServerMessage::TrackSync { sub_delay, .. } if (sub_delay - 1.5).abs() < 1e-9
            ));
            wait_until(|| host.last_track().is_some()).await;
            assert_eq!(
                host.last_track().and_then(|track| track.audio),
                Some("jpn".into())
            );

            // Guest asks for the current tracks; the host replies unicast.
            guest.request_track_sync().expect("request tracks");
            let track = wait_for(&mut rx, |m| matches!(m, ServerMessage::TrackSync { .. })).await;
            assert!(matches!(
                track,
                ServerMessage::TrackSync { audio: Some(audio), .. } if audio == "jpn"
            ));

            guest.leave().await;
            host.stop().await;
        })
        .await;
        result.expect("control loopback test must finish before the timeout");
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

    fn report(id: &str, present: bool, verified: bool) -> ItemReport {
        ItemReport {
            item_id: id.into(),
            present,
            verified,
        }
    }

    #[tokio::test]
    async fn loopback_plan_broadcast_and_ready_gate() {
        let result = tokio::time::timeout(TEST_TIMEOUT, async {
            let host = offline_host().await;
            let guest = offline_guest(&host, host.ticket().token).await;
            let mut rx = guest.subscribe();
            wait_for(&mut rx, |m| matches!(m, ServerMessage::Welcome { .. })).await;
            wait_until(|| host.peer_count() == 1).await;
            assert!(guest.plan().is_empty());

            // The host sets a plan; the guest caches the broadcast.
            host.set_plan(
                vec![plan_item("a"), plan_item("b")],
                std::collections::HashMap::new(),
            );
            let plan = wait_for(&mut rx, |m| matches!(m, ServerMessage::MediaPlan { .. })).await;
            assert!(matches!(plan, ServerMessage::MediaPlan { items } if items.len() == 2));
            wait_until(|| guest.plan().len() == 2).await;

            // A guest that has not reported keeps the gate closed.
            assert!(!host.ready_summary().all_ready);

            // Full readiness opens the gate and marks the roster entry ready.
            guest
                .set_ready(true, vec![report("a", true, true), report("b", true, true)])
                .expect("report ready");
            let ready = wait_for(&mut rx, |m| matches!(m, ServerMessage::ReadyState { .. })).await;
            assert!(matches!(
                ready,
                ServerMessage::ReadyState { ready: true, .. }
            ));
            wait_until(|| host.ready_summary().all_ready).await;
            wait_until(|| {
                host.roster()
                    .iter()
                    .any(|peer| peer.peer_id == "guest-1" && peer.ready)
            })
            .await;

            // A partial report closes it again (every item must be verified).
            guest
                .set_ready(true, vec![report("a", true, true)])
                .expect("partial report");
            wait_until(|| !host.ready_summary().all_ready).await;

            guest.leave().await;
            host.stop().await;
        })
        .await;
        result.expect("plan/gate loopback test must finish before the timeout");
    }

    #[tokio::test]
    async fn loopback_start_roles_and_waiting() {
        let result = tokio::time::timeout(TEST_TIMEOUT, async {
            let host = offline_host().await;
            let guest = offline_guest(&host, host.ticket().token).await;
            let mut rx = guest.subscribe();
            wait_for(&mut rx, |m| matches!(m, ServerMessage::Welcome { .. })).await;
            wait_until(|| host.peer_count() == 1).await;

            let mut paths = std::collections::HashMap::new();
            paths.insert("a".to_string(), "C:/a.mkv".to_string());
            host.set_plan(vec![plan_item("a")], paths);
            wait_until(|| guest.plan().len() == 1).await;

            // A viewer's start request is ignored; the room stays idle.
            guest.request_start("a").expect("request start");
            assert!(guest.waiting().is_none());

            // Promotion opens start rights for the moderator.
            host.set_role("guest-1", crate::session::protocol::Role::Moderator)
                .expect("promote");
            wait_until(|| {
                host.roster().iter().any(|peer| {
                    peer.peer_id == "guest-1"
                        && peer.role == crate::session::protocol::Role::Moderator
                })
            })
            .await;

            // The moderator lacks the file, so the start is held.
            guest.request_start("a").expect("request start");
            let waiting =
                wait_for(&mut rx, |m| matches!(m, ServerMessage::WaitingFor { .. })).await;
            assert!(matches!(
                waiting,
                ServerMessage::WaitingFor { ref peer_ids, .. }
                    if peer_ids == &vec!["guest-1".to_string()]
            ));
            wait_until(|| guest.waiting().is_some()).await;

            // Reporting the file clears the wait but does not auto-start.
            guest
                .set_ready(true, vec![report("a", true, true)])
                .expect("report");
            wait_for(
                &mut rx,
                |m| matches!(m, ServerMessage::WaitingFor { peer_ids, .. } if peer_ids.is_empty()),
            )
            .await;
            wait_until(|| guest.waiting().is_none()).await;
            // The held start published a paused hold, not a playing item.
            assert_ne!(
                host.last_playback().map(|state| state.is_playing),
                Some(true)
            );

            guest.leave().await;
            host.stop().await;
        })
        .await;
        result.expect("start/roles loopback test must finish before the timeout");
    }

    #[tokio::test]
    async fn bad_token_is_rejected() {
        let result = tokio::time::timeout(TEST_TIMEOUT, async {
            let host = offline_host().await;
            let guest = offline_guest(&host, "wrong-token".into()).await;
            let mut rx = guest.subscribe();

            let error = wait_for(&mut rx, |m| matches!(m, ServerMessage::Error { .. })).await;
            match error {
                ServerMessage::Error { code, .. } => {
                    assert_eq!(code, crate::session::protocol::ErrorCode::BadToken);
                }
                _ => unreachable!(),
            }
            assert_eq!(host.peer_count(), 0);
            host.stop().await;
        })
        .await;
        result.expect("bad token test must finish before the timeout");
    }

    #[tokio::test]
    async fn wrong_app_version_is_rejected() {
        let result = tokio::time::timeout(TEST_TIMEOUT, async {
            let host = offline_host().await;
            let endpoint = transport::bind_offline_endpoint()
                .await
                .expect("guest endpoint");
            let guest = ClientSession::connect_with(
                ClientConfig {
                    host_addr: transport::loopback_addr(host.endpoint()),
                    token: host.ticket().token,
                    peer_id: "guest-1".into(),
                    display_name: "Guest".into(),
                    anilist_user_id: None,
                    app_version: "0.0.0-other".into(),
                },
                endpoint,
            );

            let (code, message) = guest
                .wait_handshake(Duration::from_secs(5))
                .await
                .expect_err("a foreign version must be refused");
            assert_eq!(code, ErrorCode::BadVersion);
            assert!(message.contains("app version mismatch"), "{message}");
            assert_eq!(host.peer_count(), 0);

            guest.leave().await;
            host.stop().await;
        })
        .await;
        result.expect("version mismatch test must finish before the timeout");
    }

    #[tokio::test]
    async fn typing_relays_to_the_other_peers_and_the_host_ui() {
        let result = tokio::time::timeout(TEST_TIMEOUT, async {
            let host = offline_host().await;
            let guest_a = offline_guest(&host, host.ticket().token).await;
            let mut rx_a = guest_a.subscribe();
            wait_for(&mut rx_a, |m| matches!(m, ServerMessage::Welcome { .. })).await;
            let mut host_rx = host.subscribe();

            let endpoint = transport::bind_offline_endpoint()
                .await
                .expect("guest endpoint");
            let guest_b = ClientSession::connect_with(
                ClientConfig {
                    host_addr: transport::loopback_addr(host.endpoint()),
                    token: host.ticket().token,
                    peer_id: "guest-2".into(),
                    display_name: "Second".into(),
                    anilist_user_id: None,
                    app_version: env!("CARGO_PKG_VERSION").into(),
                },
                endpoint,
            );
            let mut rx_b = guest_b.subscribe();
            wait_for(&mut rx_b, |m| matches!(m, ServerMessage::Welcome { .. })).await;
            wait_until(|| host.peer_count() == 2).await;

            guest_a
                .send(ClientMessage::Typing { active: true })
                .expect("typing frame");

            // The other guest sees the frame under the sender's peer id...
            let relayed = wait_for(&mut rx_b, |m| matches!(m, ServerMessage::Typing { .. })).await;
            let ServerMessage::Typing { peer_id, active } = relayed else {
                unreachable!("filtered above");
            };
            assert_eq!(peer_id, "guest-1");
            assert!(active);

            // ...and the host's own UI hears it for its typing line.
            let event = wait_for(&mut host_rx, |e| matches!(e, HostEvent::Typing { .. })).await;
            let HostEvent::Typing { peer_id, active } = event else {
                unreachable!("filtered above");
            };
            assert_eq!(peer_id, "guest-1");
            assert!(active);

            guest_a.leave().await;
            guest_b.leave().await;
            host.stop().await;
        })
        .await;
        result.expect("typing relay test must finish before the timeout");
    }

    #[tokio::test]
    async fn loopback_sync_cold_start_offset_and_restart_latch() {
        let result = tokio::time::timeout(TEST_TIMEOUT, async {
            let host = offline_host().await;
            let guest = offline_guest(&host, host.ticket().token).await;
            let mut rx = guest.subscribe();
            wait_for(&mut rx, |m| matches!(m, ServerMessage::Welcome { .. })).await;
            wait_until(|| host.peer_count() == 1).await;

            // Before any host snapshot the guest cannot position itself.
            let cold = guest.sample_sync(0.0, None);
            assert!(!cold.have_snapshot);
            assert!(!cold.awaiting_restart);

            // The manual release offset is stored; non-finite values keep it.
            assert!((guest.set_sync_offset(750.0) - 750.0).abs() < 1e-9);
            assert!((guest.set_sync_offset(f64::NAN) - 750.0).abs() < 1e-9);
            assert!((guest.sample_sync(0.0, None).offset_ms - 750.0).abs() < 1e-9);

            // The host publishes an authoritative snapshot.
            host.publish_playback(PlaybackState {
                revision: 1,
                media_id: "ep1".into(),
                position: 30.0,
                is_playing: true,
                rate: 1.0,
                updated_at_mono: 0.0,
            });
            wait_for(&mut rx, |m| {
                matches!(m, ServerMessage::PlaybackState { .. })
            })
            .await;

            // Once the clock estimate lands the engine starts evaluating drift.
            wait_until(|| guest.sample_sync(0.0, Some("ep1".into())).drift_ms < -1000.0).await;

            // A huge standing drift latches a seek resync.
            wait_until(|| {
                (0..6).any(|_| guest.sample_sync(0.0, Some("ep1".into())).awaiting_restart)
            })
            .await;
            assert!(guest.sample_sync(0.0, Some("ep1".into())).awaiting_restart);

            // ...until the player confirms it restarted after the seek (P9 fix).
            guest.mark_restarted();
            assert!(!guest.sample_sync(0.0, Some("ep1".into())).awaiting_restart);

            guest.leave().await;
            host.stop().await;
        })
        .await;
        result.expect("sync loopback test must finish before the timeout");
    }

    #[tokio::test]
    async fn welcome_overwrites_client_state_on_resync() {
        let endpoint = transport::bind_offline_endpoint()
            .await
            .expect("guest endpoint");
        let addr = EndpointAddr::new(endpoint.id());
        let client = ClientSession::connect_with(
            ClientConfig {
                host_addr: addr,
                token: "tok".into(),
                peer_id: "guest-1".into(),
                display_name: "Guest".into(),
                anilist_user_id: None,
                app_version: env!("CARGO_PKG_VERSION").into(),
            },
            endpoint,
        );
        let left_peer = PeerInfo {
            peer_id: "guest-2".into(),
            display_name: "Gone".into(),
            avatar_seed: "guest-2".into(),
            anilist_user_id: None,
            role: Role::Viewer,
            connection: crate::session::protocol::ConnectionState::Disconnected,
            ready: false,
            drift_ms: 0.0,
            rtt_ms: 0.0,
            buffering: false,
            left: true,
            endpoint_id: "end-guest-2".into(),
        };
        client
            .inner
            .apply_welcome("s1", "guest-1", &[left_peer], &[]);
        assert_eq!(client.session_id().as_deref(), Some("s1"));
        assert_eq!(client.roster().len(), 1);
        assert!(client.roster()[0].left);

        let item = MediaPlanItem {
            item_id: "i1".into(),
            order: 0,
            title: "i1".into(),
            identity: crate::session::protocol::MediaIdentity {
                sha256: "0".repeat(64),
                size: 1,
                duration: 1.0,
                video: None,
            },
            sources: Vec::new(),
        };
        // A resync Welcome replaces the previous state instead of merging.
        client
            .inner
            .apply_welcome("s2", "guest-1", &[], std::slice::from_ref(&item));
        assert_eq!(client.session_id().as_deref(), Some("s2"));
        assert!(client.roster().is_empty());
        assert_eq!(client.plan().len(), 1);

        client.leave().await;
    }

    /// End to end crash recovery: the host dies, both guests run the same
    /// election on the same replicated roster, the winner takes the room over
    /// on its own endpoint (paused), and the follower rejoins it — no new lobby.
    #[tokio::test]
    async fn crash_promotion_hands_the_room_over_and_keeps_it_paused() {
        let result = tokio::time::timeout(TEST_TIMEOUT, async {
            let host = offline_host().await;
            let guest_a = offline_guest(&host, host.ticket().token).await;
            let mut rx_a = guest_a.subscribe();
            wait_for(&mut rx_a, |m| matches!(m, ServerMessage::Welcome { .. })).await;

            let endpoint_b = transport::bind_offline_endpoint()
                .await
                .expect("guest b endpoint");
            let guest_b = ClientSession::connect_with(
                ClientConfig {
                    host_addr: transport::loopback_addr(host.endpoint()),
                    token: host.ticket().token,
                    peer_id: "guest-2".into(),
                    display_name: "Second".into(),
                    anilist_user_id: None,
                    app_version: env!("CARGO_PKG_VERSION").into(),
                },
                endpoint_b,
            );
            let mut rx_b = guest_b.subscribe();
            wait_for(&mut rx_b, |m| matches!(m, ServerMessage::Welcome { .. })).await;
            wait_until(|| host.peer_count() == 2).await;

            // The host published a playing snapshot: the room has a position.
            host.publish_playback(PlaybackState {
                revision: 7,
                media_id: "ep1".into(),
                position: 12.0,
                is_playing: true,
                rate: 1.0,
                updated_at_mono: now_ms() as f64,
            });
            wait_for(&mut rx_a, |m| {
                matches!(m, ServerMessage::PlaybackState { .. })
            })
            .await;
            wait_until(|| guest_a.last_playback().is_some()).await;

            // The host dies; both guests see it once the grace window passes.
            host.stop().await;
            guest_a.mark_host_gone();
            guest_b.mark_host_gone();

            // Both name the same successor from the same replicated roster.
            let winner_endpoint = guest_a
                .roster()
                .into_iter()
                .find(|peer| peer.peer_id == "guest-1")
                .expect("guest-1 in the roster")
                .endpoint_id;
            assert!(!winner_endpoint.is_empty());
            assert_eq!(
                crash_action(true, &guest_a.roster(), Some("guest-1")),
                CrashAction::Promote
            );
            assert_eq!(
                crash_action(true, &guest_b.roster(), Some("guest-2")),
                CrashAction::Follow {
                    peer_id: "guest-1".into(),
                    endpoint_id: winner_endpoint.clone(),
                }
            );

            // The elected peer takes over on its own endpoint...
            let session = guest_a
                .take_over(std::collections::HashMap::new())
                .expect("take over");
            assert_eq!(session.session_id(), host.session_id());
            assert_eq!(session.host_peer_id(), "guest-1");
            assert_eq!(session.endpoint().id().to_string(), winner_endpoint);
            // ...paused, at the extrapolated position (never auto-resumed).
            let playback = session.last_playback().expect("carried playback");
            assert!(!playback.is_playing);
            assert!(
                (playback.position - 12.0).abs() < 2.0,
                "{} ",
                playback.position
            );
            // The revision is seeded above the carried one so guests accept it.
            let next = session.publish_position("ep1".into(), playback.position, false, 1.0);
            assert!(next.revision > 7, "revision must not roll back");

            // The follower retargets and rejoins the successor's room, which
            // carries the same session id (no new lobby).
            assert!(guest_b.retarget_addr(transport::loopback_addr(session.endpoint())));
            let welcome = wait_for(&mut rx_b, |m| matches!(m, ServerMessage::Welcome { .. })).await;
            assert!(matches!(
                welcome,
                ServerMessage::Welcome { session_id, .. } if session_id == host.session_id()
            ));
            wait_until(|| session.peer_count() == 1).await;

            guest_b.leave().await;
            session.stop().await;
        })
        .await;
        result.expect("crash promotion test must finish before the timeout");
    }
}
