import { describe, expect, it } from "vitest";

import { toSessionConfig } from "@/lib/settings/session.utils";
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
      torrentProxyUrl: "socks5://127.0.0.1:10808",
      fileOrder: "torrent",
    });

    expect(toSessionConfig()).toEqual({
      disablePersistence: true,
      enableUpnp: true,
      fastresume: false,
      fileOrder: "torrent",
      ipv4Only: true,
      listenPort: 51413,
      peerConnectTimeout: 45,
      peerReadWriteTimeout: 20,
      proxyUrl: "socks5://127.0.0.1:10808",
    });
  });

  it("sends a null proxy when the setting is unset", () => {
    useSettingsStore.setState({ torrentProxyUrl: null });

    expect(toSessionConfig().proxyUrl).toBe(null);
  });
});
