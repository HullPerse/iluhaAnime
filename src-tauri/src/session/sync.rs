//! Guest-side playback sync math (P1: pure computation; P3 wires it into mpv).
//!
//! All clock times are monotonic milliseconds. The guest tracks the host clock
//! offset and RTT with an NTP-style estimator (lobby.md §5.1), derives the
//! expected local position, and classifies smoothed drift into an action.

use std::collections::VecDeque;

use serde::Serialize;

use crate::session::protocol::PlaybackState;

/// Clock-sync ping period.
pub const PING_INTERVAL_MS: u64 = 1000;
/// Drift-check evaluation period.
pub const EVAL_INTERVAL_MS: u64 = 250;
/// EWMA alpha for RTT smoothing.
pub const RTT_EWMA_ALPHA: f64 = 0.2;
/// EWMA alpha for clock-offset smoothing.
pub const OFFSET_EWMA_ALPHA: f64 = 0.1;
/// EWMA alpha for drift smoothing.
pub const DRIFT_EWMA_ALPHA: f64 = 0.3;
/// EWMA alpha for rate-correction smoothing.
pub const CORRECTION_EWMA_ALPHA: f64 = 0.5;
/// Margin for the RTT outlier detector.
pub const RTT_OUTLIER_GRACE_MS: f64 = 20.0;
/// Drift deadband (ms): below this, no correction is needed.
pub const DRIFT_DEADBAND_MS: f64 = 150.0;
/// Soft drift threshold (ms): fine rate correction is enough.
pub const DRIFT_SOFT_MS: f64 = 500.0;
/// Hard drift threshold (ms): resync via seek is required.
pub const DRIFT_SEEK_MS: f64 = 2000.0;
/// Maximum soft rate correction (±5%).
pub const MAX_RATE_ADJUST: f64 = 0.05;
/// Drift-to-rate gain: 5% per 500 ms.
pub const RATE_GAIN: f64 = 0.05 / 500.0;
/// Stable samples needed before Soft/Medium/Hard fire.
pub const STABLE_SAMPLES: u32 = 3;
/// In-flight ping ids to remember.
pub const HIST: usize = 8;

/// Exponentially weighted moving average; the first sample is taken as-is.
fn ewma(previous: Option<f64>, sample: f64, alpha: f64) -> f64 {
    match previous {
        Some(value) => value + alpha * (sample - value),
        None => sample,
    }
}

/// Clock estimate between the guest and host clocks.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct ClockEstimate {
    /// Host clock minus guest clock, in milliseconds.
    pub offset_ms: f64,
    /// Smoothed round-trip time.
    pub rtt_ms: f64,
    /// Smallest observed round-trip time.
    pub min_rtt_ms: f64,
}

/// NTP-style guest-side clock synchronizer.
#[derive(Debug, Default)]
pub struct ClockSync {
    pending: VecDeque<u64>,
    offset_ms: Option<f64>,
    rtt_ms: Option<f64>,
    min_rtt_ms: Option<f64>,
}

impl ClockSync {
    /// Record an outgoing ping.
    pub fn on_ping(&mut self, id: u64) {
        self.pending.push_back(id);
        if self.pending.len() > HIST {
            self.pending.pop_front();
        }
    }

    /// Process an incoming pong.
    ///
    /// `t1_ms` is the guest ping timestamp, `t2_ms` the host receive timestamp,
    /// `t3_ms` the guest receive timestamp (all monotonic ms). Returns `None`
    /// for a stale or unknown ping id.
    pub fn on_pong(
        &mut self,
        id: u64,
        t1_ms: f64,
        t2_ms: f64,
        t3_ms: f64,
    ) -> Option<ClockEstimate> {
        let position = self.pending.iter().position(|pending| *pending == id)?;
        self.pending.remove(position);
        let rtt = t3_ms - t1_ms;
        let offset = t2_ms - (t1_ms + t3_ms) / 2.0;
        let min_rtt = match self.min_rtt_ms {
            Some(previous) => previous.min(rtt),
            None => rtt,
        };
        self.min_rtt_ms = Some(min_rtt);
        let smoothed_rtt = ewma(self.rtt_ms, rtt, RTT_EWMA_ALPHA);
        self.rtt_ms = Some(smoothed_rtt);
        // Drop offset samples whose RTT is far above the observed minimum.
        if rtt <= min_rtt.mul_add(4.0, RTT_OUTLIER_GRACE_MS) {
            self.offset_ms = Some(ewma(self.offset_ms, offset, OFFSET_EWMA_ALPHA));
        }
        Some(ClockEstimate {
            offset_ms: self.offset_ms.unwrap_or(offset),
            rtt_ms: smoothed_rtt,
            min_rtt_ms: min_rtt,
        })
    }

