import type { SpeedLimits, TorrentOrigin, TorrentStore } from "@/types/torrent/torrent";
import type { Cell } from "@/types/core/signal";

export type TorrentData = Omit<TorrentStore, TorrentActionKeys>;

export type TorrentAtoms = { [K in keyof TorrentData]: Cell<TorrentData[K]> };

export interface TorrentSignalStore {
  atoms: TorrentAtoms;
  cancelDownload: () => Promise<void>;
  confirmDownload: (
    selectedIndices: number[],
    saveDir: string,
    subFolder: string | undefined,
    sequential?: boolean
  ) => Promise<void>;
  getTorrentLimits: (
    id: number
  ) => Promise<{ downloadBps: number | null; uploadBps: number | null }>;
  queueTorrentFiles: (filePaths: string[]) => void;
  prepareNextInQueue: () => void;
  prepareTorrentDownload: (
    magnet: string,
    info?: { seeders?: number; origin?: TorrentOrigin }
  ) => Promise<void>;
  prepareTorrentDownloadFromFile: (
    filePath: string,
    info?: { seeders?: number; origin?: TorrentOrigin }
  ) => Promise<void>;
  prepareTorrentDownloadFromBytes: (
    fileBytes: number[],
    info?: { seeders?: number; origin?: TorrentOrigin }
  ) => Promise<void>;
  setSpeedLimits: (limits: SpeedLimits) => Promise<void>;
  setTorrentLimits: (id: number, limits: SpeedLimits, infoHash?: string) => Promise<void>;
}

type TorrentActionKeys =
  | "cancelDownload"
  | "confirmDownload"
  | "getTorrentLimits"
  | "queueTorrentFiles"
  | "prepareNextInQueue"
  | "prepareTorrentDownload"
  | "prepareTorrentDownloadFromFile"
  | "prepareTorrentDownloadFromBytes"
  | "setSpeedLimits"
  | "setTorrentLimits";
