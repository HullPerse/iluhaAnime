import { useVirtualizer } from "@tanstack/react-virtual";
import { openPath } from "@tauri-apps/plugin-opener";
import { cn } from "cn";
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  ListVideo,
  Monitor,
  EyeOff,
  Play,
  Search,
  Wand2,
  X,
} from "lucide-react";
import { useState, useRef, useMemo, useCallback, useEffect, type RefObject } from "react";

import ContextMenu from "@/components/shared/contextMenu.component";
import type { ContextMenuEntry } from "@/components/shared/contextMenu.component";
import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { FOLDER_LIST_MAX_HEIGHT, FOLDER_VIRTUALIZE_AFTER } from "@/config/player/folders.config";
import { useResolvedHotkeys } from "@/hooks/hotkeys.hook";
import type { ResolvedHotkeyDef } from "@/hooks/hotkeys.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { clickRowActionButton, dispatchClick } from "@/lib/hotkeys/dispatch.hotkeys";
import { mediaFileExtension, parseMediaPath } from "@/lib/media/parse.utils";
import { loadWatch, openPlayer } from "@/lib/player/playback.utils";
import { formatParsedTitle } from "@/lib/player/title.utils";
import { findFolderContainingFile, flattenTree, folderFilePaths } from "@/lib/player/tree.utils";
import { relativeRowNumber, resolveTreeArrow, resolveTreeMove } from "@/lib/player/treeArrow.utils";
import type { TreeRow } from "@/lib/player/treeArrow.utils";
import { useCell } from "@/lib/state/signal.hook";
import { withFallback } from "@/lib/utils/attempt.utils";
import { formatBytes } from "@/lib/utils/bytes.utils";
import { openFileInPlayer } from "@/lib/utils/media.utils";
import { showError } from "@/lib/utils/notification.utils";
import { ignore } from "@/lib/utils/promise.utils";
import { setAnilistSearchQuery } from "@/store/search.store";
import { settingsAtoms } from "@/store/settings.store";
import { upscaleItems } from "@/store/upscale.store";
import { setVimCount, vimAtoms } from "@/store/vim.store";
import type { FolderNode } from "@/types/torrent";

import UpscalePlayer from "./upscale/modal.upscale";

/** Section 13.3 of `vim-mode.md`: the tree owns its own arrows, and only while
 *  one of its folder rows actually has focus. Row actions (o/p/s/e/r) fire
 *  only on file rows: they click the row's own buttons, so key and mouse can
 *  never disagree - the ctrl+click variants are covered because the clicks
 *  land on the same buttons those variants duplicate. */
type TreeKeyAction =
  | "treeCollapse"
  | "treeExpand"
  | "treeUp"
  | "treeDown"
  | "treeActivate"
  | "rowExternal"
  | "rowBuiltin"
  | "rowSearch"
  | "rowUpscale"
  | "rowReveal";

const TREE_KEYBINDS: ResolvedHotkeyDef<TreeKeyAction>[] = [
  { id: "treeCollapse", chord: "ArrowLeft", repeat: "hold", keybindId: "tree.collapse" },
  { id: "treeExpand", chord: "ArrowRight", repeat: "hold", keybindId: "tree.expand" },
  // Both physical keys share one manifest entry: rebinding collapses the
  // arrow alias into the single new chord.
  { id: "treeUp", chord: "ArrowUp", repeat: "hold", keybindId: "tree.move.up" },
  { id: "treeDown", chord: "ArrowDown", repeat: "hold", keybindId: "tree.move.down" },
  { id: "treeUp", chord: "KeyK", repeat: "hold", keybindId: "tree.move.up" },
  { id: "treeDown", chord: "KeyJ", repeat: "hold", keybindId: "tree.move.down" },
  { id: "treeActivate", chord: "Enter", repeat: "once", keybindId: "tree.activate" },
  { id: "rowExternal", chord: "KeyO", repeat: "once", keybindId: "tree.external" },
  { id: "rowBuiltin", chord: "KeyP", repeat: "once", keybindId: "tree.builtin" },
  { id: "rowSearch", chord: "KeyS", repeat: "once", keybindId: "tree.search" },
  { id: "rowUpscale", chord: "KeyE", repeat: "once", keybindId: "tree.upscale" },
  { id: "rowReveal", chord: "KeyR", repeat: "once", keybindId: "tree.reveal" },
];

