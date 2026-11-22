import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FramePips } from "@/routes/components/collection/gameFrames.cards";
import type { DailyResultView } from "@/types/api/daily";

function result(overrides: Partial<DailyResultView> = {}): DailyResultView {
  return {
    won: true,
    attempts: 2,
    rewardPackId: "daily-2026-11-14-audio",
    answer: {
      mediaId: 1,
      title: "Test anime",
      year: null,
      format: null,
      episodes: null,
      genres: [],
      studio: null,
      score: null,
      source: null,
    },
    ...overrides,
  };
}

describe("FramePips", () => {
  it("opens reached stages, blocks future ones and renders static pips after the result", () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <FramePips attempts={1} result={null} total={3} onSelect={onSelect} />
    );

    const first = screen.getByRole("button", { name: "Открыть кадр 1" });
    const second = screen.getByRole("button", { name: "Открыть кадр 2" });
    const third = screen.getByRole("button", { name: "Открыть кадр 3" });

    expect((first as HTMLButtonElement).disabled).toBe(false);
    expect((second as HTMLButtonElement).disabled).toBe(false);
    expect((third as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(second);
    expect(onSelect).toHaveBeenCalledWith(1);

    fireEvent.click(third);
    expect(onSelect).toHaveBeenCalledTimes(1);

    rerender(<FramePips attempts={2} result={result()} total={3} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
