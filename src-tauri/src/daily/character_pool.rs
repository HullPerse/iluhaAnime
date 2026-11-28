use super::characters::AnimeAnswer;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Character {
    pub id: i64,
    pub name: String,
    pub aliases: Vec<String>,
    pub image: String,
    pub anime_id: i64,
    pub anime: String,
    pub anime_type: String,
    pub tier: String,
    pub anime_answers: Vec<AnimeAnswer>,
}

#[derive(Deserialize)]
pub(super) struct Pool {
    version: u32,
    pub entries: Vec<Character>,
}

static POOL: OnceLock<Result<Pool, String>> = OnceLock::new();
pub(super) fn pool() -> Result<&'static Pool, String> {
    POOL.get_or_init(read_pool).as_ref().map_err(Clone::clone)
}
fn read_pool() -> Result<Pool, String> {
    let pool: Pool = serde_json::from_str(include_str!("../../data/daily-characters-v1.json"))
        .map_err(|e| e.to_string())?;
    if pool
        .entries
        .iter()
        .any(|c| c.anime_type != "ANIME" || c.anime_id <= 0)
    {
        return Err("character pool must contain anime characters only".into());
    }
    Ok(pool)
}

pub(super) fn roster(day: &str) -> Result<Vec<Character>, String> {
    let ordinal = day_ordinal(day)?;
    let pool = pool()?;
    let mut chosen: Vec<Character> = Vec::new();
    for tier in ["easy", "easy", "medium", "medium", "hard"] {
        let mut candidates: Vec<_> = pool.entries.iter().filter(|c| c.tier == tier).collect();
        candidates.sort_by_key(|c| {
            let mut n = (c.id as u64) ^ u64::from(pool.version);
            n = (n ^ (n >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
            n ^ (n >> 27)
        });
        if candidates.len() < 5 {
            return Err("character tier is too small".into());
        }
        let window = if tier == "hard" { 4 } else { 8 };
        let block = ordinal as usize % (candidates.len() / window);
        let candidates = &candidates[block * window..(block + 1) * window];
        let candidate = candidates
            .iter()
            .find(|c| {
                !chosen
                    .iter()
                    .any(|p| p.id == c.id || p.anime_id == c.anime_id)
            })
            .ok_or("not enough distinct anime")?;
        chosen.push((*candidate).clone());
    }
    Ok(chosen)
}

fn day_ordinal(day: &str) -> Result<u64, String> {
    super::seed::validate_day(day)?;
    let year: u64 = day[..4].parse().map_err(|_| "invalid year")?;
    let month: usize = day[5..7].parse().map_err(|_| "invalid month")?;
    let date: u64 = day[8..].parse().map_err(|_| "invalid date")?;
    let leap = year.is_multiple_of(4) && (!year.is_multiple_of(100) || year.is_multiple_of(400));
    let months = [
        31,
        if leap { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    if date > months[month - 1] {
        return Err("invalid calendar date".into());
    }
    let years: u64 = (2000..year)
        .map(|y| {
            if y.is_multiple_of(4) && (!y.is_multiple_of(100) || y.is_multiple_of(400)) {
                366
            } else {
                365
            }
        })
        .sum();
    Ok(years + months[..month - 1].iter().sum::<u64>() + date - 1)
}
