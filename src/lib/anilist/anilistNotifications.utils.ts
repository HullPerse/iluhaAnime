import { anilistApi } from "@/api/anilist.api";
import { attempt } from "@hullperse/hp_utils/attempt";
import {
  addAnilistRelease,
  anilistNotificationsAtoms,
  saveAnilistObservation,
  setAnilistInitialized,
  setAnilistReleaseCovers,
  setSiteMaxSeenId,
} from "@/store/anilist.store";
import { addNotification, notificationAtoms } from "@/store/notification.store";
import { getSettingsSnapshot, settingsAtoms } from "@/store/settings.store";
import type { AniNotificationEntry, AniSiteNotification } from "@/types/anilist/anilist";
import type { TFunc, TranslationKey } from "@/types/core/i18n";
import type { NotificationType } from "@/types/core/notification";
import type { AniListId } from "@/types/core/types";

export interface AniListPollResult {
  ok: boolean;
  added: number;
}

interface AniListPollOptions {
  system?: boolean;
  silent?: boolean;
}

function notifyEpisode(
  animeId: number,
  title: string,
  episode: number | string,
  key: string,
  t: TFunc,
  system: boolean,
  silent: boolean
): boolean {
  if (!settingsAtoms.notifyNewEpisodes.get()) return false;
  if (notificationAtoms.items.get().some((item) => item.eventKey === key)) return false;
  const id = addNotification(
    t("notification.anilist.new.episode"),
    "info",
    t("notification.anilist.new.episode.body", { episode, title }),
    key,
    { system, silent, target: { source: "anilist", id: animeId as AniListId } }
  );
  return id > 0;
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
  system: boolean,
  silent: boolean
): boolean {
  if (!settingsAtoms.notifyStatusChanges.get()) return false;
  if (entry.list_status === previous.status) return false;
  const toast = LIST_STATUS_TOAST[entry.list_status];
  if (!toast) return false;
  const target = { source: "anilist", id: entry.media.id as AniListId } as const;
  const id = addNotification(t(toast.titleKey), toast.type, entry.media.title, undefined, {
    system,
    silent,
    target,
  });
  return id > 0;
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
  system: boolean,
  silent: boolean
): boolean {
  if (!settingsAtoms.notifyMediaStatus.get()) return false;
  if (!previous.mediaStatus || entry.media.status === previous.mediaStatus) return false;
  const toast = MEDIA_STATUS_TOAST[entry.media.status];
  if (!toast) return false;
  const target = { source: "anilist", id: entry.media.id as AniListId } as const;
  const id = addNotification(t(toast.titleKey), toast.type, entry.media.title, undefined, {
    system,
    silent,
    target,
  });
  return id > 0;
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
  system: boolean,
  silent: boolean
): number {
  let count = 0;
  const from = previous.nextEpisode;
  const to = media.next_episode;
  if (from == null || to == null) return count;
  for (let episode = from; episode < to; episode++) {
    if (notifyEpisode(media.id, media.title, episode, `${key}:${episode}`, t, system, silent)) {
      count++;
      addAnilistRelease({
        mediaId: media.id,
        title: media.title,
        episode,
        airedAt: Date.now(),
        coverUrl: media.cover_url ?? null,
      });
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

function processEntry(
  entry: AniNotificationEntry,
  now: number,
  t: TFunc,
  system: boolean,
  silent: boolean
) {
  const media = entry.media;
  const key = String(media.id);
  const signature = buildSignature(entry);
  const previous = anilistNotificationsAtoms.observations.get()[key];
  let notified = 0;
  let added = 0;
  if (previous) {
    if (hasMissedEpisode(previous, now, media)) {
      const missed = notifyMissedEpisodes(media, previous, key, t, system, silent);
      notified += missed;
      added += missed;
    }
    if (hasAiringNow(media, previous, signature, now)) {
      if (
        notifyEpisode(
          media.id,
          media.title,
          media.next_episode ?? "?",
          `${key}:${media.next_episode}`,
          t,
          system,
          silent
        )
      ) {
        notified++;
        added++;
        addAnilistRelease({
          mediaId: media.id,
          title: media.title,
          episode: media.next_episode ?? "?",
          airedAt: Date.now(),
          coverUrl: media.cover_url ?? null,
        });
      }
    }
    if (notifyStatus(entry, previous, t, system, silent)) added++;
    if (notifyMediaStatus(entry, previous, t, system, silent)) added++;
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
    added,
  };
}

export async function pollAniListReleases(
  t: TFunc,
  isDisposed: () => boolean,
  options?: AniListPollOptions
): Promise<AniListPollResult> {
  const [result, error] = await attempt(pollAniListReleasesOnce(t, isDisposed, options));
  if (error !== null || !result) return { ok: false, added: 0 };
  return result;
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
  silent: boolean,
  animeId: number | null
): boolean {
  if (notificationAtoms.items.get().some((item) => item.eventKey === key)) return false;
  const id = addNotification(title, type, body || undefined, key, {
    system,
    silent,
    ...(animeId != null
      ? { target: { source: "anilist", id: animeId as AniListId } as const }
      : {}),
  });
  return id > 0;
}

function maxSiteId(items: AniSiteNotification[]): number {
  return items.reduce((max, item) => Math.max(max, item.id), 0);
}

let summarySequence = 0;

/// One popup for a poll that produced several AniList notifications. The
/// individual items already went into the panel with `silent`, so this item is
/// popup-only: it is not persisted and never appears in the panel itself.
export function notifyAniListSummary(count: number, t: TFunc, system: boolean): void {
  if (count <= 0) return;
  summarySequence += 1;
  addNotification(
    t("notification.anilist.summary", { count }),
    "info",
    undefined,
    `anilist-summary:${Date.now()}:${summarySequence}`,
    { system, popupOnly: true }
  );
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
  system: boolean,
  silent: boolean
): boolean {
  if (item.id <= maxSeen) return false;
  const key = `site:${item.id}`;
  if (item.kind === "subscribed" && toggles.replies) {
    return notifySiteItem(
      key,
      t("notification.anilist.subscribed.reply"),
      siteToastBody(item),
      "info",
      system,
      silent,
      null
    );
  }
  if (item.kind === "sequel" && toggles.sequel) {
    return notifySiteItem(
      key,
      t("notification.anilist.sequel"),
      item.anime_title ?? siteToastBody(item),
      "info",
      system,
      silent,
      item.anime_id
    );
  }
  if ((item.kind === "merged" || item.kind === "deleted") && toggles.merge) {
    return notifySiteItem(
      key,
      t("notification.anilist.merged"),
      item.anime_title ?? siteToastBody(item),
      "warning",
      false,
      silent,
      item.anime_id
    );
  }
  return false;
}

export async function pollSiteNotifications(
  t: TFunc,
  isDisposed: () => boolean,
  options?: AniListPollOptions
): Promise<AniListPollResult> {
  const settings = getSettingsSnapshot();
  const toggles: SiteToggles = {
    replies: settings.notifySubscribedReplies,
    merge: settings.notifyMediaMerge,
    sequel: settings.notifySequel,
  };
  if (!toggles.replies && !toggles.merge && !toggles.sequel) return { ok: true, added: 0 };
  const [items, error] = await attempt(anilistApi.getSiteNotifications());
  if (error !== null || isDisposed()) return { ok: error === null, added: 0 };
  const system = options?.system ?? true;
  const silent = options?.silent ?? false;
  const maxSeen = anilistNotificationsAtoms.siteMaxSeenId.get();
  if (maxSeen === 0) {
    if (items.length > 0) setSiteMaxSeenId(maxSiteId(items));
    return { ok: true, added: 0 };
  }
  let added = 0;
  for (const item of items) {
    if (processSiteItem(item, maxSeen, toggles, t, system, silent)) added++;
  }
  if (items.length > 0) setSiteMaxSeenId(maxSiteId(items));
  return { ok: true, added };
}

async function pollAniListReleasesOnce(
  t: TFunc,
  isDisposed: () => boolean,
  options?: AniListPollOptions
): Promise<AniListPollResult> {
  const user = await anilistApi.checkAuth();
  if (!user || isDisposed()) return { ok: false, added: 0 };
  const lists = await anilistApi.getLists(user.id, true);
  if (isDisposed()) return { ok: false, added: 0 };
  const system = options?.system ?? true;
  const silent = options?.silent ?? false;
  const scope = settingsAtoms.anilistNotifyLists.get();
  const covers: Record<number, string | null> = {};
  for (const list of lists) {
    if (scope?.length && !scope.includes(list.name)) continue;
    for (const entry of list.entries) {
      if (entry.media.cover_url) covers[entry.media.id] = entry.media.cover_url;
    }
  }
  setAnilistReleaseCovers(covers);
  const stats = lists
    .flatMap((list) =>
      !scope?.length || scope.includes(list.name)
        ? list.entries.map((entry) => ({ ...entry, listName: list.name }))
        : []
    )
    .map((entry) => processEntry(entry, Math.floor(Date.now() / 1000), t, system, silent));
  if (!anilistNotificationsAtoms.initialized.get()) setAnilistInitialized(true);
  if (import.meta.env.DEV)
    console.warn(
      `[anilist:release-poll] airing=${stats.filter((item) => item.airing).length} withPrevious=${stats.filter((item) => item.hadPrevious).length} notified=${stats.reduce((sum, item) => sum + item.notified, 0)} initialized=${anilistNotificationsAtoms.initialized.get()}`
    );
  return { ok: true, added: stats.reduce((sum, item) => sum + item.added, 0) };
}
