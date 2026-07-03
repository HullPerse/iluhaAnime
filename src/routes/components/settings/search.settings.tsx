import { useSettingsStore } from "@/store/settings.store";
import { Input } from "@/components/ui/input.component";
import Select from "@/components/ui/select.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { SOURCE_INFOS } from "@/config/search.config";

export default function SettingsSearch() {
  const {
    defaultSearchSource,
    visibleSources,
    resultsPerPage,
    anilistPageSize,
    anilistMaxPages,
    searchHistoryMaxItems,
    patch,
  } = useSettingsStore();

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
    visibleSources.includes(s.value),
  ).map((s) => ({
    value: s.value,
    label: s.nsfw ? `${s.label} (NSFW)` : s.label,
  }));

  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="windows95-text text-muted font-bold w-full">Поиск</p>

      <label className="flex items-center gap-2 windows95-text text-text">
        <span className="w-48">Источник по умолчанию</span>
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

      <hr className="windows95-header w-full" />

      <p className="windows95-text text-muted font-bold w-full">
        Видимые источники
      </p>
      <div className="flex flex-col gap-1">
        {SOURCE_INFOS.map((info) => (
          <label
            key={info.value}
            className="flex items-center gap-2 windows95-text text-text cursor-pointer select-none"
          >
            <Checkbox
              checked={visibleSources.includes(info.value)}
              onChange={() => toggleSource(info.value)}
            />
            {info.nsfw && (
              <span className="text-destructive text-[10px] font-bold">
                [NSFW]
              </span>
            )}
            <span>{info.label}</span>
          </label>
        ))}
      </div>

      <hr className="windows95-header w-full" />

      <label className="flex items-center gap-2 windows95-text text-text">
        <span className="w-48">Результатов на странице</span>
        <Input
          type="number"
          min={5}
          max={100}
          value={resultsPerPage}
          onChange={(e) => patch({ resultsPerPage: Number(e.target.value) })}
          className="w-16"
        />
      </label>

      <label className="flex items-center gap-2 windows95-text text-text">
        <span className="w-48">Макс. записей истории поиска</span>
        <Input
          type="number"
          min={0}
          max={50}
          value={searchHistoryMaxItems}
          onChange={(e) =>
            patch({ searchHistoryMaxItems: Number(e.target.value) })
          }
          className="w-16"
        />
      </label>

      <hr className="windows95-header w-full" />

      <p className="windows95-text text-muted font-bold w-full">AniList</p>

      <label className="flex items-center gap-2 windows95-text text-text">
        <span className="w-48">Размер страницы</span>
        <Input
          type="number"
          min={10}
          max={100}
          value={anilistPageSize}
          onChange={(e) => patch({ anilistPageSize: Number(e.target.value) })}
          className="w-16"
        />
      </label>

      <label className="flex items-center gap-2 windows95-text text-text">
        <span className="w-48">Макс. страниц</span>
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
