use serde::{Deserialize, Serialize};

/// Entity a card can represent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CardKind {
    Anime,
    Manga,
    Character,
    Staff,
    Studio,
}

impl CardKind {
    pub const ALL: [CardKind; 5] = [
        CardKind::Anime,
        CardKind::Manga,
        CardKind::Character,
        CardKind::Staff,
        CardKind::Studio,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            CardKind::Anime => "anime",
            CardKind::Manga => "manga",
            CardKind::Character => "character",
            CardKind::Staff => "staff",
            CardKind::Studio => "studio",
        }
    }

    pub fn from_db(value: &str) -> Option<Self> {
        match value {
            "anime" => Some(CardKind::Anime),
            "manga" => Some(CardKind::Manga),
            "character" => Some(CardKind::Character),
            "staff" => Some(CardKind::Staff),
            "studio" => Some(CardKind::Studio),
            _ => None,
        }
    }
}

/// Whether a pack's card composition has been prepared in the background.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CardPackContentsState {
    Pending,
    Ready,
    Failed,
}

impl CardPackContentsState {
    pub fn as_str(self) -> &'static str {
        match self {
            CardPackContentsState::Pending => "pending",
            CardPackContentsState::Ready => "ready",
            CardPackContentsState::Failed => "failed",
        }
    }

    pub fn from_db(value: &str) -> Option<Self> {
        match value {
            "pending" => Some(CardPackContentsState::Pending),
            "ready" => Some(CardPackContentsState::Ready),
            "failed" => Some(CardPackContentsState::Failed),
            _ => None,
        }
    }
}

/// Intrinsic entity tier, frozen when the card is first acquired.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CardRarity {
    Junk,
    Common,
    Rare,
    Epic,
    Legendary,
}

impl CardRarity {
    pub const ALL: [CardRarity; 5] = [
        CardRarity::Junk,
        CardRarity::Common,
        CardRarity::Rare,
        CardRarity::Epic,
        CardRarity::Legendary,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            CardRarity::Junk => "junk",
            CardRarity::Common => "common",
            CardRarity::Rare => "rare",
            CardRarity::Epic => "epic",
            CardRarity::Legendary => "legendary",
        }
    }

    pub fn from_db(value: &str) -> Option<Self> {
        match value {
            "junk" => Some(CardRarity::Junk),
            "common" => Some(CardRarity::Common),
            "rare" => Some(CardRarity::Rare),
            "epic" => Some(CardRarity::Epic),
            "legendary" => Some(CardRarity::Legendary),
            _ => None,
        }
    }
}

/// Visual finish of a card. The stored value already includes its multiplier.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CardVariant {
    Normal,
    Foil,
    Holo,
}

impl CardVariant {
    pub const ALL: [CardVariant; 3] =
        [CardVariant::Normal, CardVariant::Foil, CardVariant::Holo];

    pub fn as_str(self) -> &'static str {
        match self {
            CardVariant::Normal => "normal",
            CardVariant::Foil => "foil",
            CardVariant::Holo => "holo",
        }
    }

    pub fn from_db(value: &str) -> Option<Self> {
        match value {
            "normal" => Some(CardVariant::Normal),
            "foil" => Some(CardVariant::Foil),
            "holo" => Some(CardVariant::Holo),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RarityBaseValues {
    pub junk: u32,
    pub common: u32,
    pub rare: u32,
    pub epic: u32,
    pub legendary: u32,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VariantMultipliers {
    pub normal: f64,
    pub foil: f64,
    pub holo: f64,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VariantWeights {
    pub normal: u32,
    pub foil: u32,
    pub holo: u32,
}

/// One kind/count pair inside a pack. Editing this list is the only change
/// needed to add a mixed or themed pack.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackSlot {
    pub kind: CardKind,
    pub count: usize,
}

/// A weighted kind roll for a mixed pack.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackChance {
    pub kind: CardKind,
    pub weight: u32,
}

/// One purchasable pack. `contents` is an exact mix; `chances` is a per-card
/// weighted roll. Exactly one of them drives sampling.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShopPackConfig {
    pub pack_kind: &'static str,
    pub price: i64,
    pub size: usize,
    pub contents: &'static [PackSlot],
    pub chances: &'static [PackChance],
}

/// Static card rules returned to the frontend. Rust owns every value here.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardsConfig {
    pub pack_size: usize,
    pub guaranteed_rare_plus: bool,
    pub base_values: RarityBaseValues,
    pub variant_multipliers: VariantMultipliers,
    pub variant_weights: VariantWeights,
    pub shop_packs: Vec<ShopPackConfig>,
    pub kinds: Vec<CardKind>,
    pub rarities: Vec<CardRarity>,
    pub variants: Vec<CardVariant>,
}

/// Everything the Collection tab needs before it opens a card surface.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardsBootstrap {
    pub config: CardsConfig,
    pub grant_enabled: bool,
    pub test_tools_enabled: bool,
    pub wallet: i64,
    pub unopened_packs: i64,
    pub starter_granted: bool,
    pub starter_packs: i64,
}
