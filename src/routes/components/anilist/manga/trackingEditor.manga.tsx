import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { mangaListStatuses } from "@/config/manga/tracking.config";
import { useI18n } from "@/hooks/i18n.hook";
import type { AniListEntry } from "@/types/anilist/anilist";

export function TrackingEditor({
  entry,
  lists,
  pending,
  saved,
  onSave,
}: {
  entry?: AniListEntry;
  lists: string[] | undefined;
  pending: boolean;
  saved: boolean;
  onSave: (data: FormData) => void;
}) {
  const { t } = useI18n();

  return (
    <form
      key={entry?.updated_at ?? "new"}
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(new FormData(event.currentTarget));
      }}
    >
      <label className="grid gap-1">
        {t("manga.library.status")}
        <select
          name="status"
          defaultValue={entry?.list_status ?? "PLANNING"}
          className="windows95-border bg-field min-h-(--ui-control-height) p-1"
        >
          {mangaListStatuses.map(([value, label]) => (
            <option key={value} value={value}>
              {t(label)}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-1">
        <label>
          {t("manga.tracking.chapters")}
          <Input name="chapters" type="number" min={0} defaultValue={entry?.progress ?? ""} />
        </label>
        <label>
          {t("manga.tracking.volumes")}
          <Input
            name="volumes"
            type="number"
            min={0}
            defaultValue={entry?.progress_volumes ?? ""}
          />
        </label>
        <label>
          {t("manga.tracking.score")}
          <Input
            name="score"
            type="number"
            min={0}
            max={100}
            step="any"
            defaultValue={entry?.score ?? ""}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-1">
        <label>
          {t("manga.tracking.started")}
          <Input name="start" type="date" defaultValue={entry?.started_at ?? ""} />
        </label>
        <label>
          {t("manga.tracking.completed")}
          <Input name="end" type="date" defaultValue={entry?.completed_at ?? ""} />
        </label>
      </div>
      <label>
        {t("manga.tracking.notes")}
        <textarea
          name="notes"
          className="windows95-border bg-field block w-full p-1"
          defaultValue={entry?.notes ?? ""}
        />
      </label>
      {lists && lists.length > 0 && (
        <fieldset className="windows95-border flex flex-wrap gap-2 p-1">
          <legend>{t("manga.tracking.lists")}</legend>
          {lists.map((name) => (
            <label key={name} className="flex items-center gap-1">
              <input
                type="checkbox"
                name="custom"
                value={name}
                defaultChecked={entry?.custom_lists.includes(name)}
              />
              {name}
            </label>
          ))}
        </fieldset>
      )}
      <Button className="justify-self-start" loading={pending} type="submit">
        {t("manga.library.saveStatus")}
      </Button>
      {saved && <p role="status">{t("manga.tracking.saved")}</p>}
    </form>
  );
}
