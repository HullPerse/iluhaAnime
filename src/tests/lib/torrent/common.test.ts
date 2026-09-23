import type { Event } from "@tauri-apps/api/event";
import { describe, it, expect } from "vitest";

import { translate } from "@/lib/locale/i18n.utils";
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
import type { TorrentInfo } from "@/types/torrent";

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
    expect(torrentErrorText("torrent with id 0 did not exist", ru)).toBe(ru("download.error.gone"));
    expect(torrentErrorText("torrent not found or no metadata", ru)).toBe(
      ru("download.error.gone")
    );
    expect(torrentErrorText("torrent is already paused", ru)).toBe(
      ru("download.error.already.paused")
    );
    expect(torrentErrorText("torrent is already live", ru)).toBe(ru("download.error.already.live"));
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
