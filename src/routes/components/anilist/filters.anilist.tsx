import { Star } from "lucide-react";

import { useState } from "react";

import ChipsRow from "@/components/shared/chips.component";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Checkbox } from "@/components/ui/checkbox.component";
import Combobox from "@/components/ui/combobox.component";
import { Input } from "@/components/ui/input.component";
import { Radio } from "@/components/ui/radio.component";
import { DualSlider } from "@/components/ui/range.component";
import { statusLabels, seasonLabels, formatLabels } from "@/config/anilist.config";
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

  const genreOpts = ANILIST_GENRES.filter((g) => !local.genres.includes(g)).map((g) => ({
    value: g,
    label: g,
  }));

  const tagOpts = ANILIST_TAGS.filter((t) => !local.tags.includes(t)).map((t) => ({
    value: t,
    label: t,
  }));

  const nsfwTagOpts = ANILIST_NSFW_TAGS.filter((t) => !local.tags.includes(t)).map((t) => ({
    value: t,
    label: t,
  }));

  return (
    <Modal header={t("anilist.filters.title")} onClose={onClose} className="w-xl">
      <div className="flex flex-col gap-3 overflow-y-auto p-2">
        <p className="windows95-text text-text font-bold">{t("anilist.filters.genres")}</p>
        <Combobox
          className="w-full"
          value={genreSelect}
          onChange={addGenre}
          placeholder={t("anilist.filters.genre.placeholder")}
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

        <p className="windows95-text text-text mt-1 font-bold">{t("anilist.filters.tags")}</p>
        <Combobox
          className="w-full"
          value={tagSelect}
          onChange={addTag}
          placeholder={t("anilist.filters.tag.placeholder")}
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
              {t("anilist.filters.nsfw.tags")}
            </p>
            <Combobox
              className="w-full"
              value={nsfwTagSelect}
              onChange={addNsfwTag}
              placeholder={t("anilist.filters.nsfw.placeholder")}
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

        <hr className="border-muted my-1 w-full border-t" />

        <p className="windows95-text text-text mt-1 font-bold">{t("anilist.filters.format")}</p>
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

        <p className="windows95-text text-text mt-1 font-bold">{t("anilist.filters.status")}</p>
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
          {t("anilist.filters.season.and.year")}
        </p>
        <div className="flex items-center gap-2">
          <Combobox
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
            placeholder={t("anilist.filters.year.placeholder")}
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

        <p className="windows95-text text-text mt-1 font-bold">{t("anilist.filters.sort")}</p>
        <Combobox
          className="w-full"
          value={local.sort}
          onChange={(v) => setLocal((p) => ({ ...p, sort: v }))}
          options={[
            { value: "", label: t("anilist.filters.sort.relevance") },
            { value: "SCORE_DESC", label: t("anilist.filters.sort.score.desc") },
            { value: "SCORE_ASC", label: t("anilist.filters.sort.score.asc") },
            {
              value: "POPULARITY_DESC",
              label: t("anilist.filters.sort.popularity.desc"),
            },
            {
              value: "TRENDING_DESC",
              label: t("anilist.filters.sort.trending.desc"),
            },
            {
              value: "START_DATE_DESC",
              label: t("anilist.filters.sort.start.date.desc"),
            },
          ]}
        />

        <p className="windows95-text text-text mt-1 font-bold">{t("anilist.filters.source")}</p>
        <Combobox
          className="w-full"
          value={local.source}
          onChange={(v) => setLocal((p) => ({ ...p, source: v }))}
          options={[
            { value: "", label: t("anilist.filters.any") },
            { value: "ORIGINAL", label: t("anilist.filters.source.original") },
            { value: "MANGA", label: t("anilist.filters.source.manga") },
            {
              value: "LIGHT_NOVEL",
              label: t("anilist.filters.source.light.novel"),
            },
            {
              value: "VISUAL_NOVEL",
              label: t("anilist.filters.source.visual.novel"),
            },
            {
              value: "VIDEO_GAME",
              label: t("anilist.filters.source.video.game"),
            },
            { value: "NOVEL", label: t("anilist.filters.source.novel") },
            { value: "WEB_MANGA", label: t("anilist.filters.source.web.manga") },
            { value: "OTHER", label: t("anilist.filters.source.other") },
          ]}
        />

        <p className="windows95-text text-text mt-1 font-bold">{t("anilist.filters.country")}</p>
        <div className="flex flex-wrap gap-1">
          {[
            ["", t("anilist.filters.country.any")],
            ["JP", t("anilist.filters.country.japan")],
            ["CN", t("anilist.filters.country.china")],
            ["KR", t("anilist.filters.country.korea")],
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
          {t("anilist.filters.release.year")}
        </p>
        <DualSlider
          wheel
          min={1960}
          max={2026}
          step={1}
          value={local.year[0] === 0 && local.year[1] === 0 ? [1960, 2026] : local.year}
          onChange={(v) => setLocal((p) => ({ ...p, year: v }))}
        />

        <p className="windows95-text text-text mt-1 font-bold">{t("anilist.filters.episodes")}</p>
        <DualSlider
          wheel
          min={0}
          max={2000}
          step={1}
          value={local.episodes[0] === 0 && local.episodes[1] === 0 ? [0, 2000] : local.episodes}
          onChange={(v) => setLocal((p) => ({ ...p, episodes: v }))}
        />

        <p className="windows95-text text-text mt-1 font-bold">{t("anilist.filters.score")}</p>
        <DualSlider
          wheel
          min={0}
          max={100}
          step={1}
          suffix={<Star className="size-3" fill="currentColor" aria-hidden />}
          value={local.score[0] === 0 && local.score[1] === 0 ? [0, 100] : local.score}
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
