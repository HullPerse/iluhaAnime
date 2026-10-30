import type { AniSiteNotification } from "@/types/anilist/anilist";

export function notificationText(item: AniSiteNotification): string {
  if (item.context) return item.context;
  if (item.contexts.length > 0) return item.contexts.join(" ");
  if (item.text) return item.text;
  return "";
}

export function notificationBody(item: AniSiteNotification): string {
  if (item.kind === "airing" && item.anime_title) {
    return `${item.anime_title} - Ep. ${item.episode ?? "?"}`;
  }
  return notificationText(item);
}
