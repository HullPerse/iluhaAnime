import { useEffect, useMemo, useRef } from "react";

import { discordApi } from "@/api/discord.api";
import { useI18n } from "@/hooks/i18n.hook";
import { useCell } from "@hullperse/hp_utils/react";
import {
  buildPlayerActivity,
  presenceTimestampsDrifted,
  samePresenceCard,
} from "@/lib/core/system/presence.utils";
import { reportPresenceCommand } from "@/lib/core/system/presenceCommand.utils";
import { playbackAtoms, streamSession } from "@/store/player.store";
import { settingsAtoms } from "@/store/settings.store";
import type { DiscordActivity } from "@/types/core/discord";

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

  // Publishing goes through an explicit diff instead of a debounce. Discord
  // renders the timestamp itself, so a stable anchor stays in sync while the
  // video plays; the card only has to be re-sent when it changes (play/pause,
  // a new episode) or when the timeline jumps (seek, speed, duration). Waiting
  // for a progress interval here made a pause land in Discord 15 s late, with
  // the old clock still running in the profile.
  const lastSentRef = useRef<DiscordActivity | null>(null);

  useEffect(() => {
    if (!enabled) {
      lastSentRef.current = null;
      return;
    }
    if (activity === null) {
      lastSentRef.current = null;
      reportPresenceCommand(discordApi.clear("player"), "discord.presence.player.clear");
      return;
    }
    const previous = lastSentRef.current;
    if (
      previous === null ||
      !samePresenceCard(previous, activity) ||
      presenceTimestampsDrifted(previous, activity)
    ) {
      lastSentRef.current = activity;
      reportPresenceCommand(discordApi.set("player", activity), "discord.presence.player");
    }
  }, [enabled, activity]);

  useEffect(
    () => () => {
      reportPresenceCommand(discordApi.clear("player"), "discord.presence.player.unmount");
    },
    []
  );
}
