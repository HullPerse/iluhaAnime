import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { Input } from "@/components/ui/input.component";
import Select from "@/components/ui/select.component";
import { SOURCE_INFOS } from "@/config/search.config";
import { deleteAppCache } from "@/lib/app.cache";
import { useI18n } from "@/lib/i18n";
import { useSearchStore } from "@/store/search.store";
import { useSettingsStore } from "@/store/settings.store";

export default function SettingsSearch() {
  const {
    defaultSearchSource,
    visibleSources,
    resultsPerPage,
    anilistPageSize,
    anilistMaxPages,
    searchHistoryMaxItems,
    autocompleteMode,
    anilistSuggestionBoost,
    patch,
  } = useSettingsStore();
  const { t } = useI18n();
  const learningHistory = useSearchStore((state) => state.history);
  const learningAnimeCount = useSearchStore((state) => state.animeIndex.length);
  const learningQueryStats = useSearchStore((state) => state.queryStats);
  const learningSuggestionStats = useSearchStore(
    (state) => state.suggestionStats
  );
  const learnedQueries = Object.values(learningQueryStats).reduce(
    (total, stat) => total + stat.count,
    0
  );
  const selectedSuggestions = Object.values(learningSuggestionStats).reduce(
    (total, stat) => total + stat.selectedCount,
    0
  );

  const toggleSource = (value: string) => {
    const next = visibleSources.includes(value)
      ? visibleSources.filter((v) => v !== value)
      : [...visibleSources, value];
    patch({ visibleSources: next });
    if (!next.includes(defaultSearchSource) && next.length > 0) {
      patch({ defaultSearchSource: next[0] });
    }
  };

  const defaultOpts = SOURCE_INFOS.filter((s) =>
    visibleSources.includes(s.value)
  ).map((s) => ({
    value: s.value,
    label: s.nsfw ? `${s.label} (NSFW)` : s.label,
  }));

  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="windows95-text text-muted w-full font-bold">
        {t("settings.search.title")}
      </p>

      <label className="windows95-text text-text flex items-center gap-2">
        <span className="w-48">{t("settings.search.defaultSource")}</span>
        <Select
          value={
            visibleSources.includes(defaultSearchSource)
              ? defaultSearchSource
              : (defaultOpts[0]?.value ?? "")
          }
          onChange={(v) => patch({ defaultSearchSource: v })}
          options={defaultOpts}
          disabled={defaultOpts.length === 0}
          className="w-28"
        />
      </label>

      <hr className="border-muted my-1 w-full border-t" />

      <p className="windows95-text text-muted w-full font-bold">
        {t("settings.search.visibleSources")}
      </p>
      <div className="flex flex-col gap-1">
        {SOURCE_INFOS.map((info) => (
          <label
            key={info.value}
            className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none"
          >
            <Checkbox
              checked={visibleSources.includes(info.value)}
              onChange={() => toggleSource(info.value)}
            />
            {info.nsfw && (
              <span className="text-destructive text-xs font-bold">
                [NSFW]
              </span>
            )}
            <span>{info.label}</span>
          </label>
        ))}
      </div>

      <hr className="border-muted my-1 w-full border-t" />

      <label className="windows95-text text-text flex items-center gap-2">
        <span className="w-48">{t("settings.search.resultsPerPage")}</span>
        <Input
          type="number"
          min={5}
          max={100}
          value={resultsPerPage}
          onChange={(e) => patch({ resultsPerPage: Number(e.target.value) })}
          className="w-16"
        />
      </label>

      <label className="windows95-text text-text flex items-center gap-2">
        <span className="w-48">{t("settings.search.historyMax")}</span>
        <Input
          type="number"
          min={0}
          max={500}
          value={searchHistoryMaxItems}
          onChange={(e) =>
            patch({ searchHistoryMaxItems: Number(e.target.value) })
          }
          className="w-16"
        />
      </label>

      <label className="windows95-text text-text flex items-center gap-2">
        <span className="w-48">{t("settings.search.autocompleteMode")}</span>
        <Select
          value={autocompleteMode}
          onChange={(value) =>
            patch({ autocompleteMode: value as typeof autocompleteMode })
          }
          options={[
            {
              value: "inline",
              label: t("settings.search.autocompleteModeInline"),
            },
            {
              value: "dropdown",
              label: t("settings.search.autocompleteModeDropdown"),
            },
            {
              value: "both",
              label: t("settings.search.autocompleteModeBoth"),
            },
            {
              value: "off",
              label: t("settings.search.autocompleteModeOff"),
            },
          ]}
          className="w-40"
        />
      </label>

      {autocompleteMode === "off" ? (
        <p className="windows95-text text-destructive w-full text-xs">
          {t("settings.search.autocompleteModeOffHint")}
        </p>
      ) : autocompleteMode === "inline" || autocompleteMode === "both" ? (
        <div className="flex flex-col gap-1">
          <span className="windows95-text text-muted text-xs">
            {t("settings.search.preview")}
          </span>
          <div className="windows95-border windows95-text flex min-h-7 items-center overflow-hidden bg-white px-1.5 whitespace-pre">
            <span className="relative z-10">fri</span>
            <span
              className="ml-0.5"
              style={{
                color: "var(--color-autocomplete, var(--color-muted))",
                opacity: "var(--autocomplete-opacity, 0.6)",
              }}
            >
              eren: Beyond Journey&apos;s End
            </span>
          </div>
        </div>
      ) : null}

      <hr className="border-muted my-1 w-full border-t" />

      <p className="windows95-text text-muted w-full font-bold">
        {t("settings.search.learning")}
      </p>
      <div className="windows95-text text-text grid grid-cols-2 gap-1 text-xs">
        <span>{t("settings.search.learningHistory")}</span>
        <span className="text-right tabular-nums">
          {learningHistory.length}
        </span>
        <span>{t("settings.search.learningQueries")}</span>
        <span className="text-right tabular-nums">{learnedQueries}</span>
        <span>{t("settings.search.learningSelected")}</span>
        <span className="text-right tabular-nums">{selectedSuggestions}</span>
        <span>{t("settings.search.learningAnime")}</span>
        <span className="text-right tabular-nums">{learningAnimeCount}</span>
      </div>

      <p className="windows95-text text-muted w-full font-bold">
        {t("settings.search.anilist")}
      </p>

      <label className="windows95-text text-text flex items-center gap-2">
        <span className="w-48">{t("settings.search.anilistBoost")}</span>
        <Select
          value={anilistSuggestionBoost}
          onChange={(value) =>
            patch({
              anilistSuggestionBoost: value as typeof anilistSuggestionBoost,
            })
          }
          options={[
            { value: "off", label: t("settings.search.anilistBoostOff") },
            {
              value: "subtle",
              label: t("settings.search.anilistBoostSubtle"),
            },
            {
              value: "strong",
              label: t("settings.search.anilistBoostStrong"),
            },
          ]}
          className="w-40"
        />
      </label>

      <div className="flex items-center gap-2">
        <Button
          onClick={() => {
            useSearchStore.getState().resetAnimeSuggestions();
            deleteAppCache("search", "learning");
          }}
        >
          {t("settings.search.resetAnimeSuggestions")}
        </Button>
        <span className="windows95-text text-muted text-xs">
          {t("settings.search.resetAnimeSuggestionsHint")}
        </span>
      </div>

      <hr className="border-muted my-1 w-full border-t" />

      <label className="windows95-text text-text flex items-center gap-2">
        <span className="w-48">{t("settings.search.pageSize")}</span>
        <Input
          type="number"
          min={10}
          max={100}
          value={anilistPageSize}
          onChange={(e) => patch({ anilistPageSize: Number(e.target.value) })}
          className="w-16"
        />
      </label>

      <label className="windows95-text text-text flex items-center gap-2">
        <span className="w-48">{t("settings.search.maxPages")}</span>
        <Input
          type="number"
          min={1}
          max={20}
          value={anilistMaxPages}
          onChange={(e) => patch({ anilistMaxPages: Number(e.target.value) })}
          className="w-16"
        />
      </label>
    </div>
  );
}
