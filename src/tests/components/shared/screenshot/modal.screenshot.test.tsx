import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ScreenshotModal from "@/components/shared/screenshot/modal.screenshot";
import { useNotificationStore } from "@/store/notification.store";
import { useSettingsStore } from "@/store/settings.store";
import type { SavedScreenshot, ScreenshotCapture } from "@/types/screenshot";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

const mockOpen = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => mockOpen(...args),
}));

const mockWriteImage = vi.fn();
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeImage: (...args: unknown[]) => mockWriteImage(...args),
}));

const mockOpenPath = vi.fn();
vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: (...args: unknown[]) => mockOpenPath(...args),
}));

const CAPTURE: ScreenshotCapture = {
  path: "C:/Temp/iluha_screenshot_1.png",
  width: 1280,
  height: 720,
  defaultDir: "D:/Pictures",
};

const SAVED: SavedScreenshot = {
  path: "D:/Pictures/iluhaAnime_screenshot.png",
  width: 1280,
  height: 720,
};

const CROPPED_PATH = "C:/Temp/iluha_screenshot_2.png";

const LAYER_DATA_URL = "data:image/png;base64,LAYER";

/// jsdom has no canvas at all, so the two annotation layers and the blur mask share one recording
/// context. What matters here is the wiring: which layer is handed to Rust and when.
function installCanvasStub() {
  const context = {
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    lineTo: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 7 })),
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    stroke: vi.fn(),
    canvas: { width: 0, height: 0 },
    fillStyle: "",
    font: "",
    globalCompositeOperation: "source-over",
    lineCap: "",
    lineJoin: "",
    lineWidth: 1,
    strokeStyle: "",
    textAlign: "",
    textBaseline: "",
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(LAYER_DATA_URL);
  return context;
}

let canvas: ReturnType<typeof installCanvasStub> | null = null;

function saveArgs(): Record<string, unknown> | undefined {
  return mockInvoke.mock.calls.find(([command]) => command === "save_screenshot")?.[1] as
    | Record<string, unknown>
    | undefined;
}

function tool(name: string | RegExp): HTMLElement {
  return screen.getByRole("button", { name });
}

/// Drags across the picture the way a drawing tool is used.
function drawStroke(x1: number, y1: number, x2: number, y2: number) {
  const surface = overlay();
  fireEvent.pointerDown(surface, { clientX: x1, clientY: y1 });
  fireEvent.pointerMove(surface, { clientX: x2, clientY: y2 });
  fireEvent.pointerUp(surface, { clientX: x2, clientY: y2 });
}

interface CommandOptions {
  saved?: SavedScreenshot;
  copyPath?: string;
  failSave?: boolean;
  failCopy?: boolean;
}

function serveCommands({
  saved = SAVED,
  copyPath = CAPTURE.path,
  failSave = false,
  failCopy = false,
}: CommandOptions = {}) {
  mockInvoke.mockImplementation((command: string) => {
    if (command === "save_screenshot") {
      return failSave ? Promise.reject(new Error("no such folder")) : Promise.resolve(saved);
    }
    if (command === "copy_screenshot") {
      return failCopy
        ? Promise.reject(new Error("could not cut the image"))
        : Promise.resolve(copyPath);
    }
    return Promise.resolve(undefined);
  });
}

function renderModal(onClose = vi.fn(), capture: ScreenshotCapture = CAPTURE) {
  return { onClose, ...render(<ScreenshotModal capture={capture} onClose={onClose} />) };
}

function folderValue(): string {
  return (screen.getByLabelText("Folder") as HTMLInputElement).value;
}

function isDisabled(element: HTMLElement): boolean {
  return (element as HTMLButtonElement).disabled;
}

function selection(): HTMLElement | null {
  return screen.queryByRole("button", { name: /Selection/ });
}

function overlay(): HTMLElement {
  return screen.getByTestId("screenshot-surface");
}

function readout(): string {
  return screen.getByText(/px$/).textContent ?? "";
}

function stage(): HTMLElement {
  return screen.getByTestId("screenshot-stage");
}

function space(): HTMLElement {
  return screen.getByTestId("screenshot-space");
}

/// jsdom has no layout, so every element measures 0x0 and the stage would fall back to scale one.
/// This gives the stage a real box, which is what makes fitView produce a scale other than one.
function stubStageBox(width: number, height: number) {
  const rect = {
    bottom: height,
    height,
    left: 0,
    right: width,
    top: 0,
    width,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  };
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(rect as DOMRect);
}

