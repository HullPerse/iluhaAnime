type FatalKind = "render" | "chunk" | "startup" | "global-loop";

export type FatalVariant = "win95" | "xp" | "win7" | "generic" | "yorha" | "terminal" | "retroism";

export interface FatalInfo {
  kind: FatalKind;
  message: string;
  stack?: string;
  scope: string;
  themeName: string;
  route: string;
  timestamp: number;
  retryCount: number;
}

export interface FatalTexts {
  kindLabel: string;
  yorhaBanner: string;
  hint: string;
  details: string;
  copy: string;
  copied: string;
  reload: string;
  safeReload: string;
  retry: string;
  retryUsed: string;
  safeNote: string;
  checkUpdate: string;
  checkingUpdate: string;
  installingUpdate: string;
  updateLatest: string;
  updateFailed: string;
}
