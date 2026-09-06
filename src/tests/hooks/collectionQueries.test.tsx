import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
import {
  COLLECTION_QUERY_KEY,
  useCollectionData,
  useCollectionMutations,
} from "@/hooks/collection/queries.hook";
import type { CollectionItem } from "@/types/collection";

function makeItem(id: string, title: string): CollectionItem {
  return {
    id,
    title,
    altTitles: [],
    type: "anime",
    status: "planned",
    progressValue: 0,
    progressTotal: null,
    progressUnit: "episodes",
    durationMinutes: null,
    rating: null,
    priority: "normal",
    isFavorite: false,
    year: null,
    genres: [],
    studio: null,
    description: null,
    notes: null,
    coverUrl: null,
    coverBlobId: null,
    thumbBlobId: null,
    externalIds: {},
    customFields: {},
    localPath: null,
    localKind: null,
    startedAt: null,
    finishedAt: null,
    lastWatchedAt: null,
    rewatchCount: 0,
    addedAt: 0,
    updatedAt: 0,
    sitesToView: [],
    tvCurrentSeason: null,
    tvCurrentEpisode: null,
    detailsJson: null,
  };
}

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

describe("useCollectionMutations optimistic updates", () => {
  function seedClient(items: CollectionItem[]): QueryClient {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    client.setQueryData([COLLECTION_QUERY_KEY], {
      items,
      customFieldDefs: [],
      statuses: [],
    });
    return client;
  }

  function wrapper(client: QueryClient) {
    return ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }

  it("removes the item from cache before the IPC resolves", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    invokeMock.mockImplementation((cmd: unknown) => {
      if (cmd === "delete_collection_item") return gate;
      return Promise.resolve([]);
    });
    const client = seedClient([makeItem("1", "One"), makeItem("2", "Two")]);
    const hook = renderHook(() => useCollectionMutations(), { wrapper: wrapper(client) });
    const pending = hook.result.current.removeItem("1");
    await waitFor(() => {
      const data = client.getQueryData<{ items: CollectionItem[] }>([COLLECTION_QUERY_KEY]);
      expect(data?.items.map((item) => item.id)).toEqual(["2"]);
    });
    release();
    await pending;
    hook.unmount();
  });

  it("applies the status patch to cache before the IPC resolves", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    invokeMock.mockImplementation((cmd: unknown) => {
      if (cmd === "patch_collection_item") return gate;
      return Promise.resolve([]);
    });
    const client = seedClient([makeItem("1", "One")]);
    const hook = renderHook(() => useCollectionMutations(), { wrapper: wrapper(client) });
    const pending = hook.result.current.updateItem("1", { status: "completed" });
    await waitFor(() => {
      const data = client.getQueryData<{ items: CollectionItem[] }>([COLLECTION_QUERY_KEY]);
      expect(data?.items[0]?.status).toBe("completed");
    });
    release();
    await pending;
    hook.unmount();
  });
});
