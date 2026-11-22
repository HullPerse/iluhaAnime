import { Calendar } from "lucide-react";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/hooks/i18n.hook";
import { AniListMediaMode } from "@/routes/components/anilist/mediaMode.anilist";
import { query, search, page, filterOpen } from "@/store/anilistMangaProfile.store";

export function TrackingToolbar({ term, onStats }: { term: string; onStats?: () => void }) {
  const { t } = useI18n();

  return (
    <form
      className="ui-toolbar ui-panel flex flex-wrap gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        const value = new FormData(event.currentTarget).get("query");

        if (typeof value === "string") query.set(value.trim());
        page.set(1);
        search.set(true);
      }}
    >
      <Input
        name="query"
        defaultValue={term}
        aria-label={t("manga.search.query")}
        placeholder={t("manga.search.query")}
        className="w-auto min-w-24 flex-1"
      />
      {onStats && (
        <Button
          size="icon"
          className="h-7 w-7 text-xs"
          onClick={onStats}
          title={t("anilist.stats.title")}
          aria-label={t("anilist.stats.title")}
        >
          <Calendar className="size-3" />
        </Button>
      )}
      <AniListMediaMode manga />
      <Button onClick={() => filterOpen.set(true)}>{t("anilist.route.filters")}</Button>
      <Button type="submit">{t("manga.search.submit")}</Button>
    </form>
  );
}
