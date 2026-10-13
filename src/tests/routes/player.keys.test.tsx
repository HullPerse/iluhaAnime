import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockInvoke as invokeMock, mockDialogOpen, mockListen as listenMock } from "../mocks";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mockDialogOpen }));

import PlayerRoute from "@/routes/player.route";
import { patchSettings } from "@/store/settings.store";
import { upscaleItems } from "@/store/upscale.store";
import type { UpscaleConfig, UpscaleQueueItem } from "@/types/upscale";

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const CONFIG: UpscaleConfig = {
  width: 1920,
  height: 1080,
  targetFps: null,
  interpolate: false,
  quality: "balanced",
  gpuBackend: "auto",
  videoCodec: "h264",
  aiUpscaler: null,
  selectedShaders: [],
  temporalDenoise: false,
};

function queueItem(): UpscaleQueueItem {
  return {
    id: "job_1",
    jobType: "upscale",
    filePath: "D:/a.mkv",
    outputPath: "D:/out/a.mkv",
    name: "a.mkv",
    config: CONFIG,
    status: "queued",
    progress: 0,
  };
}

// Inside `act` on purpose: the handler updates React state and the DOM, so a
// bare dispatch would return before the panel re-renders (and every
// "nothing happened" assertion below would pass for the wrong reason).
function pressKey(code: string, target: EventTarget = window, repeat = false): void {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, code, repeat })
    );
  });
}

function renderRoute() {
  return render(
    <QueryClientProvider client={client}>
      <PlayerRoute />
    </QueryClientProvider>
  );
}

function expanded(): string | null {
  return screen.getByTestId("queue-toggle").getAttribute("aria-expanded");
}

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
  listenMock.mockReset();
  listenMock.mockResolvedValue(() => undefined);
  mockDialogOpen.mockResolvedValue(null);
  patchSettings({ language: "en" });
  upscaleItems.set([queueItem()]);
});

afterEach(() => {
  cleanup();
  upscaleItems.set([]);
});

// Section 13.3 of `vim-mode.md`: this route has no hotkey layer of its own, so
// the queue key is registered here rather than in the player window.
describe("player route keys", () => {
  it("toggles the queue panel with Q", async () => {
    renderRoute();
    await screen.findByTestId("queue-toggle");
    expect(expanded()).toBe("true");

    pressKey("KeyQ");
    expect(expanded()).toBe("false");

    pressKey("KeyQ");
    expect(expanded()).toBe("true");
  });

  it("leaves a Q typed into a field alone", async () => {
    const { container } = renderRoute();
    await screen.findByTestId("queue-toggle");
    const field = document.createElement("input");
    container.append(field);

    pressKey("KeyQ", field);

    expect(expanded()).toBe("true");
  });

  it("does not fire while a modal owns the keyboard", async () => {
    const { container } = renderRoute();
    await screen.findByTestId("queue-toggle");
    const layer = document.createElement("div");
    layer.dataset.hotkeysDisabled = "true";
    const button = document.createElement("button");
    layer.append(button);
    container.append(layer);

    pressKey("KeyQ", button);

    expect(expanded()).toBe("true");
  });

  it("ignores auto-repeat", async () => {
    renderRoute();
    await screen.findByTestId("queue-toggle");

    pressKey("KeyQ", window, true);

    expect(expanded()).toBe("true");
  });

  it("keeps the header button and the key in agreement", async () => {
    renderRoute();
    const toggle = await screen.findByTestId("queue-toggle");

    fireEvent.click(toggle);
    expect(expanded()).toBe("false");
  });
});
