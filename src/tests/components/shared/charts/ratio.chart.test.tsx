import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RatioChart } from "@/components/shared/charts/ratio.chart";

const rect = (width: number, height: number): DOMRect => {
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
};

const DATA = [
  { key: "tv", label: "TV", value: 10 },
  { key: "movie", label: "Movie", value: 20 },
  { key: "ova", label: "OVA", value: 30 },
];

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect(640, 200));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const renderRatio = (onActivate = vi.fn()) => {
  render(
    <RatioChart
      data={DATA}
      ariaLabel="Formats"
      formatValue={(value) => `${value} titles`}
      tooltip={(datum) => ({
        title: datum.label,
        rows: [{ label: "Titles", value: String(datum.value) }],
      })}
      onActivate={onActivate}
    />
  );
  return onActivate;
};

describe("RatioChart", () => {
  it("fills the plot and lists every part in the legend", async () => {
    renderRatio();

    await waitFor(() => expect(screen.getByText("TV")).toBeDefined());
    expect(screen.getByText("Movie")).toBeDefined();
    expect(screen.getByText("OVA")).toBeDefined();
    expect(screen.getByText("10 titles")).toBeDefined();

    const segments = document.querySelectorAll('rect[stroke="var(--color-field)"]');
    expect(segments).toHaveLength(3);
    const widths = [...segments].map((segment) => Number(segment.getAttribute("width")));
    expect(widths.reduce((sum, width) => sum + width, 0)).toBe(640);
    expect(widths).toEqual([107, 213, 320]);
  });

  it("moves across parts with the keyboard and announces the tooltip", async () => {
    renderRatio();
    const group = screen.getByRole("application", { name: "Formats" });
    fireEvent.focus(group);

    expect(screen.getByText("TV: Titles 10")).toBeDefined();
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(screen.getByText("Movie: Titles 20")).toBeDefined();
  });

  it("activates a part on Enter", async () => {
    const onActivate = renderRatio();
    const group = screen.getByRole("application", { name: "Formats" });
    fireEvent.focus(group);
    fireEvent.keyDown(group, { key: "End" });
    fireEvent.keyDown(group, { key: "Enter" });
    expect(onActivate).toHaveBeenCalledWith(2);
  });

  it("selects the part under the pointer and activates it on click", async () => {
    const onActivate = renderRatio();
    await waitFor(() => expect(document.querySelector('rect[fill="transparent"]')).not.toBeNull());
    const overlay = document.querySelector('rect[fill="transparent"]') as SVGRectElement;
    vi.spyOn(overlay, "getBoundingClientRect").mockReturnValue(rect(640, 22));

    fireEvent.pointerMove(overlay, { clientX: 600 });
    expect(screen.getByText(/Titles 30/)).toBeDefined();
    fireEvent.click(overlay);
    expect(onActivate).toHaveBeenCalledWith(2);
  });

  it("shows the empty label instead of a strip", () => {
    render(
      <RatioChart
        data={[]}
        ariaLabel="Empty formats"
        formatValue={String}
        emptyLabel="Nothing yet"
      />
    );

    expect(screen.getByText("Nothing yet")).toBeDefined();
    expect(document.querySelector("svg")).toBeNull();
  });
});
