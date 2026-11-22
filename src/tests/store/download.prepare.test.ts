import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getTorrentInfo: vi.fn(),
  getTorrentInfoFromFile: vi.fn(),
  removeTorrent: vi.fn(async () => undefined),
  startTorrentDownload: vi.fn(),
  setTorrentSource: vi.fn(async () => undefined),
}));

const system = vi.hoisted(() => ({
  readFileBytes: vi.fn(),
  setWindowChrome: vi.fn(async () => undefined),
}));

const dialog = vi.hoisted(() => ({
  open: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock("@/api/torrent.api", () => ({ torrentApi: api }));
vi.mock("@/api/system.api", () => ({ systemApi: system }));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: dialog.open,
  confirm: dialog.confirm,
}));
vi.mock("@/lib/core/ui/notification.utils", () => ({ showError: vi.fn() }));

import { tr } from "@/lib/locale/i18n.utils";
import { initialPreparationState, preparationPending } from "@/lib/torrent/preparation.utils";
import { cacheAtoms, setLastSaveDir } from "@/store/cache.store";
import {
  cancelTorrentDownload,
  confirmTorrentDownload,
  prepareTorrentDownload,
  prepareTorrentDownloadFromBytes,
  queueTorrentFiles,
  torrentAtoms,
} from "@/store/download.store";

interface PendingInfo {
  id: number;
  name: string;
  files: { index: number; name: string; size: number }[];
  conflicting_files: string[];
  has_common_folder: boolean;
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });

  return { promise, resolve: settle };
}

const metadata: PendingInfo = {
  id: 1,
  name: "Show",
  files: [],
  conflicting_files: [],
  has_common_folder: true,
};

const withFile: PendingInfo = {
  ...metadata,
  files: [{ index: 0, name: "a.mkv", size: 10 }],
};

const phase = () => torrentAtoms.preparation.get().phase;

beforeEach(() => {
  vi.resetAllMocks();
  api.removeTorrent.mockResolvedValue(undefined);
  api.setTorrentSource.mockResolvedValue(undefined);
  setLastSaveDir("D:/downloads");
  torrentAtoms.preparation.set(initialPreparationState());
});

describe("download prepare cancellation", () => {
  it("drops magnet metadata that resolves after cancel", async () => {
    const pending = deferred<PendingInfo>();
    api.getTorrentInfo.mockReturnValue(pending.promise);

    const preparation = prepareTorrentDownload("magnet:?xt=urn:btih:test");
    await vi.waitFor(() => expect(api.getTorrentInfo).toHaveBeenCalledTimes(1));
    await cancelTorrentDownload();
    pending.resolve(metadata);
    await preparation;

    expect(preparationPending(torrentAtoms.preparation.get())).toBeNull();
    expect(phase()).toEqual({ phase: "idle" });
  });

  it("drops byte metadata that resolves after cancel", async () => {
    const pending = deferred<PendingInfo>();
    api.getTorrentInfoFromFile.mockReturnValue(pending.promise);

    const preparation = prepareTorrentDownloadFromBytes([1, 2, 3]);
    await vi.waitFor(() => expect(api.getTorrentInfoFromFile).toHaveBeenCalledTimes(1));
    await cancelTorrentDownload();
    pending.resolve(metadata);
    await preparation;

    expect(preparationPending(torrentAtoms.preparation.get())).toBeNull();
    expect(phase()).toEqual({ phase: "idle" });
  });
});

describe("download prepare queue", () => {
  it("starts the next queued file after cancel", async () => {
    const pending = deferred<PendingInfo>();
    system.readFileBytes.mockResolvedValue([1, 2, 3]);
    api.getTorrentInfoFromFile.mockReturnValue(pending.promise);

    queueTorrentFiles(["D:/a.mkv", "D:/b.mkv"]);
    await vi.waitFor(() => expect(system.readFileBytes).toHaveBeenCalledWith("D:/a.mkv"));

    expect(torrentAtoms.preparation.get().queue).toHaveLength(1);
    expect(phase().phase).toBe("preparing");

    await cancelTorrentDownload();
    await vi.waitFor(() => expect(system.readFileBytes).toHaveBeenCalledWith("D:/b.mkv"));
    expect(torrentAtoms.preparation.get().queue).toHaveLength(0);

    pending.resolve(metadata);
    await vi.waitFor(() =>
      expect(preparationPending(torrentAtoms.preparation.get())?.name).toBe("Show")
    );
    await cancelTorrentDownload();
  });
});

