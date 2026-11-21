import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { anilistApi } from "@/api/anilist.api";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/hooks/i18n.hook";
import { trackedManga } from "@/store/anilistManga.store";
import { searchLocalManga } from "@/store/manga.store";
import { patchSettings } from "@/store/settings.store";
import type { AniListEntry, AniUser } from "@/types/anilist/anilist";

export const mangaListStatuses = [
  ["CURRENT", "manga.tracking.status.current"],
  ["COMPLETED", "manga.tracking.status.completed"],
  ["PLANNING", "manga.tracking.status.planning"],
  ["PAUSED", "manga.tracking.status.paused"],
  ["DROPPED", "manga.tracking.status.dropped"],
  ["REPEATING", "manga.tracking.status.repeating"],
] as const;

export const trackingMangaKey = ["anilist", "manga"] as const;

function numberField(form: FormData, field: string) {
  const value = form.get(field);
  return typeof value === "string" && value ? Number(value) : null;
}

function textField(form: FormData, field: string) {
  const value = form.get(field);
  return typeof value === "string" ? value : "";
}

function TrackingEditor({
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

export default function TrackedMangaDetail({
  id,
  title,
  user,
  entry,
  favourite,
}: {
  id: number;
  title: string;
  user: AniUser | null | undefined;
  entry?: AniListEntry;
  favourite: boolean;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const client = useQueryClient();
  const details = useQuery({
    queryKey: [...trackingMangaKey, "media", id],
    queryFn: () => anilistApi.getMediaById(id, "MANGA"),
  });
  const lists = useQuery({
    queryKey: [...trackingMangaKey, "customLists", user?.id],
    queryFn: () => anilistApi.getCustomLists("MANGA"),
    enabled: Boolean(user),
  });
  const save = useMutation({
    mutationFn: (form: FormData) =>
      anilistApi.saveEntry({
        mediaId: id,
        mediaType: "MANGA",
        status: textField(form, "status"),
        progress: numberField(form, "chapters"),
        progressVolumes: numberField(form, "volumes"),
        score: numberField(form, "score"),
        notes: textField(form, "notes"),
        startedAt: textField(form, "start"),
        completedAt: textField(form, "end"),
        customLists: lists.data
          ? form.getAll("custom").filter((name): name is string => typeof name === "string")
          : undefined,
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: [...trackingMangaKey, "lists"] }),
  });
  const toggle = useMutation({
    mutationFn: () => anilistApi.toggleMangaFavourite(id),
    onSuccess: () => client.invalidateQueries({ queryKey: [...trackingMangaKey, "overview"] }),
  });
  return (
    <Modal header={title} onClose={() => trackedManga.set(null)} className="w-lg">
      <div className="grid gap-2 text-xs">
        {details.isPending && <p role="status">{t("manga.library.loading")}</p>}
        {(details.error || save.error || toggle.error || lists.error) && (
          <p role="alert">{t("manga.tracking.failed")}</p>
        )}
        {details.data && (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={async () => {
                  searchLocalManga(details.data.title);
                  patchSettings({ mangaTabEnabled: true });
                  trackedManga.set(null);
                  await navigate({ to: "/manga" });
                }}
              >
                {t("manga.tracking.findTitle", { title: details.data.title })}
              </Button>
              {user && (
                <Button
                  loading={toggle.isPending}
                  aria-pressed={favourite}
                  onClick={() => toggle.mutate()}
                >
                  {t("manga.tracking.favourite")}
                </Button>
              )}
            </div>
            <p>
              {t("manga.tracking.counts", {
                chapters: details.data.chapters ?? "-",
                volumes: details.data.volumes ?? "-",
              })}
            </p>
            {details.data.description && (
              <p className="max-w-prose whitespace-pre-line">{details.data.description}</p>
            )}
          </>
        )}
        {user && details.data && (
          <TrackingEditor
            entry={entry}
            lists={lists.data}
            pending={save.isPending}
            saved={save.isSuccess}
            onSave={(form) => save.mutate(form)}
          />
        )}
      </div>
    </Modal>
  );
}
