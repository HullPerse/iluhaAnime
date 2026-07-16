export type SettingsTab = "general" | "torrent" | "network" | "search" | "theme" | "anilist";

export type FFMPEGStatus = "checking" | "ok" | "missing" | "downloading";

export type ScanType = { current: number; total: number } | null;