    /// The current estimate, or `None` until a non-outlier pong lands.
    pub fn estimate(&self) -> Option<ClockEstimate> {
        Some(ClockEstimate {
            offset_ms: self.offset_ms?,
            rtt_ms: self.rtt_ms.unwrap_or(self.min_rtt_ms?),
            min_rtt_ms: self.min_rtt_ms?,
        })
    }
}

/// Expected local position for a host snapshot at guest time `now_ms`.
pub fn expected_position(snapshot: &PlaybackState, estimate: &ClockEstimate, now_ms: f64) -> f64 {
    let host_now = now_ms + estimate.offset_ms - estimate.rtt_ms / 2.0;
    let elapsed_sec = (host_now - snapshot.updated_at_mono) / 1000.0;
    let position = if snapshot.is_playing {
        snapshot.position + elapsed_sec * snapshot.rate
    } else {
        snapshot.position
    };
    position.max(0.0)
}

/// Corrective action classes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DriftAction {
    /// Inside the deadband; nothing to do.
    None,
    /// Fine rate correction.
    Soft,
    /// Stronger rate correction.
    Medium,
    /// Seek-based resync.
    Hard,
}

/// Classify a drift sample (guest minus expected, ms) into an action.
pub fn classify_drift(drift_ms: f64) -> Option<DriftAction> {
    let magnitude = drift_ms.abs();
    if magnitude <= DRIFT_DEADBAND_MS {
        return None;
    }
    if magnitude <= DRIFT_SOFT_MS {
        return Some(DriftAction::Soft);
    }
    if magnitude <= DRIFT_SEEK_MS {
        return Some(DriftAction::Medium);
    }
    Some(DriftAction::Hard)
}

/// Rate target for an action and drift (guest minus expected, ms).
///
/// Positive drift (guest ahead) slows playback down (target < 1.0).
pub fn correction_target(action: Option<DriftAction>, drift_ms: f64) -> f64 {
    match action {
        None | Some(DriftAction::None | DriftAction::Hard) => 1.0,
        Some(DriftAction::Soft) => {
            let target = 1.0 - drift_ms * RATE_GAIN;
            target.clamp(1.0 - MAX_RATE_ADJUST, 1.0 + MAX_RATE_ADJUST)
        }
        Some(DriftAction::Medium) => {
            let target = 1.0 - drift_ms * RATE_GAIN * 2.0;
            target.clamp(1.0 - 2.0 * MAX_RATE_ADJUST, 1.0 + 2.0 * MAX_RATE_ADJUST)
        }
    }
}

/// Hysteresis controller: smooths drift, fires stable actions, tracks rate.
///
/// `on_sample` returns `None` while the action is stabilizing or while a seek
/// resync is in flight; `Some(action)` means "apply now". `DriftAction::None`
/// always fires so the guest rate relaxes back to 1.0 inside the deadband.
#[derive(Debug)]
pub struct SyncController {
    smooth_ms: Option<f64>,
    last: Option<DriftAction>,
    stable: u32,
    correction: f64,
    awaiting_restart: bool,
}

impl Default for SyncController {
    fn default() -> Self {
        Self {
            smooth_ms: Some(0.0),
            last: None,
            stable: 0,
            correction: 1.0,
            awaiting_restart: false,
        }
    }
}

impl SyncController {
    /// Current smoothed rate correction.
    pub fn correction(&self) -> f64 {
        self.correction
    }

    /// Whether a seek resync is in flight.
    pub fn awaiting_restart(&self) -> bool {
        self.awaiting_restart
    }

