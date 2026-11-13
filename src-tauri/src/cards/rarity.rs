use super::config::{base_value, variant_multiplier};
use super::types::{CardKind, CardRarity, CardVariant};

/// Score boundaries per kind. Calibrated 2026-11-12 from ten AniList pages
/// per kind (500 samples, 250 for studios) at the 35/35/19/9/2 quantiles.
pub struct TierThresholds {
    pub common: f64,
    pub rare: f64,
    pub epic: f64,
    pub legendary: f64,
}

pub const ANIME_THRESHOLDS: TierThresholds = TierThresholds {
    common: 7.31,
    rare: 8.39,
    epic: 9.90,
    legendary: 11.67,
};

/// Manga uses the same favourites/popularity mix as anime until a separate
/// manga/manhwa sample set is calibrated.
pub const MANGA_THRESHOLDS: TierThresholds = TierThresholds {
    common: 7.31,
    rare: 8.39,
    epic: 9.90,
    legendary: 11.67,
};

pub const CHARACTER_THRESHOLDS: TierThresholds = TierThresholds {
    common: 5.99,
    rare: 7.29,
    epic: 8.02,
    legendary: 10.18,
};

pub const STAFF_THRESHOLDS: TierThresholds = TierThresholds {
    common: 3.83,
    rare: 5.20,
    epic: 6.07,
    legendary: 9.47,
};

/// Studio favourites include a large zero spike; the common boundary sits just
/// above zero so studios with no favourites stay junk.
pub const STUDIO_THRESHOLDS: TierThresholds = TierThresholds {
    common: 0.69,
    rare: 1.79,
    epic: 7.19,
    legendary: 9.58,
};

fn thresholds_for(kind: CardKind) -> &'static TierThresholds {
    match kind {
        CardKind::Anime => &ANIME_THRESHOLDS,
        CardKind::Manga => &MANGA_THRESHOLDS,
        CardKind::Character => &CHARACTER_THRESHOLDS,
        CardKind::Staff => &STAFF_THRESHOLDS,
        CardKind::Studio => &STUDIO_THRESHOLDS,
    }
}

/// Anime use favourites, popularity and a weighted mix.
pub fn anime_score(favourites: u32, popularity: u32) -> f64 {
    0.65 * f64::from(favourites + 1).ln() + 0.35 * f64::from(popularity + 1).ln()
}

/// Characters, staff and studios are scored by favourites only.
pub fn entity_score(favourites: u32) -> f64 {
    f64::from(favourites + 1).ln()
}

/// A character gets a deliberately small bonus from the popularity of the
/// anime they appear in. The anime term is capped in practice by AniList's
/// popularity distribution, so this nudges a character by roughly 0.4-0.6
/// points instead of replacing their own favourites signal.
const CHARACTER_ANIME_POPULARITY_WEIGHT: f64 = 0.04;

pub fn character_score(favourites: u32, anime_popularity: u32) -> f64 {
    entity_score(favourites)
        + CHARACTER_ANIME_POPULARITY_WEIGHT * f64::from(anime_popularity + 1).ln()
}

/// For characters, `popularity` is the popularity of their primary anime.
pub fn score_for(kind: CardKind, favourites: u32, popularity: u32) -> f64 {
    match kind {
        CardKind::Anime | CardKind::Manga => anime_score(favourites, popularity),
        CardKind::Character => character_score(favourites, popularity),
        CardKind::Staff | CardKind::Studio => entity_score(favourites),
    }
}

/// Intrinsic tier for a score, using the thresholds of the entity's kind.
pub fn tier_for(kind: CardKind, score: f64) -> CardRarity {
    let thresholds = thresholds_for(kind);
    if score >= thresholds.legendary {
        CardRarity::Legendary
    } else if score >= thresholds.epic {
        CardRarity::Epic
    } else if score >= thresholds.rare {
        CardRarity::Rare
    } else if score >= thresholds.common {
        CardRarity::Common
    } else {
        CardRarity::Junk
    }
}

fn tier_bounds(kind: CardKind, rarity: CardRarity) -> (f64, f64) {
    let thresholds = thresholds_for(kind);
    match rarity {
        CardRarity::Junk => (0.0, thresholds.common),
        CardRarity::Common => (thresholds.common, thresholds.rare),
        CardRarity::Rare => (thresholds.rare, thresholds.epic),
        CardRarity::Epic => (thresholds.epic, thresholds.legendary),
        CardRarity::Legendary => (
            thresholds.legendary,
            thresholds.legendary + (thresholds.legendary - thresholds.epic).max(1.0),
        ),
    }
}

/// Position of a score inside its tier, 0..1. Clamped so a hot outlier cannot
/// push the value bonus past the tier ceiling.
pub fn tier_position(kind: CardKind, rarity: CardRarity, score: f64) -> f64 {
    let (min, max) = tier_bounds(kind, rarity);
    if max <= min {
        return 0.0;
    }
    ((score - min) / (max - min)).clamp(0.0, 1.0)
}

