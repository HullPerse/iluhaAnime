//! Tauri commands: identity probing, session state, transport, and control.
//!
//! P3 wires the player window to the session runtime: it publishes snapshots,
//! relays control, and forwards host/guest playback traffic as Tauri events.

use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;

use iroh::{EndpointAddr, EndpointId};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::session::client::{ClientConfig, ClientSession};
use crate::session::elect::{crash_action, CrashAction};
use crate::session::host::{HostConfig, HostEvent, HostSession, DEFAULT_MAX_PEERS};
use crate::session::media::{build_identity, find_folder_match};
use crate::session::protocol::{
    chat_id_or_generate, sanitize_chat_text, sanitize_chat_upload, ChatAttachment, ChatMessage,
    ChatUpload, ClientMessage, ControlAction, ItemReport, MediaIdentity, MediaPlanItem,
    PlaybackState, Role, ServerMessage, SourceInfo, WaitingFor, CHAT_ID_MAX_CHARS,
};
use crate::session::state::{
    random_hex, validate_media_id, PeerReport, SessionHost, SessionRuntime, SessionSnapshot,
    SessionStatus, SessionTicket, TrackState,
};
use crate::session::sync::SyncSample;
use base64::{engine::general_purpose::STANDARD, Engine as _};

/// Default cap for hashing media files (4 GiB).
pub const DEFAULT_MEDIA_HASH_CAP_BYTES: u64 = 4 * 1024 * 1024 * 1024;

/// How long the outgoing host waits for its successor to start listening.
const HANDOVER_TIMEOUT: Duration = Duration::from_secs(10);

/// How long `session_join` waits for the host to accept or reject the hello.
const JOIN_HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(15);
/// Grace for the successor's `HandoverReady` frame to reach the wire before
/// the runtime swap tears its guest connection down.
const HANDOVER_FLUSH_MS: u64 = 150;

/// How often a guest checks whether the host has gone silent past the grace
/// window and a crash election must run (lobby.md §14.7).
const PROMOTION_TICK: Duration = Duration::from_secs(1);

/// Tauri event: the host's authoritative playback snapshot.
pub const EVENT_SESSION_PLAYBACK: &str = "session-playback";
/// Tauri event: a control action the local player must apply.
pub const EVENT_SESSION_COMMAND: &str = "session-command";
/// Tauri event: the room's track selection changed.
pub const EVENT_SESSION_TRACK: &str = "session-track";
/// Tauri event: the participant roster changed.
pub const EVENT_SESSION_ROSTER: &str = "session-roster";
/// Tauri event: the room started a plan item (payload [`StartItemPayload`]).
pub const EVENT_SESSION_START: &str = "session-start-item";
/// Tauri event: the room's held start changed (payload [`WaitingFor`]).
pub const EVENT_SESSION_WAITING: &str = "session-waiting";
/// Tauri event: the room moved to a new host (payload: its peer id); the
/// guest dials the successor on its own.
pub const EVENT_SESSION_MIGRATE: &str = "session-migrate";
/// Tauri event: the outgoing host chose this guest to take the room over.
pub const EVENT_SESSION_HOST_HANDOVER: &str = "session-host-handover";
/// Tauri event: a peer started or stopped typing (payload [`TypingPayload`]).
pub const EVENT_SESSION_TYPING: &str = "session-typing";

/// Payload for [`EVENT_SESSION_TYPING`]: which peer and in which state.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TypingPayload {
    peer_id: String,
    active: bool,
}

/// Payload for [`EVENT_SESSION_COMMAND`].
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CommandPayload {
    revision: u64,
    action: ControlAction,
}

/// Payload for [`EVENT_SESSION_START`].
///
/// `path` is the host-local file for the item, present only on the host.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StartItemPayload {
    item_id: String,
    path: Option<String>,
}

