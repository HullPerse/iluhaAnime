import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";

import ProgressBar from "@/components/shared/progress.component";

afterEach(() => {
  cleanup();
});

describe("ProgressBar", () => {
  it("exposes the progressbar role with clamped values", () => {
    render(<ProgressBar value={15} max={10} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("10");
    expect(bar.getAttribute("aria-valuenow")).toBe("10");
  });

  it("clamps a negative value to zero", () => {
    render(<ProgressBar value={-5} max={10} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
  });

  it("renders a zero-width fill when max is zero, without NaN", () => {
    const { container } = render(<ProgressBar value={5} max={0} />);
    const fill = container.querySelector<HTMLElement>(".progress-blocks");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
    expect(fill?.style.width).toBe("0%");
  });

  it("sizes the fill from value over max", () => {
    const { container } = render(<ProgressBar value={25} max={100} />);
    expect(container.querySelector<HTMLElement>(".progress-blocks")?.style.width).toBe("25%");
  });

  it("renders a sunken track and a block-masked fill", () => {
    const { container } = render(<ProgressBar value={1} max={2} />);
    const track = screen.getByRole("progressbar");
    expect(track.className).toContain("windows95-active-border");
    expect(container.querySelector(".progress-blocks")?.className).toContain("progress-blocks");
  });

  it("uses bg-secondary as the fill colour when no barClassName is given", () => {
    const { container } = render(<ProgressBar value={1} max={2} />);
    expect(container.querySelector(".progress-blocks")?.className).toContain("bg-secondary");
  });

  it("overrides the fill colour with barClassName", () => {
    const { container } = render(<ProgressBar value={1} max={2} barClassName="bg-highlight" />);
    const fill = container.querySelector(".progress-blocks");
    expect(fill?.className).toContain("bg-highlight");
    expect(fill?.className).not.toContain("bg-secondary");
  });

  it("merges a custom container className over the defaults", () => {
    render(<ProgressBar value={1} max={2} className="h-3 w-16" />);
    expect(screen.getByRole("progressbar").className).toContain("h-3");
  });

  it("renders an indeterminate sweep with no value attributes", () => {
    const { container } = render(<ProgressBar value={0} max={0} indeterminate />);
    const track = screen.getByRole("progressbar");
    expect(track.hasAttribute("aria-valuenow")).toBe(false);
    const chunk = container.querySelector<HTMLElement>(".progress-blocks");
    expect(chunk?.className).toContain("animate-indeterminate");
    expect(chunk?.className).toContain("w-[40%]");
    expect(chunk?.style.width).toBe("");
  });

  it("applies barClassName to the indeterminate chunk", () => {
    const { container } = render(
      <ProgressBar value={0} max={0} indeterminate barClassName="bg-torrent-initializing" />
    );
    const chunk = container.querySelector<HTMLElement>(".progress-blocks");
    expect(chunk?.className).toContain("bg-torrent-initializing");
    expect(chunk?.className).not.toContain("bg-secondary");
  });
});

describe("ProgressBar slots mode", () => {
  function slotCells(): Element[] {
    return Array.from(screen.getByRole("progressbar").children);
  }

  it("renders a fixed 12 cells with one cell per episode at max 12", () => {
    render(<ProgressBar value={5} max={12} slots />);
    const cells = slotCells();
    expect(cells).toHaveLength(12);
    expect(cells.slice(0, 5).every((cell) => cell.className.includes("bg-secondary"))).toBe(true);
    expect(cells.slice(5).every((cell) => cell.className.includes("bg-surface"))).toBe(true);
  });

  it("caps the cell count and scales the filled count for long totals", () => {
    render(<ProgressBar value={100} max={500} slots />);
    const cells = slotCells();
    expect(cells).toHaveLength(12);
    expect(cells.slice(0, 2).every((cell) => cell.className.includes("bg-secondary"))).toBe(true);
    expect(cells.slice(2).every((cell) => cell.className.includes("bg-surface"))).toBe(true);
  });

  it("maps a short total onto the fixed 12 cells", () => {
    render(<ProgressBar value={3} max={6} slots />);
    const cells = slotCells();
    expect(cells).toHaveLength(12);
    expect(cells.slice(0, 6).every((cell) => cell.className.includes("bg-secondary"))).toBe(true);
    expect(cells.slice(6).every((cell) => cell.className.includes("bg-surface"))).toBe(true);
  });

  it("does not show full before the last episode", () => {
    render(<ProgressBar value={23} max={24} slots />);
    const cells = slotCells();
    expect(cells).toHaveLength(12);
    expect(cells[11]?.className).toContain("bg-surface");
  });

  it("applies barClassName to the filled slots only", () => {
    render(<ProgressBar value={1} max={4} slots barClassName="bg-accent" />);
    const cells = slotCells();
    expect(cells).toHaveLength(12);
    expect(cells[2]?.className).toContain("bg-accent");
    expect(cells[3]?.className).toContain("bg-surface");
  });

  it("keeps the progressbar aria attributes in slots mode", () => {
    render(<ProgressBar value={3} max={12} slots ariaLabel="episodes" />);
    const track = screen.getByRole("progressbar");
    expect(track.getAttribute("aria-label")).toBe("episodes");
    expect(track.getAttribute("aria-valuemax")).toBe("12");
    expect(track.getAttribute("aria-valuenow")).toBe("3");
  });

  it("fills every cell when the clamped value reaches max", () => {
    render(<ProgressBar value={99} max={12} slots />);
    expect(slotCells().every((cell) => cell.className.includes("bg-secondary"))).toBe(true);
  });

  it("falls back to the percentage bar when max is zero", () => {
    const { container } = render(<ProgressBar value={0} max={0} slots />);
    expect(container.querySelector<HTMLElement>(".progress-blocks")?.style.width).toBe("0%");
  });

  it("lets indeterminate win over slots", () => {
    const { container } = render(<ProgressBar value={5} max={12} indeterminate slots />);
    expect(container.querySelector<HTMLElement>(".progress-blocks")?.className).toContain(
      "animate-indeterminate"
    );
  });
});
