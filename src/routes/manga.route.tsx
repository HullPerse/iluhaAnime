import { useCell } from "@hullperse/hp_utils/react";

import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { sourceShowsNsfw } from "@/lib/manga/nsfw.utils";
import MangaDetail from "@/routes/components/manga/detail/view.detail";
import MangaHistory from "@/routes/components/manga/history/view.history";
import MangaLibrary from "@/routes/components/manga/library/view.library";
import MangaSearch from "@/routes/components/manga/search/view.search";
import MangaSources from "@/routes/components/manga/sources/view.sources";
import { mangaDetail, mangaSection } from "@/store/manga.store";
import { settingsAtoms } from "@/store/settings.store";

const sections = ["library", "search", "history", "sources"] as const;
export default function MangaRoute() {
  const active = useCell(mangaSection);
  const detail = useCell(mangaDetail);
  const nsfw = useCell(settingsAtoms.mangaSourceNsfw);
  const { t } = useI18n();

  return (
    <div className="flex h-full min-h-0 gap-1">
      <nav
        aria-label={t("app.manga")}
        className="windows95-border bg-field flex w-44 shrink-0 scrollbar-gutter-stable flex-col gap-1 overflow-y-auto p-1"
      >
        {sections.map((id) => (
          <Button
            key={id}
            aria-current={id === active ? "page" : undefined}
            className={
              id === active
                ? "bg-secondary text-title-text w-full justify-start text-xs font-bold"
                : "w-full justify-start text-xs"
            }
            onClick={() => mangaSection.set(id)}
          >
            <span className="min-w-0 flex-1 truncate text-start">{t(`manga.${id}`)}</span>
          </Button>
        ))}
      </nav>
      <section
        aria-labelledby="manga-heading"
        data-scroll-root
        className="windows95-border bg-primary min-h-0 min-w-0 flex-1 scrollbar-gutter-stable overflow-auto p-1"
      >
        {active === "search" && <MangaSearch />}
        {active === "sources" && <MangaSources />}
        {active === "library" && <MangaLibrary />}
        {active === "history" && <MangaHistory />}
      </section>
      {detail && (
        <MangaDetail
          key={`${detail.source}:${detail.id}:${detail.chapterId ?? detail.chapterKey ?? ""}`}
          {...detail}
          nsfw={sourceShowsNsfw(nsfw, detail.source)}
          onClose={() => mangaDetail.set(null)}
        />
      )}
    </div>
  );
}
