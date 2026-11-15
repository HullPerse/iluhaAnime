use std::sync::{MutexGuard, OnceLock};
use std::time::Instant;

use tauri::AppHandle;

use crate::anilist::auth::optional_token;
use crate::app_db::db::{lock_app_data_write_timeout, APP_DATA_WRITE_TIMEOUT};
use crate::scrapers::clients::resolve_proxy;

/// Shared command context for the proxy/token/write-lock boilerplate.
///
/// The token is resolved lazily: a proxy-only command never touches the OS
/// credential store, and commands that already hold a token do not read it
/// twice.
pub struct CommandCtx<'a> {
    app: &'a AppHandle,
    proxy: Option<String>,
    token: OnceLock<Option<String>>,
}

impl<'a> CommandCtx<'a> {
    pub fn new(
        app: &'a AppHandle,
        proxy_url: Option<String>,
        proxy_url_camel: Option<String>,
    ) -> Self {
        Self {
            app,
            proxy: resolve_proxy(proxy_url, proxy_url_camel),
            token: OnceLock::new(),
        }
    }

    pub fn proxy(&self) -> Option<&str> {
        self.proxy.as_deref()
    }

    pub fn token(&self) -> Option<&str> {
        self.token
            .get_or_init(|| optional_token(self.app))
            .as_deref()
    }

    pub fn require_token(&self) -> Result<&str, String> {
        self.token().ok_or_else(|| "Not authenticated".to_string())
    }

    pub fn write_guard(&self) -> Result<MutexGuard<'static, ()>, String> {
        lock_app_data_write_timeout(APP_DATA_WRITE_TIMEOUT)
    }
}

const SLOW_COMMAND_MS: u128 = 200;

/// Lightweight phase trace for commands where the round trip is user-visible.
/// Only slow commands emit a log line, so an idle app stays quiet.
pub struct CommandTrace {
    command: &'static str,
    started: Instant,
    marks: Vec<(&'static str, u128)>,
}

impl CommandTrace {
    pub fn start(command: &'static str) -> Self {
        Self {
            command,
            started: Instant::now(),
            marks: Vec::with_capacity(4),
        }
    }

    pub fn mark(&mut self, phase: &'static str) {
        self.marks.push((phase, self.started.elapsed().as_millis()));
    }

    pub fn finish<T>(self, result: &Result<T, String>) {
        let elapsed_ms = self.started.elapsed().as_millis();
        if elapsed_ms < SLOW_COMMAND_MS {
            return;
        }
        tracing::info!(
            command = self.command,
            elapsed_ms,
            ok = result.is_ok(),
            marks = ?self.marks,
            "slow Tauri command"
        );
    }
}
