const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
const RESET_HOUR_MSK = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The daily game resets at 12:00 MSK (09:00 UTC, no daylight saving). */
export function nextDailyResetAt(now: number): number {
  const msk = new Date(now + MSK_OFFSET_MS);
  const resetAt =
    Date.UTC(msk.getUTCFullYear(), msk.getUTCMonth(), msk.getUTCDate(), RESET_HOUR_MSK) -
    MSK_OFFSET_MS;
  return resetAt > now ? resetAt : resetAt + DAY_MS;
}

/** The game day changes at noon MSK, not at local midnight. */
export function dailyGameDay(now: number): string {
  const gameDay = new Date(now + MSK_OFFSET_MS - RESET_HOUR_MSK * 60 * 60 * 1000);
  const year = gameDay.getUTCFullYear();
  const month = String(gameDay.getUTCMonth() + 1).padStart(2, "0");
  const date = String(gameDay.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

export function formatResetCountdown(remainingMs: number): string {
  const total = Math.max(0, Math.floor(remainingMs / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}
