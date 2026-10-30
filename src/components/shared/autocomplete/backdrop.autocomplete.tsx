import { highlightTokenKey } from "@/lib/search/highlightToken.utils";
import type { HighlightToken } from "@/types/core/highlight";

import { HighlightTokenSpan } from "@/components/shared/autocomplete/highlightTokenSpan.autocomplete";

export function BackdropLayer({
  currentValue,
  highlightSegments,
  hasHighlight,
  ghostSuffix,
  backdropRef,
}: {
  currentValue: string;
  highlightSegments: HighlightToken[];
  hasHighlight: boolean;
  ghostSuffix: string;
  backdropRef: React.RefObject<HTMLDivElement | null>;
}) {
  if (!ghostSuffix && !hasHighlight) return null;
  const seen = new Map<string, number>();
  return (
    <div
      aria-hidden="true"
      ref={backdropRef}
      className="inline-autocomplete-ghost windows95-text pointer-events-none absolute inset-0 z-0 flex items-center overflow-hidden border-2 border-transparent px-1.5 whitespace-pre"
    >
      <span className="windows95-text font-bold whitespace-pre">
        {hasHighlight ? (
          highlightSegments.map((segment, index) => (
            <HighlightTokenSpan
              key={highlightTokenKey(segment, index, seen)}
              text={segment.text}
              highlighted={segment.highlighted}
              kind={segment.kind}
            />
          ))
        ) : (
          <span className="text-transparent">{currentValue}</span>
        )}
        {ghostSuffix && (
          <span
            className="windows95-text font-bold"
            style={{
              color: "var(--color-autocomplete, var(--color-muted))",
              opacity: "var(--autocomplete-opacity, 0.6)",
            }}
          >
            {ghostSuffix}
          </span>
        )}
      </span>
    </div>
  );
}
