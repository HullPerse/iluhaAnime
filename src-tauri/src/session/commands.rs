//! Tauri commands: session state, transport, and player bridge (P3).

use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;

use iroh::{EndpointAddr, EndpointId, TransportAddr};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::session::client::{ClientConfig, ClientSession};
use crate::session::elect::{crash_action, CrashAction};
use crate::session::host::{HostConfig, HostEvent, HostSession, DEFAULT_MAX_PEERS};
use crate::session::media::{build_identity, find_folder_match};
use crate::session::protocol::{
    chat_id_or_generate, sanitize_chat_links, sanitize_chat_text, sanitize_chat_upload,
    ChatAttachment, ChatMessage, ChatUpload, ClientMessage, ControlAction, ItemReport,
    MediaIdentity, MediaPlanItem, PlaybackState, Role, ServerMessage, SourceInfo, WaitingFor,
    CHAT_ID_MAX_CHARS,
};
use crate::session::state::{
    random_hex, validate_media_id, PeerReport, SessionHost, SessionRuntime, SessionSnapshot,
    SessionStatus, SessionTicket, TrackState,
};
use crate::session::sync::SyncSample;
use crate::session::transport;
use base64::{engine::general_purpose::STANDARD, Engine as _};

pub const DEFAULT_MEDIA_HASH_CAP_BYTES: u64 = 4 * 1024 * 1024 * 1024;

const HANDOVER_TIMEOUT: Duration = Duration::from_secs(10);

const JOIN_HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(15);
const PROBE_TIMEOUT: Duration = Duration::from_secs(4);
/// Flush grace before the runtime swap tears the connection down.
const HANDOVER_FLUSH_MS: u64 = 150;

const PROMOTION_TICK: Duration = Duration::from_secs(1);

