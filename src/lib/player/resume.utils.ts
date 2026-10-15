export const RESUME_MIN = 5;
export const RESUME_END_MARGIN = 10;

export interface HwdecReload {
  position: number;
  paused: boolean;
}

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

export function shouldSkipFrontendSeek(
  reload: HwdecReload | null,
  resume: number | undefined,
  position: number
): boolean {
  return reload === null && resume !== undefined && resume > 0 && position === resume;
}
