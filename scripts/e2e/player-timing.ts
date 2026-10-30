// Live player latency benchmark: drives the real player window over CDP and
// times what a click actually costs. Local files cover a cold open, a warm
// file change inside the running window, a playlist move and audio/subtitle
// switches; AnimeLib covers the catalog chain, a cold stream open, a quality
// switch, a voice-over switch and a next-episode switch.
//
// The app must already run with CDP exposed (real profile, so a stored
// AnimeLib token is used):
//   $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222"
//   bun run tauri dev
// Then: bun scripts/e2e/player-timing.ts
//
// Env:
//   BENCH_RUNS=3          repeats per measured step
//   BENCH_TIMEOUT=45000   per-probe timeout
//   BENCH_SKIP_STREAM=1   local files only
//   BENCH_SKIP_LOCAL=1    streams only

import type { Browser, Page } from "playwright-core";

import { connectCdp, invoke, sleep, waitForReady } from "./cdp";

const RUNS = Math.max(1, Number.parseInt(process.env.BENCH_RUNS ?? "3", 10));
const TIMEOUT_MS = Number.parseInt(process.env.BENCH_TIMEOUT ?? "45000", 10);
const SKIP_STREAM = process.env.BENCH_SKIP_STREAM === "1";
const SKIP_LOCAL = process.env.BENCH_SKIP_LOCAL === "1";
const WARM = process.env.BENCH_WARM === "1";
const STREAM_QUERY = process.env.BENCH_STREAM_QUERY ?? "Frieren";

/** The main window, never the player: both share the same dev-server origin. */
async function mainWindow(browser: Browser): Promise<Page> {
  const started = now();
  while (now() - started < 120_000) {
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        const url = page.url();
        if (url.includes("localhost:1420") && !url.includes("/player-window")) return page;
      }
    }
    await sleep(200);
  }
  throw new Error("the main window did not appear");
}

function qualityRank(label: string): number {
  const digits = label.replace(/\D/g, "");
  return digits.length > 0 ? Number(digits) : 0;
}

/** mpv answers backslash paths, sometimes with the extended-length prefix. */
function samePath(observed: string | null, expected: string): boolean {
  if (!observed) return false;
  const normalize = (value: string) =>
    value.replace(/^\\\\\?\\/, "").replaceAll("\\", "/").toLowerCase();
  return normalize(observed) === normalize(expected);
}

function bestSource(sources: StreamSource[]): StreamSource | undefined {
  return [...sources].sort((left, right) => qualityRank(right.label) - qualityRank(left.label))[0];
}

const KAIBA_DIR = "[AniDub]_Kaiba_TV_[ru_jp]_[1280x720_h264_aac]_[eNd]";
const KAIBA_ROOT = `D:/Anime & Movies/Anime/${KAIBA_DIR}`;
const LOCAL_PLAYLIST = [
  `${KAIBA_ROOT}/[AniDub]_Kaiba_TV_[06_of_12]_[ru_jp]_[1280x720_h264_aac]_[eNd].mkv`,
  `${KAIBA_ROOT}/[AniDub]_Kaiba_TV_[07_of_12]_[ru_jp]_[1280x720_h264_aac]_[eNd].mkv`,
];
const BDRIP =
  "D:/Anime & Movies/Anime/[Moozzi2] Kimetsu no Yaiba - Hashira Geiko-hen [BDRip 1080p x265 FLAC]/[Moozzi2] Kimetsu no Yaiba - Hashira Geiko-hen - 01 [BDRip 1080p x265 FLAC].mkv";
const REMUX = "D:/Anime & Movies/Movies/Vivarium.2019.1080p.REMUX.mkv";

const DROPDOWN = 'button[aria-haspopup="listbox"]';

function now(): number {
  return performance.now();
}

function fmt(ms: number): string {
  return ms < 0 ? "—" : ms.toFixed(1);
}

function percentile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
}

interface Sample {
  scenario: string;
  metric: string;
  ms: number;
}

const samples: Sample[] = [];
const failures: string[] = [];

