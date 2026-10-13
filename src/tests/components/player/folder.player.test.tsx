import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import FolderView from "@/routes/components/player/folder.player";
import { patchSettings } from "@/store/settings.store";
import type { FolderNode } from "@/types/torrent";

const TREE: FolderNode = {
  name: "Anime",
  path: "D:/Anime",
  files: [{ path: "D:/Anime/ep1.mkv", name: "ep1.mkv", size: 10 }],
  children: [
    {
      name: "Season 1",
      path: "D:/Anime/Season 1",
      files: [{ path: "D:/Anime/Season 1/s1e1.mkv", name: "s1e1.mkv", size: 10 }],
      children: [
        {
          name: "Extras",
          path: "D:/Anime/Season 1/Extras",
          files: [{ path: "D:/Anime/Season 1/Extras/x.mkv", name: "x.mkv", size: 10 }],
          children: [],
        },
      ],
    },
  ],
};

function renderTree(wrap?: (tree: React.ReactNode) => React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = <FolderView node={TREE} depth={0} searchQuery="" />;
  return render(
    <QueryClientProvider client={client}>{wrap ? wrap(tree) : tree}</QueryClientProvider>
  );
}

function row(path: string): HTMLElement {
  return screen.getByRole("button", { name: path.split("/").pop() ?? path });
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

describe("FolderView tree arrows", () => {
  it("closes an expanded folder row with Left", () => {
    renderTree();
    const root = row("D:/Anime");
    expect(root.getAttribute("aria-expanded")).toBe("true");

    pressKey("ArrowLeft", root);

    expect(row("D:/Anime").getAttribute("aria-expanded")).toBe("false");
  });

  it("moves focus to the parent folder with Left on a collapsed row", () => {
    renderTree();
    const season = row("D:/Anime/Season 1");
    season.focus();

    pressKey("ArrowLeft", season);

    expect(document.activeElement).toBe(row("D:/Anime"));
  });

  it("opens a collapsed folder row with Right and keeps the ring on it", () => {
    renderTree();
    const season = row("D:/Anime/Season 1");
    season.focus();
    pressKey("ArrowLeft", season);
    expect(row("D:/Anime/Season 1").getAttribute("aria-expanded")).toBe("false");

    pressKey("ArrowRight", row("D:/Anime/Season 1"));

    expect(row("D:/Anime/Season 1").getAttribute("aria-expanded")).toBe("true");
    expect((document.activeElement as HTMLElement | null)?.dataset.treePath).toBe(
      "D:/Anime/Season 1"
    );
  });

  it("moves focus to the first child with Right on an expanded row", () => {
    renderTree();
    const root = row("D:/Anime");
    root.focus();

    pressKey("ArrowRight", root);

    // The tree renders a folder's files before its subfolders, so the first
    // child of the root is its episode, not `Season 1`.
    expect((document.activeElement as HTMLElement | null)?.dataset.treePath).toBe(
      "D:/Anime/ep1.mkv"
    );
  });

  it("leaves the arrows alone when focus is outside the tree", () => {
    renderTree();
    const outside = document.createElement("button");
    document.body.append(outside);
    try {
      outside.focus();
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        code: "ArrowLeft",
      });
      act(() => {
        outside.dispatchEvent(event);
      });
      expect(event.defaultPrevented).toBe(false);
      expect(row("D:/Anime").getAttribute("aria-expanded")).toBe("true");
    } finally {
      outside.remove();
    }
  });

  it("does nothing for a row inside a hotkey-disabled layer", () => {
    renderTree((tree) => <div data-hotkeys-disabled>{tree}</div>);
    const root = row("D:/Anime");
    root.focus();

    pressKey("ArrowLeft", root);

    expect(root.getAttribute("aria-expanded")).toBe("true");
  });
});

// Section 13.2 of `vim-mode.md`: a fully expanded tree must stay reachable
// without a tab stop per row, so the movement keys walk folder *and* file rows.
describe("FolderView row movement", () => {
  function fileRow(name: string): HTMLElement {
    const node = screen.getByTitle(name).closest<HTMLElement>("[data-tree-row]");
    if (!node) throw new Error(`row missing for ${name}`);
    return node;
  }

  it("steps from the folder row onto its first file with Down", () => {
    renderTree();
    const root = row("D:/Anime");
    root.focus();

    pressKey("ArrowDown", root);

    expect(document.activeElement).toBe(fileRow("ep1.mkv"));
  });

  it("steps back up with K and stops at the first row", () => {
    renderTree();
    const file = fileRow("ep1.mkv");
    file.focus();

    pressKey("KeyK", file);
    expect(document.activeElement).toBe(row("D:/Anime"));

    pressKey("KeyK", row("D:/Anime"));
    expect(document.activeElement).toBe(row("D:/Anime"));
  });

  it("opens the focused file with Enter, exactly like a click", () => {
    renderTree();
    const file = fileRow("ep1.mkv");
    const name = file.querySelector<HTMLElement>("[data-tree-activate]");
    if (!name) throw new Error("activation target missing");
    const clicked = vi.fn();
    name.addEventListener("click", clicked);
    file.focus();

    pressKey("Enter", file);

    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("keeps the tree rows out of the tab order", () => {
    renderTree();
    expect(fileRow("ep1.mkv").tabIndex).toBe(-1);
  });
});
