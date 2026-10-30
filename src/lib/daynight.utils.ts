export type DayNightFrame = "day" | "night";

export function parseDayTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function dayNightFrame(
  dayStart: string,
  nightStart: string,
  nowMinutes: number
): DayNightFrame {
  const day = parseDayTime(dayStart);
  const night = parseDayTime(nightStart);
  if (day === null || night === null) return "day";
  if (day <= night) {
    return nowMinutes >= day && nowMinutes < night ? "day" : "night";
  }
  return nowMinutes >= day || nowMinutes < night ? "day" : "night";
}

export function nowMinutesOf(date = new Date()): number {
  return date.getHours() * 60 + date.getMinutes();
}
