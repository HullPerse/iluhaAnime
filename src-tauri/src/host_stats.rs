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
    system: System,
    networks: Networks,
    last_refresh: Option<Instant>,
    last_sample: Option<(Instant, u64, u64)>,
    cached: HostStats,
}

static STATE: LazyLock<Mutex<HostStatsState>> = LazyLock::new(|| {
    Mutex::new(HostStatsState {
        system: System::new(),
        networks: Networks::new_with_refreshed_list(),
        last_refresh: None,
        last_sample: None,
        cached: zero_stats(),
    })
});

fn interface_totals(networks: &Networks) -> (u64, u64) {
    let mut rx = 0u64;
    let mut tx = 0u64;
    for data in networks.values() {
        rx = rx.saturating_add(data.received());
        tx = tx.saturating_add(data.transmitted());
    }
    (rx, tx)
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
pub fn get_host_stats() -> HostStats {
    let Ok(mut state) = STATE.lock() else {
        return zero_stats();
    };
    let now = Instant::now();
    if let Some(last) = state.last_refresh {
        if now.duration_since(last) < MIN_REFRESH_INTERVAL {
            return state.cached.clone();
        }
    }
    state.system.refresh_cpu_all();
    state.system.refresh_memory();
    state.networks.refresh(false);
    let (received, sent) = interface_totals(&state.networks);
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
        cpu_usage: state.system.global_cpu_usage(),
        memory_used: state.system.used_memory(),
        memory_total: state.system.total_memory(),
        net_rx_bps: net_bps.0,
        net_tx_bps: net_bps.1,
    };
    state.cached.clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zero_elapsed_yields_zero_rate() {
        let now = Instant::now();
        assert_eq!(rate_per_second(now, now, 1000, 0), 0);
    }

    #[test]
    fn rate_scales_to_seconds() {
        let now = Instant::now();
        let at = now - Duration::from_millis(2000);
        assert_eq!(rate_per_second(now, at, 3000, 1000), 1000);
    }

    #[test]
    fn rate_saturates_on_counter_reset() {
        let now = Instant::now();
        let at = now - Duration::from_millis(1000);
        assert_eq!(rate_per_second(now, at, 10, 1000), 0);
    }
}