function record(scenario: string, metric: string, ms: number): void {
  if (ms < 0) {
    failures.push(`${scenario}: ${metric} timed out`);
    return;
  }
  samples.push({ scenario, metric, ms });
  console.log(`  ${metric.padEnd(38)} ${fmt(ms).padStart(8)} ms`);
}

async function timed<T>(run: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const started = now();
  const value = await run();
  return { value, ms: now() - started };
}

/** Milliseconds from `started` until `probe` answers true, or -1 on timeout. */
async function until(
  started: number,
  probe: () => Promise<boolean>,
  timeoutMs = TIMEOUT_MS,
  interval = 10
): Promise<number> {
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    const hit = await probe().catch(() => false);
    if (hit) return now() - started;
    await sleep(interval);
  }
  return -1;
}

function playerPages(browser: Browser): Page[] {
  const pages: Page[] = [];
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      if (page.url().includes("/player-window")) pages.push(page);
    }
  }
  return pages;
}

async function waitForPlayer(
  browser: Browser,
  timeoutMs = TIMEOUT_MS
): Promise<{ page: Page; ms: number }> {
  const started = now();
  while (now() - started < timeoutMs) {
    const [page] = playerPages(browser);
    if (page) return { page, ms: now() - started };
    await sleep(15);
  }
  throw new Error(`the player window did not appear within ${timeoutMs}ms`);
}

async function closePlayer(browser: Browser): Promise<void> {
  const [page] = playerPages(browser);
  if (!page) return;
  await invoke(page, "player_close_window").catch(() => undefined);
  const started = now();
  while (now() - started < 15000) {
    if (playerPages(browser).length === 0) return;
    await sleep(50);
  }
  throw new Error("the player window did not close");
}

async function prop<T>(
  page: Page,
  name: string,
  format: "double" | "flag" | "int64" | "string"
): Promise<T | null> {
  try {
    return await invoke<T | null>(page, "player_get_property", { name, format });
  } catch {
    return null;
  }
}

async function videoWidth(page: Page): Promise<number | null> {
  const width = await prop<number>(page, "width", "int64");
  if (typeof width === "number") return width;
  return prop<number>(page, "video-params/w", "int64");
}

async function hasDuration(page: Page): Promise<boolean> {
  const duration = await prop<number>(page, "duration", "double");
  return typeof duration === "number" && duration > 0;
}

async function hasVideo(page: Page): Promise<boolean> {
  const width = await videoWidth(page);
  return typeof width === "number" && width > 0;
}

async function timePos(page: Page): Promise<number> {
  const value = await prop<number>(page, "time-pos", "double");
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

interface DropdownLabels {
  labels: string[];
}

async function dropdownLabels(page: Page): Promise<string[]> {
  return page.evaluate((selector) => {
    return [...document.querySelectorAll(selector)].map(
      (node) => node.getAttribute("aria-label") ?? ""
    );
  }, DROPDOWN);
}

async function mounted(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const root = document.querySelector("#root");
    const count = root ? root.childElementCount : document.body.childElementCount;
    return count > 0;
  });
}

async function tracksInUi(page: Page): Promise<boolean> {
  return page.evaluate((selector) => document.querySelectorAll(selector).length >= 2, DROPDOWN);
}

/** Label snapshot used to see the track UI react to an mpv property switch. */
async function trackLabels(page: Page): Promise<DropdownLabels> {
  return { labels: await dropdownLabels(page) };
}

async function labelsChanged(page: Page, before: DropdownLabels): Promise<boolean> {
  const after = await dropdownLabels(page).catch(() => before.labels);
  return after.some((label, index) => label !== before.labels[index]);
}

/** Audio/subtitle track ids mpv accepts, probed with the same IPC the UI uses. */
async function trackIds(player: Page, property: "aid" | "sid", max = 16): Promise<number[]> {
  const ids: number[] = [];
  for (let id = 1; id <= max; id++) {
    try {
      await invoke(player, "player_set_property", { name: property, value: String(id) });
    } catch {
      continue;
    }
    const applied = await prop<string>(player, property, "string");
    if (applied === String(id)) ids.push(id);
  }
  return ids;
}

