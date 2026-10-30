import { mockConvertFileSrc, mockInvoke } from "@/tests/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  pollAniListReleases,
  pollSiteNotifications,
} from "@/lib/anilist/anilistNotifications.utils";
import {
  anilistNotificationsAtoms,
  createAnilistNotificationsSignalStore,
  markOwnAnilistListStatus,
  migrateNotificationsData,
  saveAnilistObservation,
} from "@/store/anilist.store";
import { notificationAtoms } from "@/store/notification.store";
import { patchSettings } from "@/store/settings.store";
import type { AniNotificationEntry, AniSiteNotification } from "@/types/anilist/anilist";
import type { TFunc } from "@/types/core/i18n";

const checkAuth = vi.fn();
const getLists = vi.fn();
const getSiteNotifications = vi.fn();

vi.mock("@/api/anilist.api", () => ({
  anilistApi: {
    checkAuth: (...args: unknown[]) => checkAuth(...args),
    getLists: (...args: unknown[]) => getLists(...args),
    getSiteNotifications: (...args: unknown[]) => getSiteNotifications(...args),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
  convertFileSrc: mockConvertFileSrc,
}));

const t = ((key: string, variables?: Record<string, string | number>) =>
  variables == null ? key : `${key} ${JSON.stringify(variables)}`) as TFunc;
const notDisposed = () => false;

function listEntry(overrides?: Partial<AniNotificationEntry>): AniNotificationEntry {
  return {
    media: { id: 7, title: "Show", next_episode: null, next_airing_at: null, status: "RELEASING" },
    list_status: "CURRENT",
    listName: "Watching",
    ...overrides,
  };
}

function observation(overrides?: Record<string, unknown>) {
  return {
    signature: "sig",
    status: "CURRENT",
    mediaStatus: "RELEASING",
    title: "Show",
    updatedAt: 1,
    nextEpisode: null,
    nextAiringAt: null,
    ...overrides,
  };
}

function siteItem(overrides?: Partial<AniSiteNotification>): AniSiteNotification {
  return {
    id: 1,
    kind: "airing",
    created_at: 1,
    context: null,
    contexts: [],
    user_id: null,
    user_name: null,
    user_avatar: null,
    anime_id: null,
    anime_title: null,
    anime_cover: null,
    episode: null,
    activity_id: null,
    text: null,
    ...overrides,
  };
}

const NOW_SEC = 2_000_000;
const NOW_MS = NOW_SEC * 1000;
const PAST_SEC = NOW_SEC - 1000;
const FUTURE_SEC = NOW_SEC + 1000;

function mockNow(): void {
  vi.spyOn(Date, "now").mockReturnValue(NOW_MS);
}

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, String(value));
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
}

function airingEntry(
  nextEpisode: number | null,
  nextAiringAt: number | null
): AniNotificationEntry {
  return listEntry({
    media: {
      id: 7,
      title: "Show",
      next_episode: nextEpisode,
      next_airing_at: nextAiringAt,
      status: "RELEASING",
    },
  });
}

beforeEach(() => {
  checkAuth.mockReset();
  getLists.mockReset();
  getSiteNotifications.mockReset();
  checkAuth.mockResolvedValue({ id: 1 });
  anilistNotificationsAtoms.initialized.set(false);
  anilistNotificationsAtoms.observations.set({});
  anilistNotificationsAtoms.releases.set([]);
  anilistNotificationsAtoms.readNotificationIds.set([]);
  anilistNotificationsAtoms.knownListNames.set([]);
  anilistNotificationsAtoms.siteMaxSeenId.set(0);
  notificationAtoms.items.set([]);
  notificationAtoms.unreadCount.set(0);
  notificationAtoms.dismissed.set([]);
  patchSettings({
    anilistNotifyLists: null,
    notifyNewEpisodes: true,
    notifyStatusChanges: true,
    notifyMediaStatus: true,
    notifySubscribedReplies: true,
    notifyMediaMerge: true,
    notifySequel: true,
  });
});

afterEach(() => {
  const now = Date.now as unknown as { mockRestore?: () => void };
  now.mockRestore?.();
});

