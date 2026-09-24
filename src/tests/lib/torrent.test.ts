import type { Event } from "@tauri-apps/api/event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { translate } from "@/lib/locale/i18n.utils";
import { applyBulkAction, pruneSelection, splitRecheckOutcome } from "@/lib/torrent/bulk.utils";
import {
  DISPLAY_BAR_CLASS,
  STALL_AFTER_MS,
  displayStateLabel,
  findJustFinished,
  findNewErrors,
  fmtSpeed,
  getDisplayState,
  getLifecycleLabel,
  getTorrentLifecycle,
  sameDownloadOrder,
  shouldHealTorrentChannel,
  shouldHealTorrentPoll,
  stateLabel,
  TORRENT_EVENT_STALE_MS,
  TorrentListen,
  torrentErrorText,
  type TorrentListState,
} from "@/lib/torrent/common.utils";
import { copyMagnet, downloadMagnet, openMagnet } from "@/lib/torrent/magnet.utils";
import { describeRecheckOutcome } from "@/lib/torrent/recheck.utils";
import {
  applyFolderSelection,
  buildTorrentTree,
  collectFileIndices,
  groupFilesByDirectory,
} from "@/lib/torrent/tree.utils";
import { useTorrentStore } from "@/store/download.store";
import { useNotificationStore } from "@/store/notification.store";
import { useSettingsStore } from "@/store/settings.store";
import type { TFunc, TranslationVariables } from "@/types/i18n";
import type { Anime, TorrentCheckResult, TorrentInfo, TorrentTreeNode } from "@/types/torrent";

const invokeSpy = vi.fn();
const writeTextSpy = vi.fn();
const openUrlSpy = vi.fn();
const prepareTorrentDownloadSpy = vi.fn();
const prepareTorrentDownloadFromBytesSpy = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeSpy(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: (...args: unknown[]) => writeTextSpy(...args),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: (...args: unknown[]) => openUrlSpy(...args),
}));

describe("torrent/bulk", () => {
  function check(missing: number): TorrentCheckResult {
    return {
      id: 1,
      missing: Array.from({ length: missing }, (_, index) => `file-${index}`),
      size_mismatch: [],
      ok: 1,
      total: 1,
    };
  }

  describe("applyBulkAction", () => {
    it("counts every success", async () => {
      const act = vi.fn().mockResolvedValue(undefined);
      expect(await applyBulkAction([1, 2, 3], act)).toEqual({ done: 3, failed: 0 });
      expect(act).toHaveBeenCalledTimes(3);
    });

    it("counts partial failures without stopping", async () => {
      const act = vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("nope"))
        .mockResolvedValueOnce(undefined);
      expect(await applyBulkAction([1, 2, 3], act)).toEqual({ done: 2, failed: 1 });
    });

    it("handles an empty selection", async () => {
      const act = vi.fn();
      expect(await applyBulkAction([], act)).toEqual({ done: 0, failed: 0 });
      expect(act).not.toHaveBeenCalled();
    });
  });

  describe("pruneSelection", () => {
    it("keeps the selection and its identity when nothing was hidden", () => {
      const selected = new Set([1, 2]);
      expect(pruneSelection(selected, [{ id: 1 }, { id: 2 }, { id: 3 }])).toBe(selected);
    });

    it("drops what the current filter hides", () => {
      const pruned = pruneSelection(new Set([1, 2, 3]), [{ id: 2 }, { id: 3 }]);
      expect([...pruned]).toEqual([2, 3]);
    });

    it("leaves an empty selection alone", () => {
      const selected = new Set<number>();
      expect(pruneSelection(selected, [])).toBe(selected);
    });
  });

  describe("splitRecheckOutcome", () => {
    it("offers nothing for recreation when the check found the files", () => {
      expect(splitRecheckOutcome([1, 2], [check(0), check(0)])).toEqual({ lost: [], failed: 0 });
    });

    it("picks only the torrents that are still incomplete", () => {
      expect(splitRecheckOutcome([1, 2, 3], [check(0), check(2), check(0)])).toEqual({
        lost: [2],
        failed: 0,
      });
    });

    it("treats a failed check as a failure, never as a reason to recreate", () => {
      expect(splitRecheckOutcome([1, 2], [null, check(0)])).toEqual({ lost: [], failed: 1 });
    });

    it("ignores a missing result instead of reading it as clean", () => {
      expect(splitRecheckOutcome([1], [])).toEqual({ lost: [], failed: 1 });
    });
  });
});

