// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SettingsChangelog } from "@/routes/components/settings/changelog.settings";
import { SettingsSummary } from "@/routes/components/settings/summary.settings";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: () => Promise.resolve("3.0.2"),
}));

afterEach(() => {
  cleanup();
  mockInvoke.mockReset();
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
      if (cmd === "check_fastembed") return Promise.resolve(true);
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
      if (cmd === "check_fastembed") return Promise.resolve(true);
      if (cmd === "check_ffprobe") return Promise.resolve(false);
      if (cmd === "list_sqlite_databases") return Promise.resolve([{ id: "app", available: true }]);
      if (cmd === "list_sqlite_backups")
        return Promise.resolve([{ name: "b", sizeBytes: 1, modifiedMs: 1000 }]);
      return Promise.resolve(null);
    });
    renderSummary();
    expect(
      await screen.findByLabelText(/Model installed|Модель установлена/)
    ).toBeDefined();
    expect(screen.getByLabelText(/Model not found|Модель не найдена/)).toBeDefined();
    const learningLabel = screen.getByText(/Learning|Обучение/);
    expect(learningLabel.closest("div")?.textContent).not.toMatch(/\//);
  });

  it("jumps to the owning tab from a row action", async () => {
    const user = userEvent.setup();
    mockInvoke.mockResolvedValue(null);
    const onJump = vi.fn();
    renderSummary(onJump);
    const buttons = await screen.findAllByRole("button", { name: /Открыть|Open/ });
    await user.click(buttons[0]);
    expect(onJump).toHaveBeenCalledWith("search");
  });
});
describe("SettingsChangelog", () => {
  it("renders collapsible versions with categorized entries", async () => {
    const user = userEvent.setup();
    render(<SettingsChangelog />);
    expect(screen.getByText("3.2.0")).toBeDefined();
    expect(screen.getByText(/Новое|Added/)).toBeDefined();
    await user.click(screen.getByRole("button", { name: /3\.2\.0/ }));
    expect(screen.queryByText(/Новое|Added/)).toBeNull();
    await user.click(screen.getByRole("button", { name: /3\.2\.0/ }));
    expect(screen.getByText(/Новое|Added/)).toBeDefined();
  });
  it("prefixes every entry with its area scope", () => {
    render(<SettingsChangelog />);
    const rows = screen.getAllByRole("listitem");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.textContent).toMatch(/\[.+\]:/);
    }
    expect(screen.getAllByText(/Апскейл|Upscale/).length).toBeGreaterThan(0);
  });
});