interface LocalOpenResult {
  page: Page;
}

async function openLocalCold(
  browser: Browser,
  main: Page,
  files: string[],
  label: string
): Promise<LocalOpenResult> {
  await closePlayer(browser);
  await sleep(250);
  const started = now();
  const open = await timed(() =>
    invoke(main, "player_open", { files, resume: null, startIndex: 0, watch: null })
  );
  record(label, "IPC player_open", open.ms);
  const found = await waitForPlayer(browser);
  record(label, "окно плеера создано", found.ms);
  const player = found.page;
  record(
    label,
    "UI плеера смонтирован",
    await until(started, () => mounted(player), 30000, 15)
  );
  record(
    label,
    "mpv инициализирован",
    await until(started, async () => (await prop<number>(player, "volume", "double")) !== null)
  );
  record(
    label,
    "файл принят (mpv path)",
    await until(started, async () => samePath(await prop<string>(player, "path", "string"), files[0]))
  );
  record(label, "демукс: длительность", await until(started, () => hasDuration(player)));
  record(label, "видео готово (кадр)", await until(started, () => hasVideo(player)));
  record(
    label,
    "первый кадр (vo-configured)",
    await until(started, async () => (await prop<boolean>(player, "vo-configured", "flag")) === true)
  );
  record(label, "дорожки в UI", await until(started, () => tracksInUi(player), 30000, 15));
  return { page: player };
}

async function openLocalWarm(
  main: Page,
  player: Page,
  files: string[],
  label: string
): Promise<void> {
  const started = now();
  const open = await timed(() =>
    invoke(main, "player_open", { files, resume: null, startIndex: 0, watch: null })
  );
  record(label, "IPC player_open (окно живо)", open.ms);
  record(
    label,
    "файл подхвачен (mpv path)",
    await until(started, async () => samePath(await prop<string>(player, "path", "string"), files[0]))
  );
  record(label, "демукс: длительность", await until(started, () => hasDuration(player)));
  record(label, "видео готово (кадр)", await until(started, () => hasVideo(player)));
}

async function playlistNext(player: Page, nextPath: string, label: string): Promise<void> {
  const started = now();
  const call = await timed(() =>
    invoke(player, "player_command", { name: "playlist-next", args: [] })
  );
  record(label, "IPC playlist-next", call.ms);
  record(
    label,
    "новый файл активен",
    await until(started, async () => samePath(await prop<string>(player, "path", "string"), nextPath))
  );
  record(label, "демукс: длительность", await until(started, () => hasDuration(player)));
  record(label, "видео готово (кадр)", await until(started, () => hasVideo(player)));
}

async function trackSwitch(
  player: Page,
  property: "aid" | "sid",
  id: number,
  label: string
): Promise<void> {
  const before = await trackLabels(player);
  const started = now();
  const call = await timed(() =>
    invoke(player, "player_set_property", { name: property, value: String(id) })
  );
  record(label, `IPC ${property} → ${id}`, call.ms);
  record(label, "UI показал дорожку", await until(started, () => labelsChanged(player, before), 3000));
}

interface AnimeLibAnime {
  id: string;
  title: string;
  slugUrl: string;
  anilistId?: number | null;
}

interface AnimeLibEpisode {
  id: string;
  number: number;
  title?: string | null;
}

interface AnimeLibVariant {
  id: string;
  name: string;
  language?: string | null;
  separateStream: boolean;
  player: string;
  sourceUrl: string;
}

interface StreamSource {
  quality: string;
  label: string;
  url: string;
  type: string;
  headers?: Record<string, string> | null;
}

interface Chain {
  anime: AnimeLibAnime;
  episode: AnimeLibEpisode;
  variants: AnimeLibVariant[];
  variant: AnimeLibVariant;
  sources: StreamSource[];
}

function variantKey(variant: AnimeLibVariant): string {
  return `${variant.player}:${variant.id}`;
}