describe("torrent/common", () => {
  const ru = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) =>
    translate("ru", key, vars);

  function makeInfo(id: number, overrides: Partial<TorrentInfo> = {}): TorrentInfo {
    return {
      download_order: [],
      download_speed: 0,
      error: null,
      eta_secs: null,
      finished: false,
      id,
      info_hash: `hash-${id}`,
      missing_files: false,
      paused_external_changes: false,
      paused_changed_files: [],
      name: `Torrent ${id}`,
      peers_connected: 0,
      progress: 0,
      progress_bytes: 0,
      save_dir: "/dl",
      sequential_download: false,
      sequential_file: null,
      share_ratio: 0,
      state: "live",
      total_bytes: 1000,
      upload_speed: 0,
      uploaded_bytes: 0,
      ...overrides,
    };
  }

  function makeEvent(payload: TorrentInfo[]): Event<TorrentInfo[]> {
    return { event: "torrents", id: 1, payload };
  }

  function makeState(torrents: TorrentInfo[]): TorrentListState {
    return { torrents, lastActiveAt: {} };
  }

  describe("sameDownloadOrder", () => {
    it("compares the queue by value, not by the array it arrived in", () => {
      expect(sameDownloadOrder([2, 0], [2, 0])).toBe(true);
      expect(sameDownloadOrder([2, 0], [0, 2])).toBe(false);
      expect(sameDownloadOrder([], [])).toBe(true);
      expect(sameDownloadOrder([1], [])).toBe(false);
    });

    it("treats a payload without the queue as a change instead of crashing", () => {
      expect(sameDownloadOrder(undefined, undefined)).toBe(true);
      expect(sameDownloadOrder(undefined, [0])).toBe(false);
      expect(sameDownloadOrder([0], undefined)).toBe(false);
    });
  });

  describe("fmtSpeed", () => {
    it("returns empty for zero or negative", () => {
      expect(fmtSpeed(0)).toBe("");
      expect(fmtSpeed(-1)).toBe("");
    });

    it("formats B/s", () => {
      expect(fmtSpeed(500)).toBe("500 B/s");
    });

    it("formats KB/s", () => {
      expect(fmtSpeed(2048)).toBe("2.0 KB/s");
    });

    it("formats MB/s", () => {
      expect(fmtSpeed(2_097_152)).toBe("2.0 MB/s");
    });
  });

  describe("stateLabel", () => {
    it("returns Russian labels for known states", () => {
      expect(stateLabel("live", ru)).toBe("Загружается");
      expect(stateLabel("paused", ru)).toBe("Пауза");
      expect(stateLabel("initializing", ru)).toBe("Инициализация");
      expect(stateLabel("error", ru)).toBe("Ошибка");
    });

    it("returns raw state for unknown states", () => {
      expect(stateLabel("checking", ru)).toBe("checking");
      expect(stateLabel("", ru)).toBe("");
    });
  });

  describe("getTorrentLifecycle", () => {
    it("maps states to lifecycle phases", () => {
      expect(getTorrentLifecycle("initializing", false)).toBe("staging");
      expect(getTorrentLifecycle("live", false)).toBe("live");
      expect(getTorrentLifecycle("live", true)).toBe("seeding");
      expect(getTorrentLifecycle("paused", true)).toBe("completed");
      expect(getTorrentLifecycle("paused", false)).toBe("paused");
    });

    it("defaults to live for unknown states", () => {
      expect(getTorrentLifecycle("weird", false)).toBe("live");
    });
  });

  describe("getLifecycleLabel", () => {
    it("returns Russian labels", () => {
      expect(getLifecycleLabel("staging", ru)).toBe("Подготовка");
      expect(getLifecycleLabel("live", ru)).toBe("Загружается");
      expect(getLifecycleLabel("paused", ru)).toBe("Пауза");
      expect(getLifecycleLabel("seeding", ru)).toBe("Раздаётся");
      expect(getLifecycleLabel("completed", ru)).toBe("Завершено");
    });
  });

  describe("TorrentListen", () => {
    const NOW = 1_000_000;
    const TICK = Math.floor(NOW / 1000);
    it("replaces the list when the length changes", () => {
      const next = [makeInfo(1), makeInfo(2)];
      const result = TorrentListen(makeState([makeInfo(1)]), makeEvent(next), NOW);
      expect(result).toEqual({ torrents: next, lastActiveAt: { 2: TICK } });
    });

    it("returns an empty patch when nothing changed", () => {
      const current = [makeInfo(1)];
      const result = TorrentListen(makeState(current), makeEvent([makeInfo(1)]));
      expect(result).toEqual({});
    });

    it("returns a patch when progress changed", () => {
      const current = [makeInfo(1)];
      const next = [makeInfo(1, { progress_bytes: 500 })];
      const result = TorrentListen(makeState(current), makeEvent(next), NOW);
      expect(result).toEqual({ torrents: next, lastActiveAt: { 1: TICK } });
    });

    it("returns a patch when the state changed", () => {
      const current = [makeInfo(1)];
      const next = [makeInfo(1, { state: "paused" })];
      const result = TorrentListen(makeState(current), makeEvent(next));
      expect(result).toEqual({ torrents: next });
    });

    it("returns a patch when upload speed changes", () => {
      const current = [makeInfo(1)];
      const next = [makeInfo(1, { upload_speed: 128 })];
      const result = TorrentListen(makeState(current), makeEvent(next));
      expect(result).toEqual({ torrents: next });
    });

    it("returns a patch when the share ratio changed", () => {
      const current = [makeInfo(1)];
      const next = [makeInfo(1, { share_ratio: 1.25 })];
      const result = TorrentListen(makeState(current), makeEvent(next));
      expect(result).toEqual({ torrents: next });
    });
    it("stamps first-sight torrents", () => {
      const result = TorrentListen(makeState([]), makeEvent([makeInfo(7)]), NOW);
      expect(result).toEqual({
        torrents: [expect.objectContaining({ id: 7 })],
        lastActiveAt: { 7: TICK },
      });
    });

    it("drops stamps of removed torrents", () => {
      const state = { torrents: [makeInfo(1)], lastActiveAt: { 1: TICK, 9: TICK } };
      const result = TorrentListen(state as TorrentListState, makeEvent([makeInfo(1)]), NOW);
      expect(result).toEqual({ lastActiveAt: { 1: TICK } });
    });

    it("returns a patch when the backend order changes", () => {
      const current = [makeInfo(1), makeInfo(2)];
      const next = [makeInfo(2), makeInfo(1)];
      const result = TorrentListen(makeState(current), makeEvent(next), NOW);
      expect(result).toEqual({ torrents: next });
    });
  });

  describe("torrentErrorText", () => {
    it("maps engine strings to localized keys", () => {
      expect(torrentErrorText("torrent with id 0 did not exist", ru)).toBe(
        ru("download.error.gone")
      );
      expect(torrentErrorText("torrent not found or no metadata", ru)).toBe(
        ru("download.error.gone")
      );
      expect(torrentErrorText("torrent is already paused", ru)).toBe(
        ru("download.error.already.paused")
      );
      expect(torrentErrorText("torrent is already live", ru)).toBe(
        ru("download.error.already.live")
      );
      expect(torrentErrorText("torrent list is stale, refresh and retry", ru)).toBe(
        ru("download.error.stale")
      );
    });

    it("keeps raw detail for partial file deletion", () => {
      const raw = "torrent deleted, but could not delete files: access denied";
      expect(torrentErrorText(raw, ru)).toBe(`${ru("download.error.files.kept")} ${raw}`);
    });

    it("passes unknown errors through", () => {
      expect(torrentErrorText("boom", ru)).toBe("boom");
    });
  });

  describe("findJustFinished", () => {
    const live = (id: number, overrides: Partial<TorrentInfo> = {}) =>
      makeInfo(id, { finished: true, state: "live", ...overrides });
    it("lists newly finished torrents without a seed preference", () => {
      expect(findJustFinished([makeInfo(1)], [makeInfo(1), live(2)], {})).toEqual([live(2)]);
    });
    it("skips torrents finished before the previous tick", () => {
      expect(findJustFinished([live(1)], [live(1)], {})).toEqual([]);
    });
    it("skips opted-in seeds and non-live rows", () => {
      expect(findJustFinished([], [live(1)], { 1: true })).toEqual([]);
      expect(findJustFinished([], [live(1, { state: "paused" })], {})).toEqual([]);
      expect(findJustFinished([], [makeInfo(1)], {})).toEqual([]);
    });
  });

  describe("getDisplayState", () => {
    const NOW = 10_000_000;
    const live = (stamps: Record<number, number>) => stamps;
    it("reports error first", () => {
      expect(getDisplayState(makeInfo(1, { error: "x", finished: true }), live({}), NOW)).toBe(
        "error"
      );
    });
    it("reports missing files above every other state", () => {
      expect(
        getDisplayState(makeInfo(1, { missing_files: true, finished: true }), live({}), NOW)
      ).toBe("missing");
      expect(
        getDisplayState(
          makeInfo(1, { error: "tracker down", missing_files: true, state: "paused" }),
          live({}),
          NOW
        )
      ).toBe("missing");
    });
    it("reports seeding for live finished torrents", () => {
      expect(getDisplayState(makeInfo(1, { finished: true, state: "live" }), live({}), NOW)).toBe(
        "seeding"
      );
    });
    it("reports done for paused finished torrents", () => {
      expect(getDisplayState(makeInfo(1, { finished: true, state: "paused" }), live({}), NOW)).toBe(
        "done"
      );
    });
    it("reports paused", () => {
      expect(getDisplayState(makeInfo(1, { state: "paused" }), live({}), NOW)).toBe("paused");
    });
    it("reports downloading while speed flows", () => {
      expect(getDisplayState(makeInfo(1, { download_speed: 1024 }), live({}), NOW)).toBe(
        "downloading"
      );
    });
    it("reports stalled after 30s of silence", () => {
      const stamp = Math.floor((NOW - STALL_AFTER_MS - 1000) / 1000);
      expect(getDisplayState(makeInfo(1), live({ 1: stamp }), NOW)).toBe("stalled");
    });
    it("stays downloading within the stall window", () => {
      const stamp = Math.floor((NOW - 10_000) / 1000);
      expect(getDisplayState(makeInfo(1), live({ 1: stamp }), NOW)).toBe("downloading");
    });
    it("labels every display state without falling back to raw keys", () => {
      const labels = (
        ["downloading", "seeding", "done", "error", "stalled", "paused", "missing"] as const
      ).map((s) => displayStateLabel(s, ru));
      expect(labels).toEqual([
        "Загружается",
        "Раздаётся",
        "Завершено",
        "Ошибка",
        "Простаивает",
        "Пауза",
        "Файлов нет",
      ]);
      expect(Object.keys(DISPLAY_BAR_CLASS).sort()).toEqual(
        ["done", "downloading", "error", "missing", "paused", "seeding", "stalled"].sort()
      );
      expect(DISPLAY_BAR_CLASS).toEqual({
        downloading: "bg-torrent-downloading",
        seeding: "bg-torrent-seeding",
        done: "bg-torrent-done",
        error: "bg-torrent-error",
        stalled: "bg-torrent-idle",
        paused: "bg-torrent-idle",
        missing: "bg-torrent-missing",
      });
    });
  });

  describe("findNewErrors", () => {
    it("reports only fresh errors", () => {
      const prev = [makeInfo(1, { error: "old" }), makeInfo(2)];
      const next = [makeInfo(1, { error: "old" }), makeInfo(2, { error: "new" })];
      expect(findNewErrors(prev, next).map((t) => t.id)).toEqual([2]);
    });
    it("ignores cleared errors", () => {
      expect(findNewErrors([makeInfo(1, { error: "x" })], [makeInfo(1)])).toEqual([]);
    });
  });

  describe("shouldHealTorrentPoll", () => {
    it("stays quiet before the first event and inside the window", () => {
      expect(shouldHealTorrentPoll(0, 60_000)).toBe(false);
      expect(shouldHealTorrentPoll(1_000, 1_000 + TORRENT_EVENT_STALE_MS - 1)).toBe(false);
    });
    it("heals after a stale silence", () => {
      expect(shouldHealTorrentPoll(1_000, 1_000 + TORRENT_EVENT_STALE_MS)).toBe(true);
    });
  });

  describe("shouldHealTorrentChannel", () => {
    it("stays quiet while nothing is known to be wrong", () => {
      expect(
        shouldHealTorrentChannel({ lastEventAt: 0, lastHealAt: 0, watchStartedAt: 0 }, 60_000)
      ).toBe(false);
    });

    it("heals from the watch start when no push ever arrived", () => {
      const state = { lastEventAt: 0, lastHealAt: 0, watchStartedAt: 1_000 };
      expect(shouldHealTorrentChannel(state, 1_000 + TORRENT_EVENT_STALE_MS - 1)).toBe(false);
      expect(shouldHealTorrentChannel(state, 1_000 + TORRENT_EVENT_STALE_MS)).toBe(true);
    });

    it("restarts the window after a heal", () => {
      const state = { lastEventAt: 0, lastHealAt: 40_000, watchStartedAt: 1_000 };
      expect(shouldHealTorrentChannel(state, 40_000 + TORRENT_EVENT_STALE_MS - 1)).toBe(false);
      expect(shouldHealTorrentChannel(state, 40_000 + TORRENT_EVENT_STALE_MS)).toBe(true);
    });

    it("prefers the newest push over an older heal", () => {
      expect(
        shouldHealTorrentChannel(
          { lastEventAt: 50_000, lastHealAt: 40_000, watchStartedAt: 1_000 },
          50_001
        )
      ).toBe(false);
    });
  });

  describe("TorrentListen", () => {
    const event = (payload: TorrentInfo[]) => ({ payload }) as Event<TorrentInfo[]>;
    const state = (torrents: TorrentInfo[]): TorrentListState => ({ lastActiveAt: {}, torrents });

    it("repaints when a check reports the files gone", () => {
      const prev = state([makeInfo(1, { finished: true })]);
      const next = [makeInfo(1, { finished: true, missing_files: true })];
      expect(TorrentListen(prev, event(next), 60_000).torrents).toEqual(next);
    });

    it("drops the repaint when the verdict is unchanged", () => {
      const torrents = [makeInfo(1, { finished: true, missing_files: true })];
      expect(TorrentListen(state(torrents), event(torrents), 60_000).torrents).toBeUndefined();
    });
  });
});

