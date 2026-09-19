import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TorrentProblem } from "@/routes/components/torrent/sections/error.sections";
import { useSettingsStore } from "@/store/settings.store";

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

afterEach(() => cleanup());

function problem(overrides: Partial<Parameters<typeof TorrentProblem>[0]> = {}) {
  const onRecheck = vi.fn();
  const onRecreate = vi.fn();
  return {
    onRecheck,
    onRecreate,
    ...render(
      <TorrentProblem
        error={null}
        missing={false}
        onRecheck={onRecheck}
        onRecreate={onRecreate}
        {...overrides}
      />
    ),
  };
}

describe("TorrentProblem", () => {
  it("shows the missing-files line alongside the engine error", () => {
    problem({ error: "tracker down", missing: true });
    expect(screen.getByText("Files are gone from disk")).toBeTruthy();
    expect(screen.getByText("tracker down")).toBeTruthy();
  });

  it("drops the missing line for a plain error", () => {
    problem({ error: "tracker down" });
    expect(screen.queryByText("Files are gone from disk")).toBeNull();
    expect(screen.getByText("tracker down")).toBeTruthy();
  });

  it("rechecks without asking, because a check loses nothing", async () => {
    const user = userEvent.setup();
    const { onRecheck, onRecreate } = problem({ missing: true });

    await user.click(screen.getByRole("button", { name: "Recheck files" }));

    expect(onRecheck).toHaveBeenCalledTimes(1);
    expect(onRecreate).not.toHaveBeenCalled();
  });

  it("asks before recreating and obeys a cancel", async () => {
    const user = userEvent.setup();
    const { onRecreate } = problem({ missing: true });

    await user.click(screen.getByRole("button", { name: "Recreate torrent" }));
    expect(await screen.findByText(/drops manual trackers/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onRecreate).not.toHaveBeenCalled();
    expect(screen.queryByText(/drops manual trackers/)).toBeNull();
  });

  it("recreates once the confirm is accepted", async () => {
    const user = userEvent.setup();
    const { onRecreate } = problem({ missing: true });

    await user.click(screen.getByRole("button", { name: "Recreate torrent" }));
    await user.click(await screen.findByRole("button", { name: "Recreate" }));

    expect(onRecreate).toHaveBeenCalledTimes(1);
  });
});
