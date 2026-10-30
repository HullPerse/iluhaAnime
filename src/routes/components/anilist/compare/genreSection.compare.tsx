import { useI18n } from "@/hooks/i18n.hook";
import { formatNormalizedScore, formatSignedDelta } from "@/lib/core/compare.utils";
import type { GenreTaste } from "@/types/core/compare";

export function GenreSection({ genres, friendName }: { genres: GenreTaste[]; friendName: string }) {
  const { t } = useI18n();
  if (genres.length === 0) return null;
  return (
    <div className="border-t border-black/20 p-2">
      <p className="windows95-text mb-1 text-xs font-bold">{t("anilist.compare.genres.taste")}</p>
      <div className="text-hint grid grid-cols-[minmax(0,1fr)_4rem_4rem_2.5rem] gap-1 text-xs">
        <span />
        <span className="text-right">{t("anilist.compare.you.short")}</span>
        <span className="truncate text-right">{friendName}</span>
        <span className="text-right">{t("anilist.compare.delta.short")}</span>
      </div>
      {genres.map((genre) => (
        <div
          key={genre.genre}
          className="grid grid-cols-[minmax(0,1fr)_4rem_4rem_2.5rem] items-center gap-1 text-xs"
        >
          <span className="windows95-text truncate">
            {genre.genre}{" "}
            <span className="text-hint">
              ({genre.mineCount}/{genre.friendCount})
            </span>
          </span>
          <span className="windows95-text text-right">{formatNormalizedScore(genre.mine)}</span>
          <span className="windows95-text text-right">{formatNormalizedScore(genre.friend)}</span>
          <span className="windows95-text text-hint text-right">
            {formatSignedDelta(genre.delta)}
          </span>
        </div>
      ))}
    </div>
  );
}
