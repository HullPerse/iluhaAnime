export const RESUME_MIN = 5;
export const RESUME_END_MARGIN = 10;

export interface HwdecReload {
  position: number;
  paused: boolean;
}

/**
 * Picks the start position for a freshly loaded file.
 *
 * `resume` comes from the open request and is cleared after the first
 * `file-loaded` of that request, so it only ever applies to the file the
 * player actually started on — whatever its playlist index, since the queue
 * is no longer rotated. `entryPosition` is the persisted watch position,
 * used for later auto-advanced entries. Pinned by tests, see
 * `resume.utils.test.ts`.
 */
export function resolveLoadPosition(
  reload: HwdecReload | null,
  resume: number | undefined,
  entryPosition: number | undefined
): number {
  if (reload) return reload.position;
  if (resume !== undefined) return resume;
  return entryPosition ?? 0;
}

export function needsExactSeek(
  reload: HwdecReload | null,
  position: number,
  inside: boolean
): boolean {
  if (reload) return position > 1;
  return inside;
}

/**
 * The backend already positions mpv at `resume` via
 * `loadfile ... start=<resume>` when the open request carried a positive
 * resume. Seeking to the very same point again from the frontend only
 * produces a visible stutter, so that exact case is skipped. Every other
 * case (reloads, watch-entry positions, backend started at zero) still
 * seeks exactly once.
 */
export function shouldSkipFrontendSeek(
  reload: HwdecReload | null,
  resume: number | undefined,
  position: number
): boolean {
  return reload === null && resume !== undefined && resume > 0 && position === resume;
}
