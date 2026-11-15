import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RouteErrorScreen } from "@/components/shared/routeError.component";

afterEach(() => {
  cleanup();
});

describe("RouteErrorScreen", () => {
  it("shows a chunk fatal for a dead dynamic import and resets on retry", async () => {
    const user = userEvent.setup();
    localStorage.clear();
    const reset = vi.fn();
    render(
      <RouteErrorScreen
        error={new Error("Failed to fetch dynamically imported module: ./assets/x.js")}
        reset={reset}
      />
    );
    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByText("Ошибка загрузки модуля")).toBeDefined();
    expect(
      screen.getByText("Failed to fetch dynamically imported module: ./assets/x.js")
    ).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Попробовать снова" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("offers reload, safe reload, and copy", async () => {
    const user = userEvent.setup();
    render(<RouteErrorScreen error={new Error("boom")} reset={() => {}} />);
    expect(screen.getByText("Ошибка отрисовки")).toBeDefined();
    expect(screen.getByRole("button", { name: "Перезапустить" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Безопасный перезапуск" })).toBeDefined();
    await user.click(screen.getByRole("button", { name: /Подробности/ }));
    await user.click(screen.getByRole("button", { name: "Скопировать детали" }));
    expect(await screen.findByRole("button", { name: "Скопировано" })).toBeDefined();
  });
});
