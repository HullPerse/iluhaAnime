//! Library folder watcher.
//!
//! Watches every saved player folder recursively and emits a single
//! `folder-content-changed` event per aggregation window. The payload carries
//! the changed paths together with their watched root and the change kind, so
//! consumers can react to the exact entries instead of rescanning whole trees.
//!
//! Raw `notify` is used on purpose: `notify-debouncer-mini` collapses every
//! event to a kindless "any" notification, which would drop create/remove
//! information. Aggregation happens here instead.

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio_util::sync::CancellationToken;

/// Bounds for the caller-supplied aggregation window.
const MIN_WINDOW_MS: u64 = 100;
const MAX_WINDOW_MS: u64 = 10_000;
const DEFAULT_WINDOW_MS: u64 = 1500;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ChangeKind {
    Created,
    Removed,
    Modified,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedPath {
    pub path: String,
    pub root: String,
    pub kind: ChangeKind,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderContentChanged {
    /// Watched roots that saw at least one change; kept for consumers that
    /// still rescan a whole root.
    pub roots: Vec<String>,
    pub changes: Vec<ChangedPath>,
}

type Pending = Arc<Mutex<HashMap<PathBuf, ChangeKind>>>;

pub struct FolderWatcher {
    watcher: Option<RecommendedWatcher>,
    cancel: CancellationToken,
}

impl FolderWatcher {
    #[must_use]
    pub fn new() -> Self {
        Self {
            watcher: None,
            cancel: CancellationToken::new(),
        }
    }

    /// Starts watching `folders`. `window_ms` is the aggregation window; a
    /// missing or out-of-range value falls back to [`DEFAULT_WINDOW_MS`].
    pub fn start(
        &mut self,
        app_handle: AppHandle,
        folders: Vec<String>,
        window_ms: Option<u64>,
    ) -> Result<(), String> {
        self.stop();
        let roots: Vec<PathBuf> = folders.into_iter().map(PathBuf::from).collect();
        if roots.is_empty() {
            return Ok(());
        }
        let window = Duration::from_millis(
            window_ms
                .unwrap_or(DEFAULT_WINDOW_MS)
                .clamp(MIN_WINDOW_MS, MAX_WINDOW_MS),
        );

        let cancel = CancellationToken::new();
        self.cancel = cancel.clone();

        let pending: Pending = Arc::new(Mutex::new(HashMap::new()));
        let pending_cb = Arc::clone(&pending);
        let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
            let Ok(event) = res else { return };
            let Some(kind) = classify(event.kind) else {
                return;
            };
            let Ok(mut map) = pending_cb.lock() else {
                return;
            };
            for path in event.paths {
                map.entry(path)
                    .and_modify(|current| *current = merge(*current, kind))
                    .or_insert(kind);
            }
        })
        .map_err(|error| format!("create watcher: {error}"))?;

        let mut watched_any = false;
        let mut last_error = None;
        for root in &roots {
            match watcher.watch(root, RecursiveMode::Recursive) {
                Ok(()) => watched_any = true,
                Err(error) => {
                    tracing::warn!("folder watcher: skipping {}: {error}", root.display());
                    last_error = Some(format!("watch {}: {error}", root.display()));
                }
            }
        }
        if !watched_any {
            return Err(last_error.unwrap_or_else(|| "no folders to watch".to_string()));
        }

        let roots = Arc::new(roots);
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    () = tokio::time::sleep(window) => {}
                    () = cancel.cancelled() => break,
                }
                let drained: Vec<(PathBuf, ChangeKind)> = {
                    let Ok(mut map) = pending.lock() else { break };
                    map.drain().collect()
                };
                if drained.is_empty() {
                    continue;
                }
                let mut seen_roots = HashSet::new();
                let mut roots_hit = Vec::new();
                let mut changes = Vec::new();
                for (path, kind) in drained {
                    let Some(root) = roots.iter().find(|root| path.starts_with(root)) else {
                        continue;
                    };
                    let root = root.to_string_lossy().to_string();
                    if seen_roots.insert(root.clone()) {
                        roots_hit.push(root.clone());
                    }
                    changes.push(ChangedPath {
                        path: path.to_string_lossy().to_string(),
                        root,
                        kind,
                    });
                }
                if !changes.is_empty() {
                    let _ = app_handle.emit(
                        "folder-content-changed",
                        FolderContentChanged {
                            roots: roots_hit,
                            changes,
                        },
                    );
                }
            }
        });

        self.watcher = Some(watcher);
        Ok(())
    }

    pub fn stop(&mut self) {
        self.cancel.cancel();
        self.watcher.take();
    }
}

impl Default for FolderWatcher {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for FolderWatcher {
    fn drop(&mut self) {
        self.stop();
    }
}

const fn classify(kind: EventKind) -> Option<ChangeKind> {
    match kind {
        EventKind::Create(_) => Some(ChangeKind::Created),
        EventKind::Remove(_) => Some(ChangeKind::Removed),
        EventKind::Modify(_) => Some(ChangeKind::Modified),
        EventKind::Access(_) | EventKind::Other | EventKind::Any => None,
    }
}

/// A path can see several events inside one window; the strongest signal wins.
/// Removal beats everything, then creation, then a plain modification.
const fn merge(current: ChangeKind, next: ChangeKind) -> ChangeKind {
    match (current, next) {
        (_, ChangeKind::Removed) | (ChangeKind::Removed, _) => ChangeKind::Removed,
        (ChangeKind::Created, _) | (_, ChangeKind::Created) => ChangeKind::Created,
        _ => ChangeKind::Modified,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn classify_maps_create_remove_and_modify() {
        use notify::event::{CreateKind, ModifyKind, RemoveKind};
        assert_eq!(
            classify(EventKind::Create(CreateKind::File)),
            Some(ChangeKind::Created)
        );
        assert_eq!(
            classify(EventKind::Remove(RemoveKind::File)),
            Some(ChangeKind::Removed)
        );
        assert_eq!(
            classify(EventKind::Modify(ModifyKind::Data(
                notify::event::DataChange::Any
            ))),
            Some(ChangeKind::Modified)
        );
    }

    #[test]
    fn classify_drops_access_and_other() {
        use notify::event::{AccessKind, AccessMode};
        assert_eq!(classify(EventKind::Access(AccessKind::Read)), None);
        assert_eq!(
            classify(EventKind::Access(AccessKind::Close(AccessMode::Write))),
            None
        );
        assert_eq!(classify(EventKind::Other), None);
        assert_eq!(classify(EventKind::Any), None);
    }

    #[test]
    fn merge_prefers_removed_then_created() {
        assert_eq!(
            merge(ChangeKind::Modified, ChangeKind::Created),
            ChangeKind::Created
        );
        assert_eq!(
            merge(ChangeKind::Created, ChangeKind::Modified),
            ChangeKind::Created
        );
        assert_eq!(
            merge(ChangeKind::Created, ChangeKind::Removed),
            ChangeKind::Removed
        );
        assert_eq!(
            merge(ChangeKind::Removed, ChangeKind::Created),
            ChangeKind::Removed
        );
        assert_eq!(
            merge(ChangeKind::Modified, ChangeKind::Modified),
            ChangeKind::Modified
        );
    }

    #[test]
    fn path_belongs_to_a_root() {
        let root = Path::new("C:/Anime");
        assert!(PathBuf::from("C:/Anime/ep01.mkv").starts_with(root));
        assert!(!PathBuf::from("C:/Other/ep01.mkv").starts_with(root));
    }
}
