use super::rng::Rng;
use super::types::{
    CardKind, CardRarity, CardVariant, CardsConfig, PackChance, PackSlot, RarityBaseValues,
    ShopPackConfig, VariantMultipliers, VariantWeights,
};

/// Automatic grants stay off until the user's final command.
pub const CARDS_GRANT_ENABLED: bool = false;
/// Test tools stay available until the release checklist hides them.
pub const CARDS_TEST_TOOLS_ENABLED: bool = true;

/// A pack holds seven cards; their kinds come from `SHOP_PACKS`.
pub const CARD_PACK_SIZE: usize = 7;
pub const CARD_GUARANTEED_RARE_PLUS: bool = true;

/// Salvage value base per rarity. Calibrate after the first 100 test packs.
pub const CARD_RARITY_BASE_VALUES: RarityBaseValues = RarityBaseValues {
    junk: 1,
    common: 2,
    rare: 5,
    epic: 15,
    legendary: 40,
};

/// Variant multipliers applied to the salvage value at acquisition.
pub const CARD_VARIANT_MULTIPLIERS: VariantMultipliers = VariantMultipliers {
    normal: 1.0,
    foil: 1.5,
    holo: 3.0,
};

/// Completed titles grant one pack per twelve episodes, capped at five.
pub const EPISODES_PER_PACK: u32 = 12;
pub const MAX_PACKS_PER_COMPLETION: u32 = 5;

/// Variant odds for a freshly generated card.
pub const CARD_VARIANT_WEIGHTS: VariantWeights = VariantWeights {
    normal: 85,
    foil: 12,
    holo: 3,
};

/// Every card in the standard pack independently rolls one of these kinds.
pub const DEFAULT_CHANCES: [PackChance; 3] = [
    PackChance {
        kind: CardKind::Character,
        weight: 75,
    },
    PackChance {
        kind: CardKind::Anime,
        weight: 15,
    },
    PackChance {
        kind: CardKind::Manga,
        weight: 10,
    },
];
const NO_CHANCES: [PackChance; 0] = [];
const CHARACTER_CONTENTS: [PackSlot; 1] = [PackSlot {
    kind: CardKind::Character,
    count: CARD_PACK_SIZE,
}];
const ANIME_CONTENTS: [PackSlot; 1] = [PackSlot {
    kind: CardKind::Anime,
    count: CARD_PACK_SIZE,
}];
const MANGA_CONTENTS: [PackSlot; 1] = [PackSlot {
    kind: CardKind::Manga,
    count: CARD_PACK_SIZE,
}];
const STAFF_CONTENTS: [PackSlot; 1] = [PackSlot {
    kind: CardKind::Staff,
    count: CARD_PACK_SIZE,
}];
const STUDIO_CONTENTS: [PackSlot; 1] = [PackSlot {
    kind: CardKind::Studio,
    count: CARD_PACK_SIZE,
}];

/// Every pack sold in the shop. Add or edit one entry here; the shop UI and
/// pack sampling both read this list. `contents` is the authoritative mix.
pub const SHOP_PACKS: [ShopPackConfig; 6] = [
    ShopPackConfig {
        pack_kind: "default",
        price: 100,
        size: CARD_PACK_SIZE,
        contents: &[],
        chances: &DEFAULT_CHANCES,
    },
    ShopPackConfig {
        pack_kind: "character",
        price: 100,
        size: CARD_PACK_SIZE,
        contents: &CHARACTER_CONTENTS,
        chances: &NO_CHANCES,
    },
    ShopPackConfig {
        pack_kind: "anime",
        price: 100,
        size: CARD_PACK_SIZE,
        contents: &ANIME_CONTENTS,
        chances: &NO_CHANCES,
    },
    ShopPackConfig {
        pack_kind: "manga",
        price: 100,
        size: CARD_PACK_SIZE,
        contents: &MANGA_CONTENTS,
        chances: &NO_CHANCES,
    },
    ShopPackConfig {
        pack_kind: "staff",
        price: 100,
        size: CARD_PACK_SIZE,
        contents: &STAFF_CONTENTS,
        chances: &NO_CHANCES,
    },
    ShopPackConfig {
        pack_kind: "studio",
        price: 100,
        size: CARD_PACK_SIZE,
        contents: &STUDIO_CONTENTS,
        chances: &NO_CHANCES,
    },
];

pub fn shop_pack(pack_kind: &str) -> Option<&'static ShopPackConfig> {
    SHOP_PACKS.iter().find(|pack| pack.pack_kind == pack_kind)
}

/// Weighted variant roll. Normal is the common case; the weights sum to 100.
pub fn pick_variant(rng: &mut Rng) -> CardVariant {
    let roll = rng.next_below(100) as u32;
    if roll < CARD_VARIANT_WEIGHTS.normal {
        CardVariant::Normal
    } else if roll < CARD_VARIANT_WEIGHTS.normal + CARD_VARIANT_WEIGHTS.foil {
        CardVariant::Foil
    } else {
        CardVariant::Holo
    }
}

/// Packs earned by one completed title. A missing episode count still grants one.
pub fn packs_for_completed(episodes: Option<u32>) -> u32 {
    let count = episodes.map_or(1, |total| total.div_ceil(EPISODES_PER_PACK));
    count.clamp(1, MAX_PACKS_PER_COMPLETION)
}

/// Starter packs for the completed count on the AniList profile.
pub fn starter_packs(completed: u32) -> u32 {
    let bonus = completed.isqrt();
    (1 + bonus).clamp(1, MAX_PACKS_PER_COMPLETION)
}

