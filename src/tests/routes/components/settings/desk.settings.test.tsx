import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SettingsChangelog } from "@/routes/components/settings/changelog.settings";
import { SettingsSummary } from "@/routes/components/settings/summary.settings";
import { useSettingsStore } from "@/store/settings.store";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) => mockInvoke(cmd, args),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: () => Promise.resolve("3.0.2"),
}));

const confirmMock = vi.fn(async (..._args: unknown[]) => true);
vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: (message: string, options?: Record<string, unknown>) => confirmMock(message, options),
  open: vi.fn(),
}));

afterEach(() => {
  cleanup();
  mockInvoke.mockReset();
  confirmMock.mockReset();
  confirmMock.mockImplementation(() => Promise.resolve(true));
});

function renderSummary(onJump: (tab: string) => void = () => {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsSummary onJump={onJump as never} />
    </QueryClientProvider>
  );
}

describe("SettingsSummary", () => {
  it("shows binary status, version, backup date, and learning counts", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "check_ffprobe") return Promise.resolve(false);
      if (cmd === "list_sqlite_databases") return Promise.resolve([{ id: "app", available: true }]);
      if (cmd === "list_sqlite_backups")
        return Promise.resolve([{ name: "b", sizeBytes: 1, modifiedMs: 1000 }]);
      return Promise.resolve(null);
    });
    renderSummary();
    expect(await screen.findByText("3.0.2")).toBeDefined();
    expect(await screen.findByText(/1970/)).toBeDefined();
  });
  it("shows binary status as icons and learning as a single count", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "check_ffprobe") return Promise.resolve(false);
      if (cmd === "list_sqlite_databases") return Promise.resolve([{ id: "app", available: true }]);
      if (cmd === "list_sqlite_backups")
        return Promise.resolve([{ name: "b", sizeBytes: 1, modifiedMs: 1000 }]);
      return Promise.resolve(null);
    });
    renderSummary();
    expect(await screen.findByLabelText(/FFmpeg not found|FFmpeg не найден/)).toBeDefined();
    const learningLabel = screen.getByText(/Learning|Обучение/);
    expect(learningLabel.closest("div")?.textContent).not.toMatch(/\//);
  });

  it("shows the remote image cache size and clears it after confirmation", async () => {
    const user = userEvent.setup();
    let cleared = false;
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_remote_images_stats")
        return Promise.resolve(cleared ? { count: 0, bytes: 0 } : { count: 12, bytes: 1536 });
      if (cmd === "clear_remote_image_cache") {
        cleared = true;
        return Promise.resolve(12);
      }
      return Promise.resolve(null);
    });
    renderSummary();
    expect(await screen.findByText("12 · 1.5 KB")).toBeDefined();
    await user.click(screen.getByRole("button", { name: /Clear|Очистить/ }));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("clear_remote_image_cache", undefined);
    });
    expect(await screen.findByText("0 · 0 B")).toBeDefined();
  });

  it("enables the sqlite tab when jumping to backups from a gated state", async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({ sqliteBrowserEnabled: false });
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "check_ffprobe") return Promise.resolve(false);
      if (cmd === "list_sqlite_databases") return Promise.resolve([{ id: "app", available: true }]);
      if (cmd === "list_sqlite_backups")
        return Promise.resolve([{ name: "b", sizeBytes: 1, modifiedMs: 1000 }]);
      return Promise.resolve(null);
    });
    const onJump = vi.fn();
    renderSummary(onJump);

    const openButtons = await screen.findAllByRole("button", { name: "Open" });
    await user.click(openButtons[0]);

    expect(useSettingsStore.getState().sqliteBrowserEnabled).toBe(true);
    expect(onJump).toHaveBeenCalledWith("sqlite");
  });

});
describe("SettingsChangelog", () => {
  it("renders collapsible versions with categorized entries", async () => {
    const user = userEvent.setup();
    render(<SettingsChangelog />);
    expect(screen.getByText("4.0.3")).toBeDefined();
    expect(screen.getByText(/Изменено|Changed/)).toBeDefined();
    await user.click(screen.getByRole("button", { name: /4\.0\.3/ }));
    expect(screen.queryByText(/Изменено|Changed/)).toBeNull();
    await user.click(screen.getByRole("button", { name: /4\.0\.3/ }));
  });
  it("prefixes every entry with its area scope", () => {
    render(<SettingsChangelog />);
    const rows = screen.getAllByRole("listitem");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.textContent).toMatch(/\[.+\]:/);
    }
    expect(screen.getAllByText(/Коллекция|Collection/).length).toBeGreaterThan(0);
  });
});