describe("torrent/magnet", () => {
  beforeEach(() => {
    invokeSpy.mockReset();
    writeTextSpy.mockReset();
    openUrlSpy.mockReset();
    prepareTorrentDownloadSpy.mockReset();
    prepareTorrentDownloadFromBytesSpy.mockReset();
    useSettingsStore.setState({ searchProxyUrls: {} });
    useTorrentStore.setState({
      prepareTorrentDownload: prepareTorrentDownloadSpy as never,
      prepareTorrentDownloadFromBytes: prepareTorrentDownloadFromBytesSpy as never,
    });
  });

  const item: Anime = {
    category: "topic-123",
    leechers: 5,
    link: "https://example.test/show",
    magnet: "magnet:?xt=urn:btih:direct",
    seeders: 10,
    size: "1 GiB",
    title: "Show",
    torrent: "",
  };

  function makeMagnets() {
    let magnets: Record<string, string> = {};
    let loading: Record<string, boolean> = {};
    return {
      getLoading: () => loading,
      getMagnets: () => magnets,
      setLoadingMagnet: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => {
        loading = fn(loading);
      },
      setMagnets: (fn: (prev: Record<string, string>) => Record<string, string>) => {
        magnets = fn(magnets);
      },
    };
  }

  describe("copyMagnet", () => {
    it("copies an existing magnet without invoking the backend", async () => {
      const m = makeMagnets();
      await copyMagnet(item, m.getMagnets(), m.setMagnets, m.setLoadingMagnet);
      expect(writeTextSpy).toHaveBeenCalledWith(item.magnet);
      expect(invokeSpy).not.toHaveBeenCalled();
    });

    it("fetches a missing magnet from the backend and copies it", async () => {
      invokeSpy.mockResolvedValueOnce("magnet:?xt=urn:btih:fetched");
      const m = makeMagnets();
      await copyMagnet({ ...item, magnet: "" }, m.getMagnets(), m.setMagnets, m.setLoadingMagnet);
      expect(invokeSpy).toHaveBeenCalledWith("rutracker_get_magnet", {
        topicId: "topic-123",
      });
      expect(writeTextSpy).toHaveBeenCalledWith("magnet:?xt=urn:btih:fetched");
      expect(m.getMagnets()["https://example.test/show"]).toBe("magnet:?xt=urn:btih:fetched");
    });

    it("shows an error and does not copy when fetching fails", async () => {
      invokeSpy.mockRejectedValueOnce(new Error("boom"));
      const m = makeMagnets();
      await copyMagnet({ ...item, magnet: "" }, m.getMagnets(), m.setMagnets, m.setLoadingMagnet);
      expect(writeTextSpy).not.toHaveBeenCalled();
      expect(useNotificationStore.getState().items[0].type).toBe("error");
    });
  });

  describe("openMagnet", () => {
    it("opens an existing magnet", async () => {
      const m = makeMagnets();
      await openMagnet(item, m.getMagnets(), m.setMagnets, m.setLoadingMagnet);
      expect(openUrlSpy).toHaveBeenCalledWith(item.magnet);
    });

    it("does nothing when no magnet is available", async () => {
      invokeSpy.mockRejectedValueOnce(new Error("boom"));
      const m = makeMagnets();
      await openMagnet({ ...item, magnet: "" }, m.getMagnets(), m.setMagnets, m.setLoadingMagnet);
      expect(openUrlSpy).not.toHaveBeenCalled();
    });
  });

  describe("downloadMagnet", () => {
    it("prefers .torrent bytes for a rutracker result (dl.php)", async () => {
      invokeSpy.mockResolvedValueOnce([1, 2, 3]);
      const m = makeMagnets();
      await downloadMagnet(item, m.getMagnets(), m.setMagnets, m.setLoadingMagnet);
      expect(invokeSpy).toHaveBeenCalledWith("rutracker_get_torrent_bytes", {
        topicId: "topic-123",
      });
      expect(prepareTorrentDownloadFromBytesSpy).toHaveBeenCalledWith([1, 2, 3]);
      expect(prepareTorrentDownloadSpy).not.toHaveBeenCalled();
    });

    it("prefers .torrent bytes for a nyaa-style result (direct URL)", async () => {
      invokeSpy.mockResolvedValueOnce([9, 8, 7]);
      const m = makeMagnets();
      await downloadMagnet(
        { ...item, torrent: "https://nyaa.si/download/file.torrent" },
        m.getMagnets(),
        m.setMagnets,
        m.setLoadingMagnet,
        "nyaa"
      );
      expect(invokeSpy).toHaveBeenCalledWith("fetch_torrent_bytes", {
        url: "https://nyaa.si/download/file.torrent",
      });
      expect(prepareTorrentDownloadFromBytesSpy).toHaveBeenCalledWith([9, 8, 7]);
      expect(prepareTorrentDownloadSpy).not.toHaveBeenCalled();
    });

    it("falls back to the magnet when byte download fails", async () => {
      invokeSpy.mockRejectedValueOnce(new Error("blocked"));
      invokeSpy.mockResolvedValueOnce("magnet:?xt=urn:btih:fetched");
      const m = makeMagnets();
      await downloadMagnet(
        { ...item, magnet: "" },
        m.getMagnets(),
        m.setMagnets,
        m.setLoadingMagnet
      );
      expect(prepareTorrentDownloadFromBytesSpy).not.toHaveBeenCalled();
      expect(prepareTorrentDownloadSpy).toHaveBeenCalledWith("magnet:?xt=urn:btih:fetched");
    });

    it("starts a torrent download with an already-present magnet", async () => {
      invokeSpy.mockRejectedValueOnce(new Error("blocked"));
      const m = makeMagnets();
      await downloadMagnet(item, m.getMagnets(), m.setMagnets, m.setLoadingMagnet);
      expect(prepareTorrentDownloadSpy).toHaveBeenCalledWith(item.magnet);
    });
  });
  describe("proxy", () => {
    it("sends the rutracker proxy when resolving a magnet", async () => {
      useSettingsStore.setState({ searchProxyUrls: { rutracker: "socks5://127.0.0.1:10808" } });
      invokeSpy.mockResolvedValueOnce("magnet:?xt=urn:btih:fetched");
      const m = makeMagnets();
      await copyMagnet({ ...item, magnet: "" }, m.getMagnets(), m.setMagnets, m.setLoadingMagnet);
      expect(invokeSpy).toHaveBeenCalledWith("rutracker_get_magnet", {
        topicId: "topic-123",
        proxyUrl: "socks5://127.0.0.1:10808",
        proxy_url: "socks5://127.0.0.1:10808",
      });
    });
    it("sends the rutracker proxy when downloading .torrent bytes via dl.php", async () => {
      useSettingsStore.setState({ searchProxyUrls: { rutracker: "socks5://127.0.0.1:10808" } });
      invokeSpy.mockResolvedValueOnce([1, 2, 3]);
      const m = makeMagnets();
      await downloadMagnet(item, m.getMagnets(), m.setMagnets, m.setLoadingMagnet, "rutracker");
      expect(invokeSpy).toHaveBeenCalledWith("rutracker_get_torrent_bytes", {
        topicId: "topic-123",
        proxyUrl: "socks5://127.0.0.1:10808",
        proxy_url: "socks5://127.0.0.1:10808",
      });
    });
    it("sends the source proxy when downloading .torrent bytes via direct URL", async () => {
      useSettingsStore.setState({ searchProxyUrls: { nyaa: "http://127.0.0.1:7890" } });
      invokeSpy.mockResolvedValueOnce([9, 8, 7]);
      const m = makeMagnets();
      await downloadMagnet(
        { ...item, torrent: "https://nyaa.si/download/file.torrent" },
        m.getMagnets(),
        m.setMagnets,
        m.setLoadingMagnet,
        "nyaa"
      );
      expect(invokeSpy).toHaveBeenCalledWith("fetch_torrent_bytes", {
        url: "https://nyaa.si/download/file.torrent",
        proxyUrl: "http://127.0.0.1:7890",
        proxy_url: "http://127.0.0.1:7890",
      });
    });
    it("does not borrow another source proxy for a direct URL", async () => {
      useSettingsStore.setState({ searchProxyUrls: { rutracker: "socks5://127.0.0.1:10808" } });
      invokeSpy.mockResolvedValueOnce([9, 8, 7]);
      const m = makeMagnets();
      await downloadMagnet(
        { ...item, torrent: "https://nyaa.si/download/file.torrent" },
        m.getMagnets(),
        m.setMagnets,
        m.setLoadingMagnet,
        "nyaa"
      );
      expect(invokeSpy).toHaveBeenCalledWith("fetch_torrent_bytes", {
        url: "https://nyaa.si/download/file.torrent",
        proxyUrl: undefined,
        proxy_url: undefined,
      });
    });
  });
});