function picture(): HTMLElement {
  return screen.getByAltText("Screenshot");
}

function zoomLabel(): string {
  return screen.getByRole("button", { name: /%$/ }).textContent ?? "";
}

/// The modal listens for the wheel natively so that `preventDefault` works, so the test has to send
/// a real cancelable WheelEvent rather than a synthetic one.
async function wheelStage(deltaY: number, x = 400, y = 200): Promise<WheelEvent> {
  const event = new WheelEvent("wheel", {
    deltaY,
    clientX: x,
    clientY: y,
    bubbles: true,
    cancelable: true,
  });
  await act(async () => {
    stage().dispatchEvent(event);
  });
  return event;
}

async function settle() {
  // The dialog moves focus into the popup right after mounting, so wait for that to settle before
  // aiming the keyboard at the selection frame.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 32));
  });
}

async function cropOnce(user: ReturnType<typeof userEvent.setup>, keys: string) {
  await settle();
  selection()?.focus();
  await user.keyboard(keys);
}

/// Drags across the preview the way a user marks an area: press, move, release on the overlay.
function dragSelection(x1: number, y1: number, x2: number, y2: number) {
  const surface = overlay();
  fireEvent.pointerDown(surface, { clientX: x1, clientY: y1 });
  fireEvent.pointerMove(surface, { clientX: x2, clientY: y2 });
  fireEvent.pointerUp(surface, { clientX: x2, clientY: y2 });
}

/// jsdom has no pointer capture at all, so it never retargets a gesture the way a browser does: a
/// drag that only ever lands on the surface would hide a capture taken on a box without handlers.
/// This stub records the element that grabbed the pointer, and the tests send the rest of the
/// gesture there, which is exactly what the browser does.
function installPointerCapture(): { element: Element | null } {
  const captured: { element: Element | null } = { element: null };
  Object.defineProperty(Element.prototype, "setPointerCapture", {
    configurable: true,
    value(this: Element) {
      captured.element = this;
    },
  });
  Object.defineProperty(Element.prototype, "releasePointerCapture", {
    configurable: true,
    value(this: Element) {
      if (captured.element === this) captured.element = null;
    },
  });
  return captured;
}

beforeEach(() => {
  mockInvoke.mockReset();
  mockOpen.mockReset();
  mockWriteImage.mockReset();
  mockOpenPath.mockReset();
  mockWriteImage.mockResolvedValue(undefined);
  mockOpenPath.mockResolvedValue(undefined);
  useNotificationStore.setState({ items: [], unreadCount: 0 });
  useSettingsStore.setState({
    language: "en",
    screenshotDir: null,
    screenshotFormat: "png",
    screenshotOpenFolder: true,
  });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(Element.prototype, "setPointerCapture");
  Reflect.deleteProperty(Element.prototype, "releasePointerCapture");
});

