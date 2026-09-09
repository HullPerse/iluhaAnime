import { ChevronLeft, Edit2, Images, X } from "lucide-react";
import { useState } from "react";

import { FavPeopleStar } from "@/components/shared/favPeopleStar.component";
import Section from "@/components/shared/section.component";
import { Button } from "@/components/ui/button.component";
import { useEscapeClose } from "@/hooks/useEscapeClose.hook";
import { readStoredMedia } from "@/lib/collection/media.utils";
import { statusLabel } from "@/lib/collection/status.utils";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { CollectionItem, CollectionStatusDef } from "@/types/collection";

import { DetailActionsCollection } from "./actions.detail";
import { DetailCoverCollection } from "./cover.detail";
import { DetailFactsCollection } from "./facts.detail";
import { SimilarCollection } from "./similar.detail";
import { SitesCollection } from "./sites.detail";
import { TitlesCollection } from "./titles.detail";
import { MediaViewerContent } from "./viewer.detail";

export function DetailCollection({
  item,
  items,
  statuses,
  onClose,
  onOpenItem,
  onEdit,
  onDelete,
  refreshMetadata,
}: {
  item: CollectionItem;
  items: CollectionItem[];
  statuses: CollectionStatusDef[];
  onClose: () => void;
  onOpenItem: (item: CollectionItem) => void;
  onEdit: (item: CollectionItem) => void;
  onDelete?: (id: string) => void;
  refreshMetadata: (item: CollectionItem) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [mediaView, setMediaView] = useState<{ itemId: string; tab: "frames" | "trailer" } | null>(
    null
  );
  const [showDesc, setShowDesc] = useState<boolean>(true);
  const mediaOpen = mediaView && mediaView.itemId === item.id ? mediaView : null;
  useEscapeClose(mediaOpen ? () => setMediaView(null) : onClose);
  const stored = readStoredMedia(item.detailsJson);
  const canOpenMedia =
    item.externalIds.tmdb != null || item.externalIds.anilist != null || stored.stills.length > 0;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-2">
      <div className="windows95-active-border bg-primary flex max-h-[85vh] w-full max-w-xl flex-col">
        <div className="ui-titlebar justify-between">
          <div className="flex min-w-0 flex-row items-center gap-1">
            {mediaOpen ? (
              <Button
                size="icon"
                className="size-5"
                onClick={() => setMediaView(null)}
                aria-label={t("common.back")}
                title={t("common.back")}
              >
                <ChevronLeft className="size-3" />
              </Button>
            ) : null}
            {!mediaOpen && <FavPeopleStar animeId={item.externalIds.anilist} />}
            <span className="truncate font-bold text-white">
              {mediaOpen
                ? mediaOpen.tab === "trailer"
                  ? t("collection.details.trailer")
                  : t("collection.details.stills")
                : item.title}
            </span>
          </div>
          <div className="flex shrink-0 flex-row items-center gap-0.5">
            {!mediaOpen && canOpenMedia ? (
              <Button
                size="icon"
                className="size-5"
                onClick={() => setMediaView({ itemId: item.id, tab: "frames" })}
                aria-label={t("collection.details.media")}
                title={t("collection.details.media")}
              >
                <Images className="size-3" />
              </Button>
            ) : null}
            <Button size="icon" className="size-5" onClick={onClose}>
              <X className="size-3" />
            </Button>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
          {mediaOpen ? (
            <MediaViewerContent
              tmdbId={item.externalIds.tmdb ?? null}
              anilistId={item.externalIds.anilist ?? null}
              mediaType={item.type === "movie" ? "movie" : "tv"}
              stored={stored}
              activeTab={mediaOpen.tab}
              onTabChange={(tab) => setMediaView({ itemId: item.id, tab })}
            />
          ) : (
            <>
              <div className="flex gap-2">
                <DetailCoverCollection item={item} />
                <div className="flex flex-col gap-1 text-xs">
                  <DetailFactsCollection
                    item={item}
                    statuses={statuses}
                    statusText={statusLabel(statuses, item.status, t, locale)}
                  />
                  <DetailActionsCollection item={item} refreshMetadata={refreshMetadata} />
                </div>
              </div>
              <div className="mt-2">
                <TitlesCollection title={item.title} altTitles={item.altTitles} onClose={onClose} />
              </div>

              {item.description && (
                <Section
                  header={t("anilist.details.description")}
                  className="windows95-text overflow-y-auto bg-white leading-relaxed whitespace-pre-line"
                  expanded={showDesc}
                  onExpand={() => setShowDesc((prev) => !prev)}
                >
                  <textarea
                    readOnly
                    value={item.description}
                    className="h-36 max-h-64 min-h-18 w-full overflow-y-auto outline-0"
                  />
                </Section>
              )}

              {item.notes && (
                <div className="windows95-border mt-2 bg-white p-1">
                  <strong className="text-xs">{t("collection.details.notes")}</strong>
                  <p className="text-xs">{item.notes}</p>
                </div>
              )}
              <SitesCollection item={item} />
              <SimilarCollection items={items} item={item} onOpenItem={onOpenItem} />
            </>
          )}
        </div>
        <div className="windows95-border-t bg-primary flex justify-between gap-1 p-1">
          {onDelete && (
            <Button
              variant="destructive"
              onClick={() => {
                onDelete(item.id);
                onClose();
              }}
            >
              {t("common.delete")}
            </Button>
          )}
          <div className="ml-auto flex gap-1">
            <Button onClick={() => onEdit(item)}>
              <Edit2 className="size-3" /> {t("collection.details.edit")}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              {t("collection.details.close")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
