export const RESUME_MIN = 5;
export const RESUME_END_MARGIN = 10;

export interface HwdecReload {
  position: number;
  paused: boolean;
}

/**
 * Picks the start position for a freshly loaded file.
 *
 * `resume` comes from the open request, `entryPosition` from the persisted
 * watch state. NOTE: `playlistIndex` is read from the playback atoms, which
 * are updated by asynchronous `player-state` snapshots — at `file-loaded`
 * time it still holds the *previous* file's index (or -1 on a fresh open),
 * so the resume branch is timing-dependent. Pinned by tests, see
 * `resume.utils.test.ts`.
 */
export function resolveLoadPosition(
  reload: HwdecReload | null,
  playlistIndex: number,
  resume: number | undefined,
  entryPosition: number | undefined
): number {
  if (reload) return reload.position;
  if (playlistIndex === 0 && resume !== undefined) return resume;
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
