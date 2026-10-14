import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { closeOpenContextMenus } from "@/components/shared/contextMenu.component";
import {
  VIM_CONTENT_SELECTOR,
  VIM_LABEL_ALPHABET,
  VIM_SCROLL_LINE_PX,
  TREE_ROW_SELECTOR,
} from "@/config/keyboard/vim.config";
import { PLAYER_ROUTE } from "@/config/player/player-route.config";
import { flashTarget } from "@/lib/highlight/flash.utils";
import { blurEditable, shouldBlurOnEscape } from "@/lib/hotkeys/blur.hotkeys";
import { dispatchClick, dispatchFocus } from "@/lib/hotkeys/dispatch.hotkeys";
import { createVimEngine } from "@/lib/hotkeys/engine.hotkeys";
import type { VimCommand, VimEngine } from "@/lib/hotkeys/engine.hotkeys";
import { reduceHintKey, scanHintTargets } from "@/lib/hotkeys/hints.hotkeys";
import type { HintBadge } from "@/lib/hotkeys/hints.hotkeys";
import { isInsideLayer, setHintsLayerVisible, topLayerElement } from "@/lib/hotkeys/layer.hotkeys";
import { createPinTimer } from "@/lib/hotkeys/pin.hotkeys";
import { resolveKeybinds } from "@/lib/hotkeys/resolve.hotkeys";
import { focusTreeSibling } from "@/lib/hotkeys/tabs.hotkeys";
import type { Debouncer } from "@/lib/pacer/debounce.utils";
import { useCell } from "@/lib/state/signal.hook";
import { closestScrollable, scrollAmount } from "@/lib/utils/scroll.utils";
import type { ScrollDirection } from "@/lib/utils/scroll.utils";
import { registerOverlay } from "@/store/overlay.store";
import { settingsAtoms } from "@/store/settings.store";
import {
  closeHints,
  openHints,
  setVimBuffer,
  setVimCount,
  setVimPinned,
  vimAtoms,
} from "@/store/vim.store";

const LETTER_CODE = /^Key([A-Z])$/;

const SCROLL_DIRECTIONS: Record<VimCommand, ScrollDirection | null> = {
  hints: null,
  "scroll.down": "down",
  "scroll.up": "up",
  "scroll.half.down": "half.down",
  "scroll.half.up": "half.up",
  first: null,
  last: null,
  "edge.top": null,
  "edge.middle": null,
  "edge.bottom": null,
};

/** Only the detached player window keeps its own keys; the player tab route joins vim mode. */
function isPlayerWindow(pathname: string): boolean {
  return pathname === PLAYER_ROUTE;
}

function letterFromCode(code: string): string | null {
  const match = LETTER_CODE.exec(code);
  return match ? match[1].toLowerCase() : null;
}

/** Manifest entry per single-stroke engine command. `first` resolves through
 *  the fixed `gg` sequence and stays out. */
const VIM_COMMAND_KEYBINDS: Record<Exclude<VimCommand, "first">, string> = {
  hints: "vim.hints",
  "scroll.down": "vim.scroll.down",
  "scroll.up": "vim.scroll.up",
  "scroll.half.down": "vim.scroll.half.down",
  "scroll.half.up": "vim.scroll.half.up",
  last: "vim.last",
  "edge.top": "vim.edge.top",
  "edge.middle": "vim.edge.middle",
  "edge.bottom": "vim.edge.bottom",
};