pub const EVENT_SESSION_PLAYBACK: &str = "session-playback";
pub const EVENT_SESSION_COMMAND: &str = "session-command";
pub const EVENT_SESSION_TRACK: &str = "session-track";
pub const EVENT_SESSION_ROSTER: &str = "session-roster";
pub const EVENT_SESSION_START: &str = "session-start-item";
pub const EVENT_SESSION_WAITING: &str = "session-waiting";
pub const EVENT_SESSION_MIGRATE: &str = "session-migrate";
pub const EVENT_SESSION_HOST_HANDOVER: &str = "session-host-handover";
pub const EVENT_SESSION_TYPING: &str = "session-typing";
pub const EVENT_SESSION_PIN: &str = "session-pin";
pub const EVENT_SESSION_REACT: &str = "session-react";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TypingPayload {
    peer_id: String,
    active: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PinPayload {
    message_id: Option<String>,
    pinned_by: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReactPayload {
    message_id: String,
    emoji: String,
    peer_id: String,
    add: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CommandPayload {
    revision: u64,
    action: ControlAction,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StartItemPayload {
    item_id: String,
    path: Option<String>,
}

#[tauri::command]
pub async fn media_identity(app: AppHandle, path: String) -> Result<MediaIdentity, String> {
    let path_buf = PathBuf::from(path);
    tauri::async_runtime::spawn_blocking(move || {
        build_identity(&path_buf, Some(DEFAULT_MEDIA_HASH_CAP_BYTES), &app)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn session_state(host: State<'_, SessionHost>) -> Result<SessionSnapshot, String> {
    Ok(host.snapshot())
}

/// paths stay host-only.
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

/// Guest routes `RequestStart`.
#[tauri::command]
pub fn session_start_item(host: State<'_, SessionHost>, item_id: String) -> Result<(), String> {
    if let Some(client) = host.client_session() {
        return client.request_start(&item_id);
    }
    host.start_item(&item_id).map(|_| ())
}

#[tauri::command]
pub fn session_set_role(
    host: State<'_, SessionHost>,
    peer_id: String,
    role: Role,
) -> Result<(), String> {
    host.set_role(&peer_id, role)
}

/// None when none can take over.
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

/// None when no byte-exact copy.
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

fn sync_host_plan(host: &SessionHost) {
    if let Some(session) = host.host_session() {
        session.set_plan(host.snapshot().plan, host.plan_paths());
    }
}

/// Pinned port fails when busy (OS-assigned otherwise).
#[tauri::command]
pub async fn session_create(
    app: AppHandle,
    host: State<'_, SessionHost>,
    display_name: String,
    port: Option<u16>,
) -> Result<SessionTicket, String> {
    if host.has_runtime() {
        return Err("a session is already active".to_string());
    }
    let session = HostSession::start(HostConfig::generate(display_name), port).await?;
    let ticket = session.ticket();
    session.set_plan(host.snapshot().plan, host.plan_paths());
    spawn_host_pump(app, host.inner().clone(), session.clone());
    host.set_runtime(SessionRuntime::Host(session));
    Ok(ticket)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    pub online: bool,
    pub rtt_ms: Option<f64>,
}

/// Bad addrs dropped, iroh falls back.
#[tauri::command]
pub async fn session_probe(endpoint_id: String, addrs: Vec<String>) -> Result<ProbeResult, String> {
    let endpoint_id = endpoint_id
        .parse::<EndpointId>()
        .map_err(|error| format!("invalid endpoint id: {error}"))?;
    let ip_addrs = addrs
        .iter()
        .filter_map(|addr| addr.parse::<std::net::SocketAddr>().ok())
        .map(TransportAddr::Ip);
    let target = EndpointAddr::from_parts(endpoint_id, ip_addrs);

    let endpoint = transport::bind_endpoint(None).await?;
    let started = std::time::Instant::now();
    let outcome =
        tokio::time::timeout(PROBE_TIMEOUT, endpoint.connect(target, transport::ALPN)).await;
    let result = match outcome {
        Ok(Ok(connection)) => {
            let handshake = started.elapsed().as_secs_f64() * 1000.0;
            let paths = connection.paths();
            let smoothed = paths
                .iter()
                .find(|path| path.is_selected())
                .map(|path| path.rtt().as_secs_f64() * 1000.0)
                .unwrap_or(0.0);
            connection.close(0u32.into(), b"probe");
            ProbeResult {
                online: true,
                rtt_ms: Some(if smoothed > 0.0 { smoothed } else { handshake }),
            }
        }
        _ => ProbeResult {
            online: false,
            rtt_ms: None,
        },
    };
    endpoint.close().await;
    Ok(result)
}

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

/// Invalid/missing becomes random.
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
    // Rejected join fails instead of showing an empty room.
    if let Err((_, message)) = client.wait_handshake(JOIN_HANDSHAKE_TIMEOUT).await {
        client.leave().await;
        return Err(message);
    }
    spawn_guest_pump(app, host.inner().clone(), client.clone());
    host.set_runtime(SessionRuntime::Guest(client));
    Ok(host.status())
}

/// Same id/token, only endpoint changes; rejoin as viewer.
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
    session.finish_handover(&handover).await;
    // Without a second stop().
    host.take_runtime();
    // Old host identity stays with the room.
    let new_ticket = SessionTicket {
        session_id: ticket.session_id,
        token: ticket.token,
        endpoint_id: handover.endpoint_id,
    };
    join_ticket(app, host, new_ticket, display_name, anilist_user_id, None).await
}

/// Accept handover; local paths become host-owned (never broadcast).
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
    // Ids must match.
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
    let session = HostSession::start(config, None).await?;
    let endpoint_id = session.endpoint().id().to_string();
    // Chat already local.
    host.set_playlist(client.plan(), paths)?;
    session.adopt_state(client.roster(), client.waiting(), playback);
    // Flush before the swap.
    client.handover_ready(&endpoint_id)?;
    tokio::time::sleep(Duration::from_millis(HANDOVER_FLUSH_MS)).await;
    spawn_host_pump(app, host.inner().clone(), session.clone());
    host.set_runtime(SessionRuntime::Host(session));
    Ok(host.status())
}

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

/// Sanitized chat; .torrent bytes go to the side map, never the log.
#[tauri::command]
pub fn session_chat(
    host: State<'_, SessionHost>,
    text: String,
    id: Option<String>,
    links: Option<Vec<String>>,
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
    let links = sanitize_chat_links(&links.unwrap_or_default());
    let reply_to = reply_to.filter(|r| !r.is_empty() && r.len() <= CHAT_ID_MAX_CHARS);
    if let Some(session) = host.host_session() {
        let message = session.add_chat(
            id.clone(),
            session.display_name().to_string(),
            text,
            links,
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
            links,
            reply_to,
            attachment,
        });
    }
    Err("no active session".to_string())
}

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

#[tauri::command]
pub fn session_pin(host: State<'_, SessionHost>, message_id: Option<String>) -> Result<(), String> {
    if let Some(session) = host.host_session() {
        return session.set_pin(message_id);
    }
    if let Some(client) = host.client_session() {
        return client.send(ClientMessage::Pin { message_id });
    }
    Err("no active session".to_string())
}

#[tauri::command]
pub fn session_react(
    host: State<'_, SessionHost>,
    message_id: String,
    emoji: String,
    add: bool,
) -> Result<(), String> {
    if let Some(session) = host.host_session() {
        return session.react(message_id, emoji, add);
    }
    if let Some(client) = host.client_session() {
        return client.send(ClientMessage::React {
            message_id,
            emoji,
            add,
        });
    }
    Err("no active session".to_string())
}

#[tauri::command]
pub fn session_chat_attachment(
    host: State<'_, SessionHost>,
    message_id: String,
) -> Result<ChatAttachmentFile, String> {
    host.chat_attachment(&message_id)
        .map(|(name, bytes)| ChatAttachmentFile { name, bytes })
        .ok_or_else(|| "attachment is no longer available".to_string())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatAttachmentFile {
    pub name: String,
    pub bytes: Vec<u8>,
}

#[tauri::command]
pub fn session_status(host: State<'_, SessionHost>) -> Result<SessionStatus, String> {
    Ok(host.status())
}

#[tauri::command]
pub fn session_report(host: State<'_, SessionHost>, report: PeerReport) -> Result<(), String> {
    host.record_report(report);
    Ok(())
}

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

/// No-op Ok on the host.
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

/// Re-stamps and re-broadcasts; verbatim would be dropped as seen.
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

/// Backend stamps revision/clock; player reports position only.
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

/// Identity invariant: other media yields no instruction.
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

/// Returns stored offset; non-finite ignored.
#[tauri::command]
pub fn session_set_offset(host: State<'_, SessionHost>, offset_ms: f64) -> Result<f64, String> {
    let client = host
        .client_session()
        .ok_or_else(|| "only a guest can set the release offset".to_string())?;
    Ok(client.set_sync_offset(offset_ms))
}

/// Clears the restart latch; safe when idle.
#[tauri::command]
pub fn session_sync_restart(host: State<'_, SessionHost>) -> Result<(), String> {
    let client = host
        .client_session()
        .ok_or_else(|| "only a guest can report a playback restart".to_string())?;
    client.mark_restarted();
    Ok(())
}

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
                Ok(HostEvent::Pin {
                    message_id,
                    pinned_by,
                }) => {
                    state.set_pinned(message_id.clone(), pinned_by.clone());
                    let _ = app.emit(
                        EVENT_SESSION_PIN,
                        PinPayload {
                            message_id,
                            pinned_by,
                        },
                    );
                }
                Ok(HostEvent::React {
                    message_id,
                    emoji,
                    peer_id,
                    add,
                }) => {
                    state.apply_reaction(&message_id, &emoji, &peer_id, add);
                    let _ = app.emit(
                        EVENT_SESSION_REACT,
                        ReactPayload {
                            message_id,
                            emoji,
                            peer_id,
                            add,
                        },
                    );
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
                        Ok(ServerMessage::Pin {
                            message_id,
                            pinned_by,
                        }) => {
                            state.set_pinned(message_id.clone(), pinned_by.clone());
                            let _ = app.emit(
                                EVENT_SESSION_PIN,
                                PinPayload {
                                    message_id,
                                    pinned_by,
                                },
                            );
                        }
                        Ok(ServerMessage::React {
                            message_id,
                            emoji,
                            peer_id,
                            add,
                        }) => {
                            state.apply_reaction(&message_id, &emoji, &peer_id, add);
                            let _ = app.emit(
                                EVENT_SESSION_REACT,
                                ReactPayload {
                                    message_id,
                                    emoji,
                                    peer_id,
                                    add,
                                },
                            );
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
                    // Hostless: promote or follow; promotion stops this pump.
                    if promote_if_hostless(&app, &state, &client) {
                        break;
                    }
                }
            }
        }
    });
}

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

/// Host on own endpoint; seeded paused, resume is explicit.
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