function nativeFirst(variants: AnimeLibVariant[]): AnimeLibVariant[] {
  return [...variants].sort(
    (left, right) => Number(right.player === "Animelib") - Number(left.player === "Animelib")
  );
}

async function catalogChain(main: Page, slug: string | undefined, label: string): Promise<Chain> {
  const steps: Array<[string, number]> = [];
  const search = await timed(() =>
    invoke<{ items: AnimeLibAnime[] }>(main, "anime_lib_search", {
      input: { query: "", page: 1 },
    })
  );
  steps.push(["поиск каталога", search.ms]);
  const hit = slug ? search.value.items.find((item) => item.slugUrl === slug) : search.value.items[0];
  if (!hit) throw new Error(`no catalog title matched ${slug ?? "the first page"}`);

  const title = await timed(() =>
    invoke<{ anime: AnimeLibAnime; episodes: AnimeLibEpisode[] }>(main, "anime_lib_title", {
      input: { slug: hit.slugUrl },
    })
  );
  steps.push(["карточка + эпизоды", title.ms]);
  const episode = title.value.episodes[0];
  if (!episode) throw new Error(`${hit.title} returned no episodes`);

  const players = await timed(() =>
    invoke<AnimeLibVariant[]>(main, "anime_lib_players", { input: { episodeId: episode.id } })
  );
  steps.push(["озвучки (players)", players.ms]);
  if (players.value.length === 0) throw new Error(`${hit.title} has no voice-overs`);

  let variant: AnimeLibVariant | null = null;
  let sources: StreamSource[] = [];
  let resolveMs = 0;
  for (const candidate of nativeFirst(players.value).slice(0, 4)) {
    const resolve = await timed(() =>
      invoke<StreamSource[]>(main, "anime_lib_stream_sources", {
        input: { episodeId: episode.id, variantId: variantKey(candidate) },
      })
    );
    if (resolve.value.length > 0) {
      variant = candidate;
      sources = resolve.value;
      resolveMs = resolve.ms;
      break;
    }
  }
  if (!variant) throw new Error(`${hit.title} resolved no playable sources`);
  steps.push([`источники (${variant.player})`, resolveMs]);

  for (const [name, ms] of steps) record(label, name, ms);
  const total = steps.reduce((sum, [, ms]) => sum + ms, 0);
  record(label, "итого каталог", total);
  return { anime: title.value.anime, episode, variants: players.value, variant, sources };
}

function buildStream(
  chain: Chain,
  variant: AnimeLibVariant,
  sources: StreamSource[],
  extra: { url: string; quality: string; resume?: number }
): Record<string, unknown> {
  const source = sources.find((row) => row.url === extra.url) ?? sources[0];
  return {
    sourceId: "animelib",
    sourceName: "AnimeLib",
    mediaId: chain.anime.id,
    mediaTitle: chain.anime.title,
    episodeId: chain.episode.id,
    episodeNumber: chain.episode.number,
    episodeTitle: chain.episode.title ?? "",
    anilistId: chain.anime.anilistId ?? undefined,
    watchKey: `stream:animelib:${chain.anime.id}:${chain.episode.id}`,
    headers: source?.headers ?? {},
    paused: true,
    quality: extra.quality,
    variantId: variantKey(variant),
    sources: sources.map((row) => ({
      url: row.url,
      type: row.type,
      quality: row.quality,
      label: row.label,
    })),
    variants: chain.variants.map((row) => ({
      id: row.id,
      name: row.name,
      language: row.language ?? undefined,
      separateStream: row.separateStream,
      player: row.player,
      sourceUrl: row.sourceUrl,
    })),
    mediaUrl: extra.url,
    resume: extra.resume,
  };
}

