//! Guest playback sync: NTP-style clock estimate plus drift actions (lobby.md §5.1).

use std::collections::VecDeque;

use serde::Serialize;

use crate::session::protocol::PlaybackState;

pub const PING_INTERVAL_MS: u64 = 1000;
pub const EVAL_INTERVAL_MS: u64 = 250;
pub const RTT_EWMA_ALPHA: f64 = 0.2;
pub const OFFSET_EWMA_ALPHA: f64 = 0.1;
pub const DRIFT_EWMA_ALPHA: f64 = 0.3;
pub const CORRECTION_EWMA_ALPHA: f64 = 0.5;
pub const RTT_OUTLIER_GRACE_MS: f64 = 20.0;
pub const DRIFT_DEADBAND_MS: f64 = 150.0;
pub const DRIFT_SOFT_MS: f64 = 500.0;
pub const DRIFT_SEEK_MS: f64 = 2000.0;
pub const MAX_RATE_ADJUST: f64 = 0.05;
/// 5% per 500 ms.
pub const RATE_GAIN: f64 = 0.05 / 500.0;
pub const STABLE_SAMPLES: u32 = 3;
pub const HIST: usize = 8;

fn ewma(previous: Option<f64>, sample: f64, alpha: f64) -> f64 {
    match previous {
        Some(value) => value + alpha * (sample - value),
        None => sample,
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct ClockEstimate {
    pub offset_ms: f64,
    pub rtt_ms: f64,
    pub min_rtt_ms: f64,
}

#[derive(Debug, Default)]
pub struct ClockSync {
    pending: VecDeque<u64>,
    offset_ms: Option<f64>,
    rtt_ms: Option<f64>,
    min_rtt_ms: Option<f64>,
}

impl ClockSync {
    pub fn on_ping(&mut self, id: u64) {
        self.pending.push_back(id);
        if self.pending.len() > HIST {
            self.pending.pop_front();
        }
    }

    /// None for stale/unknown id.
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
        // Far-above-minimum RTT samples are dropped.
        if rtt <= min_rtt.mul_add(4.0, RTT_OUTLIER_GRACE_MS) {
            self.offset_ms = Some(ewma(self.offset_ms, offset, OFFSET_EWMA_ALPHA));
        }
        Some(ClockEstimate {
            offset_ms: self.offset_ms.unwrap_or(offset),
            rtt_ms: smoothed_rtt,
            min_rtt_ms: min_rtt,
        })
    }

    pub fn estimate(&self) -> Option<ClockEstimate> {
        Some(ClockEstimate {
            offset_ms: self.offset_ms?,
            rtt_ms: self.rtt_ms.unwrap_or(self.min_rtt_ms?),
            min_rtt_ms: self.min_rtt_ms?,
        })
    }
}

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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DriftAction {
    None,
    Soft,
    Medium,
    Hard,
}

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

/// Guest ahead slows playback.
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

/// None while stabilizing/seeking; None action relaxes rate to 1.0.
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
    pub fn correction(&self) -> f64 {
        self.correction
    }

    pub fn awaiting_restart(&self) -> bool {
        self.awaiting_restart
    }

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

    pub fn on_playback_restart(&mut self) {
        self.awaiting_restart = false;
        self.smooth_ms = Some(0.0);
        self.last = None;
        self.stable = 0;
    }
}

pub const LAG_GOOD_RTT_MS: f64 = 150.0;
pub const LAG_FAIR_RTT_MS: f64 = 400.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LagStatus {
    Good,
    Fair,
    Poor,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SyncInstruction {
    SetRate(f64),
    Seek(f64),
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SyncInstructionDto {
    SetRate { rate: f64 },
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

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSample {
    pub instruction: Option<SyncInstructionDto>,
    pub lag: LagStatus,
    pub rtt_ms: f64,
    pub drift_ms: f64,
    pub correction: f64,
    pub awaiting_restart: bool,
    pub have_snapshot: bool,
    pub identity_ok: bool,
    pub offset_ms: f64,
}

#[derive(Debug, Default)]
pub struct SyncRuntime {
    clock: ClockSync,
    controller: SyncController,
    snapshot: Option<PlaybackState>,
    drift_ms: f64,
    manual_offset_ms: f64,
}

impl SyncRuntime {
    pub fn on_ping(&mut self, id: u64) {
        self.clock.on_ping(id);
    }

    pub fn on_pong(
        &mut self,
        id: u64,
        t1_ms: f64,
        t2_ms: f64,
        t3_ms: f64,
    ) -> Option<ClockEstimate> {
        self.clock.on_pong(id, t1_ms, t2_ms, t3_ms)
    }

    pub fn estimate(&self) -> Option<ClockEstimate> {
        self.clock.estimate()
    }

    pub fn on_host_state(&mut self, state: PlaybackState) {
        match &self.snapshot {
            Some(current) if state.revision < current.revision => {}
            _ => self.snapshot = Some(state),
        }
    }

    pub fn snapshot(&self) -> Option<&PlaybackState> {
        self.snapshot.as_ref()
    }

    pub fn drift_ms(&self) -> f64 {
        self.drift_ms
    }

    pub fn offset_ms(&self) -> f64 {
        self.manual_offset_ms
    }

    /// Aligns content, not container timestamps.
    pub fn set_offset_ms(&mut self, offset_ms: f64) {
        if offset_ms.is_finite() {
            self.manual_offset_ms = offset_ms;
        }
    }

    pub fn rtt_ms(&self) -> f64 {
        self.clock
            .estimate()
            .map_or(0.0, |estimate| estimate.rtt_ms)
    }

    pub fn correction(&self) -> f64 {
        self.controller.correction()
    }

    pub fn awaiting_restart(&self) -> bool {
        self.controller.awaiting_restart()
    }

    /// Wrong file is never steered.
    pub fn sample(
        &mut self,
        now_ms: f64,
        local_position: f64,
        local_media_id: &str,
    ) -> Option<SyncInstruction> {
        let snapshot = self.snapshot.clone()?;
        if snapshot.media_id != local_media_id {
            // Drop stale drift/correction for the previous media.
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

    pub fn on_playback_restart(&mut self) {
        self.controller.on_playback_restart();
    }

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
        // offset 0, 20 ms RTT.
        runtime.on_pong(1, 0.0, 10.0, 20.0).expect("known ping");
        runtime
    }

    #[test]
    fn runtime_needs_both_estimate_and_snapshot() {
        let mut runtime = SyncRuntime::default();
        assert!(runtime.sample(100.0, 100.0, "ep1").is_none());
        runtime.on_ping(1);
        runtime.on_pong(1, 0.0, 10.0, 20.0);
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
        assert_eq!(runtime.lag_status(), LagStatus::Good);
        assert_eq!(SyncRuntime::default().lag_status(), LagStatus::Poor);
    }

    /// 350 ms lead converges into the deadband under soft correction.
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
        runtime.sample(20.0, 105.0, "ep1");
        assert!(
            runtime.drift_ms() > 4_900.0,
            "expected a large lead, got {}",
            runtime.drift_ms()
        );
        // With the offset, drift collapses into the deadband.
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

    #[test]
    fn sample_refuses_a_snapshot_for_another_media() {
        let mut runtime = primed_runtime();
        let report = runtime.sample_report(20.0, 500.0, "ep2");
        assert!(report.have_snapshot);
        assert!(!report.identity_ok);
        assert!(report.instruction.is_none());
        assert_eq!(runtime.drift_ms(), 0.0);
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
        assert!(matches!(
            report.instruction,
            Some(SyncInstructionDto::SetRate { rate }) if (rate - 1.0).abs() < 1e-9
        ));
    }
}
