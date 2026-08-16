import { derivePersonalAnimeStats } from "@/lib/anime.stats";
import { useI18n } from "@/lib/i18n";
import type { AniListCollection } from "@/types/anilist";

export default function PersonalStats({
  lists,
}: {
  lists: AniListCollection[];
}) {
  const { t } = useI18n();
  const stats = derivePersonalAnimeStats(lists);
  const hours = Math.floor(stats.totalMinutes / 60);
  return (
    <section className="windows95-active-border bg-primary grid grid-cols-2 gap-1 p-1 text-[10px] md:grid-cols-4">
      <Metric
        label={t("anilist.personal.totalAnime")}
        value={String(stats.totalAnime)}
      />
      <Metric
        label={t("anilist.personal.watching")}
        value={String(stats.watching)}
      />
      <Metric
        label={t("anilist.personal.completed")}
        value={String(stats.completed)}
      />
      <Metric
        label={t("anilist.personal.episodes")}
        value={String(stats.episodesWatched)}
      />
      <Metric label={t("anilist.personal.hours")} value={`${hours} h`} />
      <Metric
        label={t("anilist.personal.meanScore")}
        value={stats.meanScore == null ? "—" : stats.meanScore.toFixed(1)}
      />
      <div className="col-span-2 md:col-span-2">
        <span className="text-muted">{t("anilist.personal.topGenres")}: </span>
        {stats.topGenres
          .map((genre) => `${genre.name} (${genre.count})`)
          .join(" · ") || "—"}
      </div>
      <div className="col-span-2 md:col-span-4">
        <span className="text-muted">{t("anilist.personal.topRated")}: </span>
        {stats.topTitles
          .map((title) => `${title.title} (${title.score})`)
          .join(" · ") || "—"}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="windows95-border flex flex-col bg-white px-1 py-0.5">
      <span className="text-muted text-[9px]">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
