import { Button } from "@/components/ui/button.component";
import { useRemoteImage } from "@/hooks/remoteImage.hook";
import { useI18n } from "@/lib/locale/i18n.utils";
import QuickAddButton from "@/routes/components/anilist/detail/quickadd.detail";
import type { AniMedia } from "@/types/anilist";

export function SpotlightRow({
  media,
  countdown,
  onDetails,
  isFavorite,
}: {
  media: AniMedia;
  countdown: string;
  onDetails: (id: number) => void;
  isFavorite: (id: number) => boolean;
}) {
  const { t } = useI18n();
  const cover = useRemoteImage(media.cover_url);
  const meta = [media.season_year, media.score, ...media.genres.slice(0, 2)]
    .filter((part) => part !== null && part !== undefined && part !== "")
    .join(" · ");
  return (
    <section className="windows95-border bg-field flex flex-row gap-2 p-1">
      {cover ? (
        <img src={cover} alt={media.title} className="h-20 w-14 shrink-0 object-cover" />
      ) : (
        <div className="bg-muted h-20 w-14 shrink-0" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="windows95-text truncate text-xs font-bold">{media.title}</span>
        {meta && <span className="windows95-text text-hint truncate text-xs">{meta}</span>}
        <span className="windows95-text text-hint text-xs">{countdown}</span>
        <div className="mt-auto flex flex-row gap-1">
          <Button className="h-5 px-1 text-xs" onClick={() => onDetails(media.id)}>
            {t("anilist.spotlight.details")}
          </Button>
          <QuickAddButton anime={media} isFavorite={isFavorite(media.id)} />
        </div>
      </div>
    </section>
  );
}
