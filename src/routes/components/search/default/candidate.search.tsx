import { cn } from "cn";
import { Check } from "lucide-react";

import ImageComponent from "@/components/ui/image.component";
import { useCoverCache } from "@/hooks/collection/cache.hook";
import { useI18n } from "@/hooks/i18n.hook";
import type { CoverCandidate } from "@/lib/search/cover.utils";

export default function CoverCandidateThumb({
  candidate,
  selected,
  current,
  onSelect,
  onApply,
}: {
  candidate: CoverCandidate;
  selected: boolean;
  current: boolean;
  onSelect: (id: number) => void;
  onApply: () => void;
}) {
  const { t } = useI18n();
  const { cachedUrl } = useCoverCache(candidate.coverUrl);
  return (
    <button
      type="button"
      onClick={() => onSelect(candidate.id)}
      onDoubleClick={onApply}
      aria-pressed={selected}
      className={cn(
        "relative flex w-28 shrink-0 cursor-pointer flex-col items-center gap-0.5 p-0.5",
        selected ? "windows95-active-border bg-secondary" : "windows95-border bg-primary"
      )}
    >
      {selected && (
        <span className="bg-primary text-text absolute top-0.5 left-0.5 z-10 flex size-4 items-center justify-center">
          <Check className="size-3" aria-hidden />
        </span>
      )}
      <ImageComponent
        src={cachedUrl ?? "/images/unknown_source.png"}
        alt=""
        className="h-32 w-full object-cover"
      />
      <span
        className={cn(
          "line-clamp-2 w-full text-center text-xs leading-tight",
          selected ? "text-title-text" : "windows95-text"
        )}
        title={candidate.romaji}
      >
        {candidate.romaji}
      </span>
      <span
        className={cn(
          "flex gap-1 text-xs",
          selected ? "text-title-text" : "windows95-text text-hint"
        )}
      >
        {current && (
          <span className="font-bold underline">{t("search.cover.correct.current")}</span>
        )}
        {candidate.seasonYear ? <span>{candidate.seasonYear}</span> : null}
        {candidate.format ? <span>{candidate.format}</span> : null}
      </span>
    </button>
  );
}
