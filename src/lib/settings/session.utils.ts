import { useSettingsStore } from "@/store/settings.store";
import type { SessionConfigPayload } from "@/types/settings";

export function toSessionConfig(): SessionConfigPayload {
  const s = useSettingsStore.getState();
  return {
    fastresume: s.fastresumeEnabled,
    ipv4Only: s.ipv4Only,
    peerConnectTimeout: s.peerConnectTimeout,
    peerReadWriteTimeout: s.peerReadWriteTimeout,
    listenPort: s.listenPort,
    enableUpnp: s.enableUpnp,
    disablePersistence: s.disablePersistence,
  };
}
