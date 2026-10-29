// Measures the live streaming path over CDP: the catalog chain between a click
// and a playable URL, and the time from that play request to mpv reporting a
// loaded stream. Each step is one IPC round trip, so the step count is also the
// number of IPC hops the flow costs.
//
// The app must already run with CDP exposed:
//   $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222"
//   bun run tauri dev
// Then: bun scripts/e2e/stream-timing.ts   (or bun run bench:stream)
//
// Env:
//   BENCH_RUNS=2          catalog chain runs (the second one hits the caches)
//   BENCH_STREAM_SLUG=... a title's slugUrl to measure instead of the first hit
//   BENCH_PLAY=0          skip the player part

import type { Browser, Page } from "playwright-core";

import { connectCdp, findPlayerPage, invoke, mainPage, sleep, waitForReady } from "./cdp";

const RUNS = Math.max(1, Number.parseInt(process.env.BENCH_RUNS ?? "2", 10));
const PLAY = process.env.BENCH_PLAY !== "0";
const LOAD_TIMEOUT_MS = Number.parseInt(process.env.BENCH_LOAD_TIMEOUT ?? "45000", 10);

interface Step {
  name: string;
  ms: number;
}

interface CatalogAnime {
  id: string;
  title: string;
  slugUrl: string;
  anilistId?: number | null;
}

interface CatalogEpisode {
  id: string;
  number: number;
  title?: string | null;
}

interface CatalogVariant {
  id: string;
  name: string;
  language?: string | null;
  separateStream: boolean;
  player: string;
  sourceUrl: string;
}

interface CatalogSource {
  url: string;
  type: string;
  quality: string;
  label: string;
}

interface Chain {
  anime: CatalogAnime;
  episode: CatalogEpisode;
  variants: CatalogVariant[];
  sources: CatalogSource[];
  steps: Step[];
}

function percentile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[index] ?? 0;
}

async function timed<T>(steps: Step[], name: string, run: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const value = await run();
  steps.push({ name, ms: performance.now() - start });
  return value;
}

function variantIdOf(variant: CatalogVariant): string {
  return `${variant.player}:${variant.id}`;
}

async function resolveChain(page: Page, slug: string | undefined): Promise<Chain> {
  const steps: Step[] = [];
  const search = await timed(steps, "anime_lib_search", () =>
    invoke<{ items: CatalogAnime[] }>(page, "anime_lib_search", {
      input: { query: "", page: 1 },
    })
  );
  const hit = slug ? search.items.find((item) => item.slugUrl === slug) : search.items[0];
  if (!hit) throw new Error(`no catalog title matched ${slug ?? "the first page"}`);

  const title = await timed(steps, "anime_lib_title", () =>
    invoke<{ anime: CatalogAnime; episodes: CatalogEpisode[] }>(page, "anime_lib_title", {
      input: { slug: hit.slugUrl },
    })
  );
  const anime = title.anime;
  const episode = title.episodes[0];
  if (!episode) throw new Error(`${anime.title} returned no episodes`);

  const variants = await timed(steps, "anime_lib_players", () =>
    invoke<CatalogVariant[]>(page, "anime_lib_players", { input: { episodeId: episode.id } })
  );
  const variant = variants[0];
  if (!variant) throw new Error(`${anime.title} episode ${episode.number} has no voice-overs`);

  const sources = await timed(steps, "anime_lib_stream_sources", () =>
    invoke<CatalogSource[]>(page, "anime_lib_stream_sources", {
      input: { episodeId: episode.id, variantId: variantIdOf(variant) },
    })
  );
  if (sources.length === 0) throw new Error(`${anime.title} resolved no playable sources`);

  return { anime, episode, variants, sources, steps };
}

function printChain(label: string, chain: Chain): void {
  const total = chain.steps.reduce((sum, step) => sum + step.ms, 0);
  console.log(`\n${label} (${chain.steps.length} IPC round trips)`);
  console.log(`  ${chain.anime.title}, episode ${chain.episode.number}`);
  for (const step of chain.steps) {
    console.log(`  ${step.name.padEnd(24)} ${step.ms.toFixed(1).padStart(8)} ms`);
  }
  console.log(`  ${"total".padEnd(24)} ${total.toFixed(1).padStart(8)} ms`);
}

/** Time from the open request to mpv reporting a duration for the stream. */
async function measurePlayer(browser: Browser, page: Page, chain: Chain): Promise<number> {
  const source = chain.sources[0];
  const variant = chain.variants[0];
  if (!source || !variant) throw new Error("no source to play");
  const stream = {
    sourceId: "animelib",
    sourceName: "AnimeLib",
    mediaId: chain.anime.id,
    mediaTitle: chain.anime.title,
    episodeId: chain.episode.id,
    episodeNumber: chain.episode.number,
    episodeTitle: chain.episode.title ?? "",
    anilistId: chain.anime.anilistId ?? undefined,
    watchKey: `stream:animelib:${chain.anime.id}:${chain.episode.id}`,
    headers: {},
    // Paused is what the catalog does: the user asked for the episode, not for
    // audio to start while the window is still coming up.
    paused: true,
    quality: source.label,
    variantId: variantIdOf(variant),
    sources: chain.sources.map((row) => ({
      url: row.url,
      type: row.type,
      quality: row.quality,
      label: row.label,
    })),
    variants: chain.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      language: variant.language ?? undefined,
      separateStream: variant.separateStream,
      player: variant.player,
      sourceUrl: variant.sourceUrl,
    })),
    mediaUrl: source.url,
  };

  const started = performance.now();
  await invoke(page, "player_open_stream", { stream });
  const player = await findPlayerPage(browser, LOAD_TIMEOUT_MS);
  const windowMs = performance.now() - started;

  const deadline = performance.now() + LOAD_TIMEOUT_MS;
  while (performance.now() < deadline) {
    const duration = await invoke<number | null>(player, "player_get_property", {
      name: "duration",
      format: "double",
    }).catch(() => null);
    if (typeof duration === "number" && duration > 0) {
      const totalMs = performance.now() - started;
      console.log(`\nplayer (${source.label} ${source.type})`);
      console.log(`  ${"window ready".padEnd(24)} ${windowMs.toFixed(1).padStart(8)} ms`);
      console.log(`  ${"stream loaded".padEnd(24)} ${totalMs.toFixed(1).padStart(8)} ms`);
      // Audio is left paused by the request itself; the player window stays open
      // so the next run measures a warm player instead of a cold one.
      return totalMs;
    }
    await sleep(100);
  }
  throw new Error(`stream did not load within ${LOAD_TIMEOUT_MS}ms`);
}

async function main(): Promise<void> {
  const browser = await connectCdp(120_000);
  try {
    const page = await mainPage(browser);
    await waitForReady(page);

    const runs: Chain[] = [];
    for (let run = 0; run < RUNS; run++) {
      const chain = await resolveChain(page, process.env.BENCH_STREAM_SLUG);
      runs.push(chain);
      printChain(run === 0 ? "stream chain (cold)" : `stream chain (run ${run + 1})`, chain);
    }

    const totals = runs.map((chain) => chain.steps.reduce((sum, step) => sum + step.ms, 0));
    console.log(
      `\ncatalog chain total: min=${Math.min(...totals).toFixed(1)}ms ` +
        `p50=${percentile(totals, 0.5).toFixed(1)}ms n=${totals.length}`
    );

    if (PLAY) {
      const warm = runs.at(-1);
      if (!warm) throw new Error("no chain to play");
      await measurePlayer(browser, page, warm);
    }
  } finally {
    await browser.close();
  }
}

await main();
