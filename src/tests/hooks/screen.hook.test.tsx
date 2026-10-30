import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { usePlayerScreen } from "@/hooks/player/screen.hook";
import { DEFAULT_PLAYER_SETTINGS } from "@/store/player.store";
import type { PlayerSettings } from "@/types/player/videoPlayer";

const mocks = vi.hoisted(() => ({
  runPlayerCommand: vi.fn(async (_name: string, _args: string[]) => undefined),
}));

vi.mock("@/lib/player/playback.utils", () => ({
  playerShaderPath: vi.fn(async (id: string) => `C:/shaders/${id}.glsl`),
  runPlayerCommand: mocks.runPlayerCommand,
}));

function Harness({
  ready,
  settings,
  hasFile = true,
}: {
  ready: boolean;
  settings: PlayerSettings;
  hasFile?: boolean;
}) {
  const cabinet = usePlayerScreen(ready, settings, hasFile);
  return <span>{cabinet ?? "none"}</span>;
}

const TELEVISION: PlayerSettings = {
  ...DEFAULT_PLAYER_SETTINGS,
  playerMode: "tv",
  cabinet: "wood",
};

afterEach(() => {
  cleanup();
  mocks.runPlayerCommand.mockClear();
});

describe("usePlayerScreen", () => {
  it("loads the shader and shows the cabinet in the television mode", async () => {
    render(<Harness ready settings={TELEVISION} />);

    await waitFor(() => {
      expect(mocks.runPlayerCommand).toHaveBeenCalled();
    });
    const calls = mocks.runPlayerCommand.mock.calls;
    expect(calls.some(([name, args]) => name === "set" && args[0] === "glsl-shader-opts")).toBe(
      true
    );
    expect(calls.some(([name, args]) => name === "change-list" && args.includes("append"))).toBe(
      true
    );
    expect(screen.getByText("wood")).toBeTruthy();
  });

  it("re-applies the shader when the curvature changes", async () => {
    const { rerender } = render(<Harness ready settings={TELEVISION} />);
    await waitFor(() => {
      expect(mocks.runPlayerCommand).toHaveBeenCalled();
    });

    rerender(<Harness ready settings={{ ...TELEVISION, crtCurvature: 0.07 }} />);

    await waitFor(() => {
      const opts = mocks.runPlayerCommand.mock.calls
        .map(([, args]) => args)
        .filter((args) => args[0] === "glsl-shader-opts")
        .at(-1);
      expect(opts?.some((arg) => arg.includes("crt-tv/curvature=0.07"))).toBe(true);
    });
  });

  it("keeps the picture shader with the cabinet off", async () => {
    render(<Harness ready settings={{ ...TELEVISION, cabinet: "none" }} />);

    await waitFor(() => {
      expect(mocks.runPlayerCommand).toHaveBeenCalled();
    });
    expect(screen.getByText("none")).toBeTruthy();
  });

  it("draws the cabinet without a shader in the normal mode", async () => {
    render(<Harness ready settings={{ ...DEFAULT_PLAYER_SETTINGS, cabinet: "win95" }} />);

    expect(screen.getByText("win95")).toBeTruthy();
    await Promise.resolve();
    expect(mocks.runPlayerCommand).not.toHaveBeenCalled();
  });

  it("hides the cabinet without a file", async () => {
    render(<Harness ready settings={TELEVISION} hasFile={false} />);

    await waitFor(() => {
      expect(mocks.runPlayerCommand).toHaveBeenCalled();
    });
    expect(screen.getByText("none")).toBeTruthy();
  });

  it("stays idle in the normal mode and before the player is ready", async () => {
    const { rerender } = render(<Harness ready settings={DEFAULT_PLAYER_SETTINGS} />);
    await Promise.resolve();
    expect(mocks.runPlayerCommand).not.toHaveBeenCalled();
    expect(screen.getByText("none")).toBeTruthy();

    rerender(<Harness ready={false} settings={TELEVISION} />);
    await Promise.resolve();
    expect(mocks.runPlayerCommand).not.toHaveBeenCalled();
  });
});
