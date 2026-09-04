import { invoke } from "@tauri-apps/api/core";

import type { TranslationKey } from "@/lib/i18n";
import { useAniListNotificationsStore } from "@/store/anilist.store";
import { useNotificationStore } from "@/store/notification.store";
import { useSettingsStore } from "@/store/settings.store";

type Entry = {
  media: {
    id: number;
    title: string;
    next_episode: number | null;
    next_airing_at: number | null;
    status: string;
  };
  list_status: string;
  listName: string;
};
type Translate = (key: TranslationKey, variables?: Record<string, string | number>) => string;

function notifyEpisode(
  title: string,
  episode: number | string,
  key: string,
  t: Translate,
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
      { system }
    );
  return true;
}

function notifyStatus(entry: Entry, previous: { status: string }, t: Translate, system: boolean) {
  if (!useSettingsStore.getState().notifyStatusChanges) return;
  if (entry.list_status === "COMPLETED" && previous.status !== "COMPLETED")
    useNotificationStore
      .getState()
      .add(t("notification.anilist.completed"), "success", entry.media.title, undefined, {
        system,
      });
  if (entry.list_status === "PLANNING" && previous.status !== "PLANNING")
    useNotificationStore
      .getState()
      .add(t("notification.anilist.planned"), "info", entry.media.title, undefined, { system });
}

function buildSignature(entry: Entry): string {
  const m = entry.media;
  return `${m.status}|${m.next_episode ?? ""}|${m.next_airing_at ?? ""}|${entry.list_status}`;
}

function hasMissedEpisode(
  previous: { nextAiringAt: number | null; nextEpisode: number | null },
  now: number,
  media: Entry["media"]
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
  media: Entry["media"],
  previous: { nextEpisode: number | null },
  key: string,
  t: Translate,
  system: boolean
): number {
  let count = 0;
  for (let episode = previous.nextEpisode!; episode < media.next_episode!; episode++) {
    if (notifyEpisode(media.title, episode, `${key}:${episode}`, t, system)) count++;
  }
  return count;
}

function hasAiringNow(
  media: Entry["media"],
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

function processEntry(entry: Entry, now: number, t: Translate, system: boolean) {
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
        notifyEpisode(media.title, media.next_episode ?? "?", `${key}:${media.next_episode}`, t, system)
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
  t: Translate,
  isDisposed: () => boolean,
  options?: { system?: boolean }
): Promise<boolean> {
  try {
    const user = await invoke<{ id: number } | null>("check_anilist_auth");
    if (!user || isDisposed()) return false;
    const lists = await invoke<{ name: string; entries: Entry[] }[]>("get_anilist_lists", {
      userId: user.id,
    });
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
  } catch {
    return false;
  }
}