describe("download prepare picker", () => {
  it("uses the picked folder when no last folder is stored", async () => {
    setLastSaveDir("");
    dialog.open.mockResolvedValue("D:/picked");
    api.getTorrentInfo.mockResolvedValue(metadata);

    await prepareTorrentDownload("magnet:?xt=urn:btih:picked");

    expect(dialog.open).toHaveBeenCalledWith({
      directory: true,
      title: tr("download.select.folder"),
    });
    expect(cacheAtoms.lastSaveDir.get()).toBe("D:/picked");
    expect(api.getTorrentInfo).toHaveBeenCalledWith("magnet:?xt=urn:btih:picked", "D:/picked");
    expect(preparationPending(torrentAtoms.preparation.get())?.name).toBe("Show");
  });

  it("returns to idle when the folder picker is dismissed", async () => {
    setLastSaveDir("");
    dialog.open.mockResolvedValue(null);
    const next = deferred<PendingInfo>();
    api.getTorrentInfoFromFile.mockResolvedValue(metadata);
    api.getTorrentInfo.mockReturnValue(next.promise);

    await prepareTorrentDownload("magnet:?xt=urn:btih:dismissed");

    expect(phase()).toEqual({ phase: "idle" });
    expect(api.getTorrentInfo).not.toHaveBeenCalled();
  });
});

describe("download confirmation", () => {
  it("starts one download when confirm is pressed twice", async () => {
    const started = deferred<number>();
    api.getTorrentInfo.mockResolvedValue(withFile);
    api.startTorrentDownload.mockReturnValue(started.promise);
    await prepareTorrentDownload("magnet:?xt=urn:btih:confirm");

    const first = confirmTorrentDownload([0], "D:/downloads", undefined);
    const second = confirmTorrentDownload([0], "D:/downloads", undefined);

    await vi.waitFor(() => expect(api.startTorrentDownload).toHaveBeenCalledTimes(1));
    started.resolve(42);
    await Promise.all([first, second]);

    expect(api.startTorrentDownload).toHaveBeenCalledTimes(1);
    expect(phase()).toEqual({ phase: "idle" });
  });

  it("does not start after cancel while the overwrite prompt is open", async () => {
    const decision = deferred<boolean>();
    dialog.confirm.mockReturnValue(decision.promise);
    api.getTorrentInfo.mockResolvedValue({
      ...withFile,
      conflicting_files: ["a.mkv"],
    });
    await prepareTorrentDownload("magnet:?xt=urn:btih:conflict");

    const confirmation = confirmTorrentDownload([0], "D:/downloads", undefined);
    await vi.waitFor(() => expect(dialog.confirm).toHaveBeenCalledTimes(1));
    await cancelTorrentDownload();
    decision.resolve(true);
    await confirmation;

    expect(api.startTorrentDownload).not.toHaveBeenCalled();
    expect(phase()).toEqual({ phase: "idle" });
  });

  it("removes a download that finishes starting after cancel", async () => {
    const started = deferred<number>();
    api.getTorrentInfo.mockResolvedValue(withFile);
    api.startTorrentDownload.mockReturnValue(started.promise);
    await prepareTorrentDownload("magnet:?xt=urn:btih:rollback");

    const confirmation = confirmTorrentDownload([0], "D:/downloads", undefined);
    await vi.waitFor(() => expect(api.startTorrentDownload).toHaveBeenCalledTimes(1));
    await cancelTorrentDownload();
    started.resolve(55);
    await confirmation;

    expect(api.removeTorrent).toHaveBeenCalledWith(55, false);
    expect(phase()).toEqual({ phase: "idle" });
  });

  it("keeps the picker open when the download start fails", async () => {
    api.getTorrentInfo.mockResolvedValue(withFile);
    api.startTorrentDownload.mockRejectedValue(new Error("disk full"));
    await prepareTorrentDownload("magnet:?xt=urn:btih:fail");

    await confirmTorrentDownload([0], "D:/downloads", undefined);

    expect(preparationPending(torrentAtoms.preparation.get())?.name).toBe("Show");
  });
});
