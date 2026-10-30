/**
 * ROM sizes are shown in whole kilobytes; sub-KB files read as 1 KB instead
 * of a misleading 0.
 */
export function sizeInKb(bytes: number): number {
  return Math.max(1, Math.ceil(bytes / 1024));
}
