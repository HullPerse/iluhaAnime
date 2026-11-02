//! Poison-aware lock helpers.
//!
//! A panic while a lock is held poisons it for the rest of the process. Most of
//! these maps are caches or UI state, so refusing to continue is worse than
//! recovering; every recovery is logged so a repeated panic stays visible
//! instead of silently turning every read into a miss.

use std::sync::{Mutex, MutexGuard, RwLock, RwLockReadGuard, RwLockWriteGuard};

pub fn lock_or_recover<'a, T>(mutex: &'a Mutex<T>, context: &str) -> MutexGuard<'a, T> {
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            tracing::warn!(context, "mutex was poisoned; recovering");
            poisoned.into_inner()
        }
    }
}

pub fn read_or_recover<'a, T>(lock: &'a RwLock<T>, context: &str) -> RwLockReadGuard<'a, T> {
    match lock.read() {
        Ok(guard) => guard,
        Err(poisoned) => {
            tracing::warn!(context, "read lock was poisoned; recovering");
            poisoned.into_inner()
        }
    }
}

pub fn write_or_recover<'a, T>(lock: &'a RwLock<T>, context: &str) -> RwLockWriteGuard<'a, T> {
    match lock.write() {
        Ok(guard) => guard,
        Err(poisoned) => {
            tracing::warn!(context, "write lock was poisoned; recovering");
            poisoned.into_inner()
        }
    }
}
