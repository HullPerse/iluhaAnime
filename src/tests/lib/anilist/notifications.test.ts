import { beforeEach, describe, expect, it, vi } from "vitest";

import { pollAniListReleases, pollSiteNotifications } from "@/lib/anilist/notifications.utils";
import {
  anilistNotificationsAtoms,
  markOwnAnilistListStatus,
  saveAnilistObservation,
} from "@/store/anilist.store";
import { notificationAtoms } from "@/store/notification.store";
import { patchSettings } from "@/store/settings.store";
import type { AniNotificationEntry, AniSiteNotification } from "@/types/anilist";
import type { TFunc } from "@/types/i18n";

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
  invoke: () => Promise.resolve(),
}));

const t = ((key: string) => key) as TFunc;
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
});