async function openStreamCold(main: Page, browser: Browser, stream: unknown, url: string, label: string) {
  await closePlayer(browser);
  await sleep(250);
  const started = now();
  const open = await timed(() => invoke(main, "player_open_stream", { stream }));
  record(label, "IPC player_open_stream", open.ms);
  const found = await waitForPlayer(browser);
  record(label, "окно плеера создано", found.ms);
  const player = found.page;
  record(label, "mpv инициализирован", await until(started, async () => (await prop<number>(player, "volume", "double")) !== null));
  record(
    label,
    "поток принят (mpv path)",
    await until(started, async () => (await prop<string>(player, "path", "string")) === url, TIMEOUT_MS)
  );
  record(label, "демукс: длительность", await until(started, () => hasDuration(player)));
  record(label, "видео готово (кадр)", await until(started, () => hasVideo(player)));
  record(
    label,
    "первый кадр (vo-configured)",
    await until(started, async () => (await prop<boolean>(player, "vo-configured", "flag")) === true)
  );
  return player;
}

async function switchStream(
  main: Page,
  player: Page,
  stream: unknown,
  url: string,
  label: string
): Promise<void> {
  const started = now();
  const open = await timed(() => invoke(main, "player_open_stream", { stream }));
  record(label, "IPC player_open_stream", open.ms);
  record(
    label,
    "поток принят (mpv path)",
    await until(started, async () => (await prop<string>(player, "path", "string")) === url)
  );
  record(label, "демукс: длительность", await until(started, () => hasDuration(player)));
  record(label, "видео готово (кадр)", await until(started, () => hasVideo(player)));
}

async function sleepUntilPageGone(): Promise<void> {
  await sleep(150);
}

async function localRuns(browser: Browser, main: Page): Promise<void> {
  for (let run = 1; run <= RUNS; run++) {
    const label = `локальный: холодный старт (Kaiba 720p, ${run}/${RUNS})`;
    console.log(`\n[local] ${label}`);
    let player: Page;
    try {
      const cold = await openLocalCold(browser, main, LOCAL_PLAYLIST, label);
      player = cold.page;
    } catch (error) {
      failures.push(`${label}: ${String(error)}`);
      console.log(`  FAILED: ${String(error)}`);
      continue;
    }

    // Playlist move inside the running window: the next episode is already queued.
    try {
      await playlistNext(player, LOCAL_PLAYLIST[1] ?? "", `локальный: смена файла в очереди (${run})`);
    } catch (error) {
      failures.push(`playlist-next ${run}: ${String(error)}`);
    }

    // Warm file changes: a BDRip and a remux replace the file in the same window.
    for (const [file, name] of [
      [BDRIP, "BDRip HEVC 2.6 ГБ"],
      [REMUX, "REMUX 29 ГБ"],
    ] as const) {
      try {
        await openLocalWarm(main, player, [file], `локальный: файл ${name} (${run})`);
      } catch (error) {
        failures.push(`warm ${name} ${run}: ${String(error)}`);
      }
    }

    // Audio and subtitle switches on the multi-track remux.
    try {
      const audioIds = await trackIds(player, "aid");
      const subIds = await trackIds(player, "sid");
      if (audioIds.length < 2) failures.push(`remux run ${run}: fewer than two audio tracks`);
      for (const id of audioIds.slice(0, 3)) {
        await trackSwitch(player, "aid", id, `локальный: аудиодорожка ${id} (${run})`);
      }
      for (const id of subIds.slice(0, 2)) {
        await trackSwitch(player, "sid", id, `локальный: субдорожка ${id} (${run})`);
      }
      if (subIds.length > 0) {
        await trackSwitch(player, "sid", 0, `локальный: субтитры выкл (${run})`);
      }
    } catch (error) {
      failures.push(`tracks ${run}: ${String(error)}`);
    }

    await closePlayer(browser);
    await sleepUntilPageGone();
  }
}

