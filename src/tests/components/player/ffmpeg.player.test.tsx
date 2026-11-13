import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { translate } from "@/lib/locale/i18n.utils";
import FFMPEG from "@/routes/components/player/ffmpeg.player";
import { patchSettings } from "@/store/settings.store";

import { mockInvoke } from "@/tests/mocks";

const deleteButton = (): HTMLElement => {
  return screen.getByRole("button", { name: translate("common.delete") });
};

beforeEach(() => {
  patchSettings({ language: "en" });
});

describe("FFMPEG panel", () => {
  it("names a system FFmpeg instead of pretending the delete failed", async () => {
    mockInvoke.mockResolvedValue(false);
    const setStatus = vi.fn();
    render(<FFMPEG status="ok" setStatus={setStatus} />);

    await userEvent.click(deleteButton());

    expect(await screen.findByText(translate("player.ffmpeg.system"))).not.toBeNull();
    expect(screen.queryByRole("button", { name: translate("common.delete") })).toBeNull();
    expect(setStatus).not.toHaveBeenCalled();
  });

  it("removes the bundled copy and flips the panel to missing", async () => {
    mockInvoke.mockResolvedValue(true);
    const setStatus = vi.fn();
    render(<FFMPEG status="ok" setStatus={setStatus} />);

    await userEvent.click(deleteButton());

    expect(setStatus).toHaveBeenCalledWith("missing");
  });

  it("shows the failure and keeps the installed state", async () => {
    mockInvoke.mockRejectedValue(new Error("remove ffmpeg: access denied"));
    const setStatus = vi.fn();
    render(<FFMPEG status="ok" setStatus={setStatus} />);

    await userEvent.click(deleteButton());

    expect(
      await screen.findByText(
        translate("player.ffmpeg.remove.error", { message: "remove ffmpeg: access denied" })
      )
    ).not.toBeNull();
    expect(setStatus).not.toHaveBeenCalled();
  });
});
