import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { DualSlider } from "@/components/ui/range.component";
import Select from "@/components/ui/select.component";
import { useState } from "react";

const ANILIST_TAGS = [
  "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror", "Mystery",
  "Romance", "Sci-Fi", "Slice of Life", "Thriller", "Ecchi", "Hentai",
  "Mecha", "Music", "Psychological", "Supernatural", "Sports", "Historical",
  "Military", "Parody", "School", "Seinen", "Shounen", "Shoujo", "Josei",
  "Kids", "Demons", "Game", "Space", "Super Power", "Vampire", "Harem",
  "Magical Girls", "Martial Arts", "Samurai", "Isekai", "Cars", "Police",
  "Dementia", "Post-Apocalyptic", "Cyborg", "Pirate", "Ninja", "Zombie",
];

const FORMATS = ["TV", "Movie", "OVA", "ONA", "Special", "Music"];
const STATUSES = ["FINISHED", "RELEASING", "NOT_YET_RELEASED", "CANCELLED", "HIATUS"];
const SEASONS = ["WINTER", "SPRING", "SUMMER", "FALL"];

export interface SearchFilters {
  tags: string[];
  genres: string[];
  format: string;
  status: string;
  season: string;
  seasonYear: number | null;
  adult: boolean;
  sort: string;
  source: string;
  country: string;
  year: [number, number];
  episodes: [number, number];
  score: [number, number];
}

interface Props {
  open: boolean;
  filters: SearchFilters;
  onApply: (filters: SearchFilters) => void;
  onReset: () => void;
  onClose: () => void;
}

const defaultFilters: SearchFilters = {
  tags: [], genres: [], format: "", status: "", season: "", seasonYear: null,
  adult: false, sort: "", source: "", country: "",
  year: [0, 0], episodes: [0, 0], score: [0, 0],
};

