import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatBackupDate } from "@/lib/settings/backup.utils";
import { formatBytes } from "@/lib/utils/bytes.utils";
import { SettingsSummary } from "@/routes/components/settings/summary.settings";
import { useSearchStore } from "@/store/search.store";
import { useSettingsStore } from "@/store/settings.store";

const mockInvoke = vi.fn();
const mockConfirm = vi.fn();
const resetCoverCache = vi.fn();
const resetRemoteImageCache = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));
vi.mock("@tauri-apps/api/app", () => ({
  getVersion: () => Promise.resolve("9.9.9"),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: (...args: unknown[]) => mockConfirm(...args),
}));
vi.mock("@/hooks/collection/cache.hook", () => ({
  resetCoverCache: () => resetCoverCache(),
}));
vi.mock("@/hooks/remoteImage.hook", () => ({
  resetRemoteImageCache: () => resetRemoteImageCache(),
}));

const DATABASE = {
  available: true,
  fileName: "iluha.db",
  id: "app",
  label: "App",
  sizeBytes: 4_194_304,
  tables: [],
};
const BACKUPS = [
  { modifiedMs: 1_700_000_000_000, name: "one.db", sizeBytes: 1_048_576 },
  { modifiedMs: 1_600_000_000_000, name: "two.db", sizeBytes: 524_288 },
];

function renderSummary(onJump = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SettingsSummary onJump={onJump} />
    </QueryClientProvider>
  );
  return onJump;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  useSettingsStore.setState({
    language: "en",
    searchType: "default",
    sqliteBrowserEnabled: false,
  });
  useSearchStore.setState({
    animeIndex: [],
    history: ["a", "b"],
    queryStats: { a: { count: 1, lastUsedAt: 0, selectedCount: 0 } },
  });
  mockConfirm.mockReset();
  mockConfirm.mockResolvedValue(true);
  resetCoverCache.mockReset();
  resetRemoteImageCache.mockReset();
  mockInvoke.mockReset();
  mockInvoke.mockImplementation((command: string) => {
    if (command === "check_ffprobe") return Promise.resolve(true);
    if (command === "list_sqlite_databases") return Promise.resolve([DATABASE]);
    if (command === "list_sqlite_backups") return Promise.resolve(BACKUPS);
    if (command === "get_remote_images_stats")
      return Promise.resolve({ bytes: 2_097_152, count: 12 });
    if (command === "clear_remote_image_cache") return Promise.resolve(7);
    return Promise.resolve(undefined);
  });
});

describe("SettingsSummary", () => {
  it("shows the app section from live sources", async () => {
    renderSummary();

    expect(await screen.findByText("9.9.9")).toBeTruthy();
    expect(screen.getByText("Windows 95")).toBeTruthy();
    expect(screen.getByText("Default")).toBeTruthy();
    expect(screen.getByLabelText("FFmpeg installed")).toBeTruthy();
    expect(screen.getByText("Application")).toBeTruthy();
  });

  it("summarizes the database, backups and image cache", async () => {
    renderSummary();

    expect(
      await screen.findByText(`${DATABASE.fileName} · ${formatBytes(DATABASE.sizeBytes)}`)
    ).toBeTruthy();
    expect(
      screen.getByText(
        `${BACKUPS.length} · ${formatBytes(BACKUPS[0].sizeBytes + BACKUPS[1].sizeBytes)} · ${formatBackupDate(BACKUPS[0].modifiedMs)}`
      )
    ).toBeTruthy();
    expect(screen.getByText(`12 · ${formatBytes(2_097_152)}`)).toBeTruthy();
  });

  it("reports unknown storage instead of failing when no database answers", async () => {
    mockInvoke.mockImplementation((command: string) => {
      if (command === "list_sqlite_databases") return Promise.reject(new Error("db down"));
      return Promise.resolve(undefined);
    });
    renderSummary();

    expect(await screen.findByText("unknown")).toBeTruthy();
    expect(screen.getByText("none")).toBeTruthy();
  });

  it("counts the learning data from the search store", async () => {
    renderSummary();

    expect(await screen.findByText("2")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("History")).toBeTruthy();
    expect(screen.getByText("Query stats")).toBeTruthy();
    expect(screen.getByText("Anime index")).toBeTruthy();
  });

  it("clears the image cache after confirmation and resets the local caches", async () => {
    const user = userEvent.setup();
    renderSummary();
    await screen.findByText(`12 · ${formatBytes(2_097_152)}`);

    await user.click(screen.getByRole("button", { name: "Clear" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("clear_remote_image_cache", undefined)
    );
    expect(resetCoverCache).toHaveBeenCalledTimes(1);
    expect(resetRemoteImageCache).toHaveBeenCalledTimes(1);
  });

  it("keeps the cache when the confirmation is declined", async () => {
    mockConfirm.mockResolvedValue(false);
    const user = userEvent.setup();
    renderSummary();
    await screen.findByText(`12 · ${formatBytes(2_097_152)}`);

    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(mockInvoke).not.toHaveBeenCalledWith("clear_remote_image_cache", undefined);
    expect(resetCoverCache).not.toHaveBeenCalled();
  });

  it("jumps to the matching tab and enables the browser when opening the database", async () => {
    const user = userEvent.setup();
    const onJump = renderSummary();
    await screen.findByText(`${DATABASE.fileName} · ${formatBytes(DATABASE.sizeBytes)}`);

    await user.click(screen.getAllByRole("button", { name: "Open" })[0]);
    expect(onJump).toHaveBeenCalledWith("theme");

    await user.click(screen.getAllByRole("button", { name: "Open" })[2]);
    expect(onJump).toHaveBeenCalledWith("sqlite");
    expect(useSettingsStore.getState().sqliteBrowserEnabled).toBe(true);
  });
});
