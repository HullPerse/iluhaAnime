import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

import {
  clearAppCache,
  deleteAppCache,
  readAppCache,
  writeAppCache,
} from "@/lib/app.cache";

beforeEach(() => {
  invokeMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("readAppCache", () => {
  it("parses the stored payload JSON", async () => {
    invokeMock.mockResolvedValue({
      expires_at: null,
      key: "folderTrees",
      namespace: "player",
      payload: '[{"path":"C:\\\\Anime"}]',
      updated_at: 1234,
    });

    const record = await readAppCache<{ path: string }[]>(
      "player",
      "folderTrees"
    );

    expect(invokeMock).toHaveBeenCalledWith("get_app_cache", {
      key: "folderTrees",
      namespace: "player",
    });
    expect(record).toEqual({
      expires_at: null,
      key: "folderTrees",
      namespace: "player",
      payload: [{ path: "C:\\Anime" }],
      updated_at: 1234,
    });
  });

  it("returns null when nothing is stored", async () => {
    invokeMock.mockResolvedValue(null);
    expect(await readAppCache("player", "missing")).toBeNull();
  });

  it("returns null when the native command is unavailable", async () => {
    invokeMock.mockRejectedValue(new Error("command not found"));
    expect(await readAppCache("player", "folderTrees")).toBeNull();
  });
});

describe("writeAppCache", () => {
  it("sends the payload as JSON and reports success", async () => {
    invokeMock.mockResolvedValue(undefined);

    const ok = await writeAppCache<{ n: number }>("search", "learning", {
      n: 5,
    });

    expect(invokeMock).toHaveBeenCalledWith("put_app_cache", {
      key: "learning",
      namespace: "search",
      payload: '{"n":5}',
      ttlSeconds: null,
    });
    expect(ok).toBe(true);
  });

  it("forwards the ttl", async () => {
    invokeMock.mockResolvedValue(undefined);
    await writeAppCache("search", "learning", { n: 1 }, 60);
    expect(invokeMock).toHaveBeenCalledWith("put_app_cache", {
      key: "learning",
      namespace: "search",
      payload: '{"n":1}',
      ttlSeconds: 60,
    });
  });

  it("reports failure when the command rejects", async () => {
    invokeMock.mockRejectedValue(new Error("write failed"));
    expect(await writeAppCache("search", "learning", { n: 1 })).toBe(false);
  });
});

describe("deleteAppCache and clearAppCache", () => {
  it("deletes a single key", async () => {
    invokeMock.mockResolvedValue(undefined);
    expect(await deleteAppCache("torrent", "lastSaveDir")).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("delete_app_cache", {
      key: "lastSaveDir",
      namespace: "torrent",
    });
  });

  it("clears without a namespace when none is given", async () => {
    invokeMock.mockResolvedValue(undefined);
    expect(await clearAppCache()).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("clear_app_cache", {
      namespace: null,
    });
  });

  it("clears a single namespace", async () => {
    invokeMock.mockResolvedValue(undefined);
    expect(await clearAppCache("player")).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("clear_app_cache", {
      namespace: "player",
    });
  });

  it("reports failure when the commands reject", async () => {
    invokeMock.mockRejectedValue(new Error("boom"));
    expect(await deleteAppCache("torrent", "x")).toBe(false);
    expect(await clearAppCache()).toBe(false);
  });
});
