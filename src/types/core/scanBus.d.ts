import type { VideoFileEntry } from "@/types/core/fs";

export interface FullScanRequest {
  root: string;
  extensions: string[];
  threads: number;
}

export interface PatchScanRequest extends FullScanRequest {
  upserts: string[];
  removals: string[];
}

export type PatchScanOutcome =
  | { kind: "full"; entries: VideoFileEntry[] }
  | { kind: "patch"; fresh: VideoFileEntry[]; removed: string[] };

export interface ScanExecutors {
  walk: (roots: string[], extensions: string[], threads: number) => Promise<VideoFileEntry[]>;
  patch: (
    upserts: string[],
    removals: string[],
    extensions: string[],
    threads: number
  ) => Promise<VideoFileEntry[]>;
}

export interface ScanBus {
  fullScan: (request: FullScanRequest) => Promise<VideoFileEntry[]>;
  patchScan: (request: PatchScanRequest) => Promise<PatchScanOutcome>;
  flush: () => void;
  cancel: () => void;
}

export interface ScanBusOptions extends Partial<ScanExecutors> {
  waitMs?: number;
  maxWaitMs?: number;
}