describe("ScreenshotModal", () => {
  it("replaces the folder through the picker", async () => {
    const user = userEvent.setup();
    renderModal();
    mockOpen.mockResolvedValue("E:/Shots");
    await user.click(screen.getByRole("button", { name: "Browse" }));
    expect(mockOpen).toHaveBeenCalledWith(
      expect.objectContaining({ directory: true, multiple: false })
    );
    expect(folderValue()).toBe("E:/Shots");
  });

  it("keeps the folder when the picker is cancelled", async () => {
    const user = userEvent.setup();
    renderModal();
    mockOpen.mockResolvedValue(null);
    await user.click(screen.getByRole("button", { name: "Browse" }));
    expect(folderValue()).toBe("D:/Pictures");
  });

  it("saves the whole image under the trimmed name, remembers the choices and closes", async () => {
    const user = userEvent.setup();
    serveCommands();
    const { onClose } = renderModal();
    const nameField = screen.getByLabelText("File name");
    await user.clear(nameField);
    await user.type(nameField, "  page  ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockInvoke).toHaveBeenCalledWith("save_screenshot", {
      sourcePath: CAPTURE.path,
      dir: "D:/Pictures",
      name: "page",
      format: "png",
      crop: null,
    });
    expect(useSettingsStore.getState().screenshotDir).toBe("D:/Pictures");
    expect(useSettingsStore.getState().screenshotFormat).toBe("png");
    expect(useNotificationStore.getState().items[0]?.message).toBe(SAVED.path);
  });

  it("saves as JPEG once the format is switched", async () => {
    const user = userEvent.setup();
    serveCommands();
    const { onClose } = renderModal();
    await user.click(screen.getByRole("combobox", { name: "Format" }));
    await user.click(await screen.findByRole("option", { name: "JPEG" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockInvoke).toHaveBeenCalledWith(
      "save_screenshot",
      expect.objectContaining({ format: "jpeg" })
    );
    expect(useSettingsStore.getState().screenshotFormat).toBe("jpeg");
  });

  it("opens the folder after saving when the checkbox is on", async () => {
    const user = userEvent.setup();
    serveCommands();
    renderModal();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mockOpenPath).toHaveBeenCalledWith("D:/Pictures"));
  });

  it("does not open the folder when the checkbox is cleared and remembers it", async () => {
    const user = userEvent.setup();
    serveCommands();
    renderModal();
    const checkbox = screen.getByRole("checkbox", { name: "Open the folder after saving" });
    expect(checkbox.getAttribute("aria-checked")).toBe("true");
    await user.click(checkbox);
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalled());
    expect(mockOpenPath).not.toHaveBeenCalled();
    expect(useSettingsStore.getState().screenshotOpenFolder).toBe(false);
  });

  it("copies the whole image without saving and reports it on the button", async () => {
    const user = userEvent.setup();
    serveCommands();
    renderModal();
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(mockInvoke).toHaveBeenCalledWith("copy_screenshot", {
      sourcePath: CAPTURE.path,
      crop: null,
    });
    await waitFor(() => expect(mockWriteImage).toHaveBeenCalledWith(CAPTURE.path));
    expect(mockInvoke).not.toHaveBeenCalledWith("save_screenshot", expect.anything());
    const copied = await screen.findByRole("button", { name: "Copied" });
    expect(isDisabled(copied)).toBe(true);
  });

  it("reports a failed copy", async () => {
    const user = userEvent.setup();
    serveCommands();
    mockWriteImage.mockRejectedValue(new Error("clipboard busy"));
    renderModal();
    await user.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(useNotificationStore.getState().items).toHaveLength(1));
    expect(useNotificationStore.getState().items[0]?.type).toBe("error");
    await waitFor(() => expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy());
  });

  it("keeps the modal open and reports a failed save", async () => {
    const user = userEvent.setup();
    serveCommands({ failSave: true });
    const { onClose } = renderModal();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(useNotificationStore.getState().items).toHaveLength(1));
    expect(onClose).not.toHaveBeenCalled();
    expect(mockOpenPath).not.toHaveBeenCalled();
  });

  it("zooms the shot with the wheel", async () => {
    renderModal();
    const event = await wheelStage(-100);
    expect(event.defaultPrevented).toBe(true);
    expect(zoomLabel()).toBe("120%");
    expect(picture().style.transform).toContain("scale(1.2)");
    await wheelStage(-100);
    expect(zoomLabel()).toBe("144%");
  });

  it("returns to the fit when the wheel zooms back out", async () => {
    renderModal();
    await wheelStage(-100);
    await wheelStage(100);
    expect(picture().style.transform).toBe("translate(0px, 0px) scale(1)");
    expect(zoomLabel()).toBe("100%");
    expect(isDisabled(screen.getByRole("button", { name: "100%" }))).toBe(true);
  });

  it("pulls back below the fit down to the floor", async () => {
    const user = userEvent.setup();
    renderModal();
    await wheelStage(100);
    expect(zoomLabel()).toBe("83%");
    expect(picture().style.transform).toContain("scale(0.833)");
    expect(screen.getByTestId("screenshot-picture").style.width).toBe("1066.24px");
    for (let step = 0; step < 6; step += 1) await wheelStage(100);
    expect(zoomLabel()).toBe("50%");
    expect(screen.getByTestId("screenshot-picture").style.width).toBe("640px");
    await user.click(screen.getByRole("button", { name: "50%" }));
    expect(zoomLabel()).toBe("100%");
  });

  it("starts a selection after a wheel zoom", async () => {
    renderModal();
    await wheelStage(100);
    dragSelection(10, 10, 400, 250);
    expect(selection()).not.toBeNull();
  });

  it("marks only on the shot itself and not on the room around it", async () => {
    renderModal();
    await wheelStage(100);
    const surface = overlay();
    fireEvent.pointerDown(surface, { clientX: 1200, clientY: 100 });
    fireEvent.pointerMove(surface, { clientX: 1250, clientY: 300 });
    fireEvent.pointerUp(surface, { clientX: 1250, clientY: 300 });
    expect(selection()).toBeNull();
    fireEvent.pointerDown(surface, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(surface, { clientX: 400, clientY: 250 });
    fireEvent.pointerUp(surface, { clientX: 400, clientY: 250 });
    expect(selection()).not.toBeNull();
  });

  it("still moves the shot from the room around it", async () => {
    renderModal();
    await wheelStage(100);
    const before = picture().style.transform;
    const surface = overlay();
    fireEvent.pointerDown(surface, { button: 2, clientX: 1200, clientY: 700 });
    fireEvent.pointerMove(surface, { clientX: 1150, clientY: 650 });
    fireEvent.pointerUp(surface, { button: 2, clientX: 1150, clientY: 650 });
    expect(picture().style.transform).not.toBe(before);
    expect(selection()).toBeNull();
  });

  it("fits the shot again from the zoom button", async () => {
    const user = userEvent.setup();
    renderModal();
    await wheelStage(-100);
    const zoomed = picture().style.transform;
    await user.click(screen.getByRole("button", { name: "120%" }));
    expect(picture().style.transform).toBe("translate(0px, 0px) scale(1)");
    expect(zoomed).not.toBe(picture().style.transform);
  });

  it("moves the zoomed shot with the right button without selecting", async () => {
    renderModal();
    await wheelStage(-100);
    const before = picture().style.transform;
    const surface = overlay();
    const menu = new Event("contextmenu", { bubbles: true, cancelable: true });
    surface.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    fireEvent.pointerDown(surface, { button: 2, clientX: 400, clientY: 200 });
    fireEvent.pointerMove(surface, { clientX: 450, clientY: 230 });
    fireEvent.pointerUp(surface, { button: 2, clientX: 450, clientY: 230 });
    expect(picture().style.transform).not.toBe(before);
    expect(picture().style.transform).toContain("scale(1.2)");
    expect(selection()).toBeNull();
  });

  it("keeps the selection on the left button and ignores the middle one", () => {
    renderModal();
    const before = picture().style.transform;
    const surface = overlay();
    fireEvent.pointerDown(surface, { button: 1, clientX: 400, clientY: 200 });
    fireEvent.pointerMove(surface, { clientX: 450, clientY: 230 });
    fireEvent.pointerUp(surface, { button: 1, clientX: 450, clientY: 230 });
    expect(picture().style.transform).toBe(before);
    expect(selection()).toBeNull();
    fireEvent.pointerDown(surface, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(surface, { clientX: 500, clientY: 400 });
    fireEvent.pointerUp(surface, { button: 0, clientX: 500, clientY: 400 });
    expect(selection()).not.toBeNull();
    expect(picture().style.transform).toBe(before);
  });

  it("keeps the gesture on the element that grabbed the pointer", () => {
    const captured = installPointerCapture();
    renderModal();
    const surface = overlay();
    fireEvent.pointerDown(surface, { clientX: 100, clientY: 100 });
    // From here on the browser sends every event of this pointer to the capturing element and
    // nowhere else, so the selection has to be driven from there.
    expect(captured.element).toBe(surface);
    fireEvent.pointerMove(captured.element as Element, { clientX: 500, clientY: 400 });
    fireEvent.pointerUp(captured.element as Element, { clientX: 500, clientY: 400 });
    expect(readout()).toBe("400 x 300 px");
    expect(captured.element).toBeNull();
  });

  it("lets go of the pointer on release, so a plain click holds nothing", () => {
    const captured = installPointerCapture();
    renderModal();
    const surface = overlay();
    fireEvent.pointerDown(surface, { clientX: 100, clientY: 100 });
    fireEvent.pointerUp(captured.element as Element, { clientX: 100, clientY: 100 });
    // Without the release the drag would stay armed and a button-less move would pull a selection
    // out of the picture.
    fireEvent.pointerMove(surface, { clientX: 500, clientY: 400 });
    expect(selection()).toBeNull();
  });

  it("turns a diagonal drag into a selection", () => {
    renderModal();
    dragSelection(100, 100, 500, 400);
    expect(selection()?.getAttribute("aria-label")).toBe("Selection 400 x 300 px at 100, 100");
    expect(readout()).toBe("400 x 300 px");
    expect(isDisabled(screen.getByRole("button", { name: "Reset selection" }))).toBe(false);
  });

  it("holds a square while Shift is down during the drag", () => {
    renderModal();
    const surface = overlay();
    fireEvent.pointerDown(surface, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(surface, { clientX: 500, clientY: 300, shiftKey: true });
    fireEvent.pointerUp(surface, { clientX: 500, clientY: 300, shiftKey: true });
    expect(readout()).toBe("400 x 400 px");
    expect(screen.getByText("1:1")).toBeTruthy();
  });

  it("ignores a drag that is too small to be a selection", () => {
    renderModal();
    dragSelection(100, 100, 103, 102);
    expect(selection()).toBeNull();
    expect(readout()).toBe("1280 x 720 px");
  });

  it("moves the selection with the arrows", async () => {
    const user = userEvent.setup();
    renderModal();
    dragSelection(100, 100, 500, 400);
    await cropOnce(user, "{ArrowLeft}");
    expect(selection()?.getAttribute("aria-label")).toBe("Selection 400 x 300 px at 99, 100");
    expect(readout()).toBe("400 x 300 px");
  });

  it("resizes the selection with Alt and the arrows", async () => {
    const user = userEvent.setup();
    renderModal();
    dragSelection(100, 100, 500, 400);
    await cropOnce(user, "{Alt>}{Shift>}{ArrowLeft}{/Shift}{/Alt}");
    expect(readout()).toBe("390 x 300 px");
    await cropOnce(user, "{Alt>}{ArrowUp}{/Alt}");
    expect(readout()).toBe("390 x 299 px");
  });

  it("flags a square selection", () => {
    renderModal();
    dragSelection(100, 100, 300, 300);
    expect(readout()).toBe("200 x 200 px");
    expect(screen.getByText("1:1")).toBeTruthy();
  });

  it("drops the selection again on reset", async () => {
    const user = userEvent.setup();
    renderModal();
    dragSelection(100, 100, 500, 400);
    await user.click(screen.getByRole("button", { name: "Reset selection" }));
    expect(selection()).toBeNull();
    expect(readout()).toBe("1280 x 720 px");
    expect(isDisabled(screen.getByRole("button", { name: "Reset selection" }))).toBe(true);
  });

  it("saves only the selected area", async () => {
    const user = userEvent.setup();
    serveCommands();
    renderModal();
    dragSelection(100, 100, 500, 400);
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("save_screenshot", expect.anything())
    );
    expect(mockInvoke).toHaveBeenCalledWith(
      "save_screenshot",
      expect.objectContaining({ crop: { x: 100, y: 100, width: 400, height: 300 } })
    );
  });

  it("copies the cropped area and clears the temporary file", async () => {
    const user = userEvent.setup();
    serveCommands({ copyPath: CROPPED_PATH });
    renderModal();
    dragSelection(100, 100, 500, 400);
    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(mockInvoke).toHaveBeenCalledWith("copy_screenshot", {
      sourcePath: CAPTURE.path,
      crop: { x: 100, y: 100, width: 400, height: 300 },
    });
    await waitFor(() => expect(mockWriteImage).toHaveBeenCalledWith(CROPPED_PATH));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("discard_screenshot", { sourcePath: CROPPED_PATH })
    );
    expect(mockInvoke).not.toHaveBeenCalledWith("discard_screenshot", {
      sourcePath: CAPTURE.path,
    });
  });

  it("keeps the original file when nothing is cropped", async () => {
    const user = userEvent.setup();
    serveCommands();
    renderModal();
    await user.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(mockWriteImage).toHaveBeenCalled());
    expect(mockInvoke).not.toHaveBeenCalledWith("discard_screenshot", expect.anything());
  });

  it("reports a failed crop and restores the copy button", async () => {
    const user = userEvent.setup();
    serveCommands({ failCopy: true });
    renderModal();
    await user.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(useNotificationStore.getState().items).toHaveLength(1));
    expect(useNotificationStore.getState().items[0]?.type).toBe("error");
    expect(mockWriteImage).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy());
  });
});

