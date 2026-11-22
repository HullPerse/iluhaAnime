import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import GameCards from "@/routes/components/collection/game.cards";
import { mockListen } from "@/tests/mocks";

vi.mock("@/hooks/daily/day.hook", () => ({
  useDailyGameDay: () => "2026-11-14",
}));

vi.mock("@/hooks/daily/queries.hook", () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false, error: null });

  return {
    useDailyGame: () => ({
      data: {
        day: "2026-11-14",
        streak: 1,
        modes: [
          {
            mode: "frames",
            state: "ready",
            attempts: 0,
            maxAttempts: 6,
            error: null,
            result: null,
          },
          {
            mode: "op",
            state: "ready",
            attempts: 0,
            maxAttempts: 5,
            error: null,
            result: null,
          },
          {
            mode: "audio",
            state: "ready",
            attempts: 0,
            maxAttempts: 3,
            error: null,
            result: null,
          },
        ],
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    }),
    usePrepareDailyGame: mutation,
    usePrepareDailyOp: mutation,
    usePrepareDailyAudio: mutation,
    useWarmDailyOp: () => ({ mutate: vi.fn(), isPending: true }),
    useWarmDailyAudio: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

describe("daily clip progress", () => {
  it("shows the event progress on the matching mode card", async () => {
    let handler: ((event: { payload: unknown }) => void) | undefined;
    mockListen.mockImplementation((_event, callback) => {
      handler = callback;

      return Promise.resolve(() => undefined);
    });

    render(<GameCards />);

    expect(await screen.findByText("iluhaGuesser")).toBeTruthy();
    await waitFor(() =>
      expect(mockListen).toHaveBeenCalledWith("daily-clip-progress", expect.any(Function))
    );

    act(() => {
      handler?.({
        payload: { day: "2026-11-14", mode: "op", received: 50, total: 100 },
      });
    });

    expect(screen.getByText("50%")).toBeTruthy();
  });
});
