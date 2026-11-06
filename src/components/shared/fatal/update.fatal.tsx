import type { CSSProperties } from "react";

import type { FatalTexts } from "@/types/core/fatal";
import type { FatalUpdateState } from "@/types/core/shared.fatal";

const MAX_ERROR_CHARS = 160;

function trimmedError(error: string | null): string {
  if (!error) return "";
  return error.length > MAX_ERROR_CHARS ? `${error.slice(0, MAX_ERROR_CHARS)}...` : error;
}

export function FatalUpdateButton({
  texts,
  state,
  error,
  onCheck,
  className,
  noteClassName,
  style,
}: {
  texts: FatalTexts;
  state: FatalUpdateState;
  error: string | null;
  onCheck: () => void;
  className: string;
  noteClassName: string;
  style?: CSSProperties;
}) {
  const busy = state === "checking" || state === "installing";
  let label = texts.checkUpdate;
  if (state === "checking") label = texts.checkingUpdate;
  else if (state === "installing") label = texts.installingUpdate;

  let note: string | null = null;
  if (state === "latest") note = texts.updateLatest;
  else if (state === "error") note = `${texts.updateFailed}: ${trimmedError(error)}`;

  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onCheck}
        disabled={busy}
        aria-busy={busy}
        className={className}
        style={style}
      >
        {label}
      </button>
      {note !== null && <span className={noteClassName}>{note}</span>}
    </span>
  );
}
