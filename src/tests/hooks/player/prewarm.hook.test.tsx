import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePlayerPrewarm } from "@/hooks/player/prewarm.hook";
import type { TabId } from "@/types/ui/settings";

const player = vi.hoisted(() => ({
  prewarmPlayer: vi.fn(async (): Promise<void> => undefined),
  releasePlayerPrewarm: vi.fn(async (): Promise<boolean> => true),
}));

vi.mock("@/lib/player/playback.utils", () => player);

beforeEach(() => {
  player.prewarmPlayer.mockClear();
  player.releasePlayerPrewarm.mockClear();
  player.prewarmPlayer.mockResolvedValue(undefined);
  player.releasePlayerPrewarm.mockResolvedValue(true);
});

afterEach(() => {
  cleanup();
});

function renderAt(tab: TabId, enabled: boolean) {
  return renderHook(
    ({ activeTab, prewarm }: { activeTab: TabId; prewarm: boolean }) =>
      usePlayerPrewarm(activeTab, prewarm),
    { initialProps: { activeTab: tab, prewarm: enabled } }
  );
}

describe("usePlayerPrewarm", () => {
  it("does not warm the player on an unrelated tab", () => {
    renderAt("search", true);

    expect(player.prewarmPlayer).not.toHaveBeenCalled();
    expect(player.releasePlayerPrewarm).not.toHaveBeenCalled();
  });

  it("stays cold on the player and stream tabs while the setting is off", () => {
    const view = renderAt("search", false);

    view.rerender({ activeTab: "player", prewarm: false });
    view.rerender({ activeTab: "stream", prewarm: false });

    expect(player.prewarmPlayer).not.toHaveBeenCalled();
    expect(player.releasePlayerPrewarm).not.toHaveBeenCalled();
  });

  it("warms the player when the player tab is entered", async () => {
    const view = renderAt("search", true);

    view.rerender({ activeTab: "player", prewarm: true });

    await waitFor(() => expect(player.prewarmPlayer).toHaveBeenCalledTimes(1));
    expect(player.releasePlayerPrewarm).not.toHaveBeenCalled();
  });

  it("also warms on the streaming tab", async () => {
    const view = renderAt("search", true);

    view.rerender({ activeTab: "stream", prewarm: true });

    await waitFor(() => expect(player.prewarmPlayer).toHaveBeenCalledTimes(1));
  });

  it("keeps the window when moving between the two playback tabs", async () => {
    const view = renderAt("player", true);
    await waitFor(() => expect(player.prewarmPlayer).toHaveBeenCalledTimes(1));

    view.rerender({ activeTab: "stream", prewarm: true });

    expect(player.prewarmPlayer).toHaveBeenCalledTimes(1);
    expect(player.releasePlayerPrewarm).not.toHaveBeenCalled();
  });

  it("releases the idle prewarm when the player tab is left", async () => {
    const view = renderAt("search", true);
    view.rerender({ activeTab: "player", prewarm: true });
    await waitFor(() => expect(player.prewarmPlayer).toHaveBeenCalledTimes(1));

    view.rerender({ activeTab: "collection", prewarm: true });

    await waitFor(() => expect(player.releasePlayerPrewarm).toHaveBeenCalledTimes(1));
  });

  it("releases the warm window when the setting is turned off", async () => {
    const view = renderAt("player", true);
    await waitFor(() => expect(player.prewarmPlayer).toHaveBeenCalledTimes(1));

    view.rerender({ activeTab: "player", prewarm: false });

    await waitFor(() => expect(player.releasePlayerPrewarm).toHaveBeenCalledTimes(1));
  });

  it("does not release anything when moving between tabs that never warmed the player", () => {
    const view = renderAt("search", true);

    view.rerender({ activeTab: "anilist", prewarm: true });
    view.rerender({ activeTab: "stream", prewarm: true });

    expect(player.releasePlayerPrewarm).not.toHaveBeenCalled();
  });

  it("releases once more when the tab changes while the window is still being created", async () => {
    let finishPrewarm: () => void = () => undefined;
    player.prewarmPlayer.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishPrewarm = resolve;
        })
    );
    const view = renderAt("search", true);

    view.rerender({ activeTab: "player", prewarm: true });
    // The release runs first and finds no window yet; once the create
    // resolves, the leftover prewarm must be released a second time.
    view.rerender({ activeTab: "anilist", prewarm: true });
    finishPrewarm();

    await waitFor(() => expect(player.releasePlayerPrewarm).toHaveBeenCalledTimes(2));
  });
});
