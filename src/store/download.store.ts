import { confirm } from "@tauri-apps/plugin-dialog";
import { createSignalStore } from "@hullperse/hp_utils/signal";
import { buildSignalAtoms } from "@/lib/core/persistence/persisted.utils";

import { systemApi } from "@/api/system.api";
import { torrentApi } from "@/api/torrent.api";
import { tr } from "@/lib/locale/i18n.utils";
import { torrentErrorText } from "@/lib/torrent/torrentCommon.utils";
import { ipcErrorCode } from "@/lib/core/system/ipcError.utils";
import { attempt, reportBackgroundError, withFallback } from "@hullperse/hp_utils/attempt";
import { showError } from "@/lib/core/ui/notification.utils";
import { ignore } from "@/lib/core/shared/promise.utils";
import { cacheAtoms, setLastSaveDir } from "@/store/cache.store";
import {
  beginConfirmation,
  beginDirectPreparation,
  beginNextPreparation,
  cancelPreparation,
  confirmationSettled,
  enqueuePreparation,
  initialPreparationState,
  isConfirming,
  isPreparing,
  preparationFailed,
  preparationSucceeded,
} from "@/lib/torrent/preparation.utils";
import {
  clearPreviousTorrentIfNeeded,
  hasConflictingSelection,
  pickSaveDir,
  requiredBytesForSelection,
  resolveOnlyFiles,
  startDownloadForPending,
} from "@/store/download/download.helpers";
import type { TorrentData, TorrentSignalStore } from "@/types/core/download";
import type { PreparationState } from "@/types/torrent/preparation";
import type { PickerTorrent, TorrentOrigin } from "@/types/torrent/torrent";

type TorrentInfoResult = Awaited<ReturnType<typeof torrentApi.getTorrentInfo>>;

interface PreparationInfo {
  seeders?: number;
  origin?: TorrentOrigin;
}

interface CachedMetadata {
  name: string;
  files: PickerTorrent["files"];
  conflictingFiles: string[];
  hasCommonFolder: boolean;
}

type PreparationInput =
  | { kind: "magnet"; magnet: string; info?: PreparationInfo }
  | { kind: "file"; path: string; info?: PreparationInfo }
  | { kind: "bytes"; bytes: number[]; info?: PreparationInfo };

