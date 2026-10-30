import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ColumnChart } from "@/components/shared/charts/column.chart";

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
  { key: "2021", label: "2021", value: 2 },
  { key: "2022", label: "2022", value: 4 },
  { key: "2023", label: "2023", value: 8 },
];

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect(640, 200));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const renderColumns = ({
  onActivate = vi.fn(),
  withReference = false,
}: {
  onActivate?: (index: number) => void;
  withReference?: boolean;
} = {}) => {
  render(
    <ColumnChart
      data={DATA}
      ariaLabel="Watched by year"
      formatValue={String}
      tooltip={(datum) => ({
        title: datum.label,
        rows: [{ label: "Titles", value: String(datum.value) }],
      })}
      onActivate={onActivate}
      reference={withReference ? { value: 1.5, label: "mean" } : undefined}
      band={withReference ? { from: 0.5, to: 2.5 } : undefined}
      xDomain={[0, 3]}
    />
  );
  return onActivate;
};

describe("ColumnChart", () => {
  it("renders value ticks and category labels", async () => {
    renderColumns();

    await waitFor(() => expect(screen.getByText("2021")).toBeDefined());
    expect(screen.getByText("2022")).toBeDefined();
    expect(screen.getByText("2023")).toBeDefined();
    expect(screen.getByText("0")).toBeDefined();
    expect(screen.getByText("8")).toBeDefined();
  });

  it("draws the mean line and the sigma band", async () => {
    renderColumns({ withReference: true });

    await waitFor(() => expect(screen.getByText("mean")).toBeDefined());
    expect(document.querySelector('line[stroke-dasharray="3 2"]')).not.toBeNull();
    expect(document.querySelector('rect[fill-opacity="0.1"]')).not.toBeNull();
  });

  it("moves with arrow keys and announces the active year", async () => {
    renderColumns();
    const group = screen.getByRole("application", { name: "Watched by year" });
    fireEvent.focus(group);

    expect(screen.getByText("2021: Titles 2")).toBeDefined();
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(screen.getByText("2022: Titles 4")).toBeDefined();
  });

  it("activates the active column on Enter", async () => {
    const onActivate = renderColumns();
    const group = screen.getByRole("application", { name: "Watched by year" });
    fireEvent.focus(group);
    fireEvent.keyDown(group, { key: "End" });
    fireEvent.keyDown(group, { key: "Enter" });
    expect(onActivate).toHaveBeenCalledWith(2);
  });

  it("maps the pointer to the nearest column", async () => {
    renderColumns();
    await waitFor(() => expect(document.querySelector('rect[fill="transparent"]')).not.toBeNull());
    const overlay = document.querySelector('rect[fill="transparent"]') as SVGRectElement;
    vi.spyOn(overlay, "getBoundingClientRect").mockReturnValue(rect(604, 150));

    fireEvent.pointerMove(overlay, { clientX: 300 });
    expect(screen.getByText(/Titles 4/)).toBeDefined();
  });
});
