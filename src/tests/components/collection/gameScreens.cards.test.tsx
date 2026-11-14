import { render, screen } from "@testing-library/react";
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
  themeTitle: "Guren no Yumiya",
  hints: [{ slot: 0, hintKind: "year", hintValue: "2013" }],
  result: null,
};

describe("daily game screens", () => {
  it("renders the frames screen with search and skip controls", () => {
    render(<GameFrames day={day} initial={framesView} onClose={() => {}} />);

    expect(screen.getByPlaceholderText("Anime title")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skip" })).toBeTruthy();
    expect(screen.getByText("Round 2 / 6")).toBeTruthy();
  });

  it("renders the opening screen with the clip player and search", () => {
    render(<GameOp day={day} initial={opView} onClose={() => {}} />);

    expect(screen.getByTestId("clip-player")).toBeTruthy();
    expect(screen.getByPlaceholderText("Anime title")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skip" })).toBeTruthy();
  });

  it("renders the audio screen with the first audio-only stage", () => {
    render(
      <GameAudio
        day={day}
        initial={{ ...opView, mode: "audio", maxAttempts: 3 }}
        onClose={() => {}}
      />
    );

    expect(screen.getByTestId("clip-player")).toBeTruthy();
    expect(screen.getByText("Audio only")).toBeTruthy();
    expect(screen.getByPlaceholderText("Anime title")).toBeTruthy();
  });
});
