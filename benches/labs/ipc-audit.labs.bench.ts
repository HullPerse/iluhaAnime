import { bench, group } from "@pmndrs/labs";
// IPC audit pins per functionality: how many transport calls each hot
// scenario makes and how many bytes flow each way. Companions
// ipc-chatter (suggest/torrent ticks/files fan-out); this file covers the
// scenarios ipc-chatter misses: collection tab open, anilist detail open,
// torrent search submit, player open, suggest keystroke, host stats polling,
// tmdb rate polling. Scenarios call production command names and arg shapes
// directly (see collection.api.ts, anilist.api.ts, torrent.api.ts,
// playback.utils.ts, system.api.ts, tmdb.api.ts); importing the classes
// would pull transport.api.ts, whose module-level import.meta.env does not
// exist under the labs node worker. The counting transport replicates the
// production dedup shape (concurrent identical calls collapse via
// inflightFetch). Labs has no real Tauri here, so this pins frontend
// chattiness, not backend cost.
// Budget (measured 2026-10-11, Ryzen 7 5800X/node 26; run c2d1b75-dirty-3,
// clock drifted 3.24-4.34 GHz so us timings float run to run, invoke pins
// are exact): collection open pins exactly 3 invokes (5.3us); anilist
// detail open pins exactly 3 invokes (full+recommendations+franchise,
// 5.2us; characters seed from full, brief is a separate surface); bundled
// detail pins exactly 2 invokes (full+franchise, 3.3us); wizard save
// with an anilist id pins exactly 4 invokes (cover+characters+staff+upsert,
// 7.1us); torrent search submit pins exactly 3 invokes (5.2us); player open
// pins exactly 3 invokes (4.8us); suggest keystroke pins exactly 1 invoke
// (44B req, 1305B resp for 8 rows, 3.6us); 30 host stats ticks pin
// 30 invokes (no dedup, sequential polls, 42.8us); 6 tmdb rate polls pin
// 6 invokes (8.4us); anilist poll tick pins exactly 3 invokes
// (auth+minimal lists+notifications, once per 30min default, 4.9us).
// Regression threshold is labs minDelta 5% on
// bytes; invoke counts are exact pins.

import type { ApiTransport } from "../../src/types/core/transport";
import { inflightFetch } from "../../src/lib/core/lruCache.utils";

interface CallRecord {
  invokes: number;
  requestBytes: number;
  responseBytes: number;
}

function byteSize(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

export function createAuditTransport(
  handlers: Record<string, (args?: Record<string, unknown>) => unknown>
): { transport: ApiTransport; records: Map<string, CallRecord>; reset: () => void } {
  const records = new Map<string, CallRecord>();
  const inflight = new Map<string, Promise<unknown>>();
  const transport: ApiTransport = {
    call: <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
      const key = `${command}:${JSON.stringify(args ?? null)}`;
      return inflightFetch(inflight, key, () => {
        const response = handlers[command]?.(args) ?? null;
        const record = records.get(command) ?? { invokes: 0, requestBytes: 0, responseBytes: 0 };
        record.invokes += 1;
        record.requestBytes += byteSize(args ?? null);
        record.responseBytes += byteSize(response);
        records.set(command, record);
        return Promise.resolve(response as T);
      }) as Promise<T>;
    },
  };
  return {
    records,
    reset: () => {
      records.clear();
      inflight.clear();
    },
    transport,
  };
}

function totalInvokes(records: Map<string, CallRecord>): number {
  let sum = 0;
  for (const record of records.values()) sum += record.invokes;
  return sum;
}

function totals(records: Map<string, CallRecord>): number {
  let sum = 0;
  for (const record of records.values()) {
    sum += record.invokes * 1_000_000 + record.requestBytes + record.responseBytes;
  }
  return sum;
}

