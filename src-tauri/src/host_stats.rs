use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use sysinfo::{Networks, System};

const MIN_REFRESH_INTERVAL: Duration = Duration::from_millis(1000);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostStats {
    pub cpu_usage: f32,
    pub memory_used: u64,
    pub memory_total: u64,
    pub net_rx_bps: u64,
    pub net_tx_bps: u64,
}

const fn zero_stats() -> HostStats {
    HostStats {
        cpu_usage: 0.0,
        memory_used: 0,
        memory_total: 0,
        net_rx_bps: 0,
        net_tx_bps: 0,
    }
}

struct HostStatsState {
    system: Option<System>,
    networks: Option<Networks>,
    last_refresh: Option<Instant>,
    last_sample: Option<(Instant, u64, u64)>,
    cached: HostStats,
}

static STATE: LazyLock<Mutex<HostStatsState>> = LazyLock::new(|| {
    Mutex::new(HostStatsState {
        system: System::new().ok(),
        networks: Networks::new_with_refreshed_list().ok(),
        last_refresh: None,
        last_sample: None,
        cached: zero_stats(),
    })
});

fn interface_totals(networks: &Networks) -> (u64, u64) {
    networks.values().fold((0u64, 0u64), |(rx, tx), data| {
        (
            rx.saturating_add(data.total_received()),
            tx.saturating_add(data.total_transmitted()),
        )
    })
}

fn rate_per_second(now: Instant, at: Instant, current: u64, previous: u64) -> u64 {
    let elapsed_ms = now.duration_since(at).as_millis();
    if elapsed_ms == 0 {
        return 0;
    }
    let elapsed_ms = u64::try_from(elapsed_ms).unwrap_or(u64::MAX);
    current.saturating_sub(previous).saturating_mul(1000) / elapsed_ms.max(1)
}

#[tauri::command]
#[must_use]
pub const fn ping() -> &'static str {
    "pong"
}

#[tauri::command]
pub async fn get_host_stats() -> HostStats {
    tauri::async_runtime::spawn_blocking(sample_host_stats)
        .await
        .unwrap_or_else(|_| zero_stats())
}

fn sample_host_stats() -> HostStats {
    let Ok(mut guard) = STATE.lock() else {
        return zero_stats();
    };
    let state = &mut *guard;
    let now = Instant::now();
    if let Some(last) = state.last_refresh {
        if now.duration_since(last) < MIN_REFRESH_INTERVAL {
            return state.cached.clone();
        }
    }
    let (Some(system), Some(networks)) = (state.system.as_mut(), state.networks.as_mut()) else {
        return zero_stats();
    };
    system.refresh_cpu_all();
    system.refresh_memory();
    networks.refresh(false);
    let (received, sent) = interface_totals(networks);
    let net_bps = match state.last_sample {
        Some((at, prev_rx, prev_tx)) => (
            rate_per_second(now, at, received, prev_rx),
            rate_per_second(now, at, sent, prev_tx),
        ),
        None => (0, 0),
    };
    state.last_refresh = Some(now);
    state.last_sample = Some((now, received, sent));
    state.cached = HostStats {
        cpu_usage: system.global_cpu_usage(),
        memory_used: system.used_memory(),
        memory_total: system.total_memory(),
        net_rx_bps: net_bps.0,
        net_tx_bps: net_bps.1,
    };
    state.cached.clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn native_memory_and_cpu_samples_are_valid() {
        let sample = sample_host_stats();
        assert!(sample.memory_total > 0);
        assert!(sample.memory_used > 0 && sample.memory_used <= sample.memory_total);
        assert!(sample.cpu_usage.is_finite() && (0.0..=100.0).contains(&sample.cpu_usage));
        let next = sample_host_stats();
        assert_eq!(sample.memory_total, next.memory_total);
        assert!(next.memory_used > 0 && next.memory_used <= next.memory_total);
    }

    #[test]
    fn zero_elapsed_yields_zero_rate() {
        let now = Instant::now();
        assert_eq!(rate_per_second(now, now, 1000, 0), 0);
    }

    #[test]
    fn rate_scales_to_seconds() {
        let now = Instant::now();
        let at = now.checked_sub(Duration::from_millis(2000)).unwrap();
        assert_eq!(rate_per_second(now, at, 3000, 1000), 1000);
    }

    #[test]
    fn rate_saturates_on_counter_reset() {
        let now = Instant::now();
        let at = now.checked_sub(Duration::from_millis(1000)).unwrap();
        assert_eq!(rate_per_second(now, at, 10, 1000), 0);
    }

    #[test]
    fn consecutive_samples_use_cumulative_counters() {
        let start = Instant::now();
        let second = start + Duration::from_secs(1);
        let third = second + Duration::from_secs(1);
        assert_eq!(rate_per_second(second, start, 4000, 1000), 3000);
        assert_eq!(rate_per_second(third, second, 6000, 4000), 2000);
    }
}
