import { describe, expect, it } from "vitest";

import { SqliteApi, sqliteApi } from "@/api/sqlite.api";
import type { ApiTransport } from "@/api/transport.api";

function fakeTransport() {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const transport: ApiTransport = {
    call: async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
      calls.push({ command, args });
      return undefined as T;
    },
  };
  return { calls, transport };
}

describe("SqliteApi", () => {
  it("sends row paging with the backend keys", async () => {
    const { calls, transport } = fakeTransport();
    const api = new SqliteApi({ transport });

    await api.getRows("app", "items", {
      page: 2,
      pageSize: 50,
      filter: null,
      orderColumn: null,
      orderDirection: null,
    });

    expect(calls).toEqual([
      {
        command: "get_sqlite_rows",
        args: {
          database: "app",
          table: "items",
          page: 2,
          pageSize: 50,
          filter: null,
          orderColumn: null,
          orderDirection: null,
        },
      },
    ]);
  });

  it("sends nested key arrays for batch delete", async () => {
    const { calls, transport } = fakeTransport();
    const api = new SqliteApi({ transport });
    const keys = [
      ["a", "1"],
      ["b", "2"],
    ];

    await api.deleteRows("app", "items", keys);

    expect(calls).toEqual([
      { command: "delete_sqlite_rows", args: { database: "app", table: "items", keys } },
    ]);
  });

  it("sends backup keep default", async () => {
    const { calls, transport } = fakeTransport();
    const api = new SqliteApi({ transport });

    await api.backupDatabase("app");

    expect(calls).toEqual([
      { command: "backup_sqlite_database", args: { database: "app", keep: 5 } },
    ]);
  });

  it("exposes the shared singleton", () => {
    expect(sqliteApi).toBeInstanceOf(SqliteApi);
  });
});
