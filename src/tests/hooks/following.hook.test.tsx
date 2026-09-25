import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAnilistFollowing } from "@/hooks/anilist/following.hook";
import { useSettingsStore } from "@/store/settings.store";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

function wrapper({ children }: { children: ReactNode }) {
  return createElement(
    QueryClientProvider,
    {
      client: new QueryClient({
        defaultOptions: { queries: { retry: false } },
      }),
    },
    children
  );
}

const PAGE_ONE = {
  users: [
    { id: 7, name: "A", avatar: null },
    { id: 9, name: "B", avatar: null },
  ],
  has_next_page: true,
  total: 3,
};

const PAGE_TWO = {
  users: [{ id: 11, name: "C", avatar: null }],
  has_next_page: false,
  total: 3,
};

beforeEach(() => {
  invokeMock.mockReset();
  useSettingsStore.setState({ anilistProxyUrl: null });
});

describe("useAnilistFollowing", () => {
  it("loads the first page and appends the next one on load more", async () => {
    invokeMock.mockImplementation((command: string, args: Record<string, unknown>) => {
      expect(command).toBe("get_anilist_following");
      return Promise.resolve(args["page"] === 1 ? PAGE_ONE : PAGE_TWO);
    });
    const { result, unmount } = renderHook(() => useAnilistFollowing(1, true), { wrapper });

    await waitFor(() => {
      expect(result.current.users.map((user) => user.id)).toEqual([7, 9]);
    });
    expect(result.current.hasMore).toBe(true);

    result.current.loadMore();
    await waitFor(() => {
      expect(result.current.users.map((user) => user.id)).toEqual([7, 9, 11]);
    });
    expect(result.current.hasMore).toBe(false);
    expect(result.current.error).toBeNull();
    unmount();
  });

  it("does not call the backend without a user id", async () => {
    const { result, unmount } = renderHook(() => useAnilistFollowing(null, true), { wrapper });

    expect(result.current.users).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(invokeMock).not.toHaveBeenCalled();
    unmount();
  });

  it("surfaces the backend failure as an error string", async () => {
    invokeMock.mockRejectedValue(new Error("boom"));
    const { result, unmount } = renderHook(() => useAnilistFollowing(1, true), { wrapper });

    await waitFor(
      () => {
        expect(result.current.error).toBe("boom");
      },
      { timeout: 5000 }
    );
    expect(result.current.users).toEqual([]);
    unmount();
  });
});