describe("ScreenshotModal annotations", () => {
  beforeEach(() => {
    canvas = installCanvasStub();
  });

  afterEach(() => {
    canvas = null;
    vi.restoreAllMocks();
  });

  it("offers only the controls the active tool can use", async () => {
    const user = userEvent.setup();
    renderModal();
    expect(screen.queryByRole("button", { name: "Custom color" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Brush size" })).toBeNull();

    await user.click(tool("Pencil"));
    expect(screen.getByRole("button", { name: "Custom color" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Brush size" })).toBeTruthy();
    expect(tool("Pencil").getAttribute("aria-pressed")).toBe("true");
    expect(tool("6 px").getAttribute("aria-pressed")).toBe("true");

    await user.click(tool("Text"));
    expect(screen.queryByRole("group", { name: "Brush size" })).toBeNull();
    expect(screen.getByRole("group", { name: "Text size" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Custom color" })).toBeTruthy();
    expect(tool("28 px").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Click, type the text, press Enter")).toBeTruthy();

    await user.click(tool("Select an area"));
    expect(screen.queryByRole("button", { name: "Custom color" })).toBeNull();
    expect(
      screen.getByText("Drag across the image to select an area, hold Shift for a square")
    ).toBeTruthy();
  });

  it("finishes a drawn stroke that the browser retargets to the captured element", async () => {
    const user = userEvent.setup();
    const captured = installPointerCapture();
    renderModal();
    await user.click(tool("Pencil"));
    const surface = overlay();
    fireEvent.pointerDown(surface, { clientX: 100, clientY: 100 });
    expect(captured.element).toBe(surface);
    fireEvent.pointerMove(captured.element as Element, { clientX: 300, clientY: 200 });
    fireEvent.pointerUp(captured.element as Element, { clientX: 300, clientY: 200 });
    expect(isDisabled(tool("Clear the drawings"))).toBe(false);
  });

  it("draws with the pencil without touching the selection", async () => {
    const user = userEvent.setup();
    serveCommands();
    renderModal();
    await user.click(tool("Pencil"));
    drawStroke(100, 100, 400, 250);
    expect(selection()).toBeNull();
    expect(isDisabled(tool("Clear the drawings"))).toBe(false);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("save_screenshot", expect.anything())
    );
    expect(saveArgs()?.layers).toEqual({ drawing: LAYER_DATA_URL });
  });

  it("sends no layers at all while nothing is drawn", async () => {
    const user = userEvent.setup();
    serveCommands();
    renderModal();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("save_screenshot", expect.anything())
    );
    expect(saveArgs()?.layers).toBeUndefined();
  });

  it("walks the strokes back and forward again", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(tool("Pencil"));
    drawStroke(100, 100, 400, 250);
    expect(isDisabled(tool(/^Undo/))).toBe(false);
    expect(isDisabled(tool(/^Redo/))).toBe(true);

    await user.click(tool(/^Undo/));
    expect(isDisabled(tool(/^Undo/))).toBe(true);
    expect(isDisabled(tool("Clear the drawings"))).toBe(true);

    await user.click(tool(/^Redo/));
    expect(isDisabled(tool(/^Undo/))).toBe(false);
    expect(isDisabled(tool("Clear the drawings"))).toBe(false);
  });

  it("undoes and redoes from the keyboard", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(tool("Pencil"));
    drawStroke(100, 100, 400, 250);

    await user.keyboard("{Control>}z{/Control}");
    expect(isDisabled(tool("Clear the drawings"))).toBe(true);

    await user.keyboard("{Control>}y{/Control}");
    expect(isDisabled(tool("Clear the drawings"))).toBe(false);

    await user.keyboard("{Control>}z{/Control}");
    await user.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
    expect(isDisabled(tool("Clear the drawings"))).toBe(false);
  });

  it("wipes every stroke with one clear and can undo it", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(tool("Pencil"));
    drawStroke(100, 100, 400, 250);
    drawStroke(120, 130, 300, 200);
    await user.click(tool("Clear the drawings"));
    expect(isDisabled(tool("Clear the drawings"))).toBe(true);
    await user.click(tool(/^Undo/));
    expect(isDisabled(tool("Clear the drawings"))).toBe(false);
  });

  it("typing on the picture writes at the click point", async () => {
    const user = userEvent.setup();
    serveCommands();
    renderModal();
    await user.click(tool("Text"));
    fireEvent.pointerDown(overlay(), { clientX: 120, clientY: 90 });

    const editor = screen.getByTestId("screenshot-text-editor") as HTMLInputElement;
    expect(editor.style.color).toBe("rgb(229, 52, 47)");
    expect(editor.style.fontSize).toBe("28px");
    await user.type(editor, "look here{Enter}");
    expect(screen.queryByTestId("screenshot-text-editor")).toBeNull();
    expect(isDisabled(tool("Clear the drawings"))).toBe(false);

    // The wording is ink on the drawing layer, not a blur mask.
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("save_screenshot", expect.anything())
    );
    expect(saveArgs()?.layers).toEqual({ drawing: LAYER_DATA_URL });
  });

  it("drops the text again on Escape", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(tool("Text"));
    fireEvent.pointerDown(overlay(), { clientX: 120, clientY: 90 });
    await user.type(screen.getByTestId("screenshot-text-editor"), "nope{Escape}");
    expect(screen.queryByTestId("screenshot-text-editor")).toBeNull();
    expect(isDisabled(tool("Clear the drawings"))).toBe(true);
  });

  it("follows the picked colour and size on the next text", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(tool("Text"));
    await user.click(tool("Custom color"));
    const hexInput = screen.getByPlaceholderText("000000");
    await user.clear(hexInput);
    await user.type(hexInput, "2e9e4f");
    await user.click(screen.getByRole("button", { name: "OK" }));
    await user.click(tool("42 px"));
    fireEvent.pointerDown(overlay(), { clientX: 60, clientY: 40 });
    const editor = screen.getByTestId("screenshot-text-editor") as HTMLInputElement;
    expect(editor.style.color).toBe("rgb(46, 158, 79)");
    expect(editor.style.fontSize).toBe("42px");
  });

  it("previews a blur and sends it as a mask of its own", async () => {
    const user = userEvent.setup();
    serveCommands();
    renderModal();
    await user.click(tool("Blur"));
    drawStroke(100, 100, 300, 200);

    const preview = await screen.findByTestId("screenshot-blur");
    expect(preview.style.backdropFilter).toContain("blur(9px)");
    expect(preview.style.maskImage).toContain(LAYER_DATA_URL);
    expect(canvas?.moveTo).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("save_screenshot", expect.anything())
    );
    expect(saveArgs()?.layers).toEqual({
      blur: { mask: LAYER_DATA_URL, sigma: 9 },
    });
  });

  it("drags a text that sits inside the selected area, not the frame under it", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(tool("Text"));
    fireEvent.pointerDown(overlay(), { clientX: 120, clientY: 90 });
    await user.type(screen.getByTestId("screenshot-text-editor"), "hi{Enter}");

    await user.click(tool("Select an area"));
    dragSelection(50, 50, 400, 300);
    expect(readout()).toBe("350 x 250 px");

    // A browser sends the press to the element under the cursor, and the frame covers the whole
    // selected area, so the text only moves if it wins over the frame underneath it.
    fireEvent.pointerDown(selection()!, { clientX: 125, clientY: 95 });
    fireEvent.pointerMove(overlay(), { clientX: 225, clientY: 195 });
    fireEvent.pointerUp(overlay(), { clientX: 225, clientY: 195 });
    expect(readout()).toBe("350 x 250 px");

    fireEvent.doubleClick(overlay(), { clientX: 225, clientY: 195 });
    const editor = screen.getByTestId("screenshot-text-editor") as HTMLInputElement;
    expect(editor.value).toBe("hi");
    expect(editor.style.left).toBe("220px");
    expect(editor.style.top).toBe("190px");
  });

  it("shows a text cursor over wording inside the selected area", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(tool("Text"));
    fireEvent.pointerDown(overlay(), { clientX: 120, clientY: 90 });
    await user.type(screen.getByTestId("screenshot-text-editor"), "hi{Enter}");

    await user.click(tool("Select an area"));
    dragSelection(50, 50, 400, 300);
    expect(selection()?.className).toContain("cursor-move");

    // Hovering the wording flips the frame cursor, so the user sees that the drag
    // will carry the text and not the frame under it.
    fireEvent.pointerMove(overlay(), { clientX: 125, clientY: 95 });
    expect(selection()?.className).toContain("cursor-text");

    fireEvent.pointerMove(overlay(), { clientX: 300, clientY: 250 });
    expect(selection()?.className).toContain("cursor-move");
  });

  it("leaves the wording to the editor while it is being edited", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(tool("Text"));
    fireEvent.pointerDown(overlay(), { clientX: 120, clientY: 90 });
    await user.type(screen.getByTestId("screenshot-text-editor"), "hi{Enter}");

    await user.click(tool("Select an area"));
    canvas?.fillText.mockClear();
    fireEvent.doubleClick(overlay(), { clientX: 125, clientY: 95 });
    expect(screen.getByTestId("screenshot-text-editor")).toBeTruthy();
    // Reopening the editor repaints the layer without the wording, because the editor draws it in
    // the same scaled space and a second copy under it would read as a doubled, ghosted text.
    expect(canvas?.fillText).not.toHaveBeenCalled();
  });

  it("saves the wording that is being edited, since the file gets the model and not the screen", async () => {
    const user = userEvent.setup();
    serveCommands();
    renderModal();
    await user.click(tool("Text"));
    fireEvent.pointerDown(overlay(), { clientX: 120, clientY: 90 });
    await user.type(screen.getByTestId("screenshot-text-editor"), "hi{Enter}");

    await user.click(tool("Select an area"));
    fireEvent.doubleClick(overlay(), { clientX: 125, clientY: 95 });
    canvas?.fillText.mockClear();

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("save_screenshot", expect.anything())
    );
    expect(canvas?.fillText).toHaveBeenCalledWith("hi", 120, 90);
    expect(saveArgs()?.layers).toEqual({ drawing: LAYER_DATA_URL });
  });

  it("reopens a text at its own size, not at the size of the tool that reopens it", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(tool("Text"));
    fireEvent.pointerDown(overlay(), { clientX: 120, clientY: 90 });
    await user.type(screen.getByTestId("screenshot-text-editor"), "hi{Enter}");

    // Select is the tool that drags and reopens a text, and on that tool the size in the toolbar
    // belongs to the brush, so the editor has to take the size the wording was written at.
    await user.click(tool("Select an area"));
    fireEvent.doubleClick(overlay(), { clientX: 125, clientY: 95 });
    const editor = screen.getByTestId("screenshot-text-editor") as HTMLInputElement;
    expect(editor.style.fontSize).toBe("28px");
  });

  it("writes the editor in the pixels of the capture, so one transform scales it with the drawing", async () => {
    const user = userEvent.setup();
    // A 640x360 box fits the 1280x720 capture at half size with no offset.
    stubStageBox(640, 360);
    renderModal();
    await user.click(tool("Text"));
    // Half the capture's pixels: this lands on the capture at 100,100.
    fireEvent.pointerDown(overlay(), { clientX: 50, clientY: 50 });

    const editor = screen.getByTestId("screenshot-text-editor") as HTMLInputElement;
    expect(space().style.transform).toBe("scale(0.5)");
    expect(editor.style.left).toBe("100px");
    expect(editor.style.top).toBe("100px");
    expect(editor.style.fontSize).toBe("28px");

    // Zooming only moves the transform the two share: the editor is written in capture pixels, so
    // neither its size nor its anchor may follow the zoom on their own.
    await wheelStage(-100, 50, 50);
    expect(space().style.transform).toBe("scale(0.6)");
    expect(editor.style.fontSize).toBe("28px");
    expect(editor.style.left).toBe("100px");
  });

  it("drags a text to a new spot and reopens it with a double click", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(tool("Text"));
    fireEvent.pointerDown(overlay(), { clientX: 120, clientY: 90 });
    await user.type(screen.getByTestId("screenshot-text-editor"), "hi{Enter}");

    await user.click(tool("Select an area"));
    const surface = overlay();
    fireEvent.pointerDown(surface, { clientX: 125, clientY: 95 });
    fireEvent.pointerMove(surface, { clientX: 225, clientY: 195 });
    fireEvent.pointerUp(surface, { clientX: 225, clientY: 195 });
    // Selecting is off, so the drag must not have painted anything.
    expect(screen.queryByRole("button", { name: /^Selection/ })).toBeNull();

    fireEvent.doubleClick(overlay(), { clientX: 225, clientY: 195 });
    const editor = screen.getByTestId("screenshot-text-editor") as HTMLInputElement;
    expect(editor.value).toBe("hi");
    expect(editor.style.left).toBe("220px");
    expect(editor.style.top).toBe("190px");
  });

  it("paints with the eraser as a cut", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(tool("Eraser"));
    drawStroke(100, 100, 300, 200);
    expect(isDisabled(tool("Clear the drawings"))).toBe(false);
  });

  it("wipes a blur patch out with the eraser", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(tool("Blur"));
    drawStroke(100, 100, 300, 200);

    const painted: string[][] = [];
    const context = canvas as NonNullable<typeof canvas>;
    context.stroke.mockImplementation(() => {
      painted.push([context.strokeStyle, context.globalCompositeOperation]);
    });
    await user.click(tool("Eraser"));
    drawStroke(150, 150, 250, 180);

    // The mask is the only layer that cuts in the mask colour, so this pair can only come from the
    // eraser reaching the blur mask and not merely the drawing layer.
    expect(painted).toContainEqual(["#ffffff", "destination-out"]);
  });
});
