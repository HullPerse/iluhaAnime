import { ChevronRight } from "lucide-react";

import Section from "@/components/shared/section.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import { useSearchStore } from "@/store/search.store";

function uniqueTitles(title: string, altTitles: string[]): string[] {
  const seen = new Set<string>();
  const rows: string[] = [];
  for (const raw of [title, ...altTitles]) {
    const value = raw.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(value);
  }
  return rows;
}

export function TitlesCollection({
  title,
  altTitles,
  onClose,
}: {
  title: string;
  altTitles: string[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const setCrossSearchQuery = useSearchStore((s) => s.setCrossSearchQuery);
  const rows = uniqueTitles(title, altTitles);
  if (rows.length === 0) return null;
  const searchTorrents = (query: string) => {
    setCrossSearchQuery(query);
    onClose();
  };
  return (
    <Section header={t("anilist.details.all.titles")} className="flex flex-wrap gap-1 bg-white">
      {rows.map((row) => (
        <Button
          key={row}
          onClick={() => searchTorrents(row)}
          className="windows95-text bg-primary hover:bg-surface -mx-0.5 flex flex-row gap-1 truncate px-1 text-left underline decoration-dotted"
          variant="ghost"
          title={t("anilist.details.torrent.search")}
        >
          <ChevronRight className="size-3" /> {row}
        </Button>
      ))}
    </Section>
  );
}