function FiltersModal({ open, filters, onApply, onReset, onClose }: Props) {
  const [local, setLocal] = useState<SearchFilters>(filters);

  if (!open) return null;

  const toggleTag = (tag: string) => {
    setLocal((p) => ({
      ...p,
      tags: p.tags.includes(tag) ? p.tags.filter((t) => t !== tag) : [...p.tags, tag],
    }));
  };

  const handleReset = () => {
    setLocal(defaultFilters);
    onReset();
    onClose();
  };

  return (
    <Modal header="Фильтры поиска" onClose={onClose}>
      <div className="flex flex-col gap-3 p-2 min-w-[400px] max-h-[70vh] overflow-y-auto">
        <p className="windows95-text text-text font-bold">Тэги</p>
        <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
          {ANILIST_TAGS.map((tag) => (
            <label key={tag} className="flex items-center gap-1 cursor-pointer windows95-text">
              <Checkbox checked={local.tags.includes(tag)} onChange={() => toggleTag(tag)} />
              {tag}
            </label>
          ))}
        </div>

        <p className="windows95-text text-text font-bold mt-1">Формат</p>
        <div className="flex flex-wrap gap-1">
          {FORMATS.map((f) => (
            <label key={f} className="flex items-center gap-1 cursor-pointer windows95-text">
              <input type="radio" name="format" checked={local.format === f} onChange={() => setLocal((p) => ({ ...p, format: f }))} />
              {f}
            </label>
          ))}
          <label className="flex items-center gap-1 cursor-pointer windows95-text">
            <input type="radio" name="format" checked={local.format === ""} onChange={() => setLocal((p) => ({ ...p, format: "" }))} />
            Любой
          </label>
        </div>

        <p className="windows95-text text-text font-bold mt-1">Статус</p>
        <div className="flex flex-wrap gap-1">
          {STATUSES.map((s) => (
            <label key={s} className="flex items-center gap-1 cursor-pointer windows95-text">
              <input type="radio" name="status" checked={local.status === s} onChange={() => setLocal((p) => ({ ...p, status: s }))} />
              {s}
            </label>
          ))}
          <label className="flex items-center gap-1 cursor-pointer windows95-text">
            <input type="radio" name="status" checked={local.status === ""} onChange={() => setLocal((p) => ({ ...p, status: "" }))} />
            Любой
          </label>
        </div>

        <p className="windows95-text text-text font-bold mt-1">Сезон и год</p>
        <div className="flex items-center gap-2">
          <Select
            className="w-24"
            value={local.season}
            onChange={(v) => setLocal((p) => ({ ...p, season: v }))}
            options={[
              { value: "", label: "Любой" },
              ...SEASONS.map((s) => ({ value: s, label: s })),
            ]}
          />
          <Input type="number" placeholder="Год" className="w-20" value={local.seasonYear ?? ""} onChange={(e) => setLocal((p) => ({ ...p, seasonYear: e.target.value ? Number(e.target.value) : null }))} />
        </div>

        <p className="windows95-text text-text font-bold mt-1">Сортировка</p>
        <Select
          className="w-full"
          value={local.sort}
          onChange={(v) => setLocal((p) => ({ ...p, sort: v }))}
          options={[
            { value: "", label: "По релевантности" },
            { value: "SCORE_DESC", label: "По рейтингу ↓" },
            { value: "SCORE_ASC", label: "По рейтингу ↑" },
            { value: "POPULARITY_DESC", label: "По популярности ↓" },
            { value: "TRENDING_DESC", label: "По трендам ↓" },
            { value: "START_DATE_DESC", label: "По дате выхода ↓" },
          ]}
        />

        <p className="windows95-text text-text font-bold mt-1">Источник</p>
        <Select
          className="w-full"
          value={local.source}
          onChange={(v) => setLocal((p) => ({ ...p, source: v }))}
          options={[
            { value: "", label: "Любой" },
            { value: "ORIGINAL", label: "Оригинал" },
            { value: "MANGA", label: "Манга" },
            { value: "LIGHT_NOVEL", label: "Ранобэ" },
            { value: "VISUAL_NOVEL", label: "Визуальная новелла" },
            { value: "VIDEO_GAME", label: "Игра" },
            { value: "NOVEL", label: "Новелла" },
            { value: "WEB_MANGA", label: "Веб-манга" },
            { value: "OTHER", label: "Другое" },
          ]}
        />

        <p className="windows95-text text-text font-bold mt-1">Страна</p>
        <div className="flex flex-wrap gap-1">
          {[["", "Любая"], ["JP", "Япония"], ["CN", "Китай"], ["KR", "Корея"]].map(([v, l]) => (
            <label key={v} className="flex items-center gap-1 cursor-pointer windows95-text">
              <input type="radio" name="country" checked={local.country === v} onChange={() => setLocal((p) => ({ ...p, country: v }))} />
              {l}
            </label>
          ))}
        </div>

        <p className="windows95-text text-text font-bold mt-1">Год выпуска</p>
        <DualSlider
          min={1960}
          max={2026}
          step={1}
          value={local.year[0] === 0 && local.year[1] === 0 ? [1960, 2026] : local.year}
          onChange={(v) => setLocal((p) => ({ ...p, year: v }))}
        />

        <p className="windows95-text text-text font-bold mt-1">Количество эпизодов</p>
        <DualSlider
          min={0}
          max={2000}
          step={1}
          value={local.episodes[0] === 0 && local.episodes[1] === 0 ? [0, 2000] : local.episodes}
          onChange={(v) => setLocal((p) => ({ ...p, episodes: v }))}
        />

        <p className="windows95-text text-text font-bold mt-1">Оценка</p>
        <DualSlider
          min={0}
          max={100}
          step={1}
          suffix="★"
          value={local.score[0] === 0 && local.score[1] === 0 ? [0, 100] : local.score}
          onChange={(v) => setLocal((p) => ({ ...p, score: v }))}
        />

        <label className="flex items-center gap-2 mt-1 cursor-pointer windows95-text">
          <Checkbox checked={local.adult} onChange={() => setLocal((p) => ({ ...p, adult: !p.adult }))} />
          Включить взрослый контент (18+)
        </label>

        <div className="flex justify-end gap-1 mt-3">
          <Button variant="outline" onClick={handleReset}>Сбросить</Button>
          <Button onClick={() => { onApply(local); onClose(); }}>Применить</Button>
        </div>
      </div>
    </Modal>
  );
}

export default FiltersModal;
export { defaultFilters };
