import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";

import { e2eDatabaseFile } from "../harness";

const LOCAL_USER_ID = 0;
const IMAGE_URL =
  "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498-C6FPmWm59CyP.jpg";

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlNullableNumber(value: number | null): string {
  return value === null ? "NULL" : String(value);
}

function sqlNullableText(value: string | null): string {
  return value === null ? "NULL" : sqlText(value);
}

interface SeedCard {
  kind: "anime" | "manga" | "character";
  entityId: number;
  rarity: "junk" | "common" | "rare" | "epic" | "legendary";
  variant: "normal" | "foil" | "holo" | "cursed";
  value: number;
  copies?: number;
  favorite?: boolean;
}

interface SeedMeta {
  kind: SeedCard["kind"];
  entityId: number;
  title: string;
  collectionAnimeId?: number;
  collectionMangaId?: number;
  collectionTitle?: string;
  collectionCoverUrl?: string;
}

const CARDS: SeedCard[] = [
  {
    kind: "anime",
    entityId: 16498,
    rarity: "legendary",
    variant: "holo",
    value: 900,
    favorite: true,
  },
  { kind: "anime", entityId: 16498, rarity: "rare", variant: "normal", value: 250 },
  { kind: "anime", entityId: 5114, rarity: "epic", variant: "foil", value: 600 },
  { kind: "manga", entityId: 30013, rarity: "rare", variant: "normal", value: 300 },
  { kind: "character", entityId: 45627, rarity: "legendary", variant: "holo", value: 800 },
  { kind: "character", entityId: 45627, rarity: "rare", variant: "normal", value: 200 },
  { kind: "character", entityId: 45628, rarity: "rare", variant: "normal", value: 180 },
  { kind: "character", entityId: 40882, rarity: "epic", variant: "foil", value: 450 },
  { kind: "character", entityId: 40, rarity: "common", variant: "normal", value: 90 },
];

const META: SeedMeta[] = [
  { kind: "anime", entityId: 16498, title: "Attack on Titan" },
  { kind: "anime", entityId: 5114, title: "Fullmetal Alchemist: Brotherhood" },
  { kind: "manga", entityId: 30013, title: "One Piece" },
  {
    kind: "character",
    entityId: 45627,
    title: "Levi Ackerman",
    collectionAnimeId: 16498,
    collectionTitle: "Attack on Titan",
    collectionCoverUrl: IMAGE_URL,
  },
  {
    kind: "character",
    entityId: 45628,
    title: "Erwin Smith",
    collectionAnimeId: 16498,
    collectionTitle: "Attack on Titan",
    collectionCoverUrl: IMAGE_URL,
  },
  {
    kind: "character",
    entityId: 40882,
    title: "Edward Elric",
    collectionAnimeId: 5114,
    collectionTitle: "Fullmetal Alchemist: Brotherhood",
    collectionCoverUrl: IMAGE_URL,
  },
  {
    kind: "character",
    entityId: 40,
    title: "Monkey D. Luffy",
    collectionMangaId: 30013,
    collectionTitle: "One Piece",
    collectionCoverUrl: IMAGE_URL,
  },
];

interface RosterSeed {
  mediaId: number;
  page: number;
  total: number;
  hasNext: boolean;
  characters: { entityId: number; title: string }[];
}

const ROSTERS: RosterSeed[] = [
  {
    mediaId: 16498,
    page: 1,
    total: 6,
    hasNext: true,
    characters: [
      { entityId: 45627, title: "Levi Ackerman" },
      { entityId: 45628, title: "Erwin Smith" },
      { entityId: 45630, title: "Hange Zoe" },
    ],
  },
  {
    mediaId: 16498,
    page: 2,
    total: 6,
    hasNext: false,
    characters: [
      { entityId: 45631, title: "Mikasa Ackerman" },
      { entityId: 45632, title: "Armin Arlert" },
      { entityId: 45633, title: "Eren Yeager" },
    ],
  },
  {
    mediaId: 5114,
    page: 1,
    total: 2,
    hasNext: false,
    characters: [
      { entityId: 40882, title: "Edward Elric" },
      { entityId: 40883, title: "Alphonse Elric" },
    ],
  },
  {
    mediaId: 30013,
    page: 1,
    total: 2,
    hasNext: false,
    characters: [
      { entityId: 40, title: "Monkey D. Luffy" },
      { entityId: 41, title: "Roronoa Zoro" },
    ],
  },
];