async function collectStreamChains(main: Page): Promise<Chain[]> {
  const chains: Chain[] = [];
  for (let attempt = 0; attempt < 8 && chains.length < 2; attempt++) {
    try {
      const search = await invoke<{ items: AnimeLibAnime[] }>(main, "anime_lib_search", {
        input: { query: attempt === 0 ? STREAM_QUERY : "", page: 1 },
      });
      const candidate = search.items[attempt === 0 ? 0 : attempt] ?? search.items[0];
      if (!candidate) break;
      if (chains.some((chain) => chain.anime.id === candidate.id)) continue;
      chains.push(await catalogChain(main, candidate.slugUrl, `каталог: ${candidate.title}`));
    } catch (error) {
      console.log(`  skip title: ${String(error)}`);
    }
  }
  return chains;
}

async function streamRuns(browser: Browser, main: Page): Promise<void> {
  // Two different titles: the first keeps the catalog cold, the second reuses
  // whatever the client caches, so the chain numbers cover both.
  const started = now();
  const chains = await collectStreamChains(main);
  record("каталог: два тайтла подряд", "итого на поиск двух тайтлов", now() - started);
  if (chains.length === 0) {
    failures.push("stream: no playable AnimeLib title resolved");
    return;
  }

  const chain = chains[0];
  if (!chain) return;
  const primary = bestSource(chain.sources);
  if (!primary) return;

  for (let run = 1; run <= RUNS; run++) {
    const label = `стрим: холодный старт ${chain.anime.title} (${run}/${RUNS})`;
    console.log(`\n[stream] ${label}`);
    let player: Page;
    try {
      player = await openStreamCold(
        main,
        browser,
        buildStream(chain, chain.variant, chain.sources, {
          url: primary.url,
          quality: primary.label,
        }),
        primary.url,
        label
      );
    } catch (error) {
      failures.push(`${label}: ${String(error)}`);
      console.log(`  FAILED: ${String(error)}`);
      continue;
    }

    // Quality switch: same session, another already resolved URL.
    const other =
      chain.sources.find((row) => row.label === "1080p" && row.label !== primary.label) ??
      chain.sources.find((row) => row.label !== primary.label);
    if (other) {
      try {
        await switchStream(
          main,
          player,
          buildStream(chain, chain.variant, chain.sources, {
            url: other.url,
            quality: other.label,
            resume: await timePos(player),
          }),
          other.url,
          `стрим: смена качества ${primary.label} → ${other.label} (${run})`
        );
      } catch (error) {
        failures.push(`quality ${run}: ${String(error)}`);
      }
    }

    // Voice-over switch: another row resolves first, then the media loads.
    if (chain.variants.length > 1) {
      const otherVariant = nativeFirst(chain.variants).find(
        (row) => variantKey(row) !== variantKey(chain.variant)
      );
      if (otherVariant) {
        try {
          const resolved = await timed(() =>
            invoke<StreamSource[]>(main, "anime_lib_stream_sources", {
              input: {
                episodeId: chain.episode.id,
                variantId: variantKey(otherVariant),
              },
            })
          );
          record(`стрим: смена озвучки (${run})`, "резолв источников", resolved.ms);
          const source = resolved.value[0];
          if (source) {
            await switchStream(
              main,
              player,
              buildStream(chain, otherVariant, resolved.value, {
                url: source.url,
                quality: source.label,
                resume: await timePos(player),
              }),
              source.url,
              `стрим: смена озвучки (${run})`
            );
          } else {
            failures.push(`voice ${run}: the other voice-over resolved no sources`);
          }
        } catch (error) {
          failures.push(`voice ${run}: ${String(error)}`);
        }
      }
    }

    // Next episode: episodes, players and sources, then the media.
    try {
      const episodes = await timed(() =>
        invoke<AnimeLibEpisode[]>(main, "anime_lib_episodes", {
          input: { animeId: chain.anime.id },
        })
      );
      record(`стрим: следующий эпизод (${run})`, "список эпизодов", episodes.ms);
      const next = episodes.value.find((row) => row.number > chain.episode.number);
      if (next) {
        const players = await timed(() =>
          invoke<AnimeLibVariant[]>(main, "anime_lib_players", { input: { episodeId: next.id } })
        );
        record(`стрим: следующий эпизод (${run})`, "озвучки эпизода", players.ms);
        const variant = nativeFirst(players.value)[0];
        if (variant) {
          const resolved = await timed(() =>
            invoke<StreamSource[]>(main, "anime_lib_stream_sources", {
              input: { episodeId: next.id, variantId: variantKey(variant) },
            })
          );
          record(`стрим: следующий эпизод (${run})`, "резолв источников", resolved.ms);
          const source = resolved.value[0];
          if (source) {
            await switchStream(
              main,
              player,
              buildStream(
                { ...chain, episode: next },
                variant,
                resolved.value,
                {
                  url: source.url,
                  quality: source.label,
                }
              ),
              source.url,
              `стрим: следующий эпизод (${run})`
            );
          }
        }
      }
    } catch (error) {
      failures.push(`next episode ${run}: ${String(error)}`);
    }

    await closePlayer(browser);
    await sleepUntilPageGone();
  }
}