describe("torrent/recheck", () => {
  function check(partial: Partial<TorrentCheckResult>): TorrentCheckResult {
    return {
      id: 1,
      missing: [],
      size_mismatch: [],
      ok: 3,
      total: 3,
      ...partial,
    };
  }

  const t: TFunc = (key, variables?: TranslationVariables) => {
    const vars =
      variables === undefined
        ? ""
        : ` ${Object.entries(variables)
            .map(([name, value]) => `${name}=${value}`)
            .join(" ")}`;
    return `${key}${vars}`;
  };

  describe("describeRecheckOutcome", () => {
    it("reports success when nothing is missing or mismatched", () => {
      expect(describeRecheckOutcome(check({}), t)).toEqual({
        tone: "success",
        message: "torrent.recheck.ok ok=3 total=3",
      });
    });

    it("lists only the missing part when sizes match", () => {
      expect(
        describeRecheckOutcome(check({ missing: ["a.mkv", "b.mkv"], ok: 1, total: 3 }), t)
      ).toEqual({
        tone: "error",
        message: "torrent.recheck.missing count=2 torrent.recheck.summary ok=1 total=3",
      });
    });

    it("lists only the size part when nothing is missing", () => {
      expect(
        describeRecheckOutcome(check({ size_mismatch: ["c.mkv"], ok: 2, total: 3 }), t)
      ).toEqual({
        tone: "error",
        message: "torrent.recheck.size count=1 torrent.recheck.summary ok=2 total=3",
      });
    });

    it("joins both parts when files are missing and mismatched", () => {
      expect(
        describeRecheckOutcome(
          check({ missing: ["a.mkv"], size_mismatch: ["b.mkv"], ok: 1, total: 3 }),
          t
        )
      ).toEqual({
        tone: "error",
        message:
          "torrent.recheck.missing count=1; torrent.recheck.size count=1 torrent.recheck.summary ok=1 total=3",
      });
    });
  });
});

