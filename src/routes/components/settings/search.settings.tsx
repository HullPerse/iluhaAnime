import { useSettingsStore } from "@/store/settings.store";
import { Input } from "@/components/ui/input.component";

export default function SettingsSearch() {
  const {
    defaultSearchSource,
    resultsPerPage,
    anilistPageSize,
    anilistMaxPages,
    searchHistoryMaxItems,
    patch,
  } = useSettingsStore();

  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="windows95-text text-muted font-bold w-full">Поиск</p>

      <label className="flex items-center gap-2 windows95-text text-text">
        <span className="w-48">Источник по умолчанию</span>
        <select
          value={defaultSearchSource}
          onChange={(e) => patch({ defaultSearchSource: e.target.value })}
          className="h-6 windows95-border px-1 text-text windows95-text windows95-select bg-white"
        >
          <option value="erai-raws">Erai-Raws</option>
          <option value="rutracker">Rutracker</option>
          <option value="nyaa">Nyaa.si</option>
          <option value="sukebei">Sukebei (NSFW)</option>
          <option value="nekobt">nekoBT</option>
        </select>
      </label>

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
