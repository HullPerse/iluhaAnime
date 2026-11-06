import { Film } from "lucide-react";
import { useEffect, useMemo } from "react";

import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { formatDistanceToNowOwn } from "@/lib/core/search/distance.utils";
import { useCell } from "@hullperse/hp_utils/react";
import { enterOrSpace } from "@/lib/ui/keyboard.utils";
import { anilistNotificationsAtoms, markAnilistReleasesRead } from "@/store/anilist.store";
import type { AniListCollection } from "@/types/anilist/anilist";

export function StatsReleases({
  onAnimeClick,
  lists,
}: {
  onAnimeClick: (id: number) => void;
  lists: AniListCollection[];
}) {
  const { t, locale } = useI18n();
  const releases = useCell(anilistNotificationsAtoms.releases);
  const covers = useMemo(() => {
    const byId = new Map<number, string>();
    for (const list of lists) {
      for (const entry of list.entries) {
        if (entry.media.cover_url) byId.set(entry.media.id, entry.media.cover_url);
      }
    }
    return byId;
  }, [lists]);
  useEffect(() => {
    markAnilistReleasesRead();
  }, []);
  if (releases.length === 0) {
    return (
      <section className="windows95-border bg-field flex min-h-40 items-center justify-center p-3">
        <div className="flex flex-col items-center gap-2">
          <Film className="text-hint size-5" aria-hidden />
          <span className="windows95-text text-hint text-center text-xs">
            {t("anilist.stats.released.empty")}
          </span>
        </div>
      </section>
    );
  }
  return (
    <section className="windows95-border bg-field max-h-96 overflow-y-auto">
      {releases.map((release, index) => {
        const coverUrl = release.coverUrl ?? covers.get(release.mediaId) ?? null;
        return (
          <div
            key={`${release.mediaId}:${release.episode}`}
            role="button"
            tabIndex={0}
            aria-label={release.title}
            data-vim-target="stats-entry"
            className={`hover:bg-surface focus-visible:bg-surface flex cursor-pointer items-center gap-2 px-2 py-1.5 ${
              index > 0 ? "border-t-muted/60 border-t" : ""
            }`}
            onClick={() => onAnimeClick(release.mediaId)}
            onKeyDown={enterOrSpace(() => onAnimeClick(release.mediaId))}
          >
            {coverUrl ? (
              <ImageComponent
                src={coverUrl}
                alt=""
                className="windows95-border h-12 w-8 shrink-0"
              />
            ) : (
              <span className="windows95-border bg-surface flex h-12 w-8 shrink-0 items-center justify-center">
                <Film className="text-hint size-3.5" aria-hidden />
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="windows95-font truncate text-xs font-bold">{release.title}</span>
              <span className="flex min-w-0 items-center gap-1">
                <span className="bg-secondary windows95-font text-title-text shrink-0 px-1 text-[10px] leading-4">
                  {t("anilist.activity.episode", { n: release.episode })}
                </span>
              </span>
            </span>
            <span className="text-hint windows95-font shrink-0 text-[10px]">
              {formatDistanceToNowOwn(release.airedAt, locale)}
            </span>
          </div>
        );
      })}
    </section>
  );
}
