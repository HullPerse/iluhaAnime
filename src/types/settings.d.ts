export type SettingsTab = "general" | "player" | "torrent" | "search" | "theme";

export type FFMPEGStatus = "checking" | "ok" | "missing" | "downloading";

export type ScanType = { current: number; total: number } | null;
