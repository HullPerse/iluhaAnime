import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prefetchStreamConstants, usePrewarmStreamHistory } from "@/hooks/stream/catalog.hook";
import { queryKeys } from "@/lib/query/keys.utils";
import { settingsAtoms } from "@/store/settings.store";

const CONSTANTS = { types: [], genres: [], statuses: [], ageRatings: [] };

const api = vi.hoisted(() => ({
  constants: vi.fn(async () => ({ types: [], genres: [], statuses: [], ageRatings: [] })),
  historyRecent: vi.fn(async () => []),
}));

vi.mock("@/api/stream.api", () => ({ streamApi: api }));

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

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

  it("stays idle while the streaming tab is disabled", async () => {
    settingsAtoms.streamTabEnabled.set(false);

    renderHook(() => usePrewarmStreamHistory(true), { wrapper });
    await Promise.resolve();

    expect(api.historyRecent).not.toHaveBeenCalled();
  });
});

describe("prefetchStreamConstants", () => {
  it("loads the filter lists before the modal asks for them", async () => {
    await prefetchStreamConstants(client);

    expect(api.constants).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(queryKeys.streamConstants())).toEqual(CONSTANTS);
  });
});
