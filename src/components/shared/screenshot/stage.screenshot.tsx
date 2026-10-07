import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ForwardedRef,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

import CropFrame from "@/components/shared/screenshot/crop.screenshot";
import { CROP_MIN_SIZE, CROP_ZOOM_STEP } from "@/config/settings/screenshot.config";
import { measureText, paintAnnotations, paintBlurMask } from "@/lib/settings/annotation.draw";
import {
  appendPoint,
  blurSigmaFor,
  hasBlur,
  hasInk,
  hitTestText,
  isBlurItem,
  nextAnnotationId,
  withDraft,
} from "@/lib/settings/annotation.utils";
import {
  clampPan,
  fitView,
  isInsidePicture,
  resizeCrop,
  snapThresholdForScale,
  startCrop,
  zoomAtPoint,
} from "@/lib/settings/crop.utils";
import { attemptSync } from "@/lib/utils/attempt.utils";
import type {
  AnnotationItem,
  CropBounds,
  CropGuide,
  CropHandle,
  CropPan,
  CropPoint,
  CropRect,
  CropView,
  ScreenshotLayersPayload,
  ScreenshotScale,
  ScreenshotTool,
} from "@/types/screenshot";

const LEFT_BUTTON = 0;
const RIGHT_BUTTON = 2;
const TEXT_HIT_PADDING = 3;

type DragMode = CropHandle | "start" | "draw" | "text-move";

interface DragState {
  mode: DragMode;
  anchor: CropPoint;
  pointerX: number;
  pointerY: number;
  start: CropRect | null;
  panStart: CropPan;
  itemId: string;
  moved: boolean;
}

interface PanState {
  panStart: CropPan;
  pointerX: number;
  pointerY: number;
}

interface TextEditor {
  point: CropPoint;
  value: string;
  editingId: string | null;

  size: number;
}

function paintOffscreen(
  bounds: CropBounds,
  paint: (context: CanvasRenderingContext2D) => void
): string | undefined {
  const [url] = attemptSync(() => {
    const canvas = document.createElement("canvas");
    canvas.width = bounds.width;
    canvas.height = bounds.height;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    paint(context);
    return canvas.toDataURL("image/png");
  });
  return url ?? undefined;
}

export interface StageHandle {
  layers: () => ScreenshotLayersPayload | null;
}

interface ScreenshotStageProps {
  src: string;
  alt: string;
  label: string;
  family: string;
  bounds: CropBounds;
  crop: CropRect | null;
  scale: ScreenshotScale;
  tool: ScreenshotTool;
  color: string;
  size: number;
  items: AnnotationItem[];
  handleRef?: ForwardedRef<StageHandle>;
  onCropChange: (rect: CropRect | null) => void;
  onScaleChange: (scale: ScreenshotScale) => void;
  onCommit: (items: AnnotationItem[]) => void;
}

