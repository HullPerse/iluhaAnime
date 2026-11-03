import { useMemo } from "react";

import { anilistApi } from "@/api/anilist.api";
import { torrentApi } from "@/api/torrent.api";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useCoverCache } from "@/hooks/collection/cache.hook";
import { parseMediaFile } from "@/lib/search/parse.utils";
import { queryKeys } from "@/lib/core/keys.utils";
import {
  findLocalMatch,
  findResolvedAlias,
  mediaToCandidate,
  normCoverKey,
  POSTER_TIMEOUT_MS,
  resolveCover,
  withTimeout,
} from "@/lib/core/cover.utils";
import type { CoverCandidate, CoverProfile, CoverQuery } from "@/types/core/cover";
import { useCell } from "@/lib/core/signal.hook";
import { attempt, attemptSync, reportBackgroundError } from "@/lib/core/attempt.utils";
import { coverCorrectionsAtoms, coverKey, setResolvedCover } from "@/store/cover.store";
import { searchAtoms } from "@/store/search.store";
import { settingsAtoms } from "@/store/settings.store";
import type { AniMedia } from "@/types/anilist/anilist";
import type { TorrentCoverMode } from "@/types/ui/settings";
import type { TorrentCoverState } from "@/types/search/searchCover";

const COVER_SEARCH_TTL_MS = 5 * 60_000;
const COVER_SEARCH_CACHE_MAX = 256;
const COVER_SEARCH_CONCURRENCY = 3;

const coverSearchCache = new Map<string, { at: number; data: CoverCandidate[] }>();
const coverSearchInflight = new Map<string, Promise<CoverCandidate[]>>();
const coverSearchQueue: Array<() => void> = [];
let activeCoverSearches = 0;

function coverSearchKey(query: CoverQuery): string {
  return `${query.query.trim().toLowerCase()}|${query.format ?? ""}|${query.seasonYear ?? 0}`;
}

async function withCoverSearchSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeCoverSearches >= COVER_SEARCH_CONCURRENCY) {
    await new Promise<void>((resolve) => {
      coverSearchQueue.push(resolve);
    });
  }
  activeCoverSearches += 1;
  try {
    return await task();
  } finally {
    activeCoverSearches -= 1;
    coverSearchQueue.shift()?.();
  }
}

async function fetchCoverSearch(query: CoverQuery): Promise<CoverCandidate[]> {
  const [media, error] = await attempt(
    anilistApi.search<AniMedia>({
      query: query.query,
      ...(query.format ? { format: query.format } : {}),
      ...(query.seasonYear ? { seasonYear: query.seasonYear } : {}),
      perPage: 5,
    })
  );
  if (error !== null) {
    reportBackgroundError("cover.search", error);
    return [];
  }
  return media.map(mediaToCandidate);
}

async function searchBackend(query: CoverQuery): Promise<CoverCandidate[]> {
  const key = coverSearchKey(query);
  const cached = coverSearchCache.get(key);
  if (cached && Date.now() - cached.at < COVER_SEARCH_TTL_MS) return cached.data;
  const inflight = coverSearchInflight.get(key);
  if (inflight) return inflight;
  const task = withCoverSearchSlot(() => fetchCoverSearch(query))
    .then((data) => {
      coverSearchCache.set(key, { at: Date.now(), data });
      while (coverSearchCache.size > COVER_SEARCH_CACHE_MAX) {
        const oldest = coverSearchCache.keys().next().value;
        if (oldest === undefined) break;
        coverSearchCache.delete(oldest);
      }
      return data;
    })
    .finally(() => {
      coverSearchInflight.delete(key);
    });
  coverSearchInflight.set(key, task);
  return task;
}

export function resetCoverSearchCache(): void {
  coverSearchCache.clear();
  coverSearchInflight.clear();
  coverSearchQueue.length = 0;
  activeCoverSearches = 0;
}

async function pagePoster(
  source: string,
  url: string | null,
  proxy: string
): Promise<string | null> {
  if (!url) return null;
  const [host] = attemptSync(() => new URL(url).host.toLowerCase());
  const site = host ?? "unparseable";
  if (source === "rutracker" && site !== "rutracker.org") return null;
  if (source === "nekobt" && site !== "nekobt.to") return null;
  if (
    source === "erai-raws" &&
    site !== "erai-raws.info" &&
    site !== "www.erai-raws.info"
  )
    return null;
  if (source !== "rutracker" && source !== "nekobt" && source !== "erai-raws") return null;
  const task = torrentApi.getTorrentPoster(source, url, proxy || undefined).then(
    (poster) => poster ?? null,
    (error: unknown) => {
      reportBackgroundError("cover.poster", error);
      return null;
    }
  );
  return withTimeout(task, POSTER_TIMEOUT_MS, () => null);
}

