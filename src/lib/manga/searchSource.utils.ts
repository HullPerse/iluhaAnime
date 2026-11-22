import type { MangaSource } from "@/api/manga.api";
import { mangaSearchPage as pageAtom, mangaSearchSource as sourceAtom } from "@/store/manga.store";

export function setSource(source: MangaSource | null, anchor: HTMLElement | null) {
  pageAtom.set(1);
  sourceAtom.set(source);
  anchor?.closest("[data-scroll-root]")?.scrollTo({ top: 0 });
}
