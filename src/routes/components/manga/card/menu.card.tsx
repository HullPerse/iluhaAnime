import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  getMangaHistory,
  getMangaLibrary,
  mangaHistoryKey,
  mangaLibraryKey,
  MANGA_UNASSIGNED_STATUS,
} from "@/api/manga.api";
import type { MangaHit, MangaSource } from "@/api/manga.api";
import ContextMenu from "@/components/shared/contextMenu.component";
import { useI18n } from "@/hooks/i18n.hook";
import { showError } from "@/lib/core/ui/notification.utils";
import { applyLibraryChange } from "@/routes/components/manga/detail/save.detail";
import type { LibraryChange } from "@/routes/components/manga/detail/save.detail";
import { mangaDetail } from "@/store/manga.store";
import { settingsAtoms } from "@/store/settings.store";
import type { ContextMenuEntry } from "@/types/ui/contextMenu";

export function MangaCardMenu({
  source,
  hit,
  children,
}: {
  source: MangaSource;
  hit: MangaHit;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const library = useQuery({
    queryKey: [...mangaLibraryKey, "all"],
    queryFn: () => getMangaLibrary(true),
  });
  const history = useQuery({
    queryKey: [...mangaHistoryKey, true],
    queryFn: () => getMangaHistory(true),
  });
  const item = library.data?.items.find(
    (copy) => copy.source === source && copy.mangaId === hit.id
  );
  const last = history.data?.find((row) => row.source === source && row.mangaId === hit.id);
  const change = useMutation({
    scope: { id: `manga-library:${source}:${hit.id}` },
    mutationFn: (action: LibraryChange) =>
      applyLibraryChange(
        action,
        { source, hit, unread: item?.unread ?? hit.chapters ?? 0 },
        item?.id
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: mangaLibraryKey }),
    onError: () => showError(t("common.error"), t("manga.library.failed")),
  });
  const disabled = !library.data || change.isPending;
  const entries: ContextMenuEntry[] = [
    {
      kind: "item",
      id: "open",
      label: "manga.menu.open",
      onSelect: () => mangaDetail.set({ source, id: hit.id, title: hit.title }),
    },
    {
      kind: "item",
      id: "resume",
      label: "manga.menu.resume",
      disabled: !last,
      onSelect: () => {
        if (last)
          mangaDetail.set({
            source,
            id: hit.id,
            title: hit.title,
            chapterId: last.chapterId,
            chapterKey: last.chapterKey,
          });
      },
    },
    {
      kind: "item",
      id: "save",
      label: item ? "manga.menu.remove" : "manga.menu.add",
      disabled,
      onSelect: () =>
        change.mutate({ kind: "status", status: item ? "" : settingsAtoms.mangaLastStatus.get() }),
    },
    {
      kind: "submenu",
      id: "status",
      label: "manga.library.status",
      disabled,
      entries: (library.data?.statuses ?? [])
        .filter((status) => status.id !== MANGA_UNASSIGNED_STATUS)
        .map((status) => ({
          kind: "item",
          id: status.id,
          label: "manga.library.status",
          rawText: status.label,
          checked: status.id === item?.status,
          onSelect: () => change.mutate({ kind: "status", status: status.id }),
        })),
    },
    {
      kind: "item",
      id: "favourite",
      label: item?.favourite ? "manga.menu.unfavourite" : "manga.menu.favourite",
      checked: Boolean(item?.favourite),
      disabled: disabled || !item,
      onSelect: () => {
        if (item) change.mutate({ kind: "favourite", id: item.id, favourite: !item.favourite });
      },
    },
  ];

  return <ContextMenu entries={entries}>{children}</ContextMenu>;
}
