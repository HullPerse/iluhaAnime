import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { SearchFilters } from "@/types/search";

interface QuickChip {
  id: string;
  label: string;
  keywords: string;
  active: boolean;
  toggle: (filters: SearchFilters) => SearchFilters;
}

export function SearchFilterChips({
  query,
  filters,
  onChange,
}: {
  query: string;
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
}) {
  const { t } = useI18n();
  const chips: QuickChip[] = [
    {
      id: "seeds",
      label: t("search.chips.seeds"),
      keywords: "seed сид seeder",
      active: filters.minSeeders >= 10,
      toggle: (f) => ({ ...f, minSeeders: f.minSeeders >= 10 ? 0 : 10 }),
    },
    {
      id: "magnet",
      label: t("search.filters.only.magnet"),
      keywords: "magnet магнит",
      active: filters.hasMagnet,
      toggle: (f) => ({ ...f, hasMagnet: !f.hasMagnet }),
    },
    {
      id: "q1080",
      label: "1080p",
      keywords: "quality качество",
      active: filters.quality === "1080p",
      toggle: (f) => ({ ...f, quality: f.quality === "1080p" ? "all" : "1080p" }),
    },
    {
      id: "q720",
      label: "720p",
      keywords: "quality качество",
      active: filters.quality === "720p",
      toggle: (f) => ({ ...f, quality: f.quality === "720p" ? "all" : "720p" }),
    },
    {
      id: "ru",
      label: t("search.filters.russian"),
      keywords: "language язык russian",
      active: filters.language === "ru",
      toggle: (f) => ({ ...f, language: f.language === "ru" ? "all" : "ru" }),
    },
    {
      id: "en",
      label: t("search.filters.english"),
      keywords: "language язык english",
      active: filters.language === "en",
      toggle: (f) => ({ ...f, language: f.language === "en" ? "all" : "en" }),
    },
    {
      id: "hevc",
      label: "HEVC",
      keywords: "codec кодек x265",
      active: filters.codec === "HEVC",
      toggle: (f) => ({ ...f, codec: f.codec === "HEVC" ? "all" : "HEVC" }),
    },
    {
      id: "x264",
      label: "x264",
      keywords: "codec кодек",
      active: filters.codec === "x264",
      toggle: (f) => ({ ...f, codec: f.codec === "x264" ? "all" : "x264" }),
    },
  ];
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const hits = chips.filter((chip) => `${chip.label} ${chip.keywords}`.toLowerCase().includes(q));
  if (hits.length === 0) return null;
  return (
    <section aria-label={t("search.chips.title")} className="ui-panel flex flex-col gap-1 p-1">
      <span className="windows95-text text-hint px-1 text-xs">{t("search.chips.title")}</span>
      <div className="flex flex-row flex-wrap gap-1 px-1">
        {hits.map((chip) => (
          <Button
            key={chip.id}
            className="h-5 px-1 text-xs"
            variant={chip.active ? "outline" : "default"}
            aria-pressed={chip.active}
            onClick={() => onChange(chip.toggle(filters))}
          >
            {chip.label}
          </Button>
        ))}
      </div>
    </section>
  );
}
