import { useI18n } from "@/lib/locale/i18n.utils";

function CardAiredCount({
  status,
  nextEpisode,
  total,
}: {
  status: string;
  nextEpisode: number | null;
  total: number | null;
}) {
  const { t } = useI18n();
  if (status === "FINISHED" || nextEpisode == null) return null;
  return (
    <span
      className="bg-secondary text-primary flex flex-row items-center gap-0.5 px-1 text-xs"
      title={t("anilist.card.aired")}
    >
      {nextEpisode - 1}
      {total ? `/${total}` : ""}
    </span>
  );
}

export default CardAiredCount;
