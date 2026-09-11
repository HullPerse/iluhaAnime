import type { TFunc } from "@/types/i18n";

export function formatClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const total = Math.floor(totalSeconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatETA(
  secs: number | null,
  t: TFunc,
  zero: "empty" | "minute" = "empty"
): string {
  if (secs === null || !Number.isFinite(secs) || secs <= 0) {
    return zero === "minute" ? t("player.eta.less.than.minute") : "";
  }
  if (secs < 60) return t("torrent.eta.seconds", { s: Math.round(secs) });
  if (secs < 3600) {
    return t("torrent.eta.minutes.seconds", {
      m: Math.floor(secs / 60),
      s: Math.round(secs % 60),
    });
  }
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return t("torrent.eta.hours.minutes", { h, m });
}

export function formatElapsed(sec: number, t: TFunc): string {
  const safe = Number.isFinite(sec) && sec > 0 ? sec : 0;
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  if (m === 0) return t("torrent.eta.seconds", { s });
  if (s === 0) return t("torrent.eta.minutes", { m });
  return t("torrent.eta.minutes.seconds", { m, s });
}
