import { ChevronLeft, ChevronRight } from "lucide-react";
import type { RefObject } from "react";
import type { MangaSource } from "@/api/manga.api";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { setSource } from "@/lib/manga/searchSource.utils";

export function SearchResultsHeader({
  name,
  source,
  expanded,
  heading,
  showAll,
}: {
  name: string;
  source: MangaSource;
  expanded: boolean;
  heading: RefObject<HTMLHeadingElement | null>;
  showAll: boolean;
}) {
  const { t } = useI18n();

  return (
    <header className="ui-titlebar justify-between">
      <h2 ref={heading} tabIndex={-1} className="flex min-w-0 scroll-mt-24 items-center gap-1">
        <img
          src={`/images/manga-sources/${source}.png`}
          alt=""
          width={16}
          height={16}
          className="size-4 shrink-0"
        />
        {name}
      </h2>
      {(expanded || showAll) && (
        <Button
          className="shrink-0"
          onClick={() => {
            setSource(expanded ? null : source, heading.current);
            heading.current?.focus({ preventScroll: true });
          }}
        >
          {expanded ? <ChevronLeft className="size-3" aria-hidden /> : null}
          {t(expanded ? "manga.search.backToSources" : "manga.search.all")}
          {expanded ? null : <ChevronRight className="size-3" aria-hidden />}
        </Button>
      )}
    </header>
  );
}
