use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tokio::sync::watch;

pub struct StreamRegistry {
    streams: Arc<Mutex<HashMap<u64, watch::Sender<f64>>>>,
    counter: AtomicU64,
}

pub struct StreamRegistration<'a> {
    registry: &'a StreamRegistry,
    id: u64,
}

impl StreamRegistry {
    pub fn new() -> Self {
        Self {
            streams: Arc::new(Mutex::new(HashMap::new())),
            counter: AtomicU64::new(1),
        }
    }

    pub fn create(&self) -> (u64, watch::Sender<f64>) {
        let id = self.counter.fetch_add(1, Ordering::Relaxed);
        let (tx, _rx) = watch::channel(0.0);
        if let Ok(mut streams) = self.streams.lock() {
            streams.insert(id, tx.clone());
        }
        (id, tx)
    }

    pub const fn registration(&self, id: u64) -> StreamRegistration<'_> {
        StreamRegistration { registry: self, id }
    }

    fn remove(&self, id: u64) {
        if let Ok(mut streams) = self.streams.lock() {
            streams.remove(&id);
        }
    }
}

impl Drop for StreamRegistration<'_> {
    fn drop(&mut self) {
        self.registry.remove(self.id);
    }
}
