import { render, screen, cleanup } from "@testing-library/react";
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";

import ProgressBar from "@/components/shared/progress.component";

afterEach(cleanup);

describe("ProgressBar", () => {
  it("exposes value via ARIA attributes", () => {
    render(<ProgressBar value={50} max={100} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
    expect(bar.getAttribute("aria-valuenow")).toBe("50");
  });

  it("fills the bar proportionally", () => {
    const { container } = render(<ProgressBar value={25} max={100} />);
    const fill = container.querySelector('[aria-hidden="true"]');
    expect(fill?.getAttribute("style")).toContain("width: 25%");
  });

  it("clamps values above the maximum", () => {
    const { container } = render(<ProgressBar value={150} max={100} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("100");
    expect(
      container.querySelector('[aria-hidden="true"]')?.getAttribute("style")
    ).toContain("width: 100%");
  });

  it("clamps negative values to zero", () => {
    const { container } = render(<ProgressBar value={-10} max={100} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("0");
    expect(
      container.querySelector('[aria-hidden="true"]')?.getAttribute("style")
    ).toContain("width: 0%");
  });

  it("renders an empty bar when max is zero", () => {
    const { container } = render(<ProgressBar value={10} max={0} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("0");
    expect(
      container.querySelector('[aria-hidden="true"]')?.getAttribute("style")
    ).toContain("width: 0%");
  });
});
