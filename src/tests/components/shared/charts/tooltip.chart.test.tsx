import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SvgChartTooltip, tooltipAnnouncement } from "@/components/shared/charts/tooltip.chart";
import { truncateLabel } from "@/components/shared/charts/ticks.chart";

const DATA = {
  title: "Drama",
  rows: [
    { label: "Titles", value: "90" },
    { label: "Mean score", value: "7.9" },
  ],
};

const PLOT = { left: 0, top: 0, width: 400, height: 200 };

afterEach(cleanup);

describe("SvgChartTooltip", () => {
  it("renders the title and every row inside a foreignObject", () => {
    const { container } = render(
      <svg width={400} height={200}>
        <SvgChartTooltip x={200} y={120} data={DATA} plot={PLOT} />
      </svg>
    );

    expect(screen.getByText("Drama")).toBeDefined();
    expect(screen.getByText("Titles")).toBeDefined();
    expect(screen.getByText("90")).toBeDefined();
    expect(screen.getByText("Mean score")).toBeDefined();
    expect(screen.getByText("7.9")).toBeDefined();
    expect(container.querySelector("foreignObject")).not.toBeNull();
    expect(container.querySelector("[aria-hidden='true']")).not.toBeNull();
  });

  it("places the tooltip above or below the anchor", () => {
    const { container: above } = render(
      <svg width={400} height={200}>
        <SvgChartTooltip x={200} y={120} data={DATA} plot={PLOT} />
      </svg>
    );
    const aboveY = Number(above.querySelector("foreignObject")?.getAttribute("y"));
    cleanup();

    const { container: below } = render(
      <svg width={400} height={200}>
        <SvgChartTooltip x={200} y={120} data={DATA} plot={PLOT} placement="below" />
      </svg>
    );
    const belowY = Number(below.querySelector("foreignObject")?.getAttribute("y"));

    expect(aboveY).toBeLessThan(120);
    expect(belowY).toBeGreaterThan(120);
  });

  it("keeps the tooltip inside a narrow plot", () => {
    const { container } = render(
      <svg width={120} height={200}>
        <SvgChartTooltip
          x={400}
          y={50}
          data={DATA}
          plot={{ left: 10, top: 0, width: 100, height: 200 }}
        />
      </svg>
    );
    expect(container.querySelector("foreignObject")?.getAttribute("x")).toBe("10");
  });
});

describe("tooltipAnnouncement", () => {
  it("joins the title and the rows for the live region", () => {
    expect(
      tooltipAnnouncement({
        title: "2019",
        rows: [
          { label: "Titles", value: "31" },
          { label: "Hours", value: "160" },
        ],
      })
    ).toBe("2019: Titles 31, Hours 160");
    expect(tooltipAnnouncement({ title: "Only title", rows: [] })).toBe("Only title");
  });
});

describe("truncateLabel", () => {
  it("keeps short labels and cuts long ones", () => {
    expect(truncateLabel("TV", 10)).toBe("TV");
    expect(truncateLabel("A very long label", 10)).toBe("A very ...");
    expect(truncateLabel("abcdef", 3)).toBe("abc");
  });
});
