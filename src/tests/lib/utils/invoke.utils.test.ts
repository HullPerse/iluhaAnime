import { afterEach, describe, expect, it, vi } from "vitest";
import * as z from "zod/mini";

import { err, ok } from "@/lib/utils/result.utils";

const StatusSchema = z.object({ id: z.number().check(z.gt(0)), name: z.string() });

async function invokeWith(impl: (command: string, args?: Record<string, unknown>) => unknown) {
  vi.resetModules();
  vi.doMock("@tauri-apps/api/core", () => ({ invoke: impl }));
  const { invokeValidated: validated } = await import("@/lib/utils/invoke.utils");
  return validated;
}

afterEach(() => {
  vi.doUnmock("@tauri-apps/api/core");
});

describe("invokeValidated contract", () => {
  it("returns the parsed payload when the shape matches", async () => {
    const invoke = await invokeWith(async () => ({ id: 7, name: "Souou" }));
    await expect(invoke("list_torrents", StatusSchema, { id: 1 })).resolves.toEqual(
      ok({ id: 7, name: "Souou" })
    );
  });

  it("reports the failing path when the backend shape changed", async () => {
    const invoke = await invokeWith(async () => ({ id: "7", name: "Souou" }));
    const result = await invoke("list_torrents", StatusSchema, { id: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("id");
  });

  it("turns a rejected command into a Result instead of throwing", async () => {
    const invoke = await invokeWith(async () => {
      throw new Error("engine down");
    });
    await expect(invoke("list_torrents", StatusSchema)).resolves.toEqual(
      err(new Error("engine down"))
    );
  });
});
