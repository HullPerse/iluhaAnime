import { useEffect, useMemo } from "react";

import { discordApi } from "@/api/discord.api";
import { useI18n } from "@/hooks/i18n.hook";
import { useDebouncedValue } from "@/hooks/pacer.hook";
import { useCell } from "@/lib/signal.hook";
import {
  buildPlayerActivity,
  PRESENCE_PROGRESS_INTERVAL_MS,
  samePresence,
} from "@/lib/presence.utils";
import { reportPresenceCommand } from "@/lib/presenceCommand.utils";
import { playbackAtoms, streamSession } from "@/store/player.store";
import { settingsAtoms } from "@/store/settings.store";

export function usePlayerDiscordPresence(): void {
  const enabled = useCell(settingsAtoms.discordRpcEnabled);
  const parseTitles = useCell(settingsAtoms.parseTitlesPlayer);
  const path = useCell(playbackAtoms.path);
  const hasFile = useCell(playbackAtoms.hasFile);
  const paused = useCell(playbackAtoms.paused);
  const eofReached = useCell(playbackAtoms.eofReached);
  const duration = useCell(playbackAtoms.duration);
  const timePos = useCell(playbackAtoms.timePos);
  const stream = useCell(streamSession);
  const { t } = useI18n();

  // The card uses Discord timestamps, so during normal playback the activity
  // identity stays constant and Discord renders the elapsed time itself. The
  // debounce keeps position changes from hammering the pipe, while still
  // reflecting pause, seek and a new file within the interval.
  const activity = useMemo(() => {
    if (!enabled) return null;
    return buildPlayerActivity(
      {
        stream,
        path,
        hasFile,
        paused,
        eofReached,
        duration,
        timePos,
        parseTitles,
      },
      t
    );
  }, [enabled, parseTitles, path, hasFile, paused, eofReached, duration, timePos, stream, t]);

  const [scheduled] = useDebouncedValue(activity, {
    wait: PRESENCE_PROGRESS_INTERVAL_MS,
    equal: samePresence,
    enabled,
  });

  useEffect(() => {
    if (!enabled) return;
    if (scheduled === null) {
      reportPresenceCommand(discordApi.clear("player"), "discord.presence.player.clear");
    } else {
      reportPresenceCommand(discordApi.set("player", scheduled), "discord.presence.player");
    }
  }, [enabled, scheduled]);

  useEffect(
    () => () => {
      reportPresenceCommand(discordApi.clear("player"), "discord.presence.player.unmount");
    },
    []
  );
}
