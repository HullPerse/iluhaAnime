use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tokio::sync::watch;

/// Thread-safe registry of progress streams backed by tokio watch channels.
/// Each stream has a unique numeric ID and a watch::Sender<f64>.
/// Multiple consumers can subscribe to the same stream (watch::Receiver is cloneable).
pub struct StreamRegistry {
    streams: Arc<Mutex<HashMap<u64, watch::Sender<f64>>>>,
    counter: AtomicU64,
}

impl Clone for StreamRegistry {
    fn clone(&self) -> Self {
        Self {
            streams: self.streams.clone(),
            counter: AtomicU64::new(self.counter.load(Ordering::Relaxed)),
        }
    }
}

impl StreamRegistry {
    pub fn new() -> Self {
        Self {
            streams: Arc::new(Mutex::new(HashMap::new())),
            counter: AtomicU64::new(1),
        }
    }

    /// Create a new progress stream and return its unique ID + Sender.
    pub fn create(&self) -> (u64, watch::Sender<f64>) {
        let id = self.counter.fetch_add(1, Ordering::Relaxed);
        let (tx, _rx) = watch::channel(0.0);
        if let Ok(mut streams) = self.streams.lock() {
            streams.insert(id, tx.clone());
        }
        (id, tx)
    }
}
