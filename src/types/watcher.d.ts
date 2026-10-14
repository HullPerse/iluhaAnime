export type FolderChangeKind = "created" | "removed" | "modified";

export interface FolderChange {
  path: string;
  root: string;
  kind: FolderChangeKind;
}

export interface FolderContentChanged {
  /** Watched roots that saw at least one change (for whole-root rescanning). */
  roots: string[];
  changes: FolderChange[];
}
