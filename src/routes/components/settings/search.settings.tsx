import { cn } from "cn";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { Input } from "@/components/ui/input.component";
import Select from "@/components/ui/select.component";
import { SOURCE_INFOS } from "@/config/search/sources.config";
import { useI18n } from "@/lib/locale/i18n.utils";
import { deleteAppCache } from "@/lib/store/cache.utils";
import { reportBackgroundError } from "@/lib/utils/attempt.utils";
import { invokeTyped } from "@/lib/utils/invoke.utils";
import { useSearchStore } from "@/store/search.store";
import { useSettingsStore } from "@/store/settings.store";

export default function SettingsSearch() {
  const {
    defaultSearchSource,
    visibleSources,
    searchProxyUrls,
    pageSize,
    anilistMaxPages,
    searchHistoryMaxItems,
    autocompleteMode,
    anilistSuggestionBoost,
    searchSymSpellEnabled,
    searchIntentEnabled,
    patch,
  } = useSettingsStore();
  const { t } = useI18n();
  const [proxyTests, setProxyTests] = useState<
    Record<string, { loading: boolean; ok?: boolean; msg?: string }>
  >({});
  const [proxyTestingAll, setProxyTestingAll] = useState(false);
  const proxyInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleTestAllProxies = async () => {
    const sources = SOURCE_INFOS.filter((s) => visibleSources.includes(s.value));
    if (sources.length === 0) return;
    setProxyTestingAll(true);
    const initial: Record<string, { loading: boolean }> = {};
    for (const s of sources) initial[s.value] = { loading: true };
    setProxyTests(initial);
    await Promise.all(
      sources.map(async (info) => {
        const proxy = searchProxyUrls[info.value] ?? "";
        try {
          const res = await invokeTyped<string>("test_source_connection", {
            source: info.value,
            proxyUrl: proxy || null,
            proxy_url: proxy || null,
          });
          setProxyTests((prev) => ({
            ...prev,
            [info.value]: { loading: false, ok: true, msg: res },
          }));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setProxyTests((prev) => ({ ...prev, [info.value]: { loading: false, ok: false, msg } }));
        }
      })
    );
    setProxyTestingAll(false);
  };
  const learningHistory = useSearchStore((state) => state.history);
  const learningAnimeCount = useSearchStore((state) => state.animeIndex.length);
  const learningQueryStats = useSearchStore((state) => state.queryStats);
  const learningSuggestionStats = useSearchStore((state) => state.suggestionStats);
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

  const defaultOpts = SOURCE_INFOS.filter((s) => visibleSources.includes(s.value)).map((s) => ({
    value: s.value,
    label: s.nsfw ? `${s.label} [NSFW]` : s.label,
  }));

  return (
    <div className="flex flex-col gap-3">
      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="font-bold text-white">{t("settings.search.sources")}</span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5">
            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.search.default.source")}
            </span>
            <div className="flex flex-col gap-0.5">
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
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.search.visible.sources")}
            </span>
            <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1">
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

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="windows95-text text-text text-xs font-bold">
                {t("settings.search.proxy.per.source")}
              </span>
              <Button
                className="h-6 px-2 text-xs"
                onClick={handleTestAllProxies}
                disabled={proxyTestingAll || visibleSources.length === 0}
              >
                {proxyTestingAll
                  ? t("settings.search.proxy.testing")
                  : t("settings.search.proxy.test.all")}
              </Button>
            </div>
            {SOURCE_INFOS.filter((s) => visibleSources.includes(s.value)).map((info) => {
              const current = searchProxyUrls[info.value] ?? "";
              const presets = [
                "socks5://127.0.0.1:10808",
                "socks5://127.0.0.1:1080",
                "socks5h://127.0.0.1:10808",
                "http://127.0.0.1:7890",
                "http://127.0.0.1:10809",
                "http://127.0.0.1:8080",
              ];
              const isPreset = presets.includes(current);
              const selectValue = current === "" ? "" : isPreset ? current : "custom";
              return (
                <div key={info.value} className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-0.5">
                  <span className="windows95-text text-text flex items-center text-xs font-bold">
                    {info.label}
                  </span>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center">
                    <Select
                      value={selectValue}
                      onChange={(v) => {
                        if (v === "custom") {
                          proxyInputRefs.current[info.value]?.focus();
                          return;
                        }
                        const next = { ...searchProxyUrls };
                        if (!v) delete next[info.value];
                        else next[info.value] = v;
                        patch({ searchProxyUrls: next });
                      }}
                      options={[
                        { value: "", label: t("settings.tmdb.proxy.no") },
                        ...presets.map((p) => ({ value: p, label: p })),
                        { value: "custom", label: t("settings.tmdb.proxy.custom") },
                      ]}
                      className="w-full max-w-60"
                    />
                    <Input
                      ref={(el) => {
                        proxyInputRefs.current[info.value] = el;
                      }}
                      value={current}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        const next = { ...searchProxyUrls };
                        if (!v) delete next[info.value];
                        else next[info.value] = v;
                        patch({ searchProxyUrls: next });
                      }}
                      placeholder="socks5://127.0.0.1:10808"
                      className="w-full max-w-70"
                      spellCheck={false}
                    />
                    {(() => {
                      const st = proxyTests[info.value];
                      if (!st) return null;
                      if (st.loading)
                        return (
                          <span className="windows95-text text-text/60 text-xs">
                            {t("settings.search.proxy.testing")}
                          </span>
                        );
                      return (
                        <span
                          className={cn(
                            "windows95-text text-xs",
                            st.ok ? "text-success" : "text-destructive"
                          )}
                        >
                          {st.ok
                            ? `${t("settings.search.proxy.test.ok")} - ${st.msg}`
                            : `${t("settings.search.proxy.test.fail")}: ${st.msg}`}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
            {visibleSources.length === 0 && (
              <span className="text-hint text-[12px]">
                {t("settings.search.no.visible.sources")}
              </span>
            )}
          </div>
        </div>
      </section>

      <hr className="border-muted my-1 w-full border-t" />

      <section className="ui-panel">
        <div className="ui-titlebar">
          <span className="font-bold text-white">{t("settings.search.results")}</span>
        </div>
        <div className="flex flex-col gap-1 p-2">
          <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5">
            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.search.history.max")}
            </span>
            <div className="flex flex-col gap-0.5">
              <Input
                type="number"
                min={0}
                max={500}
                value={searchHistoryMaxItems}
                onChange={(e) => patch({ searchHistoryMaxItems: Number(e.target.value) })}
                className="w-16"
              />
            </div>
          </div>

          <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5">
            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.search.autocomplete.mode")}
            </span>
            <div className="flex flex-col gap-0.5">
              <Select
                value={autocompleteMode}
                onChange={(value) => patch({ autocompleteMode: value as typeof autocompleteMode })}
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
              ) : autocompleteMode === "inline" || autocompleteMode === "both" ? (
                <div className="flex flex-col gap-0.5">
                  <span className="text-hint text-[12px]">{t("settings.search.preview")}</span>
                  <div className="windows95-border windows95-text flex min-h-7 items-center overflow-hidden bg-white px-1.5 whitespace-pre">
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
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5">
            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.search.page.size")}
            </span>
            <div className="flex flex-col gap-0.5">
              <Input
                type="number"
                min={10}
                max={100}
                value={pageSize}
                onChange={(e) => patch({ pageSize: Number(e.target.value) })}
                className="w-16"
              />
              <span className="text-hint text-[12px]">{t("settings.search.page.size.hint")}</span>
            </div>

            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.search.max.pages")}
            </span>
            <div className="flex flex-col gap-0.5">
              <Input
                type="number"
                min={1}
                max={20}
                value={anilistMaxPages}
                onChange={(e) => patch({ anilistMaxPages: Number(e.target.value) })}
                className="w-16"
              />
              <span className="text-hint text-[12px]">
                {t("settings.search.anilist.max.pages.hint")}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.search.learning")}
            </span>
            <div className="windows95-text text-text grid grid-cols-[140px_1fr] gap-x-3 gap-y-0.5 text-xs">
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
            <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1">
              <span />
              <div className="flex flex-col gap-1">
                <label
                  className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none"
                  title={t("settings.search.toggle.sym.spell.hint")}
                >
                  <Checkbox
                    checked={searchSymSpellEnabled}
                    onChange={() => patch({ searchSymSpellEnabled: !searchSymSpellEnabled })}
                  />
                  <span>{t("settings.search.toggle.sym.spell")}</span>
                </label>
                <label
                  className="windows95-text text-text flex cursor-pointer items-center gap-2 select-none"
                  title={t("settings.search.toggle.intent.hint")}
                >
                  <Checkbox
                    checked={searchIntentEnabled}
                    onChange={() => patch({ searchIntentEnabled: !searchIntentEnabled })}
                  />
                  <span>{t("settings.search.toggle.intent")}</span>
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5">
            <span className="windows95-text text-text text-xs font-bold">
              {t("settings.search.anilist.boost")}
            </span>
            <div className="flex flex-col gap-0.5">
              <Select
                value={anilistSuggestionBoost}
                onChange={(value) =>
                  patch({
                    anilistSuggestionBoost: value as typeof anilistSuggestionBoost,
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
              useSearchStore.getState().purgeExpired();
            }}
          >
            {t("settings.search.purge.expired")}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button onClick={() => useSearchStore.getState().clearScope("torrent")}>
            {t("settings.search.clear.torrent")}
          </Button>
          <Button onClick={() => useSearchStore.getState().clearScope("anilist")}>
            {t("settings.search.clear.anilist")}
          </Button>
          <Button onClick={() => useSearchStore.getState().clearScope("player")}>
            {t("settings.search.clear.player")}
          </Button>
          <Button onClick={() => useSearchStore.getState().clearScope("filter")}>
            {t("settings.search.clear.filter")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              useSearchStore
                .getState()
                .clearAllLearning()
                .catch((error) => reportBackgroundError("learning.clear", error));
              deleteAppCache("search", "learning");
            }}
          >
            {t("settings.search.clear.all.learning")}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          onClick={() => {
            useSearchStore.getState().resetAnimeSuggestions();
            deleteAppCache("search", "learning");
          }}
        >
          {t("settings.search.reset.anime.suggestions")}
        </Button>
      </div>
    </div>
  );
}

