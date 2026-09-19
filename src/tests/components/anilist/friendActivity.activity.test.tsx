import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FriendActivityFeed } from "@/routes/components/anilist/activity/friendActivity.activity";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

afterEach(() => {
  cleanup();
  mockInvoke.mockReset();
});

function renderFeed(friendId = 7) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FriendActivityFeed friendId={friendId} />
    </QueryClientProvider>
  );
}

function listActivity(
  overrides: Partial<{ id: number; status: string; media_title: string }> = {}
) {
  return {
    id: 1,
    created_at: Math.floor(Date.now() / 1000) - 60,
    activity_type: "list",
    status: "CURRENT",
    progress: "12",
    text: null,
    media_id: 21,
    media_title: "One Piece",
    media_cover: null,
    user_id: 7,
    user_name: "Friend",
    user_avatar: null,
    ...overrides,
  };
}

describe("FriendActivityFeed", () => {
  it("renders the latest list activity as one compact row", async () => {
    mockInvoke.mockResolvedValue([listActivity()]);
    renderFeed();
    expect(await screen.findByText(/One Piece/)).toBeDefined();
    expect(screen.getByText(/\(12\)/)).toBeDefined();
  });

  it("renders up to five activities including text notes", async () => {
    mockInvoke.mockResolvedValue([
      listActivity(),
      { ...listActivity({ id: 2, media_title: "Hunter x Hunter" }) },
      listActivity({ id: 3, media_title: "Cowboy Bebop" }),
      {
        id: 4,
        created_at: 0,
        activity_type: "text",
        status: null,
        progress: null,
        text: "hello",
        media_id: null,
        media_title: null,
        media_cover: null,
        user_id: 7,
        user_name: "Friend",
        user_avatar: null,
      },
      listActivity({ id: 5, media_title: "Trigun" }),
      listActivity({ id: 6, media_title: "Trimmed out" }),
    ]);
    renderFeed();
    expect(await screen.findByText(/One Piece/)).toBeDefined();
    expect(screen.getByText(/Hunter x Hunter/)).toBeDefined();
    expect(screen.getByText(/Cowboy Bebop/)).toBeDefined();
    expect(screen.getByText(/Trigun/)).toBeDefined();
    expect(screen.getByText(/hello/)).toBeDefined();
    expect(screen.queryByText(/Trimmed out/)).toBeNull();
  });

  it("shows the empty hint without activity", async () => {
    mockInvoke.mockResolvedValue([]);
    renderFeed();
    expect(await screen.findByText(/активности|activity/i)).toBeDefined();
  });
});
