import { useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { CROP_DIM_OPACITY } from "@/config/settings/screenshot.config";
import { moveCrop, resizeCrop, toFrame } from "@/lib/settings/crop.utils";
import type { CropBounds, CropGuide, CropHandle, CropRect, CropView } from "@/types/screenshot";

const HANDLES: readonly Exclude<CropHandle, "move">[] = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
];

const HANDLE_CLASS: Record<Exclude<CropHandle, "move">, string> = {
  n: "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize",
  s: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-ns-resize",
  w: "top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
  e: "top-1/2 right-0 translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
  nw: "top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
  ne: "top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
  se: "bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
  sw: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
};

const KEY_STEP: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

interface CropFrameProps {
  bounds: CropBounds;
  crop: CropRect;
  view: CropView;
  guides: CropGuide[];
  label: string;
  moveCursor?: string;
  onChange: (rect: CropRect) => void;
}

export default function CropFrame({
  bounds,
  crop,
  view,
  guides,
  label,
  moveCursor = "cursor-move",
  onChange,
}: CropFrameProps) {
  const [focused, setFocused] = useState(false);
  const frame = toFrame(crop, view.scale);
  const box = {
    left: view.left + frame.left,
    top: view.top + frame.top,
    width: frame.width,
    height: frame.height,
  };
  const dim = { backgroundColor: `rgba(0,0,0,${CROP_DIM_OPACITY})` };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const step = KEY_STEP[event.key];
    if (!step) return;
    event.preventDefault();
    event.stopPropagation();
    const distance = event.shiftKey ? 10 : 1;
    const next = event.altKey
      ? resizeCrop(crop, "se", step[0] * distance, step[1] * distance, bounds)
      : moveCrop(crop, step[0] * distance, step[1] * distance, bounds);
    onChange(next.rect);
  };

  return (
    <>
      <div
        className="pointer-events-none absolute"
        style={{
          left: view.left,
          top: view.top,
          width: view.width,
          height: Math.max(0, box.top - view.top),
          ...dim,
        }}
      />
      <div
        className="pointer-events-none absolute"
        style={{
          left: view.left,
          top: box.top + box.height,
          width: view.width,
          height: Math.max(0, view.top + view.height - box.top - box.height),
          ...dim,
        }}
      />
      <div
        className="pointer-events-none absolute"
        style={{
          left: view.left,
          top: box.top,
          width: Math.max(0, box.left - view.left),
          height: box.height,
          ...dim,
        }}
      />
      <div
        className="pointer-events-none absolute"
        style={{
          left: box.left + box.width,
          top: box.top,
          width: Math.max(0, view.left + view.width - box.left - box.width),
          height: box.height,
          ...dim,
        }}
      />
      {guides.map((guide) => (
        <div
          key={`${guide.axis}-${guide.value}`}
          className="bg-highlight pointer-events-none absolute"
          style={
            guide.axis === "x"
              ? {
                  left: view.left + guide.value * view.scale,
                  top: 0,
                  width: 1,
                  height: view.top + view.height,
                }
              : {
                  left: 0,
                  top: view.top + guide.value * view.scale,
                  height: 1,
                  width: view.left + view.width,
                }
          }
        />
      ))}
      <button
        type="button"
        aria-label={label}
        data-handle="move"
        className={`focus-visible:outline-text absolute border border-black p-0 shadow-[0_0_0_1px_white] focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-dotted ${moveCursor}`}
        style={{
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={handleKeyDown}
      >
        {focused &&
          HANDLES.map((handle) => (
            <span
              key={handle}
              data-handle={handle}
              className={`windows95-active-border bg-primary absolute size-2 ${HANDLE_CLASS[handle]}`}
            />
          ))}
      </button>
    </>
  );
}
