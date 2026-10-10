import { bench, group } from "@pmndrs/labs";
// IPC chattiness alongside timing benches: how many transport calls each
// hot scenario makes and how many bytes flow each way. Api classes are
// verbatim forwards, so scenarios call the same command names and arg
// shapes directly (see collection.api.ts searchUnifiedIndex and
// torrent.api.ts listTorrents); importing the classes would pull
// transport.api.ts, whose module-level import.meta.env does not exist
// under the labs node worker. The counting transport replicates the
// production dedup shape (concurrent identical calls collapse via
// inflightFetch), except the 4KB prod dedup bypass, which never triggers
// on these small args. Labs has no real Tauri here, so this pins
// frontend chattiness, not backend cost.
// Budget (measured 2026-10-08, Ryzen 7 5800X/node 26): suggest 5 queries
// pin exactly 5 invokes (222B req, 6.5KB resp for 8 rows); 30 serial
// ticks pin 30 invokes; 8 concurrent ticks pin 1 invoke (dedup); one
// 50-row torrent list is 26.4KB response (793KB per 30 ticks); a page of
// 20 torrents fetches files per id - 20 invokes / 56KB per cycle, no dedup
// possible because every id is a distinct key; the batched command sends
// one invoke with the same 56KB (batching cuts call count, not bytes).
// Concurrent equals serial in bytes; the cost is the per-cycle fan-out,
// not the shape.
// Regression threshold is labs minDelta 5% on bytes; invoke counts are
// exact pins.

import type { ApiTransport } from "../../src/api/transport.api";
import { inflightFetch } from "../../src/lib/utils/lruCache.utils";
import type { UnifiedIndexRow } from "../../src/types/search";
import type { TorrentInfo } from "../../src/types/torrent";

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

export function createCountingTransport(
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

function totals(records: Map<string, CallRecord>): number {
  let sum = 0;
  for (const record of records.values()) {
    sum += record.invokes * 1_000_000 + record.requestBytes + record.responseBytes;
  }
  return sum;
}

function invokes(records: Map<string, CallRecord>, command: string): number {
  return records.get(command)?.invokes ?? 0;
}

export function makeIndexRows(): UnifiedIndexRow[] {
  const rows: UnifiedIndexRow[] = [];
  for (let i = 0; i < 8; i++) {
    rows.push({
      id: `row-${i}`,
      ignoredCount: 0,
      kind: "anime",
      lastUsedAt: 1700000000000 + i,
      scope: "anime",
      selectedCount: 1,
      subtitle: `Subtitle ${i}`,
      useCount: 2,
      value: `Title ${i}`,
    });
  }
  return rows;
}

export function makeTorrents(count: number): TorrentInfo[] {
  const out: TorrentInfo[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      download_order: [],
      download_speed: 1_000_000 + i,
      error: null,
      eta_secs: 60,
      external_changed_files: [],
      external_changes: false,
      finished: false,
      id: i,
      info_hash: `${i.toString(16).padStart(40, "0")}`,
      missing_files: false,
      name: `[Group] Show Name S01E${String((i % 148) + 1).padStart(3, "0")} [1080p].mkv`,
      peers_connected: 5,
      progress: 0.5,
      progress_bytes: 700_000_000,
      save_dir: "D:/downloads",
      sequential_download: false,
      sequential_file: null,
      share_ratio: 1.2,
      state: "downloading",
      total_bytes: 1_400_000_000,
      upload_speed: 100_000,
      uploaded_bytes: 800_000_000,
    });
  }
  return out;
}

const INDEX_ROWS = makeIndexRows();
const TORRENTS_50 = makeTorrents(50);
export const QUERIES = ["friren", "naruto ship", "attack", "one", "steins"];

