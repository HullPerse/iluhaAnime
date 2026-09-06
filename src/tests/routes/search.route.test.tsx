import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QUERY_CONFIG } from "@/config/store/query.config";
import SearchRoute from "@/routes/search.route";
import { useSearchStore } from "@/store/search.store";
import { useSettingsStore } from "@/store/settings.store";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

function renderRoute() {
  const queryClient = new QueryClient(QUERY_CONFIG);
  return render(
    <QueryClientProvider client={queryClient}>
      <SearchRoute />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockImplementation((cmd: unknown) => {
    if (typeof cmd === "string" && cmd.startsWith("check_")) return Promise.resolve(false);
    if (typeof cmd === "string" && cmd.startsWith("search_")) return Promise.resolve([]);
    return Promise.resolve(null);
  });
  useSettingsStore.setState({ searchProxyUrls: {} });
  useSearchStore.setState({ crossSearchQuery: null });
});

afterEach(() => {
  cleanup();
  useSettingsStore.setState({ searchProxyUrls: {} });
  useSearchStore.setState({ crossSearchQuery: null });
});

describe("SearchRoute proxy threading", () => {
  it("sends the nyaa proxy with paged search requests", async () => {
    useSettingsStore.setState({
      defaultSearchSource: "nyaa",
      visibleSources: ["nyaa"],
      searchProxyUrls: { nyaa: "http://127.0.0.1:7890" },
    });
    useSearchStore.setState({ crossSearchQuery: "test query" });
    renderRoute();
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "search_nyaa",
        expect.objectContaining({ query: "test query", proxyUrl: "http://127.0.0.1:7890" })
      );
    });
  });

  it("sends the rutracker proxy with search requests", async () => {
    useSettingsStore.setState({
      defaultSearchSource: "rutracker",
      visibleSources: ["rutracker"],
      searchProxyUrls: { rutracker: "socks5://127.0.0.1:10808" },
    });
    useSearchStore.setState({ crossSearchQuery: "test query" });
    renderRoute();
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "search_rutracker",
        expect.objectContaining({ query: "test query", proxyUrl: "socks5://127.0.0.1:10808" })
      );
    });
  });
});

describe("SearchRoute failed search", () => {
  it("does not auto-retry a failed scraper search", async () => {
    vi.useFakeTimers();
    try {
      mockInvoke.mockImplementation((cmd: unknown) => {
        if (typeof cmd === "string" && cmd.startsWith("check_")) return Promise.resolve(false);
        if (typeof cmd === "string" && cmd.startsWith("search_")) {
          return Promise.reject(new Error("boom"));
        }
        return Promise.resolve(null);
      });
      useSettingsStore.setState({
        defaultSearchSource: "nyaa",
        visibleSources: ["nyaa"],
        searchProxyUrls: {},
      });
      useSearchStore.setState({ crossSearchQuery: "test query" });
      renderRoute();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
      });
      const searchCalls = mockInvoke.mock.calls.filter(([cmd]) => cmd === "search_nyaa");
      expect(searchCalls).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
