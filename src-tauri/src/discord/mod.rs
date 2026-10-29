mod activity;
pub mod commands;
mod ipc;

use std::time::{Duration, Instant};

use serde::Deserialize;
use tokio::sync::mpsc;

pub use activity::DiscordActivity;

use ipc::{DiscordConnection, DiscordIpc, FrameEvent};

const CLIENT_ID: &str = "1565211430737809528";
const CONNECT_TIMEOUT: Duration = Duration::from_secs(3);
const UPDATE_INTERVAL: Duration = Duration::from_secs(15);
const RETRY_MIN: Duration = Duration::from_secs(5);
const RETRY_MAX: Duration = Duration::from_secs(60);
const TICK: Duration = Duration::from_secs(1);

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PresenceSource {
    Main,
    Player,
}

enum Command {
    Configure { enabled: bool },
    Set {
        source: PresenceSource,
        activity: DiscordActivity,
    },
    Clear {
        source: PresenceSource,
    },
    Shutdown,
}

/// The handle managed by Tauri. The task owns the pipe so no window can block
/// on a missing Discord client.
pub struct DiscordPresence {
    tx: mpsc::Sender<Command>,
}

impl DiscordPresence {
    pub fn start() -> Self {
        let (tx, rx) = mpsc::channel(32);
        tauri::async_runtime::spawn(run(rx));
        Self { tx }
    }

    pub async fn configure(&self, enabled: bool) -> Result<(), String> {
        self.send(Command::Configure { enabled }).await
    }

    pub async fn set(
        &self,
        source: PresenceSource,
        activity: DiscordActivity,
    ) -> Result<(), String> {
        self.send(Command::Set { source, activity }).await
    }

    pub async fn clear(&self, source: PresenceSource) -> Result<(), String> {
        self.send(Command::Clear { source }).await
    }

    pub fn clear_player_now(&self) {
        let _ = self.tx.try_send(Command::Clear {
            source: PresenceSource::Player,
        });
    }

    pub fn shutdown(&self) {
        let _ = self.tx.try_send(Command::Shutdown);
    }

    async fn send(&self, command: Command) -> Result<(), String> {
        self.tx
            .send(command)
            .await
            .map_err(|_| "Discord presence task is not running".to_string())
    }
}

async fn run(mut rx: mpsc::Receiver<Command>) {
    let mut manager = Manager::new();
    let mut ticker = tokio::time::interval(TICK);
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    loop {
        let wake = tokio::select! {
            command = rx.recv() => Wake::Command(command),
            _ = ticker.tick() => Wake::Tick,
            frame = manager.next_frame() => Wake::Frame(frame),
        };
        match wake {
            Wake::Command(None) | Wake::Command(Some(Command::Shutdown)) => {
                manager.shutdown().await;
                break;
            }
            Wake::Command(Some(command)) => manager.apply(command).await,
            Wake::Frame(frame) => manager.handle_frame(frame).await,
            Wake::Tick => {}
        }
        manager.pump().await;
    }
}

enum Wake {
    Command(Option<Command>),
    Frame(FrameEvent),
    Tick,
}

struct Manager {
    enabled: bool,
    main: Option<DiscordActivity>,
    player: Option<DiscordActivity>,
    client: Option<DiscordConnection>,
    last_sent: Option<DiscordActivity>,
    last_sent_at: Option<Instant>,
    next_retry: Instant,
    retry_delay: Duration,
    unavailable_logged: bool,
}

impl Manager {
    fn new() -> Self {
        Self {
            enabled: false,
            main: None,
            player: None,
            client: None,
            last_sent: None,
            last_sent_at: None,
            next_retry: Instant::now(),
            retry_delay: RETRY_MIN,
            unavailable_logged: false,
        }
    }

    async fn apply(&mut self, command: Command) {
        match command {
            Command::Configure { enabled } => {
                if self.enabled == enabled {
                    return;
                }
                self.enabled = enabled;
                self.retry_delay = RETRY_MIN;
                self.next_retry = Instant::now();
                if enabled {
                    self.unavailable_logged = false;
                } else {
                    self.main = None;
                    self.player = None;
                    self.flush_clear().await;
                }
            }
            Command::Set { source, activity } => {
                let activity = activity.sanitize();
                let value = if activity.is_empty() {
                    None
                } else {
                    Some(activity)
                };
                match source {
                    PresenceSource::Main => self.main = value,
                    PresenceSource::Player => self.player = value,
                }
            }
            Command::Clear { source } => match source {
                PresenceSource::Main => self.main = None,
                PresenceSource::Player => self.player = None,
            },
            Command::Shutdown => {}
        }
    }

    async fn pump(&mut self) {
        if !self.enabled {
            self.flush_clear().await;
            return;
        }
        let desired = desired_activity(
            self.enabled,
            self.main.clone(),
            self.player.clone(),
        );
        let Some(desired) = desired else {
            if self.last_sent.is_some() {
                self.send_clear().await;
            }
            return;
        };
        if self.client.is_none() {
            if Instant::now() < self.next_retry {
                return;
            }
            self.connect().await;
            if self.client.is_none() {
                return;
            }
        }
        if !is_update_due(
            self.last_sent.as_ref(),
            self.last_sent_at,
            &desired,
            Instant::now(),
        ) {
            return;
        }
        self.send(desired).await;
    }

