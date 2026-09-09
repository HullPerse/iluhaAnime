// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import QuickAddButton from "@/routes/components/anilist/detail/quickadd.detail";
import type { QuickAddListEntry, QuickAddMedia } from "@/lib/collection/import.utils";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) => mockInvoke(cmd, args),
}));

afterEach(() => {
  cleanup();
  mockInvoke.mockReset();
});

const media: QuickAddMedia = {
  id: 21,
  title: "Frieren",
  titles: ["Sousou no Frieren"],
  episodes: 28,
  duration: 24,
  score: 91,
  genres: ["Adventure"],
  tags: [],
  description: "Journey",
  cover_url: "https://example.com/f.jpg",
  season_year: 2023,
  studios: [{ id: 1, name: "Madhouse" }],
};

const entry: QuickAddListEntry = { progress: 5, score: 8, list_status: "CURRENT" };

function collectionMocks(items: unknown[]) {
  mockInvoke.mockImplementation((cmd: string) => {
    if (cmd === "list_collection_items") return Promise.resolve(items);
    if (cmd === "list_custom_field_defs") return Promise.resolve([]);
    if (cmd === "list_collection_statuses") return Promise.resolve([]);
    if (cmd === "download_remote_image") return Promise.resolve({ id: "blob1" });
    if (cmd === "upsert_collection_item") return Promise.resolve(null);
    return Promise.resolve(null);
  });
}

function renderButton() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <QuickAddButton anime={media} listEntry={entry} isFavorite />
    </QueryClientProvider>
  );
}

async function quickAddButton(): Promise<HTMLButtonElement> {
  return (await screen.findByRole("button", { name: /to collection|В коллекцию/ })) as HTMLButtonElement;
}

async function addedButton(): Promise<HTMLButtonElement> {
  return (await screen.findByRole("button", { name: /In collection|В коллекции/ })) as HTMLButtonElement;
}

describe("QuickAddButton", () => {
  it("adds the anime with anilist status, progress, score and favorite", async () => {
    collectionMocks([]);
    const user = userEvent.setup();
    renderButton();
    await user.click(await quickAddButton());
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "upsert_collection_item",
        expect.objectContaining({
          item: expect.objectContaining({
            title: "Frieren",
            status: "watching",
            progressValue: 5,
            rating: 8,
            isFavorite: true,
            coverBlobId: "blob1",
            externalIds: { anilist: 21 },
          }),
        })
      );
    });
    const added = await addedButton();
    expect(added.disabled).toBe(true);
  });

  it("stays disabled without invoking when the anime is already in the collection", async () => {
    collectionMocks([{ title: "Frieren", externalIds: { anilist: 21 } }]);
    const user = userEvent.setup();
    renderButton();
    const existing = await addedButton();
    expect(existing.disabled).toBe(true);
    await user.click(existing);
    expect(mockInvoke).not.toHaveBeenCalledWith("upsert_collection_item", expect.anything());
  });

  it("re-enables the button when the upsert fails", async () => {
    collectionMocks([]);
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "list_collection_items") return Promise.resolve([]);
      if (cmd === "list_custom_field_defs") return Promise.resolve([]);
      if (cmd === "list_collection_statuses") return Promise.resolve([]);
      if (cmd === "download_remote_image") return Promise.resolve({ id: "blob1" });
      if (cmd === "upsert_collection_item") return Promise.reject(new Error("db down"));
      return Promise.resolve(null);
    });
    const user = userEvent.setup();
    renderButton();
    await user.click(await quickAddButton());
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("upsert_collection_item", expect.anything());
    });
    const retry = await quickAddButton();
    expect(retry.disabled).toBe(false);
  });
});
