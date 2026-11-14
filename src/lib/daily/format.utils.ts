/** Compact dd.mm form used by the daily header and the history table. */
export function formatDailyDate(day: string): string {
  const [, month, date] = day.split("-");
  if (month === undefined || date === undefined) return day;
  return `${date}.${month}`;
}
