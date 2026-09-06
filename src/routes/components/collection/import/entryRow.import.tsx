import { Checkbox } from "@/components/ui/checkbox.component";
import { GENRE_PREVIEW_COUNT } from "@/config/collection/card.config";
import { anilistStatusToCollection } from "@/lib/collection/import.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { AniListEntry } from "@/types/anilist";

export function EntryRow({
  entry,
  checked,
  isDup,
  onToggle,
}: {
  entry: AniListEntry;
  checked: boolean;
  isDup: boolean;
  onToggle: (id: number) => void;
}) {
  const { t } = useI18n();
  const title = entry.media.title;
  return (
    <label
      className={`windows95-border flex cursor-pointer items-center gap-2 p-1 select-none ${checked ? "bg-white" : "bg-primary"} ${isDup ? "opacity-60" : ""}`}
      title={isDup ? t("collection.import.anilist.already.exists") : ""}
    >
      <Checkbox checked={checked} onChange={() => onToggle(entry.media.id)} />
      {entry.media.cover_url ? (
        <img
          src={entry.media.cover_url}
          alt=""
          className="windows95-border h-10 w-8 shrink-0 object-cover"
        />
      ) : (
        <div className="bg-surface windows95-border h-10 w-8 shrink-0" />
      )}
      <div className="flex min-w-0 flex-col">
        <span className="windows95-text truncate text-xs font-bold" title={title}>
          {title}
        </span>
        <span className="text-hint truncate text-xs">
          {entry.media.season_year ?? ""}{" "}
          {entry.media.genres?.slice(0, GENRE_PREVIEW_COUNT).join(", ") ?? ""}
        </span>
        {isDup ? (
          <span className="text-destructive text-xs">
            {t("collection.import.anilist.duplicate.skip")}
          </span>
        ) : (
          <span className="text-hint text-xs">
            → {anilistStatusToCollection(entry.list_status)} | {entry.progress ?? 0}/
            {entry.media.episodes ?? "?"}
          </span>
        )}
      </div>
    </label>
  );
}
