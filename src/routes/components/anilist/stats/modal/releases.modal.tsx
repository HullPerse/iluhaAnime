import { useEffect } from "react";

import { useI18n } from "@/hooks/i18n.hook";
import { formatDistanceToNowOwn } from "@/lib/core/distance.utils";
import { useCell } from "@/lib/core/signal.hook";
import { anilistNotificationsAtoms, markAnilistReleasesRead } from "@/store/anilist.store";

export function StatsReleases({ onAnimeClick }: { onAnimeClick: (id: number) => void }) {
  const { t, locale } = useI18n();
  const releases = useCell(anilistNotificationsAtoms.releases);
  useEffect(() => {
    markAnilistReleasesRead();
  }, []);
  if (releases.length === 0) {
    return (
      <span className="windows95-text text-hint p-3 text-center text-xs">
        {t("anilist.stats.released.empty")}
      </span>
    );
  }
  return (
    <div className="flex max-h-96 flex-col gap-1 overflow-y-auto p-1">
      {releases.map((release) => (
        <button
          key={`${release.mediaId}:${release.episode}`}
          type="button"
          onClick={() => onAnimeClick(release.mediaId)}
          className="windows95-border bg-primary hover:bg-surface flex w-full cursor-pointer items-center gap-2 px-1 py-0.5 text-left"
        >
          <span className="windows95-text min-w-0 flex-1 truncate text-xs">
            <span className="font-bold">{release.title}</span>{" "}
            <span className="text-hint">
              {t("anilist.activity.episode", { n: release.episode })}
            </span>
          </span>
          <span className="text-hint windows95-font shrink-0 text-xs">
            {formatDistanceToNowOwn(release.airedAt, locale)}
          </span>
        </button>
      ))}
    </div>
  );
}
