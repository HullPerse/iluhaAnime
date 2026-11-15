import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DbScreen } from "@/components/shared/db/screen.db";

import { mockOpenPath, mockWriteText } from "@/tests/mocks";

afterEach(() => {
  cleanup();
});

const props = (overrides: Partial<Parameters<typeof DbScreen>[0]> = {}) => ({
  error: "open app database: file is not a database",
  themeName: "win95",
  dataDir: "C:/data",
  onRetry: vi.fn(),
  onReload: vi.fn(),
  onOpenFolder: vi.fn(),
  ...overrides,
});

describe("DbScreen", () => {
  it("shows the title, the error, and the recovery actions", () => {
    localStorage.clear();
    render(<DbScreen {...props()} />);
    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByText("Ошибка базы данных")).toBeDefined();
    expect(screen.getByText("open app database: file is not a database")).toBeDefined();
    expect(screen.getByRole("button", { name: "Проверить снова" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Перезапустить" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Открыть папку данных" })).toBeDefined();
  });

  it("hides the folder button without a data dir", () => {
    render(<DbScreen {...props({ dataDir: "" })} />);
    expect(screen.queryByRole("button", { name: "Открыть папку данных" })).toBeNull();
  });

  it("fires retry, reload, and folder handlers", async () => {
    const user = userEvent.setup();
    const own = props();
    render(<DbScreen {...own} />);
    await user.click(screen.getByRole("button", { name: "Проверить снова" }));
    expect(own.onRetry).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Перезапустить" }));
    expect(own.onReload).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Открыть папку данных" }));
    expect(own.onOpenFolder).toHaveBeenCalledTimes(1);
    expect(mockOpenPath).not.toHaveBeenCalled();
  });

  it("reveals details and copies them", async () => {
    const user = userEvent.setup();
    render(<DbScreen {...props()} />);
    await user.click(screen.getByRole("button", { name: "Подробности" }));
    expect(screen.getByText(/scope=database/)).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Скопировать детали" }));
    expect(await screen.findByRole("button", { name: "Скопировано" })).toBeDefined();
    expect(mockWriteText).toHaveBeenCalled();
  });
});