pub fn base_value(rarity: CardRarity) -> u32 {
    match rarity {
        CardRarity::Junk => CARD_RARITY_BASE_VALUES.junk,
        CardRarity::Common => CARD_RARITY_BASE_VALUES.common,
        CardRarity::Rare => CARD_RARITY_BASE_VALUES.rare,
        CardRarity::Epic => CARD_RARITY_BASE_VALUES.epic,
        CardRarity::Legendary => CARD_RARITY_BASE_VALUES.legendary,
    }
}

pub fn variant_multiplier(variant: CardVariant) -> f64 {
    match variant {
        CardVariant::Normal => CARD_VARIANT_MULTIPLIERS.normal,
        CardVariant::Foil => CARD_VARIANT_MULTIPLIERS.foil,
        CardVariant::Holo => CARD_VARIANT_MULTIPLIERS.holo,
    }
}

/// Static rules for the tab. Thresholds are not exposed: only tiers and values are.
pub fn cards_config() -> CardsConfig {
    CardsConfig {
        pack_size: CARD_PACK_SIZE,
        guaranteed_rare_plus: CARD_GUARANTEED_RARE_PLUS,
        base_values: CARD_RARITY_BASE_VALUES,
        variant_multipliers: CARD_VARIANT_MULTIPLIERS,
        variant_weights: CARD_VARIANT_WEIGHTS,
        shop_packs: SHOP_PACKS.to_vec(),
        kinds: CardKind::ALL.to_vec(),
        rarities: CardRarity::ALL.to_vec(),
        variants: CardVariant::ALL.to_vec(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pack_size_adds_up() {
        let default = shop_pack("default").expect("default pack");
        assert!(default.contents.is_empty());
        assert_eq!(
            default
                .chances
                .iter()
                .map(|chance| chance.weight)
                .sum::<u32>(),
            100
        );
        assert_eq!(default.size, CARD_PACK_SIZE);
        assert!(CARD_GUARANTEED_RARE_PLUS);
    }

    #[test]
    fn completed_titles_grant_one_pack_per_twelve_episodes() {
        assert_eq!(packs_for_completed(None), 1);
        assert_eq!(packs_for_completed(Some(0)), 1);
        assert_eq!(packs_for_completed(Some(1)), 1);
        assert_eq!(packs_for_completed(Some(12)), 1);
        assert_eq!(packs_for_completed(Some(13)), 2);
        assert_eq!(packs_for_completed(Some(24)), 2);
        assert_eq!(packs_for_completed(Some(25)), 3);
        assert_eq!(packs_for_completed(Some(49)), 5);
        assert_eq!(packs_for_completed(Some(1000)), 5);
    }

    #[test]
    fn starter_packs_grow_with_the_square_root_and_stop_at_five() {
        assert_eq!(starter_packs(0), 1);
        assert_eq!(starter_packs(1), 2);
        assert_eq!(starter_packs(3), 2);
        assert_eq!(starter_packs(4), 3);
        assert_eq!(starter_packs(9), 4);
        assert_eq!(starter_packs(16), 5);
        assert_eq!(starter_packs(100), 5);
    }

    #[test]
    fn base_values_and_variant_multipliers_are_pinned() {
        assert_eq!(base_value(CardRarity::Junk), 1);
        assert_eq!(base_value(CardRarity::Common), 2);
        assert_eq!(base_value(CardRarity::Rare), 5);
        assert_eq!(base_value(CardRarity::Epic), 15);
        assert_eq!(base_value(CardRarity::Legendary), 40);
        assert!((variant_multiplier(CardVariant::Normal) - 1.0).abs() < 1e-9);
        assert!((variant_multiplier(CardVariant::Foil) - 1.5).abs() < 1e-9);
        assert!((variant_multiplier(CardVariant::Holo) - 3.0).abs() < 1e-9);
    }

    #[test]
    fn config_lists_every_kind_rarity_and_variant() {
        let config = cards_config();
        assert_eq!(config.kinds.len(), 5);
        assert_eq!(config.rarities.len(), 5);
        assert_eq!(config.variants.len(), 3);
        assert_eq!(config.pack_size, 7);
        assert_eq!(config.shop_packs.len(), 6);
        assert_eq!(config.variant_weights.normal, 85);
    }

    #[test]
    fn shop_prices_are_pinned_and_the_default_pack_contains_both_kinds() {
        assert_eq!(shop_pack("default").unwrap().price, 100);
        assert_eq!(shop_pack("character").unwrap().price, 100);
        assert_eq!(shop_pack("anime").unwrap().price, 100);
        assert_eq!(shop_pack("manga").unwrap().price, 100);
        assert_eq!(shop_pack("staff").unwrap().price, 100);
        assert_eq!(shop_pack("studio").unwrap().price, 100);
        let default = shop_pack("default").unwrap();
        assert!(default.contents.is_empty());
        assert_eq!(default.chances.len(), 3);
        assert_eq!(default.chances[0].kind, CardKind::Character);
        assert_eq!(default.chances[0].weight, 75);
        assert_eq!(default.chances[1].kind, CardKind::Anime);
        assert_eq!(default.chances[1].weight, 15);
        assert_eq!(default.chances[2].kind, CardKind::Manga);
        assert_eq!(default.chances[2].weight, 10);
    }

    #[test]
    fn every_weighted_roll_is_a_known_variant() {
        let mut rng = Rng::new(11);
        for _ in 0..200 {
            assert!(CardVariant::ALL.contains(&pick_variant(&mut rng)));
        }
    }
}
