import { useLayoutEffect, useRef } from "react";

import { THEMES } from "@/config/graphics/themes.config";
import { useLiveResource } from "@/hooks/liveResource.hook";
import { dayNightFrame, nowMinutesOf, scheduledThemeName } from "@/lib/core/daynight.utils";
import type { DayNightFrame } from "@/types/core/daynight";
import { reportBackgroundError } from "@/lib/core/attempt.utils";
import { setTorrentSpeedLimits } from "@/store/download.store";
import { getSettingsSnapshot, patchSettings } from "@/store/settings.store";
import { setTheme, themeAtoms } from "@/store/theme.store";

function isKnownTheme(name: string): boolean {
  return (
    THEMES.some((theme) => theme.name === name) ||
    themeAtoms.customThemes.get().some((theme) => theme.name === name)
  );
}

export function useDayNightScheduler(): void {
  const applied = useRef<{ speed: DayNightFrame | null; theme: DayNightFrame | null }>({
    speed: null,
    theme: null,
  });

  // The periodic sweep below runs in useEffect, after the first paint. Apply
  // the scheduled theme once in a layout effect so the restored theme never
  // flashes before the schedule takes over.
  useLayoutEffect(() => {
    const scheduled = scheduledThemeName(getSettingsSnapshot().themeSchedule, nowMinutesOf());
    if (!scheduled || applied.current.theme === scheduled.frame) return;
    applied.current.theme = scheduled.frame;
    if (isKnownTheme(scheduled.name)) setTheme(scheduled.name);
  }, []);

  useLiveResource({
    intervalMs: 60_000,
    enabled: true,
    collectKeys: () => ["daynight-schedule"],
    shouldFetch: () => {
      const settings = getSettingsSnapshot();
      return settings.speedSchedule.enabled || settings.themeSchedule.enabled;
    },
    fetch: async () => {
      const settings = getSettingsSnapshot();
      const now = nowMinutesOf();
      if (settings.speedSchedule.enabled) {
        const frame = dayNightFrame(
          settings.speedSchedule.dayStart,
          settings.speedSchedule.nightStart,
          now
        );
        if (applied.current.speed !== frame) {
          applied.current.speed = frame;
          const limits =
            frame === "day"
              ? {
                  download: settings.speedSchedule.dayDownload,
                  upload: settings.speedSchedule.dayUpload,
                }
              : {
                  download: settings.speedSchedule.nightDownload,
                  upload: settings.speedSchedule.nightUpload,
                };
          patchSettings({ limits });
          await setTorrentSpeedLimits(limits).catch((error: unknown) =>
            reportBackgroundError("schedule.speed", error)
          );
        }
      } else {
        applied.current.speed = null;
      }
      const scheduled = scheduledThemeName(settings.themeSchedule, now);
      if (scheduled) {
        if (applied.current.theme !== scheduled.frame) {
          applied.current.theme = scheduled.frame;
          if (isKnownTheme(scheduled.name)) setTheme(scheduled.name);
        }
      } else {
        applied.current.theme = null;
      }
      return true;
    },
  });
}
