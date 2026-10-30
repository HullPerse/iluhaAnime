import { cn } from "cn";

import { splitByRanges } from "@/lib/core/highlight.utils";
import type { HighlightRange } from "@/types/search/search";

export function FindMarkedText({
  text,
  ranges,
  active,
}: {
  text: string;
  ranges: readonly HighlightRange[];
  active: boolean;
}) {
  const tokens = splitByRanges(text, ranges);
  if (tokens.length === 0) return <span>{text}</span>;
  return (
    <>
      {tokens.map((token, index) =>
        token.highlighted ? (
          <span
            key={index}
            className={cn(
              "font-bold",
              active ? "text-white underline" : "bg-highlight text-title-text"
            )}
          >
            {token.text}
          </span>
        ) : (
          <span key={index} className={active ? "text-white" : "text-text"}>
            {token.text}
          </span>
        )
      )}
    </>
  );
}
