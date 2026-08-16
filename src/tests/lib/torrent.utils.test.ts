import type { Event } from "@tauri-apps/api/event";
import { describe, it, expect } from "vitest";

import { translate } from "@/lib/i18n";
import {
  buildTorrentTree,
  fmtElapsed,
  fmtETA,
  fmtSize,
  fmtSpeed,
  getLifecycleLabel,
  getTorrentLifecycle,
  groupFilesByDirectory,
  stateLabel,
  TorrentListen,
} from "@/lib/torrent.utils";
import type { TorrentInfo, TorrentStore } from "@/types/torrent";

const ru = (
  key: Parameters<typeof translate>[1],
  vars?: Parameters<typeof translate>[2]
) => translate("ru", key, vars);

function makeInfo(
  id: number,
  overrides: Partial<TorrentInfo> = {}
): TorrentInfo {
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

describe("buildTorrentTree", () => {
  it("groups files into a nested sorted tree", () => {
    const { nodes, rootFiles } = buildTorrentTree([
      {
        completed: false,
        exists: false,
        index: 0,
        name: "Season 1/ep1.mkv",
        priority: "normal",
        progress_bytes: 10,
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
    expect(nodes[0].files.map((f) => f.displayName)).toEqual([
      "ep1.mkv",
      "ep2.mkv",
    ]);
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
});

describe("TorrentListen", () => {
  it("replaces the list when the length changes", () => {
    const next = [makeInfo(1), makeInfo(2)];
    const result = TorrentListen(makeState([makeInfo(1)]), makeEvent(next));
    expect(result).toEqual({ torrents: next });
  });

  it("returns an empty patch when nothing changed", () => {
    const current = [makeInfo(1)];
    const result = TorrentListen(makeState(current), makeEvent([makeInfo(1)]));
    expect(result).toEqual({});
  });

  it("returns a patch when progress changed", () => {
    const current = [makeInfo(1)];
    const next = [makeInfo(1, { progress_bytes: 500 })];
    const result = TorrentListen(makeState(current), makeEvent(next));
    expect(result).toEqual({ torrents: next });
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
});