function rosterPayload(roster: RosterSeed): string {
  return JSON.stringify({
    characters: roster.characters.map((character) => ({
      entityId: character.entityId,
      title: character.title,
      imageUrl: null,
      favourites: 0,
    })),
    hasNext: roster.hasNext,
    total: roster.total,
  });
}

async function waitForDatabase(timeoutMs = 15_000): Promise<void> {
  const started = Date.now();

  while (!existsSync(e2eDatabaseFile())) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`E2E database did not appear at ${e2eDatabaseFile()}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export async function seedFilledCollection(): Promise<void> {
  await waitForDatabase();
  const database = new Database(e2eDatabaseFile());
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 7 * 24 * 60 * 60;

  try {
    database.exec("PRAGMA busy_timeout = 5000;");
    database.exec("BEGIN IMMEDIATE;");
    database.exec("DELETE FROM user_cards; DELETE FROM card_meta;");
    database.exec("DELETE FROM card_preferred_variant;");
    database.exec(
      "DELETE FROM cache_entries WHERE namespace IN ('cards_roster_page_v2', 'cards_roster_totals');"
    );

    for (const [index, card] of CARDS.entries()) {
      const obtainedAt = now - CARDS.length + index;
      database.exec(
        `INSERT INTO user_cards (
          user_id, kind, entity_id, rarity, variant, copies, value,
          first_obtained_at, last_obtained_at, is_favorite
        ) VALUES (
          ${LOCAL_USER_ID}, ${sqlText(card.kind)}, ${card.entityId}, ${sqlText(card.rarity)},
          ${sqlText(card.variant)}, ${card.copies ?? 1}, ${card.value},
          ${obtainedAt}, ${obtainedAt}, ${card.favorite === true ? 1 : 0}
        );`
      );
    }

    for (const meta of META) {
      database.exec(
        `INSERT INTO card_meta (
          kind, entity_id, title, image_url, score, popularity, favourites,
          collection_anime_id, collection_manga_id, collection_title,
          collection_cover_url, collage_json, fetched_at
        ) VALUES (
          ${sqlText(meta.kind)}, ${meta.entityId}, ${sqlText(meta.title)}, ${sqlText(IMAGE_URL)},
          NULL, NULL, 0, ${sqlNullableNumber(meta.collectionAnimeId ?? null)},
          ${sqlNullableNumber(meta.collectionMangaId ?? null)},
          ${sqlNullableText(meta.collectionTitle ?? null)},
          ${sqlNullableText(meta.collectionCoverUrl ?? null)}, NULL, 1
        );`
      );
    }

    const totals = new Map<number, number>();

    for (const roster of ROSTERS) totals.set(roster.mediaId, roster.total);

    for (const [mediaId, total] of totals) {
      database.exec(
        `INSERT INTO cache_entries (namespace, cache_key, payload, expires_at, updated_at)
         VALUES ('cards_roster_totals', ${sqlText(String(mediaId))}, ${sqlText(String(total))},
                 ${expiresAt}, ${now});`
      );
    }

    for (const roster of ROSTERS) {
      database.exec(
        `INSERT INTO cache_entries (namespace, cache_key, payload, expires_at, updated_at)
         VALUES ('cards_roster_page_v2', ${sqlText(`${roster.mediaId}:${roster.page}`)},
                 ${sqlText(rosterPayload(roster))}, ${expiresAt}, ${now});`
      );
    }

    database.exec("COMMIT;");
  } finally {
    database.close();
  }
}
