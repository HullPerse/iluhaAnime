import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart } from "lucide-react";

import {
  getMangaLibrary,
  mangaLibraryKey,
  MANGA_UNASSIGNED_STATUS,
  removeMangaCopy,
  saveMangaCopy,
  setMangaFavourite,
} from "@/api/manga.api";
import type { LibraryCopy, MangaHit, MangaSource } from "@/api/manga.api";
import { Button } from "@/components/ui/button.component";
import Select from "@/components/ui/select.component";
import { useI18n } from "@/hooks/i18n.hook";
import { patchSettings } from "@/store/settings.store";

type LibraryChange =
  | { kind: "status"; status: string; allowDuplicate?: boolean }
  | { kind: "favourite"; id: string; favourite: boolean };

async function applyLibraryChange(
  action: LibraryChange,
  copy: { source: MangaSource; hit: MangaHit; unread: number },
  itemId: string | undefined
) {
  if (action.kind === "favourite") {
    await setMangaFavourite(action.id, action.favourite);
    return null;
  }
  if (!action.status) {
    if (itemId) await removeMangaCopy(itemId);
    return null;
  }
  return saveMangaCopy({
    ...copy,
    status: action.status,
    allowDuplicate: action.allowDuplicate ?? false,
  });
}

export default function SaveManga({
  source,
  hit,
  unread,
  nsfw,
}: {
  source: MangaSource;
  hit: MangaHit;
  unread: number;
  nsfw: boolean;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const library = useQuery({
    queryKey: [...mangaLibraryKey, nsfw],
    queryFn: () => getMangaLibrary(nsfw),
  });
  const item = library.data?.items.find(
    (copy) => copy.source === source && copy.mangaId === hit.id
  );
  const change = useMutation({
    scope: { id: `manga-library:${source}:${hit.id}` },
    mutationFn: (action: LibraryChange) =>
      applyLibraryChange(action, { source, hit, unread }, item?.id),
    onSuccess: async (result, action) => {
      if (result?.kind === "duplicate") return;
      if (result?.kind === "saved" && action.kind === "status") {
        patchSettings({ mangaLastStatus: action.status });
      }
      await client.invalidateQueries({ queryKey: mangaLibraryKey });
    },
  });

  const currentStatus = item?.status ?? "";
  const assignable =
    library.data?.statuses.filter(
      ({ id }) => id !== MANGA_UNASSIGNED_STATUS || currentStatus === id
    ) ?? [];
  const duplicate = change.data?.kind === "duplicate" ? change.data.item : null;
  const requestedStatus = change.variables?.kind === "status" ? change.variables.status : null;

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 items-center gap-1">
        <Select
          className="min-w-0 flex-1"
          label={t("manga.library.status")}
          value={currentStatus}
          options={[
            { value: "", label: "—" },
            ...assignable.map(({ id, label }) => ({
              value: id,
              label,
            })),
          ]}
          disabled={!library.data || change.isPending}
          onChange={(status) => {
            if (status === currentStatus || status === MANGA_UNASSIGNED_STATUS) return;
            change.mutate({ kind: "status", status });
          }}
        />
        <LibraryFavourite
          item={item}
          pendingFavourite={
            change.isPending && change.variables.kind === "favourite"
              ? change.variables.favourite
              : undefined
          }
          disabled={change.isPending}
          onToggle={(id, favourite) => change.mutate({ kind: "favourite", id, favourite })}
        />
      </div>
      {(change.error || library.error) && (
        <p role="alert" className="text-destructive windows95-text">
          {t("manga.library.failed")}
        </p>
      )}
      {duplicate && requestedStatus && (
        <div className="windows95-border bg-field windows95-text grid gap-1 p-1">
          <p>{t("manga.library.duplicate")}</p>
          <p className="truncate font-bold" title={duplicate.title}>
            {duplicate.title}
          </p>
          <Button
            onClick={() =>
              change.mutate({ kind: "status", status: requestedStatus, allowDuplicate: true })
            }
          >
            {t("manga.library.keepCopy")}
          </Button>
          <Button onClick={() => change.reset()}>{t("common.cancel")}</Button>
        </div>
      )}
    </div>
  );
}

function LibraryFavourite({
  item,
  pendingFavourite,
  disabled,
  onToggle,
}: {
  item: LibraryCopy | undefined;
  pendingFavourite: boolean | undefined;
  disabled: boolean;
  onToggle: (id: string, next: boolean) => void;
}) {
  const { t } = useI18n();
  if (!item || item.status === MANGA_UNASSIGNED_STATUS) return null;

  const favourite = pendingFavourite ?? item.favourite ?? false;
  const label = t(favourite ? "manga.library.unfavourite" : "manga.library.favourite");
  return (
    <Button
      size="icon"
      className="size-6 shrink-0"
      title={label}
      aria-label={label}
      aria-pressed={favourite}
      disabled={disabled}
      onClick={() => onToggle(item.id, !favourite)}
    >
      <Heart
        className={favourite ? "text-destructive size-4 fill-current" : "size-4"}
        aria-hidden
      />
    </Button>
  );
}
