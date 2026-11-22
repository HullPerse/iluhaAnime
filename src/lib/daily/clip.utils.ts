const START_MARGIN = 0.15;
const END_MARGIN = 0.92;

const CLIP_WINDOWS = [3, 6, 10, 15] as const;
const MAX_CLIP_WINDOW = 15;

/** The revealed window index from the current attempt count. */
export function windowSecondsFor(attempts: number, maxAttempts: number): number | null {
  const revealed = Math.min(Math.max(attempts, 0) + 1, maxAttempts);

  if (revealed >= maxAttempts) return null;

  return CLIP_WINDOWS[Math.min(revealed - 1, CLIP_WINDOWS.length - 1)] ?? null;
}

/**
 * Keeps the excerpt away from the title cards at the start and from the
 * credits, while leaving room for the widest window. The same start is used
 * for every attempt so the clip grows around one spot.
 */
export function clipStart(duration: number, fraction: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const minimum = duration * START_MARGIN;
  const maximum = Math.max(minimum, duration * END_MARGIN - MAX_CLIP_WINDOW);

  return Math.min(Math.max(duration * fraction, minimum), maximum);
}

export function clipEnd(duration: number, start: number, window: number | null): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const safeStart = Math.max(0, Math.min(start, duration));
  const latest = duration * END_MARGIN;
  const end = window === null ? latest : Math.min(latest, safeStart + window);

  return Math.max(safeStart, Math.min(duration, end));
}