    /// Feed a drift sample (guest minus expected, ms).
    pub fn on_sample(&mut self, drift_ms: f64) -> Option<DriftAction> {
        if self.awaiting_restart {
            return None;
        }
        let smooth = ewma(self.smooth_ms, drift_ms, DRIFT_EWMA_ALPHA);
        self.smooth_ms = Some(smooth);
        let action = classify_drift(smooth).unwrap_or(DriftAction::None);
        if Some(action) == self.last {
            self.stable += 1;
        } else {
            self.last = Some(action);
            self.stable = 0;
        }
        if action == DriftAction::None {
            self.correction = ewma(
                Some(self.correction),
                correction_target(Some(DriftAction::None), smooth),
                CORRECTION_EWMA_ALPHA,
            );
            return Some(DriftAction::None);
        }
        if self.stable < STABLE_SAMPLES {
            return None;
        }
        if action == DriftAction::Hard {
            self.correction = 1.0;
            self.awaiting_restart = true;
            self.smooth_ms = Some(0.0);
            return Some(DriftAction::Hard);
        }
        self.correction = ewma(
            Some(self.correction),
            correction_target(Some(action), smooth),
            CORRECTION_EWMA_ALPHA,
        );
        Some(action)
    }

    /// Call after the player restarts playback following a seek resync.
    pub fn on_playback_restart(&mut self) {
        self.awaiting_restart = false;
        self.smooth_ms = Some(0.0);
        self.last = None;
        self.stable = 0;
    }
}

/// RTT ceiling (ms) for a good link in the session strip.
pub const LAG_GOOD_RTT_MS: f64 = 150.0;
/// RTT ceiling (ms) for a merely fair link.
pub const LAG_FAIR_RTT_MS: f64 = 400.0;

/// Link quality shown next to a guest in the session strip.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LagStatus {
    /// Low RTT and inside the drift deadband.
    Good,
    /// Usable but drifting or a slow link.
    Fair,
    /// High RTT or a large uncorrected drift.
    Poor,
}

/// A concrete instruction for the local player, derived from the sync engine.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SyncInstruction {
    /// Set the playback rate (`1.0` relaxes back to normal).
    SetRate(f64),
    /// Seek to an absolute position, in seconds.
    Seek(f64),
}

/// Wire form of [`SyncInstruction`] for the player window.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SyncInstructionDto {
    /// Set the playback rate (`1.0` relaxes back to normal).
    SetRate { rate: f64 },
    /// Seek to an absolute position, in seconds.
    Seek { position: f64 },
}

impl From<SyncInstruction> for SyncInstructionDto {
    fn from(instruction: SyncInstruction) -> Self {
        match instruction {
            SyncInstruction::SetRate(rate) => Self::SetRate { rate },
            SyncInstruction::Seek(position) => Self::Seek { position },
        }
    }
}

/// One sync evaluation, returned to the player window.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSample {
    /// The instruction to apply, when the engine decided one is due.
    pub instruction: Option<SyncInstructionDto>,
    /// Link quality for the badge.
    pub lag: LagStatus,
    /// Smoothed RTT (ms).
    pub rtt_ms: f64,
    /// Smoothed drift (guest minus expected, ms).
    pub drift_ms: f64,
    /// Current rate correction (1.0 = nominal).
    pub correction: f64,
    /// Whether a seek resync is still settling.
    pub awaiting_restart: bool,
    /// Whether a host snapshot has been seen (guest positioned yet).
    pub have_snapshot: bool,
    /// The snapshot's `media_id` equals the item the local player shows.
    pub identity_ok: bool,
    /// Manual release offset applied by the guest (ms).
    pub offset_ms: f64,
}

/// Guest-side sync engine: clock estimate + drift controller + latest snapshot.
///
/// Pure with respect to the player: the caller feeds `now` and the local
/// position and applies whatever [`SyncInstruction`] comes back.
#[derive(Debug, Default)]
pub struct SyncRuntime {
    clock: ClockSync,
    controller: SyncController,
    snapshot: Option<PlaybackState>,
    drift_ms: f64,
    /// Guest-set release offset (ms) added to the expected position.
    manual_offset_ms: f64,
}

impl SyncRuntime {
    /// Record an outgoing ping id.
    pub fn on_ping(&mut self, id: u64) {
        self.clock.on_ping(id);
    }

    /// Process a pong; returns the refreshed clock estimate.
    pub fn on_pong(
        &mut self,
        id: u64,
        t1_ms: f64,
        t2_ms: f64,
        t3_ms: f64,
    ) -> Option<ClockEstimate> {
        self.clock.on_pong(id, t1_ms, t2_ms, t3_ms)
    }

