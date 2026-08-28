import { Search } from "lucide-react";

import { Button } from "@/components/ui/button.component";
import type { WizardSearchResult } from "@/hooks/wizardSearch.hook";
import { useI18n } from "@/lib/i18n";

export function WizardSourcePanel({
  source,
  setSource,
  search,
  setSearch,
  onSearch,
  loading,
  hasTmdbKey,
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
  searchResults: WizardSearchResult[];
  onPickResult: (result: WizardSearchResult) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="mb-2 flex flex-col gap-1">
      <div className="flex gap-1">
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
      </div>
      {source === "custom" ? (
        <p className="text-hint text-xs">{t("collection.wizard.manualHint")}</p>
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
    </div>
  );
}

export function WizardSourceSearch({
  source,
  search,
  setSearch,
  onSearch,
  loading,
  hasTmdbKey,
  searchResults,
  onPickResult,
}: {
  source: "anilist" | "tmdb";
  search: string;
  setSearch: (value: string) => void;
  onSearch: () => void;
  loading: boolean;
  hasTmdbKey: boolean;
  searchResults: WizardSearchResult[];
  onPickResult: (result: WizardSearchResult) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <div className="flex gap-1">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          placeholder={
            source === "anilist"
              ? t("collection.wizard.searchAnilist")
              : t("collection.wizard.searchTmdb")
          }
          className="windows95-border flex-1 bg-white px-2 py-1 text-xs"
        />
        <Button onClick={onSearch} disabled={loading}>
          <Search className="size-3" /> Search
        </Button>
      </div>
      {source === "tmdb" && !hasTmdbKey && (
        <p className="text-destructive text-xs">
          {t("collection.wizard.tmdbKeyMissing")}
        </p>
      )}
      <div className="flex flex-col gap-1">
        {searchResults.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onPickResult(r)}
            className="windows95-border hover:bg-surface flex items-center gap-2 bg-white p-1 text-left"
          >
            {r.cover_url && (
              <img src={r.cover_url} alt="" className="h-10 w-7 object-cover" />
            )}
            <span className="truncate text-xs font-bold">{r.title}</span>
            {r.year && (
              <span className="text-hint ml-auto text-xs">{r.year}</span>
            )}
          </button>
        ))}
      </div>
    </>
  );
}