import { describe, expect, it } from "vitest";

import { SystemApi } from "@/api/system.api";
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

describe("SystemApi", () => {
  it("maps toast target to the backend action key", async () => {
    const { calls, transport } = fakeTransport();
    const api = new SystemApi({ transport });

    await api.showToast("title", "body", { source: "folder", path: "/tmp" });

    expect(calls).toEqual([
      {
        command: "show_toast",
        args: { action: { source: "folder", path: "/tmp" }, body: "body", title: "title" },
      },
    ]);
  });

  it("maps notification flags to snake_case config", async () => {
    const { calls, transport } = fakeTransport();
    const api = new SystemApi({ transport });

    await api.setNotificationSettings(true, false, true);

    expect(calls).toEqual([
      {
        command: "set_notification_settings",
        args: { config: { enabled: true, on_complete: false, on_error: true } },
      },
    ]);
  });
});
