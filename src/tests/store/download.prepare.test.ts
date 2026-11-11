import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getTorrentInfo: vi.fn(),
  getTorrentInfoFromFile: vi.fn(),
  removeTorrent: vi.fn(async () => undefined),
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
import { cacheAtoms, setLastSaveDir } from "@/store/cache.store";
import {
  cancelTorrentDownload,
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

beforeEach(() => {
  vi.clearAllMocks();
  setLastSaveDir("D:/downloads");
  torrentAtoms.pendingTorrent.set(null);
  torrentAtoms.prepareQueue.set([]);
  torrentAtoms.preparingTorrent.set(false);
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

    expect(torrentAtoms.pendingTorrent.get()).toBeNull();
    expect(torrentAtoms.preparingTorrent.get()).toBe(false);
  });

  it("drops byte metadata that resolves after cancel", async () => {
    const pending = deferred<PendingInfo>();
    api.getTorrentInfoFromFile.mockReturnValue(pending.promise);

    const preparation = prepareTorrentDownloadFromBytes([1, 2, 3]);
    await vi.waitFor(() => expect(api.getTorrentInfoFromFile).toHaveBeenCalledTimes(1));
    await cancelTorrentDownload();
    pending.resolve(metadata);
    await preparation;

    expect(torrentAtoms.pendingTorrent.get()).toBeNull();
    expect(torrentAtoms.preparingTorrent.get()).toBe(false);
  });
});

describe("download prepare queue", () => {
  it("starts the next queued file after cancel", async () => {
    const pending = deferred<PendingInfo>();
    system.readFileBytes.mockResolvedValue([1, 2, 3]);
    api.getTorrentInfoFromFile.mockReturnValue(pending.promise);

    queueTorrentFiles(["D:/a.mkv", "D:/b.mkv"]);
    await vi.waitFor(() => expect(system.readFileBytes).toHaveBeenCalledWith("D:/a.mkv"));

    expect(torrentAtoms.prepareQueue.get()).toHaveLength(1);
    expect(torrentAtoms.preparingTorrent.get()).toBe(true);

    await cancelTorrentDownload();
    await vi.waitFor(() => expect(system.readFileBytes).toHaveBeenCalledWith("D:/b.mkv"));
    expect(torrentAtoms.prepareQueue.get()).toHaveLength(0);

    pending.resolve(metadata);
    await vi.waitFor(() => expect(torrentAtoms.pendingTorrent.get()?.name).toBe("Show"));
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
    expect(api.getTorrentInfo).toHaveBeenCalledWith(
      "magnet:?xt=urn:btih:picked",
      "D:/picked"
    );
    expect(torrentAtoms.pendingTorrent.get()?.name).toBe("Show");
  });
});
