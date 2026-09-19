import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { HostStatsBars } from "@/components/shared/hostStats.component";
import { useSettingsStore } from "@/store/settings.store";
import type { HostStats } from "@/types/ipc";

const GIB = 1024 * 1024 * 1024;

function stats(overrides: Partial<HostStats> = {}): HostStats {
  return {
    cpuUsage: 10,
    memoryUsed: GIB,
    memoryTotal: 2 * GIB,
    netRxBps: 0,
    netTxBps: 0,
    ...overrides,
  };
}

function barFill(index: number): string {
  return screen.getAllByRole("progressbar")[index].querySelector("div")?.className ?? "";
}

beforeEach(() => {
  useSettingsStore.setState({ language: "ru" });
});

afterEach(cleanup);

describe("HostStatsBars", () => {
  it("renders nothing while the stats are unavailable", () => {
    const { container } = render(<HostStatsBars stats={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows CPU against its own ceiling and memory against the total", () => {
    render(
      <HostStatsBars
        stats={stats({ cpuUsage: 42, memoryUsed: GIB, memoryTotal: 4 * GIB, netRxBps: 1024 })}
      />
    );
    const bars = screen.getAllByRole("progressbar");
    expect(bars).toHaveLength(3);
    expect(bars[0].getAttribute("aria-valuenow")).toBe("42");
    expect(bars[0].getAttribute("aria-valuemax")).toBe("100");
    expect(bars[1].getAttribute("aria-valuenow")).toBe(String(GIB));
    expect(bars[1].getAttribute("aria-valuemax")).toBe(String(4 * GIB));
    expect(screen.getByText("Сеть")).toBeDefined();
    expect(screen.getByText("42%")).toBeDefined();
  });

  it("scales the network bar to the highest throughput seen", () => {
    const { rerender } = render(<HostStatsBars stats={stats({ netRxBps: 1024 })} />);
    const networkBar = () => screen.getAllByRole("progressbar")[2];
    expect(networkBar().getAttribute("aria-valuemax")).toBe("1024");

    rerender(<HostStatsBars stats={stats({ netRxBps: 4096 })} />);
    expect(networkBar().getAttribute("aria-valuenow")).toBe("4096");
    expect(networkBar().getAttribute("aria-valuemax")).toBe("4096");

    rerender(<HostStatsBars stats={stats({ netRxBps: 512, netTxBps: 512 })} />);
    expect(networkBar().getAttribute("aria-valuenow")).toBe("1024");
    expect(networkBar().getAttribute("aria-valuemax")).toBe("4096");
  });

  it("colours CPU and memory by load thresholds", () => {
    render(<HostStatsBars stats={stats({ cpuUsage: 50 })} />);
    expect(barFill(0)).toContain("bg-highlight");

    cleanup();
    render(<HostStatsBars stats={stats({ cpuUsage: 85, memoryTotal: GIB })} />);
    expect(barFill(0)).toContain("bg-orange-500");

    cleanup();
    render(<HostStatsBars stats={stats({ cpuUsage: 97, memoryUsed: GIB, memoryTotal: GIB })} />);
    expect(barFill(0)).toContain("bg-destructive");
    expect(barFill(1)).toContain("bg-destructive");
  });
});
