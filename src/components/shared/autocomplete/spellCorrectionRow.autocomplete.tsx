import { memo, useMemo } from "react";

import { findSubsequenceRanges, splitByRanges } from "@/lib/core/highlight.utils";

export const SpellCorrectionRow = memo(
  ({
    correction,
    query,
    onApply,
  }: {
    correction: string;
    query: string;
    onApply?: (correction: string) => void;
  }) => {
    const diff = useMemo(
      () => splitByRanges(correction, findSubsequenceRanges(correction, query)),
      [correction, query]
    );
    return (
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onApply?.(correction)}
        className="windows95-text hover:bg-highlight flex w-full min-w-0 items-center gap-1 px-1 py-px text-left font-bold hover:text-white"
      >
        <span className="min-w-0 flex-1 truncate">
          {diff.map((token, index) =>
            token.highlighted ? (
              <span key={index} className="text-highlight">
                {token.text}
              </span>
            ) : (
              <span key={index}>{token.text}</span>
            )
          )}
        </span>
      </button>
    );
  }
);
