import ImageComponent from "@/components/ui/image.component";
import ProgressBar from "@/components/shared/progress.component";
import type { SimilarCardProps } from "@/types/anilist/anilistSimilar";

export function SimilarListRow({
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
      className="windows95-text hover:bg-surface flex w-full items-center gap-1 px-0.5 py-0.5 text-left"
    >
      <span className="text-hint w-5 shrink-0 text-right text-xs tabular-nums">#{rank}</span>
      <span className="windows95-active-border relative flex h-10 w-8 shrink-0 overflow-hidden">
        <ImageComponent src={item.cover_url ?? ""} alt={item.title} className="h-full w-full" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs leading-tight font-bold">{item.title}</span>
        {meta !== "" && <span className="text-hint truncate text-xs leading-tight">{meta}</span>}
      </span>
      <span className="flex w-28 shrink-0 items-center gap-1">
        <ProgressBar value={strength} max={100} className="h-2 flex-1" ariaLabel={strengthLabel} />
        <span className="w-7 shrink-0 text-right text-xs tabular-nums">{strength}%</span>
      </span>
    </button>
  );
}
