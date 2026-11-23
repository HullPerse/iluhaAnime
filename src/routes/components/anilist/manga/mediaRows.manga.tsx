import AniListEntryCard from "@/routes/components/anilist/card.anilist";
import { openTrackedManga } from "@/store/anilistManga.store";
import type { AniListEntry, AniMedia } from "@/types/anilist/anilist";

export function MediaRows({ media, entries }: { media: AniMedia[]; entries: Map<number, AniListEntry> }) {
  return <div className="flex flex-col gap-1">{media.map((row) => (
    <AniListEntryCard key={row.id} item={{ ...row, media_type: "MANGA" }} entryLookup={entries} isFavorite={false}
      onClick={() => openTrackedManga(row.id, row.title)} />
  ))}</div>;
}