function createTorrentSignalStore(): TorrentSignalStore {
  const store = createSignalStore();
  const initial: TorrentData = {
    limits: { download: null, upload: null },
    metadataCache: new Map(),
    preparation: initialPreparationState(),
    opInFlight: {},
    lastActiveAt: {},
  };
  const atoms = buildSignalAtoms(store, initial);

  const preparation = () => atoms.preparation.get();
  const setPreparation = (next: PreparationState) => atoms.preparation.set(next);

  function pendingFromResult(
    base: { magnet?: string; fileBytes?: number[] },
    info: PreparationInfo | undefined,
    result: TorrentInfoResult
  ): PickerTorrent {
    return {
      ...base,
      id: result.id,
      name: result.name,
      files: result.files,
      conflictingFiles: result.conflicting_files,
      hasCommonFolder: result.has_common_folder,
      seeders: info?.seeders,
      origin: info?.origin,
    };
  }

  function pendingFromCache(
    base: { magnet?: string; fileBytes?: number[] },
    info: PreparationInfo | undefined,
    cached: CachedMetadata
  ): PickerTorrent {
    return {
      ...base,
      id: 0,
      name: cached.name,
      files: cached.files,
      conflictingFiles: cached.conflictingFiles,
      hasCommonFolder: cached.hasCommonFolder,
      seeders: info?.seeders,
      origin: info?.origin,
    };
  }

  function rememberMetadata(key: string, result: TorrentInfoResult): void {
    const cache = new Map(atoms.metadataCache.get());
    cache.set(key, {
      name: result.name,
      files: result.files,
      conflictingFiles: result.conflicting_files,
      hasCommonFolder: result.has_common_folder,
      savedAt: Date.now(),
    });
    atoms.metadataCache.set(cache);
  }

  function failPreparation(token: number): void {
    const current = preparation();
    if (!isPreparing(current, token)) return;
    setPreparation(preparationFailed(current, token));
    prepareNextInQueue();
  }

  function prepareNextInQueue(): void {
    const begun = beginNextPreparation(preparation());
    if (!begun) return;
    setPreparation(begun.state);
    const input: PreparationInput =
      begun.source.kind === "magnet"
        ? { kind: "magnet", magnet: begun.source.value }
        : { kind: "file", path: begun.source.value };
    ignore(prepareInput(begun.token, input));
  }

  async function resolveSaveDir(token: number): Promise<string | null> {
    if (!isPreparing(preparation(), token)) return null;
    const existing = cacheAtoms.lastSaveDir.get();
    if (existing) return existing;

    const dir = await pickSaveDir();
    if (!isPreparing(preparation(), token)) return null;
    if (!dir) {
      failPreparation(token);
      return null;
    }
    setLastSaveDir(dir);
    return dir;
  }

  async function prepareMagnet(
    token: number,
    input: { magnet: string; info?: PreparationInfo },
    saveDir: string
  ): Promise<void> {
    const cached = atoms.metadataCache.get().get(input.magnet);
    if (cached) {
      setPreparation(
        preparationSucceeded(
          preparation(),
          token,
          pendingFromCache({ magnet: input.magnet }, input.info, cached)
        )
      );
      return;
    }

    const [result, error] = await attempt(torrentApi.getTorrentInfo(input.magnet, saveDir));
    if (!isPreparing(preparation(), token)) return;
    if (error) {
      showError(tr("download.error.get.info"), error.message);
      failPreparation(token);
      return;
    }
    if (!result) {
      failPreparation(token);
      return;
    }
    rememberMetadata(input.magnet, result);
    setPreparation(
      preparationSucceeded(
        preparation(),
        token,
        pendingFromResult({ magnet: input.magnet }, input.info, result)
      )
    );
  }

  async function prepareFile(
    token: number,
    input: { path: string; info?: PreparationInfo },
    saveDir: string
  ): Promise<void> {
    const [fileBytes, readError] = await attempt(systemApi.readFileBytes(input.path));
    if (!isPreparing(preparation(), token)) return;
    if (readError) {
      showError(tr("download.error.read.file"), readError.message);
      failPreparation(token);
      return;
    }
    if (!fileBytes) {
      failPreparation(token);
      return;
    }

    const cached = atoms.metadataCache.get().get(input.path);
    if (cached) {
      setPreparation(
        preparationSucceeded(
          preparation(),
          token,
          pendingFromCache({ fileBytes }, input.info, cached)
        )
      );
      return;
    }

    const [result, error] = await attempt(torrentApi.getTorrentInfoFromFile(fileBytes, saveDir));
    if (!isPreparing(preparation(), token)) return;
    if (error) {
      showError(tr("download.error.get.info"), error.message);
      failPreparation(token);
      return;
    }
    if (!result) {
      failPreparation(token);
      return;
    }
    rememberMetadata(input.path, result);
    setPreparation(
      preparationSucceeded(
        preparation(),
        token,
        pendingFromResult({ fileBytes }, input.info, result)
      )
    );
  }

  async function prepareBytes(
    token: number,
    input: { bytes: number[]; info?: PreparationInfo },
    saveDir: string
  ): Promise<void> {
    const [result, error] = await attempt(
      torrentApi.getTorrentInfoFromFile(input.bytes, saveDir)
    );
    if (!isPreparing(preparation(), token)) return;
    if (error) {
      showError(tr("download.error.get.info"), error.message);
      failPreparation(token);
      return;
    }
    if (!result) {
      failPreparation(token);
      return;
    }
    setPreparation(
      preparationSucceeded(
        preparation(),
        token,
        pendingFromResult({ fileBytes: input.bytes }, input.info, result)
      )
    );
  }

  async function prepareInput(token: number, input: PreparationInput): Promise<void> {
    const saveDir = await resolveSaveDir(token);
    if (saveDir === null) return;
    if (input.kind === "magnet") {
      await prepareMagnet(token, input, saveDir);
      return;
    }
    if (input.kind === "file") {
      await prepareFile(token, input, saveDir);
      return;
    }
    await prepareBytes(token, input, saveDir);
  }

  const handle: TorrentSignalStore = {
    atoms,
    cancelDownload: async () => {
      const cancelled = cancelPreparation(preparation());
      setPreparation(cancelled.state);
      if (cancelled.pending?.id) {
        const [, error] = await attempt(torrentApi.removeTorrent(cancelled.pending.id, false));
        if (error) showError(tr("download.error.cancel"), error.message);
      }
      prepareNextInQueue();
    },
    confirmDownload: async (selectedIndices, saveDir, subFolder, sequential) => {
      const confirmation = beginConfirmation(preparation());
      if (!confirmation) return;
      setPreparation(confirmation.state);
      const { pending, token } = confirmation;
      const stillConfirming = () => isConfirming(preparation(), token);

      if (hasConflictingSelection(pending, selectedIndices)) {
        const overwrite = await confirm(tr("download.confirm.overwrite"));
        if (!stillConfirming()) return;
        if (!overwrite) {
          setPreparation(confirmationSettled(preparation(), token, false));
          return;
        }
      }

      setLastSaveDir(saveDir);
      await clearPreviousTorrentIfNeeded(pending.id);
      if (!stillConfirming()) return;

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

      if (!stillConfirming()) {
        if (id !== undefined) {
          const [, rollbackError] = await attempt(torrentApi.removeTorrent(id, false));
          if (rollbackError) reportBackgroundError("torrent.confirm.rollback", rollbackError);
        }
        return;
      }
      if (id === undefined) {
        setPreparation(confirmationSettled(preparation(), token, false));
        return;
      }

      if (pending.origin) {
        const [, sourceError] = await attempt(
          torrentApi.setTorrentSource(id, pending.origin, undefined)
        );
        if (sourceError) reportBackgroundError("torrent.origin.save", sourceError);
        if (!stillConfirming()) {
          const [, rollbackError] = await attempt(torrentApi.removeTorrent(id, false));
          if (rollbackError) reportBackgroundError("torrent.confirm.rollback", rollbackError);
          return;
        }
      }

      setPreparation(confirmationSettled(preparation(), token, true));
      prepareNextInQueue();
    },
    getTorrentLimits: (id) =>
      withFallback(torrentApi.getTorrentLimits(id), {
        downloadBps: null,
        uploadBps: null,
      }),
    queueTorrentFiles: (filePaths) => {
      const next = enqueuePreparation(preparation(), filePaths);
      if (next === preparation()) return;
      setPreparation(next);
      prepareNextInQueue();
    },
    prepareNextInQueue,
    prepareTorrentDownload: async (magnet, info) => {
      const begun = beginDirectPreparation(preparation());
      if (!begun) return;
      setPreparation(begun.state);
      await prepareInput(begun.token, { kind: "magnet", magnet, info });
    },
    prepareTorrentDownloadFromFile: async (filePath, info) => {
      const begun = beginDirectPreparation(preparation());
      if (!begun) return;
      setPreparation(begun.state);
      await prepareInput(begun.token, { kind: "file", path: filePath, info });
    },
    prepareTorrentDownloadFromBytes: async (fileBytes, info) => {
      const begun = beginDirectPreparation(preparation());
      if (!begun) return;
      setPreparation(begun.state);
      await prepareInput(begun.token, { kind: "bytes", bytes: fileBytes, info });
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
      if (error)
        showError(
          tr("download.error.set.limits"),
          torrentErrorText(error.message, tr, ipcErrorCode(error))
        );
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
export const prepareTorrentDownload = torrents.prepareTorrentDownload;
export const prepareTorrentDownloadFromBytes = torrents.prepareTorrentDownloadFromBytes;
export const setTorrentSpeedLimits = torrents.setSpeedLimits;
export const setTorrentLimits = torrents.setTorrentLimits;
