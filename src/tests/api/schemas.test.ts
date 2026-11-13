import { describe, expect, it } from "vitest";

import {
  AniListCollectionListSchema,
  AniMediaListSchema,
  AniMediaPageSchema,
  AniUserSchema,
  FollowingPageSchema,
} from "@/api/anilist.schema";
import {
  SqliteBackupListSchema,
  SqliteDatabaseListSchema,
  SqliteRowsPageSchemaCompiled,
  SqliteTableListSchema,
} from "@/api/sqlite.schema";
import { DatabaseStatusSchema, HostStatsSchema } from "@/api/system.schema";
import { SearchResultListSchema } from "@/api/search.schema";
import { SessionConfigSchema } from "@/api/settings.schema";
import { TorrentDetailsSchema, TorrentInfoListSchema } from "@/api/torrent.schema";


const TORRENT_INFO = {
  id: 1,
  name: "episode",
  info_hash: "abc",
  total_bytes: 10,
  progress_bytes: 5,
  state: "downloading",
  finished: false,
  save_dir: "D:/downloads",
  sequential_download: false,
};

describe("IPC response schemas", () => {
  it("accepts a torrent list and keeps extra fields", () => {
    const parsed = TorrentInfoListSchema.safeParse([{ ...TORRENT_INFO, extra: true }]);
    expect(parsed.success).toBe(true);
    expect(parsed.success && (parsed.data[0] as Record<string, unknown> | undefined)?.extra).toBe(
      true
    );
  });

  it("rejects a torrent without an info hash", () => {
    expect(TorrentInfoListSchema.safeParse([{ ...TORRENT_INFO, info_hash: undefined }]).success).toBe(
      false
    );
  });

  it("validates torrent details, search rows, and session config", () => {
    expect(
      TorrentDetailsSchema.safeParse({
        source: "nyaa",
        url: "https://example.test",
        title: "Episode",
        description: "",
        files: [{ name: "episode.mkv", size: "10 MB" }],
        screenshots: [],
      }).success
    ).toBe(true);
    expect(
      SearchResultListSchema.safeParse([
        {
          title: "Episode",
          magnet: "magnet:?xt=urn:btih:abc",
          torrent: "https://example.test/a.torrent",
          size: "10 MB",
          seeders: 1,
          leechers: 0,
          category: "anime",
          link: "https://example.test",
        },
      ]).success
    ).toBe(true);
    expect(
      SessionConfigSchema.safeParse({
        fastresume: true,
        ipv4Only: false,
        peerConnectTimeout: 30,
        peerReadWriteTimeout: 30,
        listenPort: 0,
        enableUpnp: true,
        dhtEnabled: true,
        disablePersistence: false,
        proxyUrl: null,
        fileOrder: "list",
      }).success
    ).toBe(true);
  });

  it("validates AniList list, media page, user, and following reads", () => {
    expect(AniMediaListSchema.safeParse([{ id: 1, title: "A", status: "FINISHED", genres: [] }]).success).toBe(true);
    expect(
      AniListCollectionListSchema.safeParse([
        {
          name: "Watching",
          entries: [
            {
              media: { id: 1, title: "A", status: "RELEASING", genres: [] },
              list_status: "CURRENT",
              custom_lists: [],
            },
          ],
        },
      ]).success
    ).toBe(true);
    expect(AniMediaPageSchema.safeParse({ media: [], total: 0 }).success).toBe(true);
    expect(AniUserSchema.safeParse({ id: 1, name: "u" }).success).toBe(true);
    expect(
      FollowingPageSchema.safeParse({ users: [], has_next_page: false }).success
    ).toBe(true);
  });

  it("validates SQLite browser and system reads", () => {
    expect(
      SqliteDatabaseListSchema.safeParse([
        { id: "main", label: "Main", fileName: "app.sqlite3", available: true, sizeBytes: 1, tables: [] },
      ]).success
    ).toBe(true);
    expect(
      SqliteTableListSchema.safeParse([
        {
          name: "items",
          rowCount: 1,
          columns: [
            { name: "id", dataType: "TEXT", notNull: true, primaryKey: true, isImage: false },
          ],
        },
      ]).success
    ).toBe(true);
    expect(
      SqliteRowsPageSchemaCompiled.safeParse({
        database: "main",
        table: "items",
        columns: ["id"],
        rows: [["a"]],
        total: 1,
        page: 1,
        pageSize: 50,
      }).success
    ).toBe(true);
    expect(SqliteBackupListSchema.safeParse([]).success).toBe(true);
    expect(
      DatabaseStatusSchema.safeParse({ ok: true, version: 1, dataDir: "C:/app", error: null }).success
    ).toBe(true);
    expect(
      HostStatsSchema.safeParse({
        cpuUsage: 1,
        memoryUsed: 2,
        memoryTotal: 3,
        netRxBps: 4,
        netTxBps: 5,
      }).success
    ).toBe(true);
  });
});
