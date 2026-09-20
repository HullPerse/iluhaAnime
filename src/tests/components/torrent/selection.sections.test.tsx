import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TorrentSelectionBar } from "@/routes/components/torrent/sections/selection.sections";
import { useSettingsStore } from "@/store/settings.store";
import type { TorrentSelectionBarProps } from "@/types/torrent";

function props(overrides: Partial<TorrentSelectionBarProps> = {}): TorrentSelectionBarProps {
  return {
    busy: false,
    count: 3,
    onClear: () => {},
    onPause: () => {},
    onRecheck: () => {},
    onResume: () => {},
    onSelectAll: () => {},
    ...overrides,
  };
}

/** Buttons are looked up by their handler: labels differ per language, wiring must not. */
function buttonFor(name: string): HTMLButtonElement {
  const found = screen.getByRole("button", { name });
  expect(found).toBeTruthy();
  return found as HTMLButtonElement;
}

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

describe("TorrentSelectionBar", () => {
  it("states how many rows are selected", () => {
    render(<TorrentSelectionBar {...props({ count: 2 })} />);
    expect(screen.getByText("Selected: 2")).toBeTruthy();
  });

  it("runs each action on the selection", async () => {
    const user = userEvent.setup();
    const onPause = vi.fn();
    const onResume = vi.fn();
    const onRecheck = vi.fn();
    render(<TorrentSelectionBar {...props({ onPause, onResume, onRecheck })} />);

    await user.click(buttonFor("Pause"));
    await user.click(buttonFor("Resume"));
    await user.click(buttonFor("Recheck"));

    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onRecheck).toHaveBeenCalledTimes(1);
  });

  it("selects all and clears the selection", async () => {
    const user = userEvent.setup();
    const onSelectAll = vi.fn();
    const onClear = vi.fn();
    render(<TorrentSelectionBar {...props({ onClear, onSelectAll })} />);

    await user.click(buttonFor("Select all"));
    await user.click(buttonFor("Clear selection"));

    expect(onSelectAll).toHaveBeenCalledTimes(1);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("disables the actions while a bulk action runs", () => {
    render(<TorrentSelectionBar {...props({ busy: true })} />);
    expect(buttonFor("Pause").disabled).toBe(true);
    expect(buttonFor("Resume").disabled).toBe(true);
    expect(buttonFor("Recheck").disabled).toBe(true);
    // Selecting and clearing stay available: they never touch the torrents themselves.
    expect(buttonFor("Select all").disabled).toBe(false);
    expect(buttonFor("Clear selection").disabled).toBe(false);
  });
});
