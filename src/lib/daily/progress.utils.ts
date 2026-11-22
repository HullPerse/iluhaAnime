export function clipProgressPercent(received: number, total: number): number {
  if (!Number.isFinite(received) || !Number.isFinite(total) || total <= 0) return 0;

  return Math.min(100, Math.max(0, Math.round((received / total) * 100)));
}

export function clipMegabytes(bytes: number): string {
  return (Math.max(0, bytes) / (1024 * 1024)).toFixed(1);
}
