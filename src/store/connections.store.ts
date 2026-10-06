import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { SavedConnection } from "@/types/lobby";

export interface ConnectionsState {
  connections: SavedConnection[];
  save: (connection: SavedConnection) => void;
  /** Empty titles are ignored. */
  rename: (endpointId: string, name: string) => void;
  remove: (endpointId: string) => void;
}

const byNewest = (a: SavedConnection, b: SavedConnection) =>
  b.savedAt - a.savedAt;

const mergeAddrs = (current: string[], incoming: string[]): string[] => [
  ...new Set([...incoming, ...current]),
];

/** Probes run live so stale never shows online. */
export const useConnectionsStore = create<ConnectionsState>()(
  persist(
    (set) => ({
      connections: [],
      save: (connection: SavedConnection) =>
        set((state) => {
          const existing = state.connections.find(
            (entry) => entry.endpointId === connection.endpointId
          );
          if (!existing) {
            return {
              connections: [connection, ...state.connections].sort(byNewest),
            };
          }
          const refreshed: SavedConnection = {
            ...connection,
            name: existing.name,
            addrs: mergeAddrs(existing.addrs, connection.addrs),
            nick: existing.nick ?? connection.nick,
          };
          return {
            connections: state.connections
              .map((entry) =>
                entry.endpointId === connection.endpointId
                  ? refreshed
                  : entry
              )
              .sort(byNewest),
          };
        }),
      rename: (endpointId: string, name: string) =>
        set((state) => {
          const title = name.trim();
          if (!title) {
            return state;
          }
          return {
            connections: state.connections.map((entry) =>
              entry.endpointId === endpointId ? { ...entry, name: title } : entry
            ),
          };
        }),
      remove: (endpointId: string) =>
        set((state) => ({
          connections: state.connections.filter(
            (entry) => entry.endpointId !== endpointId
          ),
        })),
    }),
    {
      name: "lobbyConnections",
      version: 1,
      partialize: (state) => ({ connections: state.connections }),
    }
  )
);
