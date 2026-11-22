export const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function historyDay(stamp: number) {
  return new Date(stamp).toDateString();
}
