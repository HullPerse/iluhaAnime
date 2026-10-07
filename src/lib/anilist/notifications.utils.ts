import { anilistApi } from "@/api/anilist.api";
import { attempt } from "@/lib/utils/attempt.utils";
import {
  addAnilistRelease,
  anilistNotificationsAtoms,
  saveAnilistObservation,
  setAnilistInitialized,
  setSiteMaxSeenId,
} from "@/store/anilist.store";
import { addNotification, notificationAtoms } from "@/store/notification.store";
import { getSettingsSnapshot, settingsAtoms } from "@/store/settings.store";
import type { AniNotificationEntry, AniSiteNotification } from "@/types/anilist";
import type { TFunc, TranslationKey } from "@/types/i18n";
import type { NotificationType } from "@/types/notification";

function notifyEpisode(
  animeId: number,
  title: string,
  episode: number | string,
  key: string,
  t: TFunc,
  system: boolean
) {
  if (!settingsAtoms.notifyNewEpisodes.get()) return false;
  if (notificationAtoms.items.get().some((item) => item.eventKey === key)) return false;
  addNotification(
      t("notification.anilist.new.episode"),
      "info",
      t("notification.anilist.new.episode.body", { episode, title }),
      key,
      { system, target: { source: "anilist", id: animeId } }
    );
  return true;
}

const LIST_STATUS_TOAST: Record<string, { titleKey: TranslationKey; type: NotificationType }> = {
  CURRENT: { titleKey: "notification.anilist.started", type: "info" },
  COMPLETED: { titleKey: "notification.anilist.completed", type: "success" },
  PAUSED: { titleKey: "notification.anilist.paused", type: "warning" },
  DROPPED: { titleKey: "notification.anilist.dropped", type: "warning" },
  REPEATING: { titleKey: "notification.anilist.repeating", type: "info" },
  PLANNING: { titleKey: "notification.anilist.planned", type: "info" },
};

function notifyStatus(
  entry: AniNotificationEntry,
  previous: { status: string },
  t: TFunc,
  system: boolean
) {
  if (!settingsAtoms.notifyStatusChanges.get()) return;
  if (entry.list_status === previous.status) return;
  const toast = LIST_STATUS_TOAST[entry.list_status];
  if (!toast) return;
  const target = { source: "anilist", id: entry.media.id } as const;
  addNotification(t(toast.titleKey), toast.type, entry.media.title, undefined, {
    system,
    target,
  });
}

const MEDIA_STATUS_TOAST: Record<string, { titleKey: TranslationKey; type: NotificationType }> = {
  FINISHED: { titleKey: "notification.anilist.media.finished", type: "success" },
  CANCELLED: { titleKey: "notification.anilist.media.cancelled", type: "warning" },
  HIATUS: { titleKey: "notification.anilist.media.hiatus", type: "info" },
};

function notifyMediaStatus(
  entry: AniNotificationEntry,
  previous: { mediaStatus: string },
  t: TFunc,
  system: boolean
) {
  if (!settingsAtoms.notifyMediaStatus.get()) return;
  if (!previous.mediaStatus || entry.media.status === previous.mediaStatus) return;
  const toast = MEDIA_STATUS_TOAST[entry.media.status];
  if (!toast) return;
  const target = { source: "anilist", id: entry.media.id } as const;
  addNotification(t(toast.titleKey), toast.type, entry.media.title, undefined, {
    system,
    target,
  });
}

function buildSignature(entry: AniNotificationEntry): string {
  const m = entry.media;
  return `${m.status}|${m.next_episode ?? ""}|${m.next_airing_at ?? ""}|${entry.list_status}`;
}

function hasMissedEpisode(
  previous: { nextAiringAt: number | null; nextEpisode: number | null },
  now: number,
  media: AniNotificationEntry["media"]
): boolean {
  return (
    previous.nextAiringAt != null &&
    previous.nextAiringAt <= now &&
    previous.nextEpisode != null &&
    media.next_episode != null &&
    media.next_episode !== previous.nextEpisode
  );
}

function notifyMissedEpisodes(
  media: AniNotificationEntry["media"],
  previous: { nextEpisode: number | null },
  key: string,
  t: TFunc,
  system: boolean
): number {
  let count = 0;
  const from = previous.nextEpisode;
  const to = media.next_episode;
  if (from == null || to == null) return count;
  for (let episode = from; episode < to; episode++) {
    if (notifyEpisode(media.id, media.title, episode, `${key}:${episode}`, t, system)) {
      count++;
      addAnilistRelease({ mediaId: media.id, title: media.title, episode, airedAt: Date.now() });
    }
  }
  return count;
}

function hasAiringNow(
  media: AniNotificationEntry["media"],
  previous: { signature: string; nextAiringAt: number | null },
  signature: string,
  now: number
): boolean {
  return (
    media.next_airing_at != null &&
    media.next_airing_at <= now &&
    previous.signature !== signature &&
    media.next_airing_at !== previous.nextAiringAt
  );
}

