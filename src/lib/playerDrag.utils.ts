export const DRAG_THRESHOLD_PX = 6;

const PLAYER_CONTROL_SELECTOR = "button, a, input, select, textarea, [role=button], [role=dialog]";

export function shouldStartWindowDrag(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
  threshold = DRAG_THRESHOLD_PX
): boolean {
  return Math.abs(currentX - startX) >= threshold || Math.abs(currentY - startY) >= threshold;
}

export function startsOnPlayerControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(PLAYER_CONTROL_SELECTOR) !== null;
}
