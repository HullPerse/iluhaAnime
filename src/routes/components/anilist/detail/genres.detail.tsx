import { CircleSmall, Tag } from "lucide-react";

import Section from "@/components/shared/section.component";
import { Button } from "@/components/ui/button.component";
import { DETAIL_TAG_COUNT } from "@/config/anilist/filters.config";
import { useI18n } from "@/lib/locale/i18n.utils";

export function GenresTagsSection({
  genres,
  tags,
  onGenre,
  onTag,
  onClose,
}: {
  genres: string[];
  tags: string[];
  onGenre?: (genre: string) => void;
  onTag?: (tag: string) => void;
  onClose?: () => void;
}) {
  const { t } = useI18n();
  return (
    <Section header={t("anilist.details.genres.tags")} className="flex flex-wrap gap-1 bg-white">
      {genres.map((g) => (
        <Button
          key={g}
          onClick={() => {
            onGenre?.(g);
            onClose?.();
          }}
          className="windows95-text bg-secondary hover:bg-secondary/60 windows95-active-border flex flex-row gap-1 px-1 font-bold text-white"
          variant="ghost"
          title={t("anilist.details.genre.search")}
        >
          <CircleSmall className="size-3 fill-white" />
          {g}
        </Button>
      ))}
      {tags.slice(0, DETAIL_TAG_COUNT).map((tag) => (
        <Button
          key={tag}
          onClick={() => {
            onTag?.(tag);
            onClose?.();
          }}
          className="windows95-text bg-primary hover:bg-surface -mx-0.5 flex flex-row gap-1 truncate px-1 text-left underline decoration-dotted"
          variant="ghost"
          title={t("anilist.details.genre.search")}
        >
          <Tag className="size-3" /> {tag}
        </Button>
      ))}
    </Section>
  );
}
