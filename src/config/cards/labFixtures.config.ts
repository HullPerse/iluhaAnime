import type {
  CardKind,
  CardRarity,
  CardVariant,
  OpenedCard,
  ShopPackConfig,
  VariantWeights,
} from "@/types/api/cards";

const KINDS: CardKind[] = ["anime", "manga", "character", "staff", "studio"];
const RARITIES: CardRarity[] = ["junk", "common", "rare", "epic", "legendary"];
const VARIANTS: CardVariant[] = ["normal", "foil", "holo"];

const RARITY_RANK: Record<CardRarity, number> = {
  junk: 0,
  common: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

const BASE_VALUES: Record<CardRarity, number> = {
  junk: 1,
  common: 2,
  rare: 5,
  epic: 15,
  legendary: 40,
};

const VARIANT_MULTIPLIERS: Record<CardVariant, number> = {
  normal: 1,
  foil: 1.5,
  holo: 3,
};

const TITLES: Record<CardKind, string[]> = {
  anime: [
    "Shingeki no Kyojin",
    "Steins;Gate",
    "Frieren",
    "Mushishi",
    "Cowboy Bebop",
  ],
  manga: ["Berserk", "One Piece", "Solo Leveling", "Oyasumi Punpun", "Vagabond"],
  character: ["Levi Ackermann", "Makise Kurisu", "Frieren", "Ginko", "Spike Spiegel"],
  staff: ["Hiroyuki Imaishi", "Yuki Kajiura", "Evan Call", "Yoshiyuki Tomino", "Satoshi Kon"],
  studio: ["Wit Studio", "White Fox", "Madhouse", "Bones", "Kyoto Animation"],
};

const PALETTES: Record<CardKind, [string, string]> = {
  anime: ["#27506f", "#a5d8e8"],
  manga: ["#5e2a1f", "#e4b07a"],
  character: ["#71304e", "#e7a6bf"],
  staff: ["#3d4b27", "#c9dc8a"],
  studio: ["#5b3a22", "#e2b178"],
};

const artCache = new Map<string, string>();

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function art(label: string, kind: CardKind, rarity: CardRarity, seed: number): string {
  const key = `${label}:${kind}:${rarity}:${seed}`;
  const cached = artCache.get(key);
  if (cached !== undefined) return cached;
  const [from, to] = PALETTES[kind];
  const shift = seed % 3;
  const cx = 100 + shift * 80;
  const cy = 190 + (seed % 4) * 35;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="540" viewBox="0 0 360 540"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="360" height="540" fill="url(#g)"/><circle cx="${cx}" cy="${cy}" r="170" fill="rgba(255,255,255,0.16)"/><path d="M0 420 L360 280 L360 540 L0 540 Z" fill="rgba(0,0,0,0.3)"/><text x="180" y="458" text-anchor="middle" fill="#ffffff" font-family="Arial,sans-serif" font-size="28" font-weight="700">${escapeXml(label)}</text><text x="180" y="490" text-anchor="middle" fill="rgba(255,255,255,0.82)" font-family="Arial,sans-serif" font-size="16">${escapeXml(rarity)} / ${escapeXml(kind)}</text></svg>`;
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  artCache.set(key, url);
  return url;
}

function cardValue(rarity: CardRarity, variant: CardVariant, tierPosition: number): number {
  const base = BASE_VALUES[rarity];
  const multiplier = VARIANT_MULTIPLIERS[variant];
  return Math.round(base * (1 + 0.5 * tierPosition) * multiplier);
}

function makeCard(
  kind: CardKind,
  rarity: CardRarity,
  variant: CardVariant,
  rarityIndex: number,
  variantIndex: number
): OpenedCard {
  const title = TITLES[kind][rarityIndex] ?? TITLES[kind][0] ?? kind;
  const entityId = 10_000 + KINDS.indexOf(kind) * 100 + rarityIndex * 10 + variantIndex;
  const tierPosition = rarityIndex / (RARITIES.length - 1);
  return {
    kind,
    entityId,
    title,
    imageUrl: kind === "studio" ? null : art(title, kind, rarity, entityId),
    collage:
      kind === "studio"
        ? [
            art(`${title} 1`, kind, rarity, entityId + 1),
            art(`${title} 2`, kind, rarity, entityId + 2),
            art(`${title} 3`, kind, rarity, entityId + 3),
            art(`${title} 4`, kind, rarity, entityId + 4),
          ]
        : [],
    rarity,
    variant,
    value: cardValue(rarity, variant, tierPosition),
    collectionAnimeId: kind === "character" ? 16498 : null,
    collectionTitle: kind === "character" ? "Shingeki no Kyojin" : null,
    collectionCoverUrl: null,
  };
}

/** Every kind, rarity and variant, in a stable order. */
export const LAB_CARDS: OpenedCard[] = KINDS.flatMap((kind) =>
  RARITIES.flatMap((rarity, rarityIndex) =>
    VARIANTS.map((variant, variantIndex) =>
      makeCard(kind, rarity, variant, rarityIndex, variantIndex)
    )
  )
);

function pick(kind: CardKind, rarity: CardRarity, variant: CardVariant): OpenedCard {
  const found = LAB_CARDS.find(
    (card) => card.kind === kind && card.rarity === rarity && card.variant === variant
  );
  if (found === undefined) {
    throw new Error(`Lab fixture is missing: ${kind}/${rarity}/${variant}`);
  }
  return found;
}

/** Five characters and two anime, with a guaranteed rare. */
export const LAB_PACK: OpenedCard[] = [
  pick("character", "rare", "normal"),
  pick("anime", "epic", "normal"),
  pick("character", "legendary", "holo"),
  pick("character", "common", "normal"),
  pick("anime", "rare", "foil"),
  pick("character", "epic", "foil"),
  pick("character", "junk", "normal"),
];

/** Exactly one 4x3 binder page. */
export const LAB_BINDER: OpenedCard[] = [
  pick("anime", "rare", "foil"),
  pick("character", "epic", "holo"),
  pick("staff", "legendary", "normal"),
  pick("studio", "common", "normal"),
  pick("character", "rare", "normal"),
  pick("anime", "legendary", "holo"),
  pick("staff", "rare", "foil"),
  pick("character", "common", "foil"),
  pick("studio", "epic", "holo"),
  pick("anime", "common", "normal"),
  pick("character", "junk", "normal"),
  pick("staff", "epic", "normal"),
];

export interface LabShelfCharacter {
  id: number;
  name: string;
  imageUrl: string;
  owned: boolean;
}

export interface LabShelfItem {
  id: number;
  title: string;
  cover: string;
  characters: LabShelfCharacter[];
}

/** A shelf page of source anime with owned and missing roster slots. */
export const LAB_SHELF: LabShelfItem[] = Array.from({ length: 4 }, (_, index) => {
  const title = TITLES.anime[index] ?? "Anime";
  return {
    id: 20_000 + index,
    title,
    cover: art(title, "anime", RARITIES[(index + 1) % RARITIES.length] ?? "rare", index),
    characters: Array.from({ length: 8 }, (_, slot) => ({
      id: 30_000 + index * 10 + slot,
      name: `${title} #${slot + 1}`,
      imageUrl: art(`${title} #${slot + 1}`, "character", "common", slot + index),
      owned: slot < 5 - index,
    })),
  };
});

