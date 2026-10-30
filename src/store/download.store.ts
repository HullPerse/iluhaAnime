import { open, confirm } from "@tauri-apps/plugin-dialog";
import { createSignalStore } from "@/lib/signal.store";
import type { Cell } from "@/types/signal";

import { systemApi } from "@/api/system.api";
import { torrentApi } from "@/api/torrent.api";
import { tr } from "@/lib/locale/i18n.utils";
import { torrentErrorText } from "@/lib/torrentCommon.utils";
import { attempt, reportBackgroundError, withFallback } from "@/lib/attempt.utils";
import { showError } from "@/lib/notification.utils";
import { ignore } from "@/lib/promise.utils";
import { cacheAtoms, setLastSaveDir } from "@/store/cache.store";
import type { TorrentAtoms, TorrentData, TorrentSignalStore } from "@/types/download";

export { tr };

function hasConflictingSelection(
  pending: { files: { index: number; name: string }[]; conflictingFiles: string[] },
  selectedIndices: number[]
): boolean {
  return selectedIndices.some((i) => {
    const file = pending.files.find((f) => f.index === i);
    return Boolean(file && pending.conflictingFiles.includes(file.name));
  });
}

/**
 * The free space the start command asks the backend to reserve. A fresh add
 * writes the payload into `<name>.part`, so a file that already exists at the
 * final name stays on disk until the finished `.part` replaces it. Selected
 * conflicting files therefore need room for both copies.
 */
export function requiredBytesForSelection(
  pending: {
    files: { index: number; name: string; size: number }[];
    conflictingFiles: string[];
  },
  selectedIndices: number[]
): number {
  return selectedIndices.reduce((sum, index) => {
    const file = pending.files.find((entry) => entry.index === index);
    if (!file) return sum;
    const existing = pending.conflictingFiles.includes(file.name) ? file.size : 0;
    return sum + file.size + existing;
  }, 0);
}

function resolveOnlyFiles(allFiles: { index: number }[], selected: number[]): number[] | null {
  return selected.length === allFiles.length ? null : selected;
}

async function startDownloadForPending(
  pending: { magnet?: string; fileBytes?: number[] },
  saveDir: string,
  onlyFiles: number[] | null,
  subFolder: string | undefined,
  sequential: boolean,
  requiredBytes: number
): Promise<number | undefined> {
  if (pending.magnet || pending.fileBytes) {
    const [id, error] = await attempt(
      torrentApi.startTorrentDownload({
        magnet: pending.magnet,
        fileBytes: pending.fileBytes,
        saveDir,
        onlyFiles,
        subFolder: subFolder || null,
        sequential,
        requiredBytes,
      })
    );
    if (error) {
      showError(tr("download.error.start"), error.message);
      return undefined;
    }
    return id;
  }
  return undefined;
}

async function clearPreviousTorrentIfNeeded(id: number | undefined): Promise<void> {
  if (!id) return;
  const [, error] = await attempt(torrentApi.removeTorrent(id, false));
  if (error) showError(tr("download.error.clear"), error.message);
}

