import { describe, expect, it } from "vitest";

import { GameApi } from "@/api/game.api";
import type { ApiTransport } from "@/types/transport";

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

describe("GameApi", () => {
  it("maps library commands onto the backend names", async () => {
    const { calls, transport } = fakeTransport();
    const api = new GameApi({ transport });

    await api.platforms();
    await api.listRoms();
    await api.readRom("sha1");
    await api.importRom({ path: "C:\\roms\\game.ch8", platform: "schip", name: "Game" });
    await api.importRom({ path: "C:\\roms\\other.ch8" });
    await api.deleteRom("sha1");

    expect(calls).toEqual([
      { command: "game_platforms", args: undefined },
      { command: "game_rom_list", args: undefined },
      { command: "game_rom_read", args: { id: "sha1" } },
      {
        command: "game_rom_import",
        args: { name: "Game", path: "C:\\roms\\game.ch8", platform: "schip" },
      },
      {
        command: "game_rom_import",
        args: { name: undefined, path: "C:\\roms\\other.ch8", platform: undefined },
      },
      { command: "game_rom_delete", args: { id: "sha1" } },
    ]);
  });

  it("maps store commands onto the backend names", async () => {
    const { calls, transport } = fakeTransport();
    const api = new GameApi({ transport });

    await api.storeEntries();
    await api.installStoreRom("snake");

    expect(calls).toEqual([
      { command: "game_store_list", args: undefined },
      { command: "game_store_install", args: { key: "snake" } },
    ]);
  });

  it("maps session commands onto the backend names", async () => {
    const { calls, transport } = fakeTransport();
    const api = new GameApi({ transport });

    await api.start("builtin:snake");
    await api.tick(7, 12, 1);
    await api.key(7, 0, true);
    await api.key(7, 0, false);
    await api.stop(7);

    expect(calls).toEqual([
      { command: "game_start", args: { id: "builtin:snake" } },
      { command: "game_tick", args: { cycles: 12, session: 7, timers: 1 } },
      { command: "game_key", args: { key: 0, pressed: true, session: 7 } },
      { command: "game_key", args: { key: 0, pressed: false, session: 7 } },
      { command: "game_stop", args: { session: 7 } },
    ]);
  });
});
