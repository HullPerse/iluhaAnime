import { X } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { LocalMediaFilter } from "@/lib/anilist/entries.utils";

export default function AniListLocalFilterBar({
  filter,
  count,
  onClear,
  onSearchGlobally,
}: {
  filter: LocalMediaFilter;
  count: number;
  onClear: () => void;
  onSearchGlobally: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="windows95-border bg-field flex min-w-0 items-center gap-1 p-1 text-xs">
      <span className="text-hint shrink-0">{t("anilist.local.filter")}</span>
      <span className="windows95-text min-w-0 truncate">
        {t(filter.kind === "tag" ? "anilist.local.tag" : "anilist.local.studio")}:{" "}
        <span className="font-bold">{filter.value}</span>
      </span>
      <span className="text-hint shrink-0 tabular-nums">({count})</span>
      <Button className="ml-auto h-5 px-1 text-xs" onClick={onSearchGlobally}>
        {t("anilist.local.search.global")}
      </Button>
      <Button
        size="icon"
        className="size-5 shrink-0"
        title={t("anilist.local.clear")}
        aria-label={t("anilist.local.clear")}
        onClick={onClear}
      >
        <X className="size-3" />
      </Button>
    </div>
  );
}