interface CoverSnapshot {
  title: string;
  searchTitle: string;
  season?: number;
  year?: number;
  kind: string;
  arc?: string;
  altTitles?: string[];
}

function buildCoverSnapshot(parsed: {
  title: string;
  searchTitle: string;
  season?: number;
  year?: number;
  kind: string;
  arc?: string;
  altTitles?: string[];
}): CoverSnapshot {
  return {
    title: parsed.title,
    searchTitle: parsed.searchTitle,
    ...(parsed.season !== undefined ? { season: parsed.season } : {}),
    ...(parsed.year !== undefined ? { year: parsed.year } : {}),
    kind: parsed.kind,
    ...(parsed.arc ? { arc: parsed.arc } : {}),
    ...(parsed.altTitles ? { altTitles: parsed.altTitles } : {}),
  };
}

function useCoverPoster(
  source: string,
  pageUrl: string | null,
  proxy: string,
  enabled: boolean
) {
  return useAppQuery("slow", {
    queryKey: queryKeys.torrentPoster(pageUrl, source, proxy),
    queryFn: () => pagePoster(source, pageUrl, proxy),
    enabled: enabled && pageUrl !== null,
    retry: false,
  });
}

function useCoverCascade(
  key: string,
  snapshot: CoverSnapshot,
  rejected: ReadonlySet<number>,
  rejectedIds: number[] | undefined,
  learnedTitle: string | null,
  localTitle: string | null,
  trustedIds: ReadonlySet<number>,
  profileById: ReadonlyMap<number, CoverProfile>,
  rawTitle: string,
  enabled: boolean
) {
  return useAppQuery("slow", {
    queryKey: queryKeys.coverResolve(key, rejectedIds ?? null, learnedTitle, localTitle),
    queryFn: async () => {
      const stored = coverCorrectionsAtoms.resolved.get();
      const hit = stored[key];
      if (hit && !rejected.has(hit.id)) {
        const candidate = { id: hit.id, romaji: hit.title, coverUrl: hit.coverUrl };
        return { pick: { candidate, score: 100 }, candidates: [candidate] };
      }
      const season = snapshot.season ?? 0;
      const lookupNames = [
        snapshot.title,
        snapshot.searchTitle,
        ...(localTitle ? [localTitle] : []),
      ];
      const alias = findResolvedAlias(stored, {
        season,
        names: lookupNames,
        ...(snapshot.year !== undefined ? { year: snapshot.year } : {}),
      });
      if (alias && !rejected.has(alias.id)) {
        const candidate = { id: alias.id, romaji: alias.title, coverUrl: alias.coverUrl };
        return { pick: { candidate, score: 100 }, candidates: [candidate] };
      }
      const resolution = await resolveCover(
        snapshot,
        { search: searchBackend },
        {
          rejected,
          learnedTitle,
          profileById,
          localTitle,
          trustedIds,
          rawTitle,
        }
      );
      const pick = resolution.pick;
      if (pick && !rejected.has(pick.candidate.id)) {
        const names = [...new Set(lookupNames.map((name) => normCoverKey(name)))].filter(
          (name) => name.length > 0
        );
        setResolvedCover(key, {
          id: pick.candidate.id,
          coverUrl: pick.candidate.coverUrl ?? null,
          title: pick.candidate.romaji,
          at: Date.now(),
          names,
          season,
          ...(snapshot.year !== undefined ? { year: snapshot.year } : {}),
        });
      }
      return resolution;
    },
    enabled,
    retry: false,
  });
}
interface CoverContext {
  parsedTitle: string;
  key: string;
  override: { id: number; coverUrl: string | null } | undefined;
  rejected: ReadonlySet<number>;
  rejectedIds: number[] | undefined;
  learnedTitle: string | null;
  localTitle: string | null;
  trustedIds: ReadonlySet<number>;
  profileById: ReadonlyMap<number, CoverProfile>;
  snapshot: CoverSnapshot;
  pageUrl: string | null;
  isPage: boolean;
}

