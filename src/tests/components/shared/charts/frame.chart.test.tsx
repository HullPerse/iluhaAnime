import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChartFrame } from "@/components/shared/charts/frame.chart";

function rect(width: number, height: number): DOMRect {
  return {
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect(640, 200));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ChartFrame", () => {
  it("measures the container and hands the plot to its children", async () => {
    render(
      <ChartFrame height={120} ariaLabel="Chart frame" margin={{ left: 20, right: 10 }}>
        {(plot) => <rect data-testid="mark" x={plot.left} y={plot.top} width={plot.width} height={plot.height} />}
      </ChartFrame>
    );

    const mark = await screen.findByTestId("mark");
    expect(mark.getAttribute("x")).toBe("20");
    expect(mark.getAttribute("width")).toBe("610");
    expect(mark.getAttribute("height")).toBe("112");
  });

  it("renders the description and the live announcement", async () => {
    render(
      <ChartFrame
        height={80}
        ariaLabel="Chart frame"
        description="Eight genres by title count"
        announcement="Drama: 90"
      >
        {() => null}
      </ChartFrame>
    );

    expect(await screen.findByText("Eight genres by title count")).toBeDefined();
    expect(screen.getByText("Drama: 90")).toBeDefined();
  });

  it("exposes one focus stop and forwards keys when interactive", async () => {
    const onKeyDown = vi.fn();
    const onFocus = vi.fn();
    render(
      <ChartFrame
        height={80}
        ariaLabel="Interactive chart"
        interactive
        onKeyDown={onKeyDown}
        onFocus={onFocus}
      >
        {() => null}
      </ChartFrame>
    );

    const group = screen.getByRole("application", { name: "Interactive chart" });
    expect(group.tabIndex).toBe(0);
    fireEvent.focus(group);
    expect(onFocus).toHaveBeenCalled();
    fireEvent.keyDown(group, { key: "ArrowDown" });
    expect(onKeyDown).toHaveBeenCalled();
    await waitFor(() => expect(group.querySelector("svg")).not.toBeNull());
  });

  it("stays out of the tab order when not interactive", async () => {
    render(
      <ChartFrame height={80} ariaLabel="Static chart">
        {() => null}
      </ChartFrame>
    );

    const group = screen.getByRole("img", { name: "Static chart" });
    expect(group.hasAttribute("tabindex")).toBe(false);
    await waitFor(() => expect(group.querySelector("svg")).not.toBeNull());
  });

  it("renders no svg before the width is known", () => {
    vi.restoreAllMocks();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect(0, 0));

    render(
      <ChartFrame height={80} ariaLabel="Unmeasured chart">
        {() => <rect data-testid="mark" />}
      </ChartFrame>
    );

    expect(screen.queryByTestId("mark")).toBeNull();
  });
});
