import { useRef } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { usePlayerLoupe } from "@/hooks/player/loupe.hook";
import type { PlayerSettings } from "@/types/player/videoPlayer";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

function Video({ mode, enabled = true }: { mode: PlayerSettings["loupeMode"]; enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  usePlayerLoupe(ref, enabled, mode);

  return <div ref={ref} data-testid="video" />;
}

const moveOver = (video: HTMLElement, x: number, y: number, altKey = false) => {
  fireEvent(
    video,
    new MouseEvent("pointermove", { bubbles: true, altKey, clientX: x, clientY: y })
  );
};

const expectMode = (mode: string) => {
  return waitFor(() => {
    expect(invoke).toHaveBeenCalledWith("player_loupe", {
      update: expect.objectContaining({ mode }),
    });
  });
};

beforeEach(() => {
  invoke.mockImplementation(async (command: string) => {
    return command === "player_loupe_bounds" ? [0, 0.1, 1, 0.9] : true;
  });
});

afterEach(() => {
  cleanup();
  invoke.mockReset();
});

it.each([
  ["native", "hidenative"],
  ["shader", "hideshader"],
] as const)(
  "shows %s when Alt is held over video, consumes Alt+wheel and hides on release",
  async (mode, hide) => {
    render(<Video mode={mode} />);
    const video = screen.getByTestId("video");
    moveOver(video, window.innerWidth / 2, window.innerHeight / 2);
    expect(invoke).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Alt" });
    await expectMode(mode);
    const wheel = new WheelEvent("wheel", {
      deltaY: -100,
      bubbles: true,
      cancelable: true,
      altKey: true,
    });
    fireEvent(video, wheel);
    expect(wheel.defaultPrevented).toBe(true);
    await waitFor(() => {
      expect(invoke).toHaveBeenLastCalledWith("player_loupe", {
        update: { mode, frame: { bounds: [0, 0.1, 1, 0.9], point: [0.5, 0.5], zoom: 2.5 } },
      });
    });
    fireEvent.keyUp(window, { key: "Alt" });
    await expectMode(hide);
  }
);

it("waits for the active update and hides the previous renderer when switching modes", async () => {
  let complete: ((visible: boolean) => void) | undefined;
  const rendering = new Promise<boolean>((resolve) => {
    complete = resolve;
  });
  invoke.mockImplementation(async (command: string, args?: { update: { mode: string } }) => {
    if (command === "player_loupe_bounds") return [0, 0.1, 1, 0.9];

    if (args?.update.mode === "native") return rendering;

    return true;
  });
  const { rerender } = render(<Video mode="native" />);
  const video = screen.getByTestId("video");
  moveOver(video, window.innerWidth / 2, window.innerHeight / 2, true);
  await expectMode("native");
  rerender(<Video mode="shader" />);
  moveOver(video, window.innerWidth / 2, window.innerHeight / 2, true);
  complete?.(true);
  await expectMode("shader");
  expect(
    invoke.mock.calls
      .filter(([command]) => command === "player_loupe")
      .map(([, args]) => args.update.mode)
  ).toEqual(["native", "hidenative", "shader"]);
  fireEvent.blur(window);
  await expectMode("hideshader");
});

it("keeps the loupe outside the black bars and suppresses it when controls are unavailable", async () => {
  const { rerender } = render(<Video mode="native" />);
  const video = screen.getByTestId("video");
  moveOver(video, window.innerWidth / 2, 1, true);
  await waitFor(() => expect(invoke).toHaveBeenCalledWith("player_loupe_bounds", undefined));
  expect(invoke).toHaveBeenCalledTimes(1);
  rerender(<Video mode="native" enabled={false} />);
  moveOver(video, window.innerWidth / 2, window.innerHeight / 2, true);
  expect(invoke).toHaveBeenCalledTimes(1);
});
