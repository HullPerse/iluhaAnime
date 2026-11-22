import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronsLeftRight,
  FileText,
  MousePointerClick,
  Rows3,
} from "lucide-react";

import type { MangaServer } from "@/api/manga.api";

export const readerModes = ["rtl", "ltr", "vertical", "strip", "book"] as const;
export const readerDisplays = ["paged", "strip", "book"] as const;
export const readerDirections = ["rtl", "ltr", "vertical"] as const;
export const readerTurns = ["edges", "buttons"] as const;
export const readerBackgrounds = ["black", "charcoal", "white", "sepia"] as const;
export const activeMangaServer: MangaServer = "compressed";
export const displayIcons = { paged: FileText, strip: Rows3, book: BookOpen } as const;
export const directionIcons = { rtl: ArrowLeft, ltr: ArrowRight, vertical: ArrowDown } as const;
export const turnIcons = { edges: MousePointerClick, buttons: ChevronsLeftRight } as const;
export const readerPalette: Record<string, { backgroundColor: string; color: string }> = {
  black: { backgroundColor: "#000000", color: "#ffffff" },
  charcoal: { backgroundColor: "#262626", color: "#ffffff" },
  white: { backgroundColor: "#ffffff", color: "#181818" },
  sepia: { backgroundColor: "#ede0c8", color: "#30251d" },
};
