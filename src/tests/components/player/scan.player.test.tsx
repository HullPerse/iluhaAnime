import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import FolderScanProgress from "@/routes/components/player/scan.player";

afterEach(cleanup);

describe("folder scan progress", () => {
  it("shows an indeterminate bar immediately and reports the checked files as they arrive", () => {
    const path = "D:/Видео/Frieren";
    const { rerender } = render(<FolderScanProgress scan={{ type: "folder", path, walked: 0 }} />);
    const bar = screen.getByRole("progressbar", { name: "Анализ файлов" });
    expect(bar.hasAttribute("aria-valuenow")).toBe(false);
    expect(screen.getByText(path)).toBeTruthy();

    rerender(<FolderScanProgress scan={{ type: "folder", path, walked: 250 }} />);
    expect(screen.getByRole("status").textContent).toBe("Проверено 250 файлов");
    expect(bar.hasAttribute("aria-valuenow")).toBe(false);
  });

  it("shows completed folders against the known total when restoring the library", () => {
    render(<FolderScanProgress scan={{ type: "library", current: 2, total: 5 }} />);
    const bar = screen.getByRole("progressbar", { name: "Анализ файлов" });
    expect(bar.getAttribute("aria-valuenow")).toBe("2");
    expect(bar.getAttribute("aria-valuemax")).toBe("5");
    expect(screen.getByRole("status").textContent).toBe("Папок проверено: 2 из 5");
  });
});
