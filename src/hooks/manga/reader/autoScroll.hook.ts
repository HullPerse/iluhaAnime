import {
  advanceAutoClock,
  readerAutoScrollStep,
  readerImagesLoaded,
} from "@/lib/manga/readerAuto.utils";
import { useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { useCell } from "@hullperse/hp_utils/react";
import { chordKey, chordKeyFromEvent, parseChord } from "@/lib/core/hotkeys/chordHotkeys.utils";
import { activeChordForKeybind } from "@/lib/search/titleHotkeys.utils";
import { settingsAtoms } from "@/store/settings.store";
import { mangaAutoRunning } from "@/store/manga.store";

const AUTO_KEYBIND_ID = "manga-reader.auto";
const NAVIGATION_CODES = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
]);

const setRunning = (value: boolean) => mangaAutoRunning.set(value);

export function useReaderAutoScroll(
  ref: RefObject<HTMLDialogElement | null>,
  options: {
    blocked: boolean;
    ready: boolean;
    end: boolean;
    step: () => void;
    next?: () => void;
  }
) {
  const running = useCell(mangaAutoRunning);
  const overrides = useCell(settingsAtoms.keybindOverrides);
  const speed = useCell(settingsAtoms.mangaAutoSpeed);
  const interval = useCell(settingsAtoms.mangaAutoInterval);
  const pause = useCell(settingsAtoms.mangaAutoPause);
  const autoNext = useCell(settingsAtoms.mangaAutoNext);
  const hold = useCell(settingsAtoms.mangaAutoHold);
  const chordString = useMemo(
    () => activeChordForKeybind(overrides, AUTO_KEYBIND_ID),
    [overrides]
  );
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  useEffect(() => {
    if (options.blocked) setRunning(false);
  }, [options.blocked]);
  useEffect(() => {
    const node = ref.current;

    if (!node) return;
    const chord = chordString ? parseChord(chordString) : undefined;
    const stop = () => setRunning(false);
    const down = (event: KeyboardEvent) => {
      if (event.code === "Escape" && mangaAutoRunning.get()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        stop();

        return;
      }

      if (latest.current.blocked || !chord) return;

      if (chordKey(chord) !== chordKeyFromEvent(event)) {
        if (NAVIGATION_CODES.has(event.code)) stop();

        return;
      }

      const target = event.target instanceof HTMLElement ? event.target : null;

      if (target?.closest("input,textarea,[contenteditable=true],[role=dialog],[role=menu]")) return;

      if (target?.closest("[data-reader-ui]") && !target.closest("[data-reader-auto]")) return;
      event.preventDefault();
      event.stopImmediatePropagation();

      if (!event.repeat) setRunning(hold || !mangaAutoRunning.get());
    };

    const up = (event: KeyboardEvent) => {
      if (hold && chord && event.code === chord.code) stop();
    };

    const wheel = (event: WheelEvent) => {
      const target = event.target;

      if (target instanceof Element && target.closest("[data-reader-ui], [data-no-wheel]")) return;
      stop();
    };

    const pointer = (event: PointerEvent) => {
      const target = event.target;

      if (target instanceof Element && target.closest("[data-reader-ui], [data-reader-auto]"))
        return;
      stop();
    };

    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    node.addEventListener("wheel", wheel, true);
    node.addEventListener("pointerdown", pointer, true);
    node.addEventListener("contextmenu", stop, true);
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", stop);

    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      node.removeEventListener("wheel", wheel, true);
      node.removeEventListener("pointerdown", pointer, true);
      node.removeEventListener("contextmenu", stop, true);
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", stop);
    };
  }, [ref, chordString, hold]);
  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let previous = 0;
    let started = false;
    const clock = { elapsed: 0, boundary: 0 };

    function applyAction(
      action: ReturnType<typeof advanceAutoClock>,
      dt: number,
      scroll: HTMLElement
    ): boolean {
      if (action === "stop") {
        setRunning(false);

        return false;
      }

      if (action === "next") {
        latest.current.next?.();

        return false;
      }

      if (action === "scroll") scroll.scrollTop += readerAutoScrollStep(dt, speed);

      if (action === "turn") latest.current.step();

      return true;
    }

    const tick = (now: number) => {
      const dt = previous ? Math.min(now - previous, 100) : 0;
      previous = now;
      const current = latest.current;
      const node = ref.current;
      const scroll = node?.querySelector<HTMLElement>("[data-reader-scroll]");

      if (!current.ready || current.blocked || !scroll) {
        frame = requestAnimationFrame(tick);

        return;
      }

      if (!started) {
        if (!readerImagesLoaded(node)) {
          frame = requestAnimationFrame(tick);

          return;
        }

        started = true;
      }

      const action = advanceAutoClock(clock, {
        dt,
        end: current.end,
        bottom: scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 2,
        interval,
        pause,
        autoNext,
        hasNext: Boolean(current.next),
      });

      if (!applyAction(action, dt, scroll)) return;
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [running, ref, speed, interval, pause, autoNext]);

  return { running, toggle: () => setRunning(!mangaAutoRunning.get()) };
}
