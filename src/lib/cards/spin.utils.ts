export function normalizeAngle(degrees: number): number {
  const wrapped = degrees % 360;

  if (wrapped > 180) return wrapped - 360;

  if (wrapped < -180) return wrapped + 360;

  return wrapped;
}