export default function ScreenshotStage({
  src,
  alt,
  label,
  family,
  bounds,
  crop,
  scale,
  tool,
  color,
  size,
  items,
  handleRef,
  onCropChange,
  onScaleChange,
  onCommit,
}: ScreenshotStageProps) {
  const [box, setBox] = useState<CropBounds>({ width: 0, height: 0 });
  const [guides, setGuides] = useState<CropGuide[]>([]);
  const [draft, setDraft] = useState<AnnotationItem | null>(null);
  const [editor, setEditor] = useState<TextEditor | null>(null);
  const [maskUrl, setMaskUrl] = useState<string | null>(null);
  const [hoverText, setHoverText] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const draftRef = useRef<AnnotationItem | null>(null);
  const editorRef = useRef<TextEditor | null>(null);
  const view: CropView = fitView(bounds, box, scale.zoom, scale.pan);
  const blurItems = useMemo(() => items.filter(isBlurItem), [items]);

  const paintedItems = useMemo(
    () => (editor?.editingId ? items.filter((item) => item.id !== editor.editingId) : items),
    [editor?.editingId, items]
  );
  const blurSigma = blurItems.length > 0 ? blurSigmaFor(blurItems[0]?.size ?? size) : 0;

  const containerBox = useCallback((): CropBounds => {
    const element = containerRef.current;
    if (!element) return { width: 0, height: 0 };
    const rect = element.getBoundingClientRect();
    return {
      width: rect.width || element.clientWidth,
      height: rect.height || element.clientHeight,
    };
  }, []);

  const measure = useCallback(() => {
    const next = containerBox();
    if (!next.width || !next.height) return;
    setBox((previous) =>
      previous.width === next.width && previous.height === next.height ? previous : next
    );
  }, [containerBox]);

  useEffect(() => {
    measure();
    const frame = requestAnimationFrame(measure);
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return () => cancelAnimationFrame(frame);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [measure]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const current = {
        width: rect.width || element.clientWidth,
        height: rect.height || element.clientHeight,
      };
      const factor = event.deltaY < 0 ? CROP_ZOOM_STEP : 1 / CROP_ZOOM_STEP;
      onScaleChange(
        zoomAtPoint(bounds, current, scale.zoom, scale.pan, factor, {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        })
      );
    };
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [bounds, onScaleChange, scale.pan, scale.zoom]);

  useEffect(() => {
    if (!maskRef.current) maskRef.current = document.createElement("canvas");
    const mask = maskRef.current;
    mask.width = bounds.width;
    mask.height = bounds.height;
  }, [bounds.height, bounds.width]);

  useEffect(() => {
    paintAnnotations(
      inkRef.current?.getContext("2d") ?? null,
      withDraft(paintedItems, draft),
      family,
      draft?.id ?? null
    );
  }, [draft, family, paintedItems]);

  useEffect(() => {
    const mask = maskRef.current;
    if (!mask) return;
    paintBlurMask(mask.getContext("2d") ?? null, items);
    if (!hasBlur(items)) {
      setMaskUrl(null);
      return;
    }
    const [url] = attemptSync(() => mask.toDataURL("image/png"));
    setMaskUrl(url);
  }, [items]);

  useEffect(() => {
    if (editor) inputRef.current?.focus();
  }, [editor]);

  useEffect(() => {
    if (typeof handleRef === "function" || !handleRef) return;
    handleRef.current = {
      layers: () => {
        const payload: ScreenshotLayersPayload = {};
        if (hasInk(items)) {
          payload.drawing = paintOffscreen(bounds, (context) =>
            paintAnnotations(context, items, family)
          );
        }
        if (hasBlur(items)) {
          const mask = paintOffscreen(bounds, (context) => paintBlurMask(context, items));
          if (mask) payload.blur = { mask, sigma: blurSigma };
        }
        return payload.drawing || payload.blur ? payload : null;
      },
    };
  }, [blurSigma, bounds, family, handleRef, items]);

  const grabPointer = (pointerId: number) => {
    surfaceRef.current?.setPointerCapture?.(pointerId);
  };

  const setCurrentDraft = (next: AnnotationItem | null) => {
    draftRef.current = next;
    setDraft(next);
  };

  const toSource = (clientX: number, clientY: number): CropPoint => {
    const rect = containerRef.current?.getBoundingClientRect();
    const current = view.scale > 0 ? view.scale : 1;
    return {
      x: (clientX - (rect?.left ?? 0) - view.left) / current,
      y: (clientY - (rect?.top ?? 0) - view.top) / current,
    };
  };

  const commitEditor = useCallback(() => {
    const current = editorRef.current;
    editorRef.current = null;
    setEditor(null);
    const text = current?.value.trim() ?? "";
    if (!current || text.length === 0) return;
    const measured = measureText(
      inkRef.current?.getContext("2d") ?? null,
      family,
      current.size,
      text
    );
    if (current.editingId) {
      onCommit(
        items.map((item) =>
          item.id === current.editingId && item.kind === "text"
            ? { ...item, text, width: measured.width, height: measured.height }
            : item
        )
      );
      return;
    }
    onCommit([
      ...items,
      {
        id: nextAnnotationId(),
        kind: "text",
        color,
        size: current.size,
        point: current.point,
        text,
        width: measured.width,
        height: measured.height,
      },
    ]);
  }, [color, family, items, onCommit]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).dataset.textEditor === "true") return;
    const button = event.button ?? LEFT_BUTTON;
    if (button !== LEFT_BUTTON && button !== RIGHT_BUTTON) return;
    event.preventDefault();
    event.stopPropagation();
    measure();
    if (button === RIGHT_BUTTON) {
      panRef.current = {
        panStart: scale.pan,
        pointerX: event.clientX,
        pointerY: event.clientY,
      };
      grabPointer(event.pointerId);
      return;
    }

    const anchor = toSource(event.clientX, event.clientY);
    const base: DragState = {
      mode: "start",
      anchor,
      pointerX: event.clientX,
      pointerY: event.clientY,
      start: crop,
      panStart: scale.pan,
      itemId: "",
      moved: false,
    };
    if (!isInsidePicture(anchor, bounds)) return;
    if (tool === "text") {
      const editing = editorRef.current?.editingId ?? null;
      commitEditor();
      if (editing) return;
      editorRef.current = { point: anchor, value: "", editingId: null, size };
      setEditor(editorRef.current);
      return;
    }
    grabPointer(event.pointerId);
    const handle = (event.target as HTMLElement).dataset.handle as CropHandle | undefined;
    if (tool === "select") {
      const hit = hitTestText(items, anchor, TEXT_HIT_PADDING);
      if (hit) {
        dragRef.current = { ...base, mode: "text-move", itemId: hit.id, start: null };
        return;
      }
      dragRef.current = { ...base, mode: handle ?? "start" };
      return;
    }
    const id = nextAnnotationId();
    dragRef.current = { ...base, mode: "draw", itemId: id };
    setCurrentDraft({ id, kind: "stroke", tool, color, size, points: [anchor] });
  };

  const nextPanFor = (pan: PanState, clientX: number, clientY: number): CropPan =>
    clampPan(bounds, containerBox(), scale.zoom, {
      x: pan.panStart.x + (clientX - pan.pointerX),
      y: pan.panStart.y + (clientY - pan.pointerY),
    });

  const toSourceWithPan = (clientX: number, clientY: number, pan: CropPan): CropPoint => {
    const rect = containerRef.current?.getBoundingClientRect();
    const current = view.scale > 0 ? view.scale : 1;
    return {
      x: (clientX - (rect?.left ?? 0) - view.left - (pan.x - scale.pan.x)) / current,
      y: (clientY - (rect?.top ?? 0) - view.top - (pan.y - scale.pan.y)) / current,
    };
  };

  const extendStroke = (
    drag: DragState,
    event: ReactPointerEvent<HTMLDivElement>,
    pan: CropPan
  ) => {
    drag.moved = true;
    const previous = draftRef.current;
    if (!previous || previous.kind !== "stroke") return;
    const point = toSourceWithPan(event.clientX, event.clientY, pan);
    setCurrentDraft({ ...previous, points: appendPoint(previous.points, point) });
  };

  const dragText = (drag: DragState, event: ReactPointerEvent<HTMLDivElement>, pan: CropPan) => {
    const target = items.find((item) => item.id === drag.itemId);
    if (!target || target.kind !== "text") return;
    drag.moved = true;
    const scaleValue = view.scale > 0 ? view.scale : 1;
    setCurrentDraft({
      ...target,
      point: {
        x:
          target.point.x + (event.clientX - drag.pointerX - (pan.x - drag.panStart.x)) / scaleValue,
        y:
          target.point.y + (event.clientY - drag.pointerY - (pan.y - drag.panStart.y)) / scaleValue,
      },
    });
  };

  const dragCrop = (
    drag: DragState,
    handle: CropHandle | "start",
    event: ReactPointerEvent<HTMLDivElement>,
    snapThreshold: number,
    pan: CropPan
  ) => {
    if (handle === "start") {
      const snap = startCrop(
        drag.anchor,
        toSourceWithPan(event.clientX, event.clientY, pan),
        bounds,
        {
          snapThreshold,
          square: event.shiftKey,
        }
      );
      const usable = snap.rect.width >= CROP_MIN_SIZE && snap.rect.height >= CROP_MIN_SIZE;
      setGuides(usable ? snap.guides : []);
      onCropChange(usable ? snap.rect : null);
      return;
    }
    if (!drag.start) return;
    const scaleValue = view.scale > 0 ? view.scale : 1;
    const dx = (event.clientX - drag.pointerX - (pan.x - drag.panStart.x)) / scaleValue;
    const dy = (event.clientY - drag.pointerY - (pan.y - drag.panStart.y)) / scaleValue;
    const ratio =
      event.shiftKey && handle !== "move" && drag.start.height > 0
        ? drag.start.width / drag.start.height
        : null;
    const snap = resizeCrop(drag.start, handle, dx, dy, bounds, { ratio, snapThreshold });
    setGuides(snap.guides);
    onCropChange(snap.rect);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    const drag = dragRef.current;
    let effectivePan = scale.pan;
    if (pan) {
      effectivePan = nextPanFor(pan, event.clientX, event.clientY);
      if (effectivePan.x !== scale.pan.x || effectivePan.y !== scale.pan.y) {
        onScaleChange({ zoom: scale.zoom, pan: effectivePan });
      }
    }
    if (!drag) {
      if (pan) return;
      if (tool === "select") {
        const point = toSource(event.clientX, event.clientY);
        const hit =
          isInsidePicture(point, bounds) && hitTestText(items, point, TEXT_HIT_PADDING) !== null;
        setHoverText((previous) => (previous === hit ? previous : hit));
      } else if (hoverText) {
        setHoverText(false);
      }
      return;
    }
    if (drag.mode === "draw") {
      extendStroke(drag, event, effectivePan);
      return;
    }
    if (drag.mode === "text-move") {
      dragText(drag, event, effectivePan);
      return;
    }
    const snapThreshold = event.ctrlKey ? 0 : snapThresholdForScale(view.scale);
    dragCrop(drag, drag.mode, event, snapThreshold, effectivePan);
  };

  const finishDrag = (drag: DragState) => {
    const finished = draftRef.current;
    if (drag.mode === "draw" && finished) {
      onCommit([...items, finished]);
      setCurrentDraft(null);
      return;
    }
    if (drag.mode === "text-move" && finished && drag.moved) {
      onCommit(withDraft(items, finished));
      setCurrentDraft(null);
      return;
    }
    if (finished) setCurrentDraft(null);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.type === "pointercancel") {
      dragRef.current = null;
      panRef.current = null;
      setGuides([]);
      setHoverText(false);
      surfaceRef.current?.releasePointerCapture?.(event.pointerId);
      const cancelled = draftRef.current;
      if (cancelled) setCurrentDraft(null);
      return;
    }
    const button = event.button ?? LEFT_BUTTON;
    if (button === RIGHT_BUTTON) {
      if (!panRef.current) return;
      panRef.current = null;
      if (!dragRef.current) {
        setHoverText(false);
        surfaceRef.current?.releasePointerCapture?.(event.pointerId);
      }
      return;
    }
    if (button !== LEFT_BUTTON) return;
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setGuides([]);
    setHoverText(false);
    if (!panRef.current) {
      surfaceRef.current?.releasePointerCapture?.(event.pointerId);
    }
    finishDrag(drag);
  };

  const handleEditorKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      editorRef.current = null;
      setEditor(null);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      commitEditor();
    }
  };

  const handleDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (tool !== "select") return;
    if ((event.target as HTMLElement).dataset.textEditor === "true") return;
    const hit = hitTestText(items, toSource(event.clientX, event.clientY), TEXT_HIT_PADDING);
    if (!hit) return;
    event.preventDefault();
    editorRef.current = { point: hit.point, value: hit.text, editingId: hit.id, size: hit.size };
    setEditor(editorRef.current);
  };

  return (
    <div
      ref={containerRef}
      data-testid="screenshot-stage"
      className="windows95-border relative h-[50vh] min-h-56 w-full shrink-0 overflow-hidden bg-black/20"
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="absolute inset-0 h-full w-full object-contain select-none"
        style={{
          transform: `translate(${scale.pan.x}px, ${scale.pan.y}px) scale(${scale.zoom})`,
        }}
      />
      <div
        ref={surfaceRef}
        data-testid="screenshot-surface"
        className="absolute inset-0 touch-none select-none"
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      >
        <div
          data-testid="screenshot-picture"
          className={`absolute ${tool === "text" ? "cursor-text" : "cursor-crosshair"}`}
          style={{ height: view.height, left: view.left, top: view.top, width: view.width }}
        />
        {blurSigma > 0 && maskUrl && (
          <div
            data-testid="screenshot-blur"
            className="pointer-events-none absolute"
            style={{
              WebkitBackdropFilter: `blur(${blurSigma * view.scale}px)`,
              WebkitMaskImage: `url(${maskUrl})`,
              backdropFilter: `blur(${blurSigma * view.scale}px)`,
              height: view.height,
              left: view.left,
              maskImage: `url(${maskUrl})`,
              maskSize: "100% 100%",
              top: view.top,
              width: view.width,
            }}
          />
        )}
        <div
          data-testid="screenshot-space"
          className="pointer-events-none absolute z-10"
          style={{
            height: bounds.height,
            left: view.left,
            top: view.top,
            transform: `scale(${view.scale})`,
            transformOrigin: "0 0",
            width: bounds.width,
          }}
        >
          <canvas
            ref={inkRef}
            data-testid="screenshot-ink"
            width={bounds.width}
            height={bounds.height}
            className="absolute inset-0 h-full w-full"
          />
          {editor && (
            <input
              ref={inputRef}
              data-testid="screenshot-text-editor"
              data-text-editor="true"
              className="windows95-text pointer-events-auto absolute m-0 min-w-8 border border-dashed border-black bg-transparent p-0 outline-none"
              style={{
                color,
                fontSize: editor.size,
                left: editor.point.x,
                lineHeight: 1,
                top: editor.point.y,
              }}
              value={editor.value}
              aria-label={label}
              onKeyDown={handleEditorKeyDown}
              onBlur={() => commitEditor()}
              onChange={(event) =>
                setEditor((previous) => {
                  const next = previous ? { ...previous, value: event.target.value } : previous;
                  editorRef.current = next;
                  return next;
                })
              }
            />
          )}
        </div>
        {crop && (
          <CropFrame
            bounds={bounds}
            crop={crop}
            view={view}
            guides={guides}
            label={label}
            moveCursor={tool === "select" && hoverText ? "cursor-text" : "cursor-move"}
            onChange={onCropChange}
          />
        )}
      </div>
    </div>
  );
}
