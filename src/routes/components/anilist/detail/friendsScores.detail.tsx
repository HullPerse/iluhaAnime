import { Popover } from "@base-ui/react/popover";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { MessageCircle, RotateCw } from "lucide-react";
import { useState } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import Section from "@/components/shared/section.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { listStatusLabels } from "@/config/anilist/labels.config";
import { getStatusColor } from "@/lib/anilist/entries.utils";
import { loadFriendScores } from "@/lib/anilist/friends.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { toLocaleKey } from "@/lib/locale/key.utils";
import { useAniListFriendsStore } from "@/store/anilist.store";

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
    comment: null,
    repeat: null,
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
        <div className="flex flex-row items-center gap-1 p-1">
          <span className="windows95-text text-destructive min-w-0 flex-1 text-xs">
            {query.error instanceof Error ? query.error.message : String(query.error)}
          </span>
          <Button variant="link" onClick={() => query.refetch()}>
            {t("anilist.details.retry")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {rows.map((row) => {
            const scored = row.score != null && row.score !== 0;
            const label = t(toLocaleKey(listStatusLabels[row.status] ?? row.status));
            const hint = scored ? `${label} - ${row.score}/10` : label;
            return (
              <div
                key={row.id}
                className="bg-surface windows95-border flex min-w-0 items-center gap-1 p-0.5"
              >
                <ImageComponent
                  src={row.avatar || "/images/user_avatar.ico"}
                  alt={row.name}
                  className="windows95-active-border size-6 shrink-0"
                />
                <span className="windows95-text min-w-0 flex-1 truncate text-xs">{row.name}</span>
                <span
                  className="windows95-text shrink-0 px-1 text-xs leading-tight text-white"
                  style={{ backgroundColor: getStatusColor(row.status) }}
                  title={hint}
                >
                  {label}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-xs tabular-nums",
                    scored ? "windows95-text font-bold" : "text-hint"
                  )}
                >
                  {scored ? `${row.score}/10` : "-"}
                </span>
                {row.repeat != null && row.repeat > 0 && (
                  <span title={String(row.repeat)} className="text-hint flex shrink-0">
                    <RotateCw className="size-3" />
                  </span>
                )}
                {row.comment && (
                  <Popover.Root>
                    <Popover.Trigger
                      type="button"
                      aria-label={t("anilist.details.friends.comment")}
                      className="text-text flex shrink-0 cursor-pointer"
                    >
                      <MessageCircle className="size-3" />
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Positioner
                        className="z-50 outline-none"
                        side="bottom"
                        align="end"
                        sideOffset={4}
                        collisionPadding={12}
                      >
                        <Popover.Popup className="outline-none">
                          <div className="windows95-active-border bg-primary windows95-text max-w-64 p-1 text-xs whitespace-pre-wrap">
                            {row.comment}
                          </div>
                        </Popover.Popup>
                      </Popover.Positioner>
                    </Popover.Portal>
                  </Popover.Root>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}
