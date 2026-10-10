import { normalizeResolvedCover, normCoverKey } from "@/lib/search/cover.utils";
import { createPersistedStoreContext } from "@/lib/state/persisted.utils";
import type { Cell } from "@/lib/state/signal.store";
import { attemptSync } from "@/lib/utils/attempt.utils";

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

interface CoverCorrectionsData {
  overrides: Record<string, CoverOverride>;
  rejections: Record<string, number[]>;
  aliases: Record<string, string>;
  resolved: Record<string, ResolvedCover>;
  blobs: Record<string, string>;
}

const RESOLVED_CAP = 500;
const BLOBS_CAP = 500;

function capRecord<T>(
  record: Record<string, T>,
  key: string,
  value: T,
  cap: number
): Record<string, T> {
  const next = { ...record };
  delete next[key];
  next[key] = value;
  const keys = Object.keys(next);
  if (keys.length <= cap) return next;
  for (const key of keys.slice(0, keys.length - cap)) {
    delete next[key];
  }
  return next;
}

type CoverCorrectionsAtoms = { [K in keyof CoverCorrectionsData]: Cell<CoverCorrectionsData[K]> };

export function coverKey(title: string, season?: number): string {
  const norm = normCoverKey(title);
  return `${norm}|${season ?? 0}`;
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

export function createCoverCorrectionsStore(
  getStorage?: () => Storage | undefined
): CoverCorrectionsStore {
  const { store, persistor } = createPersistedStoreContext({
    storeName: "coverCorrections",
    short: "covers",
    schemaVersion: 3,
    ...(getStorage ? { getStorage } : {}),
  });

  const [persisted, persistedError] = attemptSync(() => persistor.read());
  const persistedData =
    persistedError === null ? ((persisted?.data ?? {}) as Partial<CoverCorrectionsData>) : {};
  // v3 drops the resolved cache: v2 entries could cement a season-blind
  // pick (S1 cover stored for an S2 title). Corrections, aliases, and
  // blobs carry over untouched.
  const keepResolved = (persisted?.schemaVersion ?? 0) >= 3;
  const rawResolved = keepResolved ? (persistedData.resolved ?? {}) : {};
  const resolvedInit: Record<string, ResolvedCover> = {};
  for (const [storedKey, storedEntry] of Object.entries(rawResolved)) {
    resolvedInit[storedKey] = normalizeResolvedCover(storedKey, storedEntry);
  }
  const atoms = {
    overrides: store.atom("overrides", persistedData.overrides ?? {}),
    rejections: store.atom("rejections", persistedData.rejections ?? {}),
    aliases: store.atom("aliases", persistedData.aliases ?? {}),
    resolved: store.atom("resolved", resolvedInit),
    blobs: store.atom("blobs", persistedData.blobs ?? {}),
  } as CoverCorrectionsAtoms;
  const write = (): void => {
    persistor.write({
      overrides: atoms.overrides.get(),
      rejections: atoms.rejections.get(),
      aliases: atoms.aliases.get(),
      resolved: atoms.resolved.get(),
      blobs: atoms.blobs.get(),
    });
  };
  store.subscribeAll(write);

  return {
    atoms,
    flush: () => persistor.flush(),
    setOverride: (key, value) => {
      atoms.overrides.set({ ...atoms.overrides.get(), [key]: value });
      removeResolvedFor(atoms, key);
    },
    removeOverride: (key) => {
      const next = { ...atoms.overrides.get() };
      delete next[key];
      atoms.overrides.set(next);
    },
    rejectCandidate: (key, id) => {
      const current = atoms.rejections.get()[key] ?? [];
      if (current.includes(id)) return;
      atoms.rejections.set({ ...atoms.rejections.get(), [key]: [...current, id] });
      removeResolvedFor(atoms, key);
    },
    learnAlias: (key, animeTitle) => {
      if (!animeTitle.trim()) return;
      atoms.aliases.set({ ...atoms.aliases.get(), [key]: animeTitle });
      removeResolvedFor(atoms, key);
    },
    setResolved: (key, value) => {
      atoms.resolved.set(capRecord(atoms.resolved.get(), key, value, RESOLVED_CAP));
    },
    removeResolved: (key) => {
      removeResolvedFor(atoms, key);
    },
    setBlob: (remoteUrl, blobId) => {
      atoms.blobs.set(capRecord(atoms.blobs.get(), remoteUrl, blobId, BLOBS_CAP));
    },
  };
}

function removeResolvedFor(atoms: CoverCorrectionsAtoms, key: string): void {
  if (!(key in atoms.resolved.get())) return;
  const next = { ...atoms.resolved.get() };
  delete next[key];
  atoms.resolved.set(next);
}

const corrections = createCoverCorrectionsStore();

export const coverCorrectionsAtoms = corrections.atoms;
export const setCoverOverride = corrections.setOverride;
export const removeCoverOverride = corrections.removeOverride;
export const rejectCoverCandidate = corrections.rejectCandidate;
export const learnCoverAlias = corrections.learnAlias;
export const setResolvedCover = corrections.setResolved;
export const removeResolvedCover = corrections.removeResolved;
export const setCoverBlob = corrections.setBlob;
