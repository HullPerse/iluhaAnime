import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { scanHintTargets } from "@/lib/hotkeys/hints.hotkeys";
import { TorrentFileRow } from "@/routes/components/torrent/rows/file.rows";
import { FolderRow } from "@/routes/components/torrent/rows/folder.rows";
import { searchAtoms } from "@/store/search.store";
import { patchSettings } from "@/store/settings.store";
import type { TorrentTreeFile, TorrentTreeNode, TorrentTreeFileWithPath } from "@/types/torrent";

function treeFile(overrides: Partial<TorrentTreeFile> = {}): TorrentTreeFile {
  return {
    completed: false,
    displayName: "Show.S01E01.1080p.mkv",
    exists: true,
    index: 0,
    name: "Show.S01E01.1080p.mkv",
    on_disk_bytes: 0,
    priority: "normal",
    progress_bytes: 0,
    selected: true,
    size: 1000,
    ...overrides,
  };
}

function treeNode(): TorrentTreeNode {
  return { children: [], files: [treeFile()], name: "Season 1" };
}

function renderFileRow(
  props: Partial<Parameters<typeof TorrentFileRow>[0]> = {},
  onOpenInApp = vi.fn()
) {
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <TorrentFileRow
        file={treeFile()}
        depth={0}
        virtualStart={0}
        type="player"
        checked={false}
        queueMap={new Map()}
        path="/downloads/show"
        onOpenInApp={onOpenInApp}
        {...props}
      />
    </QueryClientProvider>
  );
  return { view, onOpenInApp };
}

function nameOf(label: string): HTMLElement {
  return screen.getByTitle(label);
}

const VISIBLE_RECT = {
  bottom: 30,
  height: 20,
  left: 10,
  right: 60,
  toJSON: () => ({}),
  top: 10,
  width: 50,
  x: 10,
  y: 10,
} as DOMRect;

let realRect: typeof Element.prototype.getBoundingClientRect;

beforeEach(() => {
  patchSettings({ language: "en" });
  realRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = () => VISIBLE_RECT;
});

afterEach(() => {
  Element.prototype.getBoundingClientRect = realRect;
  cleanup();
});

describe("TorrentFileRow queue position", () => {
  it("shows the queue number when the row belongs to the queue", () => {
    const first = renderFileRow({ queuePosition: 3 });

    expect(screen.getByTestId("torrent-file-queue-position").textContent).toBe("3.");

    first.view.unmount();
    renderFileRow();
    expect(screen.queryByTestId("torrent-file-queue-position")).toBeNull();
  });
});

describe("TorrentFileRow keyboard surface", () => {
  it("leaves torrent rows as plain text with no tab stop", () => {
    renderFileRow({ type: "torrent", path: undefined, onOpenInApp: undefined });

    const name = nameOf("Show.S01E01.1080p.mkv");
    expect(name.getAttribute("role")).toBeNull();
    expect(name.getAttribute("tabindex")).toBeNull();
    expect(name.dataset.vimTarget).toBeUndefined();
  });

  it("exposes player rows as a hintable button", () => {
    renderFileRow();

    const name = nameOf("Show.S01E01.1080p.mkv");
    expect(name.getAttribute("role")).toBe("button");
    expect(name.getAttribute("tabindex")).toBe("0");
    expect(name.dataset.vimTarget).toBe("file");
    expect(name.dataset.vimContextmenu).toBe("file");
  });

  it("runs the AniList search on Enter and Space, and ignores other keys", () => {
    renderFileRow();
    const name = nameOf("Show.S01E01.1080p.mkv");

    fireEvent.keyDown(name, { key: "Enter" });
    expect(searchAtoms.anilistSearchQuery.get()).toContain("Show");

    searchAtoms.anilistSearchQuery.set(null);
    fireEvent.keyDown(name, { key: " " });
    expect(searchAtoms.anilistSearchQuery.get()).toContain("Show");

    searchAtoms.anilistSearchQuery.set(null);
    fireEvent.keyDown(name, { key: "a" });
    expect(searchAtoms.anilistSearchQuery.get()).toBeNull();
  });

  it("does not run the AniList search on plain click", () => {
    renderFileRow({ file: treeFile({ completed: true }) });
    const name = nameOf("Show.S01E01.1080p.mkv");
    searchAtoms.anilistSearchQuery.set(null);

    fireEvent.click(name);

    expect(searchAtoms.anilistSearchQuery.get()).toBeNull();
  });

  it("drops the tab stop for extra files such as subtitles", () => {
    renderFileRow({ file: treeFile({ name: "ep1.srt", displayName: "ep1.srt" }) });

    const name = nameOf("ep1.srt");
    expect(name.getAttribute("role")).toBeNull();
    expect(name.dataset.vimTarget).toBeUndefined();
  });

  it("advertises the ctrl-click variant only when the file can open in the app", () => {
    const ready = renderFileRow({ file: treeFile({ completed: true }) });
    expect(nameOf("Show.S01E01.1080p.mkv").dataset.vimCtrlclick).toBe("file");
    ready.view.unmount();
    cleanup();

    renderFileRow({ file: treeFile({ completed: true, exists: false }) });
    expect(nameOf("Show.S01E01.1080p.mkv").dataset.vimCtrlclick).toBeUndefined();
    cleanup();

    // A file that is still downloading can be streamed on demand.
    renderFileRow({ file: treeFile({ completed: false, selected: true }) });
    expect(nameOf("Show.S01E01.1080p.mkv").dataset.vimCtrlclick).toBe("file");
  });

  it("hides the ctrl-click variant while the file is queued", () => {
    const fullPath = "/downloads/show/Show.S01E01.1080p.mkv";
    const queued = renderFileRow({
      file: { ...treeFile({ completed: true }), fullPath } as TorrentTreeFileWithPath,
      queueMap: new Map([[fullPath, "processing"]]),
    });

    expect(nameOf("Show.S01E01.1080p.mkv").dataset.vimCtrlclick).toBeUndefined();
    expect(queued.onOpenInApp).not.toHaveBeenCalled();
  });

  it("hides the ctrl-click variant when no handler is wired", () => {
    renderFileRow({ file: treeFile({ completed: true }), onOpenInApp: undefined });

    expect(nameOf("Show.S01E01.1080p.mkv").dataset.vimCtrlclick).toBeUndefined();
  });

  it("marks the download checkbox as a hint target", () => {
    const onToggleFile = vi.fn();
    renderFileRow({ onToggleFile });

    const box = screen.getByRole("checkbox", { name: "Show.S01E01.1080p.mkv" });
    expect((box as HTMLElement).dataset.vimTarget).toBe("file-check");

    fireEvent.click(box);
    expect(onToggleFile).toHaveBeenCalledWith(true);
  });
});

