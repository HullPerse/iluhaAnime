import { useMemo } from "react";

import { anilistApi } from "@/api/anilist.api";
import { torrentApi } from "@/api/torrent.api";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useCoverCache } from "@/hooks/collection/cache.hook";
import { parseMediaFile } from "@/lib/media/parse.utils";
import {
  findLocalMatch,
  findResolvedAlias,
  mediaToCandidate,
  normCoverKey,
  POSTER_TIMEOUT_MS,
  resolveCover,
  withTimeout,
  type CoverCandidate,
  type CoverProfile,
  type CoverQuery,
} from "@/lib/search/cover.utils";
import { useCell } from "@/lib/state/signal.hook";
import { attempt, attemptSync, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { coverCorrectionsAtoms, coverKey, setResolvedCover } from "@/store/cover.store";
import { searchAtoms } from "@/store/search.store";
import type { AniMedia } from "@/types/anilist";

export type TorrentCoverStatus = "override" | "page" | "resolved" | "pending" | "empty";

export interface TorrentCoverState {
  status: TorrentCoverStatus;
  coverUrl: string | null;
  remoteUrl: string | null;
  anilistId: number | null;
  candidates: CoverCandidate[];
  coverKey: string;
}

async function searchBackend(query: CoverQuery): Promise<CoverCandidate[]> {
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

async function pagePoster(source: string, url: string | null): Promise<string | null> {
  if (!url) return null;
  const [host] = attemptSync(() => new URL(url).host.toLowerCase());
  const site = host ?? "unparseable";
  if (source !== "rutracker" || site !== "rutracker.org") return null;
  const task = torrentApi.getTorrentDetails(source, url).then(
    (details) => details.poster ?? null,
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

function useCoverPoster(pageUrl: string | null, enabled: boolean) {
  return useAppQuery("slow", {
    queryKey: ["torrent_poster", pageUrl],
    queryFn: () => pagePoster("rutracker", pageUrl),
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
    queryKey: ["cover_resolve", key, rejectedIds ?? null, learnedTitle, localTitle],
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
  options: { source?: string; url?: string | null }
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
  const pageUrl = source === "rutracker" ? (url ?? null) : null;

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

export function useTorrentCover(
  torrentTitle: string,
  options: { source?: string; url?: string | null; enabled?: boolean } = {}
): TorrentCoverState {
  const { enabled = true } = options;
  const ctx = useCoverContext(torrentTitle, options);
  const poster = useCoverPoster(ctx.pageUrl, !ctx.override && enabled);
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
    enabled && !ctx.override && ctx.parsedTitle.length > 0
  );

  const remoteUrl =
    ctx.override?.coverUrl ?? poster.data ?? resolved.data?.pick?.candidate.coverUrl ?? null;
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
