import { beforeEach, describe, expect, it } from "vitest";

import { CollectionApi, collectionApi } from "@/api/collection.api";
import type { ApiTransport } from "@/api/transport.api";

function fakeTransport(resolve: (command: string, args?: Record<string, unknown>) => unknown) {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const transport: ApiTransport = {
    call: async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
      calls.push({ command, args });
      return resolve(command, args) as T;
    },
  };
  return { calls, transport };
}

beforeEach(() => {});

describe("CollectionApi", () => {
  it("maps status order to orderIndex", async () => {
    const { calls, transport } = fakeTransport(() => undefined);
    const api = new CollectionApi({ transport });

    await api.upsertStatus({
      id: "watching",
      label: "Watching",
      color: "#fff",
      order: 3,
      isCore: true,
      kind: "private",
    });

    expect(calls).toEqual([
      {
        command: "upsert_collection_status",
        args: {
          status: {
            id: "watching",
            label: "Watching",
            color: "#fff",
            isCore: true,
            kind: "private",
            orderIndex: 3,
          },
        },
      },
    ]);
  });

  it("keeps a row payload untouched", async () => {
    const { calls, transport } = fakeTransport(() => undefined);
    const api = new CollectionApi({ transport });
    const row = {
      id: "s",
      label: "Shared",
      color: "#000",
      orderIndex: 9,
      isCore: false,
      kind: "public" as const,
    };

    await api.upsertStatusRow(row);

    expect(calls).toEqual([{ command: "upsert_collection_status", args: { status: row } }]);
  });

  it("sends the touch flag with the backend key", async () => {
    const { calls, transport } = fakeTransport(() => undefined);
    const api = new CollectionApi({ transport });

    await api.patchItem("a", { title: "T" }, true);

    expect(calls).toEqual([
      {
        command: "patch_collection_item",
        args: { id: "a", patch: { title: "T" }, touch_updated: true },
      },
    ]);
  });

  it("passes batch items through", async () => {
    const { calls, transport } = fakeTransport(() => ({ imported: 1, failed: [] }));
    const api = new CollectionApi({ transport });
    const items = [{ id: "a" }];

    const outcome = await api.importItemsBatch(items);

    expect(calls).toEqual([{ command: "import_collection_items_batch", args: { items } }]);
    expect(outcome).toEqual({ imported: 1, failed: [] });
  });

  it("exposes the shared singleton", () => {
    expect(collectionApi).toBeInstanceOf(CollectionApi);
  });
});
