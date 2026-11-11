import { describe, expect, it } from "vitest";

import {
  IpcError,
  ipcErrorCode,
  normalizeIpcError,
} from "@/lib/core/system/ipcError.utils";

describe("ipc error envelope", () => {
  it("keeps the stable code from an object envelope", () => {
    const error = normalizeIpcError({ code: "io_error", message: "disk unavailable" });
    expect(error).toBeInstanceOf(IpcError);
    expect(error.code).toBe("io_error");
    expect(error.message).toBe("disk unavailable");
  });

  it("parses a JSON-encoded envelope", () => {
    const error = normalizeIpcError('{"code":"torrent_gone","message":"removed"}');
    expect(error.code).toBe("torrent_gone");
    expect(error.message).toBe("removed");
    expect(ipcErrorCode(error)).toBe("torrent_gone");
  });

  it("falls back to plain text without inventing a code", () => {
    const error = normalizeIpcError("network down");
    expect(error.code).toBeNull();
    expect(error.message).toBe("network down");
    expect(ipcErrorCode("network down")).toBeNull();
  });

  it("preserves an existing Error message", () => {
    const error = normalizeIpcError(new Error("boom"));
    expect(error).toBeInstanceOf(IpcError);
    expect(error.message).toBe("boom");
  });
});
