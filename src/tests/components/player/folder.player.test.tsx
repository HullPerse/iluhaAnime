import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

import FolderView from "@/routes/components/player/folder.player";
import { searchAtoms } from "@/store/search.store";
import { patchSettings } from "@/store/settings.store";
import { setVimCount } from "@/store/vim.store";
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

const FLAT: FolderNode = {
  name: "video",
  path: "D:/video",
  files: [
    { path: "D:/video/a.mkv", name: "a.mkv", size: 10 },
    { path: "D:/video/b.mkv", name: "b.mkv", size: 11 },
  ],
  children: [],
};

function renderFlat(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <FolderView node={FLAT} depth={0} searchQuery="" />
    </QueryClientProvider>
  );
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

  it("opens the focused file with Enter through the external button", () => {
    renderTree();
    const file = fileRow("ep1.mkv");
    const holder = file.querySelector<HTMLElement>('[data-file-action="external"]');
    if (!holder) throw new Error("external button missing");
    const clicked = vi.fn();
    holder.addEventListener("click", clicked);
    file.focus();

    pressKey("Enter", file);

    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("moves focus to the row on plain click instead of opening the player", () => {
    renderTree();
    const file = fileRow("ep1.mkv");
    const name = file.querySelector<HTMLElement>("[data-tree-activate]");
    if (!name) throw new Error("activation target missing");
    const before = mockOpenPath.mock.calls.length;

    fireEvent.click(name);

    expect(document.activeElement).toBe(file);
    expect(mockOpenPath.mock.calls.length).toBe(before);
  });

  it("keeps the AniList search on Ctrl+click", () => {
    renderTree();
    const file = fileRow("ep1.mkv");
    const name = file.querySelector<HTMLElement>("[data-tree-activate]");
    if (!name) throw new Error("activation target missing");

    fireEvent.click(name, { ctrlKey: true });

    expect(searchAtoms.anilistSearchQuery.get()).not.toBeNull();
    searchAtoms.anilistSearchQuery.set(null);
  });

  it("keeps the tree rows out of the tab order", () => {
    renderTree();
    expect(fileRow("ep1.mkv").tabIndex).toBe(-1);
  });
});

describe("FolderView flat folders", () => {
  it("renders file rows without subfolders", () => {
    renderFlat();
    expect(document.querySelector('[data-tree-path="D:/video/a.mkv"]')).not.toBeNull();
    expect(document.querySelector('[data-tree-path="D:/video/b.mkv"]')).not.toBeNull();
  });

  it("dives from an external root header into the first row", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <div data-tree-row data-tree-path="D:/video">
          <button type="button">head</button>
          <FolderView node={FLAT} depth={0} searchQuery="" hideRoot />
        </div>
      </QueryClientProvider>
    );
    const head = screen.getByText("head");
    head.focus();
    pressKey("ArrowDown", head);
    expect((document.activeElement as HTMLElement | null)?.dataset.treePath).toBe("D:/video/a.mkv");
  });

  it("stays put on Up from an external root header", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <div data-tree-row data-tree-path="D:/video">
          <button type="button">top</button>
          <FolderView node={FLAT} depth={0} searchQuery="" hideRoot />
        </div>
      </QueryClientProvider>
    );
    const top = screen.getByText("top");
    top.focus();
    pressKey("ArrowUp", top);
    expect(document.activeElement).toBe(top);
  });
});

// Counts ride the engine buffer; the movement itself is the tree's job, so a
// buffered count must step that many flat rows (siblings or not).
describe("FolderView count steps", () => {
  const FOUR: FolderNode = {
    name: "video",
    path: "D:/video",
    files: [
      { path: "D:/video/1.mkv", name: "1.mkv", size: 10 },
      { path: "D:/video/2.mkv", name: "2.mkv", size: 10 },
      { path: "D:/video/3.mkv", name: "3.mkv", size: 10 },
      { path: "D:/video/4.mkv", name: "4.mkv", size: 10 },
    ],
    children: [],
  };

  function renderFour(): void {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <FolderView node={FOUR} depth={0} searchQuery="" />
      </QueryClientProvider>
    );
  }

  function fileRow(name: string): HTMLElement {
    const node = screen.getByTitle(name).closest<HTMLElement>("[data-tree-row]");
    if (!node) throw new Error(`row missing for ${name}`);
    return node;
  }

  it("moves two flat rows up with a count and K", () => {
    renderFour();
    const file = fileRow("4.mkv");
    file.focus();
    setVimCount("2");

    pressKey("KeyK", file);

    expect((document.activeElement as HTMLElement | null)?.dataset.treePath).toBe("D:/video/2.mkv");
  });

  it("moves two flat rows down with a count and J", () => {
    renderFour();
    const file = fileRow("1.mkv");
    file.focus();
    setVimCount("2");

    pressKey("KeyJ", file);

    expect((document.activeElement as HTMLElement | null)?.dataset.treePath).toBe("D:/video/3.mkv");
  });

  it("drops a pending count on Enter", () => {
    renderFour();
    const file = fileRow("4.mkv");
    file.focus();
    setVimCount("2");

    pressKey("Enter", file);
    pressKey("KeyK", file);

    expect((document.activeElement as HTMLElement | null)?.dataset.treePath).toBe("D:/video/3.mkv");
  });
});

