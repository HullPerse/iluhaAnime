import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import StreamEpisodes, { previewPosition } from "@/routes/components/stream/episodes.stream";
import { patchSettings } from "@/store/settings.store";
import type { StreamingEpisode } from "@/types/stream";

vi.mock("@/hooks/remoteImage.hook", () => ({
  useStreamCover: (url: string | null | undefined) => (url ? `asset://${url}` : null),
  resetRemoteImageCache: () => undefined,
}));

const EPISODES: StreamingEpisode[] = Array.from({ length: 220 }, (_, index) => ({
  id: String(400 + index),
  number: index + 1,
  title: `Episode ${index + 1}`,
  airDate: "2002-10-03T00:00:00",
}));

function renderEpisodes(overrides: Partial<React.ComponentProps<typeof StreamEpisodes>> = {}) {
  return render(
    <StreamEpisodes
      episodes={EPISODES}
      isPending={false}
      error={null}
      selectedId={null}
      onPick={vi.fn()}
      onRetry={vi.fn()}
      {...overrides}
    />
  );
}

beforeEach(() => {
  patchSettings({ language: "en" });
});

afterEach(() => {
  cleanup();
});

describe("episode preview placement", () => {
  const rect = { top: 100, bottom: 120, left: 100, right: 200 };

  it("sits to the left of the row and inside the window", () => {
    expect(previewPosition(rect, { width: 1000, height: 800 })).toEqual({ left: 8, top: 54 });
  });

  it("stays inside the left window edge", () => {
    expect(previewPosition({ ...rect, left: 40 }, { width: 1000, height: 800 })).toEqual({
      left: 8,
      top: 54,
    });
  });

  it("keeps the preview inside the bottom edge", () => {
    expect(
      previewPosition({ ...rect, top: 790, bottom: 810 }, { width: 1000, height: 800 })
    ).toEqual({ left: 8, top: 680 });
  });
});

describe("StreamEpisodes", () => {
  it("renders a 220 episode season as dense rows", () => {
    renderEpisodes();
    expect(screen.getByText("220 episodes")).toBeDefined();
    expect(screen.getByText("Episode 1")).toBeDefined();
    expect(screen.getByText("Episode 220")).toBeDefined();
    expect(screen.getAllByText("2002-10-03")).toHaveLength(EPISODES.length);
  });

  it("filters a long season by number or title", () => {
    renderEpisodes();
    const filter = screen.getByRole("textbox", { name: "Find an episode" });

    fireEvent.change(filter, { target: { value: "100" } });
    expect(screen.getByText("Episode 100")).toBeDefined();
    expect(screen.queryByText("Episode 1")).toBeNull();
  });

  it("marks the chosen episode", () => {
    renderEpisodes({ selectedId: "400" });
    const row = screen.getByText("Episode 1").closest("[aria-current]");
    expect(row?.getAttribute("aria-current")).toBe("true");
  });

  it("reports the picked episode", () => {
    const onPick = vi.fn();
    renderEpisodes({ onPick });
    fireEvent.click(screen.getByText("Episode 7"));
    expect(onPick).toHaveBeenCalledWith(EPISODES[6]);
  });

  it("shows an empty season without crashing", () => {
    renderEpisodes({ episodes: [] });
    expect(screen.getByText("This title has no episodes.")).toBeDefined();
  });

  it("shows the AniList preview while a row is hovered", () => {
    renderEpisodes({ previews: new Map([[7, "https://s4.anilist.co/7.jpg"]]) });
    const row = screen.getByText("Episode 7");

    fireEvent.mouseEnter(row, { clientX: 10, clientY: 10 });

    const popup = screen.getByTestId("episode-preview");
    expect(popup.querySelector("img")?.getAttribute("src")).toBe(
      "asset://https://s4.anilist.co/7.jpg"
    );

    fireEvent.mouseLeave(row);
    expect(screen.queryByTestId("episode-preview")).toBeNull();
  });

  it("shows no preview for an episode without art", () => {
    renderEpisodes({ previews: new Map([[7, "https://s4.anilist.co/7.jpg"]]) });

    fireEvent.mouseEnter(screen.getByText("Episode 8"), { clientX: 10, clientY: 10 });

    expect(screen.queryByTestId("episode-preview")).toBeNull();
  });

  it("shows a failed episode request with a retry", () => {
    const onRetry = vi.fn();
    renderEpisodes({ error: new Error("episode list failed"), onRetry });

    expect(screen.getByRole("alert")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
