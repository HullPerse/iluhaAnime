import { Star } from "lucide-react";
import { memo, useMemo } from "react";

import Image from "@/components/ui/image.component";
import Select from "@/components/ui/select.component";
import ProgressBar from "@/components/shared/progress.component";
import { useCoverCache } from "@/hooks/collection/cache.hook";
import { useI18n } from "@/hooks/i18n.hook";
import { useThemeComponents } from "@/hooks/themeComponents.hook";
import { rowMetaParts, sameRowVisual } from "@/lib/core/list.utils";
import { generatePlaceholder } from "@/lib/core/placeholder.utils";
import { sortStatuses, statusColorOf, statusLabel } from "@/lib/core/status.utils";
import { enterOrSpace } from "@/lib/ui/keyboard.utils";
import type { CollectionRowProps, CollectionStatus } from "@/types/anilist/collection";

export function CollectionRowView({
  item,
  statuses,
  selected,
  onOpen,
  onSetStatus,
}: CollectionRowProps) {
  const { t, locale } = useI18n();
  const { cardMeta } = useThemeComponents();
  const shortMeta = cardMeta === "short";
  const { cachedUrl } = useCoverCache(item.coverUrl, item.thumbBlobId ?? item.coverBlobId);
  const cover = useMemo(() => {
    if (cachedUrl) return cachedUrl;
    if (item.title) return generatePlaceholder(item.title);
    return "";
  }, [cachedUrl, item.title]);
  const meta = rowMetaParts(item);
  return (
    <div
      className={`windows95-active-border bg-primary hover:bg-surface flex max-h-36 min-h-28 flex-row p-2 [contain-intrinsic-size:auto_116px] [content-visibility:auto] hover:cursor-pointer ${selected ? "outline-secondary outline-2" : ""}`}
      onClick={onOpen ? () => onOpen(item) : undefined}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? item.title : undefined}
      onKeyDown={onOpen ? enterOrSpace(() => onOpen(item)) : undefined}
    >
      <div className="flex w-full flex-row items-start justify-between gap-2 xl:flex-row-reverse">
        <section className="flex h-full min-w-0 flex-1 flex-col">
          <div className="flex flex-row gap-2">
            <h2
              className="windows95-text flex flex-row gap-1 truncate leading-tight font-bold"
              title={item.title}
            >
              <span
                className="windows95-border mt-0.5 shrink-0"
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  backgroundColor: statusColorOf(statuses, item.status),
                }}
                title={statusLabel(statuses, item.status, t, locale)}
              />
              {item.title}
            </h2>
          </div>
          {!shortMeta && meta.length > 0 && (
            <div className="text-hint windows95-text truncate text-xs" title={meta.join(" - ")}>
              {meta.join(" - ")}
            </div>
          )}

          <div className="windows95-text mt-auto flex flex-row items-center gap-2 font-bold">
            {item.rating != null && item.rating > 0 && (
              <span className="bg-secondary text-primary flex flex-row items-center gap-0.5 px-1 text-xs">
                <Star className="size-3 fill-white" /> {item.rating}
              </span>
            )}
            {onSetStatus ? (
              <Select
                value={item.status}
                onChange={(v) => onSetStatus(item, v as CollectionStatus)}
                options={sortStatuses(statuses).map((s) => ({
                  value: s.id,
                  label: statusLabel(statuses, s.id, t, locale),
                }))}
                label={t("collection.card.status")}
                className="min-h-0 w-auto max-w-44 min-w-0 flex-none text-xs font-normal"
              />
            ) : (
              <span className="text-text text-xs">
                {statusLabel(statuses, item.status, t, locale)}
              </span>
            )}
            {item.progressTotal != null && item.progressTotal > 0 ? (
              <div className="flex items-center gap-1">
                <ProgressBar
                  value={item.progressValue}
                  max={item.progressTotal}
                  className="h-3.5 w-20"
                  slots
                />
                <span className="windows95-text text-xs">
                  {item.progressValue}/{item.progressTotal}
                </span>
              </div>
            ) : (
              item.progressValue > 0 && (
                <span className="bg-secondary text-title-text px-1 text-xs">
                  {item.progressValue} {item.progressUnit}
                </span>
              )
            )}
          </div>
        </section>

        {cover && (
          <div className="flex h-full">
            <Image
              src={cover}
              alt={`${item.title} cover`}
              className="windows95-active-border h-full w-14"
              loading="eager"
            />
          </div>
        )}
      </div>
    </div>
  );
}

const CollectionRow = memo(CollectionRowView, sameRowVisual);

export default CollectionRow;
export { CollectionRow };
