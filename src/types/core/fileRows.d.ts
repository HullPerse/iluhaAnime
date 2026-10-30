export interface PlayerRowTarget {
  resolvedPath: string | undefined;
  track: boolean;
  busy: boolean;
}

export interface FileRowInteractions {
  interactive: boolean;
  contextMenu: boolean;
  ctrlClick: boolean;
}
