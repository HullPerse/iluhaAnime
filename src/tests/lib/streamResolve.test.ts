import { afterEach, expect, it, vi } from "vitest";
import { streamApi } from "@/api/stream.api";
import { prefetchEpisode, resolvePlayable } from "@/lib/player/streamResolve.utils";

afterEach(() => vi.restoreAllMocks());

it("does not spend AllAnime episode requests on speculative prefetch", async () => {
  const prefs = vi.spyOn(streamApi, "prefsGet");
  const players = vi.spyOn(streamApi, "players");
  const sources = vi.spyOn(streamApi, "streamSources");
  await prefetchEpisode("allanime", "allanime:abc", "allanime:abc|2");
  expect(prefs).not.toHaveBeenCalled();
  expect(players).not.toHaveBeenCalled();
  expect(sources).not.toHaveBeenCalled();
});

it("does not resolve an obsolete remembered variant in parallel with the selected one", async () => {
  vi.spyOn(streamApi, "prefsGet").mockResolvedValue({
    sourceId: "allanime",
    mediaId: "allanime:request-audit",
    variantId: "AllAnime:sub:removed",
    quality: "720p",
    audioLang: "",
    subLang: "",
    subEnabled: true,
  });
  vi.spyOn(streamApi, "players").mockResolvedValue([
    { id: "dub:Yt-mp4", name: "Dub", player: "AllAnime", sourceUrl: "", separateStream: true },
  ]);
  const sources = vi.spyOn(streamApi, "streamSources").mockResolvedValue([]);
  await resolvePlayable(
    "allanime",
    "allanime:request-audit",
    "allanime:request-audit|1",
    "audit-key",
    true,
    "720p"
  );
  expect(sources).toHaveBeenCalledTimes(1);
  expect(sources).toHaveBeenCalledWith(
    { episodeId: "allanime:request-audit|1", variantId: "AllAnime:dub:Yt-mp4" },
    "allanime"
  );
});