export const LAB_GIFT: OpenedCard = pick("character", "legendary", "holo");

export const LAB_STUDIO: OpenedCard = pick("studio", "legendary", "holo");

/** A studio card with one empty collage cell, to show the monogram fallback. */
export const LAB_STUDIO_PARTIAL: OpenedCard = {
  ...LAB_STUDIO,
  entityId: LAB_STUDIO.entityId + 900,
  title: "Blank Studio",
  collage: LAB_STUDIO.collage.slice(0, 3),
};

export const LAB_SHOP_PACKS: ShopPackConfig[] = [
  {
    packKind: "default",
    price: 120,
    size: 7,
    contents: [],
    chances: [
      { kind: "character", weight: 75 },
      { kind: "anime", weight: 15 },
      { kind: "manga", weight: 10 },
    ],
  },
  {
    packKind: "character",
    price: 120,
    size: 7,
    contents: [{ kind: "character", count: 7 }],
    chances: [],
  },
  {
    packKind: "anime",
    price: 120,
    size: 7,
    contents: [{ kind: "anime", count: 7 }],
    chances: [],
  },
  {
    packKind: "manga",
    price: 120,
    size: 7,
    contents: [{ kind: "manga", count: 7 }],
    chances: [],
  },
  {
    packKind: "staff",
    price: 150,
    size: 7,
    contents: [{ kind: "staff", count: 7 }],
    chances: [],
  },
  {
    packKind: "studio",
    price: 200,
    size: 7,
    contents: [{ kind: "studio", count: 7 }],
    chances: [],
  },
];

export const LAB_VARIANT_WEIGHTS: VariantWeights = { normal: 85, foil: 12, holo: 3 };
export const LAB_WALLET = 500;

/** Debug helper for the matrix counter. */
export function labCombinationCount(): number {
  return KINDS.length * RARITIES.length * VARIANTS.length;
}

/** Exposed only so the lab can explain which tier came from where. */
export function labRarityRank(rarity: CardRarity): number {
  return RARITY_RANK[rarity];
}