function rowElement(target: EventTarget | null): HTMLElement | null {
  return target instanceof HTMLElement ? target.closest<HTMLElement>("[data-tree-row]") : null;
}

type FileRowAction = "external" | "builtin" | "search" | "upscale" | "reveal";

const FILE_ACTION_BY_KEY: Partial<Record<TreeKeyAction, FileRowAction>> = {
  rowExternal: "external",
  rowBuiltin: "builtin",
  rowSearch: "search",
  rowUpscale: "upscale",
  rowReveal: "reveal",
};

function runFileRowAction(row: HTMLElement, action: FileRowAction): void {
  if (action === "reveal") {
    const name = row.querySelector<HTMLElement>("[data-tree-activate]");
    if (name) dispatchClick(name, "contextmenu");
    return;
  }
  clickRowActionButton(row, action);
}

function moveRingFocus(
  treeRows: TreeRow[],
  treeRef: RefObject<HTMLDivElement | null>,
  nodePath: string,
  path: string,
  direction: -1 | 1
): void {
  if (path === nodePath && !treeRows.some((row) => row.path === path)) {
    // External root header (the draggable folder head): dive into the first
    // row on Down, stay put on Up.
    if (direction > 0) {
      const first = treeRows[0];
      if (first) findRow(treeRef.current, first.path)?.focus();
    }
    return;
  }
  const count = vimAtoms.count.get();
  setVimCount("");
  const step = count === "" ? 1 : Math.max(Number.parseInt(count, 10) || 1, 1);
  const next = resolveTreeMove(treeRows, path, direction * step);
  if (next) findRow(treeRef.current, next)?.focus();
}

/** Rows are virtualized and carry no stable DOM id, so the row is looked up by
 *  the path it renders rather than by escaping into a selector. */
function findRow(root: HTMLElement | null, path: string): HTMLElement | null {
  if (!root) return null;
  for (const row of root.querySelectorAll<HTMLElement>("[data-tree-row]")) {
    if (row.dataset.treePath === path) return row;
  }
  return null;
}

function TreeRowNumber({
  rows,
  anchorPath,
  rowPath,
}: {
  rows: readonly TreeRow[];
  anchorPath: string | null;
  rowPath: string;
}) {
  const number = relativeRowNumber(rows, anchorPath, rowPath);
  if (!number) return null;
  return (
    <span
      aria-hidden="true"
      className={
        number.current
          ? "bg-secondary text-title-text w-5 shrink-0 px-0.5 text-right text-[10px] tabular-nums select-none"
          : "text-hint w-5 shrink-0 text-right text-[10px] tabular-nums select-none"
      }
    >
      {number.label}
    </span>
  );
}

