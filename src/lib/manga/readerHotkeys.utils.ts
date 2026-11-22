import type { readerModes } from "@/config/manga/reader.config";
import { isTextEntryTarget } from "@/lib/core/hotkeys/filterHotkeys.utils";

export function ignoreReaderHotkey(event: KeyboardEvent, overlay: boolean, settings: boolean) {
  if (overlay) return true;

  return event.code !== "Escape" && (settings || isTextEntryTarget(event.target));
}

export function runReaderHotkey(
  action: string,
  options: {
    strip: boolean;
    mode: (typeof readerModes)[number];
    rtl: boolean;
    viewport: HTMLElement | null | undefined;
    step: (delta: number) => void;
  }
) {
  if (options.strip) {
    if (action !== "up" && action !== "down") return;
    options.viewport?.scrollBy(0, (action === "up" ? -1 : 1) * options.viewport.clientHeight * 0.8);

    return;
  }

  if (options.mode === "vertical") {
    if (action === "up" || action === "down") options.step(action === "up" ? -1 : 1);
  } else if (action === "left" || action === "right") {
    options.step((action === "left") === options.rtl ? 1 : -1);
  }
}
