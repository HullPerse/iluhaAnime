import type { AnilistSearchParams } from "@/api/anilist.api";

export type AniListSearchRequest =
  | { kind: "global"; params: AnilistSearchParams }
  | { kind: "season"; season: string; seasonYear: number | null }
  | { kind: "studio"; studioId: number }
  | { kind: "tag"; tag: string }
  | { kind: "genre"; genre: string };