function useCoverContext(
  torrentTitle: string,
  options: { source?: string; url?: string | null; pageUrl?: string | null }
): CoverContext {
  const parsed = useMemo(() => parseMediaFile(null, torrentTitle), [torrentTitle]);
  const key = coverKey(parsed.title, parsed.season);
  const overrides = useCell(coverCorrectionsAtoms.overrides);
  const rejections = useCell(coverCorrectionsAtoms.rejections);
  const aliases = useCell(coverCorrectionsAtoms.aliases);
  const animeIndex = useCell(searchAtoms.animeIndex);
  const override = overrides[key];
  const rejectedIds = rejections[key];
  const rejected = useMemo(() => new Set(rejectedIds ?? []), [rejectedIds]);
  const learnedTitle = aliases[key] ?? null;
  const localMatch = useMemo(
    () =>
      findLocalMatch(
        { title: parsed.title, searchTitle: parsed.searchTitle, season: parsed.season },
        animeIndex
      ),
    [parsed, animeIndex]
  );
  const profileById = useMemo(() => {
    const map = new Map<number, CoverProfile>();
    for (const entry of animeIndex) {
      map.set(entry.id, {
        userScore: entry.score,
        listStatus: entry.status,
        favourite: entry.favourite,
      });
    }
    return map;
  }, [animeIndex]);

  const { source, url } = options;
  const pageUrl =
    (options.pageUrl?.trim() ? options.pageUrl : null) ??
    (source === "rutracker" || source === "nekobt" ? (url ?? null) : null);

  const snapshot = useMemo(() => buildCoverSnapshot(parsed), [parsed]);
  const trustedIds = useMemo(() => new Set(localMatch ? [localMatch.id] : []), [localMatch]);

  return {
    parsedTitle: parsed.title,
    key,
    override,
    rejected,
    rejectedIds,
    learnedTitle,
    localTitle: localMatch?.title ?? null,
    trustedIds,
    profileById,
    snapshot,
    pageUrl,
    isPage: pageUrl !== null,
  };
}

interface CoverQueryStates {
  posterLoading: boolean;
  posterUrl: string | null;
  cascadeLoading: boolean;
  pickId: number | null;
  candidates: CoverCandidate[];
}

function toCoverState(
  key: string,
  coverUrl: string | null,
  remoteUrl: string | null,
  override: { id: number } | undefined,
  states: CoverQueryStates,
  isPage: boolean
): TorrentCoverState {
  const base = { coverUrl, remoteUrl, candidates: states.candidates, coverKey: key };
  if (override) return { ...base, status: "override", anilistId: override.id };
  if (isPage && states.posterUrl) {
    return { ...base, status: "page", anilistId: null };
  }
  if (states.pickId !== null) {
    return { ...base, status: "resolved", anilistId: states.pickId };
  }
  if (states.posterLoading || states.cascadeLoading) {
    return { ...base, status: "pending", coverUrl: null, anilistId: null };
  }
  return { ...base, status: "empty", coverUrl: null, anilistId: null };
}

function firstCoverUrl(
  override: { coverUrl: string | null } | undefined,
  poster: string | null,
  resolved:
    | { pick?: { candidate: { coverUrl?: string | null } } | null }
    | undefined
): string | null {
  if (override?.coverUrl) return override.coverUrl;
  if (poster) return poster;
  return resolved?.pick?.candidate.coverUrl ?? null;
}

export function useTorrentCover(
  torrentTitle: string,
  options: {
    source?: string;
    url?: string | null;
    pageUrl?: string | null;
    mode?: TorrentCoverMode;
  } = {}
): TorrentCoverState {
  const { mode = "full", source = "", url = null, pageUrl = null } = options;
  const pageEnabled = mode !== "off";
  const anilistEnabled = mode === "full";
  const sourceProxies = useCell(settingsAtoms.searchProxyUrls);
  const sourceProxy = sourceProxies[source] ?? "";
  const ctx = useCoverContext(torrentTitle, { source, url, pageUrl });
  const poster = useCoverPoster(
    source,
    ctx.pageUrl,
    sourceProxy,
    !ctx.override && pageEnabled
  );
  const resolved = useCoverCascade(
    ctx.key,
    ctx.snapshot,
    ctx.rejected,
    ctx.rejectedIds,
    ctx.learnedTitle,
    ctx.localTitle,
    ctx.trustedIds,
    ctx.profileById,
    torrentTitle,
    anilistEnabled && !ctx.override && ctx.parsedTitle.length > 0
  );

  const remoteUrl = firstCoverUrl(ctx.override, poster.data ?? null, resolved.data);
  const { cachedUrl } = useCoverCache(remoteUrl);
  return toCoverState(
    ctx.key,
    cachedUrl,
    remoteUrl,
    ctx.override,
    {
      posterLoading: poster.isLoading,
      posterUrl: poster.data ?? null,
      cascadeLoading: resolved.isLoading,
      pickId: resolved.data?.pick?.candidate.id ?? null,
      candidates: resolved.data?.candidates ?? [],
    },
    ctx.isPage
  );
}
