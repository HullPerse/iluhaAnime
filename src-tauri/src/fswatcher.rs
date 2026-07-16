use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

pub struct FolderWatcher {
    watcher: Option<RecommendedWatcher>,
    cancel: Arc<AtomicBool>,
    dirty_tx: mpsc::UnboundedSender<PathBuf>,
}

impl FolderWatcher {
    pub fn new() -> Self {
        FolderWatcher {
            watcher: None,
            cancel: Arc::new(AtomicBool::new(false)),
            dirty_tx: mpsc::unbounded_channel().0,
        }
    }

    pub fn start(&mut self, app_handle: AppHandle, folders: Vec<String>) -> Result<(), String> {
        self.cancel.store(false, Ordering::SeqCst);
        let cancel = self.cancel.clone();

        let paths: Vec<PathBuf> = folders.iter().map(|p| PathBuf::from(p)).collect();

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

        // Bridge: blocking notify channel → tokio mpsc
        let cancel_bridge = cancel.clone();
        tokio::task::spawn_blocking(move || loop {
            match rx.recv() {
                Ok(Ok(event)) => {
                    if matches!(
                        event.kind,
                        EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
                    ) {
                        if let Some(path) = event.paths.first() {
                            if let Some(parent) = path.parent().map(|p| p.to_path_buf()) {
                                let _ = dirty_tx.send(parent);
                            }
                        }
                    }
                }
                Ok(Err(_)) => {}
                Err(_) => break,
            }
            if cancel_bridge.load(Ordering::SeqCst) {
                break;
            }
        });

        // Async: debounce dirty paths and emit
        let cancel_deb = cancel.clone();
        let paths_clone = paths.clone();
        let dirty_set: Arc<Mutex<HashSet<PathBuf>>> = Arc::new(Mutex::new(HashSet::new()));
        let set_clone = dirty_set.clone();
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    Some(path) = dirty_rx.recv() => {
                        if let Ok(mut set) = set_clone.lock() {
                            set.insert(path);
                        }
                    }
                    _ = tokio::time::sleep(Duration::from_secs(2)) => {
                        let changed: Vec<String> = {
                            let mut set = match set_clone.lock() {
                                Ok(s) => s,
                                Err(_) => continue,
                            };
                            if set.is_empty() { continue; }
                            set.drain()
                                .filter_map(|p| {
                                    paths_clone.iter().find(|root| p.starts_with(root))
                                        .map(|r| r.to_string_lossy().to_string())
                                })
                                .collect()
                        };
                        if !changed.is_empty() {
                            let _ = app_handle.emit("folder-content-changed", &changed);
                        }
                    }
                }
                if cancel_deb.load(Ordering::SeqCst) {
                    break;
                }
            }
        });

        self.watcher = Some(watcher);
        Ok(())
    }

    pub fn stop(&mut self) {
        self.cancel.store(true, Ordering::SeqCst);
        if let Some(mut w) = self.watcher.take() {
            let _ = w.unwatch(std::path::Path::new(""));
        }
    }
}

impl Drop for FolderWatcher {
    fn drop(&mut self) {
        self.stop();
    }
}
