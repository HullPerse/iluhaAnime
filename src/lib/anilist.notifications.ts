import { invoke } from "@tauri-apps/api/core";

import type { TranslationKey } from "@/lib/i18n";
import { useAniListNotificationsStore } from "@/store/anilist.store";
import { useNotificationStore } from "@/store/notification.store";

type Entry = {
  media: {
    id: number;
    title: string;
    next_episode: number | null;
    next_airing_at: number | null;
    status: string;
  };
  list_status: string;
};
type Translate = (
  key: TranslationKey,
  variables?: Record<string, string | number>
) => string;

function notifyEpisode(
  title: string,
  episode: number | string,
  key: string,
  t: Translate
) {
  if (
    useNotificationStore.getState().items.some((item) => item.eventKey === key)
  )
    return false;
  useNotificationStore
    .getState()
    .add(
      t("notification.anilistNewEpisode"),
      "info",
      t("notification.anilistNewEpisodeBody", { episode, title }),
      key
    );
  return true;
}

function notifyStatus(
  entry: Entry,
  previous: { status: string },
  t: Translate
) {
  if (entry.list_status === "COMPLETED" && previous.status !== "COMPLETED")
    useNotificationStore
      .getState()
      .add(t("notification.anilistCompleted"), "success", entry.media.title);
  if (entry.list_status === "PLANNING" && previous.status !== "PLANNING")
    useNotificationStore
      .getState()
      .add(t("notification.anilistPlanned"), "info", entry.media.title);
}

function processEntry(entry: Entry, now: number, t: Translate) {
  const media = entry.media;
  const key = String(media.id);
  const signature = `${media.status}|${media.next_episode ?? ""}|${media.next_airing_at ?? ""}|${entry.list_status}`;
  const store = useAniListNotificationsStore.getState();
  const previous = store.observations[key];
  let notified = 0;
  if (previous) {
    const missed =
      previous.nextAiringAt != null &&
      previous.nextAiringAt <= now &&
      previous.nextEpisode != null &&
      media.next_episode != null &&
      media.next_episode !== previous.nextEpisode;
    if (missed) {
      for (
        let episode = previous.nextEpisode!;
        episode < media.next_episode!;
        episode++
      ) {
        if (notifyEpisode(media.title, episode, `${key}:${episode}`, t))
          notified++;
      }
    }

    const airing =
      media.next_airing_at != null &&
      media.next_airing_at <= now &&
      previous.signature !== signature &&
      media.next_airing_at !== previous.nextAiringAt;
    if (
      airing &&
      notifyEpisode(
        media.title,
        media.next_episode ?? "?",
        `${key}:${media.next_episode}`,
        t
      )
    ) {
      notified++;
    }

    notifyStatus(entry, previous, t);
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
  isDisposed: () => boolean
): Promise<void> {
  try {
    const user = await invoke<{ id: number } | null>("check_anilist_auth");
    if (!user || isDisposed()) return;
    const lists = await invoke<{ entries: Entry[] }[]>("get_anilist_lists", {
      userId: user.id,
    });
    if (isDisposed()) return;
    const stats = lists
      .flatMap((list) => list.entries)
      .map((entry) => processEntry(entry, Math.floor(Date.now() / 1000), t));
    const store = useAniListNotificationsStore.getState();
    if (!store.initialized) store.setInitialized(true);
    if (import.meta.env.DEV)
      console.info(
        `[anilist:release-poll] airing=${stats.filter((item) => item.airing).length} withPrevious=${stats.filter((item) => item.hadPrevious).length} notified=${stats.reduce((sum, item) => sum + item.notified, 0)} initialized=${store.initialized}`
      );
  } catch {}
}
