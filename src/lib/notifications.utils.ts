import { invoke } from "@tauri-apps/api/core";
import { useNotificationStore } from "@/store/notification.store";

const STORAGE_KEY = "animeEpisodeTracker";
const INITIAL_SCAN_KEY = "animeNotifyInitialScanDone";

export type AnimeNotifyMode = "none" | "inapp" | "system_when_open";

function loadTracker(): Record<number, number> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveTracker(t: Record<number, number>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
}

function getInitialScanDone(): boolean {
  try {
    return localStorage.getItem(INITIAL_SCAN_KEY) === "true";
  } catch {
    return false;
  }
}

function setInitialScanDone(v: boolean) {
  localStorage.setItem(INITIAL_SCAN_KEY, String(v));
}

function notifyEpisode(
  title: string,
  episode: number,
  mode: AnimeNotifyMode,
  airedDuringSession: boolean,
) {
  const store = useNotificationStore.getState();
  const body = `${title} - эпизод ${episode}`;
  if (mode === "inapp" || !airedDuringSession) {
    store.addInApp("Новый эпизод!", "info", body);
  } else {
    store.add("Новый эпизод!", "info", body);
  }
}

function notifyCompleted(
  title: string,
  episodes: number | null,
  mode: AnimeNotifyMode,
  airedDuringSession: boolean,
) {
  const store = useNotificationStore.getState();
  const body = episodes != null
    ? `${title} сменил статус на ЗАВЕРШЕНО (${episodes})`
    : `${title} сменил статус на ЗАВЕРШЕНО`;
  if (mode === "inapp" || !airedDuringSession) {
    store.addInApp("Статус изменён", "info", body);
  } else {
    store.add("Статус изменён", "info", body);
  }
}

export async function checkNewEpisodes(
  sessionStart: number,
  mode: AnimeNotifyMode,
) {
  const user = await invoke<{ id: number } | null>("check_anilist_auth").catch(
    () => null,
  );
  if (!user) return;

  const lists = await invoke<any[]>("get_anilist_lists", {
    userId: user.id,
  }).catch(() => []);
  if (!lists.length) return;

  const tracker = loadTracker();
  const now = Math.floor(Date.now() / 1000);
  const newTracker = { ...tracker };
  const initialScanDone = getInitialScanDone();

  for (const list of lists) {
    for (const entry of list.entries ?? []) {
      if (entry.list_status !== "CURRENT") continue;

      const media = entry.media;
      if (!media?.next_airing_at || !media?.next_episode) continue;

      const nextEp = media.next_episode;
      const airingAt = media.next_airing_at;
      const lastSeen = newTracker[media.id];
      const isLastEpisode = media.episodes != null && nextEp === media.episodes;
      const airedDuringSession = airingAt * 1000 >= sessionStart;

      if (lastSeen === undefined) {
        if (airingAt <= now) {
          if (initialScanDone) {
            notifyEpisode(media.title, nextEp, mode, airedDuringSession);
            if (isLastEpisode) {
              notifyCompleted(media.title, media.episodes, mode, airedDuringSession);
            }
          }
          newTracker[media.id] = nextEp + 1;
        } else {
          newTracker[media.id] = nextEp;
        }
      } else {
        if (nextEp > lastSeen) {
          for (let ep = lastSeen; ep < nextEp; ep++) {
            notifyEpisode(media.title, ep, mode, false);
          }
          if (isLastEpisode && nextEp === media.episodes) {
            notifyCompleted(media.title, media.episodes, mode, false);
          }
          newTracker[media.id] = nextEp;
        } else if (nextEp === lastSeen && airingAt <= now) {
          notifyEpisode(media.title, nextEp, mode, airedDuringSession);
          if (isLastEpisode) {
            notifyCompleted(media.title, media.episodes, mode, airedDuringSession);
          }
          newTracker[media.id] = nextEp + 1;
        }
      }
    }
  }

  saveTracker(newTracker);
  if (!initialScanDone) {
    setInitialScanDone(true);
  }
}