    async fn connect(&mut self) {
        let attempt = async {
            let mut client = DiscordIpc::connect().await?;
            client.handshake(CLIENT_ID).await?;
            Ok::<DiscordConnection, String>(client.split())
        };
        match tokio::time::timeout(CONNECT_TIMEOUT, attempt).await {
            Ok(Ok(client)) => {
                tracing::info!("Discord Rich Presence connected");
                self.client = Some(client);
                self.last_sent = None;
                self.last_sent_at = None;
                self.retry_delay = RETRY_MIN;
                self.next_retry = Instant::now();
                self.unavailable_logged = false;
            }
            Ok(Err(error)) => self.failed_connect(&error),
            Err(_) => self.failed_connect("the Discord client did not answer in time"),
        }
    }

    fn failed_connect(&mut self, error: &str) {
        if self.unavailable_logged {
            tracing::debug!("Discord Rich Presence reconnect failed: {error}");
        } else {
            tracing::info!("Discord Rich Presence is waiting for Discord: {error}");
            self.unavailable_logged = true;
        }
        self.next_retry = Instant::now() + self.retry_delay;
        self.retry_delay = (self.retry_delay * 2).min(RETRY_MAX);
    }

    /// Waits for the next frame while a connection is open. With no connection
    /// the future stays pending so the tick and command branches can wake the
    /// manager without a busy loop.
    async fn next_frame(&mut self) -> FrameEvent {
        match self.client.as_mut() {
            Some(client) => match client.frames.recv().await {
                Some(event) => event,
                None => FrameEvent::Closed("Discord read task ended".to_string()),
            },
            None => std::future::pending::<FrameEvent>().await,
        }
    }

    async fn handle_frame(&mut self, event: FrameEvent) {
        match event {
            FrameEvent::Frame { opcode: 3, payload } => {
                let result = match self.client.as_mut() {
                    Some(client) => client.send_pong(&payload).await,
                    None => return,
                };
                if let Err(error) = result {
                    tracing::debug!("Discord PONG failed: {error}");
                    self.drop_client();
                }
            }
            FrameEvent::Frame { opcode: 2, .. } => {
                tracing::debug!("Discord closed the IPC pipe");
                self.drop_client();
            }
            FrameEvent::Frame { .. } => {}
            FrameEvent::Closed(error) => {
                tracing::debug!("Discord IPC read failed: {error}");
                self.drop_client();
            }
        }
    }

    async fn send(&mut self, activity: DiscordActivity) {
        let payload = activity.to_json();
        let result = match self.client.as_mut() {
            Some(client) => client.set_activity(Some(&payload)).await,
            None => return,
        };
        match result {
            Ok(()) => {
                self.last_sent = Some(activity);
                self.last_sent_at = Some(Instant::now());
            }
            Err(error) => {
                tracing::debug!("Discord activity update failed: {error}");
                self.drop_client();
            }
        }
    }

    async fn send_clear(&mut self) {
        let result = match self.client.as_mut() {
            Some(client) => client.set_activity(None).await,
            None => return,
        };
        match result {
            Ok(()) => {
                self.last_sent = None;
                self.last_sent_at = Some(Instant::now());
            }
            Err(error) => {
                tracing::debug!("Discord activity clear failed: {error}");
                self.drop_client();
            }
        }
    }

    async fn flush_clear(&mut self) {
        if self.client.is_some() {
            if self.last_sent.is_some() {
                self.send_clear().await;
            }
            if let Some(mut client) = self.client.take() {
                let _ = client.close().await;
            }
        }
        self.last_sent = None;
        self.last_sent_at = None;
    }

    fn drop_client(&mut self) {
        self.client = None;
        self.last_sent = None;
        self.last_sent_at = None;
        self.next_retry = Instant::now() + self.retry_delay;
        self.retry_delay = (self.retry_delay * 2).min(RETRY_MAX);
        self.unavailable_logged = false;
    }

    async fn shutdown(&mut self) {
        self.enabled = false;
        self.main = None;
        self.player = None;
        self.flush_clear().await;
    }
}

fn desired_activity(
    enabled: bool,
    main: Option<DiscordActivity>,
    player: Option<DiscordActivity>,
) -> Option<DiscordActivity> {
    if !enabled {
        return None;
    }
    player.or(main)
}

fn is_update_due(
    last_sent: Option<&DiscordActivity>,
    last_sent_at: Option<Instant>,
    desired: &DiscordActivity,
    now: Instant,
) -> bool {
    if last_sent == Some(desired) {
        return false;
    }
    match last_sent_at {
        Some(at) => now.saturating_duration_since(at) >= UPDATE_INTERVAL,
        None => true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn activity(details: &str) -> DiscordActivity {
        DiscordActivity {
            details: Some(details.to_string()),
            ..DiscordActivity::default()
        }
    }

    #[test]
    fn player_activity_wins_over_the_main_window() {
        let main = activity("main");
        let player = activity("player");
        assert_eq!(
            desired_activity(true, Some(main), Some(player.clone())),
            Some(player)
        );
    }

    #[test]
    fn disabled_presence_has_no_activity() {
        assert_eq!(
            desired_activity(false, Some(activity("main")), Some(activity("player"))),
            None
        );
    }

    #[test]
    fn the_first_activity_is_sent_immediately() {
        let now = Instant::now();
        assert!(is_update_due(None, None, &activity("first"), now));
    }

    #[test]
    fn identical_activity_is_not_resent() {
        let now = Instant::now();
        let current = activity("same");
        assert!(!is_update_due(
            Some(&current),
            Some(now),
            &current,
            now + Duration::from_secs(30)
        ));
    }

    #[test]
    fn a_changed_activity_waits_for_the_interval() {
        let now = Instant::now();
        let current = activity("first");
        let next = activity("second");
        assert!(!is_update_due(
            Some(&current),
            Some(now),
            &next,
            now + Duration::from_secs(14)
        ));
        assert!(is_update_due(
            Some(&current),
            Some(now),
            &next,
            now + Duration::from_secs(15)
        ));
    }
}
