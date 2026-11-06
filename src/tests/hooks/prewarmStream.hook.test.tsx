import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prefetchStreamConstants, usePrewarmStreamHistory } from "@/hooks/stream/catalog.hook";
import { queryKeys } from "@/lib/core/hotkeys/keys.utils";
import { settingsAtoms } from "@/store/settings.store";

const CONSTANTS = { types: [], genres: [], statuses: [], ageRatings: [] };

const api = vi.hoisted(() => ({
  constants: vi.fn(async () => ({ types: [], genres: [], statuses: [], ageRatings: [] })),
  historyRecent: vi.fn(async () => []),
}));

vi.mock("@/api/stream.api", () => ({ streamApi: api }));

let client: QueryClient;

const wrapper = ({ children }: { children: ReactNode }) => {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  client = new QueryClient();
  settingsAtoms.streamTabEnabled.set(true);
  api.constants.mockClear();
  api.historyRecent.mockClear();
});

afterEach(() => {
  cleanup();
  client.clear();
});

describe("usePrewarmStreamHistory", () => {
  it("reads the recent rows once the app is usable", async () => {
    const { rerender } = renderHook(
      ({ ready }: { ready: boolean }) => usePrewarmStreamHistory(ready),
      { wrapper, initialProps: { ready: false } }
    );

    expect(api.historyRecent).not.toHaveBeenCalled();

    rerender({ ready: true });

    await waitFor(() => expect(api.historyRecent).toHaveBeenCalledTimes(1));
    expect(client.getQueryData(queryKeys.streamHistoryRecent())).toEqual([]);
  });

  it("stays idle while the streaming tab is disabled and starts once it is enabled", async () => {
    settingsAtoms.streamTabEnabled.set(false);

    const { rerender } = renderHook(() => usePrewarmStreamHistory(true), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });

    expect(api.historyRecent).not.toHaveBeenCalled();

    settingsAtoms.streamTabEnabled.set(true);
    rerender();

    await waitFor(() => expect(api.historyRecent).toHaveBeenCalledTimes(1));
  });
});

describe("prefetchStreamConstants", () => {
  it("loads the filter lists before the modal asks for them", async () => {
    await prefetchStreamConstants(client);

    expect(api.constants).toHaveBeenCalledTimes(1);
    const state = client.getQueryState(queryKeys.streamConstants());
    expect(state?.status).toBe("success");
    expect(state?.data).toEqual(CONSTANTS);
    expect(state?.dataUpdatedAt).toBeGreaterThan(0);
  });
});