describe("torrent/tree", () => {
  describe("collectFileIndices", () => {
    it("collects indices from files and nested children", () => {
      const tree: TorrentTreeNode = {
        children: [
          {
            name: "extras",
            files: [
              {
                index: 3,
                name: "b.mkv",
                displayName: "b.mkv",
                size: 1,
                progress_bytes: 0,
                completed: false,
                selected: true,
                priority: "normal",
                exists: false,
              },
            ],
            children: [],
          },
        ],
        files: [
          {
            index: 0,
            name: "a.mkv",
            displayName: "a.mkv",
            size: 1,
            progress_bytes: 0,
            completed: false,
            selected: true,
            priority: "normal",
            exists: false,
          },
        ],
        name: "Season 1",
      };
      expect(collectFileIndices(tree).sort((a, b) => a - b)).toEqual([0, 3]);
    });

    it("returns an empty array for an empty tree", () => {
      const tree: TorrentTreeNode = { children: [], files: [], name: "" };
      expect(collectFileIndices(tree)).toEqual([]);
    });
  });

  describe("applyFolderSelection", () => {
    const entry = (index: number, selected: boolean, completed = false) => ({
      index,
      selected,
      completed,
    });

    it("selects the folder without touching the files around it", () => {
      const files = [entry(0, true), entry(1, false), entry(2, false), entry(3, true)];

      expect(applyFolderSelection(files, [1, 2], true)).toEqual([0, 1, 2, 3]);
    });

    it("unchecks the folder and leaves the rest selected", () => {
      const files = [entry(0, true), entry(1, true), entry(2, true), entry(3, true)];

      expect(applyFolderSelection(files, [1, 2], false)).toEqual([0, 3]);
    });

    it("keeps finished files in the download even when their folder is unchecked", () => {
      const files = [entry(0, true, true), entry(1, true), entry(2, false)];

      expect(applyFolderSelection(files, [0, 1], false)).toEqual([0]);
    });
  });

  describe("buildTorrentTree", () => {
    it("groups files into a nested sorted tree", () => {
      const { nodes, rootFiles } = buildTorrentTree([
        {
          completed: false,
          exists: false,
          index: 0,
          name: "Season 1/ep1.mkv",
          priority: "normal",
          progress_bytes: 0,
          selected: true,
          size: 100,
        },
        {
          completed: false,
          exists: false,
          index: 1,
          name: "Season 1/ep2.mkv",
          priority: "normal",
          progress_bytes: 0,
          selected: true,
          size: 100,
        },
        {
          completed: true,
          exists: true,
          index: 2,
          name: "movie.mkv",
          priority: "normal",
          progress_bytes: 100,
          selected: true,
          size: 100,
        },
      ]);
      expect(rootFiles.map((f) => f.displayName)).toEqual(["movie.mkv"]);
      expect(nodes).toHaveLength(1);
      expect(nodes[0].name).toBe("Season 1");
      expect(nodes[0].files.map((f) => f.displayName)).toEqual(["ep1.mkv", "ep2.mkv"]);
    });

    it("lists every file flat, in torrent order", () => {
      const { nodes, rootFiles } = buildTorrentTree(
        [
          {
            completed: false,
            exists: false,
            index: 2,
            name: "Season 1/ep1.mkv",
            priority: "normal",
            progress_bytes: 0,
            selected: true,
            size: 100,
          },
          {
            completed: false,
            exists: false,
            index: 0,
            name: "ep6.mkv",
            priority: "normal",
            progress_bytes: 0,
            selected: true,
            size: 100,
          },
        ],
        "torrent"
      );

      expect(rootFiles.map((f) => f.index)).toEqual([0, 2]);
      expect(rootFiles.map((f) => f.displayName)).toEqual(["ep6.mkv", "Season 1/ep1.mkv"]);
      expect(nodes).toEqual([]);
    });
  });

  describe("groupFilesByDirectory", () => {
    it("groups nested files and sorts directories", () => {
      const groups = groupFilesByDirectory([
        { index: 0, name: "Season 1/ep1.mkv", size: 1 },
        { index: 1, name: "Movie/movie.mkv", size: 1 },
        { index: 2, name: "root.mkv", size: 1 },
      ]);
      expect(groups.map((g) => g.dir)).toEqual(["", "Movie", "Season 1"]);
      expect(groups[0].files[0].displayName).toBe("root.mkv");
      expect(groups[1].files[0].displayName).toBe("movie.mkv");
    });

    it("keeps one group in torrent order and shows full paths", () => {
      const groups = groupFilesByDirectory(
        [
          { index: 2, name: "Season 1/ep1.mkv", size: 1 },
          { index: 0, name: "Movie/movie.mkv", size: 1 },
          { index: 1, name: "root.mkv", size: 1 },
        ],
        "torrent"
      );

      expect(groups.map((g) => g.dir)).toEqual([""]);
      expect(groups[0].files.map((f) => f.displayName)).toEqual([
        "Movie/movie.mkv",
        "root.mkv",
        "Season 1/ep1.mkv",
      ]);
    });

    it("returns no groups for an empty torrent in torrent order", () => {
      expect(groupFilesByDirectory([], "torrent")).toEqual([]);
    });
  });
});
