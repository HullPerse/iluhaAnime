import type { EntryListInfo } from "@/types/anilist/entries";

export function cardListEntry(
  entry: EntryListInfo | undefined,
  status: string | undefined,
  progress: number | null
) {
  if (!entry || !status) return undefined;
  return {
    progress,
    score: entry.score,
    list_status: status,
    notes: entry.notes,
    custom_lists: entry.custom_lists ?? [],
  };
}
