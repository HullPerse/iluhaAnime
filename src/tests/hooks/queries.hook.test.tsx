import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import CollectionRoute from "@/routes/collection.route";

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

afterEach(() => {
  cleanup();
  invokeMock.mockReset();
});

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function routeWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

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
    releaseDate: null,
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
  it("exposes loading state while the collection query is pending", () => {
    invokeMock.mockImplementation(() => new Promise(() => {}));
    const client = makeClient();
    const { result, unmount } = renderHook(() => useCollectionData(), {
      wrapper: routeWrapper(client),
    });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isFetching).toBe(true);
    expect(result.current.isError).toBe(false);
    expect(result.current.items).toEqual([]);
    unmount();
  });

  it("surfaces query errors instead of masking them as empty data", async () => {
    invokeMock.mockRejectedValue(new Error("ipc down"));
    const client = makeClient();
    const { result, unmount } = renderHook(() => useCollectionData(), {
      wrapper: routeWrapper(client),
    });
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.items).toEqual([]);
    expect(result.current.error).toMatchObject({ message: "ipc down" });
    expect(typeof result.current.refetch).toBe("function");
    unmount();
  });

  it("renders a loader while the collection is loading", () => {
    invokeMock.mockImplementation(() => new Promise(() => {}));
    const client = makeClient();
    render(<CollectionRoute />, { wrapper: routeWrapper(client) });
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders an error slot with retry when the collection query fails", async () => {
    invokeMock.mockRejectedValue(new Error("ipc down"));
    const client = makeClient();
    render(<CollectionRoute />, { wrapper: routeWrapper(client) });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("ipc down");
    expect(alert.querySelector("button")).not.toBeNull();
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
