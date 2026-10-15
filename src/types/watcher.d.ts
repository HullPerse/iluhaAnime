export type FolderChangeKind = "created" | "removed" | "modified";

export interface FolderChange {
  path: string;
  root: string;
  kind: FolderChangeKind;
}

export interface FolderContentChanged {
  roots: string[];
  changes: FolderChange[];
}
