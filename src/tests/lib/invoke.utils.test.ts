import { mockInvoke } from "@/tests/mocks";
import { describe, expect, it } from "vitest";
import * as z from "zod/mini";

import { invokeValidated } from "@/lib/core/system/invoke.utils";
import { IpcError } from "@/lib/core/system/ipcError.utils";

const StatusSchema = z.object({ id: z.number().check(z.gt(0)), name: z.string() });

async function invokeWith(impl: (command: string, args?: Record<string, unknown>) => unknown) {
  mockInvoke.mockImplementation(impl);
  return invokeValidated;
}

describe("invokeValidated contract", () => {
  it("returns the parsed payload when the shape matches", async () => {
    const invoke = await invokeWith(async () => ({ id: 7, name: "Souou" }));
    await expect(invoke("list_torrents", StatusSchema, { id: 1 })).resolves.toEqual({
      id: 7,
      name: "Souou",
    });
  });

  it("reports the failing path when the backend shape changed", async () => {
    const invoke = await invokeWith(async () => ({ id: "7", name: "Souou" }));
    await expect(invoke("list_torrents", StatusSchema, { id: 1 })).rejects.toThrow(/id/);
  });

  it("normalizes a rejected command into an IpcError", async () => {
    const invoke = await invokeWith(async () => {
      throw new Error("engine down");
    });
    await expect(invoke("list_torrents", StatusSchema)).rejects.toBeInstanceOf(IpcError);
    await expect(invoke("list_torrents", StatusSchema)).rejects.toThrow("engine down");
  });
});
