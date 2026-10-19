import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useQuickAddMedia } from "@/hooks/collection/quickAdd.hook";
import { notificationAtoms } from "@/store/notification.store";
import type { QuickAddListEntry, QuickAddMedia } from "@/types/collection";

const addItem = vi.fn();

vi.mock("@/hooks/collection/queries.hook", () => ({
  useCollectionData: () => ({ items: [] }),
  useCollectionMutations: () => ({ addItem }),
}));

vi.mock("@/lib/collection/quickadd.utils", () => ({
  downloadCover: vi.fn(async () => null),
  fetchAddedMedia: vi.fn(async () => null),
}));

const MEDIA: QuickAddMedia = {
  id: 21,
  title: "Frieren",
  titles: ["Sousou no Frieren"],
  episodes: 28,
  duration: 24,
  score: 91,
  genres: ["Adventure"],
  tags: [],
  description: "An elven mage journey",
  cover_url: "https://example.com/f.jpg",
  season_year: 2023,
  start_date: null,
  format: "TV",
  studios: [{ id: 1, name: "Madhouse" }],
};

const ENTRY: QuickAddListEntry = { progress: 5, score: 8, list_status: "CURRENT" };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useQuickAddMedia", () => {
  it("starts as not added and adds the built item on save", async () => {
    const { result } = renderHook(() => useQuickAddMedia(MEDIA, ENTRY, false, "POINT_10"));
    expect(result.current.exists).toBe(false);
    await act(async () => {
      await result.current.handleAdd();
    });
    expect(addItem).toHaveBeenCalledTimes(1);
    const saved = addItem.mock.calls[0][0] as { title: string };
    expect(saved.title).toBe("Frieren");
    expect(result.current.exists).toBe(true);
    expect(notificationAtoms.items.get()).toHaveLength(0);
  });

  it("ignores a second add while the first is in flight", async () => {
    let release!: () => void;
    addItem.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(undefined);
        })
    );
    const { result } = renderHook(() => useQuickAddMedia(MEDIA, ENTRY, false, "POINT_10"));
    let first: Promise<void> | undefined;
    await act(async () => {
      first = result.current.handleAdd();
    });
    await act(async () => {
      await result.current.handleAdd();
    });
    expect(addItem).toHaveBeenCalledTimes(1);
    await act(async () => {
      release();
      await first;
    });
    expect(result.current.exists).toBe(true);
  });
});
