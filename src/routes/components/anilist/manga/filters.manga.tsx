import { useCell } from "@hullperse/hp_utils/react";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/hooks/i18n.hook";
import { anilistMangaMode } from "@/store/anilistManga.store";
import { search, filters, page, filterOpen } from "@/store/anilistMangaProfile.store";

export function MangaFilters() {
  const { t } = useI18n();
  const current = useCell(filters);

  return (
    <Modal
      header={t("anilist.route.filters")}
      onClose={() => filterOpen.set(false)}
      className="w-md"
    >
      <form
        className="grid gap-2 text-xs"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const value = (field: string) => String(data.get(field) ?? "").trim();

          if (value("type") === "ANIME") {
            filterOpen.set(false);
            anilistMangaMode.set(false);

            return;
          }

          const year = Number(value("year")) || null;
          const terms = (field: string) =>
            value(field)
              .split(",")
              .map((term) => term.trim())
              .filter(Boolean);
          filters.set({
            format: value("format") || null,
            country: value("country") || null,
            yearFrom: year,
            yearTo: year ? year + 1 : null,
            status: value("status") || null,
            genres: terms("genres"),
            tags: terms("tags"),
            sort: value("sort") ? [value("sort")] : null,
          });
          page.set(1);
          search.set(true);
          filterOpen.set(false);
        }}
      >
        <label>
          {t("manga.tracking.type")}
          <select
            name="type"
            defaultValue="MANGA"
            className="windows95-border bg-field block w-full p-1"
          >
            <option value="MANGA">{t("app.manga")}</option>
            <option value="ANIME">{t("manga.tracking.anime")}</option>
          </select>
        </label>
        {(
          [
            {
              name: "format",
              label: "anilist.filters.format",
              value: current.format,
              options: [
                ["MANGA", "Манга"],
                ["ONE_SHOT", "Ваншот"],
              ],
            },
            {
              name: "country",
              label: "manga.tracking.country",
              value: current.country,
              options: [
                ["JP", "Япония"],
                ["KR", "Корея"],
                ["CN", "Китай"],
                ["TW", "Тайвань"],
              ],
            },
            {
              name: "status",
              label: "anilist.filters.status",
              value: current.status,
              options: [
                ["RELEASING", "Выходит"],
                ["FINISHED", "Завершена"],
                ["HIATUS", "На паузе"],
                ["CANCELLED", "Отменена"],
                ["NOT_YET_RELEASED", "Анонс"],
              ],
            },
            {
              name: "sort",
              label: "manga.tracking.sort",
              value: current.sort?.[0],
              options: [
                ["SEARCH_MATCH", "Релевантность"],
                ["POPULARITY_DESC", "Популярность"],
                ["SCORE_DESC", "Оценка"],
                ["START_DATE_DESC", "Дата выхода"],
              ],
            },
          ] as const
        ).map((row) => (
          <label key={row.name}>
            {t(row.label)}
            <select
              name={row.name}
              defaultValue={row.value ?? ""}
              className="windows95-border bg-field block w-full p-1"
            >
              <option value="">{t("manga.library.all")}</option>
              {row.options.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          {t("manga.tracking.year")}
          <Input
            type="number"
            min={1900}
            max={2100}
            name="year"
            defaultValue={current.yearFrom ?? ""}
          />
        </label>
        <label>
          {t("manga.tracking.genres")}
          <Input name="genres" defaultValue={current.genres?.join(", ")} />
        </label>
        <label>
          {t("manga.tracking.tags")}
          <Input name="tags" defaultValue={current.tags?.join(", ")} />
        </label>
        <Button type="submit">{t("manga.tracking.apply")}</Button>
      </form>
    </Modal>
  );
}
