import ImageComponent from "@/components/ui/image.component";
import ProgressBar from "@/components/shared/progress.component";
import type { SimilarCardProps } from "@/types/anilist/anilistSimilar";

export function SimilarRailCard({
  item,
  rank,
  strength,
  meta,
  strengthLabel,
  onOpen,
}: SimilarCardProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(item.id)}
      title={meta === "" ? item.title : `${item.title} - ${meta}`}
      className="group/card windows95-text hover:bg-surface flex w-28 shrink-0 snap-start flex-col gap-0.5 p-0.5 text-left"
    >
      <span className="windows95-active-border relative flex aspect-3/4 w-full overflow-hidden">
        <ImageComponent src={item.cover_url ?? ""} alt={item.title} className="h-full w-full" />
        <span className="windows95-text bg-secondary text-title-text absolute top-0 left-0 px-0.5 text-xs leading-tight tabular-nums">
          #{rank}
        </span>
        {item.score != null && item.score > 0 && (
          <span className="windows95-text bg-secondary text-title-text absolute right-0 bottom-0 px-0.5 text-xs leading-tight">
            ★ {item.score}
          </span>
        )}
      </span>
      <span className="line-clamp-2 h-7 text-xs leading-tight font-bold">{item.title}</span>
      {meta !== "" && <span className="text-hint text-xs">{meta}</span>}
      <span className="flex items-center gap-1">
        <ProgressBar
          value={strength}
          max={100}
          className="h-2 min-w-12 flex-1"
          ariaLabel={strengthLabel}
        />
        <span className="windows95-text w-7 shrink-0 text-right text-xs tabular-nums">
          {strength}%
        </span>
      </span>
    </button>
  );
}
