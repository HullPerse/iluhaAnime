import { cn } from "cn";
import { useCell } from "@hullperse/hp_utils/react";
import { useEffect, useRef, useState } from "react";
import type {
  DragEvent as ReactDragEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";

import { settingsAtoms } from "@/store/settings.store";

/// Degrees of rotation per dragged pixel.
const SPIN_SENSITIVITY = 0.5;
/// Half the front is still readable, so the vertical spin stops short of upside down.
const SPIN_LIMIT_X = 82;
/// Hover tilt, matching the previous "full" tilt the face used to do on its own.
const HOVER_TILT_X = 8;
const HOVER_TILT_Y = 12;

interface DragState {
  pointerId: number;
  x: number;
  y: number;
  rotateX: number;
  rotateY: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/// The shortest signed angle, so releasing a spun card settles back the short way.
function normalizeAngle(degrees: number): number {
  const wrapped = degrees % 360;
  if (wrapped > 180) return wrapped - 360;
  if (wrapped < -180) return wrapped + 360;
  return wrapped;
}

export default function CardSpin({
  front,
  back,
  className,
}: {
  front: ReactNode;
  back: ReactNode;
  className?: string;
}) {
  const enableAnimations = useCell(settingsAtoms.enableAnimations);
  const [spinning, setSpinning] = useState<boolean>(false);
  const rotatorRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const settleRef = useRef<Animation | null>(null);
  const rotationRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(
    () => () => {
      settleRef.current?.cancel();
      settleRef.current = null;
    },
    []
  );

  // One transform owns the card: hover tilt and drag spin both write the same
  // pair of variables, so grabbing a tilted corner continues instead of snapping.
  const applyRotation = (rotateX: number, rotateY: number) => {
    rotationRef.current = { x: rotateX, y: rotateY };
    const rotator = rotatorRef.current;
    if (rotator === null) return;
    rotator.style.setProperty("--cards-spin-x", `${rotateX.toFixed(2)}deg`);
    rotator.style.setProperty("--cards-spin-y", `${rotateY.toFixed(2)}deg`);
    // The finishes read the same unitless angles the grid tilt writes, so the
    // foil and holo follow the card while it is being spun by hand.
    rotator.style.setProperty("--cards-tilt-deg-x", rotateX.toFixed(2));
    rotator.style.setProperty("--cards-tilt-deg-y", rotateY.toFixed(2));
    rotator.style.setProperty(
      "--cards-tilt-strength",
      Math.min(
        1,
        Math.max(Math.abs(rotateX) / HOVER_TILT_X, Math.abs(rotateY) / HOVER_TILT_Y)
      ).toFixed(2)
    );
  };

  const applySheen = (rect: DOMRect, clientX: number, clientY: number) => {
    const rotator = rotatorRef.current;
    if (rotator === null || rect.width === 0 || rect.height === 0) return;
    rotator.style.setProperty(
      "--cards-tilt-shift-x",
      `${clamp(((clientX - rect.left) / rect.width) * 100, 0, 100).toFixed(1)}%`
    );
    rotator.style.setProperty(
      "--cards-tilt-shift-y",
      `${clamp(((clientY - rect.top) / rect.height) * 100, 0, 100).toFixed(1)}%`
    );
  };

  const hoverRotation = (rect: DOMRect, clientX: number, clientY: number) => {
    const offsetX = rect.width === 0 ? 0 : (clientX - rect.left) / rect.width - 0.5;
    const offsetY = rect.height === 0 ? 0 : (clientY - rect.top) / rect.height - 0.5;
    return { x: -offsetY * HOVER_TILT_X, y: offsetX * HOVER_TILT_Y };
  };

  // WAAPI bridges the release angle to the target, so the return plays for any
  // angle, including several full turns.
  const settleRotation = (targetX: number, targetY: number) => {
    const rotator = rotatorRef.current;
    if (rotator === null) return;
    settleRef.current?.cancel();
    settleRef.current = null;
    if (!enableAnimations) {
      applyRotation(targetX, targetY);
      rotator.style.transition = "";
      return;
    }
    const fromX = rotationRef.current.x;
    const fromY = normalizeAngle(rotationRef.current.y);
    const toY = normalizeAngle(targetY);
    applyRotation(targetX, targetY);
    const animation = rotator.animate(
      [
        { transform: `perspective(900px) rotateX(${fromX}deg) rotateY(${fromY}deg)` },
        { transform: `perspective(900px) rotateX(${targetX}deg) rotateY(${toY}deg)` },
      ],
      { duration: 280, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }
    );
    settleRef.current = animation;
    animation.onfinish = () => {
      if (settleRef.current === animation) settleRef.current = null;
      rotator.style.transition = "";
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const rotator = rotatorRef.current;
    if (rotator === null) return;
    settleRef.current?.cancel();
    settleRef.current = null;
    event.currentTarget.setPointerCapture(event.pointerId);
    rotator.style.transition = "none";
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      rotateX: rotationRef.current.x,
      rotateY: rotationRef.current.y,
    };
    setSpinning(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    applySheen(rect, event.clientX, event.clientY);
    const drag = dragRef.current;
    if (drag !== null) {
      drag.rotateY += (event.clientX - drag.x) * SPIN_SENSITIVITY;
      drag.rotateX = clamp(
        drag.rotateX - (event.clientY - drag.y) * SPIN_SENSITIVITY,
        -SPIN_LIMIT_X,
        SPIN_LIMIT_X
      );
      drag.x = event.clientX;
      drag.y = event.clientY;
      applyRotation(drag.rotateX, drag.rotateY);
      return;
    }
    if (!enableAnimations) return;
    const hover = hoverRotation(rect, event.clientX, event.clientY);
    applyRotation(hover.x, hover.y);
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setSpinning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const inside =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom;
    const target =
      inside && enableAnimations
        ? hoverRotation(rect, event.clientX, event.clientY)
        : { x: 0, y: 0 };
    settleRotation(target.x, target.y);
  };

  const handlePointerLeave = () => {
    if (dragRef.current !== null) return;
    applyRotation(0, 0);
  };

  const handleArtDragStart = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  return (
    <div
      className={cn("cards-detail-art", className)}
      data-spinning={spinning ? "true" : undefined}
      onDragStart={handleArtDragStart}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerLeave={handlePointerLeave}
    >
      <div ref={rotatorRef} className="cards-detail-rotator">
        <div className="cards-detail-face">{front}</div>
        <div className="cards-detail-face cards-detail-face-back" aria-hidden="true">
          {back}
        </div>
      </div>
    </div>
  );
}
