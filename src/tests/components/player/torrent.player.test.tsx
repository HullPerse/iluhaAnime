import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockInvoke, mockOpenPath } from "@/tests/mocks";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 20,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ index, start: index * 20, key: index })),
    scrollToIndex: () => undefined,
    measureElement: () => undefined,
  }),
}));

import TorrentFilesPlayerSection from "@/routes/components/player/torrent.player";
import { patchSettings, settingsAtoms } from "@/store/settings.store";
import type { TorrentFileInfo, TorrentInfo } from "@/types/torrent/torrent";

const SAVE_DIR = "D:/media/anime";

const torrent = (overrides: Partial<TorrentInfo> = {}): TorrentInfo => {
  return {
    id: 1,
    name: "Test release",
    info_hash: "hash-1",
    total_bytes: 1000,
    progress_bytes: 420,
    uploaded_bytes: 0,
    share_ratio: 0,
    download_speed: 1024 * 1024,
    upload_speed: 0,
    peers_connected: 4,
    progress: 0.42,
    state: "live",
    eta_secs: 90,
    finished: false,
    error: null,
    save_dir: SAVE_DIR,
    sequential_download: false,
    sequential_file: null,
    download_order: [],
    missing_files: false,
    external_changes: false,
    external_changed_files: [],
    ...overrides,
  };
};

const file = (index: number, name: string, completed = true): TorrentFileInfo => {
  return {
    index,
    name,
    size: 10,
    progress_bytes: completed ? 10 : 0,
    completed,
    selected: true,
    priority: "normal",
    exists: true,
  };
};

const renderSection = (
  props: {
    item?: TorrentInfo;
    files?: TorrentFileInfo[];
    torrentLoading?: boolean;
    expanded?: boolean;
  } = {}
) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onToggleExpand = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <TorrentFilesPlayerSection
        item={props.item ?? torrent()}
        files={props.files}
        isExpanded={props.expanded ?? false}
        torrentLoading={props.torrentLoading ?? false}
        onToggleExpand={onToggleExpand}
        hideHeader
      />
    </QueryClientProvider>
  );

  return { onToggleExpand };
};

beforeEach(() => {
  mockInvoke.mockImplementation((command: unknown) =>
    command === "scan_extra_files" ? Promise.resolve([]) : Promise.resolve(undefined)
  );
  patchSettings({ language: "ru" });
});

afterEach(() => {
  cleanup();
});

