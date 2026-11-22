import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import ProgressBar from "@/components/shared/progress.component";
import { settingsAtoms } from "@/store/settings.store";

afterEach(() => {
  settingsAtoms.progressStyle.set("blocks");
  cleanup();
});

describe("ProgressBar", () => {
  it("clamps values into the progressbar range", () => {
    render(<ProgressBar value={15} max={10} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("10");
    expect(bar.getAttribute("aria-valuenow")).toBe("10");
    cleanup();

    render(<ProgressBar value={-5} max={10} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
  });

  it("renders a zero-width fill when max is zero", () => {
    const { container } = render(<ProgressBar value={5} max={0} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
    expect(container.querySelector<HTMLElement>(".progress-blocks")?.style.width).toBe("0%");
  });

  it("sizes the fill from value over max", () => {
    const { container } = render(<ProgressBar value={25} max={100} />);
    expect(container.querySelector<HTMLElement>(".progress-blocks")?.style.width).toBe("25%");
  });

  it("renders an indeterminate sweep without value attributes", () => {
    const { container } = render(<ProgressBar value={0} max={0} indeterminate />);
    const track = screen.getByRole("progressbar");
    expect(track.hasAttribute("aria-valuenow")).toBe(false);
    expect(container.querySelector<HTMLElement>(".progress-blocks")?.className).toContain(
      "animate-indeterminate"
    );
  });

  it("maps slots to twelve cells and never shows full before max", () => {
    render(<ProgressBar value={23} max={24} slots />);
    const cells = Array.from(screen.getByRole("progressbar").children);
    expect(cells).toHaveLength(12);
    expect(cells[11]?.className).toContain("bg-surface");
    cleanup();

    render(<ProgressBar value={99} max={12} slots />);
    expect(
      Array.from(screen.getByRole("progressbar").children).every((cell) =>
        cell.className.includes("bg-progress-main")
      )
    ).toBe(true);
  });

  it("lets solid style render a single percentage fill", () => {
    settingsAtoms.progressStyle.set("solid");
    const { container } = render(<ProgressBar value={6} max={12} slots />);
    expect(screen.getByRole("progressbar").children).toHaveLength(1);
    expect(container.querySelector<HTMLElement>("[aria-hidden='true']")?.style.width).toBe("50%");
  });
});
