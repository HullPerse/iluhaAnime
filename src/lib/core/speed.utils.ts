export const PLAYER_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export const DEFAULT_PLAYER_SPEED = 1;

function nearestSpeedIndex(current: number): number {
  const exact = PLAYER_SPEEDS.indexOf(current);
  if (exact !== -1) return exact;
  let best = 0;
  for (let i = 1; i < PLAYER_SPEEDS.length; i += 1) {
    if (Math.abs(PLAYER_SPEEDS[i] - current) < Math.abs(PLAYER_SPEEDS[best] - current)) best = i;
  }
  return best;
}

export function stepSpeed(current: number, direction: number): number {
  if (direction === 0) return DEFAULT_PLAYER_SPEED;
  const next = Math.min(
    PLAYER_SPEEDS.length - 1,
    Math.max(0, nearestSpeedIndex(current) + direction)
  );
  return PLAYER_SPEEDS[next];
}
