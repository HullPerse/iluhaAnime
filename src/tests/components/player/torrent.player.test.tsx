import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockInvoke, mockOpenPath } from "../../mocks";

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
import { patchSettings } from "@/store/settings.store";
import type { TorrentFileInfo, TorrentInfo } from "@/types/torrent";

const SAVE_DIR = "D:/media/anime";

function torrent(overrides: Partial<TorrentInfo> = {}): TorrentInfo {
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
}

function file(index: number, name: string, completed = true): TorrentFileInfo {
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
}

function renderSection(
  props: { item?: TorrentInfo; files?: TorrentFileInfo[]; torrentLoading?: boolean } = {}
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onToggleExpand = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <TorrentFilesPlayerSection
        item={props.item ?? torrent()}
        files={props.files}
        isExpanded={false}
        torrentLoading={props.torrentLoading ?? false}
        onToggleExpand={onToggleExpand}
        hideHeader
      />
    </QueryClientProvider>
  );
  return { onToggleExpand };
}

beforeEach(() => {
  mockInvoke.mockImplementation((command: unknown) =>
    command === "scan_extra_files" ? Promise.resolve([]) : Promise.resolve(undefined)
  );
  patchSettings({ language: "en" });
});

afterEach(() => {
  cleanup();
});

describe("TorrentFilesPlayerSection pending torrent", () => {
  it("shows download progress instead of an empty file list", () => {
    renderSection({ files: [] });

    expect(screen.getByText("Downloading")).toBeDefined();
    expect(screen.getByText("42%")).toBeDefined();
    expect(screen.getByText("1.0 MB/s")).toBeDefined();
    expect(screen.getByText("No files ready to play")).toBeDefined();
    expect(screen.queryByText(/^Files:/)).toBeNull();
    expect(screen.queryByText(/^File:/)).toBeNull();
    expect(
      screen.getByRole("progressbar", { name: "Downloading" }).getAttribute("aria-valuenow")
    ).toBe("420");
  });

  it("reports a paused torrent without a finished file", () => {
    renderSection({
      files: [],
      item: torrent({ state: "paused", download_speed: 0, progress: 0.5, progress_bytes: 500 }),
    });

    expect(screen.getByText("Paused")).toBeDefined();
    expect(screen.getByText("50%")).toBeDefined();
    expect(screen.getByText("No files ready to play")).toBeDefined();
    expect(screen.queryByText("1.0 MB/s")).toBeNull();
  });

  it("keeps the refresh and open-folder actions available", async () => {
    renderSection({ files: [] });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    fireEvent.click(screen.getByTitle("Open in folder"));
    expect(mockOpenPath).toHaveBeenCalledWith(SAVE_DIR);

    const countCalls = () =>
      mockInvoke.mock.calls.filter(([command]) => command === "scan_extra_files").length;
    const callsBefore = countCalls();
    fireEvent.click(screen.getByTitle("Refresh upscales"));
    await waitFor(() => expect(countCalls()).toBe(callsBefore + 1));
  });

  it("still shows the loader while torrent files are pending", () => {
    renderSection({ files: undefined, torrentLoading: true });

    expect(screen.getByText("Loading files...")).toBeDefined();
    expect(screen.queryByText("No files ready to play")).toBeNull();
  });

  it("explains missing files without drawing a progress bar", () => {
    renderSection({
      files: [],
      item: torrent({ missing_files: true, finished: true, state: "paused", error: "not found" }),
    });

    expect(screen.getByText("Files gone")).toBeDefined();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText("No files ready to play")).toBeNull();
    expect(screen.getByText("not found")).toBeDefined();
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

    expect(screen.getByText("Initializing")).toBeDefined();
    expect(screen.queryByText("0%")).toBeNull();
    expect(
      screen.getByRole("progressbar", { name: "Initializing" }).getAttribute("aria-valuenow")
    ).toBeNull();
  });
});

describe("TorrentFilesPlayerSection with content", () => {
  it("counts only completed files and expands the list", () => {
    const { onToggleExpand } = renderSection({
      files: [file(0, "A/a.mkv"), file(1, "A/b.mkv"), file(2, "A/c.mkv", false)],
    });

    expect(screen.getByText("Files: (2)")).toBeDefined();
    expect(screen.queryByText("No files ready to play")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Files: (2)" }));
    expect(onToggleExpand).toHaveBeenCalledTimes(1);
  });

  it("keeps upscales visible when no torrent file finished", async () => {
    mockInvoke.mockImplementation((command: unknown) =>
      command === "scan_extra_files"
        ? Promise.resolve([{ path: `${SAVE_DIR}/upscale.mkv`, name: "upscale.mkv", size: 10 }])
        : Promise.resolve(undefined)
    );

    renderSection({ files: [] });

    await waitFor(() => expect(screen.getByText("+ 1 upscale")).toBeDefined());
    expect(screen.queryByText(/^Files:/)).toBeNull();
    expect(screen.queryByText("No files ready to play")).toBeNull();
  });
});
