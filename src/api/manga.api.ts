import { Channel } from "@tauri-apps/api/core";

import { invokeTyped, invokeValidated } from "@/lib/core/system/invoke.utils";
import { recordIpcCacheHit } from "@/lib/core/system/ipcStats.utils";
import { effectiveProxyUrl } from "@/lib/core/system/proxy.utils";
import { enqueueMangaPage } from "@/lib/manga/pageQueue.utils";
import {
  searchPageSchema,
  searchMetaSchema,
  detailsSchema,
  cachedDetailsSchema,
  manifestSchema,
  pageCacheStatsSchema,
  sourceSettingsSchema,
  librarySchema,
  historySchema,
  saveSchema,
  readerStateSchema,
  mangaReadKeysSchema,
} from "@/schemas/manga.schema";
import type {
  MangaHit,
  MangaReaderInput,
  LoadProgress,
  MangaStatusChange,
} from "@/types/manga/api";
import { settingsAtoms } from "@/store/settings.store";
import type { MangaPersonSearch, MangaServer, MangaSource } from "@/types/manga/source";

export { mangaSources } from "@/config/manga/sources.config";
export type {
  MangaPersonRole,
  MangaPersonSearch,
  MangaServer,
  MangaSource,
} from "@/types/manga/source";

function mangaTransport(source: MangaSource) {
  return {
    proxyUrl: effectiveProxyUrl(
      settingsAtoms.mangaSourceProxies.get()[source],
      settingsAtoms.mangaProxyUrl.get()
    ),
    mangaLibDomain: source === "mangalib" ? settingsAtoms.mangaLibRequestDomain.get() : undefined,
  };
}

export function openMangaChapter(chapter: MangaReaderInput, server?: MangaServer) {
  return invokeValidated("manga_reader_open", manifestSchema, {
    chapter: {
      ...chapter,
      ...mangaTransport(chapter.source),
      ...(chapter.source === "mangalib" && server ? { server } : {}),
    },
  });
}

export function fetchMangaPage(
  key: string,
  page: number,
  onProgress?: (progress: LoadProgress) => void
): Promise<Blob> {
  return enqueueMangaPage(key, page, async () => {
    const progress = new Channel<LoadProgress>();

    progress.onmessage = (message) => {
      if (message.cached) recordIpcCacheHit("manga_page_fetch");
      onProgress?.(message);
    };

    const bytes = await invokeTyped<unknown>("manga_page_fetch", { key, page, progress });

    if (!(bytes instanceof ArrayBuffer) || bytes.byteLength === 0) throw new Error("Invalid page");

    return new Blob([bytes]);
  });
}

export function getMangaPageCacheStats() {
  return invokeValidated("manga_page_cache_stats", pageCacheStatsSchema);
}

export function clearMangaPageCache() {
  return invokeTyped<number>("clear_manga_page_cache");
}

export async function fetchMangaCover(url: string) {
  const bytes = await invokeTyped<unknown>("manga_cover_fetch", {
    url,
    ...mangaTransport("mangalib"),
  });

  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength === 0) throw new Error("Invalid cover");

  return new Blob([bytes]);
}

export function searchManga(
  source: MangaSource,
  query: string,
  page: number,
  nsfw: boolean,
  person?: MangaPersonSearch | null
) {
  return invokeValidated("manga_search", searchPageSchema, {
    source,
    query,
    page,
    nsfw,
    person: person ?? null,
    ...mangaTransport(source),
  });
}

export function getMangaSearchMeta(source: MangaSource, ids: string[]) {
  return invokeValidated("manga_search_meta", searchMetaSchema, {
    source,
    ids,
    ...mangaTransport(source),
  });
}

export function getMangaCachedDetails(source: MangaSource, id: string) {
  return invokeValidated("manga_cached_details", cachedDetailsSchema, { source, id });
}

export function refreshMangaChapters(
  source: MangaSource,
  id: string,
  nsfw: boolean,
  background = false
) {
  return invokeValidated("manga_refresh_chapters", detailsSchema, {
    background,
    source,
    id,
    nsfw,
    ...mangaTransport(source),
  });
}

export const MANGA_UNASSIGNED_STATUS = "internal:unassigned";
export const mangaLibraryKey = ["manga", "library"] as const;
export const mangaHistoryKey = ["manga", "history"] as const;
export const mangaSourcesKey = ["manga", "sources"] as const;
export const mangaReadKeys = (source: MangaSource, mangaId: string) =>
  ["manga", "reads", source, mangaId] as const;

export function getMangaLibrary(nsfw: boolean) {
  return invokeValidated("manga_library", librarySchema, { nsfw });
}

export function getMangaSources() {
  return invokeValidated("manga_sources_list", sourceSettingsSchema);
}

export function setMangaSource(source: MangaSource, enabled: boolean) {
  return invokeTyped<unknown>("manga_source_enable", { source, enabled });
}

export function testMangaSourceProxy(source: MangaSource | null, proxyUrl: string) {
  return invokeTyped<string>("manga_source_test_proxy", {
    source,
    proxyUrl: proxyUrl.trim() || null,
    mangaLibDomain: source === "mangalib" ? settingsAtoms.mangaLibRequestDomain.get() : undefined,
  });
}

export function saveMangaCopy(input: {
  source: MangaSource;
  hit: MangaHit;
  status: string;
  unread: number;
  allowDuplicate: boolean;
}) {
  return invokeValidated("manga_library_save", saveSchema, {
    input: { ...input, id: crypto.randomUUID() },
  });
}

export function setMangaFavourite(id: string, favourite: boolean) {
  return invokeTyped<unknown>("manga_library_favourite", { id, favourite });
}

export function removeMangaCopy(id: string) {
  return invokeTyped<unknown>("manga_library_remove", { id });
}

export function createMangaStatus({ label, color }: { label: string; color: string }) {
  return invokeTyped<unknown>("manga_status_create", { label, color, id: crypto.randomUUID() });
}

export function manageMangaStatus(id: string, change: MangaStatusChange) {
  return invokeTyped<unknown>("manga_status_manage", { id, change });
}

export function getMangaHistory(nsfw: boolean) {
  return invokeValidated("manga_history_list", historySchema, { nsfw });
}

export function clearMangaHistory() {
  return invokeTyped<unknown>("manga_history_clear");
}

export function getMangaReads(source: MangaSource, mangaId: string) {
  return invokeValidated("manga_read_keys", mangaReadKeysSchema, { source, mangaId });
}

export function setMangaChaptersRead(
  source: MangaSource,
  hit: MangaHit,
  keys: string[],
  read: boolean
) {
  return invokeValidated("manga_set_chapters_read", mangaReadKeysSchema, {
    input: { source, hit, keys, read, id: crypto.randomUUID() },
  });
}

export function trackMangaOpen(input: {
  source: MangaSource;
  hit: MangaHit;
  chapterId: string;
  chapterKey: string;
}) {
  return invokeValidated("manga_track_open", readerStateSchema, {
    input: { ...input, id: crypto.randomUUID() },
  });
}

export function trackMangaPosition(input: {
  id: string;
  chapterId: string;
  chapterKey: string;
  page: number;
  pageCount: number;
  scrollOffset: number;
  mode: string;
  at: number;
  read: string[];
}) {
  return invokeTyped<unknown>("manga_track_position", { input });
}

export type {
  MangaChapter,
  MangaHit,
  MangaReaderInput,
  LibraryCopy,
  MangaStatus,
  MangaStatusChange,
} from "@/types/manga/api";
