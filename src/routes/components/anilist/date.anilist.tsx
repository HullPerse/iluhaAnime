import { memo } from "react";

import { useI18n } from "@/hooks/i18n.hook";
import { entryListTime, fuzzyDateToTime, type EntryListInfo } from "@/lib/anilist/entries.utils";
import { formatDistanceToNowOwn } from "@/lib/utils/distance.utils";

function CardListDate({
  entry,
  fallback,
}: {
  entry: EntryListInfo | undefined;
  fallback: string | null;
}) {
  const { t, locale } = useI18n();
  const time = entryListTime(entry) ?? fuzzyDateToTime(fallback);
  if (!time) {
    if (!entry) return null;
    const old = t("anilist.card.old.entry");
    return (
      <span className="text-muted ml-auto" title={old}>
        {old}
      </span>
    );
  }
  const absolute = new Date(time).toLocaleDateString(locale);
  return (
    <span className="text-muted ml-auto" title={absolute}>
      {formatDistanceToNowOwn(time, locale)}
    </span>
  );
}

export default memo(CardListDate);