function auditHandlers(): Record<string, (args?: Record<string, unknown>) => unknown> {
  const indexRows = Array.from({ length: 60 }, (_, i) => ({
    id: `row-${i}`,
    ignoredCount: 0,
    kind: "anime",
    lastUsedAt: 1700000000000 + i,
    scope: "anime",
    selectedCount: 1,
    subtitle: `Subtitle ${i}`,
    useCount: 2,
    value: `Title ${i}`,
  }));
  return {
    get_anime_by_id: () => ({ id: 21, title: "Frieren" }),
    get_anime_full: () => ({ id: 21, episodes: 28 }),
    get_anime_characters: () => [{ id: 1, name: "Frieren" }],
    get_anime_recommendations: () => [{ id: 3, title: "Apothecary" }],
    get_anime_franchise: () => ({ nodes: 3 }),
    get_anime_staff: () => [{ id: 2, name: "Staff" }],
    download_remote_image: () => ({ id: "blob-1" }),
    upsert_collection_item: () => null,
    get_host_stats: () => ({
      cpuUsage: 12.5,
      memoryUsed: 1000,
      memoryTotal: 2000,
      netRxBps: 100,
      netTxBps: 50,
    }),
    check_anilist_auth: () => ({ id: 1, name: "user" }),
    get_anilist_lists: () => [{ name: "Watching", entries: [] }],
    get_anilist_notifications: () => [],
    get_tmdb_rate_limit: () => ({ remaining: 38, resetAt: 1700000000 }),
    get_torrent_details: () => ({ title: "Release", seeders: 10 }),
    get_video_card: () => ({ duration: 1420 }),
    list_collection_items: () => [
      { id: "c1", title: "Frieren" },
      { id: "c2", title: "Naruto" },
    ],
    list_collection_statuses: () => [{ id: "s1", label: "Watching" }],
    list_custom_field_defs: () => [{ id: "f1", label: "Rating" }],
    player_load_watch: () => null,
    player_open: () => ({ opened: true }),
    rutracker_get_magnet: () => "magnet:?xt=urn:btih:abc",
    search_nyaa: () => [{ title: "Release" }],
    search_unified_index: (args) =>
      indexRows.slice(0, Math.max(1, Math.min(indexRows.length, Number(args?.limit ?? 8)))),
  };
}

