import { formatDistanceToNow } from "date-fns";
import { memo } from "react";

import { entryListTime, fuzzyDateToTime, type EntryListInfo } from "@/lib/anilist/entries.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import { dateFnsLocale } from "@/lib/utils/date.utils";

function CardListDate({
  entry,
  fallback,
}: {
  entry: EntryListInfo | undefined;
  fallback: string | null;
}) {
  const { locale } = useI18n();
  const time = entryListTime(entry) ?? fuzzyDateToTime(fallback);
  if (!time) return null;
  const absolute = new Date(time).toLocaleDateString(locale);
  return (
    <span className="text-muted ml-auto" title={absolute}>
      {formatDistanceToNow(time, { addSuffix: true, locale: dateFnsLocale(locale) })}
    </span>
  );
}

export default memo(CardListDate);
