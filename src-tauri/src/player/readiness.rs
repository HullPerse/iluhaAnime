use super::diagnostics::StartupTimings;
use std::time::Instant;
use tokio::sync::watch;

#[derive(Clone, Copy, Default, PartialEq)]
enum Phase {
    Starting,
    Ready,
    Failed,
    #[default]
    Closed,
}

#[derive(Clone, Copy, Default)]
struct Preparation {
    generation: u64,
    instance_id: u64,
    phase: Phase,
    started_at: Option<Instant>,
    timings: StartupTimings,
}

pub(super) struct Readiness {
    state: watch::Sender<Preparation>,
}

impl Default for Readiness {
    fn default() -> Self {
        let (state, _) = watch::channel(Preparation::default());
        Self { state }
    }
}

impl Readiness {
    pub fn generation(&self) -> u64 {
        self.state.borrow().generation
    }

    pub fn start(&self) -> u64 {
        let mut generation = 0;
        self.state.send_modify(|state| {
            generation = state.generation.wrapping_add(1);
            *state = Preparation {
                generation,
                instance_id: 0,
                phase: Phase::Starting,
                started_at: Some(Instant::now()),
                timings: StartupTimings::default(),
            };
        });
        generation
    }

    pub fn window_created(&self, generation: u64) {
        self.state.send_if_modified(|state| {
            if state.generation != generation || state.phase == Phase::Closed {
                return false;
            }
            state.timings.window_created_at_ms = state
                .started_at
                .map(|start| start.elapsed().as_secs_f64() * 1000.0);
            true
        });
    }

    pub fn diagnostics(&self) -> (&'static str, StartupTimings) {
        let state = self.state.borrow();
        let phase = match state.phase {
            Phase::Starting => "starting",
            Phase::Ready => "ready",
            Phase::Failed => "failed",
            Phase::Closed => "closed",
        };
        (phase, state.timings)
    }

    pub fn initialized(&self, generation: u64, instance_id: u64) -> bool {
        let mut accepted = false;
        self.state.send_if_modified(|state| {
            if state.generation != generation || instance_id == 0 {
                return false;
            }
            if state.phase == Phase::Ready && state.instance_id == instance_id {
                accepted = true;
                return false;
            }
            if state.phase != Phase::Starting {
                return false;
            }
            accepted = true;
            if state.instance_id == 0 {
                state.timings.native_ready_at_ms = state
                    .started_at
                    .map(|start| start.elapsed().as_secs_f64() * 1000.0);
            }
            state.instance_id = instance_id;
            true
        });
        accepted
    }

    pub fn restart(&self) -> u64 {
        self.state.send_modify(|state| {
            state.instance_id = 0;
            state.phase = Phase::Starting;
            state.started_at = Some(Instant::now());
            state.timings = StartupTimings {
                window_created_at_ms: Some(0.0),
                ..StartupTimings::default()
            };
        });
        self.generation()
    }

    pub fn prepare_instance(&self) -> u64 {
        self.state.send_if_modified(|state| {
            if !matches!(state.phase, Phase::Closed | Phase::Failed) {
                return false;
            }
            state.instance_id = 0;
            state.phase = Phase::Starting;
            state.started_at = Some(Instant::now());
            state.timings = StartupTimings {
                window_created_at_ms: Some(0.0),
                ..StartupTimings::default()
            };
            true
        });
        self.generation()
    }

    pub fn complete(&self, instance_id: u64) -> bool {
        let mut accepted = false;
        self.state.send_if_modified(|state| {
            if instance_id == 0 || state.instance_id != instance_id {
                return false;
            }
            match state.phase {
                Phase::Starting => {
                    state.timings.frontend_ready_at_ms = state
                        .started_at
                        .map(|start| start.elapsed().as_secs_f64() * 1000.0);
                    state.phase = Phase::Ready;
                    accepted = true;
                    true
                }
                Phase::Ready => {
                    accepted = true;
                    false
                }
                _ => false,
            }
        });
        accepted
    }

    pub fn fail(&self, generation: u64) {
        self.state.send_if_modified(|state| {
            if state.generation != generation || state.phase != Phase::Starting {
                return false;
            }
            state.phase = Phase::Failed;
            true
        });
    }

    pub fn close(&self) {
        self.state.send_modify(|state| {
            state.phase = Phase::Closed;
            state.instance_id = 0;
        });
    }

    pub fn close_generation(&self, generation: u64) {
        self.state.send_if_modified(|state| {
            if state.generation != generation {
                return false;
            }
            state.phase = Phase::Closed;
            state.instance_id = 0;
            true
        });
    }

