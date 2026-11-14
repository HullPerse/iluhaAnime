import { useI18n } from "@/hooks/i18n.hook";
import { formatCardDate, formatCardRelativeDate } from "@/lib/cards/format.utils";

export default function CardDate({ timestamp }: { timestamp: number }) {
  const { locale } = useI18n();
  const relative = formatCardRelativeDate(timestamp, locale);
  const exact = formatCardDate(timestamp, locale);
  if (relative === "" || exact === "") return <span>-</span>;
  return (
    <time
      dateTime={new Date(timestamp * 1000).toISOString()}
      title={exact}
      className="cards-detail-date"
    >
      {relative}
    </time>
  );
}
