mod audio;
pub mod commands;
pub mod core;
pub mod diagnostics;
pub mod lifecycle;
pub mod load;
mod loupe;
mod options;
mod readiness;
mod session;
#[cfg(windows)]
mod smtc;
pub mod snapshot;
pub mod state;
mod validation;
pub mod watch;

#[cfg(debug_assertions)]
pub mod bench;

pub use commands::*;
pub use diagnostics::*;
pub use lifecycle::*;
pub use load::*;
pub use loupe::*;
pub use state::PlayerHost;

pub const PLAYER_WINDOW_LABEL: &str = "player";
pub const PLAYER_ROUTE: &str = "player-window";

pub const EVENT_STATE: &str = "player-state";

pub const EVENT_EVENT: &str = "player-event";

pub const EVENT_TRACKS: &str = "player-tracks";

pub const EVENT_CHAPTERS: &str = "player-chapters";

pub fn mpv_event_name() -> String {
    format!("mpv-event-{PLAYER_WINDOW_LABEL}")
}
