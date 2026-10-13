import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockOpenPath } from "../../mocks";

// The real virtualizer measures a zero-height scroll element in jsdom and
// renders no rows at all, so it is stubbed with the identity mapping.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 20,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ index, start: index * 20, key: index })),
    scrollToIndex: () => undefined,
  }),
}));

import TorrentFilesSection from "@/routes/components/torrent/file.torrent";
import { patchSettings } from "@/store/settings.store";
import { setVimCount } from "@/store/vim.store";
import type { TorrentFileInfo } from "@/types/torrent";

function info(index: number, name: string): TorrentFileInfo {
  return {
    index,
    name,
    size: 10,
    progress_bytes: 10,
    completed: true,
    selected: false,
    priority: "normal",
    exists: true,
  };
}

const FILES: TorrentFileInfo[] = [info(0, "A/a1.mkv"), info(1, "A/a2.mkv"), info(2, "B/b1.mkv")];

function renderSection(onPlay = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TorrentFilesSection id={1} files={FILES} type="player" path="D:/media" onPlay={onPlay} />
    </QueryClientProvider>
  );
  return { onPlay };
}

function folderRow(name: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(`[data-tree-path="${name}0"]`);
  if (!node) throw new Error(`folder row missing: ${name}`);
  return node;
}

function fileRow(index: number): HTMLElement {
  const node = document.querySelector<HTMLElement>(`[data-tree-path="file:${index}"]`);
  if (!node) throw new Error(`file row missing: ${index}`);
  return node;
}

function openFolder(name: string): void {
  const row = folderRow(name);
  row.focus();
  pressKey("ArrowRight", row);
}

function pressKey(code: string, target: EventTarget): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, code }));
  });
}

beforeEach(() => {
  patchSettings({ language: "en" });
});

afterEach(() => {
  cleanup();
});

describe("TorrentFilesSection ring", () => {
  it("opens a folder with Right and steps onto its first file with Down", () => {
    renderSection();
    const folder = folderRow("A");
    folder.focus();

    pressKey("ArrowRight", folder);
    expect(
      folderRow("A").querySelector("[data-tree-activate]")?.getAttribute("aria-expanded")
    ).toBe("true");

    pressKey("ArrowDown", folderRow("A"));
    expect(document.activeElement).toBe(fileRow(0));
  });

  it("activates the folder toggle with Enter, exactly like a click", () => {
    renderSection();
    const folder = folderRow("A");
    const toggle = folder.querySelector<HTMLElement>("[data-tree-activate]");
    if (!toggle) throw new Error("activation target missing");
    const spy = vi.fn();
    toggle.addEventListener("click", spy);
    folder.focus();

    pressKey("Enter", folder);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(
      folderRow("A").querySelector("[data-tree-activate]")?.getAttribute("aria-expanded")
    ).toBe("true");
  });

  it("moves two rows down with a count and J", () => {
    renderSection();
    openFolder("A");
    const first = fileRow(0);
    first.focus();
    setVimCount("2");

    pressKey("KeyJ", first);

    // a1 -> a2 -> B: two flat steps, crossing no boundary silently.
    expect((document.activeElement as HTMLElement | null)?.dataset.treePath).toBe("B0");
  });

  it("leaves the keys alone when focus is outside the section", () => {
    renderSection();
    const outside = document.createElement("button");
    document.body.append(outside);
    try {
      outside.focus();
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        code: "KeyJ",
      });
      act(() => {
        outside.dispatchEvent(event);
      });
      expect(event.defaultPrevented).toBe(false);
    } finally {
      outside.remove();
    }
  });
});

describe("TorrentFilesSection row actions", () => {
  function actionTarget(index: number, action: string): { row: HTMLElement; button: HTMLElement } {
    openFolder("A");
    const row = fileRow(index);
    const holder = row.querySelector<HTMLElement>(`[data-file-action="${action}"]`);
    const button =
      holder?.tagName === "BUTTON" ? holder : holder?.querySelector<HTMLElement>("button");
    if (!button) throw new Error(`action target missing: ${action}`);
    row.focus();
    return { row, button };
  }

  it("clicks the external button with O", () => {
    renderSection();
    const { row, button } = actionTarget(0, "external");
    const spy = vi.fn();
    button.addEventListener("click", spy);

    pressKey("KeyO", row);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("plays builtin with P", () => {
    const { onPlay } = renderSection();
    const { row, button } = actionTarget(0, "builtin");
    const spy = vi.fn();
    button.addEventListener("click", spy);

    pressKey("KeyP", row);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it("searches with S through the name activation", () => {
    renderSection();
    openFolder("A");
    const row = fileRow(0);
    const name = row.querySelector<HTMLElement>("[data-tree-activate]");
    if (!name) throw new Error("activation target missing");
    const spy = vi.fn();
    name.addEventListener("click", spy);
    row.focus();

    pressKey("KeyS", row);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("clicks the upscale trigger with E", () => {
    renderSection();
    const { row, button } = actionTarget(0, "upscale");
    const spy = vi.fn();
    button.addEventListener("click", spy);

    pressKey("KeyE", row);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("dispatches a contextmenu on the name with R", () => {
    renderSection();
    openFolder("A");
    const row = fileRow(0);
    const name = row.querySelector<HTMLElement>("[data-tree-activate]");
    if (!name) throw new Error("activation target missing");
    const spy = vi.fn();
    name.addEventListener("contextmenu", spy);
    row.focus();

    pressKey("KeyR", row);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("ignores row actions on folder rows", () => {
    renderSection();
    const folder = folderRow("A");
    folder.focus();

    pressKey("KeyO", folder);

    expect(document.activeElement).toBe(folder);
  });
});

describe("TorrentFilesSection file menu", () => {
  function menuitems(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  }

  function menuitem(name: string): HTMLElement {
    const found = menuitems().find((entry) => entry.textContent === name);
    if (!found) throw new Error(`menu entry missing: ${name}`);
    return found;
  }

  function openMenu(index: number): HTMLElement {
    openFolder("A");
    const row = fileRow(index);
    const target = row.querySelector<HTMLElement>("[data-tree-activate]");
    if (!target) throw new Error("activation target missing");
    fireEvent.contextMenu(target);
    return row;
  }

  it("opens five entries on right click", async () => {
    renderSection();
    openMenu(0);

    await waitFor(() => expect(menuitems()).toHaveLength(5));
  });

  it("fires the row's own button from a menu entry", async () => {
    const { onPlay } = renderSection();
    const row = openMenu(0);
    const holder = row.querySelector<HTMLElement>('[data-file-action="builtin"]');
    if (!holder) throw new Error("builtin button missing");
    const spy = vi.fn();
    holder.addEventListener("click", spy);

    await waitFor(() => menuitem("Open in iluhaAnime player"));
    await userEvent.click(menuitem("Open in iluhaAnime player"));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it("reveals the save folder from the menu", async () => {
    renderSection();
    openMenu(0);

    await waitFor(() => menuitem("Open in folder"));
    await userEvent.click(menuitem("Open in folder"));

    expect(mockOpenPath).toHaveBeenCalledWith("D:/media");
  });

  it("skips the menu on Ctrl+right-click", async () => {
    renderSection();
    openFolder("A");
    const row = fileRow(0);
    const target = row.querySelector<HTMLElement>("[data-tree-activate]");
    if (!target) throw new Error("activation target missing");

    fireEvent.contextMenu(target, { ctrlKey: true });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(menuitems()).toHaveLength(0);
  });
});
