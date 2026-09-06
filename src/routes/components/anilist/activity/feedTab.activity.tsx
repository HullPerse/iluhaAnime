import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { CalendarDays, List } from "lucide-react";
import { useMemo, useState } from "react";

import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { groupLabel } from "@/lib/anilist/activity.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { TranslationKey } from "@/lib/locale/i18n.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import type { AniActivity, AniListCollection } from "@/types/anilist";

import { FeedItem } from "./feedItem.activity";

const STATUS_FILTERS: { value: string; key: TranslationKey }[] = [
  { value: "", key: "anilist.activity.filter.all" },
  { value: "CURRENT", key: "anilist.activity.filter.current" },
  { value: "COMPLETED", key: "anilist.activity.filter.completed" },
  { value: "DROPPED", key: "anilist.activity.filter.dropped" },
  { value: "PAUSED", key: "anilist.activity.filter.paused" },
  { value: "PLANNING", key: "anilist.activity.filter.planning" },
  { value: "REPEATING", key: "anilist.activity.filter.repeating" },
];

export function FeedTab({
  userId,
  friendIds,
  lists,
  onAnimeClick,
}: {
  userId: number;
  friendIds: number[];
  lists: AniListCollection[];
  onAnimeClick: (id: number) => void;
}) {
  const { t, locale } = useI18n();
  const [statusFilter, setStatusFilter] = useState("");
  const [includeFriends, setIncludeFriends] = useState(false);
  const activityUserIds = useMemo(() => {
    const ids = includeFriends ? [userId, ...friendIds] : [userId];
    return [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))].sort((a, b) => a - b);
  }, [friendIds, includeFriends, userId]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["anilist_activity", activityUserIds],
    queryFn: () =>
      invokeTyped<AniActivity[]>("get_anilist_activity", {
        userIds: activityUserIds,
      }),
    enabled: userId > 0,
    staleTime: 60_000,
  });

  const listItems = useMemo(() => {
    const activities = (data ?? []).filter(
      (activity) =>
        activity.activity_type === "list" &&
        activity.media_id != null &&
        (statusFilter === "" || activity.status === statusFilter)
    );

    const filtered =
      activities.length > 0 || includeFriends
        ? activities
        : lists.flatMap((list) =>
            list.entries
              .filter((entry) => statusFilter === "" || entry.list_status === statusFilter)
              .map<AniActivity>((entry) => ({
                id: entry.media.id,
                created_at: entry.created_at ?? 0,
                activity_type: "list",
                status: entry.list_status,
                progress: entry.progress == null ? null : String(entry.progress),
                text: null,
                media_id: entry.media.id,
                media_title: entry.media.title,
                media_cover: entry.media.cover_url,
                user_id: userId,
                user_name: "",
                user_avatar: null,
              }))
          );

    const groups = new Map<string, AniActivity[]>();
    for (const activity of filtered) {
      if (activity.created_at <= 0) continue;
      const label = groupLabel(activity.created_at, t, locale);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(activity);
    }
    return groups;
  }, [data, includeFriends, lists, locale, statusFilter, userId, t]);

  const textItems = useMemo(() => (data ?? []).filter((a) => a.activity_type !== "list"), [data]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <SmallLoader size={6} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-6">
        <span className="windows95-text text-destructive text-center">
          {t("anilist.activity.load.error", {
            error: String(error ?? t("anilist.activity.unknown.error")),
          })}
        </span>
        <Button onClick={() => refetch()} className="text-xs">
          {t("anilist.activity.retry")}
        </Button>
      </div>
    );
  }

  if (!data?.length && lists.every((l) => l.entries.length === 0)) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <span className="windows95-text">{t("anilist.activity.empty")}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        {STATUS_FILTERS.map((f) => (
          <Button
            key={f.value}
            className={cn(
              "windows95-text px-1.5 py-0.5 text-xs",
              statusFilter === f.value
                ? "windows95-active-border bg-secondary text-white"
                : "windows95-border bg-white"
            )}
            variant="ghost"
            onClick={() => setStatusFilter(f.value)}
          >
            {t(f.key)}
          </Button>
        ))}
        {friendIds.length > 0 && (
          <label
            className="windows95-text ml-auto flex items-center gap-1 text-xs select-none"
            title={t("anilist.activity.friends.hint")}
          >
            <Checkbox checked={includeFriends} onChange={setIncludeFriends} />
            {t("anilist.activity.include.friends")}
          </label>
        )}
      </div>

      {textItems.length > 0 && (
        <section className="mt-1 flex flex-col gap-0.5">
          <span className="windows95-text text-hint flex items-center gap-1 text-xs font-bold">
            <List className="size-3" /> {t("anilist.activity.notes")}
          </span>
          <div className="flex flex-col gap-0.5">
            {textItems.map((a) => (
              <FeedItem key={a.id} a={a} onAnimeClick={onAnimeClick} />
            ))}
          </div>
        </section>
      )}

      {listItems.size === 0 ? (
        <div className="flex items-center justify-center p-4">
          <span className="windows95-text text-hint text-xs">
            {t("anilist.activity.empty.status")}
          </span>
        </div>
      ) : (
        [...listItems.entries()].map(([label, items]) => (
          <section key={label} className="mt-1 flex flex-col gap-0.5">
            <span className="windows95-text text-hint flex items-center gap-1 text-xs font-bold">
              <CalendarDays className="size-3" /> {label}
            </span>
            <div className="flex flex-col gap-0.5">
              {items.map((a) => (
                <FeedItem key={a.id} a={a} onAnimeClick={onAnimeClick} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
