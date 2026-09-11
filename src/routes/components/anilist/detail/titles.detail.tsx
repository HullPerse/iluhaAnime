import { ChevronRight } from "lucide-react";

import Section from "@/components/shared/section.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";

export function TitlesSection({
  anime,
  onSearchTorrents,
}: {
  anime: { title?: string | null; titles: string[] };
  onSearchTorrents: (query?: string) => void;
}) {
  const { t } = useI18n();
  return (
    <Section header={t("anilist.details.all.titles")} className="flex flex-wrap gap-1 bg-white">
      <Button
        onClick={() => onSearchTorrents(anime.title ?? undefined)}
        className="windows95-text bg-primary hover:bg-surface -mx-0.5 flex flex-row gap-1 truncate px-1 text-left underline decoration-dotted"
        variant="ghost"
        title={t("anilist.details.torrent.search")}
      >
        <ChevronRight className="size-3" /> {anime.title}
      </Button>
      {anime.titles.map((title) => (
        <Button
          key={title}
          onClick={() => onSearchTorrents(title)}
          className="windows95-text bg-primary hover:bg-surface -mx-0.5 truncate px-1 text-left underline decoration-dotted"
          variant="ghost"
          title={t("anilist.details.torrent.search")}
        >
          <ChevronRight className="size-3" /> {title}
        </Button>
      ))}
    </Section>
  );
}
