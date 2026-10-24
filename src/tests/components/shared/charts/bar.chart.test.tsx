import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BarChart } from "@/components/shared/charts/bar.chart";

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

const DATA = [
  { key: "a", label: "Alpha", value: 10 },
  { key: "b", label: "A very long label that truncates", value: 5 },
];

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect(640, 200));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderBars(onActivate = vi.fn()) {
  render(
    <BarChart
      data={DATA}
      ariaLabel="Genres"
      formatValue={(value) => `${value} titles`}
      tooltip={(datum) => ({ title: datum.label, rows: [{ label: "Titles", value: String(datum.value) }] })}
      onActivate={onActivate}
    />
  );
  return onActivate;
}

describe("BarChart", () => {
  it("renders one label and one value per row and truncates long labels", async () => {
    renderBars();

    await waitFor(() => expect(screen.getByText("Alpha")).toBeDefined());
    expect(screen.getByText("10 titles")).toBeDefined();
    expect(screen.getByText("5 titles")).toBeDefined();
    const truncated = screen.getByText(/\.\.\.$/);
    expect(truncated.textContent).toBe("A very long l...");
  });

  it("moves the cursor with the keyboard and announces the tooltip", async () => {
    renderBars();
    const group = screen.getByRole("application", { name: "Genres" });
    fireEvent.focus(group);

    expect(screen.getByText("Alpha: Titles 10")).toBeDefined();
    fireEvent.keyDown(group, { key: "ArrowDown" });
    expect(screen.getByText("A very long label that truncates: Titles 5")).toBeDefined();
  });

  it("activates the selected row on Enter", async () => {
    const onActivate = renderBars();
    const group = screen.getByRole("application", { name: "Genres" });
    fireEvent.focus(group);
    fireEvent.keyDown(group, { key: "End" });
    fireEvent.keyDown(group, { key: "Enter" });
    expect(onActivate).toHaveBeenCalledWith(1);
  });

  it("selects a row from the pointer position and activates it on click", async () => {
    const onActivate = renderBars();
    await waitFor(() => expect(document.querySelectorAll("rect").length).toBeGreaterThan(2));
    const overlay = document.querySelector('rect[fill="transparent"]') as SVGRectElement;
    vi.spyOn(overlay, "getBoundingClientRect").mockReturnValue(rect(492, 44));

    fireEvent.pointerMove(overlay, { clientY: 40 });
    expect(screen.getByText(/Titles 5/)).toBeDefined();
    fireEvent.click(overlay);

    expect(onActivate).toHaveBeenCalledWith(1);
  });

  it("shows the empty label instead of a plot", () => {
    render(
      <BarChart
        data={[]}
        ariaLabel="Empty genres"
        formatValue={String}
        emptyLabel="No data yet"
      />
    );

    expect(screen.getByText("No data yet")).toBeDefined();
    expect(document.querySelector("svg")).toBeNull();
  });
});