/// Probe a local file and return its content identity.
///
/// Hashing runs on a blocking thread so the async runtime stays responsive.
#[tauri::command]
pub async fn media_identity(app: AppHandle, path: String) -> Result<MediaIdentity, String> {
    let path_buf = PathBuf::from(path);
    tauri::async_runtime::spawn_blocking(move || {
        build_identity(&path_buf, Some(DEFAULT_MEDIA_HASH_CAP_BYTES), &app)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Current host session snapshot.
#[tauri::command]
pub fn session_state(host: State<'_, SessionHost>) -> Result<SessionSnapshot, String> {
    Ok(host.snapshot())
}

/// Replace the session playlist (validated: unique non-empty ids,
/// non-empty titles). Broadcasts the new plan when hosting.
///
/// `paths` is the host-local item id → file path map: it is stored on the host
/// and is never sent to guests.
#[tauri::command]
pub fn session_set_playlist(
    host: State<'_, SessionHost>,
    items: Vec<MediaPlanItem>,
    paths: HashMap<String, String>,
) -> Result<(), String> {
    host.set_playlist(items.clone(), paths.clone())?;
    if let Some(session) = host.host_session() {
        session.set_plan(items, paths);
    }
    Ok(())
}

/// Host/moderator: start a plan item, or hold the start while peers lack it.
///
/// The local player is opened through [`EVENT_SESSION_START`] on the host; a
/// guest routes the same intent through `RequestStart` and is driven by the
/// host's `Load` command instead.
#[tauri::command]
pub fn session_start_item(host: State<'_, SessionHost>, item_id: String) -> Result<(), String> {
    if let Some(client) = host.client_session() {
        return client.request_start(&item_id);
    }
    host.start_item(&item_id).map(|_| ())
}

/// Host: promote or demote a guest.
#[tauri::command]
pub fn session_set_role(
    host: State<'_, SessionHost>,
    peer_id: String,
    role: Role,
) -> Result<(), String> {
    host.set_role(&peer_id, role)
}

/// The deterministic crash successor from the current roster, or `None` when
/// no peer can take the room. Every peer computes the same answer from the
/// replicated roster, so the election itself needs no negotiation
/// (lobby.md §14.7).
#[tauri::command]
pub fn session_elect_host(host: State<'_, SessionHost>) -> Result<Option<String>, String> {
    let roster = host.client_session().map_or_else(
        || {
            host.host_session()
                .map_or_else(|| host.peers(), |session| session.roster())
        },
        |client| client.roster(),
    );
    Ok(crate::session::elect::elect_host(&roster))
}

/// Host: append a source to a plan item and broadcast the updated plan.
#[tauri::command]
pub fn session_add_source(
    host: State<'_, SessionHost>,
    item_id: String,
    source: SourceInfo,
) -> Result<(), String> {
    host.add_source(&item_id, source)?;
    sync_host_plan(&host);
    Ok(())
}

/// Host: remove a source from a plan item and broadcast the updated plan.
#[tauri::command]
pub fn session_remove_source(
    host: State<'_, SessionHost>,
    item_id: String,
    source_id: String,
) -> Result<(), String> {
    host.remove_source(&item_id, &source_id)?;
    sync_host_plan(&host);
    Ok(())
}

/// Guest: report readiness and per-item presence to the host (ready gate, D4).
#[tauri::command]
pub fn session_set_ready(
    host: State<'_, SessionHost>,
    ready: bool,
    items: Vec<ItemReport>,
) -> Result<(), String> {
    if let Some(client) = host.client_session() {
        return client.set_ready(ready, items);
    }
    if host.host_session().is_some() {
        // The host owns the media and is always ready.
        return Ok(());
    }
    Err("no active session".to_string())
}

/// Guest: find the exact local copy of a plan item inside a chosen folder (D5).
///
/// The hosted plan carries each item's identity, so the guest points at a
/// folder and the hash search runs on a blocking thread. Returns the matched
/// file path, or `None` when the folder holds no byte-exact copy.
#[tauri::command]
pub async fn session_match_folder(
    host: State<'_, SessionHost>,
    item_id: String,
    folder: String,
) -> Result<Option<String>, String> {
    let identity = host
        .snapshot()
        .plan
        .into_iter()
        .find(|item| item.item_id == item_id)
        .ok_or_else(|| "no such plan item".to_string())?
        .identity;
    tauri::async_runtime::spawn_blocking(move || {
        find_folder_match(&identity, &PathBuf::from(folder))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Push the current media plan into a running host session (broadcasts it).
fn sync_host_plan(host: &SessionHost) {
    if let Some(session) = host.host_session() {
        session.set_plan(host.snapshot().plan, host.plan_paths());
    }
}

/// Start hosting a watch party and return the join ticket.
#[tauri::command]
pub async fn session_create(
    app: AppHandle,
    host: State<'_, SessionHost>,
    display_name: String,
) -> Result<SessionTicket, String> {
    if host.has_runtime() {
        return Err("a session is already active".to_string());
    }
    let session = HostSession::start(HostConfig::generate(display_name)).await?;
    let ticket = session.ticket();
    session.set_plan(host.snapshot().plan, host.plan_paths());
    spawn_host_pump(app, host.inner().clone(), session.clone());
    host.set_runtime(SessionRuntime::Host(session));
    Ok(ticket)
}

/// Join a watch party from a ticket.
#[tauri::command]
pub async fn session_join(
    app: AppHandle,
    host: State<'_, SessionHost>,
    ticket: SessionTicket,
    display_name: String,
    anilist_user_id: Option<u64>,
    peer_id: Option<String>,
) -> Result<SessionStatus, String> {
    if host.has_runtime() {
        return Err("a session is already active".to_string());
    }
    join_ticket(app, host, ticket, display_name, anilist_user_id, peer_id).await
}

/// A client-supplied peer id is accepted only when it is a bounded token; an
/// invalid or missing one becomes a fresh random id.
fn sanitize_peer_id(peer_id: Option<String>) -> String {
    let ok = peer_id.as_ref().is_some_and(|id| {
        !id.is_empty()
            && id.len() <= 64
            && id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    });
    match (ok, peer_id) {
        (true, Some(id)) => id,
        _ => random_hex(8),
    }
}

/// Dial `ticket` and install the guest runtime (shared by join and the old
/// host's rejoin after a transfer).
async fn join_ticket(
    app: AppHandle,
    host: State<'_, SessionHost>,
    ticket: SessionTicket,
    display_name: String,
    anilist_user_id: Option<u64>,
    peer_id: Option<String>,
) -> Result<SessionStatus, String> {
    let endpoint_id = ticket
        .endpoint_id
        .parse::<EndpointId>()
        .map_err(|error| format!("invalid endpoint id: {error}"))?;
    let config = ClientConfig {
        host_addr: EndpointAddr::new(endpoint_id),
        token: ticket.token.clone(),
        peer_id: sanitize_peer_id(peer_id),
        display_name,
        anilist_user_id,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    };
    let client = ClientSession::join(config).await?;
    // The handshake decides the join: a rejected peer (bad token, wrong app
    // version) must fail the command instead of showing an empty room.
    if let Err((_, message)) = client.wait_handshake(JOIN_HANDSHAKE_TIMEOUT).await {
        client.leave().await;
        return Err(message);
    }
    spawn_guest_pump(app, host.inner().clone(), client.clone());
    host.set_runtime(SessionRuntime::Guest(client));
    Ok(host.status())
}

/// Host: hand the room over to `peer_id`, announce the move to every guest,
/// then rejoin the migrated room as a viewer.
///
/// Same room id and token travel across, so the room code still works; only
/// the endpoint changes (the successor binds its own).
#[tauri::command]
pub async fn session_transfer_host(
    app: AppHandle,
    host: State<'_, SessionHost>,
    peer_id: String,
    display_name: String,
    anilist_user_id: Option<u64>,
) -> Result<SessionStatus, String> {
    let session = host
        .host_session()
        .ok_or_else(|| "not hosting".to_string())?;
    let ticket = session.ticket();
    let rx = session.begin_handover(&peer_id)?;
    let handover = tokio::time::timeout(HANDOVER_TIMEOUT, rx)
        .await
        .map_err(|_| "the successor did not take over in time".to_string())?
        .map_err(|_| "the handover was dropped".to_string())??;
    // Broadcast `Migrate`, let the frames flush, then stop hosting.
    session.finish_handover(&handover).await;
    // Drop the stopped host runtime without a second `stop()`.
    host.take_runtime();
    // Rejoin under a fresh peer id: the outgoing host identity stays with the
    // room (`host_id` now points at the successor), so the old host arrives as
    // an ordinary viewer.
    let new_ticket = SessionTicket {
        session_id: ticket.session_id,
        token: ticket.token,
        endpoint_id: handover.endpoint_id,
    };
    join_ticket(app, host, new_ticket, display_name, anilist_user_id, None).await
}

/// Guest: accept the outgoing host's handover and start hosting the room.
///
/// `paths` is this instance's local item id → file path map: as the new host
/// it now owns the host-local paths (they are never broadcast).
#[tauri::command]
pub async fn session_accept_handover(
    app: AppHandle,
    host: State<'_, SessionHost>,
    paths: HashMap<String, String>,
) -> Result<SessionStatus, String> {
    let client = host
        .client_session()
        .ok_or_else(|| "no active session".to_string())?;
    let (session_id, token, playback) = client
        .take_handover()
        .ok_or_else(|| "no handover pending".to_string())?;
    // Never take over a room we are not in: the ids must match the session
    // this guest joined.
    if client.session_id().as_deref() != Some(session_id.as_str()) {
        return Err("the handover does not match this room".to_string());
    }
    let (peer_id, display_name) = client.handover_identity();
    let config = HostConfig {
        session_id,
        token,
        host_peer_id: peer_id,
        display_name,
        max_peers: DEFAULT_MAX_PEERS,
    };
    let session = HostSession::start(config).await?;
    let endpoint_id = session.endpoint().id().to_string();
    // Carry the room state across: plan + roster roles/ready + held start +
    // playback. Chat lives in the local buffer this instance already shares.
    host.set_playlist(client.plan(), paths)?;
    session.adopt_state(client.roster(), client.waiting(), playback);
    // Confirm to the outgoing host while our guest connection is still up;
    // let the frame flush before the runtime swap tears the connection down.
    client.handover_ready(&endpoint_id)?;
    tokio::time::sleep(Duration::from_millis(HANDOVER_FLUSH_MS)).await;
    // Swap runtimes: the guest leaves (Bye) and this pump now reads the new
    // host session's events.
    spawn_host_pump(app, host.inner().clone(), session.clone());
    host.set_runtime(SessionRuntime::Host(session));
    Ok(host.status())
}

/// Leave the active session (host or guest).
#[tauri::command]
pub async fn session_leave(host: State<'_, SessionHost>) -> Result<(), String> {
    if let Some(runtime) = host.take_runtime() {
        match runtime {
            SessionRuntime::Host(session) => session.stop().await,
            SessionRuntime::Guest(client) => client.leave().await,
        }
    }
    Ok(())
}

/// Send a chat line as the host (broadcast) or guest (to the host).
///
/// `id` is generated client-side for the optimistic echo; the host keeps it
/// as the reply/pin/react anchor. The text is sanitized and capped here and
/// again on the host wire for guest lines. A `.torrent` may ride along
/// (`file_name` + raw `file_bytes`, capped so the frame fits); the caption
/// may then be empty. The bytes land in a bounded side map, never in the log.
#[tauri::command]
pub fn session_chat(
    host: State<'_, SessionHost>,
    text: String,
    id: Option<String>,
    reply_to: Option<String>,
    file_name: Option<String>,
    file_bytes: Option<Vec<u8>>,
) -> Result<(), String> {
    let upload: Option<(String, Vec<u8>)> = match (file_name, file_bytes) {
        (Some(name), Some(bytes)) => {
            let name = sanitize_chat_upload(&name, bytes.len())
                .ok_or_else(|| "attachment is not a .torrent that fits the frame".to_string())?;
            Some((name, bytes))
        }
        (None, None) => None,
        _ => return Err("attachment needs a file name and bytes".to_string()),
    };
    let text = if upload.is_some() && text.trim().is_empty() {
        String::new()
    } else {
        sanitize_chat_text(&text).ok_or_else(|| "chat text is empty or too long".to_string())?
    };
    let id = chat_id_or_generate(&id.unwrap_or_default());
    let reply_to = reply_to.filter(|r| !r.is_empty() && r.len() <= CHAT_ID_MAX_CHARS);
    if let Some(session) = host.host_session() {
        let message = session.add_chat(
            id.clone(),
            session.display_name().to_string(),
            text,
            reply_to,
            upload.clone(),
        );
        host.add_chat(message);
        if let Some((name, bytes)) = upload {
            host.remember_attachment(id, name, bytes);
        }
        return Ok(());
    }
    if let Some(client) = host.client_session() {
        let attachment = upload.map(|(name, bytes)| ChatUpload {
            name,
            data: STANDARD.encode(&bytes),
        });
        return client.send(ClientMessage::Chat {
            id,
            text,
            reply_to,
            attachment,
        });
    }
    Err("no active session".to_string())
}

/// Broadcast the local user's typing state: the host relays it to every
/// guest, a guest hands it to the host for relay. Start frames are throttled
/// server-side (`TYPING_MIN_INTERVAL_SEC`), stop frames always go through.
#[tauri::command]
pub fn session_typing(host: State<'_, SessionHost>, active: bool) -> Result<(), String> {
    if let Some(session) = host.host_session() {
        session.broadcast_typing(active);
        return Ok(());
    }
    if let Some(client) = host.client_session() {
        return client.send(ClientMessage::Typing { active });
    }
    Err("no active session".to_string())
}

/// Fetch a chat `.torrent` attachment's bytes for the download picker. Reads
/// the local mirror (both roles keep one); evicted attachments report back.
#[tauri::command]
pub fn session_chat_attachment(
    host: State<'_, SessionHost>,
    message_id: String,
) -> Result<ChatAttachmentFile, String> {
    host.chat_attachment(&message_id)
        .map(|(name, bytes)| ChatAttachmentFile { name, bytes })
        .ok_or_else(|| "attachment is no longer available".to_string())
}

/// A chat attachment fetched for the download picker.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatAttachmentFile {
    pub name: String,
    pub bytes: Vec<u8>,
}

/// Combined session view (role, ticket, roster, chat).
#[tauri::command]
pub fn session_status(host: State<'_, SessionHost>) -> Result<SessionStatus, String> {
    Ok(host.status())
}

/// Record a guest self-report (diagnostics for the host UI).
#[tauri::command]
pub fn session_report(host: State<'_, SessionHost>, report: PeerReport) -> Result<(), String> {
    host.record_report(report);
    Ok(())
}

/// Apply a control action: the host broadcasts, a guest intercepts and requests.
#[tauri::command]
pub fn session_control(host: State<'_, SessionHost>, action: ControlAction) -> Result<(), String> {
    if let Some(session) = host.host_session() {
        session.relay_control(action);
        return Ok(());
    }
    if let Some(client) = host.client_session() {
        return client.request_control(action);
    }
    Err("no active session".to_string())
}

/// Guest: explicitly request a control action from the host.
#[tauri::command]
pub fn session_request_control(
    host: State<'_, SessionHost>,
    action: ControlAction,
) -> Result<(), String> {
    if let Some(client) = host.client_session() {
        return client.request_control(action);
    }
    if host.host_session().is_some() {
        return Ok(());
    }
    Err("no active session".to_string())
}

/// Host: re-broadcast the latest playback snapshot so guests re-converge.
///
/// The stored snapshot is re-stamped with a fresh revision and host clock.
/// Re-broadcasting it verbatim would be ignored: guests drop any revision they
/// have already seen.
#[tauri::command]
pub fn session_force_resync(host: State<'_, SessionHost>) -> Result<(), String> {
    let session = host
        .host_session()
        .ok_or_else(|| "only the host can force a resync".to_string())?;
    let state = session
        .last_playback()
        .ok_or_else(|| "no playback state has been published yet".to_string())?;
    session.publish_position(state.media_id, state.position, state.is_playing, state.rate);
    Ok(())
}

/// Host: publish an authoritative playback snapshot (player bridge).
///
/// The backend stamps the revision and the host-clock timestamp; the player
/// only reports the position it is at, so guests always align against one
/// authoritative clock.
#[tauri::command]
pub fn session_publish_state(
    host: State<'_, SessionHost>,
    media_id: String,
    position: f64,
    is_playing: bool,
    rate: f64,
) -> Result<(), String> {
    if !position.is_finite() || position < 0.0 {
        return Err("position must be a finite, non-negative number".to_string());
    }
    if !rate.is_finite() || rate <= 0.0 {
        return Err("rate must be a finite, positive number".to_string());
    }
    validate_media_id(&media_id)?;
    let session = host
        .host_session()
        .ok_or_else(|| "only the host can publish playback state".to_string())?;
    session.publish_position(media_id, position, is_playing, rate);
    Ok(())
}

/// Guest: evaluate one sync tick against the local player position (seconds).
///
/// `media_id` is the plan item the local player shows; a sample for any other
/// media yields a report with no instruction (identity invariant).
#[tauri::command]
pub fn session_sync_sample(
    host: State<'_, SessionHost>,
    media_id: Option<String>,
    time_pos: f64,
) -> Result<SyncSample, String> {
    let client = host
        .client_session()
        .ok_or_else(|| "only a guest can sample sync".to_string())?;
    Ok(client.sample_sync(time_pos, media_id))
}

/// Guest: set the manual release offset (ms) applied to the expected position.
///
/// Returns the value actually stored (non-finite input is ignored).
#[tauri::command]
pub fn session_set_offset(host: State<'_, SessionHost>, offset_ms: f64) -> Result<f64, String> {
    let client = host
        .client_session()
        .ok_or_else(|| "only a guest can set the release offset".to_string())?;
    Ok(client.set_sync_offset(offset_ms))
}

/// Guest: the local player restarted after a seek resync.
///
/// Clears the sync engine's `awaiting_restart` latch so the next tick is
/// evaluated again. Safe to call when no resync is in flight.
#[tauri::command]
pub fn session_sync_restart(host: State<'_, SessionHost>) -> Result<(), String> {
    let client = host
        .client_session()
        .ok_or_else(|| "only a guest can report a playback restart".to_string())?;
    client.mark_restarted();
    Ok(())
}

/// Host: broadcast the room's track selection. Guest: send a track pick.
#[tauri::command]
pub fn session_sync_tracks(host: State<'_, SessionHost>, track: TrackState) -> Result<(), String> {
    validate_media_id(&track.media_id)?;
    if let Some(session) = host.host_session() {
        session.sync_tracks(track);
        return Ok(());
    }
    if let Some(client) = host.client_session() {
        return client.pick_track(track);
    }
    Err("no active session".to_string())
}

fn spawn_host_pump(app: AppHandle, state: SessionHost, session: HostSession) {
    tokio::spawn(async move {
        let mut events = session.subscribe();
        loop {
            match events.recv().await {
                Ok(HostEvent::Chat {
                    message,
                    attachment,
                }) => {
                    if let Some(upload) = attachment {
                        if let Ok(bytes) = STANDARD.decode(&upload.data) {
                            state.remember_attachment(message.id.clone(), upload.name, bytes);
                        }
                    }
                    state.add_chat(message);
                }
                Ok(HostEvent::Control { revision, action }) => {
                    let _ = app.emit(EVENT_SESSION_COMMAND, CommandPayload { revision, action });
                }
                Ok(HostEvent::Track { track }) => {
                    let _ = app.emit(EVENT_SESSION_TRACK, track);
                }
                Ok(HostEvent::Roster { peers }) => {
                    let _ = app.emit(EVENT_SESSION_ROSTER, peers);
                }
                Ok(HostEvent::StartItem { item_id, path }) => {
                    let _ = app.emit(EVENT_SESSION_START, StartItemPayload { item_id, path });
                }
                Ok(HostEvent::Waiting { item_id, peer_ids }) => {
                    let _ = app.emit(EVENT_SESSION_WAITING, WaitingFor { item_id, peer_ids });
                }
                Ok(HostEvent::Typing { peer_id, active }) => {
                    let _ = app.emit(EVENT_SESSION_TYPING, TypingPayload { peer_id, active });
                }
                Ok(_) | Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {}
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
        }
    });
}

fn spawn_guest_pump(app: AppHandle, state: SessionHost, client: ClientSession) {
    tokio::spawn(async move {
        let mut events = client.subscribe();
        let mut ticker = tokio::time::interval(PROMOTION_TICK);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            tokio::select! {
                event = events.recv() => {
                    match event {
                        Ok(ServerMessage::Chat {
                            id,
                            from,
                            text,
                            at,
                            links,
                            reply_to,
                            attachment,
                        }) => {
                            let meta = attachment.and_then(|upload| {
                                let bytes = STANDARD.decode(&upload.data).ok()?;
                                state.remember_attachment(
                                    id.clone(),
                                    upload.name.clone(),
                                    bytes.clone(),
                                );
                                Some(ChatAttachment {
                                    name: upload.name,
                                    size: bytes.len(),
                                })
                            });
                            state.add_chat(ChatMessage {
                                id,
                                from,
                                text,
                                at,
                                links,
                                reply_to,
                                attachment: meta,
                            });
                        }
                        Ok(ServerMessage::Roster { peers }) => {
                            state.set_peers(peers.clone());
                            let _ = app.emit(EVENT_SESSION_ROSTER, peers);
                        }
                        Ok(ServerMessage::Typing { peer_id, active }) => {
                            let _ =
                                app.emit(EVENT_SESSION_TYPING, TypingPayload { peer_id, active });
                        }
                        Ok(ServerMessage::WaitingFor { item_id, peer_ids }) => {
                            let _ =
                                app.emit(EVENT_SESSION_WAITING, WaitingFor { item_id, peer_ids });
                        }
                        Ok(ServerMessage::Migrate { host_id, .. }) => {
                            let _ = app.emit(EVENT_SESSION_MIGRATE, host_id);
                        }
                        Ok(ServerMessage::HostHandover { .. }) => {
                            let _ = app.emit(EVENT_SESSION_HOST_HANDOVER, ());
                        }
                        Ok(ServerMessage::Welcome { roster, .. }) => {
                            state.set_peers(roster.clone());
                            let _ = app.emit(EVENT_SESSION_ROSTER, roster);
                        }
                        Ok(ServerMessage::PlaybackState {
                            revision,
                            media_id,
                            position,
                            is_playing,
                            rate,
                            updated_at_mono,
                        }) => {
                            let _ = app.emit(
                                EVENT_SESSION_PLAYBACK,
                                PlaybackState {
                                    revision,
                                    media_id,
                                    position,
                                    is_playing,
                                    rate,
                                    updated_at_mono,
                                },
                            );
                        }
                        Ok(ServerMessage::Command { revision, action }) => {
                            let _ =
                                app.emit(EVENT_SESSION_COMMAND, CommandPayload { revision, action });
                        }
                        Ok(ServerMessage::TrackSync {
                            media_id,
                            audio,
                            sub,
                            audio_delay,
                            sub_delay,
                        }) => {
                            let _ = app.emit(
                                EVENT_SESSION_TRACK,
                                TrackState {
                                    media_id,
                                    audio,
                                    sub,
                                    audio_delay,
                                    sub_delay,
                                },
                            );
                        }
                        Ok(_) | Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {}
                        Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                    }
                }
                _ = ticker.tick() => {
                    // Hostless past the grace window: promote ourselves or
                    // follow the elected successor. Promoting hands this pump
                    // over to the host side, so it stops here.
                    if promote_if_hostless(&app, &state, &client) {
                        break;
                    }
                }
            }
        }
    });
}

/// Once the host is gone past the grace window, take the room over (when this
/// peer is elected) or retarget the dial at the elected successor. Returns
/// `true` when this peer became the host, so the guest pump must stop.
fn promote_if_hostless(app: &AppHandle, state: &SessionHost, client: &ClientSession) -> bool {
    let roster = client.roster();
    let me = client.your_peer_id();
    match crash_action(client.host_gone(), &roster, me.as_deref()) {
        CrashAction::Wait => false,
        CrashAction::Follow {
            peer_id,
            endpoint_id,
        } => {
            if client.retarget_to(&endpoint_id) {
                let _ = app.emit(EVENT_SESSION_MIGRATE, peer_id);
            }
            false
        }
        CrashAction::Promote => {
            promote_to_host(app, state, client);
            true
        }
    }
}

/// Take the room over after the host died: start hosting on this guest's own
/// endpoint (its id is already in every roster, so nobody has to learn a new
/// one), seed the room from the last replicated state, and hand the pump to
/// the host side. The room starts paused; a resume is an explicit command.
fn promote_to_host(app: &AppHandle, state: &SessionHost, client: &ClientSession) {
    let paths = state.plan_paths();
    let Some(session) = client.take_over(paths) else {
        return;
    };
    spawn_host_pump(app.clone(), state.clone(), session.clone());
    state.set_runtime(SessionRuntime::Host(session));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_hash_cap_is_4gib() {
        assert_eq!(DEFAULT_MEDIA_HASH_CAP_BYTES, 4 * 1024 * 1024 * 1024);
    }
}