describe("TorrentFilesPlayerSection pending torrent", () => {
  it("shows download progress instead of an empty file list", () => {
    renderSection({ files: [] });

    expect(screen.getByText("Загружается")).toBeDefined();
    expect(screen.getByText("42%")).toBeDefined();
    expect(screen.getByText("1.0 MB/s")).toBeDefined();
    expect(screen.getByText("Готовых к проигрыванию файлов нет")).toBeDefined();
    expect(screen.queryByText(/^Файла:/)).toBeNull();
    expect(screen.queryByText(/^File:/)).toBeNull();
    expect(
      screen.getByRole("progressbar", { name: "Загружается" }).getAttribute("aria-valuenow")
    ).toBe("420");
  });

  it("reports a paused torrent without a finished file", () => {
    renderSection({
      files: [],
      item: torrent({ state: "paused", download_speed: 0, progress: 0.5, progress_bytes: 500 }),
    });

    expect(screen.getByText("Пауза")).toBeDefined();
    expect(screen.getByText("50%")).toBeDefined();
    expect(screen.getByText("Готовых к проигрыванию файлов нет")).toBeDefined();
    expect(screen.queryByText("1.0 MB/s")).toBeNull();
  });

  it("keeps the refresh and open-folder actions available", async () => {
    renderSection({ files: [] });
    await act(async () => {});

    fireEvent.click(screen.getByTitle("Открыть в папке"));
    expect(mockOpenPath).toHaveBeenCalledWith(SAVE_DIR);

    const countCalls = () =>
      mockInvoke.mock.calls.filter(([command]) => command === "scan_extra_files").length;
    const callsBefore = countCalls();
    fireEvent.click(screen.getByTitle("Обновить апскейлы"));
    await waitFor(() => expect(countCalls()).toBe(callsBefore + 1));
  });

  it("still shows the loader while torrent files are pending", () => {
    renderSection({ files: undefined, torrentLoading: true });

    expect(screen.getByText("Загрузка файлов...")).toBeDefined();
    expect(screen.queryByText("Готовых к проигрыванию файлов нет")).toBeNull();
  });

  it("reports the initial check and the file being hashed", () => {
    renderSection({
      files: [],
      item: torrent({
        state: "initializing",
        progress_bytes: 250,
        progress: 0.25,
        download_speed: 0,
        checking_file: "Show/E01.mkv",
      }),
    });

    expect(screen.getByText("Проверка файлов")).toBeDefined();
    expect(screen.getByText("25%")).toBeDefined();
    expect(screen.getByTitle("Show/E01.mkv").textContent).toBe("Проверяется: Show/E01.mkv");
    expect(
      screen.getByRole("progressbar", { name: "Проверка файлов" }).getAttribute("aria-valuenow")
    ).toBe("250");
  });

  it("says the files are being checked instead of loaded", () => {
    renderSection({
      files: undefined,
      torrentLoading: true,
      item: torrent({
        state: "initializing",
        progress_bytes: 250,
        progress: 0.25,
        checking_file: "Show/E01.mkv",
      }),
    });

    expect(screen.getByText("Проверка файлов...")).toBeDefined();
    expect(screen.queryByText("Загрузка файлов...")).toBeNull();
  });

  it("explains missing files without drawing a progress bar", () => {
    renderSection({
      files: [],
      item: torrent({ missing_files: true, finished: true, state: "paused", error: "not found" }),
    });

    expect(screen.getByText("Файлов нет")).toBeDefined();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText("Готовых к проигрыванию файлов нет")).toBeNull();
  });

  it("shows an indeterminate bar while the torrent initializes", () => {
    renderSection({
      files: [],
      item: torrent({
        total_bytes: 0,
        progress_bytes: 0,
        progress: 0,
        download_speed: 0,
        state: "initializing",
      }),
    });

    expect(screen.getByText("Инициализация")).toBeDefined();
    expect(screen.queryByText("0%")).toBeNull();
    expect(
      screen.getByRole("progressbar", { name: "Инициализация" }).getAttribute("aria-valuenow")
    ).toBeNull();
  });
});

describe("TorrentFilesPlayerSection with content", () => {
  it("counts only completed files and expands the list", () => {
    const { onToggleExpand } = renderSection({
      files: [file(0, "A/a.mkv"), file(1, "A/b.mkv"), file(2, "A/c.mkv", false)],
    });

    expect(screen.getByText("Файла: (2)")).toBeDefined();
    expect(screen.queryByText("Готовых к проигрыванию файлов нет")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Файла: (2)" }));
    expect(onToggleExpand).toHaveBeenCalledTimes(1);
  });

  it("keeps upscales visible when no torrent file finished", async () => {
    mockInvoke.mockImplementation((command: unknown) =>
      command === "scan_extra_files"
        ? Promise.resolve([{ path: `${SAVE_DIR}/upscale.mkv`, name: "upscale.mkv", size: 10 }])
        : Promise.resolve(undefined)
    );

    renderSection({ files: [] });

    await waitFor(() => expect(screen.getByText("+ 1 апскейл")).toBeDefined());
    expect(screen.queryByText(/^Файла:/)).toBeNull();
    expect(screen.queryByText("Готовых к проигрыванию файлов нет")).toBeNull();
  });

  it("resizes the list and remembers the height", () => {
    renderSection({ files: [file(0, "a.mkv")], expanded: true });

    fireEvent.keyDown(screen.getByRole("separator"), { key: "ArrowDown" });

    expect(settingsAtoms.playerTorrentHeights.get()["hash-1"]).toBe(180);
  });
});