function processEntry(entry: AniNotificationEntry, now: number, t: TFunc, system: boolean) {
  const media = entry.media;
  const key = String(media.id);
  const signature = buildSignature(entry);
  const previous = anilistNotificationsAtoms.observations.get()[key];
  let notified = 0;
  if (previous) {
    if (hasMissedEpisode(previous, now, media)) {
      notified += notifyMissedEpisodes(media, previous, key, t, system);
    }
    if (hasAiringNow(media, previous, signature, now)) {
      if (
        notifyEpisode(
          media.id,
          media.title,
          media.next_episode ?? "?",
          `${key}:${media.next_episode}`,
          t,
          system
        )
      ) {
        notified++;
        addAnilistRelease({
          mediaId: media.id,
          title: media.title,
          episode: media.next_episode ?? "?",
          airedAt: Date.now(),
        });
      }
    }
    notifyStatus(entry, previous, t, system);
    notifyMediaStatus(entry, previous, t, system);
  }
  saveAnilistObservation(key, {
    signature,
    status: entry.list_status,
    mediaStatus: media.status,
    title: media.title,
    updatedAt: Date.now(),
    nextEpisode: media.next_episode,
    nextAiringAt: media.next_airing_at,
  });
  return {
    hadPrevious: Boolean(previous),
    airing: media.next_airing_at != null,
    notified,
  };
}

export async function pollAniListReleases(
  t: TFunc,
  isDisposed: () => boolean,
  options?: { system?: boolean }
): Promise<boolean> {
  const [polled, error] = await attempt(pollAniListReleasesOnce(t, isDisposed, options));
  return error === null && polled;
}

function siteToastBody(item: AniSiteNotification): string {
  if (item.text) return item.text;
  if (item.context) return item.context;
  if (item.contexts.length > 0) return item.contexts.join(" ");
  return item.anime_title ?? "";
}

function notifySiteItem(
  key: string,
  title: string,
  body: string,
  type: NotificationType,
  system: boolean,
  animeId: number | null
): void {
  if (notificationAtoms.items.get().some((item) => item.eventKey === key)) return;
  addNotification(title, type, body || undefined, key, {
    system,
    ...(animeId != null ? { target: { source: "anilist", id: animeId } as const } : {}),
  });
}

function maxSiteId(items: AniSiteNotification[]): number {
  return items.reduce((max, item) => Math.max(max, item.id), 0);
}

interface SiteToggles {
  replies: boolean;
  merge: boolean;
  sequel: boolean;
}

function processSiteItem(
  item: AniSiteNotification,
  maxSeen: number,
  toggles: SiteToggles,
  t: TFunc,
  system: boolean
): void {
  if (item.id <= maxSeen) return;
  const key = `site:${item.id}`;
  if (item.kind === "subscribed" && toggles.replies) {
    notifySiteItem(
      key,
      t("notification.anilist.subscribed.reply"),
      siteToastBody(item),
      "info",
      system,
      null
    );
    return;
  }
  if (item.kind === "sequel" && toggles.sequel) {
    notifySiteItem(
      key,
      t("notification.anilist.sequel"),
      item.anime_title ?? siteToastBody(item),
      "info",
      system,
      item.anime_id
    );
    return;
  }
  if ((item.kind === "merged" || item.kind === "deleted") && toggles.merge) {
    notifySiteItem(
      key,
      t("notification.anilist.merged"),
      item.anime_title ?? siteToastBody(item),
      "warning",
      false,
      item.anime_id
    );
  }
}

export async function pollSiteNotifications(
  t: TFunc,
  isDisposed: () => boolean,
  options?: { system?: boolean }
): Promise<boolean> {
  const settings = getSettingsSnapshot();
  const toggles: SiteToggles = {
    replies: settings.notifySubscribedReplies,
    merge: settings.notifyMediaMerge,
    sequel: settings.notifySequel,
  };
  if (!toggles.replies && !toggles.merge && !toggles.sequel) return true;
  const [items, error] = await attempt(anilistApi.getSiteNotifications());
  if (error !== null || isDisposed()) return error === null;
  const system = options?.system ?? true;
  const maxSeen = anilistNotificationsAtoms.siteMaxSeenId.get();
  if (maxSeen === 0) {
    if (items.length > 0) setSiteMaxSeenId(maxSiteId(items));
    return true;
  }
  for (const item of items) processSiteItem(item, maxSeen, toggles, t, system);
  if (items.length > 0) setSiteMaxSeenId(maxSiteId(items));
  return true;
}

async function pollAniListReleasesOnce(
  t: TFunc,
  isDisposed: () => boolean,
  options?: { system?: boolean }
): Promise<boolean> {
  const user = await anilistApi.checkAuth();
  if (!user || isDisposed()) return false;
  const lists = await anilistApi.getLists(user.id, true);
  if (isDisposed()) return false;
  const system = options?.system ?? true;
  const scope = settingsAtoms.anilistNotifyLists.get();
  const stats = lists
    .flatMap((list) =>
      !scope?.length || scope.includes(list.name)
        ? list.entries.map((entry) => ({ ...entry, listName: list.name }))
        : []
    )
    .map((entry) => processEntry(entry, Math.floor(Date.now() / 1000), t, system));
  if (!anilistNotificationsAtoms.initialized.get()) setAnilistInitialized(true);
  if (import.meta.env.DEV)
    console.warn(
      `[anilist:release-poll] airing=${stats.filter((item) => item.airing).length} withPrevious=${stats.filter((item) => item.hadPrevious).length} notified=${stats.reduce((sum, item) => sum + item.notified, 0)} initialized=${anilistNotificationsAtoms.initialized.get()}`
    );
  return true;
}
