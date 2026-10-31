import { useCallback, useEffect, useRef } from "react";

import { SETTINGS_FLUSH_MS, VOLUME_IPC_MS } from "@/config/player/playbackTiming.config";
import { reportBackgroundError } from "@/lib/core/attempt.utils";
import { Debouncer } from "@/lib/core/debounce.utils";
import { ignore } from "@/lib/core/promise.utils";
import { Throttler } from "@/lib/core/throttle.utils";
import { translate } from "@/lib/locale/i18n.utils";
import {
  applyPlayerProfile,
  applyProperties,
  audioOptions,
  colorOptions,
  diffOptions,
  hdrOptions,
  setEofMode as setEofModeCommand,
  setMpvProperty,
  transformOptions,
} from "@/lib/player/playback.utils";
import { getPlayerSnapshot, streamSession, subscribePlayer } from "@/store/player.store";
import { addNotification } from "@/store/notification.store";
import { settingsAtoms } from "@/store/settings.store";
import type { PlayerSettings } from "@/types/player/videoPlayer";

export function usePlayerSettingsSync(): void {
  const volumeThrottlerRef = useRef<Throttler<[number]> | null>(null);
  const settingsDebouncerRef = useRef<Debouncer<[PlayerSettings]> | null>(null);
  const previousSettingsRef = useRef<PlayerSettings | null>(null);
  const settingsSyncFailedRef = useRef(false);
  const rejectedSettingsRef = useRef<Set<string>>(new Set());

  const sendVolumeNow = useCallback((value: number) => {
    setMpvProperty("volume", Math.round(value * 100)).catch((error: unknown) =>
      reportBackgroundError("player.settings.volume", error)
    );
  }, []);

  const sendVolumeThrottled = useCallback(
    (value: number) => {
      if (volumeThrottlerRef.current === null) {
        volumeThrottlerRef.current = new Throttler(sendVolumeNow, { wait: VOLUME_IPC_MS });
      }
      volumeThrottlerRef.current.maybeExecute(value);
    },
    [sendVolumeNow]
  );

  useEffect(() => {
    return () => {
      settingsDebouncerRef.current?.cancel();
      volumeThrottlerRef.current?.cancel();
    };
  }, []);

  useEffect(() => {
    let previous = getPlayerSnapshot();
    return subscribePlayer(() => {
      const state = getPlayerSnapshot();
      if (state.volume !== previous.volume) {
        sendVolumeThrottled(state.volume);
      }
      if (state.profile !== previous.profile && streamSession.get() === null) {
        applyPlayerProfile(state.profile).catch((error: unknown) =>
          reportBackgroundError("player.settings.profile", error)
        );
      }
      if (state.settings !== previous.settings) {
        if (settingsDebouncerRef.current === null) {
          settingsDebouncerRef.current = new Debouncer(
            (latest: PlayerSettings) => {
              const baseline = previousSettingsRef.current;
              const full = settingsSyncFailedRef.current || baseline === null;
              previousSettingsRef.current = latest;
              const reference = baseline ?? latest;
              const groups: Array<[Record<string, unknown>, Record<string, unknown>]> = [
                [transformOptions(reference), transformOptions(latest)],
                [hdrOptions(reference), hdrOptions(latest)],
                [colorOptions(reference), colorOptions(latest)],
                [audioOptions(reference), audioOptions(latest)],
              ];
              const jobs: Array<Promise<string[]>> = [];
              for (const [prevOptions, nextOptions] of groups) {
                const options = full ? nextOptions : diffOptions(prevOptions, nextOptions);
                if (Object.keys(options).length > 0) jobs.push(applyProperties(options));
              }
              if (jobs.length === 0) {
                settingsSyncFailedRef.current = false;
                return;
              }
              ignore(
                Promise.all(jobs).then((failedLists) => {
                  const rejected = failedLists.flat();
                  settingsSyncFailedRef.current = rejected.length > 0;
                  if (rejected.length === 0) {
                    rejectedSettingsRef.current.clear();
                    return;
                  }
                  const fresh = rejected.filter((name) => !rejectedSettingsRef.current.has(name));
                  if (fresh.length === 0) return;
                  for (const name of fresh) rejectedSettingsRef.current.add(name);
                  const language = settingsAtoms.language.get();
                  addNotification(
                    translate(language, "player.media.settings.rejected.title"),
                    "error",
                    translate(language, "player.media.settings.rejected.message", {
                      properties: fresh.join(", "),
                    })
                  );
                  return null;
                })
              );
            },
            { wait: SETTINGS_FLUSH_MS }
          );
        }
        settingsDebouncerRef.current.maybeExecute(state.settings);
      }
      if (state.eofMode !== previous.eofMode) {
        setEofModeCommand(state.eofMode).catch((error: unknown) =>
          reportBackgroundError("player.settings.eof", error)
        );
      }
      previous = state;
    });
  }, [sendVolumeThrottled]);
}
