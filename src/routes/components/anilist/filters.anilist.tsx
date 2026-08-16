import { useState } from "react";

import ChipsRow from "@/components/shared/chips.component";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import { Input } from "@/components/ui/input.component";
import { Radio } from "@/components/ui/radio.component";
import { DualSlider } from "@/components/ui/range.component";
import Select from "@/components/ui/select.component";
import {
  statusLabels,
  seasonLabels,
  formatLabels,
} from "@/config/anilist.config";
import {
  ANILIST_GENRES,
  ANILIST_NSFW_TAGS,
  ANILIST_TAGS,
  defaultFilters,
  FORMATS,
  SEASONS,
  STATUSES,
} from "@/config/filters.config";
import { useI18n } from "@/lib/i18n";
import type { Props, AniListFilters } from "@/types/anilist";

const NSFW_TAG_SET = new Set(ANILIST_NSFW_TAGS);

function FiltersModal({ open, filters, onApply, onReset, onClose }: Props) {
  const { t } = useI18n();
  const [local, setLocal] = useState<AniListFilters>(filters);
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
    (g) => ({ value: g, label: g })
  );

  const tagOpts = ANILIST_TAGS.filter((t) => !local.tags.includes(t)).map(
    (t) => ({ value: t, label: t })
  );

  const nsfwTagOpts = ANILIST_NSFW_TAGS.filter(
    (t) => !local.tags.includes(t)
  ).map((t) => ({ value: t, label: t }));

  return (
    <Modal
      header={t("anilist.filters.title")}
      onClose={onClose}
      className="w-xl"
    >
      <div className="flex flex-col gap-3 overflow-y-auto p-2">
        <p className="windows95-text text-text font-bold">
          {t("anilist.filters.genres")}
        </p>
        <Select
          className="w-full"
          value={genreSelect}
          onChange={addGenre}
          placeholder={t("anilist.filters.genrePlaceholder")}
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

        <p className="windows95-text text-text mt-1 font-bold">
          {t("anilist.filters.tags")}
        </p>
        <Select
          className="w-full"
          value={tagSelect}
          onChange={addTag}
          placeholder={t("anilist.filters.tagPlaceholder")}
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
            <p className="windows95-text text-destructive mt-1 font-bold">
              {t("anilist.filters.nsfwTags")}
            </p>
            <Select
              className="w-full"
              value={nsfwTagSelect}
              onChange={addNsfwTag}
              placeholder={t("anilist.filters.nsfwPlaceholder")}
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

        <p className="windows95-text text-text mt-1 font-bold">
          {t("anilist.filters.format")}
        </p>
        <div className="flex flex-wrap gap-1">
          {FORMATS.map((f) => (
            <label
              key={f}
              className="windows95-text flex cursor-pointer items-center gap-1 select-none"
            >
              <Radio
                checked={local.format === f}
                onChange={() => setLocal((p) => ({ ...p, format: f }))}
              />
              {t(formatLabels[f] as never)}
            </label>
          ))}
          <label className="windows95-text flex cursor-pointer items-center gap-1 select-none">
            <Radio
              checked={local.format === ""}
              onChange={() => setLocal((p) => ({ ...p, format: "" }))}
            />
            {t("anilist.filters.any")}
          </label>
        </div>

        <p className="windows95-text text-text mt-1 font-bold">
          {t("anilist.filters.status")}
        </p>
        <div className="flex flex-wrap gap-1">
          {STATUSES.map((s) => (
            <label
              key={s}
              className="windows95-text flex cursor-pointer items-center gap-1 select-none"
            >
              <Radio
                checked={local.status === s}
                onChange={() => setLocal((p) => ({ ...p, status: s }))}
              />
              {t(statusLabels[s] as never)}
            </label>
          ))}
          <label className="windows95-text flex cursor-pointer items-center gap-1 select-none">
            <Radio
              checked={local.status === ""}
              onChange={() => setLocal((p) => ({ ...p, status: "" }))}
            />
            {t("anilist.filters.any")}
          </label>
        </div>

        <p className="windows95-text text-text mt-1 font-bold">
          {t("anilist.filters.seasonAndYear")}
        </p>
        <div className="flex items-center gap-2">
          <Select
            className="w-24"
            value={local.season}
            onChange={(v) => setLocal((p) => ({ ...p, season: v }))}
            options={[
              { value: "", label: t("anilist.filters.any") },
              ...SEASONS.map((s) => ({
                value: s,
                label: t(seasonLabels[s] as never),
              })),
            ]}
          />
          <Input
            type="number"
            placeholder={t("anilist.filters.yearPlaceholder")}
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

        <p className="windows95-text text-text mt-1 font-bold">
          {t("anilist.filters.sort")}
        </p>
        <Select
          className="w-full"
          value={local.sort}
          onChange={(v) => setLocal((p) => ({ ...p, sort: v }))}
          options={[
            { value: "", label: t("anilist.filters.sortRelevance") },
            { value: "SCORE_DESC", label: t("anilist.filters.sortScoreDesc") },
            { value: "SCORE_ASC", label: t("anilist.filters.sortScoreAsc") },
            {
              value: "POPULARITY_DESC",
              label: t("anilist.filters.sortPopularityDesc"),
            },
            {
              value: "TRENDING_DESC",
              label: t("anilist.filters.sortTrendingDesc"),
            },
            {
              value: "START_DATE_DESC",
              label: t("anilist.filters.sortStartDateDesc"),
            },
          ]}
        />

        <p className="windows95-text text-text mt-1 font-bold">
          {t("anilist.filters.source")}
        </p>
        <Select
          className="w-full"
          value={local.source}
          onChange={(v) => setLocal((p) => ({ ...p, source: v }))}
          options={[
            { value: "", label: t("anilist.filters.any") },
            { value: "ORIGINAL", label: t("anilist.filters.sourceOriginal") },
            { value: "MANGA", label: t("anilist.filters.sourceManga") },
            {
              value: "LIGHT_NOVEL",
              label: t("anilist.filters.sourceLightNovel"),
            },
            {
              value: "VISUAL_NOVEL",
              label: t("anilist.filters.sourceVisualNovel"),
            },
            {
              value: "VIDEO_GAME",
              label: t("anilist.filters.sourceVideoGame"),
            },
            { value: "NOVEL", label: t("anilist.filters.sourceNovel") },
            { value: "WEB_MANGA", label: t("anilist.filters.sourceWebManga") },
            { value: "OTHER", label: t("anilist.filters.sourceOther") },
          ]}
        />

        <p className="windows95-text text-text mt-1 font-bold">
          {t("anilist.filters.country")}
        </p>
        <div className="flex flex-wrap gap-1">
          {[
            ["", t("anilist.filters.countryAny")],
            ["JP", t("anilist.filters.countryJapan")],
            ["CN", t("anilist.filters.countryChina")],
            ["KR", t("anilist.filters.countryKorea")],
          ].map(([v, l]) => (
            <label
              key={v}
              className="windows95-text flex cursor-pointer items-center gap-1 select-none"
            >
              <Radio
                checked={local.country === v}
                onChange={() => setLocal((p) => ({ ...p, country: v }))}
              />
              {l}
            </label>
          ))}
        </div>

        <p className="windows95-text text-text mt-1 font-bold">
          {t("anilist.filters.releaseYear")}
        </p>
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

        <p className="windows95-text text-text mt-1 font-bold">
          {t("anilist.filters.episodes")}
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

        <p className="windows95-text text-text mt-1 font-bold">
          {t("anilist.filters.score")}
        </p>
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

        <label className="windows95-text mt-1 flex cursor-pointer items-center gap-2 select-none">
          <Checkbox checked={local.adult} onChange={toggleAdult} />
          {t("anilist.filters.adult")}
        </label>

        <div className="mt-3 flex justify-end gap-1">
          <Button variant="outline" onClick={handleReset}>
            {t("anilist.filters.reset")}
          </Button>
          <Button
            onClick={() => {
              onApply(local);
              onClose();
            }}
          >
            {t("anilist.filters.apply")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default FiltersModal;
export { defaultFilters };
