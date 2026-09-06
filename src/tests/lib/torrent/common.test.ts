import type { Event } from "@tauri-apps/api/event";
import { describe, it, expect } from "vitest";

import { translate } from "@/lib/locale/i18n.utils";
import {
  DISPLAY_BAR_CLASS,
  STALL_AFTER_MS,
  displayStateLabel,
  findNewErrors,
  fmtElapsed,
  fmtETA,
  fmtSize,
  fmtSpeed,
  getDisplayState,
  getLifecycleLabel,
  getTorrentLifecycle,
  stateLabel,
  TorrentListen,
} from "@/lib/torrent/common.utils";
import type { TorrentInfo, TorrentStore } from "@/types/torrent";

const ru = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) =>
  translate("ru", key, vars);

function makeInfo(id: number, overrides: Partial<TorrentInfo> = {}): TorrentInfo {
  return {
    download_speed: 0,
    error: null,
    eta_secs: null,
    finished: false,
    id,
    info_hash: `hash-${id}`,
    name: `Torrent ${id}`,
    peers_connected: 0,
    progress: 0,
    progress_bytes: 0,
    save_dir: "/dl",
    sequential_download: false,
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

function makeState(torrents: TorrentInfo[]): TorrentStore {
  return { torrents } as unknown as TorrentStore;
}

describe("fmtSize", () => {
  it("formats bytes", () => {
    expect(fmtSize(0)).toBe("0 B");
    expect(fmtSize(512)).toBe("512 B");
  });

  it("formats KB", () => {
    expect(fmtSize(1024)).toBe("1.0 KB");
    expect(fmtSize(1536)).toBe("1.5 KB");
  });

  it("formats MB", () => {
    expect(fmtSize(1_048_576)).toBe("1.0 MB");
    expect(fmtSize(1_572_864)).toBe("1.5 MB");
  });

  it("formats GB", () => {
    expect(fmtSize(1_073_741_824)).toBe("1.00 GB");
    expect(fmtSize(1_610_612_736)).toBe("1.50 GB");
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

describe("fmtETA", () => {
  it("returns empty for null or invalid", () => {
    expect(fmtETA(null, ru)).toBe("");
    expect(fmtETA(0, ru)).toBe("");
    expect(fmtETA(Infinity, ru)).toBe("");
  });

  it("formats seconds", () => {
    expect(fmtETA(45, ru)).toBe("45 сек");
  });

  it("formats minutes and seconds", () => {
    expect(fmtETA(125, ru)).toBe("2 мин 5 сек");
  });

  it("formats hours and minutes", () => {
    expect(fmtETA(3661, ru)).toBe("1 ч 1 мин");
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

describe("fmtElapsed", () => {
  it("formats seconds only", () => {
    expect(fmtElapsed(45, ru)).toBe("45 сек");
  });

  it("formats whole minutes", () => {
    expect(fmtElapsed(120, ru)).toBe("2 мин");
  });

  it("formats minutes and seconds", () => {
    expect(fmtElapsed(125, ru)).toBe("2 мин 5 сек");
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
    const result = TorrentListen(state as unknown as TorrentStore, makeEvent([makeInfo(1)]), NOW);
    expect(result).toEqual({ lastActiveAt: { 1: TICK } });
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
    const labels = (["downloading", "seeding", "done", "error", "stalled", "paused"] as const).map(
      (s) => displayStateLabel(s, ru)
    );
    expect(labels).toEqual([
      "Загружается",
      "Раздаётся",
      "Завершено",
      "Ошибка",
      "Простаивает",
      "Пауза",
    ]);
    expect(Object.keys(DISPLAY_BAR_CLASS).sort()).toEqual(
      ["done", "downloading", "error", "paused", "seeding", "stalled"].sort()
    );
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
