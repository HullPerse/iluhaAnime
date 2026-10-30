import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 20,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ index, start: index * 20, key: index })),
    scrollToIndex: () => undefined,
  }),
}));

import { TorrentQueueModal } from "@/routes/components/torrent/queue.torrent";
import { patchSettings } from "@/store/settings.store";
import type { TorrentFileInfo } from "@/types/torrent/torrent";

type Props = Parameters<typeof TorrentQueueModal>[0];

const file = (
  index: number,
  name: string,
  overrides: Partial<TorrentFileInfo> = {}
): TorrentFileInfo => {
  return {
    index,
    name,
    size: 100,
    progress_bytes: 0,
    completed: false,
    selected: true,
    priority: "normal",
    exists: true,
    ...overrides,
  };
};

const FILES = [file(0, "S1/01.mkv"), file(1, "S1/02.mkv"), file(2, "S2/01.mkv")];

const props = (overrides: Partial<Props> = {}): Props => {
  return {
    files: FILES,
    order: [1],
    current: null,
    sequential: false,
    onApply: vi.fn(async () => true),
    onClose: vi.fn(),
    ...overrides,
  };
};

const renderQueue = (overrides: Partial<Props> = {}) => {
  const base = props(overrides);
  const view = render(<TorrentQueueModal {...base} />);
  return {
    ...base,
    view,
    rerender: (next: Partial<Props> = {}) =>
      view.rerender(<TorrentQueueModal {...base} {...next} />),
  };
};

const row = (index: number): HTMLElement => {
  const found = document.querySelector<HTMLElement>(`[data-queue-index="${index}"]`);
  if (!found) throw new Error(`queue row missing: ${index}`);
  return found;
};

const rowOrder = (): string[] => {
  return [...document.querySelectorAll<HTMLElement>("[data-queue-index]")].map(
    (node) => node.dataset.queueIndex ?? ""
  );
};

const folder = (dir: string): HTMLElement => {
  const found = document.querySelector<HTMLElement>(`[data-queue-folder="${dir}"]`);
  if (!found) throw new Error(`queue folder missing: ${dir}`);
  return found;
};

const saveButton = (): HTMLElement => {
  return screen.getByRole("button", { name: "Turn on and save" });
};

beforeEach(() => {
  patchSettings({ language: "en", modalAnimation: false });
});

afterEach(() => {
  cleanup();
});

describe("TorrentQueueModal list", () => {
  it("shows folder blocks, the saved order first, and queue numbers", () => {
    renderQueue();

    expect(rowOrder()).toEqual(["1", "0", "2"]);
    expect(folder("S1").textContent).toContain("S1");
    expect(folder("S2").textContent).toContain("S2");
    expect(row(1).textContent).toContain("1");
    expect(row(0).textContent).toContain("2");
  });

  it("collapses a folder without losing the other rows", () => {
    renderQueue();

    fireEvent.click(within(folder("S1")).getByRole("button", { name: "Collapse section" }));

    expect(document.querySelector('[data-queue-index="0"]')).toBeNull();
    expect(document.querySelector('[data-queue-index="1"]')).toBeNull();
    expect(rowOrder()).toEqual(["2"]);
    expect(folder("S1").getAttribute("aria-expanded")).toBe("false");
  });

  it("shows an empty state when nothing is downloading", () => {
    renderQueue({ files: [file(0, "S1/01.mkv", { completed: true })] });

    expect(screen.getByTestId("torrent-queue-empty").textContent).toBe("Nothing left to download.");
    expect(saveButton().hasAttribute("disabled")).toBe(true);
  });

  it("reorders a row dragged by its grip", async () => {
    const rect = {
      left: 0,
      top: 0,
      right: 400,
      bottom: 400,
      width: 400,
      height: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect);
    const queue = renderQueue();

    const handle = within(row(0)).getByTestId("torrent-queue-handle");
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 100, clientY: 45 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 100, clientY: 25 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 100, clientY: 25 });

    expect(rowOrder()).toEqual(["0", "1", "2"]);

    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(queue.onApply).toHaveBeenCalledWith({
        order: [0, 1, 2],
        selected: [],
        deselected: [],
        enableSequential: true,
      })
    );
    spy.mockRestore();
  });

  it("keeps the order when the drag ends outside the list", () => {
    const rect = {
      left: 0,
      top: 0,
      right: 400,
      bottom: 400,
      width: 400,
      height: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect);
    renderQueue();

    const handle = within(row(0)).getByTestId("torrent-queue-handle");
    fireEvent.pointerDown(handle, { button: 0, pointerId: 2, clientX: 100, clientY: 45 });
    fireEvent.pointerMove(window, { pointerId: 2, clientX: 100, clientY: 900 });
    fireEvent.pointerUp(window, { pointerId: 2, clientX: 100, clientY: 900 });

    expect(rowOrder()).toEqual(["1", "0", "2"]);
    spy.mockRestore();
  });
});

