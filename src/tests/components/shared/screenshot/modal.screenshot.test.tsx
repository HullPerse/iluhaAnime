import { mockInvoke, mockDialogOpen as mockOpen, mockOpenPath } from "@/tests/mocks";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ScreenshotModal from "@/components/shared/screenshot/modal.screenshot";
import { notificationAtoms } from "@/store/notification.store";
import { patchSettings, settingsAtoms } from "@/store/settings.store";
import type { SavedScreenshot, ScreenshotCapture } from "@/types/core/screenshot";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: mockOpen,
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: mockOpenPath,
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

const LAYER_DATA_URL = "data:image/png;base64,LAYER";

const installCanvasStub = () => {
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
};

let canvas: ReturnType<typeof installCanvasStub> | null = null;

const saveArgs = (): Record<string, unknown> | undefined => {
  return mockInvoke.mock.calls.find(([command]) => command === "save_screenshot")?.[1] as
    | Record<string, unknown>
    | undefined;
};

const tool = (name: string | RegExp): HTMLElement => {
  return screen.getByRole("button", { name });
};

const drawStroke = (x1: number, y1: number, x2: number, y2: number) => {
  const surface = overlay();
  fireEvent.pointerDown(surface, { clientX: x1, clientY: y1 });
  fireEvent.pointerMove(surface, { clientX: x2, clientY: y2 });
  fireEvent.pointerUp(surface, { clientX: x2, clientY: y2 });
};

interface CommandOptions {
  saved?: SavedScreenshot;
  failSave?: boolean;
  failCopy?: boolean;
}

const serveCommands = ({
  saved = SAVED,
  failSave = false,
  failCopy = false,
}: CommandOptions = {}) => {
  mockInvoke.mockImplementation((command: string) => {
    if (command === "save_screenshot") {
      return failSave ? Promise.reject(new Error("no such folder")) : Promise.resolve(saved);
    }

    if (command === "copy_screenshot") {
      return failCopy
        ? Promise.reject(new Error("could not cut the image"))
        : Promise.resolve(undefined);
    }

    return Promise.resolve(undefined);
  });
};

const renderModal = (onClose = vi.fn(), capture: ScreenshotCapture = CAPTURE) => {
  return { onClose, ...render(<ScreenshotModal capture={capture} onClose={onClose} />) };
};

const folderValue = (): string => {
  return screen.getByLabelText<HTMLInputElement>("Папка").value;
};

const isDisabled = (element: HTMLElement): boolean => {
  return (element as HTMLButtonElement).disabled;
};

const selection = (): HTMLElement | null => {
  return screen.queryByRole("button", { name: /Выделение/ });
};

const overlay = (): HTMLElement => {
  return screen.getByTestId("screenshot-surface");
};

const readout = (): string => {
  return screen.getByText(/px$/).textContent ?? "";
};

const stage = (): HTMLElement => {
  return screen.getByTestId("screenshot-stage");
};

const space = (): HTMLElement => {
  return screen.getByTestId("screenshot-space");
};

const stubStageBox = (width: number, height: number) => {
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
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(rect);
};

const picture = (): HTMLElement => {
  return screen.getByAltText("Скриншот");
};

const zoomLabel = (): string => {
  return screen.getByRole("button", { name: /%$/ }).textContent ?? "";
};

const wheelStage = async (deltaY: number, x = 400, y = 200): Promise<WheelEvent> => {
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
};

const dragSelection = (x1: number, y1: number, x2: number, y2: number) => {
  const surface = overlay();
  fireEvent.pointerDown(surface, { clientX: x1, clientY: y1 });
  fireEvent.pointerMove(surface, { clientX: x2, clientY: y2 });
  fireEvent.pointerUp(surface, { clientX: x2, clientY: y2 });
};

const installPointerCapture = (): { element: Element | null } => {
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
};

