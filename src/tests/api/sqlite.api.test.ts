import { describe, expect, it } from "vitest";

import { SqliteApi } from "@/api/sqlite.api";
import type { ApiTransport } from "@/types/core/transport";

function fakeTransport(resolve: (command: string) => unknown) {
  const calls: string[] = [];
  const transport: ApiTransport = {
    call: async <T>(command: string): Promise<T> => {
      calls.push(command);
      return resolve(command) as T;
    },
  };
  return { calls, transport };
}

const DATABASE = {
  id: "main",
  label: "Main",
  fileName: "app.sqlite3",
  available: true,
  sizeBytes: 10,
  tables: ["items"],
};

describe("SqliteApi", () => {
  it("validates the database list", async () => {
    const { calls, transport } = fakeTransport(() => [DATABASE]);
    const api = new SqliteApi({ transport });

    await expect(api.listDatabases()).resolves.toEqual([DATABASE]);
    expect(calls).toEqual(["list_sqlite_databases"]);
  });

  it("rejects a malformed database list", async () => {
    const { transport } = fakeTransport(() => [{ id: "main" }]);
    const api = new SqliteApi({ transport });

    await expect(api.listDatabases()).rejects.toThrow();
  });
});