describe("list status matrix", () => {
  const cases: Array<[string, string]> = [
    ["CURRENT", "notification.anilist.started"],
    ["COMPLETED", "notification.anilist.completed"],
    ["PAUSED", "notification.anilist.paused"],
    ["DROPPED", "notification.anilist.dropped"],
    ["REPEATING", "notification.anilist.repeating"],
    ["PLANNING", "notification.anilist.planned"],
  ];
  for (const [status, title] of cases) {
    it(`toasts on transition to ${status}`, async () => {
      saveAnilistObservation(
        "7",
        observation({ status: status === "CURRENT" ? "PLANNING" : "CURRENT" })
      );
      getLists.mockResolvedValue([
        { name: "Watching", entries: [listEntry({ list_status: status })] },
      ]);
      await pollAniListReleases(t, notDisposed, { system: false });
      const items = notificationAtoms.items.get();
      expect(items.map((item) => item.title)).toContain(title);
    });
  }

  it("stays quiet without a transition", async () => {
    saveAnilistObservation("7", observation());
    getLists.mockResolvedValue([{ name: "Watching", entries: [listEntry()] }]);
    await pollAniListReleases(t, notDisposed, { system: false });
    expect(notificationAtoms.items.get()).toHaveLength(0);
  });

  it("stays quiet when the toggle is off", async () => {
    patchSettings({ notifyStatusChanges: false });
    saveAnilistObservation("7", observation());
    getLists.mockResolvedValue([
      { name: "Watching", entries: [listEntry({ list_status: "DROPPED" })] },
    ]);
    await pollAniListReleases(t, notDisposed, { system: false });
    expect(notificationAtoms.items.get()).toHaveLength(0);
  });

  it("suppresses transitions made in this app", async () => {
    saveAnilistObservation("7", observation());
    markOwnAnilistListStatus(7, "COMPLETED");
    getLists.mockResolvedValue([
      { name: "Completed", entries: [listEntry({ list_status: "COMPLETED" })] },
    ]);
    await pollAniListReleases(t, notDisposed, { system: false });
    expect(notificationAtoms.items.get()).toHaveLength(0);
  });
});

describe("media status", () => {
  it("toasts once on transition to FINISHED", async () => {
    saveAnilistObservation("7", observation());
    const finished = listEntry({
      media: { id: 7, title: "Show", next_episode: null, next_airing_at: null, status: "FINISHED" },
    });
    getLists.mockResolvedValue([{ name: "Watching", entries: [finished] }]);
    await pollAniListReleases(t, notDisposed, { system: false });
    expect(notificationAtoms.items.get().map((item) => item.title)).toContain(
      "notification.anilist.media.finished"
    );
    notificationAtoms.items.set([]);
    notificationAtoms.unreadCount.set(0);
    notificationAtoms.dismissed.set([]);
    await pollAniListReleases(t, notDisposed, { system: false });
    expect(notificationAtoms.items.get()).toHaveLength(0);
  });

  it("ignores a never-observed media status", async () => {
    saveAnilistObservation("7", observation({ mediaStatus: "" }));
    getLists.mockResolvedValue([
      {
        name: "Watching",
        entries: [
          listEntry({
            media: {
              id: 7,
              title: "Show",
              next_episode: null,
              next_airing_at: null,
              status: "FINISHED",
            },
          }),
        ],
      },
    ]);
    await pollAniListReleases(t, notDisposed, { system: false });
    expect(notificationAtoms.items.get()).toHaveLength(0);
  });
});

