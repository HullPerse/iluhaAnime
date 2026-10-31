import { Button } from "@/components/ui/button.component";
import { WIZARD_BRAND_LABELS, WIZARD_SOURCES } from "@/config/collection/wizard.config";
import { useI18n } from "@/hooks/i18n.hook";
import type { WizardSearchResult, WizardSource } from "@/types/anilist/collection";

import { WizardSourceSearch } from "@/routes/components/collection/wizard/search.wizard";
import { TmdbBadge } from "@/routes/components/collection/wizard/tmdbBadge.wizard";

export function WizardSourcePanel({
  source,
  setSource,
  search,
  setSearch,
  onSearch,
  loading,
  hasTmdbKey,
  searchError,
  searched,
  searchResults,
  onPickResult,
}: {
  source: WizardSource;
  setSource: (source: WizardSource) => void;
  search: string;
  setSearch: (value: string) => void;
  onSearch: () => void;
  loading: boolean;
  hasTmdbKey: boolean;
  searchError: string | null;
  searched: boolean;
  searchResults: WizardSearchResult[];
  onPickResult: (result: WizardSearchResult) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="mb-2 flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {WIZARD_SOURCES.map((src) => (
          <Button
            key={src}
            variant={source === src ? "outline" : "default"}
            className="h-6 px-2 text-xs"
            onClick={() => setSource(src)}
          >
            {src === "custom" ? t("collection.type.custom") : WIZARD_BRAND_LABELS[src]}
          </Button>
        ))}
        {source === "tmdb" && <TmdbBadge />}
      </div>
      {source === "custom" ? null : (
        <WizardSourceSearch
          source={source}
          search={search}
          setSearch={setSearch}
          onSearch={onSearch}
          loading={loading}
          hasTmdbKey={hasTmdbKey}
          searchError={searchError}
          searched={searched}
          searchResults={searchResults}
          onPickResult={onPickResult}
        />
      )}
      {searchError && <p className="text-destructive text-xs">{searchError}</p>}
    </div>
  );
}
