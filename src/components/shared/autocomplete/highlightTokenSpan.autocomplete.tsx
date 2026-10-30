import { memo } from "react";

import { spellSeverityOf } from "@/lib/search/spell.utils";
import type { HighlightToken } from "@/types/core/highlight";

const TOKEN_CLASS: Record<"error" | "warn" | "match", string> = {
  error: "text-text underline decoration-red-500 decoration-wavy underline-offset-2",
  warn: "text-text underline decoration-amber-500 decoration-wavy underline-offset-2",
  match: "bg-highlight text-title-text",
};

export const HighlightTokenSpan = memo(({ text, highlighted, kind }: HighlightToken) => {
  if (!highlighted) return <span className="text-text">{text}</span>;
  const severity = spellSeverityOf(kind);
  return (
    <span data-spell={severity} className={TOKEN_CLASS[severity ?? "match"]}>
      {text}
    </span>
  );
});
