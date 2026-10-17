import { useEffect, useRef } from "react";

import { KONAMI_CODES, KONAMI_TIMEOUT_MS } from "@/config/keyboard/sequence.config";
import { isTextEntryTarget } from "@/lib/hotkeys/filter.hotkeys";
import { subscribeSequence } from "@/lib/hotkeys/sequence.hotkeys";

export function useSecretCode(onMatch: () => void): void {
  const matchRef = useRef(onMatch);

  useEffect(() => {
    matchRef.current = onMatch;
  });

  useEffect(
    () =>
      subscribeSequence(window, {
        sequence: { codes: KONAMI_CODES, timeoutMs: KONAMI_TIMEOUT_MS },
        ignore: (event) => isTextEntryTarget(event.target),
        onMatch: () => matchRef.current(),
      }),
    []
  );
}
