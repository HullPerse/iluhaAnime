export interface RemoveTorrentVars {
  id: number;
  deleteFiles: boolean;
  infoHash?: string;
  silent?: boolean;
}
