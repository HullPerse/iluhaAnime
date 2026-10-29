import { useEffect, useMemo } from "react";

import { discordApi } from "@/api/discord.api";
import { useI18n } from "@/hooks/i18n.hook";
import { useDebouncedValue } from "@/hooks/pacer.hook";
import { useCell } from "@/lib/state/signal.hook";
import {
  buildDetailActivity,
  buildIdleActivity,
  buildSearchActivity,
  samePresence,
} from "@/lib/utils/presence.utils";
import { reportPresenceCommand } from "@/lib/utils/presenceCommand.utils";
import { useUserAnilistData } from "@/routes/components/anilist/user/data.user";
import { presenceAtoms } from "@/store/presence.store";
import { settingsAtoms } from "@/store/settings.store";
import type { DiscordActivity } from "@/types/discord";
import type { TabId } from "@/types/settings";

const PRESENCE_DEBOUNCE_MS = 800;

function sendPresence(activity: DiscordActivity | null): void {
  const request = activity ? discordApi.set("main", activity) : discordApi.clear("main");
  reportPresenceCommand(request, "discord.presence.main");
}

export function useDiscordPresence(activeTab: TabId): void {
  const enabled = useCell(settingsAtoms.discordRpcEnabled);
  const searching = useCell(presenceAtoms.search);
  const detail = useCell(presenceAtoms.detail);
  const { t } = useI18n();
  const { user } = useUserAnilistData();

  const activity = useMemo(() => {
    if (!enabled) return null;
    if (detail) return buildDetailActivity(detail, t);
    if (activeTab === "search" && searching) return buildSearchActivity(t);
    return buildIdleActivity(user, t);
  }, [activeTab, detail, enabled, searching, t, user]);

  const [scheduled] = useDebouncedValue(activity, {
    wait: PRESENCE_DEBOUNCE_MS,
    equal: samePresence,
    enabled,
  });

  useEffect(() => {
    reportPresenceCommand(discordApi.configure(enabled), "discord.presence.configure");
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    sendPresence(scheduled);
  }, [enabled, scheduled]);

  useEffect(
    () => () => {
      reportPresenceCommand(discordApi.clear("main"), "discord.presence.clear");
    },
    []
  );
}
