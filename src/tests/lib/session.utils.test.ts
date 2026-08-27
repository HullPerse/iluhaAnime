import { describe, expect, it } from "vitest";

import { toSessionConfig } from "@/lib/session.utils";
import { useSettingsStore } from "@/store/settings.store";

describe("toSessionConfig", () => {
  it("maps the current settings into a session payload", () => {
    useSettingsStore.setState({
      disablePersistence: true,
      enableUpnp: true,
      fastresumeEnabled: false,
      ipv4Only: true,
      listenPort: 51413,
      peerConnectTimeout: 45,
      peerReadWriteTimeout: 20,
    });

    expect(toSessionConfig()).toEqual({
      disablePersistence: true,
      enableUpnp: true,
      fastresume: false,
      ipv4Only: true,
      listenPort: 51413,
      peerConnectTimeout: 45,
      peerReadWriteTimeout: 20,
    });
  });
});
