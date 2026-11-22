import { createSignalStore } from "@hullperse/hp_utils/signal";
import type { DiscordPresenceDetail, DiscordPresenceReading } from "@/types/core/discord";

const store = createSignalStore();

const detail = store.atom<DiscordPresenceDetail | null>("presence.detail", null);
const search = store.atom<boolean>("presence.search", false);

const reading = store.atom<DiscordPresenceReading | null>("presence.reading", null);

export const presenceAtoms = { detail, search, reading };

export function setPresenceDetail(value: DiscordPresenceDetail | null): void {
  detail.set(value);
}

export function setPresenceSearching(value: boolean): void {
  search.set(value);
}
