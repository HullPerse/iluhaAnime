import {
  HOST_STATS_CRITICAL_PERCENT,
  HOST_STATS_WARN_PERCENT,
} from "@/config/system/hostStats.config";

export function pressureTone(percent: number): string {
  if (percent >= HOST_STATS_CRITICAL_PERCENT) return "bg-destructive";
  if (percent >= HOST_STATS_WARN_PERCENT) return "bg-orange-500";
  return "bg-highlight";
}
