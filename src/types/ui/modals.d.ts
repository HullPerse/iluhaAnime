export type AnilistActivityTab = "feed" | "calendar" | "notifications" | "mentions" | "airing";

export type AnilistModalName =
  | "auth"
  | "recs"
  | "favourites"
  | "browse"
  | "stats"
  | "prefetch"
  | "spotlight"
  | "friends"
  | "filters";

export interface AnilistModalViews extends Record<AnilistModalName, boolean> {
  activity: { open: boolean; tab: AnilistActivityTab };
}