describe("TorrentQueueModal apply", () => {
  it("saves the order and turns sequential mode on when it is off", async () => {
    const queue = renderQueue();

    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(queue.onApply).toHaveBeenCalledWith({
        order: [1, 0, 2],
        selected: [],
        deselected: [],
        enableSequential: true,
      })
    );
    await waitFor(() => expect(queue.onClose).toHaveBeenCalledTimes(1));
  });

  it("saves without enabling sequential mode when it is already on", async () => {
    const queue = renderQueue({ sequential: true });

    fireEvent.click(screen.getByRole("button", { name: "Save order" }));

    await waitFor(() =>
      expect(queue.onApply).toHaveBeenCalledWith({
        order: [1, 0, 2],
        selected: [],
        deselected: [],
        enableSequential: false,
      })
    );
  });

  it("drops an unchecked file from the order and reports it as deselected", async () => {
    const queue = renderQueue();

    fireEvent.click(screen.getByLabelText("Download S1/01.mkv"));
    expect(row(0).textContent).toContain("-");
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(queue.onApply).toHaveBeenCalledWith({
        order: [1, 2],
        selected: [],
        deselected: [0],
        enableSequential: true,
      })
    );
  });

  it("reselects a file that was unchecked at open", async () => {
    const queue = renderQueue({
      files: [file(0, "S1/01.mkv", { selected: false }), ...FILES.slice(1)],
    });

    expect(row(0).textContent).toContain("-");
    fireEvent.click(screen.getByLabelText("Download S1/01.mkv"));
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(queue.onApply).toHaveBeenCalledWith({
        order: [1, 0, 2],
        selected: [0],
        deselected: [],
        enableSequential: true,
      })
    );
  });

  it("leaves a file that finished during the review out of the order", async () => {
    const queue = renderQueue();
    queue.rerender({ files: [file(0, "S1/01.mkv", { completed: true }), ...FILES.slice(1)] });

    expect(within(row(0)).getByText("Done")).toBeDefined();
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(queue.onApply).toHaveBeenCalledWith({
        order: [1, 2],
        selected: [],
        deselected: [],
        enableSequential: true,
      })
    );
  });
});

describe("TorrentQueueModal keyboard", () => {
  it("moves the focused file inside its folder with Alt+ArrowDown", async () => {
    const queue = renderQueue();
    const first = row(1);
    first.focus();

    fireEvent.keyDown(first, { key: "ArrowDown", altKey: true });

    expect(rowOrder()).toEqual(["0", "1", "2"]);
    expect(screen.getByText("02.mkv: position 2 of 3")).toBeDefined();
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(queue.onApply).toHaveBeenCalledWith(expect.objectContaining({ order: [0, 1, 2] }))
    );
  });

  it("moves a whole folder with Alt+ArrowUp on its header", async () => {
    const queue = renderQueue();
    const s2 = folder("S2");
    s2.focus();

    fireEvent.keyDown(s2, { key: "ArrowUp", altKey: true });

    expect(rowOrder()).toEqual(["2", "1", "0"]);
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(queue.onApply).toHaveBeenCalledWith(expect.objectContaining({ order: [2, 1, 0] }))
    );
  });

  it("resets the moved rows back to the folder order", () => {
    renderQueue();
    const s2 = folder("S2");
    s2.focus();
    fireEvent.keyDown(s2, { key: "ArrowUp", altKey: true });

    fireEvent.click(screen.getByRole("button", { name: "Reset order" }));

    expect(rowOrder()).toEqual(["0", "1", "2"]);
  });
});

describe("TorrentQueueModal close guard", () => {
  it("closes without asking when nothing changed", () => {
    const queue = renderQueue();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(queue.onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("torrent-queue-confirm")).toBeNull();
  });

  it("asks before discarding a moved order", () => {
    const queue = renderQueue();
    const s2 = folder("S2");
    s2.focus();
    fireEvent.keyDown(s2, { key: "ArrowUp", altKey: true });

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(queue.onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("torrent-queue-confirm")).toBeDefined();
  });

  it("discards the order from the confirm block", () => {
    const queue = renderQueue();
    const s2 = folder("S2");
    s2.focus();
    fireEvent.keyDown(s2, { key: "ArrowUp", altKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "Do not save" }));

    expect(queue.onClose).toHaveBeenCalledTimes(1);
  });

  it("saves the order from the confirm block", async () => {
    const queue = renderQueue();
    const s2 = folder("S2");
    s2.focus();
    fireEvent.keyDown(s2, { key: "ArrowUp", altKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "Save order" }));

    await waitFor(() =>
      expect(queue.onApply).toHaveBeenCalledWith(expect.objectContaining({ order: [2, 1, 0] }))
    );
    await waitFor(() => expect(queue.onClose).toHaveBeenCalledTimes(1));
  });
});