export function createTorrentSignalStore(): TorrentSignalStore {
  const store = createSignalStore();
  const atoms = {} as TorrentAtoms;
  const sink = atoms as unknown as Record<string, Cell<unknown>>;
  const initial: TorrentData = {
    limits: { download: null, upload: null },
    metadataCache: new Map(),
    pendingTorrent: null,
    prepareQueue: [],
    preparingTorrent: false,
    opInFlight: {},
    lastActiveAt: {},
  };
  const source = initial as unknown as Record<string, unknown>;
  for (const key of Object.keys(initial)) {
    sink[key] = store.atom(key, source[key]);
  }

  const handle: TorrentSignalStore = {
    atoms,
    cancelDownload: async () => {
      const pending = atoms.pendingTorrent.get();
      if (!pending) {
        atoms.preparingTorrent.set(false);
        atoms.pendingTorrent.set(null);
        handle.prepareNextInQueue();
        return;
      }
      if (pending.id) {
        const [, error] = await attempt(torrentApi.removeTorrent(pending.id, false));
        if (error) showError(tr("download.error.cancel"), error.message);
      }
      atoms.preparingTorrent.set(false);
      atoms.pendingTorrent.set(null);
      handle.prepareNextInQueue();
    },
    confirmDownload: async (selectedIndices, saveDir, subFolder, sequential) => {
      const pending = atoms.pendingTorrent.get();
      if (!pending) return;
      if (hasConflictingSelection(pending, selectedIndices)) {
        const overwrite = await confirm(tr("download.confirm.overwrite"));
        if (!overwrite) return;
      }
      setLastSaveDir(saveDir);
      await clearPreviousTorrentIfNeeded(pending.id);
      const onlyFiles = resolveOnlyFiles(pending.files, selectedIndices);
      const requiredBytes = requiredBytesForSelection(pending, selectedIndices);

      const id = await startDownloadForPending(
        pending,
        saveDir,
        onlyFiles,
        subFolder,
        sequential ?? false,
        requiredBytes
      );
      if (id === undefined) return;
      if (pending.origin) {
        const [, sourceError] = await attempt(
          torrentApi.setTorrentSource(id, pending.origin, undefined)
        );
        if (sourceError) reportBackgroundError("torrent.origin.save", sourceError);
      }
      atoms.pendingTorrent.set(null);
      handle.prepareNextInQueue();
    },
    getTorrentLimits: (id) =>
      withFallback(torrentApi.getTorrentLimits(id), {
        downloadBps: null,
        uploadBps: null,
      }),
    queueTorrentFiles: (filePaths) => {
      if (filePaths.length === 0) return;
      atoms.prepareQueue.set([
        ...atoms.prepareQueue.get(),
        ...filePaths.map((value) => ({ kind: "file" as const, value })),
      ]);
      handle.prepareNextInQueue();
    },
    prepareNextInQueue: () => {
      if (atoms.preparingTorrent.get() || atoms.pendingTorrent.get()) return;
      const queue = atoms.prepareQueue.get();
      const next = queue[0];
      if (!next) return;
      atoms.prepareQueue.set(queue.slice(1));
      if (next.kind === "magnet") ignore(handle.prepareTorrentDownload(next.value));
      else ignore(handle.prepareTorrentDownloadFromFile(next.value));
    },
    prepareTorrentDownload: async (magnet, info) => {
      if (atoms.preparingTorrent.get()) return;
      let saveDir = cacheAtoms.lastSaveDir.get();
      if (!saveDir) {
        const dir = await open({
          directory: true,
          title: tr("download.select.folder"),
        });
        if (!dir) return;
        saveDir = dir;
        setLastSaveDir(saveDir);
      }

      atoms.preparingTorrent.set(true);

      const cached = atoms.metadataCache.get().get(magnet);
      if (cached) {
        atoms.preparingTorrent.set(false);
        atoms.pendingTorrent.set({
          magnet,
          id: 0,
          name: cached.name,
          files: cached.files,
          conflictingFiles: cached.conflictingFiles,
          hasCommonFolder: cached.hasCommonFolder,
          seeders: info?.seeders,
          origin: info?.origin,
        });
        return;
      }

      const [result, error] = await attempt(torrentApi.getTorrentInfo(magnet, saveDir));
      if (error) showError(tr("download.error.get.info"), error.message);

      if (!result) {
        atoms.preparingTorrent.set(false);
        handle.prepareNextInQueue();
        return;
      }

      const cache = new Map(atoms.metadataCache.get());
      cache.set(magnet, {
        name: result.name,
        files: result.files,
        conflictingFiles: result.conflicting_files,
        hasCommonFolder: result.has_common_folder,
        savedAt: Date.now(),
      });
      atoms.metadataCache.set(cache);
      atoms.preparingTorrent.set(false);
      atoms.pendingTorrent.set({
        magnet,
        id: result.id,
        name: result.name,
        files: result.files,
        conflictingFiles: result.conflicting_files,
        hasCommonFolder: result.has_common_folder,
        seeders: info?.seeders,
        origin: info?.origin,
      });
    },
    prepareTorrentDownloadFromFile: async (filePath, info) => {
      if (atoms.preparingTorrent.get()) return;
      let saveDir = cacheAtoms.lastSaveDir.get();
      if (!saveDir) {
        const dir = await open({
          directory: true,
          title: tr("download.select.folder"),
        });
        if (!dir) return;
        saveDir = dir;
        setLastSaveDir(saveDir);
      }

      atoms.preparingTorrent.set(true);

      const [fileBytes, error] = await attempt(systemApi.readFileBytes(filePath));
      if (error) showError(tr("download.error.read.file"), error.message);

      if (!fileBytes) {
        atoms.preparingTorrent.set(false);
        handle.prepareNextInQueue();
        return;
      }

      const cached = atoms.metadataCache.get().get(filePath);
      if (cached) {
        atoms.preparingTorrent.set(false);
        atoms.pendingTorrent.set({
          fileBytes,
          id: 0,
          name: cached.name,
          files: cached.files,
          conflictingFiles: cached.conflictingFiles,
          hasCommonFolder: cached.hasCommonFolder,
          seeders: info?.seeders,
          origin: info?.origin,
        });
        return;
      }

      const [result, infoError] = await attempt(
        torrentApi.getTorrentInfoFromFile(fileBytes, saveDir)
      );
      if (infoError) showError(tr("download.error.get.info"), infoError.message);

      if (!result) {
        atoms.preparingTorrent.set(false);
        handle.prepareNextInQueue();
        return;
      }

      const cache = new Map(atoms.metadataCache.get());
      cache.set(filePath, {
        name: result.name,
        files: result.files,
        conflictingFiles: result.conflicting_files,
        hasCommonFolder: result.has_common_folder,
        savedAt: Date.now(),
      });
      atoms.metadataCache.set(cache);
      atoms.preparingTorrent.set(false);
      atoms.pendingTorrent.set({
        fileBytes,
        id: result.id,
        name: result.name,
        files: result.files,
        conflictingFiles: result.conflicting_files,
        hasCommonFolder: result.has_common_folder,
        seeders: info?.seeders,
        origin: info?.origin,
      });
    },
    prepareTorrentDownloadFromBytes: async (fileBytes, info) => {
      if (atoms.preparingTorrent.get()) return;
      let saveDir = cacheAtoms.lastSaveDir.get();
      if (!saveDir) {
        const dir = await open({
          directory: true,
          title: tr("download.select.folder"),
        });
        if (!dir) return;
        saveDir = dir;
        setLastSaveDir(saveDir);
      }

      atoms.preparingTorrent.set(true);

      const [result, error] = await attempt(torrentApi.getTorrentInfoFromFile(fileBytes, saveDir));
      if (error) showError(tr("download.error.get.info"), error.message);

      if (!result) {
        atoms.preparingTorrent.set(false);
        handle.prepareNextInQueue();
        return;
      }

      atoms.preparingTorrent.set(false);
      atoms.pendingTorrent.set({
        fileBytes,
        id: result.id,
        name: result.name,
        files: result.files,
        conflictingFiles: result.conflicting_files,
        hasCommonFolder: result.has_common_folder,
        seeders: info?.seeders,
        origin: info?.origin,
      });
    },
    setSpeedLimits: async (limits) => {
      atoms.limits.set(limits);
      const downloadBps = limits.download !== null ? limits.download * 1024 : null;
      const uploadBps = limits.upload !== null ? limits.upload * 1024 : null;
      const [, error] = await attempt(torrentApi.setGlobalSpeedLimits(downloadBps, uploadBps));
      if (error) showError(tr("download.error.limit"), error.message);
    },
    setTorrentLimits: async (id, limits, infoHash) => {
      if (!Number.isInteger(id)) return;
      const downloadBps =
        limits.download !== null && limits.download > 0 ? Math.round(limits.download * 1024) : null;
      const uploadBps =
        limits.upload !== null && limits.upload > 0 ? Math.round(limits.upload * 1024) : null;
      const [, error] = await attempt(
        torrentApi.setTorrentLimits(id, { downloadBps, uploadBps }, infoHash)
      );
      if (error) showError(tr("download.error.set.limits"), torrentErrorText(error.message, tr));
    },
  };

  return handle;
}

const torrents = createTorrentSignalStore();

export const torrentAtoms = torrents.atoms;
export const cancelTorrentDownload = torrents.cancelDownload;
export const confirmTorrentDownload = torrents.confirmDownload;
export const getTorrentLimits = torrents.getTorrentLimits;
export const queueTorrentFiles = torrents.queueTorrentFiles;
export const prepareNextTorrentInQueue = torrents.prepareNextInQueue;
export const prepareTorrentDownload = torrents.prepareTorrentDownload;
export const prepareTorrentDownloadFromFile = torrents.prepareTorrentDownloadFromFile;
export const prepareTorrentDownloadFromBytes = torrents.prepareTorrentDownloadFromBytes;
export const setTorrentSpeedLimits = torrents.setSpeedLimits;
export const setTorrentLimits = torrents.setTorrentLimits;
