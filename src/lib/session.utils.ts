import { useSettingsStore } from "@/store/settings.store";

export interface SessionConfigPayload {
  fastresume: boolean;
  ipv4Only: boolean;
  peerConnectTimeout: number;
  peerReadWriteTimeout: number;
  listenPort: number;
  enableUpnp: boolean;
  disablePersistence: boolean;
}

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
