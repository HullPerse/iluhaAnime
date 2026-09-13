import { cn } from "cn";

import { splitHighlighted } from "@/lib/search/highlight.utils";

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
      {splitHighlighted(candidate, query).map((segment, index) =>
        segment.matched ? (
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
