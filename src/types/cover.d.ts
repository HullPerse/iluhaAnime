import type { Cell } from "@/types/signal";

export interface CoverParsed {
  title: string;
  searchTitle: string;
  season?: number;
  year?: number;
  kind?: string;
  arc?: string;
  altTitles?: string[];
}

export interface CoverProfile {
  userScore?: number | null;
  listStatus?: string | null;
  favourite?: boolean;
}

export interface CoverCandidate {
  id: number;
  romaji: string;
  english?: string | null;
  extraTitles?: string[];
  format?: string | null;
  seasonYear?: number | null;
  coverUrl?: string | null;
  userScore?: number | null;
  listStatus?: string | null;
  favourite?: boolean;
}

export interface LocalIndexEntry {
  id: number;
  title: string;
  aliases: string[];
}

export interface CoverQuery {
  query: string;
  format?: string;
  seasonYear?: number;
}

export interface CoverMediaLike {
  id: number;
  title: string;
  title_romaji?: string | null;
  title_english?: string | null;
  titles: string[];
  format?: string | null;
  season_year?: number | null;
  cover_url?: string | null;
}

export interface CoverSearchBackend {
  search: (query: CoverQuery) => Promise<CoverCandidate[]>;
  delay?: (ms: number) => Promise<void>;
}

export interface CoverResolution {
  pick: { candidate: CoverCandidate; score: number } | null;
  candidates: CoverCandidate[];
}

export interface ResolveCoverOptions {
  rejected?: ReadonlySet<number>;
  learnedTitle?: string | null;
  profileById?: ReadonlyMap<number, CoverProfile>;
  localTitle?: string | null;
  trustedIds?: ReadonlySet<number>;
  rawTitle?: string | null;
}

export interface NormalizedResolvedCover {
  id: number;
  coverUrl: string | null;
  title: string;
  at: number;
  names: string[];
  season: number;
  year?: number;
}

export interface CoverOverride {
  id: number;
  coverUrl: string | null;
  title: string;
  at: number;
}

export interface ResolvedCover {
  id: number;
  coverUrl: string | null;
  title: string;
  at: number;
  names?: string[];
  season?: number;
  year?: number;
}

export interface CoverCorrectionsStore {
  atoms: CoverCorrectionsAtoms;
  flush: () => void;
  setOverride: (key: string, value: CoverOverride) => void;
  removeOverride: (key: string) => void;
  rejectCandidate: (key: string, id: number) => void;
  learnAlias: (key: string, animeTitle: string) => void;
  setResolved: (key: string, value: ResolvedCover) => void;
  removeResolved: (key: string) => void;
  setBlob: (remoteUrl: string, blobId: string) => void;
}

export type CoverCorrectionsAtoms = {
  [K in keyof CoverCorrectionsData]: Cell<CoverCorrectionsData[K]>;
};

export interface CoverCorrectionsData {
  overrides: Record<string, CoverOverride>;
  rejections: Record<string, number[]>;
  aliases: Record<string, string>;
  resolved: Record<string, ResolvedCover>;
  blobs: Record<string, string>;
}