    /// Current clock estimate, if any.
    pub fn estimate(&self) -> Option<ClockEstimate> {
        self.clock.estimate()
    }

    /// Store the newest host snapshot; older revisions are ignored.
    pub fn on_host_state(&mut self, state: PlaybackState) {
        match &self.snapshot {
            Some(current) if state.revision < current.revision => {}
            _ => self.snapshot = Some(state),
        }
    }

    /// The host snapshot currently being tracked.
    pub fn snapshot(&self) -> Option<&PlaybackState> {
        self.snapshot.as_ref()
    }

    /// Latest smoothed drift (guest minus expected, ms).
    pub fn drift_ms(&self) -> f64 {
        self.drift_ms
    }

    /// The guest-set release offset (ms).
    pub fn offset_ms(&self) -> f64 {
        self.manual_offset_ms
    }

    /// Set the guest release offset (ms); non-finite values are ignored.
    ///
    /// Some sources differ from the host copy by a constant lead-in (extra
    /// intro, a different cut). The offset shifts the expected position so the
    /// engine aligns the *content* instead of the container timestamps.
    pub fn set_offset_ms(&mut self, offset_ms: f64) {
        if offset_ms.is_finite() {
            self.manual_offset_ms = offset_ms;
        }
    }

    /// Latest smoothed RTT (ms), or 0 before the first pong.
    pub fn rtt_ms(&self) -> f64 {
        self.clock
            .estimate()
            .map_or(0.0, |estimate| estimate.rtt_ms)
    }

    /// Current rate correction (1.0 = nominal).
    pub fn correction(&self) -> f64 {
        self.controller.correction()
    }

    /// Whether a seek resync is still settling.
    pub fn awaiting_restart(&self) -> bool {
        self.controller.awaiting_restart()
    }

    /// Feed the local position; returns the instruction to apply, if any.
    ///
    /// `local_media_id` is the plan item the local player shows: a snapshot
    /// for any other media is refused (no seek, no rate gain), so a guest on
    /// the wrong file is never steered by the host.
    pub fn sample(
        &mut self,
        now_ms: f64,
        local_position: f64,
        local_media_id: &str,
    ) -> Option<SyncInstruction> {
        let snapshot = self.snapshot.clone()?;
        if snapshot.media_id != local_media_id {
            // Out of scope: drop the drift and any correction picked up for
            // the previous media so nothing stale is reported or applied.
            self.drift_ms = 0.0;
            self.controller = SyncController::default();
            return None;
        }
        let estimate = self.clock.estimate()?;
        let expected =
            expected_position(&snapshot, &estimate, now_ms) + self.manual_offset_ms / 1000.0;
        self.drift_ms = (local_position - expected) * 1000.0;
        match self.controller.on_sample(self.drift_ms)? {
            DriftAction::Hard => Some(SyncInstruction::Seek(expected)),
            DriftAction::None | DriftAction::Soft | DriftAction::Medium => {
                Some(SyncInstruction::SetRate(self.controller.correction()))
            }
        }
    }

    /// Evaluate one sync tick and package the result for the player window.
    ///
    /// `local_media_id` is the plan item the local player shows; when it does
    /// not match the snapshot, the sample carries no instruction.
    pub fn sample_report(
        &mut self,
        now_ms: f64,
        local_position: f64,
        local_media_id: &str,
    ) -> SyncSample {
        let identity_ok = self
            .snapshot
            .as_ref()
            .is_some_and(|state| state.media_id == local_media_id);
        let instruction = self
            .sample(now_ms, local_position, local_media_id)
            .map(Into::into);
        SyncSample {
            instruction,
            identity_ok,
            lag: self.lag_status(),
            rtt_ms: self.rtt_ms(),
            drift_ms: self.drift_ms,
            correction: self.correction(),
            awaiting_restart: self.awaiting_restart(),
            have_snapshot: self.snapshot.is_some(),
            offset_ms: self.manual_offset_ms,
        }
    }

    /// Call after the player restarts following a seek resync.
    pub fn on_playback_restart(&mut self) {
        self.controller.on_playback_restart();
    }

