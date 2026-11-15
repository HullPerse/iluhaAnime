use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

use super::seed::{candidate_index, day_seed, tier_for};
use super::types::{DailyMode, DailyTier};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PoolEntry {
    pub media_id: i64,
    pub mal_id: i64,
    pub title: String,
    pub year: Option<i32>,
    pub format: Option<String>,
    pub episodes: Option<i32>,
    #[serde(default)]
    pub genres: Vec<String>,
    pub studio: Option<String>,
    pub score: Option<i32>,
    pub source: Option<String>,
    pub popularity: i64,
    pub tier: DailyTier,
    #[serde(default = "all_modes")]
    pub modes: Vec<DailyMode>,
}

fn all_modes() -> Vec<DailyMode> {
    DailyMode::ALL.to_vec()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailySearchEntry {
    pub media_id: i64,
    pub title: String,
    pub year: Option<i32>,
    pub format: Option<String>,
    pub popularity: i64,
}

#[derive(Debug, Deserialize)]
struct PoolFile {
    version: u32,
    entries: Vec<PoolEntry>,
}

static POOL: OnceLock<Result<PoolFile, String>> = OnceLock::new();

/// Lightweight title index for instant local autocomplete. It deliberately
/// omits the tier: showing the current day's tier would narrow the answer.
pub fn search_index() -> Result<Vec<DailySearchEntry>, String> {
    let file = pool()?;
    let mut entries: Vec<DailySearchEntry> = file
        .entries
        .iter()
        .map(|entry| DailySearchEntry {
            media_id: entry.media_id,
            title: entry.title.clone(),
            year: entry.year,
            format: entry.format.clone(),
            popularity: entry.popularity,
        })
        .collect();
    entries.sort_by(|left, right| {
        right
            .popularity
            .cmp(&left.popularity)
            .then_with(|| left.title.cmp(&right.title))
    });
    Ok(entries)
}

fn pool() -> Result<&'static PoolFile, String> {
    POOL.get_or_init(|| {
        serde_json::from_str::<PoolFile>(include_str!("../../data/daily-pool-v1.json"))
            .map_err(|error| format!("daily pool parse: {error}"))
    })
    .as_ref()
    .map_err(|error| error.clone())
}

#[derive(Debug)]
pub struct Candidate {
    pub mode: DailyMode,
    pub seed: u64,
    pub entry: &'static PoolEntry,
}

/// Deterministic order for the day. The first entry is today's answer; the
/// rest are the reroll queue when a title has fewer than six usable frames.
pub fn candidates(
    day: &str,
    mode: DailyMode,
    exclude: Option<i64>,
) -> Result<Vec<&'static PoolEntry>, String> {
    let file = pool()?;
    let seed = day_seed(day, mode, file.version);
    let tier = tier_for(seed);
    let mut entries: Vec<&'static PoolEntry> = file
        .entries
        .iter()
        .filter(|entry| entry.tier == tier)
        .filter(|entry| entry.modes.contains(&mode))
        .collect();
    candidates_in_seed_order(seed, &mut entries, exclude)
}

fn candidates_in_seed_order(
    seed: u64,
    entries: &mut Vec<&'static PoolEntry>,
    exclude: Option<i64>,
) -> Result<Vec<&'static PoolEntry>, String> {
    entries.sort_by(|left, right| {
        right
            .popularity
            .cmp(&left.popularity)
            .then_with(|| left.media_id.cmp(&right.media_id))
    });
    if entries.is_empty() {
        return Err("daily pool tier has no entries".into());
    }
    let start = candidate_index(seed, entries.len());
    let ordered: Vec<&'static PoolEntry> = (0..entries.len())
        .map(|offset| entries[(start + offset) % entries.len()])
        .filter(|entry| Some(entry.media_id) != exclude)
        .collect();
    if ordered.is_empty() {
        return Err("daily pool has no candidate outside the excluded media".into());
    }
    Ok(ordered)
}

pub fn pick(day: &str, mode: DailyMode, exclude: Option<i64>) -> Result<Candidate, String> {
    let file = pool()?;
    let seed = day_seed(day, mode, file.version);
    let ordered = candidates(day, mode, exclude)?;
    Ok(Candidate {
        mode,
        seed,
        entry: ordered[0],
    })
}

pub fn pick_avoiding(day: &str, mode: DailyMode, excluded: &[i64]) -> Result<Candidate, String> {
    let file = pool()?;
    let seed = day_seed(day, mode, file.version);
    let entry = candidates(day, mode, None)?
        .into_iter()
        .find(|entry| !excluded.contains(&entry.media_id))
        .ok_or_else(|| "daily pool has no candidate outside the excluded media".to_string())?;
    Ok(Candidate { mode, seed, entry })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_pool_parses_and_covers_every_tier() {
        let file = pool().expect("pool");
        assert!(file.version >= 1);
        for tier in [DailyTier::Easy, DailyTier::Medium, DailyTier::Hard] {
            assert!(
                file.entries.iter().any(|entry| entry.tier == tier),
                "missing {tier:?} entries"
            );
        }
        let mut ids = std::collections::HashSet::new();
        for entry in &file.entries {
            assert!(entry.media_id > 0);
            assert!(entry.mal_id > 0);
            assert!(entry.popularity > 0);
            assert!(ids.insert(entry.media_id), "duplicate {}", entry.media_id);
        }
        for mode in DailyMode::ALL {
            let candidates = candidates("2026-11-14", mode, None).expect("mode candidates");
            assert!(!candidates.is_empty(), "no {mode:?} candidates");
            assert!(
                candidates.iter().all(|entry| entry.modes.contains(&mode)),
                "{mode:?} candidates must support the mode"
            );
        }
    }

    #[test]
    fn the_same_day_and_mode_pick_the_same_entry() {
        let first = pick("2026-11-14", DailyMode::Frames, None).expect("first pick");
        let second = pick("2026-11-14", DailyMode::Frames, None).expect("second pick");
        assert_eq!(first.entry.media_id, second.entry.media_id);
        assert_eq!(first.seed, second.seed);
    }

    #[test]
    fn the_op_mode_can_exclude_the_frames_answer() {
        let frames = pick("2026-11-14", DailyMode::Frames, None).expect("frames");
        let op = pick("2026-11-14", DailyMode::Op, Some(frames.entry.media_id)).expect("op");
        assert_ne!(op.entry.media_id, frames.entry.media_id);
    }

    #[test]
    fn the_reroll_queue_starts_with_the_answer_and_has_no_duplicates() {
        let first = pick("2026-11-14", DailyMode::Frames, None).expect("frames");
        let queue = candidates("2026-11-14", DailyMode::Frames, None).expect("queue");
        assert_eq!(queue[0].media_id, first.entry.media_id);
        let mut seen = std::collections::HashSet::new();
        for entry in &queue {
            assert!(seen.insert(entry.media_id), "duplicate reroll entry");
        }
    }
}
