import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
import { useCollectionData } from "@/lib/collection.queries";


describe("useCollectionData", () => {
  it("does not refetch items on remount within staleTime", async () => {
    invokeMock.mockResolvedValue([]);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const itemCalls = () =>
      invokeMock.mock.calls.filter(([cmd]) => cmd === "list_collection_items").length;

    const first = renderHook(() => useCollectionData(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    await waitFor(() => {
      expect(itemCalls()).toBe(1);
    });
    first.unmount();

    const second = renderHook(() => useCollectionData(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(itemCalls()).toBe(1);
    second.unmount();
  });
});
