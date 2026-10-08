import { memo } from "react";

import type { HighlightToken } from "@/lib/highlight/highlight.utils";

function spellOf(kind: HighlightToken["kind"]): "warn" | "error" | undefined {
  if (kind === "spell-error") return "error";
  if (kind === "spell-warn") return "warn";
  return undefined;
}

const HighlightTokenSpan = memo(({ text, highlighted, kind }: HighlightToken) => {
  if (!highlighted) {
    return <span className="text-text">{text}</span>;
  }
  return (
    <span
      data-spell={spellOf(kind) ?? undefined}
      className={
        kind === "spell-error"
          ? "text-text underline decoration-red-500 decoration-wavy underline-offset-2"
          : kind === "spell-warn"
            ? "text-text underline decoration-amber-500 decoration-wavy underline-offset-2"
            : "bg-highlight text-title-text"
      }
    >
      {text}
    </span>
  );
});

function tokenKey(segment: HighlightToken, index: number, seen: Map<string, number>): string | number {
  if (!segment.highlighted) return index;
  const base = `spell:${segment.kind ?? "match"}:${segment.text}`;
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}#${count}`;
}

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
              key={tokenKey(segment, index, seen)}
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
