import ChipsRow from "@/components/shared/chips.component";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { DualSlider } from "@/components/ui/range.component";
import Select from "@/components/ui/select.component";
import { Radio } from "@/components/ui/radio.component";
import { statusLabels, seasonLabels, formatLabels } from "@/lib/anilist.utils";
import { useState } from "react";
import {
  ANILIST_GENRES,
  ANILIST_NSFW_TAGS,
  ANILIST_TAGS,
  defaultFilters,
  FORMATS,
  SEASONS,
  STATUSES,
} from "@/config/filters.config";
import { Props, SearchFilters } from "@/types/anilist";

const NSFW_TAG_SET = new Set(ANILIST_NSFW_TAGS);

function FiltersModal({ open, filters, onApply, onReset, onClose }: Props) {
  const [local, setLocal] = useState<SearchFilters>(filters);
  const [genreSelect, setGenreSelect] = useState("");
  const [tagSelect, setTagSelect] = useState("");
  const [nsfwTagSelect, setNsfwTagSelect] = useState("");

  if (!open) return null;

  const addGenre = (v: string) => {
    if (!v || local.genres.includes(v)) return;
    setLocal((p) => ({ ...p, genres: [...p.genres, v] }));
    setGenreSelect("");
  };

  const addTag = (v: string) => {
    if (!v || local.tags.includes(v)) return;
    setLocal((p) => ({ ...p, tags: [...p.tags, v] }));
    setTagSelect("");
  };

  const addNsfwTag = (v: string) => {
    if (!v || local.tags.includes(v)) return;
    setLocal((p) => ({ ...p, tags: [...p.tags, v] }));
    setNsfwTagSelect("");
  };

  const toggleAdult = () => {
    setLocal((p) => ({
      ...p,
      adult: !p.adult,
      tags: p.adult ? p.tags.filter((t) => !NSFW_TAG_SET.has(t)) : p.tags,
    }));
  };

  const handleReset = () => {
    setLocal(defaultFilters);
    onReset();
    onClose();
  };

  const genreOpts = ANILIST_GENRES.filter((g) => !local.genres.includes(g)).map(
    (g) => ({ value: g, label: g }),
  );

  const tagOpts = ANILIST_TAGS.filter((t) => !local.tags.includes(t)).map(
    (t) => ({ value: t, label: t }),
  );

  const nsfwTagOpts = ANILIST_NSFW_TAGS.filter(
    (t) => !local.tags.includes(t),
  ).map((t) => ({ value: t, label: t }));

  return (
    <Modal header="Фильтры поиска" onClose={onClose} className="w-xl">
      <div className="flex flex-col gap-3 p-2 overflow-y-auto">
        <p className="windows95-text text-text font-bold">Жанры</p>
        <Select
          className="w-full"
          value={genreSelect}
          onChange={addGenre}
          placeholder="Выберите жанр..."
          options={genreOpts}
          indexed
        />
        <ChipsRow
          items={local.genres}
          onRemove={(v) =>
            setLocal((p) => ({
              ...p,
              genres: p.genres.filter((x) => x !== v),
            }))
          }
        />

        <p className="windows95-text text-text font-bold mt-1">Тэги</p>
        <Select
          className="w-full"
          value={tagSelect}
          onChange={addTag}
          placeholder="Выберите тэг..."
          options={tagOpts}
          indexed
        />
        <ChipsRow
          items={local.tags.filter((t) => !NSFW_TAG_SET.has(t))}
          onRemove={(v) =>
            setLocal((p) => ({
              ...p,
              tags: p.tags.filter((x) => x !== v),
            }))
          }
        />

        {local.adult && (
          <>
            <p className="windows95-text font-bold mt-1 text-destructive">
              NSFW тэги
            </p>
            <Select
              className="w-full"
              value={nsfwTagSelect}
              onChange={addNsfwTag}
              placeholder="Выберите NSFW тэг..."
              options={nsfwTagOpts}
            />
            <ChipsRow
              items={local.tags.filter((t) => NSFW_TAG_SET.has(t))}
              onRemove={(v) =>
                setLocal((p) => ({
                  ...p,
                  tags: p.tags.filter((x) => x !== v),
                }))
              }
            />
          </>
        )}

        <hr className="windows95-header w-full" />

        <p className="windows95-text text-text font-bold mt-1">Формат</p>
        <div className="flex flex-wrap gap-1">
          {FORMATS.map((f) => (
            <label
              key={f}
              className="flex items-center gap-1 cursor-pointer select-none windows95-text"
            >
              <Radio
                checked={local.format === f}
                onChange={() => setLocal((p) => ({ ...p, format: f }))}
              />
              {formatLabels[f]}
            </label>
          ))}
          <label className="flex items-center gap-1 cursor-pointer select-none windows95-text">
            <Radio
              checked={local.format === ""}
              onChange={() => setLocal((p) => ({ ...p, format: "" }))}
            />
            Любой
          </label>
        </div>

        <p className="windows95-text text-text font-bold mt-1">Статус</p>
        <div className="flex flex-wrap gap-1">
          {STATUSES.map((s) => (
            <label
              key={s}
              className="flex items-center gap-1 cursor-pointer select-none windows95-text"
            >
              <Radio
                checked={local.status === s}
                onChange={() => setLocal((p) => ({ ...p, status: s }))}
              />
              {statusLabels[s]}
            </label>
          ))}
          <label className="flex items-center gap-1 cursor-pointer select-none windows95-text">
            <Radio
              checked={local.status === ""}
              onChange={() => setLocal((p) => ({ ...p, status: "" }))}
            />
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
              ...SEASONS.map((s) => ({ value: s, label: seasonLabels[s] })),
            ]}
          />
          <Input
            type="number"
            placeholder="Год"
            className="w-20"
            value={local.seasonYear ?? ""}
            onChange={(e) =>
              setLocal((p) => ({
                ...p,
                seasonYear: e.target.value ? Number(e.target.value) : null,
              }))
            }
          />
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
          {[
            ["", "Любая"],
            ["JP", "Япония"],
            ["CN", "Китай"],
            ["KR", "Корея"],
          ].map(([v, l]) => (
            <label
              key={v}
              className="flex items-center gap-1 cursor-pointer select-none windows95-text"
            >
              <Radio
                checked={local.country === v}
                onChange={() => setLocal((p) => ({ ...p, country: v }))}
              />
              {l}
            </label>
          ))}
        </div>

        <p className="windows95-text text-text font-bold mt-1">Год выпуска</p>
        <DualSlider
          min={1960}
          max={2026}
          step={1}
          value={
            local.year[0] === 0 && local.year[1] === 0
              ? [1960, 2026]
              : local.year
          }
          onChange={(v) => setLocal((p) => ({ ...p, year: v }))}
        />

        <p className="windows95-text text-text font-bold mt-1">
          Количество эпизодов
        </p>
        <DualSlider
          min={0}
          max={2000}
          step={1}
          value={
            local.episodes[0] === 0 && local.episodes[1] === 0
              ? [0, 2000]
              : local.episodes
          }
          onChange={(v) => setLocal((p) => ({ ...p, episodes: v }))}
        />

        <p className="windows95-text text-text font-bold mt-1">Оценка</p>
        <DualSlider
          min={0}
          max={100}
          step={1}
          suffix="★"
          value={
            local.score[0] === 0 && local.score[1] === 0
              ? [0, 100]
              : local.score
          }
          onChange={(v) => setLocal((p) => ({ ...p, score: v }))}
        />

        <label className="flex items-center gap-2 mt-1 cursor-pointer select-none windows95-text">
          <Checkbox checked={local.adult} onChange={toggleAdult} />
          Включить взрослый контент (18+)
        </label>

        <div className="flex justify-end gap-1 mt-3">
          <Button variant="outline" onClick={handleReset}>
            Сбросить
          </Button>
          <Button
            onClick={() => {
              onApply(local);
              onClose();
            }}
          >
            Применить
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default FiltersModal;
export { defaultFilters };
