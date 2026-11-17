use std::collections::HashSet;
use std::time::Duration;

use super::pool::PoolEntry;
use super::sources;
use super::types::DailyFrameView;

const FRAME_COUNT: u32 = 6;
const DOWNLOAD_TRIES_PER_FRAME: usize = 24;
const FRAME_DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(12);

/// The screenshot URLs and hints are stored once per game. Only the requested
/// slot is downloaded; the rest stay as a plan until a wrong guess reveals
/// them.
pub struct FramePlan {
    pub urls: Vec<String>,
    pub hints: Vec<(String, String)>,
}

pub async fn build_plan(
    entry: &PoolEntry,
    seed: u64,
    proxy: Option<&str>,
) -> Result<FramePlan, String> {
    let urls = sources::screenshot_urls(entry, proxy).await?;
    if urls.len() < FRAME_COUNT as usize {
        return Err(format!("only {} screenshots available", urls.len()));
    }
    Ok(FramePlan {
        urls,
        hints: hints(entry, seed),
    })
}

pub async fn first_frame(
    plan: &FramePlan,
    seed: u64,
    proxy: Option<&str>,
) -> Result<(DailyFrameView, usize), String> {
    let (data_url, source_index) =
        download_slot(&plan.urls, seed, 0, &HashSet::new(), proxy).await?;
    let (hint_kind, hint_value) = plan
        .hints
        .first()
        .cloned()
        .ok_or_else(|| "daily frame hints are missing".to_string())?;
    Ok((
        DailyFrameView {
            slot: 0,
            data_url,
            hint_kind,
            hint_value,
        },
        source_index,
    ))
}

/// Downloads one frame, skipping source URLs that earlier slots already used.
/// The returned index is persisted so the next slot can avoid it too.
pub async fn download_slot(
    urls: &[String],
    seed: u64,
    slot: u32,
    used: &HashSet<usize>,
    proxy: Option<&str>,
) -> Result<(String, usize), String> {
    for attempt in 0..urls.len().min(DOWNLOAD_TRIES_PER_FRAME) {
        let index = seeded_index(seed, slot, attempt, urls.len());
        if used.contains(&index) {
            continue;
        }
        let downloaded = tokio::time::timeout(
            FRAME_DOWNLOAD_TIMEOUT,
            sources::download_frame(&urls[index], seed, slot, proxy),
        )
        .await
        .map_err(|_| "frame download timed out".to_string())
        .and_then(|result| result);
        match downloaded {
            Ok(data_url) => return Ok((data_url, index)),
            Err(error) => tracing::debug!(
                slot,
                index,
                error = error.as_str(),
                "daily frame download failed"
            ),
        }
    }
    Err(format!("not enough downloadable frames for slot {slot}"))
}

/// Same source selection as `download_slot`, but keeps the whole screenshot
/// for the reveal modal instead of applying the gameplay crop.
pub async fn download_full_slot(
    urls: &[String],
    seed: u64,
    slot: u32,
    used: &HashSet<usize>,
    proxy: Option<&str>,
) -> Result<(String, usize), String> {
    for attempt in 0..urls.len().min(DOWNLOAD_TRIES_PER_FRAME) {
        let index = seeded_index(seed, slot, attempt, urls.len());
        if used.contains(&index) {
            continue;
        }
        let downloaded = tokio::time::timeout(
            FRAME_DOWNLOAD_TIMEOUT,
            sources::download_full_frame(&urls[index], proxy),
        )
        .await
        .map_err(|_| "full frame download timed out".to_string())
        .and_then(|result| result);
        match downloaded {
            Ok(data_url) => return Ok((data_url, index)),
            Err(error) => tracing::debug!(
                slot,
                index,
                error = error.as_str(),
                "daily full frame download failed"
            ),
        }
    }
    Err(format!("not enough full frames for slot {slot}"))
}

fn seeded_index(seed: u64, slot: u32, attempt: usize, len: usize) -> usize {
    let base = ((seed >> 32) as usize) % len;
    (base + slot as usize * 7 + attempt) % len
}

/// Deliberately ordered from the least useful clue to the most useful one.
/// The first frame hides its hint in the UI, so the player starts with the
/// second, vaguer clue and works towards the studio and score.
const HINT_ORDER: [&str; 6] = ["format", "year", "episodes", "genres", "studio", "score"];

pub(crate) fn hints(entry: &PoolEntry, _seed: u64) -> Vec<(String, String)> {
    let mut hints = Vec::with_capacity(FRAME_COUNT as usize);
    for kind in HINT_ORDER {
        let value = match kind {
            "format" => entry.format.clone(),
            "year" => entry.year.map(|year| year.to_string()),
            "episodes" => entry.episodes.map(|episodes| episodes.to_string()),
            "genres" if !entry.genres.is_empty() => Some(entry.genres.join(", ")),
            "studio" => entry.studio.clone(),
            "score" => entry.score.map(|score| score.to_string()),
            _ => None,
        };
        if let Some(value) = value {
            hints.push((kind.to_string(), value));
        }
    }
    if hints.is_empty() {
        hints.push(("format".to_string(), "?".to_string()));
    }
    while hints.len() < FRAME_COUNT as usize {
        hints.push(hints[0].clone());
    }
    hints.truncate(FRAME_COUNT as usize);
    hints
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry() -> PoolEntry {
        PoolEntry {
            media_id: 1,
            mal_id: 1,
            title: "Test".into(),
            year: Some(2013),
            format: Some("TV".into()),
            episodes: Some(25),
            genres: vec!["Action".into(), "Drama".into()],
            studio: Some("Wit Studio".into()),
            score: Some(84),
            source: Some("MANGA".into()),
            popularity: 100,
            tier: super::super::types::DailyTier::Easy,
            modes: vec![
                super::super::types::DailyMode::Frames,
                super::super::types::DailyMode::Op,
                super::super::types::DailyMode::Audio,
            ],
        }
    }

    #[test]
    fn hints_are_deterministic_and_run_from_vague_to_specific() {
        let first = hints(&entry(), 42);
        let second = hints(&entry(), 42);
        assert_eq!(first, second);
        assert_eq!(first.len(), FRAME_COUNT as usize);
        assert_eq!(
            first
                .iter()
                .map(|(kind, _)| kind.as_str())
                .collect::<Vec<_>>(),
            HINT_ORDER
        );
        assert_eq!(first.first().map(|hint| hint.0.as_str()), Some("format"));
        assert_eq!(first.last().map(|hint| hint.0.as_str()), Some("score"));
    }

    #[test]
    fn the_same_seed_picks_the_same_frames() {
        assert_eq!(seeded_index(99, 2, 0, 17), seeded_index(99, 2, 0, 17));
        assert_ne!(seeded_index(99, 2, 0, 17), seeded_index(99, 2, 1, 17));
    }
    #[test]
    fn every_attempt_reaches_every_source_for_short_lists() {
        let indexes: HashSet<usize> = (0..6)
            .map(|attempt| seeded_index(99, 1, attempt, 6))
            .collect();
        assert_eq!(indexes.len(), 6);
    }
}
