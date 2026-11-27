import { useEffect, useRef, type RefObject } from "react";
import * as z from "zod/mini";

import { shouldIgnorePlayerHotkeys } from "@/lib/core/hotkeys/filterHotkeys.utils";
import { invokeTyped, invokeValidated } from "@/lib/core/system/invoke.utils";
import { translate } from "@/lib/locale/i18n.utils";
import { addNotification } from "@/store/notification.store";
import type { PlayerSettings } from "@/types/player/videoPlayer";

const boundsSchema = z.nullable(z.tuple([z.number(), z.number(), z.number(), z.number()]));

type Bounds = NonNullable<z.infer<typeof boundsSchema>>;

type Point = [number, number];

function withinBounds([x, y]: Point, [left, top, right, bottom]: Bounds): boolean {
  return x >= left && x <= right && y >= top && y <= bottom;
}

export function usePlayerLoupe(
  surface: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  mode: PlayerSettings["loupeMode"]
) {
  const zoom = useRef<number>(2);
  const inFlight = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const video = surface.current;

    if (!video || !enabled) return;

    let point: Point | null = null;
    let bounds: Bounds | null = null;
    let held = false;
    let shown = false;
    let disposed = false;
    let dirty = false;
    let drawing = false;
    let animation = 0;
    const hideMode = mode === "native" ? "hidenative" : "hideshader";

    const hide = async () => {
      if (!shown) return;
      shown = false;
      await invokeTyped("player_loupe", { update: { mode: hideMode } });
    };

    const render = async () => {
      if (!held || !point || disposed) return hide();
      bounds ??= await invokeValidated("player_loupe_bounds", boundsSchema);

      if (!held || !point || disposed || !bounds) return hide();

      if (!withinBounds(point, bounds)) return hide();
      shown = await invokeTyped<boolean>("player_loupe", {
        update: { mode, frame: { bounds, point, zoom: zoom.current } },
      });
    };

    const paint = () => {
      animation = 0;
      dirty = false;
      drawing = true;
      inFlight.current = (inFlight.current ?? Promise.resolve())
        .then(render)
        .catch((error: unknown) => {
          if (!held || disposed) return;
          held = false;
          dirty = true;
          const message = error instanceof Error ? error.message : String(error);
          addNotification(translate("player.media.loupe.failed"), "error", message);
        })
        .finally(() => {
          drawing = false;

          if (dirty) requestPaint();
        });
    };

    const requestPaint = () => {
      dirty = true;

      if (drawing || disposed) return;

      if (!held) {
        cancelAnimationFrame(animation);
        paint();
      } else if (animation === 0) {
        animation = requestAnimationFrame(paint);
      }
    };

    const reset = () => {
      const needsHide = held || shown;
      held = false;
      point = null;

      if (needsHide) requestPaint();
    };

    const onMove = (event: PointerEvent) => {
      if (event.target !== video || event.pointerType === "touch") {
        if (point) reset();

        return;
      }

      point = [event.clientX / window.innerWidth, event.clientY / window.innerHeight];
      const nextHeld = event.altKey && !event.ctrlKey && !event.shiftKey && !event.metaKey;
      const needsPaint = nextHeld || held || shown;

      if (nextHeld && !held) bounds = null;
      held = nextHeld;

      if (needsPaint) requestPaint();
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Alt") return;

      if (event.type === "keyup") {
        if (!held) return;
        held = false;
      } else {
        if (
          !point ||
          shouldIgnorePlayerHotkeys(event) ||
          event.ctrlKey ||
          event.shiftKey ||
          event.metaKey
        )
          return;

        if (!held) bounds = null;
        held = true;
      }

      event.preventDefault();
      requestPaint();
    };

    const onWheel = (event: WheelEvent) => {
      if (!held || !event.altKey || event.target !== video || !point || !event.deltaY) return;

      if (bounds && !withinBounds(point, bounds)) return;
      event.preventDefault();
      event.stopPropagation();
      zoom.current = Math.max(1.5, Math.min(5, zoom.current + (event.deltaY < 0 ? 0.5 : -0.5)));
      requestPaint();
    };

    const onResize = () => {
      bounds = null;
      reset();
    };

    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(onResize);
    observer?.observe(video);
    window.addEventListener("pointermove", onMove);
    video.addEventListener("pointerleave", reset);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    window.addEventListener("blur", reset);
    window.addEventListener("contextmenu", reset, true);
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", reset);

    return () => {
      disposed = true;
      cancelAnimationFrame(animation);
      observer?.disconnect();
      window.removeEventListener("pointermove", onMove);
      video.removeEventListener("pointerleave", reset);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
      window.removeEventListener("wheel", onWheel, true);
      window.removeEventListener("blur", reset);
      window.removeEventListener("contextmenu", reset, true);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", reset);
      inFlight.current = (inFlight.current ?? Promise.resolve()).then(hide).catch(() => undefined);
    };
  }, [surface, enabled, mode]);
}
