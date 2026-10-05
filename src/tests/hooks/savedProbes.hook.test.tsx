import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { sessionApi } from "@/api/session.api";
import { useSavedProbes } from "@/hooks/session/probe.hook";
import type { SavedConnection } from "@/types/lobby";

vi.mock("@/api/session.api", () => ({
  sessionApi: {
    probe: vi.fn(),
  },
}));

const connections: SavedConnection[] = [
  {
    addrs: ["10.0.0.1:443"],
    endpointId: "ep-online",
    name: "Alice's room",
    nick: "Alice",
    savedAt: 1_000,
    sessionId: "a1b2c3d4e5f60718",
    token: "0123456789abcdef0123456789abcdef",
  },
  {
    addrs: [],
    endpointId: "ep-offline",
    name: "Bob's room",
    nick: "Bob",
    savedAt: 2_000,
    sessionId: "a1b2c3d4e5f60718",
    token: "0123456789abcdef0123456789abcdef",
  },
];

function renderProbes() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useSavedProbes(connections), { wrapper });
}

describe("useSavedProbes", () => {
  it("probes every entry in one pass and keys results by endpoint id", async () => {
    vi.mocked(sessionApi.probe).mockImplementation(async (endpointId) => {
      if (endpointId === "ep-online") {
        return { online: true, rttMs: 12 };
      }
      throw new Error("dial timed out");
    });

    const { result } = renderProbes();

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({
      "ep-offline": { online: false, rttMs: null },
      "ep-online": { online: true, rttMs: 12 },
    });
    expect(vi.mocked(sessionApi.probe)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sessionApi.probe)).toHaveBeenCalledWith("ep-online", [
      "10.0.0.1:443",
    ]);
  });
});
