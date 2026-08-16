use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

pub struct FolderWatcher {
    watcher: Option<RecommendedWatcher>,
    cancel: CancellationToken,
    dirty_tx: mpsc::UnboundedSender<PathBuf>,
}

impl FolderWatcher {
    pub fn new() -> Self {
        let (dirty_tx, _dirty_rx) = mpsc::unbounded_channel();
        Self {
            watcher: None,
            cancel: CancellationToken::new(),
            dirty_tx,
        }
    }

    pub fn start(&mut self, app_handle: AppHandle, folders: Vec<String>) -> Result<(), String> {
        self.stop();
        if folders.is_empty() {
            return Ok(());
        }

        let cancel = CancellationToken::new();
        self.cancel = cancel.clone();
        let paths: Vec<PathBuf> = folders.into_iter().map(PathBuf::from).collect();

        let (tx, rx) = std::sync::mpsc::channel();
        let (dirty_tx, mut dirty_rx) = mpsc::unbounded_channel::<PathBuf>();
        self.dirty_tx = dirty_tx.clone();

        let mut watcher = RecommendedWatcher::new(tx, Config::default())
            .map_err(|e| format!("create watcher: {e}"))?;
        for path in &paths {
            watcher
                .watch(path, RecursiveMode::Recursive)
                .map_err(|e| format!("watch {}: {e}", path.display()))?;
        }

        let event_cancel = cancel.clone();
        tokio::task::spawn_blocking(move || {
            while !event_cancel.is_cancelled() {
                match rx.recv() {
                    Ok(Ok(event)) => {
                        if matches!(
                            event.kind,
                            EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
                        ) {
                            if let Some(path) = event.paths.first() {
                                if let Some(parent) = path.parent().map(PathBuf::from) {
                                    let _ = dirty_tx.send(parent);
                                }
                            }
                        }
                    }
                    Ok(Err(_)) => {}
                    Err(_) => break,
                }
            }
        });

        let debounce_cancel = cancel;
        let paths_clone = paths.clone();
        let dirty_set: Arc<tokio::sync::Mutex<HashSet<PathBuf>>> =
            Arc::new(tokio::sync::Mutex::new(HashSet::new()));
        let set_clone = dirty_set;
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    Some(path) = dirty_rx.recv() => {
                        set_clone.lock().await.insert(path);
                    }
                    () = tokio::time::sleep(Duration::from_secs(2)) => {
                        let changed: Vec<String> = {
                            let mut set = set_clone.lock().await;
                            set.drain()
                                .filter_map(|path| {
                                    paths_clone.iter().find(|root| path.starts_with(root))
                                        .map(|root| root.to_string_lossy().to_string())
                                })
                                .collect()
                        };
                        if !changed.is_empty() {
                            let _ = app_handle.emit("folder-content-changed", &changed);
                        }
                    }
                }
                if debounce_cancel.is_cancelled() {
                    break;
                }
            }
        });

        self.watcher = Some(watcher);
        Ok(())
    }

    pub fn stop(&mut self) {
        self.cancel.cancel();
        // Dropping the watcher closes notify's channel and lets the blocking
        // receiver exit instead of waiting forever on an invalid unwatch path.
        self.watcher.take();
    }
}

impl Drop for FolderWatcher {
    fn drop(&mut self) {
        self.stop();
    }
}