describe("new episode notifications", () => {
  it("notifies a single episode that aired between polls", async () => {
    mockNow();
    saveAnilistObservation("7", observation({ nextEpisode: 4, nextAiringAt: PAST_SEC }));
    getLists.mockResolvedValue([{ name: "Watching", entries: [airingEntry(5, FUTURE_SEC)] }]);
    const ok = await pollAniListReleases(t, notDisposed, { system: false });
    expect(ok).toBe(true);
    const items = notificationAtoms.items.get();
    expect(items).toHaveLength(1);
    expect(items[0]?.eventKey).toBe("7:4");
    expect(items[0]?.title).toBe("notification.anilist.new.episode");
    const releases = anilistNotificationsAtoms.releases.get();
    expect(releases).toHaveLength(1);
    expect(releases[0]?.mediaId).toBe(7);
    expect(releases[0]?.episode).toBe(4);
    expect(anilistNotificationsAtoms.observations.get()["7"]?.nextEpisode).toBe(5);
  });

  it("notifies every missed episode in order", async () => {
    mockNow();
    saveAnilistObservation("7", observation({ nextEpisode: 4, nextAiringAt: PAST_SEC }));
    getLists.mockResolvedValue([{ name: "Watching", entries: [airingEntry(7, FUTURE_SEC)] }]);
    await pollAniListReleases(t, notDisposed, { system: false });
    const keys = notificationAtoms.items
      .get()
      .map((item) => item.eventKey)
      .sort();
    expect(keys).toEqual(["7:4", "7:5", "7:6"]);
    const episodes = anilistNotificationsAtoms.releases
      .get()
      .map((release) => release.episode)
      .sort();
    expect(episodes).toEqual([4, 5, 6]);
  });

  it("notifies the current episode while its airing time passes", async () => {
    mockNow();
    saveAnilistObservation("7", observation({ nextEpisode: 5, nextAiringAt: FUTURE_SEC }));
    getLists.mockResolvedValue([{ name: "Watching", entries: [airingEntry(5, PAST_SEC)] }]);
    await pollAniListReleases(t, notDisposed, { system: false });
    const items = notificationAtoms.items.get();
    expect(items).toHaveLength(1);
    expect(items[0]?.eventKey).toBe("7:5");
    expect(anilistNotificationsAtoms.releases.get()[0]?.episode).toBe(5);
  });

  it("stays silent when the previous airing time is still in the future", async () => {
    mockNow();
    saveAnilistObservation("7", observation({ nextEpisode: 4, nextAiringAt: FUTURE_SEC }));
    getLists.mockResolvedValue([
      { name: "Watching", entries: [airingEntry(5, FUTURE_SEC + 5000)] },
    ]);
    await pollAniListReleases(t, notDisposed, { system: false });
    expect(notificationAtoms.items.get()).toHaveLength(0);
    expect(anilistNotificationsAtoms.releases.get()).toHaveLength(0);
  });

  it("stays silent on the first observation", async () => {
    mockNow();
    getLists.mockResolvedValue([{ name: "Watching", entries: [airingEntry(5, PAST_SEC)] }]);
    await pollAniListReleases(t, notDisposed, { system: false });
    expect(notificationAtoms.items.get()).toHaveLength(0);
    expect(anilistNotificationsAtoms.releases.get()).toHaveLength(0);
    expect(anilistNotificationsAtoms.observations.get()["7"]?.nextEpisode).toBe(5);
  });

  it("stays silent when episode notifications are off", async () => {
    mockNow();
    patchSettings({ notifyNewEpisodes: false });
    saveAnilistObservation("7", observation({ nextEpisode: 4, nextAiringAt: PAST_SEC }));
    getLists.mockResolvedValue([{ name: "Watching", entries: [airingEntry(5, FUTURE_SEC)] }]);
    await pollAniListReleases(t, notDisposed, { system: false });
    expect(notificationAtoms.items.get()).toHaveLength(0);
    expect(anilistNotificationsAtoms.releases.get()).toHaveLength(0);
  });

  it("does not notify twice across repeated polls", async () => {
    mockNow();
    saveAnilistObservation("7", observation({ nextEpisode: 4, nextAiringAt: PAST_SEC }));
    getLists.mockResolvedValue([{ name: "Watching", entries: [airingEntry(5, FUTURE_SEC)] }]);
    await pollAniListReleases(t, notDisposed, { system: false });
    await pollAniListReleases(t, notDisposed, { system: false });
    expect(notificationAtoms.items.get()).toHaveLength(1);
    expect(anilistNotificationsAtoms.releases.get()).toHaveLength(1);
  });

  it("skips an episode already recorded in the tray", async () => {
    mockNow();
    notificationAtoms.items.set([
      { id: 1, type: "info", title: "seed", eventKey: "7:4", timestamp: NOW_MS, read: true },
    ]);
    saveAnilistObservation("7", observation({ nextEpisode: 4, nextAiringAt: PAST_SEC }));
    getLists.mockResolvedValue([{ name: "Watching", entries: [airingEntry(5, FUTURE_SEC)] }]);
    await pollAniListReleases(t, notDisposed, { system: false });
    expect(notificationAtoms.items.get()).toHaveLength(1);
    expect(anilistNotificationsAtoms.releases.get()).toHaveLength(0);
  });

  it("skips lists outside the notify scope", async () => {
    mockNow();
    patchSettings({ anilistNotifyLists: ["Completed"] });
    saveAnilistObservation("7", observation({ nextEpisode: 4, nextAiringAt: PAST_SEC }));
    getLists.mockResolvedValue([{ name: "Watching", entries: [airingEntry(5, FUTURE_SEC)] }]);
    await pollAniListReleases(t, notDisposed, { system: false });
    expect(notificationAtoms.items.get()).toHaveLength(0);
    expect(anilistNotificationsAtoms.releases.get()).toHaveLength(0);
  });

  it("returns false and records nothing when disposed", async () => {
    mockNow();
    saveAnilistObservation("7", observation({ nextEpisode: 4, nextAiringAt: PAST_SEC }));
    getLists.mockResolvedValue([{ name: "Watching", entries: [airingEntry(5, FUTURE_SEC)] }]);
    const ok = await pollAniListReleases(t, () => true, { system: false });
    expect(ok).toBe(false);
    expect(notificationAtoms.items.get()).toHaveLength(0);
    expect(anilistNotificationsAtoms.observations.get()["7"]?.nextEpisode).toBe(4);
  });

  it("returns false when logged out", async () => {
    checkAuth.mockResolvedValue(null);
    const ok = await pollAniListReleases(t, notDisposed, { system: false });
    expect(ok).toBe(false);
    expect(notificationAtoms.items.get()).toHaveLength(0);
  });

  it("records the episode in-app while skipping the system toast on the first poll", async () => {
    mockNow();
    patchSettings({ notificationPopups: "both" });
    saveAnilistObservation("7", observation({ nextEpisode: 4, nextAiringAt: PAST_SEC }));
    getLists.mockResolvedValue([{ name: "Watching", entries: [airingEntry(5, FUTURE_SEC)] }]);
    await pollAniListReleases(t, notDisposed, { system: false });
    expect(notificationAtoms.items.get()).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockInvoke.mock.calls.some((call) => call[0] === "show_toast")).toBe(false);
  });

  it("sends the system toast for an episode on later polls", async () => {
    mockNow();
    patchSettings({ notificationPopups: "both" });
    saveAnilistObservation("7", observation({ nextEpisode: 4, nextAiringAt: PAST_SEC }));
    getLists.mockResolvedValue([{ name: "Watching", entries: [airingEntry(5, FUTURE_SEC)] }]);
    await pollAniListReleases(t, notDisposed, { system: true });
    expect(notificationAtoms.items.get()).toHaveLength(1);
    await vi.waitFor(() => {
      expect(mockInvoke.mock.calls.some((call) => call[0] === "show_toast")).toBe(true);
    });
  });
});

