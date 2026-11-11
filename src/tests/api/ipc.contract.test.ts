import { describe, expect, it } from "vitest";

import ipcContractDocument from "../../../docs/codebase-audit/ipc-contract.md?raw";
import {
  formatIpcContract,
  parseIpcCommandContracts,
  type IpcCommandContract,
} from "@/lib/core/system/ipcContract.utils";

const ipcTypes = Object.values(
  import.meta.glob("../../types/core/ipc.d.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  })
)[0] as string;

const rustSources = import.meta.glob("../../../src-tauri/src/**/*.rs", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const commandUnion = (): string[] => {
  const names = new Set<string>();
  for (const match of ipcTypes.matchAll(/^\s+\| "([a-z_0-9]+)"/gm)) {
    names.add(match[1]);
  }
  return [...names].sort();
};

const contracts: IpcCommandContract[] = Object.entries(rustSources).flatMap(([path, source]) => {
  const module = path.split("/src/")[1]?.split("/")[0]?.replace(/\.rs$/, "") ?? "root";
  return parseIpcCommandContracts(source, module);
});

describe("IPC command contract", () => {
  it("covers the TypeScript command union exactly", () => {
    const rustNames = [...new Set(contracts.map((contract) => contract.name))].sort();

    expect(rustNames).toHaveLength(281);
    expect(rustNames).toEqual(commandUnion());
  });

  it("keeps the generated argument and result table current", () => {
    expect(ipcContractDocument).toBe(formatIpcContract(contracts));
  });

  it("records arguments and result shapes for every command", () => {
    for (const contract of contracts) {
      expect(contract.result.length, contract.name).toBeGreaterThan(0);
      expect(contract.args.every((arg) => arg.length > 0), contract.name).toBe(true);
    }
  });

  it("pins representative signatures across command families", () => {
    const byName = new Map(contracts.map((contract) => [contract.name, contract]));

    expect(byName.get("get_anilist_profile")?.args).toEqual(
      expect.arrayContaining(["user_id", "user_name", "proxy_url", "proxyUrl"])
    );
    expect(byName.get("get_anilist_profile")?.result).toBe("Result<AniUserProfile, String>");
    expect(byName.get("game_rom_list")?.result).toBe("Result<Vec<GameRomInfo>, String>");
    expect(byName.get("get_sqlite_rows")?.args).toEqual(
      expect.arrayContaining(["database", "table", "page"])
    );
    expect(byName.get("stream_prefs_get")?.result).toBe("Result<Option<StreamPrefs>, String>");
  });
});