group("ipc-audit @ipc @quick", () => {
  bench("collection tab open (3 parallel)", function* collectionOpen() {
    const ctx = createAuditTransport(auditHandlers());
    const checksum = yield async () => {
      ctx.reset();
      const [items, defs, statuses] = await Promise.all([
        ctx.transport.call<unknown[]>("list_collection_items"),
        ctx.transport.call<unknown[]>("list_custom_field_defs"),
        ctx.transport.call<unknown[]>("list_collection_statuses"),
      ]);
      return (
        items.length +
        defs.length +
        statuses.length +
        totalInvokes(ctx.records) * 1000 +
        totals(ctx.records)
      );
    };
    return checksum;
  });

  bench("anilist detail open (3 calls)", function* anilistDetail() {
    const ctx = createAuditTransport(auditHandlers());
    const checksum = yield async () => {
      ctx.reset();
      const full = await ctx.transport.call<Record<string, unknown>>("get_anime_full", { id: 21 });
      const recs = await ctx.transport.call<unknown[]>("get_anime_recommendations", { id: 21 });
      const franchise = await ctx.transport.call<Record<string, unknown>>("get_anime_franchise", {
        id: 21,
        scope: "all",
      });
      return (
        Object.keys(full).length +
        recs.length +
        Object.keys(franchise).length +
        totalInvokes(ctx.records) * 1000 +
        totals(ctx.records)
      );
    };
    return checksum;
  });

  bench("anilist detail open bundled (2 calls)", function* anilistDetailBundled() {
    const ctx = createAuditTransport(auditHandlers());
    const checksum = yield async () => {
      ctx.reset();
      const full = await ctx.transport.call<Record<string, unknown>>("get_anime_full", { id: 21 });
      const franchise = await ctx.transport.call<Record<string, unknown>>("get_anime_franchise", {
        id: 21,
        scope: "all",
      });
      return (
        Object.keys(full).length +
        Object.keys(franchise).length +
        totalInvokes(ctx.records) * 1000 +
        totals(ctx.records)
      );
    };
    return checksum;
  });

  bench("wizard save with anilist id (4 calls)", function* wizardSave() {
    const ctx = createAuditTransport(auditHandlers());
    const checksum = yield async () => {
      ctx.reset();
      const cover = await ctx.transport.call<{ id: string }>("download_remote_image", {
        nameHint: "collection-cover",
        url: "https://cdn/cover.jpg",
      });
      const [chars, staff] = await Promise.all([
        ctx.transport.call<unknown[]>("get_anime_characters", { id: 21, page: 1 }),
        ctx.transport.call<unknown[]>("get_anime_staff", { id: 21 }),
      ]);
      await ctx.transport.call<null>("upsert_collection_item", { id: "c1" });
      return (
        cover.id.length +
        chars.length +
        staff.length +
        totalInvokes(ctx.records) * 1000 +
        totals(ctx.records)
      );
    };
    return checksum;
  });

  bench("torrent search submit (search+details+magnet)", function* torrentSubmit() {
    const ctx = createAuditTransport(auditHandlers());
    const checksum = yield async () => {
      ctx.reset();
      const results = await ctx.transport.call<unknown[]>("search_nyaa", { query: "frieren" });
      const details = await ctx.transport.call<Record<string, unknown>>("get_torrent_details", {
        source: "nyaa",
        url: "https://nyaa.si/view/1",
      });
      const magnet = await ctx.transport.call<string>("rutracker_get_magnet", { topicId: "1" });
      return (
        results.length +
        Object.keys(details).length +
        magnet.length +
        totalInvokes(ctx.records) * 1000 +
        totals(ctx.records)
      );
    };
    return checksum;
  });

  bench("player open file (open+watch+card)", function* playerOpen() {
    const ctx = createAuditTransport(auditHandlers());
    const checksum = yield async () => {
      ctx.reset();
      const opened = await ctx.transport.call<Record<string, unknown>>("player_open", {
        files: ["D:/video/ep01.mkv"],
      });
      const watch = await ctx.transport.call<unknown>("player_load_watch", {
        path: "D:/video/ep01.mkv",
      });
      const card = await ctx.transport.call<Record<string, unknown>>("get_video_card", {
        path: "D:/video/ep01.mkv",
      });
      return (
        Object.keys(opened).length +
        (watch === null ? 1 : 0) +
        Object.keys(card).length +
        totalInvokes(ctx.records) * 1000 +
        totals(ctx.records)
      );
    };
    return checksum;
  });

  bench("suggest keystroke settled (1 invoke)", function* suggestKeystroke() {
    const ctx = createAuditTransport(auditHandlers());
    const checksum = yield async () => {
      ctx.reset();
      const rows = await ctx.transport.call<unknown[]>("search_unified_index", {
        limit: 8,
        query: "friren",
        scope: "anime",
      });
      return rows.length + totalInvokes(ctx.records) * 1000 + totals(ctx.records);
    };
    return checksum;
  });

  bench("suggest keystroke settled pool=48 (1 invoke)", function* suggestKeystrokePool48() {
    const ctx = createAuditTransport(auditHandlers());
    const checksum = yield async () => {
      ctx.reset();
      const rows = await ctx.transport.call<unknown[]>("search_unified_index", {
        limit: 48,
        query: "friren",
        scope: "anime",
      });
      return rows.length + totalInvokes(ctx.records) * 1000 + totals(ctx.records);
    };
    return checksum;
  });

  bench("host stats tick x30 serial", function* hostStatsTicks() {
    const ctx = createAuditTransport(auditHandlers());
    const checksum = yield async () => {
      ctx.reset();
      let sum = 0;
      for (let i = 0; i < 30; i++) {
        const stats = await ctx.transport.call<Record<string, unknown>>("get_host_stats");
        sum += Object.keys(stats).length;
      }
      return sum + totalInvokes(ctx.records) * 1000 + totals(ctx.records);
    };
    return checksum;
  });

  bench("tmdb rate poll x6 serial", function* tmdbRatePolls() {
    const ctx = createAuditTransport(auditHandlers());
    const checksum = yield async () => {
      ctx.reset();
      let remaining = 0;
      for (let i = 0; i < 6; i++) {
        const rate = await ctx.transport.call<{ remaining: number }>("get_tmdb_rate_limit");
        remaining += rate.remaining;
      }
      return remaining + totalInvokes(ctx.records) * 1000 + totals(ctx.records);
    };
    return checksum;
  });

  bench("anilist poll tick (auth+lists+notifications)", function* pollTick() {
    const ctx = createAuditTransport(auditHandlers());
    const checksum = yield async () => {
      ctx.reset();
      const user = await ctx.transport.call<{ id: number }>("check_anilist_auth");
      const lists = await ctx.transport.call<unknown[]>("get_anilist_lists", {
        minimal: true,
        userId: user.id,
      });
      const notes = await ctx.transport.call<unknown[]>("get_anilist_notifications");
      return (
        user.id +
        lists.length +
        notes.length +
        totalInvokes(ctx.records) * 1000 +
        totals(ctx.records)
      );
    };
    return checksum;
  });
});
