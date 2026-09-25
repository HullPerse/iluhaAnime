import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AniListLoader from "@/routes/components/anilist/loader.anilist";
import { useSettingsStore } from "@/store/settings.store";

const SLOW_HINT = /a proxy may help/;

beforeEach(() => {
  vi.useFakeTimers();
  useSettingsStore.setState({ language: "en" });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function advance(seconds: number) {
  await vi.advanceTimersByTimeAsync(seconds * 1000);
}

describe("AniListLoader", () => {
  it("shows elapsed seconds without the proxy hint while fast", async () => {
    render(<AniListLoader />);
    expect(screen.getByText("0 sec")).not.toBeNull();
    expect(screen.queryByText(SLOW_HINT)).toBeNull();
    await advance(9);
    expect(screen.getByText("9 sec")).not.toBeNull();
    expect(screen.queryByText(SLOW_HINT)).toBeNull();
  });

  it("shows the proxy hint once loading passes the slow threshold", async () => {
    render(<AniListLoader />);
    await advance(10);
    expect(screen.getByText("10 sec")).not.toBeNull();
    expect(screen.getByText(SLOW_HINT)).not.toBeNull();
  });
});
