import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { systemApi } from "@/api/system.api";
import OfflineBanner from "@/components/shared/network/offlineBanner.component";
import { networkAtoms, noteNetworkSuccess } from "@/lib/core/system/networkHealth.utils";
import { patchSettings } from "@/store/settings.store";

const probeNetwork = vi.fn(
  async (_anilistProxy: string | null, _animelibProxy: string | null) => true
);

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
}

beforeEach(() => {
  patchSettings({ language: "en" });
  noteNetworkSuccess();
  probeNetwork.mockClear();
  vi.spyOn(systemApi, "probeNetwork").mockImplementation(probeNetwork);
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
  setOnline(true);
});

describe("OfflineBanner", () => {
  it("says which local sections keep working", () => {
    setOnline(false);
    render(<OfflineBanner />);

    expect(screen.getByTestId("offline-banner")).toBeDefined();
    expect(
      screen.getByText(/Collection, Torrents, Player and Settings work offline/)
    ).toBeDefined();
    expect(screen.getByText(/Search, AniList and streaming/)).toBeDefined();
    expect(screen.queryByRole("button", { name: /Check again/ })).toBeNull();
  });

  it("stays out of the shell while the app is online", () => {
    setOnline(true);
    render(<OfflineBanner />);

    expect(screen.queryByTestId("offline-banner")).toBeNull();
  });

  it("reports dead traffic when the adapter still says online", async () => {
    setOnline(true);
    networkAtoms.reachable.set(false);
    render(<OfflineBanner />);

    expect(screen.getByText("The network is not answering")).toBeDefined();
    expect(screen.getByText(/Check the VPN or the proxy/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /Check again/ }));

    await waitFor(() => expect(screen.queryByTestId("offline-banner")).toBeNull());
    expect(probeNetwork).toHaveBeenCalledTimes(1);
  });

  it("keeps the warning when the probe also fails", async () => {
    probeNetwork.mockResolvedValueOnce(false);
    setOnline(true);
    networkAtoms.reachable.set(false);
    render(<OfflineBanner />);

    fireEvent.click(screen.getByRole("button", { name: /Check again/ }));

    await waitFor(() => expect(probeNetwork).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("offline-banner")).toBeDefined();
  });
});