describe("FolderView row actions", () => {
  function fileRow(name: string): HTMLElement {
    const node = screen.getByTitle(name).closest<HTMLElement>("[data-tree-row]");
    if (!node) throw new Error(`row missing for ${name}`);
    return node;
  }

  function clicked(action: string): { file: HTMLElement; spy: ReturnType<typeof vi.fn> } {
    renderTree();
    const file = fileRow("ep1.mkv");
    const holder = file.querySelector<HTMLElement>(`[data-file-action="${action}"]`);
    const target =
      holder?.tagName === "BUTTON" ? holder : holder?.querySelector<HTMLElement>("button");
    if (!target) throw new Error(`action target missing: ${action}`);
    const spy = vi.fn();
    target.addEventListener("click", spy);
    file.focus();
    return { file, spy };
  }

  it("clicks the external button with O", () => {
    const { file, spy } = clicked("external");
    pressKey("KeyO", file);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("clicks the builtin button with P", () => {
    const { file, spy } = clicked("builtin");
    pressKey("KeyP", file);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("clicks the search button with S", () => {
    const { file, spy } = clicked("search");
    pressKey("KeyS", file);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("clicks the upscale trigger with E", () => {
    const { file, spy } = clicked("upscale");
    pressKey("KeyE", file);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("dispatches a contextmenu on the name with R", () => {
    renderTree();
    const file = fileRow("ep1.mkv");
    const name = file.querySelector<HTMLElement>("[data-tree-activate]");
    if (!name) throw new Error("activation target missing");
    const spy = vi.fn();
    name.addEventListener("contextmenu", spy);
    file.focus();

    pressKey("KeyR", file);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("ignores row actions on folder rows", () => {
    renderTree();
    const season = row("D:/Anime/Season 1");
    season.focus();

    pressKey("KeyO", season);

    expect(document.activeElement).toBe(season);
  });
});

describe("FolderView file menu", () => {
  function fileRow(name: string): HTMLElement {
    const node = screen.getByTitle(name).closest<HTMLElement>("[data-tree-row]");
    if (!node) throw new Error(`row missing for ${name}`);
    return node;
  }

  function openMenu(name: string): HTMLElement {
    const file = fileRow(name);
    const target = file.querySelector<HTMLElement>("[data-tree-activate]");
    if (!target) throw new Error("activation target missing");
    fireEvent.contextMenu(target);
    return file;
  }

  it("opens five entries on right click", async () => {
    renderTree();
    openMenu("ep1.mkv");

    await waitFor(() => expect(screen.getAllByRole("menuitem")).toHaveLength(5));
  });

  it("fires the row's own button from a menu entry", async () => {
    renderTree();
    const file = openMenu("ep1.mkv");
    const holder = file.querySelector<HTMLElement>('[data-file-action="builtin"]');
    if (!holder) throw new Error("builtin button missing");
    const spy = vi.fn();
    holder.addEventListener("click", spy);

    await waitFor(() => screen.getByRole("menuitem", { name: "Open in iluhaAnime player" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Open in iluhaAnime player" }));

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("reveals the save folder from the menu", async () => {
    renderTree();
    openMenu("ep1.mkv");

    await waitFor(() => screen.getByRole("menuitem", { name: "Open in folder" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Open in folder" }));

    expect(mockOpenPath).toHaveBeenCalledWith("D:/Anime/");
  });

  it("skips the menu on Ctrl+right-click", () => {
    renderTree();
    const file = fileRow("ep1.mkv");
    const target = file.querySelector<HTMLElement>("[data-tree-activate]");
    if (!target) throw new Error("activation target missing");

    // The capture intercept preventDefaults (dispatch reports it) and stops
    // propagation, so the trigger never fires and no menu state is scheduled.
    expect(fireEvent.contextMenu(target, { ctrlKey: true })).toBe(false);
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
  });
});
