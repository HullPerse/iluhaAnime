import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import GameAudio from "@/routes/components/collection/gameAudio.cards";
import GameFrames from "@/routes/components/collection/gameFrames.cards";
import GameOp from "@/routes/components/collection/gameOp.cards";

vi.mock("@/routes/components/collection/gameClip.cards", () => ({
  ClipPlayer: ({ cover, badge }: { cover?: ReactNode; badge?: ReactNode }) => (
    <div data-testid="clip-player">
      {cover}
      {badge}
    </div>
  ),
}));

vi.mock("@/hooks/daily/queries.hook", () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false, error: null });

  return {
    useGuessDailyGame: mutation,
    useSkipDailyGame: mutation,
    useRevealDailyFrames: mutation,
    useGuessDailyOp: mutation,
    useSkipDailyOp: mutation,
    useGuessDailyAudio: mutation,
    useSkipDailyAudio: mutation,
    useDailyGameHistory: () => ({
      data: [],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    }),
    useDailySearchIndex: () => ({
      data: [
        {
          mediaId: 16498,
          title: "Shingeki no Kyojin",
          year: 2013,
          format: "TV",
          popularity: 1078603,
        },
      ],
      isPending: false,
      isError: false,
    }),
  };
});

vi.mock("@/hooks/appQuery.hook", () => ({
  useAppQuery: () => ({ data: [], isPending: false }),
}));

const day = "2026-11-14";

const framesView = {
  day,
  mode: "frames" as const,
  attempts: 1,
  maxAttempts: 6,
  revealed: 2,
  frames: [
    {
      slot: 0,
      dataUrl: "data:image/png;base64,AA",
      hintKind: "year",
      hintValue: "2013",
    },
  ],
  result: null,
};

const opView = {
  day,
  mode: "op" as const,
  attempts: 0,
  maxAttempts: 5,
  revealed: 0,
  clipPath: "/clips/clip.mp4",
  fullPath: "/clips/full.mp4",
  startFraction: 0.12,
  themeType: "OP",
  hints: [{ slot: 0, hintKind: "year", hintValue: "2013" }],
  result: null,
};

describe("daily game screens", () => {
  it("selects a local suggestion with the keyboard", async () => {
    render(<GameFrames day={day} initial={framesView} onClose={() => {}} />);
    const input = screen.getByPlaceholderText("Название аниме");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "shingeki" } });
    await waitFor(() => expect(screen.getByRole("option")).toBeTruthy());
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByText("Выбранный ответ")).toBeTruthy();
    expect(screen.getByDisplayValue("Shingeki no Kyojin")).toBeTruthy();
  });

  it("renders search, skip and the mode-specific content on all three screens", () => {
    render(<GameFrames day={day} initial={framesView} onClose={() => {}} />);
    expect(screen.getByPlaceholderText("Название аниме")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Пропустить" })).toBeTruthy();
    expect(screen.getByText("Раунд 2 / 6")).toBeTruthy();
    cleanup();

    render(<GameOp day={day} initial={opView} onClose={() => {}} />);
    expect(screen.getByTestId("clip-player")).toBeTruthy();
    expect(screen.getByPlaceholderText("Название аниме")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Пропустить" })).toBeTruthy();
    cleanup();

    render(
      <GameAudio
        day={day}
        initial={{ ...opView, mode: "audio", maxAttempts: 3 }}
        onClose={() => {}}
      />
    );
    expect(screen.getByTestId("clip-player")).toBeTruthy();
    expect(screen.getByText("Только звук")).toBeTruthy();
    expect(screen.getByPlaceholderText("Название аниме")).toBeTruthy();
  });
});
