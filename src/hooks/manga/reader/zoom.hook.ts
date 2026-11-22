import { useEffect } from "react";
import type { RefObject } from "react";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

export function useReaderZoomShortcuts(dialogRef: RefObject<HTMLDialogElement | null>) {
  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) return;
    const changeZoom = (delta: number) => {
      const current = settingsAtoms.mangaReaderZoom.get();
      const next = Math.min(200, Math.max(50, Math.round(current + delta)));

      if (next !== current) patchSettings({ mangaReaderZoom: next });
    };

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      changeZoom(event.deltaY < 0 ? 10 : -10);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey) return;

      if (event.key === "0") {
        event.preventDefault();
        patchSettings({ mangaReaderZoom: 100 });

        return;
      }

      const zoomIn = event.key === "+" || event.key === "=";
      const zoomOut = event.key === "-" || event.key === "_";

      if (!zoomIn && !zoomOut) return;
      event.preventDefault();
      changeZoom(zoomIn ? 10 : -10);
    };

    dialog.addEventListener("wheel", onWheel, { passive: false });
    dialog.addEventListener("keydown", onKeyDown, true);

    return () => {
      dialog.removeEventListener("wheel", onWheel);
      dialog.removeEventListener("keydown", onKeyDown, true);
    };
  }, [dialogRef]);
}
