import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const ENDPOINT = "https://graphql.anilist.co";
const PAGES = 40;
const POOL_VERSION = 5;
const POOL_SIZE = 1024;
const EASY_COUNT = 64;
const MEDIUM_COUNT = 320;
const HARD_COUNT = 640;
const OUTPUT = join("src-tauri", "data", "daily-pool-v1.json");
const REQUEST_DELAY_MS = 2_000;
const PAGE_ATTEMPTS = 8;

const QUERY = `query($page: Int) {
  Page(page: $page, perPage: 50) {
    media(
      type: ANIME
      sort: POPULARITY_DESC
      isAdult: false
      status_in: [FINISHED, RELEASING]
      format_in: [TV, MOVIE, ONA, TV_SHORT]
    ) {
      id
      idMal
      title { romaji }
      seasonYear
      format
      episodes
      genres
      meanScore
      source
      popularity
      studios(isMain: true) { nodes { name } }
    }
  }
}`;

interface Media {
  id: number;
  idMal: number | null;
  title: { romaji: string | null };
  seasonYear: number | null;
  format: string | null;
  episodes: number | null;
  genres: string[];
  meanScore: number | null;
  source: string | null;
  popularity: number;
  studios: { nodes: { name: string }[] };
}

interface Entry {
  mediaId: number;
  malId: number;
  title: string;
  year: number | null;
  format: string | null;
  episodes: number | null;
  genres: string[];
  studio: string | null;
  score: number | null;
  source: string | null;
  popularity: number;
  tier: "easy" | "medium" | "hard";
  modes: ("frames" | "op" | "audio")[];
}

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(page: number): Promise<Media[]> {
  for (let attempt = 0; attempt < PAGE_ATTEMPTS; attempt += 1) {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "iluhaAnime daily pool",
      },
      body: JSON.stringify({ query: QUERY, variables: { page } }),
    });

    if (response.status === 429) {
      const reset = Number(response.headers.get("x-ratelimit-reset"));
      const untilReset = Number.isFinite(reset) ? reset * 1000 - Date.now() : 0;
      await sleep(Math.min(60_000, Math.max(5_000, untilReset, 5_000 * (attempt + 1))));
      continue;
    }

    if (!response.ok) throw new Error(`AniList page ${page}: HTTP ${response.status}`);
    const payload = (await response.json()) as {
      data?: { Page?: { media?: Media[] } };
      errors?: { message: string }[];
    };

    if (payload.errors?.length) {
      throw new Error(`AniList page ${page}: ${payload.errors[0]?.message ?? "unknown error"}`);
    }

    return payload.data?.Page?.media ?? [];
  }

  throw new Error(`AniList page ${page}: rate limited`);
}

function spread<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;

  return Array.from(
    { length: count },
    (_, index) => items[Math.floor((index * items.length) / count)]
  );
}

function toEntry(media: Media, tier: Entry["tier"]): Entry {
  return {
    mediaId: media.id,
    malId: media.idMal ?? 0,
    title: media.title.romaji ?? "",
    year: media.seasonYear,
    format: media.format,
    episodes: media.episodes,
    genres: media.genres,
    studio: media.studios.nodes[0]?.name ?? null,
    score: media.meanScore,
    source: media.source,
    popularity: media.popularity,
    tier,
    modes: ["frames", "op", "audio"],
  };
}

async function main(): Promise<void> {
  const media: Media[] = [];

  for (let page = 1; page <= PAGES; page += 1) {
    media.push(...(await fetchPage(page)));
    log(`[daily-pool] page ${page}/${PAGES}`);

    if (page < PAGES) await sleep(REQUEST_DELAY_MS);
  }

  const eligible = media.filter(
    (item) =>
      item.idMal !== null &&
      item.title.romaji !== null &&
      item.genres.every((genre) => genre.toLowerCase() !== "hentai")
  );

  if (eligible.length < POOL_SIZE + 200) {
    throw new Error(
      `only ${eligible.length} eligible titles, expected at least ${POOL_SIZE + 200}`
    );
  }

  const easy = eligible.slice(0, EASY_COUNT);
  const medium = spread(eligible.slice(EASY_COUNT + 32, 480), MEDIUM_COUNT);
  const hard = spread(eligible.slice(480, 1600), HARD_COUNT);
  const seen = new Set<number>();
  const entries: Entry[] = [];

  for (const [tier, list] of [
    ["easy", easy],
    ["medium", medium],
    ["hard", hard],
  ] as const) {
    for (const item of list) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      entries.push(toEntry(item, tier));
    }
  }

  const counts = {
    easy: entries.filter((entry) => entry.tier === "easy").length,
    medium: entries.filter((entry) => entry.tier === "medium").length,
    hard: entries.filter((entry) => entry.tier === "hard").length,
  };

  if (entries.length !== POOL_SIZE) {
    throw new Error(
      `pool has ${entries.length} entries, expected ${POOL_SIZE}: ${JSON.stringify(counts)}`
    );
  }

  const body = `{\n  "version": ${POOL_VERSION},\n  "entries": [\n${entries
    .map((entry) => `    ${JSON.stringify(entry)}`)
    .join(",\n")}\n  ]\n}\n`;
  await writeFile(OUTPUT, body);

  const popularity = entries.map((entry) => entry.popularity).sort((left, right) => left - right);
  log(
    [
      `[daily-pool] ${entries.length}/${POOL_SIZE} entries: easy ${counts.easy}, medium ${counts.medium}, hard ${counts.hard}`,
      `[daily-pool] popularity ${popularity[0]}..${popularity.at(-1)}`,
      `[daily-pool] written to ${OUTPUT}`,
    ].join("\n")
  );
}

await main();
