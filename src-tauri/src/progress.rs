use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

/// Thread-safe registry for tracking progress of long-running operations.
/// Each operation gets a unique numeric ID and reports a 0–100 percentage.
/// Frontend polls via `get_progress` command.
#[derive(Clone)]
pub struct ProgressRegistry {
    map: Arc<Mutex<HashMap<u64, f64>>>,
}

impl ProgressRegistry {
    pub fn new() -> Self {
        ProgressRegistry {
            map: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Create a new progress stream and return its unique ID.
    /// Initial progress is 0.0.
    pub fn create(&self) -> u64 {
        let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
        self.map.lock().unwrap().insert(id, 0.0);
        id
    }

    /// Update progress for a stream (value in 0–100 range).
    pub fn update(&self, id: u64, pct: f64) {
        let mut map = self.map.lock().unwrap();
        if let Some(val) = map.get_mut(&id) {
            *val = pct.clamp(0.0, 100.0);
        }
    }

    /// Get current progress for a stream, or None if the stream doesn't exist (completed/removed).
    pub fn get(&self, id: u64) -> Option<f64> {
        self.map.lock().unwrap().get(&id).copied()
    }

    /// Get all progress entries (for debug/overview).
    #[allow(dead_code)]
    pub fn all(&self) -> Vec<(u64, f64)> {
        self.map
            .lock()
            .unwrap()
            .iter()
            .map(|(&k, &v)| (k, v))
            .collect()
    }

    /// Remove a stream from the registry.
    #[allow(dead_code)]
    pub fn remove(&self, id: u64) {
        self.map.lock().unwrap().remove(&id);
    }
}
