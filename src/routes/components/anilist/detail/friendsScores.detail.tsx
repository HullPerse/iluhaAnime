import { Tooltip } from "@base-ui/react/tooltip";
import { MessageCircle, RotateCw, Star } from "lucide-react";
import { useState } from "react";

import { SmallLoader } from "@/components/shared/loader/small.loader";
import ProgressBar from "@/components/shared/progress.component";
import Section from "@/components/shared/section.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { listStatusLabels } from "@/config/system/labels.config";
import { useAppQuery } from "@/hooks/appQuery.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { getStatusColor } from "@/lib/anilist/entries.utils";
import { formatScore, parseScoreFormat } from "@/lib/anilist/anilistScore.utils";
import { loadFriendScores } from "@/lib/core/friends.utils";
import { queryKeys } from "@/lib/core/keys.utils";
import { useCell } from "@/lib/core/signal.hook";
import { toLocaleKey } from "@/lib/locale/key.utils";
import { anilistFriendsAtoms } from "@/store/anilist.store";

import { FriendScoreIcon } from "./friendsScores/scoreIcon.friendsScores";

export function FriendsScoresSection({ animeId }: { animeId: number }) {
  const { t } = useI18n();
  const friends = useCell(anilistFriendsAtoms.friends);
  const [expanded, setExpanded] = useState<boolean>(false);
  const base = friends.map((friend) => ({
    id: friend.id,
    name: friend.name,
    avatar: friend.avatar,
    score: null,
    scoreFormat: null,
    status: "",
    comment: null,
    repeat: null,
    progress: null,
    episodes: null,
  }));
  const key = base
    .map((friend) => friend.id)
    .sort((a, b) => a - b)
    .join(",");
  const query = useAppQuery("slow", {
    queryKey: queryKeys.friendScores(animeId, key),
    queryFn: () => loadFriendScores(animeId, base),
    enabled: expanded && base.length > 0,
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
            const format = parseScoreFormat(row.scoreFormat);
            const display = scored ? formatScore(row.score, format) : "-";
            const label = t(toLocaleKey(listStatusLabels[row.status] ?? row.status));
            const done = row.progress ?? 0;
            const total = row.episodes;
            const showProgress = row.progress != null && total != null && total > 0;
            const showRewatch = row.repeat != null && row.repeat > 0;
            return (
              <div
                key={row.id}
                className="windows95-border flex min-w-0 items-center gap-1 bg-white p-0.5"
              >
                <span
                  role="img"
                  aria-label={label}
                  title={label}
                  className="windows95-border shrink-0"
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    backgroundColor: getStatusColor(row.status),
                  }}
                />
                <ImageComponent
                  src={row.avatar || "/images/user_avatar.ico"}
                  alt={row.name}
                  className="windows95-active-border size-6 shrink-0"
                />
                <span className="windows95-text min-w-0 flex-1 truncate text-xs">{row.name}</span>
                {showProgress ? (
                  <span
                    title={t("anilist.details.friends.progress", { done, total })}
                    className="flex w-28 shrink-0 items-center gap-1"
                  >
                    <ProgressBar value={done} max={total} className="h-3 min-w-0 flex-1" slots />
                    <span className="text-hint shrink-0 text-xs tabular-nums">{`${done}/${total}`}</span>
                  </span>
                ) : (
                  <span className="w-28 shrink-0" />
                )}
                <span
                  title={scored ? `${t("anilist.friends.score")}: ${display}` : label}
                  aria-label={scored ? `${t("anilist.friends.score")}: ${display}` : label}
                  className="windows95-border bg-secondary text-primary relative flex h-6 w-16 flex-row items-center justify-between px-1 text-xs font-bold"
                >
                  {format === "POINT_3" && scored ? (
                    <FriendScoreIcon score={row.score} />
                  ) : (
                    <>
                      {format !== "POINT_3" && (
                        <Star className="size-3 fill-yellow-400 text-yellow-600" />
                      )}
                      {display}
                    </>
                  )}
                </span>
                {showRewatch ? (
                  <span
                    title={t("anilist.details.friends.rewatch", {
                      count: Number(row.repeat),
                    })}
                    className="windows95-border bg-primary relative flex size-6 shrink-0 items-center justify-center"
                  >
                    <RotateCw className="size-3" />
                    <span className="bg-primary windows95-text absolute -top-2 -right-1 px-0.5 text-xs leading-none font-bold tabular-nums">
                      {row.repeat}
                    </span>
                  </span>
                ) : (
                  <span className="size-6 shrink-0" />
                )}
                {row.comment ? (
                  <Tooltip.Root>
                    <Tooltip.Trigger
                      aria-label={t("anilist.details.friends.comment")}
                      className="windows95-border bg-primary flex size-6 shrink-0 cursor-default items-center justify-center"
                    >
                      <MessageCircle className="size-3" />
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Positioner
                        className="z-50 outline-none"
                        side="bottom"
                        align="end"
                        sideOffset={4}
                        collisionPadding={12}
                      >
                        <Tooltip.Popup className="outline-none">
                          <div className="windows95-border flex w-64 flex-col">
                            <span className="bg-surface windows95-text truncate px-1 py-0.5 text-xs font-bold">
                              {row.name}
                            </span>
                            <span className="bg-field windows95-active-border windows95-text px-1 py-0.5 text-xs whitespace-pre-wrap">
                              {row.comment}
                            </span>
                          </div>
                        </Tooltip.Popup>
                      </Tooltip.Positioner>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                ) : (
                  <span className="size-6 shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}