describe("restart persistence", () => {
  it("rehydrates observations and releases from storage", () => {
    const storage = memoryStorage();
    const before = createAnilistNotificationsSignalStore({ getStorage: () => storage });
    before.saveObservation("7", {
      signature: "sig",
      status: "CURRENT",
      mediaStatus: "RELEASING",
      title: "Show",
      updatedAt: NOW_MS,
      nextEpisode: 4,
      nextAiringAt: PAST_SEC,
    });
    before.addRelease({ mediaId: 7, title: "Show", episode: 4, airedAt: NOW_MS });
    before.setSiteMaxSeenId(9);
    before.setInitialized(true);
    before.persistor.flush();
    const after = createAnilistNotificationsSignalStore({ getStorage: () => storage });
    expect(after.atoms.observations.get()["7"]?.nextEpisode).toBe(4);
    expect(after.atoms.releases.get()).toHaveLength(1);
    expect(after.atoms.releases.get()[0]?.episode).toBe(4);
    expect(after.atoms.siteMaxSeenId.get()).toBe(9);
    expect(after.atoms.initialized.get()).toBe(true);
  });

  it("starts from an empty baseline when storage is missing", () => {
    const migrated = migrateNotificationsData(null, 6);
    expect(migrated.observations).toEqual({});
    expect(migrated.releases).toEqual([]);
    expect(migrated.initialized).toBe(false);
    expect(migrated.siteMaxSeenId).toBe(0);
  });
});

describe("site notifications poll", () => {
  it("seeds the watermark silently on the first poll", async () => {
    getSiteNotifications.mockResolvedValue([siteItem({ id: 5, kind: "sequel" })]);
    await pollSiteNotifications(t, notDisposed, { system: true });
    expect(notificationAtoms.items.get()).toHaveLength(0);
    expect(anilistNotificationsAtoms.siteMaxSeenId.get()).toBe(5);
  });

  it("toasts fresh sequels and subscribed replies", async () => {
    anilistNotificationsAtoms.siteMaxSeenId.set(5);
    getSiteNotifications.mockResolvedValue([
      siteItem({ id: 5, kind: "sequel" }),
      siteItem({ id: 6, kind: "sequel", anime_id: 21, anime_title: "Sequel" }),
      siteItem({ id: 7, kind: "subscribed", text: "hello" }),
    ]);
    await pollSiteNotifications(t, notDisposed, { system: true });
    const titles = notificationAtoms.items.get().map((item) => item.title);
    expect(titles).toContain("notification.anilist.sequel");
    expect(titles).toContain("notification.anilist.subscribed.reply");
    expect(anilistNotificationsAtoms.siteMaxSeenId.get()).toBe(7);
  });

  it("skips the fetch when every site toggle is off", async () => {
    patchSettings({
      notifySubscribedReplies: false,
      notifyMediaMerge: false,
      notifySequel: false,
    });
    await pollSiteNotifications(t, notDisposed, { system: true });
    expect(getSiteNotifications).not.toHaveBeenCalled();
  });

  it("ignores site airing items while advancing the watermark", async () => {
    anilistNotificationsAtoms.siteMaxSeenId.set(5);
    getSiteNotifications.mockResolvedValue([
      siteItem({ id: 6, kind: "airing", anime_id: 7, anime_title: "Show", episode: 4 }),
    ]);
    await pollSiteNotifications(t, notDisposed, { system: true });
    expect(notificationAtoms.items.get()).toHaveLength(0);
    expect(anilistNotificationsAtoms.siteMaxSeenId.get()).toBe(6);
  });
});
