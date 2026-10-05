import { beforeEach, describe, expect, it } from "vitest";

import { useConnectionsStore } from "@/store/connections.store";
import type { SavedConnection } from "@/types/lobby";

function entry(endpointId: string, overrides: Partial<SavedConnection> = {}): SavedConnection {
  return {
    endpointId,
    sessionId: "a1b2c3d4e5f60718",
    token: "0123456789abcdef0123456789abcdef",
    name: "Alice's room",
    nick: "Alice",
    addrs: [],
    savedAt: 1_000,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  useConnectionsStore.setState({ connections: [] });
});

describe("connections store", () => {
  it("inserts new entries newest first", () => {
    useConnectionsStore.getState().save(entry("ep-new", { savedAt: 2_000 }));
    useConnectionsStore.getState().save(entry("ep-old", { savedAt: 1_000 }));

    expect(useConnectionsStore.getState().connections.map((c) => c.endpointId)).toEqual([
      "ep-new",
      "ep-old",
    ]);
  });

  it("refreshes an entry: keeps the user title, merges addrs, dedupes", () => {
    useConnectionsStore.getState().save(entry("ep", { name: "Custom", addrs: ["10.0.0.1:443"] }));
    useConnectionsStore.getState().save(
      entry("ep", { name: "Observed", nick: "Bob", addrs: ["10.0.0.2:443", "10.0.0.1:443"] })
    );

    const [only] = useConnectionsStore.getState().connections;
    expect(only.name).toBe("Custom");
    expect(only.nick).toBe("Alice");
    expect(only.addrs).toEqual(["10.0.0.2:443", "10.0.0.1:443"]);
    expect(useConnectionsStore.getState().connections).toHaveLength(1);
  });

  it("renames an entry and ignores blank titles", () => {
    useConnectionsStore.getState().save(entry("ep"));
    useConnectionsStore.getState().rename("ep", "  ");
    expect(useConnectionsStore.getState().connections[0].name).toBe("Alice's room");
    useConnectionsStore.getState().rename("ep", "  New title  ");
    expect(useConnectionsStore.getState().connections[0].name).toBe("New title");
  });

  it("removes an entry", () => {
    useConnectionsStore.getState().save(entry("ep-a"));
    useConnectionsStore.getState().save(entry("ep-b"));
    useConnectionsStore.getState().remove("ep-a");

    expect(useConnectionsStore.getState().connections.map((c) => c.endpointId)).toEqual(["ep-b"]);
  });

  it("persists only the address book to localStorage", () => {
    useConnectionsStore.getState().save(entry("ep"));
    const raw = localStorage.getItem("lobbyConnections");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed.state.connections).toHaveLength(1);
  });
});
