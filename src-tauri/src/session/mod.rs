//! Watch Party host session (P1: local state + identity; P2 adds transport).

pub mod client;
pub mod commands;
pub mod elect;
pub mod host;
pub mod media;
pub mod playlist;
pub mod protocol;
pub mod state;
pub mod sync;
pub mod transport;

#[allow(unused_imports)]
pub use commands::{
    media_identity, session_accept_handover, session_add_source, session_chat,
    session_chat_attachment, session_control, session_create, session_elect_host,
    session_force_resync, session_join, session_leave, session_publish_state,
    session_remove_source, session_report, session_request_control, session_set_offset,
    session_set_playlist, session_set_ready, session_set_role, session_start_item, session_state,
    session_status, session_sync_restart, session_sync_sample, session_sync_tracks,
    session_transfer_host, session_typing, DEFAULT_MEDIA_HASH_CAP_BYTES,
};
#[allow(unused_imports)]
pub use state::{SessionHost, SessionSnapshot, SessionStatus, SessionTicket, TrackState};
