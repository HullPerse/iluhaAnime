import type { HighlightToken } from "@/types/search";

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
  return (
    <div
      aria-hidden="true"
      ref={backdropRef}
      className="inline-autocomplete-ghost windows95-text pointer-events-none absolute inset-0 z-0 flex items-center overflow-hidden border-2 border-transparent px-1.5 whitespace-pre"
    >
      <span className="windows95-text font-bold whitespace-pre">
        {hasHighlight ? (
          highlightSegments.map((segment, index) =>
            segment.highlighted ? (
              <span key={index} className="bg-highlight text-white">
                {segment.text}
              </span>
            ) : (
              <span key={index} className="text-text">
                {segment.text}
              </span>
            )
          )
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
