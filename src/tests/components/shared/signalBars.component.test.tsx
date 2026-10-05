import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SignalBars } from "@/components/shared/signalBars.component";
import { useSettingsStore } from "@/store/settings.store";

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

afterEach(() => {
  cleanup();
});

describe("SignalBars", () => {
  it("swaps the bars for a spinner while a probe runs", () => {
    render(<SignalBars checking rttMs={25} />);
    expect(screen.getByRole("status", { name: "Checking…" })).toBeTruthy();
  });

  it("shows no ping data before the first probe", () => {
    render(<SignalBars checking={false} rttMs={null} />);
    const meter = screen.getByRole("status", { name: "No ping data" });
    expect(meter.querySelectorAll("span").length).toBe(5);
    expect(meter.getAttribute("title")).toBe("No ping data");
  });

  it("names the measured RTT in the tooltip", () => {
    render(<SignalBars checking={false} rttMs={27.4} />);
    const meter = screen.getByRole("status", { name: "27 ms" });
    expect(meter.getAttribute("title")).toBe("27 ms");
  });

  it("fills the bars from the left and leaves the rest empty", () => {
    const { container } = render(<SignalBars checking={false} rttMs={45} />);
    const bars = Array.from(
      container.querySelectorAll<HTMLElement>('[class*="bg-primary"]')
    );
    const empty = Array.from(
      container.querySelectorAll<HTMLElement>('[class*="bg-secondary"]')
    );
    expect(bars).toHaveLength(4);
    expect(empty).toHaveLength(1);
  });
});
