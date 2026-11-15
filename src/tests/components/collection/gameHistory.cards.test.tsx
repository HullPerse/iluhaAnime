import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Result } from "@/routes/components/collection/gameFrames.cards";

vi.mock("@/hooks/daily/queries.hook", () => ({
  useDailyGameHistory: () => ({
    data: [
      {
        day: "2026-11-13",
        mode: "frames",
        won: true,
        attempts: 2,
        maxAttempts: 6,
        mediaId: 16498,
        title: "Shingeki no Kyojin",
        playedAt: 1_760_000_000,
      },
    ],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/appQuery.hook", () => ({
  useAppQuery: () => ({ data: undefined, isPending: false }),
}));

const result = {
  won: true,
  attempts: 2,
  answer: {
    mediaId: 16498,
    title: "Shingeki no Kyojin",
    year: 2013,
    format: "TV",
    episodes: 25,
    genres: ["Action"],
    studio: "Wit Studio",
    score: 85,
    source: "Manga",
  },
  rewardPackId: "daily-2026-11-14-frames",
};

describe("daily result history", () => {
  it("renders the past result rows under the current result", () => {
    render(
      <Result result={result} frame={null} day="2026-11-14" mode="frames" onClose={() => {}} />
    );

    expect(screen.getByRole("heading", { name: "Shingeki no Kyojin" })).toBeTruthy();
    const table = screen.getByRole("table");
    expect(within(table).getByText("13.11")).toBeTruthy();
    expect(within(table).getByText("Кадры")).toBeTruthy();
    expect(within(table).getByText("Shingeki no Kyojin")).toBeTruthy();
    expect(within(table).getByText("Победа")).toBeTruthy();
  });
});
