import { connectCdp, findPlayerPage, invoke, mainPage, sleep, waitForReady } from "./cdp";

async function main() {
  const browser = await connectCdp(120_000);
  try {
    const page = await mainPage(browser);
    await waitForReady(page);

    const search = await invoke<{ items: { slugUrl: string }[] }>(page, "anime_lib_search", { input: { query: "", page: 1 } });
    const slug = search.items[0]?.slugUrl;
    if (!slug) throw new Error("no anime");
    const title = await invoke<{ anime: { id: string; title: string; anilistId?: number | null }; episodes: { id: string; number: number; title?: string | null }[] }>(page, "anime_lib_title", { input: { slug } });
    const episode = title.episodes[0];
    const variants = await invoke<{ id: string; name: string; language?: string | null; separateStream: boolean; player: string; sourceUrl: string }[]>(page, "anime_lib_players", { input: { episodeId: episode.id } });
    const v = variants[0];
    const sources = await invoke<{ url: string; type: string; quality: string; label: string }[]>(page, "anime_lib_stream_sources", { input: { episodeId: episode.id, variantId: `${v.player}:${v.id}` } });
    const source = sources[0];

    const stream = {
      sourceId: "animelib",
      sourceName: "AnimeLib",
      mediaId: title.anime.id,
      mediaTitle: title.anime.title,
      episodeId: episode.id,
      episodeNumber: episode.number,
      episodeTitle: episode.title ?? "",
      anilistId: title.anime.anilistId ?? undefined,
      watchKey: `stream:animelib:${title.anime.id}:${episode.id}`,
      headers: {},
      paused: true,
      quality: source.label,
      variantId: `${v.player}:${v.id}`,
      sources: sources.map((r) => ({ url: r.url, type: r.type, quality: r.quality, label: r.label })),
      variants: variants.map((vr) => ({ id: vr.id, name: vr.name, language: vr.language ?? undefined, separateStream: vr.separateStream, player: vr.player, sourceUrl: vr.sourceUrl })),
      mediaUrl: source.url,
    };

    await invoke(page, "player_open_stream", { stream });
    const player = await findPlayerPage(browser, 45000);

    // wait for duration
    let duration = 0;
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      duration = await invoke<number | null>(player, "player_get_property", { name: "duration", format: "double" }).catch(() => null) ?? 0;
      if (duration > 0) break;
      await sleep(200);
    }
    console.log("duration", duration);

    // wait 5s for cache to grow
    await sleep(5000);

    const prop = async (name: string, format: string) => {
      try {
        return await invoke(player, "player_get_property", { name, format });
      } catch (e) {
        return `ERR: ${String(e)}`;
      }
    };

    const readerPts = await prop("demuxer-cache-state/reader-pts", "double");
    const cacheEnd = await prop("demuxer-cache-state/cache-end", "double");
    const cacheDuration = await prop("demuxer-cache-duration", "double");
    const fwBytes = await prop("demuxer-cache-state/fw-bytes", "int64");
    const idle = await prop("demuxer-cache-state/idle", "flag");
    console.log("reader-pts", readerPts);
    console.log("cache-end", cacheEnd);
    console.log("cache-duration", cacheDuration);
    console.log("fw-bytes", fwBytes);
    console.log("idle", idle);
    if (typeof readerPts === "number" && typeof cacheEnd === "number") {
      console.log("ahead span", cacheEnd - readerPts);
    }

    // working set of app process
    const { execSync } = await import("node:child_process");
    const ws = execSync('powershell -Command "(Get-Process iluhaAnime).WorkingSet64"', { encoding: "utf-8" }).trim();
    console.log("workingSetBytes", ws);
  } finally {
    await browser.close();
  }
}

await main();
