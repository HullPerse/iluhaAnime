import { Play, Check, X, Bookmark, Pause, RotateCcw } from "lucide-react";

import ImageComponent from "@/components/ui/image.component";
import { formatActivityTime } from "@/lib/anilist/activity.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { TranslationKey } from "@/lib/locale/i18n.utils";
import type { AniActivity } from "@/types/anilist";

const STATUS_ICONS: Record<string, typeof Play> = {
  CURRENT: Play,
  COMPLETED: Check,
  DROPPED: X,
  PLANNING: Bookmark,
  PAUSED: Pause,
  REPEATING: RotateCcw,
};

const STATUS_LABELS: Record<string, string> = {
  CURRENT: "anilist.activity.status.CURRENT",
  COMPLETED: "anilist.activity.status.COMPLETED",
  DROPPED: "anilist.activity.status.DROPPED",
  PLANNING: "anilist.activity.status.PLANNING",
  PAUSED: "anilist.activity.status.PAUSED",
  REPEATING: "anilist.activity.status.REPEATING",
};

export function FeedItem({
  a,
  onAnimeClick,
}: {
  a: AniActivity;
  onAnimeClick: (id: number) => void;
}) {
  const { t, locale } = useI18n();
  const Icon = STATUS_ICONS[a.status ?? ""];

  if (a.activity_type !== "list" || !a.media_id) {
    return (
      <div className="windows95-active-border bg-primary flex flex-row items-start gap-2 px-1 py-1">
        {a.user_avatar ? (
          <ImageComponent
            src={a.user_avatar}
            alt="user_avatar"
            className="windows95-active-border h-7 w-7 shrink-0"
          />
        ) : (
          <div className="windows95-active-border flex h-7 w-7 shrink-0 items-center justify-center bg-white text-xs font-bold">
            {a.user_name[0] ?? "?"}
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="windows95-text text-xs">
            <span className="font-bold">{a.user_name}</span>{" "}
            <span className="text-hint">{t("anilist.activity.note")}</span> {a.text}
          </span>
          <span className="text-hint text-xs">{formatActivityTime(a.created_at, t, locale)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="windows95-active-border bg-primary flex flex-row items-center gap-2 px-1 py-1">
      {a.media_cover && (
        <ImageComponent
          src={a.media_cover}
          alt="media_cover"
          className="windows95-active-border h-16 w-11 shrink-0 object-cover hover:cursor-pointer"
          onClick={() => onAnimeClick(a.media_id!)}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="windows95-text text-xs">
          {a.user_name && (
            <>
              <span className="font-bold">{a.user_name}</span>{" "}
            </>
          )}
          {Icon && <Icon className="inline size-2.5" />}{" "}
          {t((STATUS_LABELS[a.status ?? ""] ?? a.status ?? "") as TranslationKey)}{" "}
        </span>
        <span
          className="windows95-text line-clamp-2 text-xs font-bold underline decoration-dotted hover:cursor-pointer"
          onClick={() => onAnimeClick(a.media_id!)}
        >
          {a.media_title}
        </span>
        <span className="text-hint windows95-font text-xs">
          {a.progress ? `${a.progress}` : ""}
          {a.progress ? " - " : ""}
          {formatActivityTime(a.created_at, t, locale)}
        </span>
      </div>
    </div>
  );
}
