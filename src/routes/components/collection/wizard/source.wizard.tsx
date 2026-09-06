import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { WizardSearchResult } from "@/types/collection";

import { WizardSourceSearch } from "./search.wizard";
import { TmdbBadge } from "./tmdbBadge.wizard";

export function WizardSourcePanel({
  source,
  setSource,
  search,
  setSearch,
  onSearch,
  loading,
  hasTmdbKey,
  searchError,
  searchResults,
  onPickResult,
}: {
  source: "anilist" | "tmdb" | "custom";
  setSource: (source: "anilist" | "tmdb" | "custom") => void;
  search: string;
  setSearch: (value: string) => void;
  onSearch: () => void;
  loading: boolean;
  hasTmdbKey: boolean;
  searchError: string | null;
  searchResults: WizardSearchResult[];
  onPickResult: (result: WizardSearchResult) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="mb-2 flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {(["custom", "anilist", "tmdb"] as const).map((src) => (
          <Button
            key={src}
            variant={source === src ? "outline" : "default"}
            className="h-6 px-2 text-xs"
            onClick={() => setSource(src)}
          >
            {src === "custom"
              ? t("collection.type.custom")
              : src === "anilist"
                ? "AniList"
                : "TMDB"}
          </Button>
        ))}
        {source === "tmdb" && <TmdbBadge />}
      </div>
      {source === "custom" ? (
        <p className="text-hint text-xs">{t("collection.wizard.manual.hint")}</p>
      ) : (
        <WizardSourceSearch
          source={source}
          search={search}
          setSearch={setSearch}
          onSearch={onSearch}
          loading={loading}
          hasTmdbKey={hasTmdbKey}
          searchResults={searchResults}
          onPickResult={onPickResult}
        />
      )}
      {searchError && <p className="text-destructive text-xs">{searchError}</p>}
    </div>
  );
}
