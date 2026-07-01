import { useSettingsStore } from "@/store/settings.store";
import { Input } from "@/components/ui/input.component";
import Select from "@/components/ui/select.component";

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
        <Select
          value={defaultSearchSource}
          onChange={(v) => patch({ defaultSearchSource: v })}
          options={[
            { value: "erai-raws", label: "Erai-Raws" },
            { value: "rutracker", label: "Rutracker" },
            { value: "nyaa", label: "Nyaa.si" },
            { value: "sukebei", label: "Sukebei (NSFW)" },
            { value: "nekobt", label: "nekoBT" },
          ]}
        />
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
