import { useRef } from "react";

import { THEMES } from "@/config/settings/themes.config";
import { useLiveResource } from "@/hooks/liveResource.hook";
import { dayNightFrame, nowMinutesOf, type DayNightFrame } from "@/lib/settings/daynight.utils";
import { reportBackgroundError } from "@/lib/utils/attempt.utils";
import { setTorrentSpeedLimits } from "@/store/download.store";
import { getSettingsSnapshot, patchSettings } from "@/store/settings.store";
import { setTheme, themeAtoms } from "@/store/theme.store";

export function useDayNightScheduler(): void {
  const applied = useRef<{ speed: DayNightFrame | null; theme: DayNightFrame | null }>({
    speed: null,
    theme: null,
  });

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
      if (settings.themeSchedule.enabled) {
        const frame = dayNightFrame(
          settings.themeSchedule.dayStart,
          settings.themeSchedule.nightStart,
          now
        );
        if (applied.current.theme !== frame) {
          applied.current.theme = frame;
          const name =
            frame === "day" ? settings.themeSchedule.dayTheme : settings.themeSchedule.nightTheme;
          const known = new Set([
            ...THEMES.map((theme) => theme.name),
            ...themeAtoms.customThemes.get().map((theme) => theme.name),
          ]);
          if (known.has(name)) setTheme(name);
        }
      } else {
        applied.current.theme = null;
      }
      return true;
    },
  });
}