    pub async fn wait(&self, generation: u64) -> Result<(), String> {
        let mut receiver = self.state.subscribe();
        loop {
            let state = *receiver.borrow_and_update();
            if state.generation != generation || state.phase == Phase::Closed {
                return Err("player preparation was canceled".into());
            }
            match state.phase {
                Phase::Ready => return Ok(()),
                Phase::Failed => return Err("player initialization failed".into()),
                _ => {}
            }
            receiver
                .changed()
                .await
                .map_err(|_| "player readiness was closed")?;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preparation_timings_are_bounded_to_the_latest_attempt_and_ignore_obsolete_callbacks() {
        let state = Readiness::default();
        assert_eq!(state.diagnostics().0, "closed");
        let generation = state.start();
        assert!(state.diagnostics().1.frontend_ready_at_ms.is_none());
        state.window_created(generation);
        assert!(state.initialized(generation, 1));
        assert!(state.complete(1));
        let (phase, ready) = state.diagnostics();
        assert_eq!(phase, "ready");
        assert!(ready.window_created_at_ms.unwrap() <= ready.native_ready_at_ms.unwrap());
        assert!(ready.native_ready_at_ms.unwrap() <= ready.frontend_ready_at_ms.unwrap());
        state.initialized(generation, 1);
        state.complete(1);
        state.close();
        assert_eq!(
            state.diagnostics().1.frontend_ready_at_ms,
            ready.frontend_ready_at_ms
        );
        let fresh = state.start();
        state.window_created(generation);
        assert!(!state.initialized(generation, 2));
        let (phase, preparing) = state.diagnostics();
        assert_eq!(phase, "starting");
        assert!(preparing.window_created_at_ms.is_none());
        assert!(preparing.native_ready_at_ms.is_none());
        assert!(preparing.frontend_ready_at_ms.is_none());
        assert_eq!(state.restart(), fresh);
        assert_eq!(state.diagnostics().1.window_created_at_ms, Some(0.0));
    }

    #[tokio::test]
    async fn creation_and_native_init_do_not_complete_frontend_preparation() {
        let state = Readiness::default();
        let generation = state.start();
        let waiting = state.wait(generation);
        tokio::pin!(waiting);
        assert!(futures::poll!(waiting.as_mut()).is_pending());
        assert!(!state.complete(7));
        state.initialized(generation, 7);
        assert!(futures::poll!(waiting.as_mut()).is_pending());
        assert!(!state.complete(8));
        assert!(state.complete(7));
        assert!(waiting.await.is_ok());
        assert!(state.complete(7));
        assert!(state.wait(generation).await.is_ok());
    }

    #[tokio::test]
    async fn completion_is_retained_even_without_a_waiter() {
        let state = Readiness::default();
        let generation = state.start();
        state.initialized(generation, 3);
        assert!(state.complete(3));
        assert!(state.wait(generation).await.is_ok());
    }

    #[tokio::test]
    async fn closing_or_replacing_a_window_rejects_old_completions_and_waiters() {
        let state = Readiness::default();
        let old = state.start();
        state.initialized(old, 4);
        let first = state.wait(old);
        let second = state.wait(old);
        tokio::pin!(first, second);
        assert!(futures::poll!(first.as_mut()).is_pending());
        assert!(futures::poll!(second.as_mut()).is_pending());
        state.close();
        assert!(first.await.is_err());
        assert!(second.await.is_err());
        assert!(!state.initialized(old, 4));
        let fresh = state.start();
        state.initialized(fresh, 5);
        state.initialized(old, 4);
        state.fail(old);
        state.close_generation(old);
        assert!(!state.complete(4));
        assert!(state.wait(old).await.is_err());
        assert!(state.complete(5));
        assert!(state.initialized(fresh, 5));
        assert!(!state.initialized(fresh, 6));
        assert!(state.wait(fresh).await.is_ok());
    }

    #[tokio::test]
    async fn initialization_failure_wakes_waiters_and_allows_a_fresh_attempt() {
        let state = Readiness::default();
        let old = state.start();
        let waiting = state.wait(old);
        tokio::pin!(waiting);
        assert!(futures::poll!(waiting.as_mut()).is_pending());
        state.fail(old);
        assert!(waiting.await.is_err());
        state.initialized(old, 6);
        assert!(!state.complete(6));
        let fresh = state.start();
        state.initialized(fresh, 7);
        assert!(state.complete(7));
        assert!(state.wait(fresh).await.is_ok());
    }

    #[tokio::test]
    async fn restarting_an_instance_preserves_the_window_generation_but_rejects_its_old_token() {
        let state = Readiness::default();
        let generation = state.start();
        state.initialized(generation, 1);
        assert!(state.complete(1));
        state.close();
        assert_eq!(state.restart(), generation);
        state.initialized(generation, 2);
        assert!(!state.complete(1));
        assert!(state.complete(2));
        assert!(state.wait(generation).await.is_ok());
    }

    #[tokio::test]
    async fn a_failed_or_destroyed_instance_can_be_reinitialized_in_the_same_window() {
        let state = Readiness::default();
        let generation = state.start();
        state.fail(generation);
        assert_eq!(state.prepare_instance(), generation);
        state.initialized(generation, 8);
        assert!(state.complete(8));
        state.close();
        assert_eq!(state.prepare_instance(), generation);
        assert!(!state.complete(8));
        state.initialized(generation, 9);
        assert!(state.complete(9));
        assert!(state.wait(generation).await.is_ok());
    }
}
