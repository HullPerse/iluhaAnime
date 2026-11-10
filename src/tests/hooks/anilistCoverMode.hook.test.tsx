import { mockConvertFileSrc, mockInvoke as invokeMock } from "@/tests/mocks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { anilistApi } from "@/api/anilist.api";
import { useAnilistCoverModeSync } from "@/routes/components/anilist/user/data.user";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  convertFileSrc: mockConvertFileSrc,
}));

let client: QueryClient;

const wrapper = ({ children }: { children: ReactNode }) => {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
  patchSettings({ torrentCoverMode: "off", torrentCoverModeManual: false });
  vi.spyOn(anilistApi, "checkAuth").mockResolvedValue({ id: 7 } as never);
  vi.spyOn(anilistApi, "getLists").mockResolvedValue([]);
  vi.spyOn(anilistApi, "getFavouriteOverview").mockResolvedValue({
    anime: [],
    people: { characters: [], staff: [] },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  patchSettings({ torrentCoverMode: "off", torrentCoverModeManual: false });
});

describe("useAnilistCoverModeSync", () => {
  it("applies automatic full covers on startup with a saved session", async () => {
    renderHook(() => useAnilistCoverModeSync(), { wrapper });

    await waitFor(() => expect(settingsAtoms.torrentCoverMode.get()).toBe("full"));
  });

  it("keeps a manual cover mode on startup", async () => {
    patchSettings({ torrentCoverMode: "pages", torrentCoverModeManual: true });
    renderHook(() => useAnilistCoverModeSync(), { wrapper });

    await waitFor(() => expect(anilistApi.checkAuth).toHaveBeenCalled());
    expect(settingsAtoms.torrentCoverMode.get()).toBe("pages");
  });

  it("leaves covers off when there is no saved session", async () => {
    vi.spyOn(anilistApi, "checkAuth").mockResolvedValue(null);
    renderHook(() => useAnilistCoverModeSync(), { wrapper });

    await waitFor(() => expect(anilistApi.checkAuth).toHaveBeenCalled());
    expect(settingsAtoms.torrentCoverMode.get()).toBe("off");
  });
});
