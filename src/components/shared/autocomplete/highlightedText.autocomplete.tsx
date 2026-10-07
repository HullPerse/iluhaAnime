import { cn } from "cn";

import {
  findSubsequenceRanges,
  splitByRanges,
} from "@/lib/highlight/highlight.utils";

export function HighlightedText({
  candidate,
  query,
  active,
}: {
  candidate: string;
  query: string;
  active: boolean;
}) {
  return (
    <>
      {splitByRanges(candidate, findSubsequenceRanges(candidate, query)).map((segment, index) =>
        segment.highlighted ? (
          <span
            key={index}
            className={cn(
              "text-highlight font-bold",
              active ? "text-white underline" : "group-hover:text-white group-hover:underline"
            )}
          >
            {segment.text}
          </span>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
    </>
  );
}
