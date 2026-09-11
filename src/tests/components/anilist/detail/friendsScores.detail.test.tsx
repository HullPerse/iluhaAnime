import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FriendsScoresSection } from "@/routes/components/anilist/detail/friendsScores.detail";
import { useAniListFriendsStore } from "@/store/anilist.store";
import type { AniListCollection, AniMedia } from "@/types/anilist";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

afterEach(() => {
  cleanup();
  mockInvoke.mockReset();
  useAniListFriendsStore.setState({ friends: [] });
});

function seedFriends() {
  useAniListFriendsStore.setState({
    friends: [
      { id: 7, name: "Sakura", avatar: null, added_at: 1 },
      { id: 8, name: "Momo", avatar: null, added_at: 2 },
    ],
  });
}

function listsWithScore(animeId: number, score: number | null) {
  return [
    {
      name: "Watching",
      entries: [
        {
          media: { id: animeId, title: "Target Anime" } as unknown as AniMedia,
          progress: 12,
          score,
          list_status: "CURRENT",
          created_at: null,
          completed_at: null,
          updated_at: null,
        },
      ],
    },
  ] satisfies AniListCollection[];
}

function renderSection(animeId = 21) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FriendsScoresSection animeId={animeId} />
    </QueryClientProvider>,
  );
}

async function expand() {
  await userEvent.setup().click(screen.getByRole("button", { name: /expand|развернуть/i }));
}

describe("FriendsScoresSection", () => {
  it("renders nothing without friends", () => {
    const { container } = renderSection();
    expect(container.innerHTML).toBe("");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("loads nothing until expanded, then shows matching friend scores", async () => {
    seedFriends();
    mockInvoke.mockImplementation((...call: unknown[]) => {
      const args = call[1];
      const userId =
        typeof args === "object" && args !== null && "userId" in args && typeof args.userId === "number"
          ? args.userId
          : 0;
      if (userId === 7) return Promise.resolve(listsWithScore(21, 9));
      return Promise.resolve([]);
    });
    renderSection();
    expect(mockInvoke).not.toHaveBeenCalled();
    await expand();
    expect(await screen.findByText("Sakura")).toBeDefined();
    expect(screen.getByText("9/10")).toBeDefined();
    expect(screen.getByTitle(/9\/10/)).toBeDefined();
    expect(screen.queryByText("12")).toBeNull();
    expect(screen.queryByText("Momo")).toBeNull();
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });

  it("retries after a total failure", async () => {
    seedFriends();
    mockInvoke.mockRejectedValue(new Error("offline"));
    renderSection();
    await expand();
    expect(await screen.findByText("offline", { exact: false })).toBeDefined();

    mockInvoke.mockImplementation((...call: unknown[]) => {
      const args = call[1];
      const userId =
        typeof args === "object" && args !== null && "userId" in args && typeof args.userId === "number"
          ? args.userId
          : 0;
      if (userId === 7) return Promise.resolve(listsWithScore(21, 8));
      return Promise.resolve([]);
    });
    await userEvent.setup().click(screen.getByRole("button", { name: /retry|повторить/i }));
    expect(await screen.findByText("Sakura")).toBeDefined();
    expect(screen.getByText("8/10")).toBeDefined();
    expect(screen.getByTitle(/8\/10/)).toBeDefined();
  });
});