function FolderView({
  node,
  depth,
  searchQuery,
  onRemove,
  onGenerate,
  onHide,
  isGenerating,
  disabledExtensions,
  hideRoot,
  contentSized,
  listMaxHeight,
  listMinHeight,
  scrollRef,
}: {
  node: FolderNode;
  depth: number;
  searchQuery: string;
  onRemove?: (path: string) => void;
  onGenerate?: (path: string, name: string) => void;
  onHide?: (path: string) => void;
  isGenerating?: boolean;
  disabledExtensions?: Set<string>;
  hideRoot?: boolean;
  contentSized?: boolean;
  listMaxHeight?: number;
  listMinHeight?: number;
  scrollRef?: RefObject<HTMLDivElement | null>;
}) {
  const showTrackFiles = useCell(settingsAtoms.showTrackFiles);
  const audioExtensions = useCell(settingsAtoms.audioExtensions);
  const subtitleExtensions = useCell(settingsAtoms.subtitleExtensions);
  const parseTitles = useCell(settingsAtoms.parseTitlesPlayer);
  const { t } = useI18n();

  const items = useCell(upscaleItems);

  const queueMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const item of items) {
      m.set(item.filePath, item.status);
    }
    return m;
  }, [items]);

  const trackExts = useMemo(
    () =>
      showTrackFiles === "hide" || showTrackFiles === "torrent"
        ? new Set([...audioExtensions, ...subtitleExtensions])
        : undefined,
    [showTrackFiles, audioExtensions, subtitleExtensions]
  );

  const [open, setOpen] = useState<Set<string>>(
    () => new Set(node.children.length > 0 ? [node.path] : [])
  );
  const localScrollRef = useRef<HTMLDivElement>(null);
  const scrollElementRef = scrollRef ?? localScrollRef;

  const toggle = useCallback((path: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const openInAppPlayer = useCallback(
    async (path: string) => {
      const stored = await withFallback(loadWatch(path), null);
      const folder = findFolderContainingFile(node, path);
      const paths = folder ? folderFilePaths(folder) : [];
      const index = paths.indexOf(path);
      const resume = stored && stored.position > 0 ? stored.position : undefined;
      // Keep the queue in its sorted order and let the backend start at the
      // chosen episode, so the playlist reads 1..N instead of rotating.
      await openPlayer(
        paths.length > 0 ? paths : [path],
        resume,
        Math.max(index, 0),
        folder ? { kind: "folder", root: folder.path, anchor: path } : undefined
      ).catch((error: unknown) => {
        showError(t("player.folder.open.failed.player"), String(error));
      });
    },
    [node, t]
  );

  const flatItems = useMemo(
    () => flattenTree(node, open, searchQuery, disabledExtensions, depth, trackExts),
    [node, open, searchQuery, disabledExtensions, depth, trackExts]
  );

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => 20,
    overscan: 20,
  });

  const treeRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const [anchorPath, setAnchorPath] = useState<string | null>(null);

  // Every visible row, in render order. Folder rows are the tab stops (they
  // already were); file rows are reached from them by the movement keys, so a
  // fully expanded tree does not cost a tab stop per episode.
  const treeRows = useMemo<TreeRow[]>(() => {
    const header: TreeRow[] =
      !hideRoot || depth > 0
        ? [{ path: node.path, depth, kind: "folder", expanded: open.has(node.path) }]
        : [];
    return [
      ...header,
      ...flatItems.map((item) =>
        item.kind === "folder"
          ? {
              path: item.node.path,
              depth: item.depth,
              kind: "folder" as const,
              expanded: open.has(item.node.path),
            }
          : {
              path: item.file.path,
              depth: item.depth,
              kind: "file" as const,
              expanded: false,
            }
      ),
    ];
  }, [depth, flatItems, hideRoot, node.path, open]);

  // Opening a folder adds rows above the one that was focused, and the virtual
  // nodes are reused positionally, so the ring is restored by path after the
  // commit instead of trusting DOM identity.
  useEffect(() => {
    const path = pendingFocus.current;
    if (!path) return;
    pendingFocus.current = null;
    findRow(treeRef.current, path)?.focus();
  }, [open]);

  useResolvedHotkeys<TreeKeyAction>(TREE_KEYBINDS, {
    // Only the tree holding the focused folder row answers, so the arrows keep
    // their normal meaning everywhere else on this route. The draggable header
    // above this view is its root row too: it carries the root path but lives
    // outside treeRef, so it is accepted by path. A row is a button, which the
    // shared filter would skip, so the modal guard is applied here.
    ignore: (event) => {
      const row = rowElement(event.target);
      if (!row) return true;
      if (row.dataset.treePath !== node.path && !treeRef.current?.contains(row)) return true;
      return Boolean(row.closest("[data-hotkeys-disabled]"));
    },
    onAction: (action, event) => {
      const row = rowElement(event.target);
      const path = row?.dataset.treePath;
      if (!path) return;

      if (action === "treeActivate") {
        // Enter performs the row's external button: the file name no longer
        // acts on a plain mouse click (the Monitor icon owns that), so the
        // keyboard goes straight to the button instead of the name span.
        // A pending count means nothing here either: without the drop,
        // `3 Enter j` would step two.
        setVimCount("");
        clickRowActionButton(row, "external");
        return;
      }

      if (action === "treeUp" || action === "treeDown") {
        moveRingFocus(treeRows, treeRef, node.path, path, action === "treeUp" ? -1 : 1);
        return;
      }

      const fileAction = FILE_ACTION_BY_KEY[action];
      if (fileAction !== undefined) {
        // File rows only: folder rows are <button>s without file buttons, and
        // the header row has neither. A pending count has no meaning for an
        // action, so it is dropped instead of leaking into the next motion.
        setVimCount("");
        if (row.dataset.vimTarget !== "file") return;
        runFileRowAction(row, fileAction);
        return;
      }

      const result = resolveTreeArrow(treeRows, path, action === "treeCollapse" ? "left" : "right");
      if (!result) return;
      if (result.kind === "focus") {
        findRow(treeRef.current, result.path)?.focus();
        return;
      }
      pendingFocus.current = result.path;
      toggle(result.path);
    },
  });

  const isDisabled = (name: string) => {
    const ext = mediaFileExtension(name);
    if (!ext) return false;
    return (
      disabledExtensions?.has(ext) === true ||
      audioExtensions.includes(ext) ||
      subtitleExtensions.includes(ext)
    );
  };

  const countAll = node.files.length + node.children.reduce((s, c) => s + c.files.length, 0);

  if (flatItems.length === 0) return null;

  const showHeader = !hideRoot || depth > 0;

  return (
    <div
      ref={treeRef}
      className="flex w-full flex-col"
      onFocus={(event) => {
        const row = rowElement(event.target);
        const path = row?.dataset.treePath;
        if (path) setAnchorPath(path);
      }}
    >
      {showHeader && (
        <div
          className="windows95-text flex w-full items-center gap-1 px-0.5 py-0.5"
          style={{
            paddingLeft: `${depth * 12 + 2}px`,
          }}
        >
          <button
            type="button"
            data-tree-row
            data-tree-path={node.path}
            data-tree-depth={depth}
            aria-expanded={open.has(node.path)}
            aria-label={node.name}
            className="windows95-text hover:bg-surface focus-visible:outline-text flex min-w-0 flex-1 cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-left focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
            onClick={() => toggle(node.path)}
            data-tree-activate
          >
            {open.has(node.path) ? (
              <ChevronDown className="size-3 shrink-0" />
            ) : (
              <ChevronRight className="size-3 shrink-0" />
            )}
            <TreeRowNumber rows={treeRows} anchorPath={anchorPath} rowPath={node.path} />
            <ImageComponent
              src="/images/w2k_folder_closed.ico"
              alt=""
              className="size-4 shrink-0"
            />
            <span className="truncate select-none" title={node.name}>
              {node.name}
            </span>
          </button>
          {onHide && (
            <Button
              size="icon"
              className="h-5 w-5 shrink-0"
              title={t("player.visibility.hide")}
              onClick={(e) => {
                e.stopPropagation();
                onHide(node.path);
              }}
            >
              <EyeOff className="size-3" />
            </Button>
          )}
          {depth === 0 && (
            <>
              <span className="text-hint text-xs whitespace-nowrap select-none">
                {t("player.folder.file.count", { count: countAll })}
              </span>
              {onGenerate && (
                <Button
                  size="icon"
                  className="h-5 w-5"
                  title={t("player.folder.generate.preview")}
                  disabled={isGenerating}
                  onClick={(e) => {
                    e.stopPropagation();
                    onGenerate(node.path, node.name);
                  }}
                >
                  <ImageComponent
                    src="/images/w2k_bitmap_image.ico"
                    alt=""
                    className="size-4 bg-transparent"
                  />
                </Button>
              )}
              {onRemove && (
                <Button
                  size="icon"
                  className="h-5 w-5"
                  title={t("common.delete")}
                  aria-label={t("common.delete")}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(node.path);
                  }}
                >
                  <X />
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {open.has(node.path) || depth === 0 ? (
        <div
          ref={scrollElementRef}
          data-no-wheel
          data-virtual-list
          data-tree-root
          className="overflow-y-auto"
          style={{
            maxHeight: contentSized
              ? listMaxHeight
              : (listMaxHeight ??
                (flatItems.length > FOLDER_VIRTUALIZE_AFTER ? FOLDER_LIST_MAX_HEIGHT : undefined)),
            minHeight: listMinHeight,
          }}
        >
          <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((vItem, index) => {
              const item = flatItems[vItem.index];
              if (!item) return null;

              if (item.kind === "folder") {
                const isFolderOpen = open.has(item.node.path);
                return (
                  <div
                    key={index}
                    className="windows95-text absolute top-0 left-0 flex w-full items-center gap-1 px-0.5 py-0.5"
                    style={{
                      height: 20,
                      transform: `translateY(${vItem.start}px)`,
                      paddingLeft: `${item.depth * 12 + 2}px`,
                    }}
                  >
                    <button
                      type="button"
                      data-tree-row
                      data-tree-path={item.node.path}
                      data-tree-depth={item.depth}
                      aria-expanded={isFolderOpen}
                      aria-label={item.node.name}
                      className="windows95-text hover:bg-surface focus-visible:outline-text flex min-w-0 flex-1 cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-left focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted"
                      onClick={() => toggle(item.node.path)}
                      data-tree-activate
                    >
                      {isFolderOpen ? (
                        <ChevronDown className="size-3 shrink-0" />
                      ) : (
                        <ChevronRight className="size-3 shrink-0" />
                      )}
                      <TreeRowNumber
                        rows={treeRows}
                        anchorPath={anchorPath}
                        rowPath={item.node.path}
                      />
                      <ImageComponent
                        src="/images/w2k_folder_closed.ico"
                        alt=""
                        className="size-4 shrink-0 bg-transparent"
                      />
                      <span className="truncate select-none" title={item.node.name}>
                        {item.node.name}
                      </span>
                    </button>
                    {onHide && (
                      <Button
                        size="icon"
                        className="h-4 w-4 shrink-0"
                        title={t("player.visibility.hide")}
                        onClick={(e) => {
                          e.stopPropagation();
                          onHide(item.node.path);
                        }}
                      >
                        <EyeOff className="size-3" />
                      </Button>
                    )}
                  </div>
                );
              }

              const { file } = item;
              const disabled = isDisabled(file.name);
              const queueStatus = file.path ? queueMap.get(file.path) : undefined;
              const busy = queueStatus === "queued" || queueStatus === "processing";

              // The menu fires the row's own buttons, so mouse, keys and menu
              // can never disagree: parity holds by construction, and a
              // disabled button's click() stays a no-op.
              const entryDisabled = disabled || busy;
              const clickOwnButton = (
                name: "external" | "builtin" | "search" | "upscale"
              ): void => {
                if (!file.path) return;
                clickRowActionButton(findRow(treeRef.current, file.path), name);
              };
              const fileMenuEntries: ContextMenuEntry[] = [
                {
                  kind: "item",
                  id: "external",
                  label: "player.folder.open.media.player",
                  icon: Monitor,
                  disabled: entryDisabled,
                  onSelect: () => clickOwnButton("external"),
                },
                {
                  kind: "item",
                  id: "builtin",
                  label: "player.folder.open.iluha.player",
                  icon: Play,
                  disabled: entryDisabled,
                  onSelect: () => clickOwnButton("builtin"),
                },
                {
                  kind: "item",
                  id: "search",
                  label: "player.folder.search.anilist",
                  icon: Search,
                  disabled: entryDisabled,
                  onSelect: () => clickOwnButton("search"),
                },
                {
                  kind: "item",
                  id: "reveal",
                  label: "player.files.open.folder",
                  icon: FolderOpen,
                  disabled: !file.path,
                  onSelect: () => {
                    if (file.path) openPath(file.path.replace(file.name, ""));
                  },
                },
                {
                  kind: "item",
                  id: "upscale",
                  label: "player.upscale.title",
                  icon: Wand2,
                  disabled: entryDisabled,
                  onSelect: () => clickOwnButton("upscale"),
                },
              ];

              return (
                <div
                  key={index}
                  data-tree-row
                  data-tree-path={file.path}
                  data-tree-depth={item.depth}
                  data-vim-target="file"
                  tabIndex={-1}
                  className={cn(
                    "windows95-border hover:bg-surface bg-field focus-visible:outline-text absolute top-0 left-0 flex h-5 w-full items-center gap-1 px-1 focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-dotted",
                    busy && "opacity-50"
                  )}
                  style={{
                    transform: `translateY(${vItem.start}px)`,
                    paddingLeft: `${item.depth * 12 + 2}px`,
                  }}
                >
                  <TreeRowNumber
                    rows={treeRows}
                    anchorPath={anchorPath}
                    rowPath={file.path ?? ""}
                  />
                  <ImageComponent src="/images/w2k_wmp_11.ico" alt="" className="size-4" />
                  <ContextMenu entries={fileMenuEntries}>
                    <span
                      title={file.name}
                      className="windows95-text flex-1 truncate select-none"
                      data-tree-activate
                      onContextMenuCapture={(e) => {
                        // Ctrl+right-click keeps its direct action (builtin
                        // player): capture runs before the trigger's native
                        // listener, so stopping propagation keeps the menu shut.
                        if (!(e.ctrlKey || e.metaKey)) return;
                        e.preventDefault();
                        e.stopPropagation();
                        if (disabled || busy || !file.path) return;
                        ignore(openInAppPlayer(file.path));
                      }}
                      onClick={(e) => {
                        // Plain clicks only move focus to the row: the external
                        // player action lives on the Monitor icon now.
                        // Ctrl+click keeps the AniList search shortcut.
                        if (!(e.ctrlKey || e.metaKey)) {
                          e.currentTarget.closest<HTMLElement>("[data-tree-row]")?.focus();
                          return;
                        }
                        if (disabled || busy || !file.path) return;
                        setAnilistSearchQuery(parseMediaPath(file.path || file.name).searchTitle);
                      }}
                    >
                      {parseTitles ? formatParsedTitle(file.path || file.name, t) : file.name}
                    </span>
                  </ContextMenu>

                  <span className="windows95-text text-hint">{formatBytes(file.size)}</span>

                  {queueStatus === "queued" && <ListVideo className="text-hint size-3 shrink-0" />}
                  {queueStatus === "processing" && (
                    <SmallLoader size={3} className="text-highlight shrink-0" />
                  )}

                  {!disabled && file.path && (
                    <span data-file-action="upscale" className="contents">
                      <UpscalePlayer filePath={file.path} />
                    </span>
                  )}
                  <Button
                    size="icon"
                    className="h-4 w-4"
                    disabled={disabled || busy}
                    data-file-action="builtin"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (file.path) openInAppPlayer(file.path);
                    }}
                    title={t("player.folder.open.iluha.player")}
                    aria-label={t("player.folder.open.iluha.player")}
                  >
                    <Play className="size-3" />
                  </Button>
                  <Button
                    size="icon"
                    className="h-4 w-4"
                    disabled={disabled || busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (file.path) openFileInPlayer(file.path);
                    }}
                    title={
                      disabled
                        ? t("player.folder.track.disabled")
                        : t("player.folder.open.media.player")
                    }
                    data-file-action="external"
                  >
                    <Monitor className="size-3" />
                  </Button>
                  <Button
                    size="icon"
                    className="h-4 w-4"
                    disabled={disabled || busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      setAnilistSearchQuery(parseMediaPath(file.path || file.name).searchTitle);
                    }}
                    title={t("player.folder.search.anilist")}
                    aria-label={t("player.folder.search.anilist")}
                    data-file-action="search"
                  >
                    <Search className="size-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default FolderView;
