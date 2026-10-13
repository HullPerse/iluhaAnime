import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import {
  VIM_CONTENT_SELECTOR,
  VIM_LABEL_ALPHABET,
  VIM_SCROLL_LINE_PX,
} from "@/config/keyboard/vim.config";
import { PLAYER_ROUTE } from "@/config/player/player-route.config";
import { tabIdFromPath } from "@/config/tabs/paths.config";
import { flashTarget } from "@/lib/highlight/flash.utils";
import { blurEditable, shouldBlurOnEscape } from "@/lib/hotkeys/blur.hotkeys";
import { dispatchClick, dispatchFocus } from "@/lib/hotkeys/dispatch.hotkeys";
import { createVimEngine } from "@/lib/hotkeys/engine.hotkeys";
import type { VimCommand, VimEngine } from "@/lib/hotkeys/engine.hotkeys";
import { reduceHintKey, scanHintTargets } from "@/lib/hotkeys/hints.hotkeys";
import type { HintBadge } from "@/lib/hotkeys/hints.hotkeys";
import { isInsideLayer, setHintsLayerVisible, topLayerElement } from "@/lib/hotkeys/layer.hotkeys";
import { createPinTimer } from "@/lib/hotkeys/pin.hotkeys";
import type { Debouncer } from "@/lib/pacer/debounce.utils";
import { useCell } from "@/lib/state/signal.hook";
import { closestScrollable, scrollAmount } from "@/lib/utils/scroll.utils";
import type { ScrollDirection } from "@/lib/utils/scroll.utils";
import { registerOverlay } from "@/store/overlay.store";
import { settingsAtoms } from "@/store/settings.store";
import { closeHints, openHints, setVimBuffer, setVimPinned, vimAtoms } from "@/store/vim.store";

const LETTER_CODE = /^Key([A-Z])$/;

const SCROLL_DIRECTIONS: Record<VimCommand, ScrollDirection | null> = {
  hints: null,
  "scroll.down": "down",
  "scroll.up": "up",
  "scroll.half.down": "half.down",
  "scroll.half.up": "half.up",
};

/** The in-app player tab and the detached player window keep their own keys. */
function isPlayerSurface(pathname: string): boolean {
  return pathname === PLAYER_ROUTE || tabIdFromPath(pathname) === "player";
}

function letterFromCode(code: string): string | null {
  const match = LETTER_CODE.exec(code);
  return match ? match[1].toLowerCase() : null;
}

export function useVimMode(): void {
  const vimMode = useCell(settingsAtoms.vimMode);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const stateRef = useRef({ vimMode, pathname });
  const closeLayerRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    stateRef.current = { vimMode, pathname };
  }, [vimMode, pathname]);

  // Leaving the mode or entering the player surface must not leave a stale
  // hint layer (and its overlay entry) behind.
  useEffect(() => {
    if (vimMode && !isPlayerSurface(pathname)) return;
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

    engine = createVimEngine({
      isEnabled: () => stateRef.current.vimMode,
      isExcludedRoute: () => isPlayerSurface(stateRef.current.pathname),
      // Read live, not captured: the layer opens and closes while the engine
      // stays attached.
      isOwner: (target) => isInsideLayer(target, topLayerElement()),
      onCommand: (command) => {
        if (command === "hints") openLayer();
        else scroll(command);
      },
      onActiveKey: (event) => handleActiveKey(event),
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
