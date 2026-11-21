import * as z from "zod/mini";
import { Channel } from "@tauri-apps/api/core";

import { invokeTyped, invokeValidated } from "@/lib/core/system/invoke.utils";
import { effectiveProxyUrl } from "@/lib/core/system/proxy.utils";
import { settingsAtoms } from "@/store/settings.store";

const searchHitSchema = z.object({
  id: z.string(),
  title: z.string(),
  cover: z.nullable(z.string()),
  status: z.optional(z.nullable(z.string())),
  chapters: z.optional(z.nullable(z.number())),
  suggestive: z.boolean(),
  rating: z.string(),
  aliases: z.array(z.string()),
  externalIds: z.object({ anilist: z.nullable(z.number()), mal: z.nullable(z.number()) }),
});

const searchPageSchema = z.compile(
  z.object({
    items: z.array(searchHitSchema),
    hasNext: z.boolean(),
  })
);

const searchMetaSchema = z.compile(z.array(z.object({ id: z.string(), chapters: z.number() })));

const chapterSchema = z.object({
  id: z.string(),
  number: z.string(),
  volume: z.nullable(z.string()),
  key: z.string(),
  title: z.nullable(z.string()),
  language: z.enum(["ru", "en"]),
  group: z.nullable(z.string()),
  locked: z.boolean(),
  lockReason: z.nullable(z.enum(["paid", "closed", "external"])),
  availableAt: z.nullable(z.string()),
  branch: z.nullable(z.number()),
});

const detailsShape = z.object({
  title: searchHitSchema,
  description: z.nullable(z.string()),
  authors: z.array(z.string()),
  artists: z.array(z.string()),
  authorKeys: z.optional(z.array(z.string())),
  artistKeys: z.optional(z.array(z.string())),
  genres: z.array(z.string()),
  release: z.nullable(z.string()),
  chapters: z.array(chapterSchema),
  notification: z.optional(
    z.object({
      newChapters: z.number(),
      statusChange: z.nullable(z.tuple([z.string(), z.string()])),
    })
  ),
});
const detailsSchema = z.compile(detailsShape);
const cachedDetailsSchema = z.compile(z.nullable(detailsShape));

export const mangaSources = [
  { id: "mangalib", name: "MangaLib", language: "RU" },
  { id: "mangadex", name: "MangaDex", language: "RU / EN" },
  { id: "readmanga", name: "ReadManga", language: "RU" },
  { id: "asurascans", name: "AsuraScans", language: "EN" },
] as const;

export type MangaSource = (typeof mangaSources)[number]["id"];
export type MangaPersonRole = "author" | "artist";
export interface MangaPersonSearch {
  name: string;
  role: MangaPersonRole;
  key?: string;
  source?: MangaSource;
}
export type MangaServer = "first" | "second" | "compressed";
export type MangaChapter = z.infer<typeof chapterSchema>;
export type MangaHit = z.infer<typeof searchHitSchema>;
export type MangaReaderInput = Pick<MangaChapter, "number" | "volume" | "branch"> & {
  source: MangaSource;
  mangaId: string;
  chapterId: string;
};

type LoadProgress = { loaded: number; total: number | null };
const manifestSchema = z.object({ key: z.string(), count: z.number() });
const pageCacheStatsSchema = z.compile(z.object({ bytes: z.number(), count: z.number() }));

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

interface PageTask {
  page: number;
  run: () => Promise<void>;
}

const pageQueues = new Map<string, { tasks: PageTask[]; running: boolean }>();

async function drainPageQueue(key: string, queue: { tasks: PageTask[]; running: boolean }) {
  while (queue.tasks.length > 0) {
    const task = queue.tasks.shift();
    if (!task) break;
    try {
      await task.run();
    } catch {}
  }
  queue.running = false;
  if (queue.tasks.length === 0 && pageQueues.get(key) === queue) pageQueues.delete(key);
}

function enqueueMangaPage<T>(key: string, page: number, run: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let queue = pageQueues.get(key);
    if (!queue) {
      queue = { tasks: [], running: false };
      pageQueues.set(key, queue);
    }
    const active = queue;
    active.tasks.push({
      page,
      run: () => Promise.resolve().then(run).then(resolve).catch(reject),
    });
    active.tasks.sort((left, right) => left.page - right.page);
    if (!active.running) {
      active.running = true;
      queueMicrotask(() => {
        drainPageQueue(key, active).catch(() => undefined);
      });
    }
  });
}

export function fetchMangaPage(
  key: string,
  page: number,
  onProgress?: (progress: LoadProgress) => void
): Promise<Blob> {
  return enqueueMangaPage(key, page, async () => {
    const progress = new Channel<LoadProgress>();
    if (onProgress) progress.onmessage = onProgress;
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

const sourceSchema = z.enum(["mangalib", "mangadex", "readmanga", "asurascans"]);
const sourceSettingsSchema = z.array(z.object({ id: sourceSchema, enabled: z.boolean() }));
const itemSchema = z.object({
  id: z.string(),
  source: sourceSchema,
  mangaId: z.string(),
  title: z.string(),
  cover: z.nullable(z.string()),
  rating: z.string(),
  status: z.string(),
  unread: z.number(),
  read: z.number(),
  updatedAt: z.number(),
  lastReadAt: z.nullable(z.number()),
  favourite: z.optional(z.boolean()),
});
const statusSchema = z.object({ id: z.string(), label: z.string(), color: z.string() });
const librarySchema = z.object({
  items: z.array(itemSchema),
  statuses: z.array(statusSchema),
});
const historySchema = z.array(
  z.object({
    itemId: z.string(),
    source: sourceSchema,
    mangaId: z.string(),
    title: z.string(),
    cover: z.optional(z.nullable(z.string())),
    rating: z.optional(z.string()),
    chapterKey: z.string(),
    chapterId: z.string(),
    openedAt: z.number(),
  })
);
const saveSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("saved") }),
  z.object({ kind: z.literal("duplicate"), item: itemSchema }),
]);
const readerStateSchema = z.object({
  id: z.string(),
  page: z.number(),
  scrollOffset: z.number(),
  readKeys: z.array(z.string()),
});
export type LibraryCopy = z.infer<typeof itemSchema>;
export type MangaStatus = z.infer<typeof statusSchema>;

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

export type MangaStatusChange =
  | { kind: "edit"; label: string; color: string | null }
  | { kind: "move"; up: boolean }
  | { kind: "moveTo"; target: string }
  | { kind: "delete" };

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
  return invokeValidated("manga_read_keys", z.array(z.string()), { source, mangaId });
}

export function setMangaChaptersRead(
  source: MangaSource,
  hit: MangaHit,
  keys: string[],
  read: boolean
) {
  return invokeValidated("manga_set_chapters_read", z.array(z.string()), {
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