function handlers(): Record<string, (args?: Record<string, unknown>) => unknown> {
  const fileTrees: Record<number, unknown> = {};
  for (let id = 0; id < 20; id++) {
    const files: Array<Record<string, unknown>> = [];
    for (let f = 0; f < 20; f++) {
      files.push({
        completed: f % 2 === 0,
        exists: true,
        index: f,
        name: `[Group] Release S01E${String(f + 1).padStart(3, "0")} [1080p].mkv`,
        priority: "normal",
        progress_bytes: f * 70_000_000,
        selected: true,
        size: 1_400_000_000,
      });
    }
    fileTrees[id] = files;
  }
  return {
    get_running_torrent_files: (args) => fileTrees[Number(args?.id ?? 0)] ?? [],
    get_running_torrent_files_batch: (args) => {
      const ids = Array.isArray(args?.ids) ? (args.ids as number[]) : [];
      return ids.map((id) => ({ files: fileTrees[id] ?? [], id }));
    },
    list_torrents: () => TORRENTS_50,
    search_unified_index: () => INDEX_ROWS,
  };
}

group("ipc-chatter @ipc @quick", () => {
  bench("suggest 5 settled queries", function* suggestQueries() {
    const ctx = createCountingTransport(handlers());
    const checksum = yield async () => {
      ctx.reset();
      let rows = 0;
      for (const query of QUERIES) {
        const result = await ctx.transport.call<UnifiedIndexRow[]>("search_unified_index", {
          limit: 8,
          query,
          scope: "anime",
        });
        rows += result.length;
      }
      return rows + invokes(ctx.records, "search_unified_index") * 1000 + totals(ctx.records);
    };
    return checksum;
  });

  bench("torrent tick x30 serial", function* serialTicks() {
    const ctx = createCountingTransport(handlers());
    const checksum = yield async () => {
      ctx.reset();
      let rows = 0;
      for (let i = 0; i < 30; i++) {
        const batch = await ctx.transport.call<TorrentInfo[]>("list_torrents");
        rows += batch.length;
      }
      return rows + invokes(ctx.records, "list_torrents") * 1000 + totals(ctx.records);
    };
    return checksum;
  });

  bench("torrent tick x8 concurrent (dedup pin)", function* concurrentTicks() {
    const ctx = createCountingTransport(handlers());
    const checksum = yield async () => {
      ctx.reset();
      const results = await Promise.all(
        Array.from({ length: 8 }, () => ctx.transport.call<TorrentInfo[]>("list_torrents"))
      );
      return results.length + invokes(ctx.records, "list_torrents") * 1000 + totals(ctx.records);
    };
    return checksum;
  });

  bench("torrent list 50 rows payload bytes", function* listPayload() {
    const ctx = createCountingTransport(handlers());
    const checksum = yield async () => {
      ctx.reset();
      const rows = await ctx.transport.call<TorrentInfo[]>("list_torrents");
      return rows.length + totals(ctx.records);
    };
    return checksum;
  });

  bench("files page x20 (per-id fan-out)", function* filesFanOut() {
    const ctx = createCountingTransport(handlers());
    const checksum = yield async () => {
      ctx.reset();
      let count = 0;
      for (let id = 0; id < 20; id++) {
        const files = await ctx.transport.call<Array<Record<string, unknown>>>(
          "get_running_torrent_files",
          { id }
        );
        count += files.length;
      }
      return count + invokes(ctx.records, "get_running_torrent_files") * 1000 + totals(ctx.records);
    };
    return checksum;
  });

  bench("files page x20 concurrent (poll shape)", function* filesConcurrent() {
    const ctx = createCountingTransport(handlers());
    const checksum = yield async () => {
      ctx.reset();
      const batches = await Promise.all(
        Array.from({ length: 20 }, (_, id) =>
          ctx.transport.call<Array<Record<string, unknown>>>("get_running_torrent_files", { id })
        )
      );
      const count = batches.reduce((sum, files) => sum + files.length, 0);
      return count + invokes(ctx.records, "get_running_torrent_files") * 1000 + totals(ctx.records);
    };
    return checksum;
  });

  bench("files page x20 batched (after)", function* filesBatched() {
    const ctx = createCountingTransport(handlers());
    const checksum = yield async () => {
      ctx.reset();
      const entries = await ctx.transport.call<Array<{ id: number; files: unknown[] | null }>>(
        "get_running_torrent_files_batch",
        { ids: Array.from({ length: 20 }, (_, id) => id) }
      );
      const count = entries.reduce((sum, entry) => sum + (entry.files?.length ?? 0), 0);
      return (
        count +
        invokes(ctx.records, "get_running_torrent_files_batch") * 1000 +
        totals(ctx.records)
      );
    };
    return checksum;
  });
});