describe("Torrent rows through the hint scanner", () => {
  it("finds the name cell, its variants, and the checkbox", () => {
    renderFileRow({ onToggleFile: vi.fn() });

    const nameBadges = scanHintTargets(document.body).badges.filter(
      (badge) => badge.element === nameOf("Show.S01E01.1080p.mkv")
    );
    expect(nameBadges.map((badge) => badge.variant)).toEqual([
      "plain",
      "ctrl",
      "contextmenu",
    ]);
    expect(nameBadges.every((badge) => badge.label.length > 0)).toBe(true);

    const checkBox = screen.getByRole("checkbox", { name: "Show.S01E01.1080p.mkv" });
    const boxBadges = scanHintTargets(document.body).badges.filter(
      (badge) => badge.element === checkBox
    );
    expect(boxBadges.map((badge) => badge.variant)).toEqual(["plain"]);
  });

  it("adds the ctrl badge for a finished file and skips its disabled checkbox", () => {
    renderFileRow({ file: treeFile({ completed: true }), onToggleFile: vi.fn() });

    const labels = (element: HTMLElement) =>
      scanHintTargets(document.body)
        .badges.filter((badge) => badge.element === element)
        .map((badge) => badge.variant);

    expect(labels(nameOf("Show.S01E01.1080p.mkv"))).toEqual(["plain", "ctrl", "contextmenu"]);
    expect(labels(screen.getByRole("checkbox", { name: "Show.S01E01.1080p.mkv" }))).toEqual([]);
  });

  it("leaves torrent-type rows out of the hint layer", () => {
    renderFileRow({ type: "torrent", path: undefined, onOpenInApp: undefined });

    const name = nameOf("Show.S01E01.1080p.mkv");
    const found = scanHintTargets(document.body).badges.some((badge) => badge.element === name);
    expect(found).toBe(false);
  });
});

describe("FolderRow keyboard surface", () => {
  function renderFolder(node: TorrentTreeNode, isOpen = false) {
    const onToggleFolder = vi.fn();
    const view = render(
      <FolderRow
        node={node}
        depth={0}
        virtualStart={0}
        files={[treeFile()]}
        isOpen={isOpen}
        type="torrent"
        treePath="Season 10"
        onToggleFolder={onToggleFolder}
      />
    );
    return { view, onToggleFolder };
  }

  it("is a hintable, expandable button", () => {
    renderFolder(treeNode(), true);

    const toggle = screen.getByRole("button", { name: /Season 1/ });
    expect(toggle.getAttribute("tabindex")).toBe("0");
    expect(toggle.dataset.vimTarget).toBe("folder");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("toggles on click, Enter and Space", () => {
    const { onToggleFolder } = renderFolder(treeNode());

    const toggle = screen.getByRole("button", { name: /Season 1/ });
    fireEvent.click(toggle);
    fireEvent.keyDown(toggle, { key: "Enter" });
    fireEvent.keyDown(toggle, { key: " " });
    fireEvent.keyDown(toggle, { key: "z" });

    expect(onToggleFolder).toHaveBeenCalledTimes(3);
  });
});
