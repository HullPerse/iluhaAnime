import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { Input } from "@/components/ui/input.component";
import Select from "@/components/ui/select.component";
import { SOURCE_INFOS } from "@/config/search/searchSources.config";
import { useI18n } from "@/hooks/i18n.hook";
import { useCell } from "@/lib/core/signal.hook";
import { reportBackgroundError } from "@/lib/core/attempt.utils";
import {
  clearAllSearchLearning,
  clearSearchScope,
  purgeSearchStats,
  resetAnimeSuggestions,
  searchAtoms,
} from "@/store/search.store";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

import { SectionResetButton } from "@/routes/components/settings/reset.settings";

export default function SettingsSearch() {
  const defaultSearchSource = useCell(settingsAtoms.defaultSearchSource);
  const visibleSources = useCell(settingsAtoms.visibleSources);
  const anilistPageSize = useCell(settingsAtoms.anilistPageSize);
  const anilistMaxPages = useCell(settingsAtoms.anilistMaxPages);
  const searchHistoryMaxItems = useCell(settingsAtoms.searchHistoryMaxItems);
  const autocompleteMode = useCell(settingsAtoms.autocompleteMode);
  const anilistSuggestionBoost = useCell(settingsAtoms.anilistSuggestionBoost);
  const searchSymSpellEnabled = useCell(settingsAtoms.searchSymSpellEnabled);
  const searchIntentEnabled = useCell(settingsAtoms.searchIntentEnabled);
  const eraiBatchGrouping = useCell(settingsAtoms.eraiBatchGrouping);
  const { t } = useI18n();
  const learningHistory = useCell(searchAtoms.history);
  const learningAnimeCount = useCell(searchAtoms.animeIndex).length;
  const learningQueryStats = useCell(searchAtoms.queryStats);
  const learningSuggestionStats = useCell(searchAtoms.suggestionStats);
  const learnedQueries = Object.values(learningQueryStats).reduce(
    (total, stat) => total + stat.count,
    0
  );
  const selectedSuggestions = Object.values(learningSuggestionStats).reduce(
    (total, stat) => total + stat.selectedCount,
    0
  );

  const toggleSource = (value: string) => {
    const order: string[] = SOURCE_INFOS.map((info) => info.value);
    const rank = new Map(order.map((item, index): [string, number] => [item, index]));
    const next = visibleSources.includes(value)
      ? visibleSources.filter((v) => v !== value)
      : [...visibleSources, value];
    next.sort((a, b) => (rank.get(a) ?? rank.size) - (rank.get(b) ?? rank.size));
    patchSettings({ visibleSources: next });
    if (!next.includes(defaultSearchSource) && next.length > 0) {
      patchSettings({ defaultSearchSource: next[0] });
    }
  };

  const defaultOpts = SOURCE_INFOS.filter((s) => visibleSources.includes(s.value)).map((s) => ({
    value: s.value,
    label: s.nsfw ? `${s.label} [NSFW]` : s.label,
  }));

  return (
    <div className="flex flex-col gap-3">
      <section className="ui-panel" data-find-section="search.sources">
        <div className="ui-titlebar group flex items-center justify-between gap-1">
          <span className="text-title-text font-bold">{t("settings.search.sources")}</span>
          <SectionResetButton sectionId="search.sources" />
        </div>
        <div className="flex flex-col gap-1 p-2">
          <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 min-[560px]:grid-cols-[140px_1fr]">
            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.search.default.source")}
            </span>
            <div className="group flex min-w-0 items-center gap-1">
              <Select
                value={
                  visibleSources.includes(defaultSearchSource)
                    ? defaultSearchSource
                    : (defaultOpts[0]?.value ?? "")
                }
                onChange={(v) => patchSettings({ defaultSearchSource: v })}
                options={defaultOpts}
                disabled={defaultOpts.length === 0}
                className="w-28"
              />
            </div>
          </div>{" "}
          <div className="group flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <span className="windows95-text text-text text-xs font-bold">
                {t("settings.search.visible.sources")}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-x-3 gap-y-1 min-[560px]:grid-cols-[140px_1fr]">
              <span />
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
                      <span className="text-destructive text-xs font-bold">[NSFW]</span>
                    )}
                    <span>{info.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <hr className="border-muted my-1 w-full border-t" />

      <section className="ui-panel" data-find-section="search.results">
        <div className="ui-titlebar group flex items-center justify-between gap-1">
          <span className="text-title-text font-bold">{t("settings.search.results")}</span>
          <SectionResetButton sectionId="search.results" />
        </div>
        <div className="flex flex-col gap-1 p-2">
          <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 min-[560px]:grid-cols-[140px_1fr]">
            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.search.history.max")}
            </span>
            <div className="group flex min-w-0 items-center gap-1">
              <Input
                type="number"
                min={0}
                max={500}
                value={searchHistoryMaxItems}
                onChange={(e) => patchSettings({ searchHistoryMaxItems: Number(e.target.value) })}
                className="w-16"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 min-[560px]:grid-cols-[140px_1fr]">
            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.search.autocomplete.mode")}
            </span>
            <div className="group flex min-w-0 flex-col gap-0.5">
              <Select
                value={autocompleteMode}
                onChange={(value) => patchSettings({ autocompleteMode: value })}
                options={[
                  {
                    value: "inline",
                    label: t("settings.search.autocomplete.mode.inline"),
                  },
                  {
                    value: "dropdown",
                    label: t("settings.search.autocomplete.mode.dropdown"),
                  },
                  {
                    value: "both",
                    label: t("settings.search.autocomplete.mode.both"),
                  },
                  {
                    value: "off",
                    label: t("settings.search.autocomplete.mode.off"),
                  },
                ]}
                className="w-40"
              />
              {autocompleteMode === "off" ? (
                <span className="text-destructive text-[12px]">
                  {t("settings.search.autocomplete.mode.off.hint")}
                </span>
              ) : (
                (autocompleteMode === "inline" || autocompleteMode === "both") && (
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-hint text-[12px]">{t("settings.search.preview")}</span>
                    <div className="windows95-border windows95-text bg-field flex min-h-7 items-center overflow-hidden px-1.5 whitespace-pre">
                      <span className="relative z-10">{t("settings.search.preview.typed")}</span>
                      <span
                        className="ml-0.5"
                        style={{
                          color: "var(--color-autocomplete, var(--color-muted))",
                          opacity: "var(--autocomplete-opacity, 0.6)",
                        }}
                      >
                        {t("settings.search.preview.ghost")}
                      </span>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 min-[560px]:grid-cols-[140px_1fr]">
            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.search.page.size")}
            </span>
            <div className="group flex min-w-0 items-center gap-1">
              <Input
                type="number"
                min={10}
                max={100}
                value={anilistPageSize}
                onChange={(e) => patchSettings({ anilistPageSize: Number(e.target.value) })}
                className="w-16"
              />
            </div>

            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.search.max.pages")}
            </span>
            <div className="group flex min-w-0 items-center gap-1">
              <Input
                type="number"
                min={1}
                max={20}
                value={anilistMaxPages}
                onChange={(e) => patchSettings({ anilistMaxPages: Number(e.target.value) })}
                className="w-16"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.search.learning")}
            </span>
            <div className="windows95-text text-text grid grid-cols-1 gap-x-3 gap-y-0.5 text-xs min-[560px]:grid-cols-[140px_1fr]">
              <span>{t("settings.search.learning.history")}</span>
              <span className="text-right tabular-nums">{learningHistory.length}</span>
              <span>{t("settings.search.learning.queries")}</span>
              <span className="text-right tabular-nums">{learnedQueries}</span>
              <span>{t("settings.search.learning.selected")}</span>
              <span className="text-right tabular-nums">{selectedSuggestions}</span>
              <span>{t("settings.search.learning.anime")}</span>
              <span className="text-right tabular-nums">{learningAnimeCount}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.search.toggles")}
            </span>
            <div className="grid grid-cols-1 gap-x-3 gap-y-1 min-[560px]:grid-cols-[140px_1fr]">
              <span />
              <div className="flex flex-col gap-1">
                <label
                  className="group windows95-text text-text flex cursor-pointer items-center gap-2 select-none"
                  title={t("settings.search.toggle.sym.spell.hint")}
                >
                  <Checkbox
                    checked={searchSymSpellEnabled}
                    onChange={() =>
                      patchSettings({ searchSymSpellEnabled: !searchSymSpellEnabled })
                    }
                  />
                  <span>{t("settings.search.toggle.sym.spell")}</span>
                </label>
                <label
                  className="group windows95-text text-text flex cursor-pointer items-center gap-2 select-none"
                  title={t("settings.search.toggle.intent.hint")}
                >
                  <Checkbox
                    checked={searchIntentEnabled}
                    onChange={() => patchSettings({ searchIntentEnabled: !searchIntentEnabled })}
                  />
                  <span>{t("settings.search.toggle.intent")}</span>
                </label>
                <label
                  className="group windows95-text text-text flex cursor-pointer items-center gap-2 select-none"
                  title={t("settings.search.toggle.erai.batch.hint")}
                >
                  <Checkbox
                    checked={eraiBatchGrouping}
                    onChange={() => patchSettings({ eraiBatchGrouping: !eraiBatchGrouping })}
                  />
                  <span>{t("settings.search.toggle.erai.batch")}</span>
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 min-[560px]:grid-cols-[140px_1fr]">
            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.search.anilist.boost")}
            </span>
            <div className="group flex min-w-0 flex-col gap-0.5">
              <Select
                value={anilistSuggestionBoost}
                onChange={(value) =>
                  patchSettings({
                    anilistSuggestionBoost: value,
                  })
                }
                options={[
                  { value: "off", label: t("settings.search.anilist.boost.off") },
                  {
                    value: "subtle",
                    label: t("settings.search.anilist.boost.subtle"),
                  },
                  {
                    value: "strong",
                    label: t("settings.search.anilist.boost.strong"),
                  },
                ]}
                className="w-40"
              />
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              purgeSearchStats();
            }}
          >
            {t("settings.search.purge.expired")}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button onClick={() => clearSearchScope("torrent")}>
            {t("settings.search.clear.torrent")}
          </Button>
          <Button onClick={() => clearSearchScope("anilist")}>
            {t("settings.search.clear.anilist")}
          </Button>
          <Button onClick={() => clearSearchScope("player")}>
            {t("settings.search.clear.player")}
          </Button>
          <Button onClick={() => clearSearchScope("filter")}>
            {t("settings.search.clear.filter")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              clearAllSearchLearning().catch((error) =>
                reportBackgroundError("learning.clear", error)
              );
            }}
          >
            {t("settings.search.clear.all.learning")}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          onClick={() => {
            resetAnimeSuggestions();
          }}
        >
          {t("settings.search.reset.anime.suggestions")}
        </Button>
      </div>
    </div>
  );
}
