import { useCallback, useMemo, useRef } from "react";
import type { KeyboardEvent } from "react";

import { BackdropLayer } from "@/components/shared/autocomplete/backdrop.autocomplete";
import { Input } from "@/components/ui/input.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { HighlightToken } from "@/lib/highlight.utils";

const NO_SEGMENTS: HighlightToken[] = [];

function firstPrefixMatch(names: readonly string[], query: string): string {
  const trimmed = query.trim();
  if (trimmed.length === 0) return "";
  const lower = trimmed.toLowerCase();
  const match = names.find((name) => name.toLowerCase().startsWith(lower));
  return match !== undefined && match.length > query.length ? match : "";
}

export default function TorrentNameFilter({
  className,
  names,
  query,
  onQueryChange,
}: {
  className?: string;
  names: readonly string[];
  query: string;
  onQueryChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const backdropRef = useRef<HTMLDivElement>(null);
  const ghost = useMemo(() => firstPrefixMatch(names, query), [names, query]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (!ghost) return;
      const input = event.currentTarget;
      const caretAtEnd =
        input.selectionStart === query.length && input.selectionEnd === query.length;
      if (event.key === "Tab" && !event.ctrlKey && !event.shiftKey) {
        event.preventDefault();
        onQueryChange(ghost);
        return;
      }
      if (event.key === "ArrowRight" && caretAtEnd) {
        event.preventDefault();
        onQueryChange(ghost);
      }
    },
    [ghost, query, onQueryChange]
  );

  return (
    <div className={className}>
      <div className="relative w-32">
        <div className="bg-field pointer-events-none absolute inset-0 z-0" />
        <BackdropLayer
          currentValue={query}
          highlightSegments={NO_SEGMENTS}
          hasHighlight={false}
          ghostSuffix={ghost ? ghost.slice(query.length) : ""}
          backdropRef={backdropRef}
        />
        <Input
          className="relative z-10 bg-transparent font-bold"
          value={query}
          placeholder={t("torrent.filter.placeholder")}
          data-main-search
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
    </div>
  );
}
