import { createSignalStore } from "@/lib/core/signal.store";
import type { DiscordPresenceDetail } from "@/types/core/discord";

const store = createSignalStore();

const detail = store.atom<DiscordPresenceDetail | null>("presence.detail", null);
const search = store.atom<boolean>("presence.search", false);

export const presenceAtoms = { detail, search };

export function setPresenceDetail(value: DiscordPresenceDetail | null): void {
  detail.set(value);
}

export function setPresenceSearching(value: boolean): void {
  search.set(value);
}
