import { collectionApi } from "@/api/collection.api";
import type { UnifiedIndexEntryInput } from "@/types/api/collection";
import { RANKING } from "@/config/anilist/ranking.config";
import { buildTypedTitles } from "@/lib/search/searchTitle.utils";
import { attempt, attemptSync, reportBackgroundError } from "@hullperse/hp_utils/attempt";
import type { AniListCollection, FavouriteAnime } from "@/types/anilist/anilist";
import type { SearchAnimeSuggestion } from "@/types/search/search";

const MAX_LEARNING_ITEMS = RANKING.MAX_LEARNING_ITEMS;
const INDEX_BATCH_SIZE = 1000;
const ANIME_SYNC_KEY_STORAGE = "animeIndexSyncKey";
let indexChain: Promise<unknown> = Promise.resolve();

export function readStoredSyncKey(): string | null {
  const [value] = attemptSync(() => localStorage.getItem(ANIME_SYNC_KEY_STORAGE));
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function writeStoredSyncKey(key: string | null): void {
  attemptSync(() => {
    if (key === null) localStorage.removeItem(ANIME_SYNC_KEY_STORAGE);
    else localStorage.setItem(ANIME_SYNC_KEY_STORAGE, key);
  });
}

export function animeIndexSyncKey(
  animeIndex: SearchAnimeSuggestion[],
  profileId: number | null
): string {
  let hash = 0;
  const mix = (text: string): void => {
    for (const char of text) hash = Math.trunc(Math.imul(hash, 31) + (char.codePointAt(0) ?? 0));
  };
  mix(`profile:${profileId ?? 0}|n:${animeIndex.length}`);
  for (const anime of animeIndex) {
    mix(
      `#${anime.id}|${anime.title}|${anime.status}|${anime.score ?? 0}|${anime.favourite ? 1 : 0}`
    );
    for (const alias of anime.aliases) mix(`@${alias}`);
    for (const typed of anime.typedTitles ?? []) mix(`:${typed.kind}=${typed.title}`);
  }
  return `${animeIndex.length}:${hash}`;
}

export function invalidateAnimeIndexSync(): void {
  writeStoredSyncKey(null);
}

export function syncUnifiedIndex(entries: UnifiedIndexEntryInput[]): Promise<boolean> {
  if (entries.length === 0) return Promise.resolve(true);
  const run = indexChain
    .then(async () => {
      for (let offset = 0; offset < entries.length; offset += INDEX_BATCH_SIZE) {
        const batch = entries.slice(offset, offset + INDEX_BATCH_SIZE);
        await collectionApi.upsertUnifiedIndex(batch);
      }
      if (entries.length > 100) await collectionApi.optimizeUnifiedIndex();
      return true;
    })
    .catch((error: unknown) => {
      reportBackgroundError("index.upsert", error);
      return false;
    });
  indexChain = run;
  return run;
}

export function buildAnimeIndex(
  lists: AniListCollection[],
  favourites: FavouriteAnime[]
): SearchAnimeSuggestion[] {
  const favouriteIds = new Set(favourites.map((item) => item.id));
  const entries = new Map<number, SearchAnimeSuggestion>();

  for (const list of lists) {
    for (const entry of list.entries) {
      const media = entry.media;
      entries.set(media.id, {
        aliases: media.titles.filter((title) => title !== media.title),
        favourite: favouriteIds.has(media.id),
        id: media.id,
        score: entry.score,
        season: media.season,
        seasonYear: media.season_year,
        status: entry.list_status,
        title: media.title,
        typedTitles: buildTypedTitles(media.id, {
          title: media.title,
          title_english: media.title_english,
          title_native: media.title_native,
          title_romaji: media.title_romaji,
          titles: media.titles,
        }),
      });
    }
  }

  for (const favourite of favourites) {
    if (entries.has(favourite.id)) continue;
    const romaji = favourite.title.romaji;
    const english = favourite.title.english;
    const title = english ?? romaji;
    entries.set(favourite.id, {
      aliases: [romaji, english ?? ""].filter((alias) => alias && alias !== title),
      favourite: true,
      id: favourite.id,
      score: favourite.mean_score,
      season: null,
      seasonYear: null,
      status: "FAVOURITE",
      title,
      typedTitles: buildTypedTitles(favourite.id, {
        title,
        title_english: english,
        title_romaji: romaji,
        titles: [romaji, favourite.title.english ?? ""],
      }),
    });
  }

  return [...entries.values()].slice(0, MAX_LEARNING_ITEMS);
}

export async function dropUnifiedScope(scope: string, label: string): Promise<void> {
  const [, error] = await attempt(collectionApi.clearUnifiedIndexScope(scope));
  if (error === null) return;
  const [, pruneError] = await attempt(collectionApi.pruneUnifiedIndexScope(scope, []));
  if (pruneError !== null) reportBackgroundError(label, pruneError);
}