beforeEach(() => {
  mockInvoke.mockReset();
  mockOpen.mockReset();
  mockOpenPath.mockReset();
  mockOpenPath.mockResolvedValue(undefined);
  notificationAtoms.items.set([]);
  notificationAtoms.unreadCount.set(0);
  patchSettings({
    language: "ru",
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
    await user.click(screen.getByRole("button", { name: "Обзор" }));
    expect(mockOpen).toHaveBeenCalledWith(
      expect.objectContaining({ directory: true, multiple: false })
    );
    expect(folderValue()).toBe("E:/Shots");
  });

  it("keeps the folder when the picker is cancelled", async () => {
    const user = userEvent.setup();
    renderModal();
    mockOpen.mockResolvedValue(null);
    await user.click(screen.getByRole("button", { name: "Обзор" }));
    expect(folderValue()).toBe("D:/Pictures");
  });

  it("saves the whole image under the trimmed name, remembers the choices and closes", async () => {
    const user = userEvent.setup();
    serveCommands();
    const { onClose } = renderModal();
    const nameField = screen.getByLabelText("Имя файла");
    await user.clear(nameField);
    await user.type(nameField, "  page  ");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockInvoke).toHaveBeenCalledWith("save_screenshot", {
      sourcePath: CAPTURE.path,
      dir: "D:/Pictures",
      name: "page",
      format: "png",
      crop: null,
    });
    expect(settingsAtoms.screenshotDir.get()).toBe("D:/Pictures");
    expect(settingsAtoms.screenshotFormat.get()).toBe("png");
    expect(notificationAtoms.items.get()).toHaveLength(0);
  });

  it("saves as JPEG once the format is switched", async () => {
    const user = userEvent.setup();
    serveCommands();
    const { onClose } = renderModal();
    await user.click(screen.getByRole("combobox", { name: "Формат" }));
    await user.click(await screen.findByRole("option", { name: "JPEG" }));
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockInvoke).toHaveBeenCalledWith(
      "save_screenshot",
      expect.objectContaining({ format: "jpeg" })
    );
    expect(settingsAtoms.screenshotFormat.get()).toBe("jpeg");
  });

  it("opens the folder after saving when the checkbox is on", async () => {
    const user = userEvent.setup();
    serveCommands();
    renderModal();
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(mockOpenPath).toHaveBeenCalledWith("D:/Pictures"));
  });

  it("does not open the folder when the checkbox is cleared and remembers it", async () => {
    const user = userEvent.setup();
    serveCommands();
    renderModal();
    const checkbox = screen.getByRole("checkbox", { name: "Открыть папку после сохранения" });
    expect(checkbox.getAttribute("aria-checked")).toBe("true");
    await user.click(checkbox);
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => expect(mockInvoke).toHaveBeenCalled());
    expect(mockOpenPath).not.toHaveBeenCalled();
    expect(settingsAtoms.screenshotOpenFolder.get()).toBe(false);
  });

  it("copies the whole image without saving and reports it on the button", async () => {
    const user = userEvent.setup();
    serveCommands();
    renderModal();
    await user.click(screen.getByRole("button", { name: "Копировать" }));
    expect(mockInvoke).toHaveBeenCalledWith("copy_screenshot", {
      sourcePath: CAPTURE.path,
      crop: null,
    });
    await screen.findByRole("button", { name: "Скопировано" });
    expect(mockInvoke).not.toHaveBeenCalledWith("save_screenshot", expect.anything());
    const copied = await screen.findByRole("button", { name: "Скопировано" });
    expect(isDisabled(copied)).toBe(true);
  });

  it("keeps the modal open and reports a failed save", async () => {
    const user = userEvent.setup();
    serveCommands({ failSave: true });
    const { onClose } = renderModal();
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(notificationAtoms.items.get()).toHaveLength(1));
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

  it("fits the shot again from the zoom button", async () => {
    const user = userEvent.setup();
    renderModal();
    await wheelStage(-100);
    const zoomed = picture().style.transform;
    await user.click(screen.getByRole("button", { name: "120%" }));
    expect(picture().style.transform).toBe("translate(0px) scale(1)");
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

  it("pans with the right button while the left button keeps the selection", async () => {
    renderModal();
    await wheelStage(-100);
    const surface = overlay();
    const panned = picture().style.transform;
    fireEvent.pointerDown(surface, { button: 0, clientX: 800, clientY: 500 });
    fireEvent.pointerMove(surface, { clientX: 1000, clientY: 600 });
    expect(selection()).not.toBeNull();
    expect(readout()).toBe("167 x 83 px");
    fireEvent.pointerDown(surface, { button: 2, clientX: 1000, clientY: 600 });
    fireEvent.pointerMove(surface, { clientX: 1050, clientY: 650 });
    expect(picture().style.transform).not.toBe(panned);
    expect(selection()).not.toBeNull();
    fireEvent.pointerUp(surface, { button: 2, clientX: 1050, clientY: 650 });
    expect(selection()).not.toBeNull();
    fireEvent.pointerMove(surface, { clientX: 1100, clientY: 700 });
    fireEvent.pointerUp(surface, { button: 0, clientX: 1100, clientY: 700 });
    expect(selection()).not.toBeNull();
    expect(picture().style.transform).not.toBe(panned);
    expect(readout()).toBe("208 x 133 px");
  });

  it("turns a diagonal drag into a selection", () => {
    renderModal();
    dragSelection(100, 100, 500, 400);
    expect(selection()?.getAttribute("aria-label")).toBe("Выделение 400 x 300 px в 100, 100");
    expect(readout()).toBe("400 x 300 px");
    expect(isDisabled(screen.getByRole("button", { name: "Сбросить выделение" }))).toBe(false);
  });

  it("flags a square selection", () => {
    renderModal();
    dragSelection(100, 100, 300, 300);
    expect(readout()).toBe("200 x 200 px");
    expect(screen.getByText("1:1")).toBeTruthy();
  });

  it("resizes the selection by dragging the east edge", () => {
    renderModal();
    dragSelection(100, 100, 500, 400);
    expect(readout()).toBe("400 x 300 px");
    const handle = selection()?.querySelector('[data-handle="e"]');
    expect(handle).not.toBeNull();
    fireEvent.pointerDown(handle as Element, { button: 0, clientX: 500, clientY: 250 });
    fireEvent.pointerMove(overlay(), { clientX: 550, clientY: 250 });
    fireEvent.pointerUp(overlay(), { button: 0, clientX: 550, clientY: 250 });
    expect(readout()).toBe("450 x 300 px");
  });

  it("resizes the selection by dragging the north edge", () => {
    renderModal();
    dragSelection(100, 100, 500, 400);
    const handle = selection()?.querySelector('[data-handle="n"]');
    expect(handle).not.toBeNull();
    fireEvent.pointerDown(handle as Element, { button: 0, clientX: 300, clientY: 100 });
    fireEvent.pointerMove(overlay(), { clientX: 300, clientY: 120 });
    fireEvent.pointerUp(overlay(), { button: 0, clientX: 300, clientY: 120 });
    expect(readout()).toBe("400 x 280 px");
  });

  it("clamps the west edge at the minimum size", () => {
    renderModal();
    dragSelection(100, 100, 500, 400);
    const handle = selection()?.querySelector('[data-handle="w"]');
    expect(handle).not.toBeNull();
    fireEvent.pointerDown(handle as Element, { button: 0, clientX: 100, clientY: 250 });
    fireEvent.pointerMove(overlay(), { clientX: 600, clientY: 250 });
    fireEvent.pointerUp(overlay(), { button: 0, clientX: 600, clientY: 250 });
    expect(readout()).toBe("8 x 300 px");
  });

  it("resizes the selection by dragging the south-east corner", () => {
    renderModal();
    dragSelection(100, 100, 500, 400);
    const handle = selection()?.querySelector('[data-handle="se"]');
    expect(handle).not.toBeNull();
    fireEvent.pointerDown(handle as Element, { button: 0, clientX: 500, clientY: 400 });
    fireEvent.pointerMove(overlay(), { clientX: 550, clientY: 450 });
    fireEvent.pointerUp(overlay(), { button: 0, clientX: 550, clientY: 450 });
    expect(readout()).toBe("450 x 350 px");
  });

  it("drops the selection again on reset", async () => {
    const user = userEvent.setup();
    renderModal();
    dragSelection(100, 100, 500, 400);
    await user.click(screen.getByRole("button", { name: "Сбросить выделение" }));
    expect(selection()).toBeNull();
    expect(readout()).toBe("1280 x 720 px");
    expect(isDisabled(screen.getByRole("button", { name: "Сбросить выделение" }))).toBe(true);
  });

  it("saves only the selected area", async () => {
    const user = userEvent.setup();
    serveCommands();
    renderModal();
    dragSelection(100, 100, 500, 400);
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("save_screenshot", expect.anything())
    );
    expect(mockInvoke).toHaveBeenCalledWith(
      "save_screenshot",
      expect.objectContaining({ crop: { x: 100, y: 100, width: 400, height: 300 } })
    );
  });

  it("copies the cropped area directly without creating an intermediate file", async () => {
    const user = userEvent.setup();
    serveCommands();
    renderModal();
    dragSelection(100, 100, 500, 400);
    await user.click(screen.getByRole("button", { name: "Копировать" }));

    expect(mockInvoke).toHaveBeenCalledWith("copy_screenshot", {
      sourcePath: CAPTURE.path,
      crop: { x: 100, y: 100, width: 400, height: 300 },
    });
    await screen.findByRole("button", { name: "Скопировано" });
    expect(mockInvoke).not.toHaveBeenCalledWith("discard_screenshot", {
      sourcePath: CAPTURE.path,
    });
  });

  it("keeps the original file when nothing is cropped", async () => {
    const user = userEvent.setup();
    serveCommands();
    renderModal();
    await user.click(screen.getByRole("button", { name: "Копировать" }));
    await screen.findByRole("button", { name: "Скопировано" });
    expect(mockInvoke).not.toHaveBeenCalledWith("discard_screenshot", expect.anything());
  });

  it("reports a failed crop and restores the copy button", async () => {
    const user = userEvent.setup();
    serveCommands({ failCopy: true });
    renderModal();
    await user.click(screen.getByRole("button", { name: "Копировать" }));
    await waitFor(() => expect(notificationAtoms.items.get()).toHaveLength(1));
    expect(notificationAtoms.items.get()[0]?.type).toBe("error");
    await waitFor(() => expect(screen.getByRole("button", { name: "Копировать" })).toBeTruthy());
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
    expect(screen.queryByRole("button", { name: "Свой цвет" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Размер кисти" })).toBeNull();

    await user.click(tool("Карандаш"));
    expect(screen.getByRole("button", { name: "Свой цвет" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Размер кисти" })).toBeTruthy();
    expect(tool("Карандаш").getAttribute("aria-pressed")).toBe("true");
    expect(tool("6 px").getAttribute("aria-pressed")).toBe("true");

    await user.click(tool("Текст"));
    expect(screen.queryByRole("group", { name: "Размер кисти" })).toBeNull();
    expect(screen.getByRole("group", { name: "Размер текста" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Свой цвет" })).toBeTruthy();
    expect(tool("28 px").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Кликните и напишите текст, затем Enter")).toBeTruthy();

    await user.click(tool("Выделить область"));
    expect(screen.queryByRole("button", { name: "Свой цвет" })).toBeNull();
    expect(screen.getByText("Обведите мышью нужную область, Shift - ровный квадрат")).toBeTruthy();
  });

  it("finishes a drawn stroke that the browser retargets to the captured element", async () => {
    const user = userEvent.setup();
    const captured = installPointerCapture();
    renderModal();
    await user.click(tool("Карандаш"));
    const surface = overlay();
    fireEvent.pointerDown(surface, { clientX: 100, clientY: 100 });
    expect(captured.element).toBe(surface);
    fireEvent.pointerMove(captured.element as Element, { clientX: 300, clientY: 200 });
    fireEvent.pointerUp(captured.element as Element, { clientX: 300, clientY: 200 });
    expect(isDisabled(tool("Стереть рисунки"))).toBe(false);
  });

  it("draws with the pencil without touching the selection", async () => {
    const user = userEvent.setup();
    serveCommands();
    renderModal();
    await user.click(tool("Карандаш"));
    drawStroke(100, 100, 400, 250);
    expect(selection()).toBeNull();
    expect(isDisabled(tool("Стереть рисунки"))).toBe(false);
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("save_screenshot", expect.anything())
    );
    expect(saveArgs()?.layers).toEqual({ drawing: LAYER_DATA_URL });
  });

  it("sends no layers at all while nothing is drawn", async () => {
    const user = userEvent.setup();
    serveCommands();
    renderModal();
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("save_screenshot", expect.anything())
    );
    expect(saveArgs()?.layers).toBeUndefined();
  });

  it("walks the strokes back and forward again", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(tool("Карандаш"));
    drawStroke(100, 100, 400, 250);
    expect(isDisabled(tool(/^Отменить/))).toBe(false);
    expect(isDisabled(tool(/^Повторить/))).toBe(true);

    await user.click(tool(/^Отменить/));
    expect(isDisabled(tool(/^Отменить/))).toBe(true);
    expect(isDisabled(tool("Стереть рисунки"))).toBe(true);

    await user.click(tool(/^Повторить/));
    expect(isDisabled(tool(/^Отменить/))).toBe(false);
    expect(isDisabled(tool("Стереть рисунки"))).toBe(false);
  });

  it("undoes and redoes from the keyboard", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(tool("Карандаш"));
    drawStroke(100, 100, 400, 250);

    await user.keyboard("{Control>}z{/Control}");
    expect(isDisabled(tool("Стереть рисунки"))).toBe(true);

    await user.keyboard("{Control>}y{/Control}");
    expect(isDisabled(tool("Стереть рисунки"))).toBe(false);

    await user.keyboard("{Control>}z{/Control}");
    await user.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
    expect(isDisabled(tool("Стереть рисунки"))).toBe(false);
  });

  it("wipes every stroke with one clear and can undo it", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(tool("Карандаш"));
    drawStroke(100, 100, 400, 250);
    drawStroke(120, 130, 300, 200);
    await user.click(tool("Стереть рисунки"));
    expect(isDisabled(tool("Стереть рисунки"))).toBe(true);
    await user.click(tool(/^Отменить/));
    expect(isDisabled(tool("Стереть рисунки"))).toBe(false);
  });

  it("typing on the picture writes at the click point", async () => {
    const user = userEvent.setup();
    serveCommands();
    renderModal();
    await user.click(tool("Текст"));
    fireEvent.pointerDown(overlay(), { clientX: 120, clientY: 90 });

    const editor = screen.getByTestId<HTMLInputElement>("screenshot-text-editor");
    expect(editor.style.color).toBe("rgb(229, 52, 47)");
    expect(editor.style.fontSize).toBe("28px");
    await user.type(editor, "look here{Enter}");
    expect(screen.queryByTestId("screenshot-text-editor")).toBeNull();
    expect(isDisabled(tool("Стереть рисунки"))).toBe(false);

    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("save_screenshot", expect.anything())
    );
    expect(saveArgs()?.layers).toEqual({ drawing: LAYER_DATA_URL });
  });

  it("drops the text again on Escape", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(tool("Текст"));
    fireEvent.pointerDown(overlay(), { clientX: 120, clientY: 90 });
    await user.type(screen.getByTestId("screenshot-text-editor"), "nope{Escape}");
    expect(screen.queryByTestId("screenshot-text-editor")).toBeNull();
    expect(isDisabled(tool("Стереть рисунки"))).toBe(true);
  });

  it("follows the picked colour and size on the next text", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(tool("Текст"));
    await user.click(tool("Свой цвет"));
    const hexInput = screen.getByPlaceholderText("000000");
    await user.clear(hexInput);
    await user.type(hexInput, "2e9e4f");
    await user.click(screen.getByRole("button", { name: "OK" }));
    await user.click(tool("42 px"));
    fireEvent.pointerDown(overlay(), { clientX: 60, clientY: 40 });
    const editor = screen.getByTestId<HTMLInputElement>("screenshot-text-editor");
    expect(editor.style.color).toBe("rgb(46, 158, 79)");
    expect(editor.style.fontSize).toBe("42px");
  });

  it("previews a blur and sends it as a mask of its own", async () => {
    const user = userEvent.setup();
    serveCommands();
    renderModal();
    await user.click(tool("Блюр"));
    drawStroke(100, 100, 300, 200);

    const preview = await screen.findByTestId("screenshot-blur");
    expect(preview.style.backdropFilter).toContain("blur(9px)");
    expect(preview.style.maskImage).toContain(LAYER_DATA_URL);
    expect(canvas?.moveTo).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Сохранить" }));
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
    await user.click(tool("Текст"));
    fireEvent.pointerDown(overlay(), { clientX: 120, clientY: 90 });
    await user.type(screen.getByTestId("screenshot-text-editor"), "hi{Enter}");

    await user.click(tool("Выделить область"));
    dragSelection(50, 50, 400, 300);
    expect(readout()).toBe("350 x 250 px");

    const selected = selection();

    if (!selected) throw new Error("selection is missing");
    fireEvent.pointerDown(selected, { clientX: 125, clientY: 95 });
    fireEvent.pointerMove(overlay(), { clientX: 225, clientY: 195 });
    fireEvent.pointerUp(overlay(), { clientX: 225, clientY: 195 });
    expect(readout()).toBe("350 x 250 px");

    fireEvent.doubleClick(overlay(), { clientX: 225, clientY: 195 });
    const editor = screen.getByTestId<HTMLInputElement>("screenshot-text-editor");
    expect(editor.value).toBe("hi");
    expect(editor.style.left).toBe("220px");
    expect(editor.style.top).toBe("190px");
  });

  it("shows a text cursor over wording inside the selected area", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(tool("Текст"));
    fireEvent.pointerDown(overlay(), { clientX: 120, clientY: 90 });
    await user.type(screen.getByTestId("screenshot-text-editor"), "hi{Enter}");

    await user.click(tool("Выделить область"));
    dragSelection(50, 50, 400, 300);
    expect(selection()?.className).toContain("cursor-move");

    fireEvent.pointerMove(overlay(), { clientX: 125, clientY: 95 });
    expect(selection()?.className).toContain("cursor-text");

    fireEvent.pointerMove(overlay(), { clientX: 300, clientY: 250 });
    expect(selection()?.className).toContain("cursor-move");
  });

  it("leaves the wording to the editor while it is being edited", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(tool("Текст"));
    fireEvent.pointerDown(overlay(), { clientX: 120, clientY: 90 });
    await user.type(screen.getByTestId("screenshot-text-editor"), "hi{Enter}");

    await user.click(tool("Выделить область"));
    canvas?.fillText.mockClear();
    fireEvent.doubleClick(overlay(), { clientX: 125, clientY: 95 });
    expect(screen.getByTestId("screenshot-text-editor")).toBeTruthy();
    expect(canvas?.fillText).not.toHaveBeenCalled();
  });

  it("saves the wording that is being edited, since the file gets the model and not the screen", async () => {
    const user = userEvent.setup();
    serveCommands();
    renderModal();
    await user.click(tool("Текст"));
    fireEvent.pointerDown(overlay(), { clientX: 120, clientY: 90 });
    await user.type(screen.getByTestId("screenshot-text-editor"), "hi{Enter}");

    await user.click(tool("Выделить область"));
    fireEvent.doubleClick(overlay(), { clientX: 125, clientY: 95 });
    canvas?.fillText.mockClear();

    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith("save_screenshot", expect.anything())
    );
    expect(canvas?.fillText).toHaveBeenCalledWith("hi", 120, 90);
    expect(saveArgs()?.layers).toEqual({ drawing: LAYER_DATA_URL });
  });

  it("reopens a text at its own size, not at the size of the tool that reopens it", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(tool("Текст"));
    fireEvent.pointerDown(overlay(), { clientX: 120, clientY: 90 });
    await user.type(screen.getByTestId("screenshot-text-editor"), "hi{Enter}");

    await user.click(tool("Выделить область"));
    fireEvent.doubleClick(overlay(), { clientX: 125, clientY: 95 });
    const editor = screen.getByTestId<HTMLInputElement>("screenshot-text-editor");
    expect(editor.style.fontSize).toBe("28px");
  });

  it("writes the editor in the pixels of the capture, so one transform scales it with the drawing", async () => {
    const user = userEvent.setup();
    stubStageBox(640, 360);
    renderModal();
    await user.click(tool("Текст"));
    fireEvent.pointerDown(overlay(), { clientX: 50, clientY: 50 });

    const editor = screen.getByTestId<HTMLInputElement>("screenshot-text-editor");
    expect(space().style.transform).toBe("scale(0.5)");
    expect(editor.style.left).toBe("100px");
    expect(editor.style.top).toBe("100px");
    expect(editor.style.fontSize).toBe("28px");

    await wheelStage(-100, 50, 50);
    expect(space().style.transform).toBe("scale(0.6)");
    expect(editor.style.fontSize).toBe("28px");
    expect(editor.style.left).toBe("100px");
  });

  it("drags a text to a new spot and reopens it with a double click", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(tool("Текст"));
    fireEvent.pointerDown(overlay(), { clientX: 120, clientY: 90 });
    await user.type(screen.getByTestId("screenshot-text-editor"), "hi{Enter}");

    await user.click(tool("Выделить область"));
    const surface = overlay();
    fireEvent.pointerDown(surface, { clientX: 125, clientY: 95 });
    fireEvent.pointerMove(surface, { clientX: 225, clientY: 195 });
    fireEvent.pointerUp(surface, { clientX: 225, clientY: 195 });
    expect(screen.queryByRole("button", { name: /^Selection/ })).toBeNull();

    fireEvent.doubleClick(overlay(), { clientX: 225, clientY: 195 });
    const editor = screen.getByTestId<HTMLInputElement>("screenshot-text-editor");
    expect(editor.value).toBe("hi");
    expect(editor.style.left).toBe("220px");
    expect(editor.style.top).toBe("190px");
  });

  it("paints with the eraser as a cut", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(tool("Ластик"));
    drawStroke(100, 100, 300, 200);
    expect(isDisabled(tool("Стереть рисунки"))).toBe(false);
  });

  it("wipes a blur patch out with the eraser", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(tool("Блюр"));
    drawStroke(100, 100, 300, 200);

    const painted: string[][] = [];
    const context = canvas as NonNullable<typeof canvas>;
    context.stroke.mockImplementation(() => {
      painted.push([context.strokeStyle, context.globalCompositeOperation]);
    });
    await user.click(tool("Ластик"));
    drawStroke(150, 150, 250, 180);

    expect(painted).toContainEqual(["#ffffff", "destination-out"]);
  });
});