/// Salvage value frozen at acquisition:
/// `round(BASE[rarity] * (1 + 0.5 * tierPosition) * VARIANT[variant])`.
pub fn card_value(kind: CardKind, rarity: CardRarity, variant: CardVariant, score: f64) -> u32 {
    let position = tier_position(kind, rarity, score);
    let raw = f64::from(base_value(rarity)) * (1.0 + 0.5 * position) * variant_multiplier(variant);
    raw.round() as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    fn close(left: f64, right: f64) -> bool {
        (left - right).abs() < 1e-9
    }

    #[test]
    fn anime_score_mixes_favourites_and_popularity() {
        assert!(close(anime_score(0, 0), 0.0));
        let expected = 0.65 * 80_785_f64.ln() + 0.35 * 1_077_854_f64.ln();
        assert!(close(anime_score(80_784, 1_077_853), expected));
        assert!(anime_score(100, 1000) > anime_score(100, 100));
        assert!(anime_score(1000, 100) > anime_score(100, 100));
    }

    #[test]
    fn reported_title_and_character_counts_explain_their_base_tiers() {
        assert_eq!(
            tier_for(CardKind::Anime, anime_score(418, 26_082)),
            CardRarity::Common
        );
        assert_eq!(
            tier_for(CardKind::Character, entity_score(2_041)),
            CardRarity::Rare
        );
    }

    #[test]
    fn entity_score_only_counts_favourites() {
        assert!(close(entity_score(0), 0.0));
        assert!(close(entity_score(39_304), 39_305_f64.ln()));
        assert!(entity_score(1000) > entity_score(10));
    }

    #[test]
    fn character_score_adds_a_small_anime_popularity_bonus() {
        let uta = character_score(2_041, 754_505);
        assert!((uta - 8.16).abs() < 0.01);
        assert_eq!(tier_for(CardKind::Character, uta), CardRarity::Epic);

        let nadia = character_score(142, 26_082);
        assert!((nadia - 5.36).abs() < 0.01);
        assert_eq!(tier_for(CardKind::Character, nadia), CardRarity::Junk);

        let one_piece_uta = character_score(1_150, 769_142);
        assert_eq!(tier_for(CardKind::Character, one_piece_uta), CardRarity::Rare);

        let levi = character_score(38_718, 1_077_853);
        assert_eq!(tier_for(CardKind::Character, levi), CardRarity::Legendary);
    }

    #[test]
    fn character_anime_popularity_can_raise_but_not_rescue_an_unknown_character() {
        assert!(character_score(2_041, 754_505) > entity_score(2_041));
        assert_eq!(
            tier_for(CardKind::Character, character_score(10, 1_000_000)),
            CardRarity::Junk
        );
    }

    #[test]
    fn tiers_follow_the_kind_thresholds_inclusively() {
        for kind in CardKind::ALL {
            let thresholds = thresholds_for(kind);
            assert_eq!(tier_for(kind, thresholds.common - 0.001), CardRarity::Junk);
            assert_eq!(tier_for(kind, thresholds.common), CardRarity::Common);
            assert_eq!(tier_for(kind, thresholds.rare), CardRarity::Rare);
            assert_eq!(tier_for(kind, thresholds.epic), CardRarity::Epic);
            assert_eq!(tier_for(kind, thresholds.legendary), CardRarity::Legendary);
        }
    }

    #[test]
    fn tier_position_stays_inside_the_unit_range() {
        let kind = CardKind::Character;
        assert!(close(tier_position(kind, CardRarity::Junk, 0.0), 0.0));
        assert!(close(
            tier_position(kind, CardRarity::Legendary, 1_000_000.0),
            1.0
        ));
        let middle = tier_position(
            kind,
            CardRarity::Rare,
            (CHARACTER_THRESHOLDS.rare + CHARACTER_THRESHOLDS.epic) / 2.0,
        );
        assert!(middle > 0.0 && middle < 1.0);
    }

    #[test]
    fn value_uses_base_tier_position_and_variant() {
        assert_eq!(
            card_value(CardKind::Anime, CardRarity::Junk, CardVariant::Normal, 0.0),
            1
        );
        assert_eq!(
            card_value(
                CardKind::Anime,
                CardRarity::Common,
                CardVariant::Normal,
                ANIME_THRESHOLDS.common
            ),
            2
        );
        assert_eq!(
            card_value(
                CardKind::Character,
                CardRarity::Epic,
                CardVariant::Foil,
                CHARACTER_THRESHOLDS.legendary - 0.01
            ),
            34
        );
        assert_eq!(
            card_value(
                CardKind::Studio,
                CardRarity::Legendary,
                CardVariant::Holo,
                1_000_000.0
            ),
            180
        );
    }

    #[test]
    fn a_higher_variant_is_always_worth_more() {
        let normal = card_value(CardKind::Staff, CardRarity::Rare, CardVariant::Normal, 4.0);
        let foil = card_value(CardKind::Staff, CardRarity::Rare, CardVariant::Foil, 4.0);
        let holo = card_value(CardKind::Staff, CardRarity::Rare, CardVariant::Holo, 4.0);
        assert!(normal < foil && foil < holo);
    }
}