/**
 * The path every catalog click takes: the hidden player window is already up
 * (`player_prewarm`), so the click pays for the media, not for a WebView.
 */
async function warmRuns(browser: Browser, main: Page): Promise<void> {
  for (let run = 1; run <= RUNS; run++) {
    const label = `тёплый старт (prewarm → клик, ${run}/${RUNS})`;
    console.log(`\n[warm] ${label}`);
    await closePlayer(browser);
    await sleep(250);
    const started = now();
    try {
      const prewarm = await timed(() => invoke(main, "player_prewarm"));
      record(label, "IPC player_prewarm", prewarm.ms);
      const found = await waitForPlayer(browser);
      record(label, "prewarm: окно создано", found.ms);
      record(
        label,
        "prewarm: mpv готов",
        await until(started, async () => (await prop<number>(found.page, "volume", "double")) !== null)
      );
      const click = now();
      const open = await timed(() =>
        invoke(main, "player_open", { files: [BDRIP], resume: null, startIndex: 0, watch: null })
      );
      record(label, "клик: IPC player_open", open.ms);
      record(
        label,
        "клик → файл подхвачен",
        await until(click, async () =>
          samePath(await prop<string>(found.page, "path", "string"), BDRIP)
        )
      );
      record(label, "клик → демукс", await until(click, () => hasDuration(found.page)));
      record(label, "клик → кадр", await until(click, () => hasVideo(found.page)));
    } catch (error) {
      failures.push(`${label}: ${String(error)}`);
      console.log(`  FAILED: ${String(error)}`);
    }
  }
}

function printTable(): void {
  const groups = new Map<string, Map<string, number[]>>();
  const order: string[] = [];
  for (const sample of samples) {
    if (!groups.has(sample.scenario)) {
      groups.set(sample.scenario, new Map());
      order.push(sample.scenario);
    }
    const metrics = groups.get(sample.scenario);
    if (!metrics) continue;
    const values = metrics.get(sample.metric) ?? [];
    values.push(sample.ms);
    metrics.set(sample.metric, values);
  }

  console.log("\n\n## Результаты\n");
  console.log("| Сценарий | Шаг | n | min | p50 | max |");
  console.log("| --- | --- | --- | --- | --- | --- |");
  for (const scenario of order) {
    const metrics = groups.get(scenario);
    if (!metrics) continue;
    for (const [metric, values] of metrics) {
      console.log(
        `| ${scenario} | ${metric} | ${values.length} | ${fmt(Math.min(...values))} | ${fmt(
          percentile(values, 0.5)
        )} | ${fmt(Math.max(...values))} |`
      );
    }
  }

  if (failures.length > 0) {
    console.log("\n## Не измерилось\n");
    for (const failure of failures) console.log(`- ${failure}`);
  }
}

async function main(): Promise<void> {
  const browser = await connectCdp(120_000);
  try {
    const main = await mainWindow(browser);
    await waitForReady(main);
    if (WARM) await warmRuns(browser, main);
    if (!SKIP_LOCAL && !WARM) await localRuns(browser, main);
    if (!SKIP_STREAM && !WARM) await streamRuns(browser, main);
  } finally {
    await browser.close();
  }
  printTable();
}

await main();