    /// Link quality for the strip.
    pub fn lag_status(&self) -> LagStatus {
        let Some(estimate) = self.clock.estimate() else {
            return LagStatus::Poor;
        };
        let drift = self.drift_ms.abs();
        if estimate.rtt_ms <= LAG_GOOD_RTT_MS && drift <= DRIFT_DEADBAND_MS {
            LagStatus::Good
        } else if estimate.rtt_ms <= LAG_FAIR_RTT_MS && drift <= DRIFT_SOFT_MS {
            LagStatus::Fair
        } else {
            LagStatus::Poor
        }
    }

    /// Forget all estimates and host state (used on reconnect).
    pub fn reset(&mut self) {
        self.clock = ClockSync::default();
        self.controller = SyncController::default();
        self.snapshot = None;
        self.drift_ms = 0.0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot(position: f64, is_playing: bool, rate: f64, mono: f64) -> PlaybackState {
        PlaybackState {
            revision: 1,
            media_id: "m".into(),
            position,
            is_playing,
            rate,
            updated_at_mono: mono,
        }
    }

    #[test]
    fn ewma_takes_first_sample_as_is_then_blends() {
        assert!((ewma(None, 5000.0, OFFSET_EWMA_ALPHA) - 5000.0).abs() < 1e-9);
        assert!((ewma(Some(100.0), 600.0, RTT_EWMA_ALPHA) - 200.0).abs() < 1e-9);
    }

    #[test]
    fn clock_sync_first_sample_sets_offset_and_rtt() {
        let mut sync = ClockSync::default();
        sync.on_ping(1);
        let estimate = sync.on_pong(1, 0.0, 5050.0, 100.0).expect("known id");
        assert!((estimate.offset_ms - 5000.0).abs() < 1e-9);
        assert!((estimate.rtt_ms - 100.0).abs() < 1e-9);
        assert!((estimate.min_rtt_ms - 100.0).abs() < 1e-9);
    }

    #[test]
    fn clock_sync_outlier_keeps_offset_but_updates_rtt() {
        let mut sync = ClockSync::default();
        sync.on_ping(1);
        sync.on_pong(1, 0.0, 5050.0, 100.0).expect("known id");
        sync.on_ping(2);
        let estimate = sync.on_pong(2, 1000.0, 6300.0, 1600.0).expect("known id");
        assert!((estimate.offset_ms - 5000.0).abs() < 1e-6);
        assert!((estimate.rtt_ms - 200.0).abs() < 1e-6);
        assert!((estimate.min_rtt_ms - 100.0).abs() < 1e-9);
    }

    #[test]
    fn clock_sync_stale_id_returns_none() {
        let mut sync = ClockSync::default();
        sync.on_ping(1);
        assert!(sync.on_pong(99, 0.0, 0.0, 10.0).is_none());
    }

    #[test]
    fn expected_position_advances_while_playing() {
        let estimate = ClockEstimate {
            offset_ms: 5000.0,
            rtt_ms: 100.0,
            min_rtt_ms: 100.0,
        };
        let position = expected_position(&snapshot(10.0, true, 2.0, 5000.0), &estimate, 1000.0);
        assert!((position - 11.9).abs() < 1e-9, "got {position}");
    }

    #[test]
    fn expected_position_freezes_while_paused() {
        let estimate = ClockEstimate {
            offset_ms: 5000.0,
            rtt_ms: 100.0,
            min_rtt_ms: 100.0,
        };
        let position = expected_position(&snapshot(3.0, false, 1.0, 5000.0), &estimate, 1000.0);
        assert!((position - 3.0).abs() < 1e-9, "got {position}");
    }

    #[test]
    fn classify_boundaries() {
        assert_eq!(classify_drift(0.0), None);
        assert_eq!(classify_drift(150.0), None);
        assert_eq!(classify_drift(-150.0), None);
        assert_eq!(classify_drift(150.0001), Some(DriftAction::Soft));
        assert_eq!(classify_drift(500.0), Some(DriftAction::Soft));
        assert_eq!(classify_drift(-500.0), Some(DriftAction::Soft));
        assert_eq!(classify_drift(500.0001), Some(DriftAction::Medium));
        assert_eq!(classify_drift(2000.0), Some(DriftAction::Medium));
        assert_eq!(classify_drift(-2000.0), Some(DriftAction::Medium));
        assert_eq!(classify_drift(2000.0001), Some(DriftAction::Hard));
        assert_eq!(classify_drift(-2000.0001), Some(DriftAction::Hard));
    }

    #[test]
    fn correction_targets_match_gain_and_clamps() {
        assert!((correction_target(None, 350.0) - 1.0).abs() < 1e-9);
        assert!((correction_target(Some(DriftAction::Hard), 3000.0) - 1.0).abs() < 1e-9);
        assert!((correction_target(Some(DriftAction::Soft), 350.0) - 0.965).abs() < 1e-9);
        assert!((correction_target(Some(DriftAction::Soft), -350.0) - 1.035).abs() < 1e-9);
        assert!((correction_target(Some(DriftAction::Soft), 500.0) - 0.95).abs() < 1e-9);
        assert!((correction_target(Some(DriftAction::Soft), 5000.0) - 0.95).abs() < 1e-9);
        assert!((correction_target(Some(DriftAction::Medium), 3000.0) - 0.9).abs() < 1e-9);
        assert!((correction_target(Some(DriftAction::Medium), -3000.0) - 1.1).abs() < 1e-9);
    }

    #[test]
    fn controller_soft_action_needs_stable_samples() {
        let mut controller = SyncController::default();
        let actions: Vec<Option<DriftAction>> =
            (0..5).map(|_| controller.on_sample(350.0)).collect();
        assert_eq!(
            actions,
            vec![
                Some(DriftAction::None),
                None,
                None,
                None,
                Some(DriftAction::Soft),
            ]
        );
        assert!(
            (controller.correction() - 0.985_441_225).abs() < 1e-6,
            "got {}",
            controller.correction()
        );
    }

    #[test]
    fn controller_hard_action_latches_until_restart() {
        let mut controller = SyncController::default();
        let mut actions = Vec::new();
        for _ in 0..7 {
            actions.push(controller.on_sample(3000.0));
        }
        assert_eq!(actions[6], Some(DriftAction::Hard));
        assert!((controller.correction() - 1.0).abs() < 1e-9);
        assert!(controller.awaiting_restart());
        assert!(controller.on_sample(3000.0).is_none());
        controller.on_playback_restart();
        assert!(!controller.awaiting_restart());
    }

    fn host_state(revision: u64, position: f64, is_playing: bool) -> PlaybackState {
        PlaybackState {
            revision,
            media_id: "ep1".into(),
            position,
            is_playing,
            rate: 1.0,
            updated_at_mono: 0.0,
        }
    }

    fn primed_runtime() -> SyncRuntime {
        let mut runtime = SyncRuntime::default();
        runtime.on_host_state(host_state(1, 100.0, true));
        runtime.on_ping(1);
        // offset 0 (host clock == guest clock), 20 ms RTT.
        runtime.on_pong(1, 0.0, 10.0, 20.0).expect("known ping");
        runtime
    }

    #[test]
    fn runtime_needs_both_estimate_and_snapshot() {
        let mut runtime = SyncRuntime::default();
        assert!(runtime.sample(100.0, 100.0, "ep1").is_none());
        runtime.on_ping(1);
        runtime.on_pong(1, 0.0, 10.0, 20.0);
        // No host state yet.
        assert!(runtime.sample(100.0, 100.0, "ep1").is_none());
        runtime.on_host_state(host_state(1, 100.0, true));
        assert!(runtime.sample(100.0, 100.0, "ep1").is_some());
    }

    #[test]
    fn runtime_ignores_stale_host_revisions() {
        let mut runtime = primed_runtime();
        runtime.on_host_state(host_state(3, 42.0, false));
        assert_eq!(runtime.snapshot().map(|state| state.revision), Some(3));
        runtime.on_host_state(host_state(2, 999.0, true));
        assert_eq!(runtime.snapshot().map(|state| state.revision), Some(3));
    }

    #[test]
    fn runtime_hard_drift_seeks_to_expected() {
        let mut runtime = primed_runtime();
        let mut dispatched = None;
        for _ in 0..6 {
            if let Some(instruction) = runtime.sample(1_000.0, 500.0, "ep1") {
                dispatched = Some(instruction);
                break;
            }
        }
        match dispatched {
            Some(SyncInstruction::Seek(position)) => {
                assert!(
                    (position - 100.99).abs() < 0.05,
                    "expected ~100.99, got {position}"
                );
            }
            other => panic!("expected a seek, got {other:?}"),
        }
        assert!(runtime.awaiting_restart());
    }

    #[test]
    fn lag_status_reflects_rtt_and_drift() {
        let runtime = primed_runtime();
        // 20 ms RTT, no samples yet => drift 0 => good.
        assert_eq!(runtime.lag_status(), LagStatus::Good);
        assert_eq!(SyncRuntime::default().lag_status(), LagStatus::Poor);
    }

    /// Two-peer loopback in numbers: a guest that starts 350 ms ahead slows
    /// down under soft correction and lands inside the deadband.
    #[test]
    fn two_peer_sync_converges_into_the_deadband() {
        let mut guest = primed_runtime();
        let mut local_position = 100.35;
        let mut now_ms = 20.0;
        let mut rate = 1.0;
        for _ in 0..200 {
            now_ms += EVAL_INTERVAL_MS as f64;
            local_position += (EVAL_INTERVAL_MS as f64) / 1000.0 * rate;
            match guest.sample(now_ms, local_position, "ep1") {
                Some(SyncInstruction::SetRate(next)) => rate = next,
                Some(SyncInstruction::Seek(position)) => {
                    local_position = position;
                    guest.on_playback_restart();
                    rate = 1.0;
                }
                None => {}
            }
        }
        assert!(
            guest.drift_ms().abs() <= DRIFT_DEADBAND_MS,
            "drift did not converge: {}",
            guest.drift_ms()
        );
        assert_eq!(guest.lag_status(), LagStatus::Good);
    }

    #[test]
    fn manual_offset_shifts_the_expected_position() {
        let mut runtime = primed_runtime();
        // Guest's copy leads the host by 5 s (extra intro): without an offset
        // the engine reads roughly a 5 s lead.
        runtime.sample(20.0, 105.0, "ep1");
        assert!(
            runtime.drift_ms() > 4_900.0,
            "expected a large lead, got {}",
            runtime.drift_ms()
        );
        // Tell the engine about the 5 s lead-in: drift collapses into the deadband.
        runtime.set_offset_ms(5_000.0);
        runtime.sample(20.0, 105.0, "ep1");
        assert!(
            runtime.drift_ms().abs() <= DRIFT_DEADBAND_MS,
            "offset not applied: {}",
            runtime.drift_ms()
        );
        assert_eq!(runtime.offset_ms(), 5_000.0);
    }

    #[test]
    fn set_offset_ignores_non_finite() {
        let mut runtime = SyncRuntime::default();
        runtime.set_offset_ms(f64::NAN);
        assert_eq!(runtime.offset_ms(), 0.0);
        runtime.set_offset_ms(f64::INFINITY);
        assert_eq!(runtime.offset_ms(), 0.0);
        runtime.set_offset_ms(-250.0);
        assert_eq!(runtime.offset_ms(), -250.0);
    }

    /// The identity invariant: a snapshot for another media never steers the
    /// local player, whatever the drift says.
    #[test]
    fn sample_refuses_a_snapshot_for_another_media() {
        let mut runtime = primed_runtime();
        let report = runtime.sample_report(20.0, 500.0, "ep2");
        assert!(report.have_snapshot);
        assert!(!report.identity_ok);
        assert!(report.instruction.is_none());
        assert_eq!(runtime.drift_ms(), 0.0);
        // The same sample on the matching item syncs as usual (inside the
        // deadband the fresh controller answers immediately).
        let report = runtime.sample_report(20.0, 100.0, "ep1");
        assert!(report.identity_ok);
        assert!(report.instruction.is_some());
        // host_now = 20 - rtt/2 = 10 ms → expected 100.01 → drift −10 ms.
        assert!((report.drift_ms + 10.0).abs() < 1e-6);
    }

    #[test]
    fn sample_report_packages_status_and_instruction() {
        let mut runtime = primed_runtime();
        let report = runtime.sample_report(20.0, 100.0, "ep1");
        assert!(report.have_snapshot);
        assert!(report.identity_ok);
        assert_eq!(report.offset_ms, 0.0);
        assert_eq!(report.lag, LagStatus::Good);
        // Inside the deadband the controller relaxes the rate to nominal.
        assert!(matches!(
            report.instruction,
            Some(SyncInstructionDto::SetRate { rate }) if (rate - 1.0).abs() < 1e-9
        ));
    }
}
