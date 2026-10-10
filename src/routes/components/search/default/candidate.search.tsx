import { cn } from "cn";

import ImageComponent from "@/components/ui/image.component";
import { useCoverCache } from "@/hooks/collection/cache.hook";
import type { CoverCandidate } from "@/lib/search/cover.utils";

export default function CoverCandidateThumb({
  candidate,
  selected,
  onSelect,
}: {
  candidate: CoverCandidate;
  selected: boolean;
  onSelect: (id: number) => void;
}) {
  const { cachedUrl } = useCoverCache(candidate.coverUrl);
  return (
    <button
      type="button"
      onClick={() => onSelect(candidate.id)}
      aria-pressed={selected}
      className={cn(
        "windows95-border flex w-20 shrink-0 cursor-pointer flex-col items-center gap-0.5 p-0.5",
        selected ? "bg-secondary" : "bg-primary"
      )}
    >
      <ImageComponent
        src={cachedUrl ?? "/images/unknown_source.png"}
        alt=""
        className="h-20 w-14 object-cover"
      />
      <span className="windows95-text w-full truncate text-center text-xs" title={candidate.romaji}>
        {candidate.romaji}
      </span>
      {candidate.seasonYear ? (
        <span className="windows95-text text-hint text-xs">{candidate.seasonYear}</span>
      ) : null}
    </button>
  );
}
