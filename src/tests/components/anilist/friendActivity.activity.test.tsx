import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FriendLatestActivity } from "@/routes/components/anilist/activity/friendActivity.activity";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

afterEach(() => {
  cleanup();
  mockInvoke.mockReset();
});

function renderActivity() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FriendLatestActivity friendId={7} />
    </QueryClientProvider>
  );
}

const ACTIVITY = {
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
};

describe("FriendLatestActivity", () => {
  it("renders the latest list activity as one compact row", async () => {
    mockInvoke.mockResolvedValue([ACTIVITY]);
    renderActivity();
    expect(await screen.findByText(/One Piece/)).toBeDefined();
    expect(screen.getByText(/\(12\)/)).toBeDefined();
  });

  it("shows the empty hint without list activity", async () => {
    mockInvoke.mockResolvedValue([]);
    renderActivity();
    expect(await screen.findByText(/активности|activity/i)).toBeDefined();
  });
});
