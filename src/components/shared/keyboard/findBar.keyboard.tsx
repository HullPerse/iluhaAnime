import { useEffect, useRef, useState } from "react";

import { useResolvedHotkeys } from "@/hooks/hotkeys.hook";
import { useCell } from "@/lib/core/signal.hook";
import { closeFindBar, findBarAtoms, openFindBar } from "@/store/findBar.store";
import { registerOverlay } from "@/store/overlay.store";

import { FindPanel } from "@/components/shared/keyboard/findBar/findPanel.findBar";

const VIRTUAL_LIST_SELECTOR = "[data-virtual-list]";

export default function PageFindBar() {
  const bar = useCell(findBarAtoms.bar);
  const restoreRef = useRef<HTMLElement | null>(null);
  const [virtualOnly, setVirtualOnly] = useState<boolean>(false);

  useResolvedHotkeys<"open-find">(
    [{ id: "open-find", chord: "ctrl+KeyF", repeat: "once", keybindId: "page.find" }],
    {
      onAction: (_id, event) => {
        if (findBarAtoms.bar.get().open) {
          document.querySelector<HTMLElement>("[data-find-bar] input")?.focus();
          return;
        }
        const target = event.target instanceof HTMLElement ? event.target : null;
        restoreRef.current = target;
        setVirtualOnly(target?.closest(VIRTUAL_LIST_SELECTOR) !== null);
        openFindBar();
      },
    }
  );

  useEffect(() => {
    if (!bar.open) return undefined;
    return registerOverlay(() => {
      restoreRef.current?.focus();
      closeFindBar();
    });
  }, [bar.open]);

  if (!bar.open) return null;
  return <FindPanel virtualOnly={virtualOnly} />;
}
