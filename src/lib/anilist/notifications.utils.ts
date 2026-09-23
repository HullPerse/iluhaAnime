import { anilistApi } from "@/api/anilist.api";
import { attempt } from "@/lib/utils/attempt.utils";
import { useAniListNotificationsStore } from "@/store/anilist.store";
import { useNotificationStore } from "@/store/notification.store";
import { useSettingsStore } from "@/store/settings.store";
import type { AniNotificationEntry } from "@/types/anilist";
import type { TFunc } from "@/types/i18n";

function notifyEpisode(
  animeId: number,
  title: string,
  episode: number | string,
  key: string,
  t: TFunc,
  system: boolean
) {
  if (!useSettingsStore.getState().notifyNewEpisodes) return false;
  if (useNotificationStore.getState().items.some((item) => item.eventKey === key)) return false;
  useNotificationStore
    .getState()
    .add(
      t("notification.anilist.new.episode"),
      "info",
      t("notification.anilist.new.episode.body", { episode, title }),
      key,
      { system, target: { source: "anilist", id: animeId } }
    );
  return true;
}

function notifyStatus(
  entry: AniNotificationEntry,
  previous: { status: string },
  t: TFunc,
  system: boolean
) {
  const target = { source: "anilist", id: entry.media.id } as const;
  if (!useSettingsStore.getState().notifyStatusChanges) return;
  if (entry.list_status === "COMPLETED" && previous.status !== "COMPLETED")
    useNotificationStore
      .getState()
      .add(t("notification.anilist.completed"), "success", entry.media.title, undefined, {
        system,
        target,
      });
  if (entry.list_status === "PLANNING" && previous.status !== "PLANNING")
    useNotificationStore
      .getState()
      .add(t("notification.anilist.planned"), "info", entry.media.title, undefined, {
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
    if (notifyEpisode(media.id, media.title, episode, `${key}:${episode}`, t, system)) count++;
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
  const store = useAniListNotificationsStore.getState();
  const previous = store.observations[key];
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
      )
        notified++;
    }
    notifyStatus(entry, previous, t, system);
  }
  store.saveObservation(key, {
    signature,
    status: entry.list_status,
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

async function pollAniListReleasesOnce(
  t: TFunc,
  isDisposed: () => boolean,
  options?: { system?: boolean }
): Promise<boolean> {
  const user = await anilistApi.checkAuth();
  if (!user || isDisposed()) return false;
  const lists = await anilistApi.getLists(user.id);
  if (isDisposed()) return false;
  const system = options?.system ?? true;
  const scope = useSettingsStore.getState().anilistNotifyLists;
  const stats = lists
    .flatMap((list) =>
      !scope?.length || scope.includes(list.name)
        ? list.entries.map((entry) => ({ ...entry, listName: list.name }))
        : []
    )
    .map((entry) => processEntry(entry, Math.floor(Date.now() / 1000), t, system));
  const store = useAniListNotificationsStore.getState();
  if (!store.initialized) store.setInitialized(true);
  if (import.meta.env.DEV)
    console.warn(
      `[anilist:release-poll] airing=${stats.filter((item) => item.airing).length} withPrevious=${stats.filter((item) => item.hadPrevious).length} notified=${stats.reduce((sum, item) => sum + item.notified, 0)} initialized=${store.initialized}`
    );
  return true;
}
