import { ChevronLeft, ChevronRight, Dices, Star } from "lucide-react";

import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";
import ImageComponent from "@/components/ui/image.component";
import { formatLabels, listStatusLabels, statusLabels } from "@/config/anilist/labels.config";
import { useRemoteImage } from "@/hooks/remoteImage.hook";
import { getStatusColor, type EntryListInfo } from "@/lib/anilist/entries.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { toLocaleKey } from "@/lib/locale/key.utils";
import type { AniMedia } from "@/types/anilist";

export interface DiscoveryItem {
  media: AniMedia;
  entry?: EntryListInfo;
}

export interface DiscoveryNav {
  index: number;
  total: number;
  canPrev: boolean;
  busy: boolean;
  onPrev: () => void;
  onNext: () => void;
  onReroll: () => void;
  onDetails: (id: number) => void;
}

export interface DiscoveryCardProps {
  item: DiscoveryItem;
  nav: DiscoveryNav;
}

function Poster({ media }: { media: AniMedia }) {
  const coverSrc = useRemoteImage(media.cover_url);
  return (
    <ImageComponent
      src={coverSrc ?? "/images/unknown_source.png"}
      alt={media.title}
      className="block h-54 w-36"
    />
  );
}

export function DiscoveryCard({ item, nav }: DiscoveryCardProps) {
  const { t } = useI18n();
  const { media, entry } = item;
  const { index, total, canPrev, busy, onPrev, onNext, onReroll, onDetails } = nav;
  const chips: string[] = [];
  if (media.format) chips.push(t(toLocaleKey(formatLabels[media.format] ?? media.format)));
  if (media.season_year != null) chips.push(String(media.season_year));
  if (media.episodes != null) chips.push(`${media.episodes} ${t("anilist.details.eps.short")}`);
  return (
    <section className="flex w-full flex-row gap-2">
      <div className="windows95-border bg-field shrink-0 self-start">
        <Poster media={media} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3
          className="windows95-text text-text line-clamp-2 leading-tight font-bold"
          title={media.title}
        >
          {media.title}
        </h3>
        <div className="flex flex-wrap items-center gap-1">
          {media.score != null && (
            <span className="windows95-text bg-secondary text-title-text flex flex-row items-center gap-1 px-1 font-bold">
              <Star className="size-3 fill-white" aria-hidden /> {media.score}
            </span>
          )}
          <span className="windows95-text text-xs">
            {t(toLocaleKey(statusLabels[media.status] ?? media.status))}
          </span>
        </div>
        {chips.length > 0 && (
          <div className="flex flex-row flex-wrap gap-1">
            {chips.map((chip) => (
              <span
                key={chip}
                className="windows95-font windows95-border text-text bg-field px-1 text-xs"
              >
                {chip}
              </span>
            ))}
          </div>
        )}
        {media.description && (
          <p className="windows95-text text-text line-clamp-4 text-xs leading-relaxed">
            {media.description}
          </p>
        )}
        {entry && (
          <div className="flex flex-row items-center gap-1">
            <span
              className="windows95-border shrink-0"
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                backgroundColor: getStatusColor(entry.list_status),
              }}
              title={t(toLocaleKey(listStatusLabels[entry.list_status] ?? entry.list_status))}
            />
            <span className="windows95-text text-xs font-bold">
              {t(toLocaleKey(listStatusLabels[entry.list_status] ?? entry.list_status))}
            </span>
            {entry.progress != null && media.episodes != null && (
              <>
                <div className="windows95-border bg-field relative h-3.5 w-20 overflow-hidden">
                  <div
                    className="bg-secondary h-full"
                    style={{
                      width: `${Math.min(100, Math.round((entry.progress / media.episodes) * 100))}%`,
                    }}
                  />
                </div>
                <span className="windows95-text text-xs">
                  {entry.progress}/{media.episodes}
                </span>
              </>
            )}
            {entry.progress != null && media.episodes == null && (
              <span className="bg-secondary text-title-text px-1 text-xs">{entry.progress}</span>
            )}
          </div>
        )}
        <div className="mt-auto flex flex-row items-center gap-1 pt-1">
          <Button
            size="icon"
            disabled={!canPrev || busy}
            onClick={onPrev}
            title={t("anilist.random.prev")}
            aria-label={t("anilist.random.prev")}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            size="icon"
            disabled={busy}
            onClick={onReroll}
            title={t("anilist.random.reroll")}
            aria-label={t("anilist.random.reroll")}
          >
            <Dices className="size-4" />
          </Button>
          <Button
            size="icon"
            disabled={busy}
            onClick={onNext}
            title={t("anilist.random.next")}
            aria-label={t("anilist.random.next")}
          >
            <ChevronRight className="size-4" />
          </Button>
          {busy && <SmallLoader size={4} />}
          <span className="windows95-text text-text ml-auto text-xs">
            {t("anilist.random.counter", { n: index + 1, total })}
          </span>
          <Button disabled={busy} onClick={() => onDetails(media.id)}>
            {t("anilist.random.details")}
          </Button>
        </div>
      </div>
    </section>
  );
}
