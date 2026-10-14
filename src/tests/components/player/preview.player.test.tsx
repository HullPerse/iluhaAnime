import { mockInvoke } from "../../mocks";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PreviewZoom, UpscalePreview } from "@/routes/components/player/preview.player";
import { patchSettings } from "@/store/settings.store";
import type { PreviewFrame } from "@/types/upscale";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

const FRAME: PreviewFrame = {
  timestamp: 12.4,
  before: "http://img/before.png",
  after: "http://img/after.png",
};

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  patchSettings({ language: "en" });
  mockInvoke.mockReset();
});

describe("PreviewZoom", () => {
  it("shows the after image first and switches to before on demand", async () => {
    const user = userEvent.setup();
    const { container } = render(<PreviewZoom frame={FRAME} />);
    const srcOf = () => container.querySelector("img")?.getAttribute("src");
    expect(srcOf()).toBe("http://img/after.png");
    await user.click(screen.getByRole("button", { name: "Before" }));
    expect(srcOf()).toBe("http://img/before.png");
  });
});

describe("UpscalePreview zoom callback", () => {
  it("loads frames and reports the clicked frame without opening a dialog", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation((cmd: unknown) =>
      cmd === "preview_upscale_frames" ? Promise.resolve([FRAME]) : Promise.resolve(null)
    );
    const onZoom = vi.fn();
    render(
      <UpscalePreview
        filePath="D:/video/ep01.mkv"
        resolution="1920x1080"
        selectedShaders={[]}
        temporalDenoise={false}
        onZoom={onZoom}
      />
    );
    await user.click(screen.getByRole("button", { name: "Preview frames" }));
    const thumb = await screen.findByTitle("12s");
    await user.click(thumb);
    expect(onZoom).toHaveBeenCalledTimes(1);
    expect(onZoom).toHaveBeenCalledWith(FRAME);
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(0);
  });
});
