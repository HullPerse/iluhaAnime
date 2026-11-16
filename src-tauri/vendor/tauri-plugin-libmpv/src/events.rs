use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc::{sync_channel, SyncSender},
    Arc,
};
use std::thread::JoinHandle;

/// The native callback owns only a bounded sender. Delivery owns its captured data.
pub(crate) fn delivery(
    deliver: impl Fn(String) + Send + 'static,
) -> (SyncSender<String>, Arc<AtomicBool>, JoinHandle<()>) {
    let (sender, receiver) = sync_channel(256);
    let alive = Arc::new(AtomicBool::new(true));
    let active = alive.clone();
    let worker = std::thread::spawn(move || {
        for event in receiver {
            if active.load(Ordering::Acquire) {
                deliver(event);
            }
        }
    });
    (sender, alive, worker)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn events_are_delivered_in_order_and_shutdown_drains_the_queue() {
        let (received, events) = std::sync::mpsc::channel();
        let (sender, alive, worker) = delivery(move |event| {
            received.send(event).unwrap();
        });
        sender.send("first".into()).unwrap();
        sender.send("second".into()).unwrap();
        assert_eq!(events.recv().unwrap(), "first");
        assert_eq!(events.recv().unwrap(), "second");
        alive.store(false, Ordering::Release);
        sender.send("stale".into()).unwrap();
        drop(sender);
        worker.join().unwrap();
        assert!(events.try_recv().is_err());
    }
}
