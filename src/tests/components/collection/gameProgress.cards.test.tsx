import { act, render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import GameCards from "@/routes/components/collection/game.cards";
import { mockListen } from "@/tests/mocks";

const warmMocks = vi.hoisted(() => ({ audio: vi.fn(), op: vi.fn() }));

vi.mock("@/hooks/daily/characters.hook", () => ({
  useCharacters: () => ({ game: { data: undefined } }),
}));

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
    useWarmDailyOp: () => ({ mutate: warmMocks.op, isPending: true }),
    useWarmDailyAudio: () => ({ mutate: warmMocks.audio, isPending: false }),
  };
});

beforeEach(() => {
  warmMocks.audio.mockClear();
  warmMocks.op.mockClear();
  mockListen.mockReset();
  mockListen.mockResolvedValue(() => undefined);
});

describe("daily clip progress", () => {
  it("places characters after the three video modes without a duplicate title", () => {
    render(<GameCards />);
    const titles = screen
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
    expect(titles).toEqual(["Кадры", "Опенинг", "На слух", "Персонажи"]);
    expect(screen.queryByText("iluhaGuesser")).toBeNull();
  });
  it("opens characters as its own screen and restores modes on back", () => {
    render(<GameCards />);
    const heading = screen.getByRole("heading", { name: "Персонажи" });
    const card = heading.closest("article");

    if (!card) throw new Error("character mode card missing");
    fireEvent.click(within(card).getByRole("button"));
    expect(screen.queryByRole("heading", { name: "Кадры" })).toBeNull();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("heading", { name: "Кадры" })).toBeTruthy();
  });
  it("warms both opening clips when the tab opens", async () => {
    render(<GameCards />);

    expect(await screen.findByRole("heading", { name: "Кадры" })).toBeTruthy();
    expect(screen.queryByText("iluhaGuesser")).toBeNull();
    await waitFor(() => expect(warmMocks.op).toHaveBeenCalledTimes(1));
    expect(warmMocks.audio).toHaveBeenCalledTimes(1);
  });

  it("shows the event progress on the matching mode card", async () => {
    let handler: ((event: { payload: unknown }) => void) | undefined;
    mockListen.mockImplementation((_event, callback) => {
      handler = callback;

      return Promise.resolve(() => undefined);
    });

    render(<GameCards />);

    expect(await screen.findByRole("heading", { name: "Кадры" })).toBeTruthy();
    expect(screen.queryByText("iluhaGuesser")).toBeNull();
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
