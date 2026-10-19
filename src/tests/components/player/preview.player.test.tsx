import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockInvoke } from "../../mocks";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

import type { UpscalePreviewController } from "@/hooks/player/upscalePreview.hook";
import { PreviewZoom, UpscalePreview } from "@/routes/components/player/preview.player";
import UpscalePlayer from "@/routes/components/player/upscale/modal.upscale";
import { patchSettings } from "@/store/settings.store";
import type { PreviewFrame } from "@/types/upscale";

const FRAME: PreviewFrame = {
  timestamp: 12.4,
  before: "http://img/before.png",
  after: "http://img/after.png",
};

const SECOND_FRAME: PreviewFrame = {
  timestamp: 30.2,
  before: "http://img2/before.png",
  after: "http://img2/after.png",
};

function controller(overrides: Partial<UpscalePreviewController> = {}): UpscalePreviewController {
  return {
    frames: [FRAME],
    loading: false,
    error: null,
    load: vi.fn(),
    ...overrides,
  };
}

function mockPreviewInvoke(frames: PreviewFrame[]): void {
  mockInvoke.mockImplementation((cmd: unknown) => {
    const responses: Record<string, unknown> = {
      check_ffprobe: true,
      check_gpu_encoders: ["cpu"],
      default_anime4k_shaders: [],
      list_anime4k_shaders: [],
      suggest_upscale_preset: { preset: "lightning", reason: "anime" },
      estimate_upscale_time: { seconds: 0 },
      preview_upscale_frames: frames,
    };
    return Promise.resolve(responses[cmd as string] ?? null);
  });
}

function renderUpscalePlayer() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <UpscalePlayer filePath="D:/video/ep01.mkv" />
    </QueryClientProvider>
  );
}

async function selectAnime4k(): Promise<void> {
  const upscaler = screen
    .getAllByRole("combobox")
    .find((element) => element.textContent?.includes("Lanczos"));
  if (!upscaler) throw new Error("upscaler select not found");
  fireEvent.mouseDown(upscaler);
  const listbox = await screen.findByRole("listbox");
  fireEvent.keyDown(listbox, { key: "ArrowDown" });
  const active = document.activeElement;
  if (!active || active === listbox) throw new Error("upscaler option not highlighted");
  fireEvent.keyDown(active, { key: "Enter" });
  await waitFor(() => expect(upscaler.textContent).toContain("Anime4K"));
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  patchSettings({ language: "en", modalAnimation: false });
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

describe("UpscalePreview", () => {
  it("renders the supplied frames and reports the clicked one", async () => {
    const user = userEvent.setup();
    const onZoom = vi.fn();
    render(
      <UpscalePreview
        preview={controller({ frames: [FRAME, SECOND_FRAME] })}
        onZoom={onZoom}
      />
    );

    await user.click(screen.getByTitle("12s"));

    expect(onZoom).toHaveBeenCalledTimes(1);
    expect(onZoom).toHaveBeenCalledWith(FRAME);
  });

  it("shows the error text without rendering frames", () => {
    render(
      <UpscalePreview
        preview={controller({ frames: [], error: "Preview failed" })}
        onZoom={() => undefined}
      />
    );

    expect(screen.getByText("Preview failed")).not.toBeNull();
    expect(screen.queryByTitle("12s")).toBeNull();
  });

  it("keeps frames after the viewer remounts because the controller owns them", () => {
    const preview = controller({ frames: [FRAME] });
    const first = render(<UpscalePreview preview={preview} onZoom={() => undefined} />);
    expect(first.getByTitle("12s")).not.toBeNull();
    first.unmount();

    render(<UpscalePreview preview={preview} onZoom={() => undefined} />);

    expect(screen.getByTitle("12s")).not.toBeNull();
    expect(mockInvoke).not.toHaveBeenCalledWith("preview_upscale_frames", expect.anything());
  });
});

describe("Upscale player frame paging", () => {
  it("pages frames and keeps the loaded previews after going back", async () => {
    const user = userEvent.setup();
    mockPreviewInvoke([FRAME, SECOND_FRAME]);
    renderUpscalePlayer();

    await user.click(screen.getByRole("button", { name: /Improve quality/ }));
    await selectAnime4k();
    await user.click(await screen.findByRole("button", { name: "Preview frames" }));

    const firstThumb = await screen.findByTitle("12s");
    expect(screen.getByTitle("30s")).not.toBeNull();
    await user.click(firstThumb);

    expect(screen.getByRole("group", { name: "Frames" })).not.toBeNull();
    expect(screen.getByText("1 / 2")).not.toBeNull();
    expect(document.querySelector('img[src="http://img/after.png"]')).not.toBeNull();

    const before = screen.getByRole("button", { name: "Before" });
    await user.click(before);

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("2 / 2")).not.toBeNull();
    expect(document.querySelector('img[src="http://img2/before.png"]')).not.toBeNull();
    expect(document.querySelector('img[src="http://img2/after.png"]')).toBeNull();

    await user.click(screen.getByRole("button", { name: "Back" }));

    await waitFor(() => expect(screen.getByTitle("12s")).not.toBeNull());
    expect(screen.getByTitle("30s")).not.toBeNull();
    const previewCalls = mockInvoke.mock.calls.filter(([cmd]) => cmd === "preview_upscale_frames");
    expect(previewCalls).toHaveLength(1);
  });
});
