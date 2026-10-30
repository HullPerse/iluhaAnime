import type {
  FilePriority,
  TorrentDetailFile,
  TorrentDetails,
  TorrentQueueApply,
} from "@/types/torrent";

export interface TorrentItemActions {
  onPause: () => void;
  onResume: () => void;
  onSeedChange: (enabled: boolean) => void;
  onRemove: (deleteFiles: boolean) => void;
  onUpdateFiles: (indices: number[]) => void;
  onFilePriorityChange: (indices: number[], priority: FilePriority) => void;
  onSetSequential: (enabled: boolean) => void;
  onApplyQueue: (payload: TorrentQueueApply) => Promise<boolean>;
  onRecreate: () => void;
  onRedownload: (fileIndex: number) => void;
  onRecheck: () => void;
  onRecheckPaused: () => void;
  onUpdateRequest: (request: { added: TorrentDetailFile[]; details: TorrentDetails }) => void;
}
