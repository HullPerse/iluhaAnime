use super::types::{DailyMode, DailyTier};

/// FNV-1a over the day, the mode and the pool version. Every install on the
/// same app version resolves the same two daily answers.
pub fn day_seed(day: &str, mode: DailyMode, pool_version: u32) -> u64 {
    let version = pool_version.to_string();
    let mut hash = 0xcbf2_9ce4_8422_2325_u64;
    for byte in day
        .bytes()
        .chain([b'|'])
        .chain(mode.as_str().bytes())
        .chain([b'|'])
        .chain(version.bytes())
    {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash
}

pub fn tier_for(seed: u64) -> DailyTier {
    match seed % 100 {
        0..=24 => DailyTier::Easy,
        25..=59 => DailyTier::Medium,
        _ => DailyTier::Hard,
    }
}

pub fn candidate_index(seed: u64, len: usize) -> usize {
    if len == 0 {
        0
    } else {
        ((seed >> 32) as usize) % len
    }
}

pub fn validate_day(day: &str) -> Result<(), String> {
    let bytes = day.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return Err(format!("invalid daily day: {day}"));
    }
    let two = |start: usize| -> Option<u32> {
        let high = *bytes.get(start)?;
        let low = *bytes.get(start + 1)?;
        if high.is_ascii_digit() && low.is_ascii_digit() {
            Some(u32::from(high - b'0') * 10 + u32::from(low - b'0'))
        } else {
            None
        }
    };
    let year = two(0)
        .and_then(|high| two(2).map(|low| high * 100 + low))
        .ok_or_else(|| format!("invalid daily day: {day}"))?;
    let month = two(5).ok_or_else(|| format!("invalid daily month: {day}"))?;
    let day_of_month = two(8).ok_or_else(|| format!("invalid daily day: {day}"))?;
    if !(2000..=2100).contains(&year)
        || !(1..=12).contains(&month)
        || !(1..=31).contains(&day_of_month)
    {
        return Err(format!("invalid daily day: {day}"));
    }
    Ok(())
}

/// Previous calendar day in the same `YYYY-MM-DD` shape. Used by the streak
/// without pulling in a date crate.
pub fn previous_day(day: &str) -> Option<String> {
    validate_day(day).ok()?;
    let year: i32 = day.get(0..4)?.parse().ok()?;
    let month: u32 = day.get(5..7)?.parse().ok()?;
    let date: u32 = day.get(8..10)?.parse().ok()?;
    let (year, month, date) = if date > 1 {
        (year, month, date - 1)
    } else if month > 1 {
        (year, month - 1, days_in_month(year, month - 1))
    } else {
        (year - 1, 12, 31)
    };
    Some(format!("{year:04}-{month:02}-{date:02}"))
}

fn days_in_month(year: i32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if is_leap_year(year) => 29,
        2 => 28,
        _ => 0,
    }
}

const fn is_leap_year(year: i32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_seed_changes_with_the_day_mode_and_pool_version() {
        let base = day_seed("2026-11-14", DailyMode::Frames, 1);
        assert_eq!(base, day_seed("2026-11-14", DailyMode::Frames, 1));
        assert_ne!(base, day_seed("2026-11-15", DailyMode::Frames, 1));
        assert_ne!(base, day_seed("2026-12-14", DailyMode::Frames, 1));
        assert_ne!(base, day_seed("2027-11-14", DailyMode::Frames, 1));
        assert_ne!(base, day_seed("2026-11-14", DailyMode::Op, 1));
        assert_ne!(base, day_seed("2026-11-14", DailyMode::Frames, 2));
    }

    #[test]
    fn the_tier_weights_favor_the_harder_half() {
        assert_eq!(tier_for(0), DailyTier::Easy);
        assert_eq!(tier_for(24), DailyTier::Easy);
        assert_eq!(tier_for(25), DailyTier::Medium);
        assert_eq!(tier_for(59), DailyTier::Medium);
        assert_eq!(tier_for(60), DailyTier::Hard);
        assert_eq!(tier_for(99), DailyTier::Hard);
    }

    #[test]
    fn the_previous_day_crosses_month_and_year_boundaries() {
        assert_eq!(previous_day("2026-11-14").as_deref(), Some("2026-11-13"));
        assert_eq!(previous_day("2026-11-01").as_deref(), Some("2026-10-31"));
        assert_eq!(previous_day("2026-03-01").as_deref(), Some("2026-02-28"));
        assert_eq!(previous_day("2028-03-01").as_deref(), Some("2028-02-29"));
        assert_eq!(previous_day("2026-01-01").as_deref(), Some("2025-12-31"));
        assert_eq!(previous_day("bad"), None);
    }

    #[test]
    fn the_day_parser_rejects_bad_input() {
        assert!(validate_day("2026-11-14").is_ok());
        assert!(validate_day("2026-1-14").is_err());
        assert!(validate_day("2026-13-14").is_err());
        assert!(validate_day("abcd-ef-gh").is_err());
        assert!(validate_day("2026-11-14x").is_err());
        assert!(validate_day("2026-11-14\n").is_err());
    }
}
