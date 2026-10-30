import { getStatusColor } from "@/lib/anilist/entries.utils";
import type { EntryListInfo } from "@/types/anilist/entries";

export function FranchiseMeta({
  entry,
  statusLabel,
  meta,
}: {
  entry: EntryListInfo | undefined;
  statusLabel: string | null;
  meta: string;
}) {
  if (!entry || !statusLabel) return <span className="text-hint">{meta}</span>;
  return (
    <span className="text-hint flex flex-wrap items-center gap-x-1">
      <span className="flex items-center gap-1">
        <span
          aria-hidden
          className="windows95-border inline-block size-2.5 shrink-0"
          style={{ backgroundColor: getStatusColor(entry.list_status) }}
        />
        {statusLabel}
        <span aria-hidden>-</span>
      </span>
      <span>{meta}</span>
    </span>
  );
}
