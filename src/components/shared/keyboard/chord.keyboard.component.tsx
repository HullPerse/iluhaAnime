import { Fragment } from "react";

import { splitChordParts } from "@/lib/core/chordHotkeys.utils";

export function ChordChips({ chord }: { chord: string }) {
  const parts = splitChordParts(chord);
  if (!parts) {
    return (
      <span className="windows95-text shrink-0 text-xs whitespace-nowrap select-none">{chord}</span>
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-0.5">
      {parts.map((part, index) => (
        <Fragment key={`${part}-${index}`}>
          {index > 0 ? <span className="text-hint shrink-0 text-xs select-none">+</span> : null}
          <kbd className="windows95-active-border bg-primary text-text windows95-text shrink-0 px-1 text-xs whitespace-nowrap select-none">
            {part}
          </kbd>
        </Fragment>
      ))}
    </span>
  );
}
