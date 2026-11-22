import { describe, expect, it } from "vitest";

import {
  parseIpcCommandContracts,
  type IpcCommandContract,
} from "@/lib/core/system/ipcContract.utils";

const rustSources = import.meta.glob("../../../src-tauri/src/**/*.rs", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const contracts: IpcCommandContract[] = Object.values(rustSources).flatMap((source) =>
  parseIpcCommandContracts(source)
);

describe("IPC command contract", () => {
  it("pins representative signatures across command families", () => {
    const byName = new Map(contracts.map((contract) => [contract.name, contract]));

    expect(byName.get("get_anilist_profile")?.args).toEqual(
      expect.arrayContaining(["user_id", "user_name", "proxy_url", "proxyUrl"])
    );
    expect(byName.get("get_anilist_profile")?.result).toBe("Result<AniUserProfile, String>");
    expect(byName.get("game_rom_list")?.result).toBe("Result<Vec<GameRomInfo>, String>");
    expect(byName.get("stream_prefs_get")?.result).toBe("Result<Option<StreamPrefs>, String>");
  });
});