export function useVimMode(): void {
  const vimMode = useCell(settingsAtoms.vimMode);
  const overrides = useCell(settingsAtoms.keybindOverrides);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const stateRef = useRef({ vimMode, pathname, overrides });
  const closeLayerRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    stateRef.current = { vimMode, pathname, overrides };
  }, [vimMode, pathname, overrides]);

  // Leaving the mode or entering the detached player window must not leave a
  // stale hint layer (and its overlay entry) behind.
  useEffect(() => {
    if (vimMode && !isPlayerWindow(pathname)) return;
    closeLayerRef.current();
  }, [vimMode, pathname]);

  // A route change is a navigation: hints never survive it (vimium-c drops
  // the mode on unload; the SPA equivalent is the pathname changing under
  // an open layer, e.g. clicking a tab with the mouse while hints are open).
  const prevPathnameRef = useRef(pathname);
  useEffect(() => {
    if (prevPathnameRef.current === pathname) return;
    prevPathnameRef.current = pathname;
    closeLayerRef.current();
  }, [pathname]);

  useEffect(() => {
    let engine: VimEngine | null = null;
    let unregister: (() => void) | null = null;
    let hovered: HTMLElement | null = null;
    let pinTimer: Debouncer<[]> | null = null;

    const armPinTimer = (): void => {
      if (pinTimer === null) pinTimer = createPinTimer(() => setVimPinned(null));
      pinTimer.maybeExecute();
    };
    const cancelPinTimer = (): void => pinTimer?.cancel();

    const closeLayer = (): void => {
      cancelPinTimer();
      closeHints();
      setHintsLayerVisible(false);
      engine?.setState("idle");
      unregister?.();
      unregister = null;
    };

    const activate = (badge: HintBadge): void => {
      if (badge.variant === "focus") {
        dispatchFocus(badge.element);
        closeLayer();
        return;
      }
      dispatchClick(badge.element, badge.variant);
      flashTarget(badge.element);
      // A real click moves focus; a synthesized one does not. Without this
      // the ring keys and resize chords stay dead after a hint activation on
      // a tree row, because they all resolve from the focused row.
      const row =
        badge.element instanceof HTMLElement
          ? (badge.element.closest("[data-tree-row]") as HTMLElement | null)
          : null;
      row?.focus();
      closeLayer();
    };

    const handleActiveKey = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey) return;
      const letter = letterFromCode(event.code);
      if (!letter || !VIM_LABEL_ALPHABET.includes(letter)) return;
      event.preventDefault();
      event.stopPropagation();
      const { badges, buffer } = vimAtoms.hints.get();
      const result = reduceHintKey(badges, buffer, letter, event.altKey);
      if (result.outcome === "activate" && result.badge) {
        activate(result.badge);
        return;
      }
      if (result.outcome === "pin" && result.badge) {
        setVimPinned(result.badge.label);
        setVimBuffer(result.buffer);
        armPinTimer();
        return;
      }
      setVimBuffer(result.buffer);
    };

    const resolveSurface = (): HTMLElement | null => {
      const fromHover = closestScrollable(hovered);
      if (fromHover) return fromHover;
      const active = document.activeElement;
      const fromFocus = closestScrollable(active instanceof HTMLElement ? active : null);
      if (fromFocus) return fromFocus;
      const marked = document.querySelector<HTMLElement>(VIM_CONTENT_SELECTOR);
      return marked ? closestScrollable(marked) : null;
    };

    const scroll = (command: VimCommand): void => {
      const direction = SCROLL_DIRECTIONS[command];
      if (!direction) return;
      // An open layer owns the keyboard, and modal content opts out of key and
      // wheel scrolling (`data-no-wheel`), so the page behind it stays put.
      if (topLayerElement()) return;
      const surface = resolveSurface();
      if (!surface) return;
      surface.scrollTop += scrollAmount(direction, surface.clientHeight, VIM_SCROLL_LINE_PX);
    };

    const openLayer = (): void => {
      // A context menu left open would sit above the hint layer and eat the
      // clicks the badges promise, so F always dismisses menus first. The
      // scan below then sees the page without them.
      closeOpenContextMenus();
      // With a dialog or menu up, only that layer is scanned: a badge for a
      // control behind it would be unreachable and the label space (361) is
      // shared with the page it is covering.
      const { badges, overflow } = scanHintTargets(topLayerElement() ?? document);
      if (badges.length === 0) return;
      openHints(badges, overflow);
      setHintsLayerVisible(true);
      engine?.setState("hints");
      unregister = registerOverlay(closeLayer);
    };

    const trackPointer = (event: PointerEvent): void => {
      hovered = event.target instanceof HTMLElement ? event.target : null;
    };

    const scrollEdge = (edge: "top" | "middle" | "bottom"): void => {
      if (topLayerElement()) return;
      const surface = resolveSurface();
      if (!surface) return;
      const max = Math.max(0, surface.scrollHeight - surface.clientHeight);
      if (edge === "top") surface.scrollTop = 0;
      else if (edge === "bottom") surface.scrollTop = max;
      else surface.scrollTop = max / 2;
    };

    const treeRowFromEvent = (event: KeyboardEvent): HTMLElement | null => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      return target?.closest<HTMLElement>(TREE_ROW_SELECTOR) ?? null;
    };

    const focusTreeIndex = (row: HTMLElement, command: "first" | "last"): void => {
      const count = vimAtoms.count.get();
      setVimCount("");
      const parsed = count === "" ? Number.NaN : Number.parseInt(count, 10);
      const index = Number.isNaN(parsed) ? (command === "first" ? 1 : -1) : parsed;
      focusTreeSibling(row, index);
    };

    engine = createVimEngine({
      isEnabled: () => stateRef.current.vimMode,
      isExcludedRoute: () => isPlayerWindow(stateRef.current.pathname),
      // Read live, not captured: the layer opens and closes while the engine
      // stays attached.
      // Tree rows are owned too: folder rows are real <button>s, which the
      // shared filter would otherwise exclude - and that split is what left
      // folders and files understanding different key subsets (no counts or
      // gg/G on folders, no j/k on files). The j/k yield below keeps the row
      // handlers behind this capture listener alive.
      isOwner: (target) =>
        isInsideLayer(target, topLayerElement()) ||
        (target instanceof HTMLElement && target.closest(TREE_ROW_SELECTOR) !== null),
      shouldYield: (command, event) =>
        (command === "scroll.down" || command === "scroll.up") && treeRowFromEvent(event) !== null,
      resolveChord: (command) => {
        if (command === "first") return null;
        const id = VIM_COMMAND_KEYBINDS[command];
        const row = resolveKeybinds(stateRef.current.overrides).find(
          (entry) => entry.entry.id === id
        );
        return row?.activeChord ?? null;
      },
      onCommand: (command, event) => {
        if (command === "hints") {
          openLayer();
          return;
        }
        if (command === "first" || command === "last") {
          const row = treeRowFromEvent(event);
          if (row) {
            focusTreeIndex(row, command);
            return;
          }
          scrollEdge(command === "first" ? "top" : "bottom");
          return;
        }
        if (command === "scroll.down" || command === "scroll.up") {
          // Tree rows own j/k for ring movement (with counts); the engine
          // stays out so the row handlers behind it still fire.
          if (treeRowFromEvent(event)) return;
          scroll(command);
          return;
        }
        if (command === "edge.top") {
          scrollEdge("top");
          return;
        }
        if (command === "edge.middle") {
          scrollEdge("middle");
          return;
        }
        if (command === "edge.bottom") {
          scrollEdge("bottom");
          return;
        }
        scroll(command);
      },
      onActiveKey: (event) => handleActiveKey(event),
      onCount: (count) => setVimCount(count),
    });
    closeLayerRef.current = closeLayer;

    // Escape hatch for focused controls: typing targets swallow vim chords,
    // so Escape drops focus back to the page where F works again. Layers and
    // hint runs keep priority - this never steals their Escape.
    const blurOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (
        !shouldBlurOnEscape(event.target, {
          hintsOpen: engine?.state() === "hints",
          topLayer: topLayerElement(),
        })
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      blurEditable(event.target);
    };
    engine.attach();
    window.addEventListener("pointerover", trackPointer, true);
    window.addEventListener("keydown", blurOnEscape, true);
    // Click-away: any mouse button (left/middle/right) while a hint run is
    // open dismisses the layer. The overlay is pointer-events-none, so the
    // click still reaches the underlying control - the mode just gets out
    // of the way. No preventDefault/stopPropagation: the target must fire normally.
    // Synthetic activation emits `click`, not `pointerdown`, so keyboard
    // activation never trips this.
    const dismissOnPointer = (): void => {
      if (engine?.state() !== "hints") return;
      closeLayer();
    };
    window.addEventListener("pointerdown", dismissOnPointer, true);
    // WebView2 may not deliver pointerdown for the right button; the menu
    // itself still dismisses the layer.
    window.addEventListener("contextmenu", dismissOnPointer, true);

    return () => {
      window.removeEventListener("pointerover", trackPointer, true);
      window.removeEventListener("keydown", blurOnEscape, true);
      window.removeEventListener("pointerdown", dismissOnPointer, true);
      window.removeEventListener("contextmenu", dismissOnPointer, true);
      unregister?.();
      engine?.detach();
      cancelPinTimer();
      closeHints();
      setHintsLayerVisible(false);
    };
  }, []);
}
