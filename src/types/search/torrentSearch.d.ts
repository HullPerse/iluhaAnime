export type TorrentSort = "name" | "size" | "progress" | "speed" | "custom";

export type TorrentLifecycleFilter =
  | "all"
  | "staging"
  | "live"
  | "paused"
  | "seeding"
  | "completed";
