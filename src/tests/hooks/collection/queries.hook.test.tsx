import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCollectionData, useCollectionMutations } from "@/hooks/collection/queries.hook";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    Wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation((cmd: string) => {
    if (cmd === "list_collection_items") return Promise.resolve([]);
    if (cmd === "list_custom_field_defs") return Promise.resolve([]);
    if (cmd === "list_collection_statuses") return Promise.resolve([]);
    return Promise.resolve(undefined);
  });
});

describe("collection status order mapping", () => {
  it("normalizes backend orderIndex to order on load", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_collection_items") return Promise.resolve([]);
      if (cmd === "list_custom_field_defs") return Promise.resolve([]);
      if (cmd === "list_collection_statuses")
        return Promise.resolve([
          { id: "watching", label: "Watching", color: "#3b82f6", orderIndex: 7, isCore: true },
        ]);
      return Promise.resolve(undefined);
    });
    const { Wrapper } = wrapper();
    const { result, unmount } = renderHook(() => useCollectionData(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.statuses).toEqual([
      { id: "watching", label: "Watching", color: "#3b82f6", order: 7, isCore: true },
    ]);
    unmount();
  });

  it("sends orderIndex on upsert", async () => {
    const { Wrapper } = wrapper();
    const { result, unmount } = renderHook(() => useCollectionMutations(), {
      wrapper: Wrapper,
    });
    await result.current.upsertStatus({
      id: "custom",
      label: "Custom",
      color: "#ffffff",
      order: 9,
      isCore: false,
    });
    expect(invokeMock).toHaveBeenCalledWith("upsert_collection_status", {
      status: { id: "custom", label: "Custom", color: "#ffffff", isCore: false, orderIndex: 9 },
    });
    unmount();
  });
});

describe("collection update touch flag", () => {
  it("sends touch_updated false for silent refresh patches", async () => {
    const { Wrapper } = wrapper();
    const { result, unmount } = renderHook(() => useCollectionMutations(), {
      wrapper: Wrapper,
    });
    await result.current.updateItem("item_1", { year: 2024 }, { touch: false });
    expect(invokeMock).toHaveBeenCalledWith("patch_collection_item", {
      id: "item_1",
      patch: { year: 2024 },
      touch_updated: false,
    });
    unmount();
  });

  it("omits the flag for user edits", async () => {
    const { Wrapper } = wrapper();
    const { result, unmount } = renderHook(() => useCollectionMutations(), {
      wrapper: Wrapper,
    });
    await result.current.updateItem("item_1", { year: 2024 });
    expect(invokeMock).toHaveBeenCalledWith("patch_collection_item", {
      id: "item_1",
      patch: { year: 2024 },
      touch_updated: undefined,
    });
    unmount();
  });
});
