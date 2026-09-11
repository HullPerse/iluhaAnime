import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import Section from "@/components/shared/section.component";
import ImageComponent from "@/components/ui/image.component";
import { listStatusLabels } from "@/config/anilist/labels.config";
import { getStatusColor } from "@/lib/anilist/entries.utils";
import { anilistProxyArgs } from "@/lib/anilist/proxy.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { toLocaleKey } from "@/lib/locale/key.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useAniListFriendsStore } from "@/store/anilist.store";
import { useSettingsStore } from "@/store/settings.store";
import type { AniListCollection } from "@/types/anilist";

interface FriendScore {
  id: number;
  name: string;
  avatar: string | null;
  score: number | null;
  status: string;
}

async function loadFriendScores(animeId: number, friends: FriendScore[]): Promise<FriendScore[]> {
  const settled = await Promise.allSettled(
    friends.map((friend) =>
      invokeTyped<AniListCollection[]>("get_anilist_lists", {
        userId: friend.id,
        ...anilistProxyArgs(useSettingsStore.getState().anilistProxyUrl),
      }).then((lists) => {
        const entry = lists
          .flatMap((list) => list.entries)
          .find((item) => item.media.id === animeId);
        return entry ? { ...friend, score: entry.score, status: entry.list_status } : null;
      })
    )
  );
  const rows = settled.flatMap((result) =>
    result.status === "fulfilled" && result.value ? [result.value] : []
  );
  if (rows.length === 0) {
    const failure = settled.find((result) => result.status === "rejected");
    if (failure) throw failure.reason;
  }
  return rows;
}

export function FriendsScoresSection({ animeId }: { animeId: number }) {
  const { t } = useI18n();
  const friends = useAniListFriendsStore((state) => state.friends);
  const [expanded, setExpanded] = useState(false);
  const base = friends.map((friend) => ({
    id: friend.id,
    name: friend.name,
    avatar: friend.avatar,
    score: null,
    status: "",
  }));
  const key = base
    .map((friend) => friend.id)
    .sort((a, b) => a - b)
    .join(",");
  const query = useQuery({
    queryKey: ["friends_scores", animeId, key],
    queryFn: () => loadFriendScores(animeId, base),
    enabled: expanded && base.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  if (friends.length === 0) return null;
  const rows = query.data ?? [];
  return (
    <Section
      header={t("anilist.details.friends.scores")}
      className="bg-primary"
      expanded={expanded}
      onExpand={() => setExpanded((prev) => !prev)}
      files={rows.length > 0 ? rows.length : undefined}
    >
      {query.isLoading ? (
        <div className="flex justify-center p-4">
          <SmallLoader />
        </div>
      ) : query.isError ? (
        <div className="windows95-text text-destructive p-2 text-xs">
          {query.error instanceof Error ? query.error.message : String(query.error)} -{" "}
          <button type="button" className="underline" onClick={() => query.refetch()}>
            {t("anilist.details.retry")}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {rows.map((row) => {
            const label = t(toLocaleKey(listStatusLabels[row.status] ?? row.status));
            const hint =
              row.score != null && row.score !== 0 ? `${label} - ${row.score}/10` : label;
            return (
              <div key={row.id} className="flex min-w-0 items-center gap-1 p-0.5">
                <ImageComponent
                  src={row.avatar || "/images/user_avatar.ico"}
                  alt={row.name}
                  className="windows95-active-border size-7 shrink-0"
                />
                <span className="windows95-text min-w-0 flex-1 truncate text-xs">{row.name}</span>
                <span
                  className="windows95-border shrink-0"
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    backgroundColor: getStatusColor(row.status),
                  }}
                  title={hint}
                  aria-label={hint}
                />
                <span className="text-hint shrink-0 text-xs">
                  {row.score != null && row.score !== 0 ? `${row.score}/10` : "-"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}
