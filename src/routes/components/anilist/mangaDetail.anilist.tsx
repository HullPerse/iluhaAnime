import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { anilistApi } from "@/api/anilist.api";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import { trackedManga } from "@/store/anilistManga.store";
import { searchLocalManga } from "@/store/manga.store";
import { patchSettings } from "@/store/settings.store";
import type { AniListEntry, AniUser } from "@/types/anilist/anilist";

import { TrackingEditor } from "./manga/trackingEditor.manga";

export const trackingMangaKey = ["anilist", "manga"] as const;

function numberField(form: FormData, field: string) {
  const value = form.get(field);

  return typeof value === "string" && value ? Number(value) : null;
}

function textField(form: FormData, field: string) {
  const value = form.get(field);

  return typeof value === "string" ? value : "";
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
    onSuccess: () => {
      client.invalidateQueries({ queryKey: queryKeys.cardsShellScope() });
      client.invalidateQueries({ queryKey: queryKeys.cardsPacksScope() });

      return client.invalidateQueries({ queryKey: [...trackingMangaKey, "lists"] });
    },
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
